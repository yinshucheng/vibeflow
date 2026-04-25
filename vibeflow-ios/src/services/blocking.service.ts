/**
 * Blocking Service
 *
 * Manages app blocking state based on multiple signals:
 * 1. Active pomodoro (FOCUS) — highest priority
 * 2. Over-rest (OVER_REST) — server policy field
 * 3. Sleep time (SLEEP) — server policy field
 *
 * Automatically enables/disables blocking when any condition changes.
 * Read-only listener - all state changes come from server.
 *
 * Requirements: 6.2, 6.3, 6.8
 */

import { useAppStore } from '@/store/app.store';
import { screenTimeService } from './screen-time.service';
import { evaluateBlockingReason, evaluateBlockingReasonIgnoringTempUnblock } from '@/utils/blocking-reason';
import type { BlockingReason, AuthorizationStatus } from '@/types';
import type { BlockingContext } from '../../modules/screen-time';

// =============================================================================
// BLOCKING SERVICE INTERFACE
// =============================================================================

export interface BlockingService {
  initialize(): Promise<void>;
  startListening(): () => void;
  getAuthorizationStatus(): Promise<AuthorizationStatus>;
  requestAuthorization(): Promise<AuthorizationStatus>;
  isBlockingActive(): Promise<boolean>;
  enableBlocking(): Promise<void>;
  disableBlocking(): Promise<void>;
}

// =============================================================================
// BLOCKING SERVICE IMPLEMENTATION
// =============================================================================

