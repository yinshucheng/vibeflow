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
import { evaluateBlockingReason } from '@/utils/blocking-reason';
import type { BlockingReason, AuthorizationStatus } from '@/types';

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

  /**
   * Evaluate blocking reason from current store state.
   * Delegates to the pure function in utils/blocking-reason.ts.
   */
  function getBlockingReason(): BlockingReason | null {
    const { activePomodoro, policy } = useAppStore.getState();
    return evaluateBlockingReason({ activePomodoro, policy });
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

          if (curSleepEnabled && curSleepStart && curSleepEnd && !curSleepActive) {
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
              evaluateBlockingState();
            }, delay);
          }
        }

        if (pomodoroChanged || policyChanged) {
          prevPomodoroId = curPomodoroId;
          prevPomodoroStatus = curPomodoroStatus;
          prevPolicyVersion = curPolicyVersion;
          prevSleepActive = curSleepActive;
          prevOverRest = curOverRest;
          evaluateBlockingState();
        }
      });

      // Initial evaluation
      evaluateBlockingState();

      return () => {
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        if (tempUnblockExpiryTimer) {
          clearTimeout(tempUnblockExpiryTimer);
          tempUnblockExpiryTimer = null;
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
