/**
 * Unit Tests: Delta Sync — activePomodoro clearing on state transitions
 *
 * Verifies that when a delta sync changes systemState.state away from FOCUS,
 * the store correctly clears activePomodoro. This prevents stale blocking
 * when the server only sends a systemState delta (without activePomodoro=null).
 *
 * Bug fix: pomodoro complete/abort via tRPC only broadcasted systemState.state
 * delta but not activePomodoro=null, causing iOS to keep blocking indefinitely.
 */

import { useAppStore } from '../src/store/app.store';
import type {
  SyncStateCommand,
  ActivePomodoroData,
  DailyStateData,
} from '../src/types';

// =============================================================================
// HELPERS
// =============================================================================

function makeActivePomodoro(overrides: Partial<ActivePomodoroData> = {}): ActivePomodoroData {
  return {
    id: 'pom-1',
    taskId: 'task-1',
    taskTitle: 'Test Task',
    startTime: Date.now() - 60000,
    duration: 25,
    status: 'active',
    ...overrides,
  };
}

function makeDailyState(overrides: Partial<DailyStateData> = {}): DailyStateData {
  return {
    state: 'FOCUS',
    completedPomodoros: 0,
    dailyCap: 8,
    totalFocusMinutes: 0,
    ...overrides,
  };
}

function makeDeltaSyncCommand(state: string): SyncStateCommand {
  return {
    commandId: 'test-cmd',
    commandType: 'SYNC_STATE',
    targetClient: 'all',
    priority: 'high',
    requiresAck: false,
    createdAt: Date.now(),
    payload: {
      syncType: 'delta',
      version: Date.now(),
      delta: {
        changes: [
          { path: 'systemState.state', operation: 'set', value: state },
        ],
      },
    },
  };
}