function createBlockingService(): BlockingService {
  let unsubscribe: (() => void) | null = null;
  let tempUnblockExpiryTimer: ReturnType<typeof setTimeout> | null = null;
  let pomodoroFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  // Serialization chain: prevents concurrent evaluateBlockingState() from causing
  // UI/actual state inconsistency (A2 review finding)
  let evaluateChain: Promise<void> = Promise.resolve();

  /**
   * Evaluate blocking reason from current store state.
   * Delegates to the pure function in utils/blocking-reason.ts.
   */
  function getBlockingReason(): BlockingReason | null {
    const { activePomodoro, policy, dailyState } = useAppStore.getState();
    return evaluateBlockingReason({ activePomodoro, policy, dailyState });
  }

  /**
   * Core state evaluation — called whenever relevant store fields change
   */
  async function evaluateBlockingState(): Promise<void> {
    const status = await screenTimeService.getAuthorizationStatus();
    if (status !== 'authorized') {
      // Authorization revoked or not granted — disable blocking and update UI
      const { isBlockingActive, screenTimeAuthorized } = useAppStore.getState();
      if (isBlockingActive) {
        try {
          await screenTimeService.disableBlocking();
        } catch (error) {
          console.warn('[BlockingService] Failed to disable blocking after auth revocation:', error);
        }
        useAppStore.getState().setBlockingActive(false);
        useAppStore.getState().setBlockingReason(null);
        console.log('[BlockingService] Blocking disabled due to authorization status:', status);
      }
      if (screenTimeAuthorized) {
        useAppStore.getState().setScreenTimeAuthorized(false);
        console.log('[BlockingService] Screen Time authorization revoked');
      }
      return;
    }

    // Ensure store reflects authorized state
    if (!useAppStore.getState().screenTimeAuthorized) {
      useAppStore.getState().setScreenTimeAuthorized(true);
    }

    // If policy hasn't synced yet, preserve current blocking state to avoid
    // flashing unblock→reblock on cold start. We'll re-evaluate once policy arrives.
    const { policy } = useAppStore.getState();
    if (!policy) {
      console.log('[BlockingService] Policy not yet synced, preserving current state');
      return;
    }

    const reason = getBlockingReason();
    const { isBlockingActive, blockingReason } = useAppStore.getState();
    console.log('[BlockingService] Evaluating: reason=' + reason + ', isBlockingActive=' + isBlockingActive + ', blockingReason=' + blockingReason);

    if (reason !== null) {
      // Should be blocking
      if (!isBlockingActive || blockingReason !== reason) {
        await screenTimeService.enableBlocking(reason);
        useAppStore.getState().setBlockingActive(true);
        useAppStore.getState().setBlockingReason(reason);
        console.log('[BlockingService] Blocking enabled, reason:', reason);
      }
    } else {
      // Should not be blocking
      if (isBlockingActive) {
        await screenTimeService.disableBlocking();
        useAppStore.getState().setBlockingActive(false);
        useAppStore.getState().setBlockingReason(null);
        console.log('[BlockingService] Blocking disabled');
      }
    }

    // Sync BlockingContext to App Group for Extension decision-making
    syncBlockingContext();
  }

  /**
   * Write current blocking context to App Group so the Extension
   * can make smart decisions when schedules fire offline.
   */
  function syncBlockingContext(): void {
    const { policy } = useAppStore.getState();
    const reason = getBlockingReason();

    const context: BlockingContext = {
      currentBlockingReason: reason,
      sleepScheduleActive: !!(policy?.sleepTime?.enabled && policy.sleepTime.isCurrentlyActive && !policy.sleepTime.isSnoozed),
      sleepStartHour: policy?.sleepTime?.startTime ? parseInt(policy.sleepTime.startTime.split(':')[0], 10) : null,
      sleepStartMinute: policy?.sleepTime?.startTime ? parseInt(policy.sleepTime.startTime.split(':')[1], 10) : null,
      sleepEndHour: policy?.sleepTime?.endTime ? parseInt(policy.sleepTime.endTime.split(':')[0], 10) : null,
      sleepEndMinute: policy?.sleepTime?.endTime ? parseInt(policy.sleepTime.endTime.split(':')[1], 10) : null,
      overRestActive: !!(policy?.overRest?.isOverRest),
    };

    screenTimeService.updateBlockingContext(context).catch((error) => {
      console.warn('[BlockingService] Failed to sync BlockingContext:', error);
    });
  }

  /**
   * Serialized evaluate: ensures only one evaluateBlockingState runs at a time.
   * Prevents race conditions where two rapid state changes cause conflicting
   * enable/disable operations with inconsistent UI state.
   */
  function queueEvaluate(): void {
    evaluateChain = evaluateChain.then(() => evaluateBlockingState()).catch((error) => {
      console.warn('[BlockingService] evaluateBlockingState error:', error);
    });
  }

  return {
    async initialize(): Promise<void> {
      await screenTimeService.initialize();

      const isBlocking = await screenTimeService.isBlockingActive();
      const blockingState = await screenTimeService.getBlockingState();

      if (isBlocking && blockingState) {
        useAppStore.getState().setBlockingActive(true);
        useAppStore.getState().setSelectionSummary(blockingState.selectionSummary);
        useAppStore.getState().setBlockingReason(blockingState.reason);
      }

      console.log('[BlockingService] Initialized, blocking active:', isBlocking);

      // B2: Clean up stale one-shot schedules from previous sessions.
      // If App was killed before pomodoroEnd/tempUnblockExpiry schedule fired,
      // the schedule may have already triggered (Extension handled it) but the
      // schedule info in App Group was never cleaned up. Cancel any lingering
      // schedules and let the current evaluateBlockingState() set the correct state.
      screenTimeService.cancelPomodoroEndSchedule().catch(() => {});
      screenTimeService.cancelTempUnblockExpirySchedule().catch(() => {});
    },

    startListening(): () => void {
      // Track previous values for comparison
      let prevPomodoroId = useAppStore.getState().activePomodoro?.id ?? null;
      let prevPomodoroStatus = useAppStore.getState().activePomodoro?.status ?? null;
      let prevPolicyVersion = useAppStore.getState().policy?.version ?? 0;
      let prevSleepActive = useAppStore.getState().policy?.sleepTime?.isCurrentlyActive ?? false;
      let prevOverRest = useAppStore.getState().policy?.overRest?.isOverRest ?? false;
      let prevSleepEnabled = useAppStore.getState().policy?.sleepTime?.enabled ?? false;
      let prevSleepStart = useAppStore.getState().policy?.sleepTime?.startTime ?? '';
      let prevSleepEnd = useAppStore.getState().policy?.sleepTime?.endTime ?? '';
      let prevTempUnblockActive = useAppStore.getState().policy?.temporaryUnblock?.active ?? false;
      let prevTempUnblockEndTime = useAppStore.getState().policy?.temporaryUnblock?.endTime ?? 0;

      unsubscribe = useAppStore.subscribe((state) => {
        const curPomodoroId = state.activePomodoro?.id ?? null;
        const curPomodoroStatus = state.activePomodoro?.status ?? null;
        const curPolicyVersion = state.policy?.version ?? 0;
        const curSleepActive = state.policy?.sleepTime?.isCurrentlyActive ?? false;
        const curOverRest = state.policy?.overRest?.isOverRest ?? false;
        const curSleepEnabled = state.policy?.sleepTime?.enabled ?? false;
        const curSleepStart = state.policy?.sleepTime?.startTime ?? '';
        const curSleepEnd = state.policy?.sleepTime?.endTime ?? '';
        const curTempUnblockActive = state.policy?.temporaryUnblock?.active ?? false;
        const curTempUnblockEndTime = state.policy?.temporaryUnblock?.endTime ?? 0;

        const pomodoroChanged =
          prevPomodoroId !== curPomodoroId ||
          prevPomodoroStatus !== curPomodoroStatus;

        const tempUnblockChanged =
          prevTempUnblockActive !== curTempUnblockActive ||
          prevTempUnblockEndTime !== curTempUnblockEndTime;

        const policyChanged =
          prevPolicyVersion !== curPolicyVersion ||
          prevSleepActive !== curSleepActive ||
          prevOverRest !== curOverRest ||
          tempUnblockChanged;

        // Sleep schedule changed — register/clear offline schedule
        const sleepScheduleChanged =
          prevSleepEnabled !== curSleepEnabled ||
          prevSleepStart !== curSleepStart ||
          prevSleepEnd !== curSleepEnd;

        if (sleepScheduleChanged) {
          prevSleepEnabled = curSleepEnabled;
          prevSleepStart = curSleepStart;
          prevSleepEnd = curSleepEnd;

          if (curSleepEnabled && curSleepStart && curSleepEnd) {
            // Register sleep schedule for offline enforcement
            screenTimeService.registerSleepSchedule(curSleepStart, curSleepEnd).catch((error) => {
              console.warn('[BlockingService] Failed to register sleep schedule:', error);
            });
          } else if (!curSleepEnabled) {
            // Clear sleep schedule
            screenTimeService.clearSleepSchedule().catch((error) => {
              console.warn('[BlockingService] Failed to clear sleep schedule:', error);
            });
          }
        }

        // Schedule auto-reevaluation when temporary unblock expires
        if (tempUnblockChanged) {
          prevTempUnblockActive = curTempUnblockActive;
          prevTempUnblockEndTime = curTempUnblockEndTime;

          // Clear previous expiry timer
          if (tempUnblockExpiryTimer) {
            clearTimeout(tempUnblockExpiryTimer);
            tempUnblockExpiryTimer = null;
          }

          // If active unblock, schedule reevaluation at expiry (+500ms buffer)
          if (curTempUnblockActive && curTempUnblockEndTime > Date.now()) {
            const delay = curTempUnblockEndTime - Date.now() + 500;
            tempUnblockExpiryTimer = setTimeout(() => {
              tempUnblockExpiryTimer = null;
              console.log('[BlockingService] Temporary unblock expired, re-evaluating');
              queueEvaluate();
            }, delay);
          }
        }

        // Sync BlockingContext to App Group BEFORE registering schedules,
        // so Extension has up-to-date data if schedule fires (A1 review finding)
        if (pomodoroChanged || tempUnblockChanged) {
          syncBlockingContext();
        }

        // Pomodoro schedule management for offline automation
        if (pomodoroChanged) {
          const wasActive = prevPomodoroId !== null && prevPomodoroStatus === 'active';
          const isActive = curPomodoroId !== null && curPomodoroStatus === 'active';

          if (!wasActive && isActive) {
            // Pomodoro started → register end schedule
            const pomodoro = state.activePomodoro;
            if (pomodoro) {
              // Defensive: ensure startTime is in milliseconds (D2 review finding)
              const startTimeMs = pomodoro.startTime > 1e12 ? pomodoro.startTime : pomodoro.startTime * 1000;
              const endTimeMs = startTimeMs + pomodoro.duration * 60 * 1000;
              screenTimeService.registerPomodoroEndSchedule(endTimeMs).then((registered) => {
                if (!registered) {
                  // < 15 min: use JS setTimeout as foreground fallback.
                  // KNOWN LIMITATION (G2): React Native setTimeout does NOT fire
                  // when App is suspended by iOS (~30s after backgrounding).
                  // For <15min pomodoros, blocking persists until App returns to foreground.
                  const delay = endTimeMs - Date.now() + 500;
                  if (delay > 0) {
                    pomodoroFallbackTimer = setTimeout(() => {
                      pomodoroFallbackTimer = null;
                      console.log('[BlockingService] Pomodoro fallback timer fired, re-evaluating');
                      queueEvaluate();
                    }, delay);
                    console.log(`[BlockingService] Pomodoro < 15min, using JS fallback timer (${Math.round(delay / 1000)}s)`);
                  }
                }
              });
            }
          } else if (wasActive && !isActive) {
            // Pomodoro ended → cancel schedule + clear fallback
            screenTimeService.cancelPomodoroEndSchedule();
            if (pomodoroFallbackTimer) {
              clearTimeout(pomodoroFallbackTimer);
              pomodoroFallbackTimer = null;
            }
          }
        }

        // Temp unblock schedule management for offline automation
        if (tempUnblockChanged) {
          if (curTempUnblockActive && curTempUnblockEndTime > Date.now()) {
            // Temp unblock started → register expiry schedule
            const reasonToRestore = evaluateBlockingReasonIgnoringTempUnblock({
              activePomodoro: state.activePomodoro,
              policy: state.policy,
              dailyState: state.dailyState,
            });
            if (reasonToRestore) {
              screenTimeService.registerTempUnblockExpirySchedule(
                curTempUnblockEndTime,
                reasonToRestore
              );
            }
          } else if (!curTempUnblockActive && prevTempUnblockActive) {
            // Temp unblock ended → cancel schedule
            screenTimeService.cancelTempUnblockExpirySchedule();
          }
        }

        if (pomodoroChanged || policyChanged) {
          prevPomodoroId = curPomodoroId;
          prevPomodoroStatus = curPomodoroStatus;
          prevPolicyVersion = curPolicyVersion;
          prevSleepActive = curSleepActive;
          prevOverRest = curOverRest;
          queueEvaluate();
        }
      });

      // Initial evaluation
      queueEvaluate();

      return () => {
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        if (tempUnblockExpiryTimer) {
          clearTimeout(tempUnblockExpiryTimer);
          tempUnblockExpiryTimer = null;
        }
        if (pomodoroFallbackTimer) {
          clearTimeout(pomodoroFallbackTimer);
          pomodoroFallbackTimer = null;
        }
      };
    },

    async getAuthorizationStatus(): Promise<AuthorizationStatus> {
      return screenTimeService.getAuthorizationStatus();
    },

    async requestAuthorization(): Promise<AuthorizationStatus> {
      const status = await screenTimeService.requestAuthorization();
      useAppStore.getState().setScreenTimeAuthorized(status === 'authorized');
      return status;
    },

    async isBlockingActive(): Promise<boolean> {
      return screenTimeService.isBlockingActive();
    },

    async enableBlocking(): Promise<void> {
      const reason = getBlockingReason() ?? 'focus';
      await screenTimeService.enableBlocking(reason);
      useAppStore.getState().setBlockingActive(true);
      useAppStore.getState().setBlockingReason(reason);
    },

    async disableBlocking(): Promise<void> {
      await screenTimeService.disableBlocking();
      useAppStore.getState().setBlockingActive(false);
      useAppStore.getState().setBlockingReason(null);
    },
  };
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const blockingService = createBlockingService();
