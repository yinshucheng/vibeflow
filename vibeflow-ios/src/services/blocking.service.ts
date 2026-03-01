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

  /**
   * Evaluate blocking state from all signals.
   * Priority: focus > over_rest > sleep
   * Returns the reason to block, or null if no blocking needed.
   */
  function evaluateBlockingReason(): BlockingReason | null {
    const { activePomodoro, policy } = useAppStore.getState();

    // 1. Active pomodoro — focus blocking
    if (activePomodoro && activePomodoro.status === 'active') {
      return 'focus';
    }

    // 2. Over rest — server says user exceeded rest time
    if (policy?.overRest?.isOverRest) {
      return 'over_rest';
    }

    // 3. Sleep time — within sleep window, enabled, not snoozed
    if (
      policy?.sleepTime?.enabled &&
      policy.sleepTime.isCurrentlyActive &&
      !policy.sleepTime.isSnoozed
    ) {
      return 'sleep';
    }

    return null;
  }

  /**
   * Core state evaluation — called whenever relevant store fields change
   */
  async function evaluateBlockingState(): Promise<void> {
    const status = await screenTimeService.getAuthorizationStatus();
    if (status !== 'authorized') {
      return;
    }

    const reason = evaluateBlockingReason();
    const { isBlockingActive, blockingReason } = useAppStore.getState();

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

      unsubscribe = useAppStore.subscribe((state) => {
        const curPomodoroId = state.activePomodoro?.id ?? null;
        const curPomodoroStatus = state.activePomodoro?.status ?? null;
        const curPolicyVersion = state.policy?.version ?? 0;
        const curSleepActive = state.policy?.sleepTime?.isCurrentlyActive ?? false;
        const curOverRest = state.policy?.overRest?.isOverRest ?? false;
        const curSleepEnabled = state.policy?.sleepTime?.enabled ?? false;
        const curSleepStart = state.policy?.sleepTime?.startTime ?? '';
        const curSleepEnd = state.policy?.sleepTime?.endTime ?? '';

        const pomodoroChanged =
          prevPomodoroId !== curPomodoroId ||
          prevPomodoroStatus !== curPomodoroStatus;

        const policyChanged =
          prevPolicyVersion !== curPolicyVersion ||
          prevSleepActive !== curSleepActive ||
          prevOverRest !== curOverRest;

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
            screenTimeService.registerSleepSchedule(curSleepStart, curSleepEnd);
          } else if (!curSleepEnabled) {
            // Clear sleep schedule
            screenTimeService.clearSleepSchedule();
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
      const reason = evaluateBlockingReason() ?? 'focus';
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