function makeFullSyncCommand(
  state: string,
  activePomodoro: ActivePomodoroData | null = null
): SyncStateCommand {
  return {
    commandId: 'test-cmd',
    commandType: 'SYNC_STATE',
    targetClient: 'all',
    priority: 'high',
    requiresAck: false,
    createdAt: Date.now(),
    payload: {
      syncType: 'full',
      version: Date.now(),
      state: {
        systemState: { state, dailyCapReached: false, skipTokensRemaining: 3 },
        dailyState: {
          date: '2026-03-11',
          completedPomodoros: 0,
          totalFocusMinutes: 0,
          top3TaskIds: [],
        },
        activePomodoro: activePomodoro
          ? {
              id: activePomodoro.id,
              taskId: activePomodoro.taskId,
              taskTitle: activePomodoro.taskTitle,
              startTime: activePomodoro.startTime,
              duration: activePomodoro.duration,
              status: activePomodoro.status as 'active' | 'paused',
            }
          : null,
        top3Tasks: [],
        settings: {
          pomodoroDuration: 25,
          shortBreakDuration: 5,
          longBreakDuration: 15,
          dailyCap: 8,
          enforcementMode: 'gentle',
        },
      },
    },
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('Delta sync: activePomodoro clearing on state transition', () => {
  beforeEach(() => {
    // Reset store to initial state
    useAppStore.getState().clearState();
  });

  describe('FOCUS → non-FOCUS delta sync', () => {
    it('should clear activePomodoro when state changes from FOCUS to IDLE', () => {
      // Setup: simulate app in FOCUS state with active pomodoro
      useAppStore.setState({
        dailyState: makeDailyState({ state: 'FOCUS' }),
        activePomodoro: makeActivePomodoro(),
        isBlockingActive: true,
        blockingReason: 'focus',
      });

      expect(useAppStore.getState().activePomodoro).not.toBeNull();

      // Act: receive delta sync with state = 'idle'
      useAppStore.getState().handleSyncState(makeDeltaSyncCommand('idle'));

      // Assert: activePomodoro should be cleared
      expect(useAppStore.getState().activePomodoro).toBeNull();
      expect(useAppStore.getState().dailyState?.state).toBe('IDLE');
    });

    it('should clear activePomodoro when state changes from FOCUS to OVER_REST', () => {
      useAppStore.setState({
        dailyState: makeDailyState({ state: 'FOCUS' }),
        activePomodoro: makeActivePomodoro(),
        isBlockingActive: true,
      });

      useAppStore.getState().handleSyncState(makeDeltaSyncCommand('over_rest'));

      expect(useAppStore.getState().activePomodoro).toBeNull();
      expect(useAppStore.getState().dailyState?.state).toBe('OVER_REST');
    });

    it('should normalize legacy state values (rest → IDLE)', () => {
      useAppStore.setState({
        dailyState: makeDailyState({ state: 'FOCUS' }),
        activePomodoro: makeActivePomodoro(),
        isBlockingActive: true,
      });

      // Server sends legacy 'rest' value — should normalize to IDLE
      useAppStore.getState().handleSyncState(makeDeltaSyncCommand('rest'));

      expect(useAppStore.getState().activePomodoro).toBeNull();
      expect(useAppStore.getState().dailyState?.state).toBe('IDLE');
    });

    it('should normalize legacy state values (planning → IDLE)', () => {
      useAppStore.setState({
        dailyState: makeDailyState({ state: 'FOCUS' }),
        activePomodoro: makeActivePomodoro(),
        isBlockingActive: true,
      });

      useAppStore.getState().handleSyncState(makeDeltaSyncCommand('planning'));

      expect(useAppStore.getState().activePomodoro).toBeNull();
      expect(useAppStore.getState().dailyState?.state).toBe('IDLE');
    });

    it('should normalize legacy state values (locked → IDLE)', () => {
      useAppStore.setState({
        dailyState: makeDailyState({ state: 'FOCUS' }),
        activePomodoro: makeActivePomodoro(),
        isBlockingActive: true,
      });

      useAppStore.getState().handleSyncState(makeDeltaSyncCommand('locked'));

      expect(useAppStore.getState().activePomodoro).toBeNull();
      expect(useAppStore.getState().dailyState?.state).toBe('IDLE');
    });
  });

  describe('Non-FOCUS state transitions should not affect activePomodoro', () => {
    it('should not clear activePomodoro when transitioning from IDLE to FOCUS', () => {
      // activePomodoro may already be set optimistically
      useAppStore.setState({
        dailyState: makeDailyState({ state: 'IDLE' }),
        activePomodoro: makeActivePomodoro(),
      });

      useAppStore.getState().handleSyncState(makeDeltaSyncCommand('focus'));

      // activePomodoro should remain since we're moving TO FOCUS
      expect(useAppStore.getState().activePomodoro).not.toBeNull();
    });

    it('should not clear null activePomodoro on non-FOCUS transitions', () => {
      useAppStore.setState({
        dailyState: makeDailyState({ state: 'IDLE' }),
        activePomodoro: null,
      });

      useAppStore.getState().handleSyncState(makeDeltaSyncCommand('over_rest'));

      expect(useAppStore.getState().activePomodoro).toBeNull();
    });
  });

  describe('Full sync: isBlockingActive is not set by store', () => {
    it('should not set isBlockingActive on full sync (managed by blockingService)', () => {
      // isBlockingActive starts as false
      expect(useAppStore.getState().isBlockingActive).toBe(false);

      // Full sync with active pomodoro — store should NOT set isBlockingActive
      useAppStore.getState().handleSyncState(
        makeFullSyncCommand('focus', makeActivePomodoro())
      );

      // isBlockingActive should remain at its default (false), since the store
      // no longer directly manages it — blockingService handles it via evaluateBlockingState()
      expect(useAppStore.getState().isBlockingActive).toBe(false);
      // But activePomodoro should be set
      expect(useAppStore.getState().activePomodoro).not.toBeNull();
      expect(useAppStore.getState().activePomodoro?.status).toBe('active');
    });

    it('should not set isBlockingActive on full sync without active pomodoro', () => {
      useAppStore.setState({ isBlockingActive: true });

      // Full sync without active pomodoro in IDLE state
      useAppStore.getState().handleSyncState(makeFullSyncCommand('idle'));

      // isBlockingActive should not be changed by the store
      // (it was true before, and the store doesn't touch it)
      expect(useAppStore.getState().isBlockingActive).toBe(true);
      expect(useAppStore.getState().activePomodoro).toBeNull();
    });
  });

  describe('Delta sync: isBlockingActive is not set by store', () => {
    it('should not set isBlockingActive when entering OVER_REST via delta', () => {
      useAppStore.setState({
        dailyState: makeDailyState({ state: 'IDLE' }),
        activePomodoro: null,
        isBlockingActive: false,
      });

      useAppStore.getState().handleSyncState(makeDeltaSyncCommand('over_rest'));

      // Store should NOT set isBlockingActive — blockingService manages it
      expect(useAppStore.getState().isBlockingActive).toBe(false);
    });

    it('should not set isBlockingActive when activePomodoro delta has active status', () => {
      useAppStore.setState({
        dailyState: makeDailyState({ state: 'FOCUS' }),
        isBlockingActive: false,
      });

      // Delta with activePomodoro
      const deltaSyncWithPomodoro: SyncStateCommand = {
        commandId: 'test-cmd',
        commandType: 'SYNC_STATE',
        targetClient: 'all',
        priority: 'high',
        requiresAck: false,
        createdAt: Date.now(),
        payload: {
          syncType: 'delta',
          version: Date.now(),
          delta: {
            changes: [
              {
                path: 'activePomodoro',
                operation: 'set',
                value: {
                  id: 'pom-1',
                  taskId: 'task-1',
                  taskTitle: 'Test',
                  startTime: Date.now(),
                  duration: 25,
                  status: 'active',
                },
              },
            ],
          },
        },
      };

      useAppStore.getState().handleSyncState(deltaSyncWithPomodoro);

      // isBlockingActive should NOT be set by the store
      expect(useAppStore.getState().isBlockingActive).toBe(false);
      // But activePomodoro should be set
      expect(useAppStore.getState().activePomodoro?.status).toBe('active');
    });
  });
});
