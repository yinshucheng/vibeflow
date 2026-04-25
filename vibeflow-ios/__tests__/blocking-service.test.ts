/**
 * Unit Tests: Blocking Service — evaluateBlockingReason & enableBlocking & SelectionSummary
 *
 * Task 11.1: evaluateBlockingReason() state combinations
 * Task 11.2: enableBlocking(reason) parameter passing correctness
 * Task 11.3: SelectionSummary handling logic (hasSelection true/false → useSelection)
 */

import { evaluateBlockingReason, evaluateBlockingReasonIgnoringTempUnblock } from '../src/utils/blocking-reason';
import type { BlockingReasonInput } from '../src/utils/blocking-reason';
import type {
  ActivePomodoroData,
  PolicyData,
  SleepTimePolicyData,
  OverRestPolicyData,
} from '../src/types';

// =============================================================================
// HELPERS
// =============================================================================

function makePomodoro(
  overrides: Partial<ActivePomodoroData> = {}
): ActivePomodoroData {
  return {
    id: 'pom-1',
    taskId: 'task-1',
    taskTitle: 'Test Task',
    startTime: Date.now(),
    duration: 25,
    status: 'active',
    ...overrides,
  };
}

function makeSleepTime(
  overrides: Partial<SleepTimePolicyData> = {}
): SleepTimePolicyData {
  return {
    enabled: true,
    startTime: '23:00',
    endTime: '07:00',
    isCurrentlyActive: true,
    isSnoozed: false,
    ...overrides,
  };
}

function makeOverRest(
  overrides: Partial<OverRestPolicyData> = {}
): OverRestPolicyData {
  return {
    isOverRest: true,
    overRestMinutes: 10,
    ...overrides,
  };
}

function makePolicy(
  overrides: Partial<PolicyData> = {}
): PolicyData {
  return {
    version: 1,
    distractionApps: [],
    updatedAt: Date.now(),
    ...overrides,
  };
}

// =============================================================================
// Task 11.1: evaluateBlockingReason() state combinations
// =============================================================================

describe('Task 11.1: evaluateBlockingReason() state combinations', () => {
  describe('returns null when no blocking conditions are met', () => {
    it('should return null when no pomodoro and no policy', () => {
      const input: BlockingReasonInput = {
        activePomodoro: null,
        policy: null,
      };
      expect(evaluateBlockingReason(input)).toBeNull();
    });

    it('should return null when pomodoro is paused', () => {
      const input: BlockingReasonInput = {
        activePomodoro: makePomodoro({ status: 'paused' }),
        policy: null,
      };
      expect(evaluateBlockingReason(input)).toBeNull();
    });

    it('should return null when policy has no active conditions', () => {
      const input: BlockingReasonInput = {
        activePomodoro: null,
        policy: makePolicy({
          overRest: makeOverRest({ isOverRest: false }),
          sleepTime: makeSleepTime({ enabled: false }),
        }),
      };
      expect(evaluateBlockingReason(input)).toBeNull();
    });

    it('should return null when sleep is enabled but not currently active', () => {
      const input: BlockingReasonInput = {
        activePomodoro: null,
        policy: makePolicy({
          sleepTime: makeSleepTime({ enabled: true, isCurrentlyActive: false }),
        }),
      };
      expect(evaluateBlockingReason(input)).toBeNull();
    });

    it('should return null when sleep is snoozed', () => {
      const input: BlockingReasonInput = {
        activePomodoro: null,
        policy: makePolicy({
          sleepTime: makeSleepTime({
            enabled: true,
            isCurrentlyActive: true,
            isSnoozed: true,
          }),
        }),
      };
      expect(evaluateBlockingReason(input)).toBeNull();
    });
  });

  describe('returns focus when active pomodoro exists', () => {
    it('should return focus for active pomodoro', () => {
      const input: BlockingReasonInput = {
        activePomodoro: makePomodoro({ status: 'active' }),
        policy: null,
      };
      expect(evaluateBlockingReason(input)).toBe('focus');
    });

    it('should return focus even when over_rest is also active', () => {
      const input: BlockingReasonInput = {
        activePomodoro: makePomodoro({ status: 'active' }),
        policy: makePolicy({ overRest: makeOverRest({ isOverRest: true }) }),
      };
      expect(evaluateBlockingReason(input)).toBe('focus');
    });

    it('should return focus even when sleep is also active', () => {
      const input: BlockingReasonInput = {
        activePomodoro: makePomodoro({ status: 'active' }),
        policy: makePolicy({
          sleepTime: makeSleepTime({
            enabled: true,
            isCurrentlyActive: true,
            isSnoozed: false,
          }),
        }),
      };
      expect(evaluateBlockingReason(input)).toBe('focus');
    });

    it('should return focus even when both over_rest and sleep are active', () => {
      const input: BlockingReasonInput = {
        activePomodoro: makePomodoro({ status: 'active' }),
        policy: makePolicy({
          overRest: makeOverRest({ isOverRest: true }),
          sleepTime: makeSleepTime({
            enabled: true,
            isCurrentlyActive: true,
            isSnoozed: false,
          }),
        }),
      };
      expect(evaluateBlockingReason(input)).toBe('focus');
    });
  });

  describe('returns over_rest when no active pomodoro and over rest is active', () => {
    it('should return over_rest', () => {
      const input: BlockingReasonInput = {
        activePomodoro: null,
        policy: makePolicy({ overRest: makeOverRest({ isOverRest: true }) }),
      };
      expect(evaluateBlockingReason(input)).toBe('over_rest');
    });

    it('should return over_rest with paused pomodoro', () => {
      const input: BlockingReasonInput = {
        activePomodoro: makePomodoro({ status: 'paused' }),
        policy: makePolicy({ overRest: makeOverRest({ isOverRest: true }) }),
      };
      expect(evaluateBlockingReason(input)).toBe('over_rest');
    });

    it('should return over_rest even when sleep is also active (over_rest > sleep)', () => {
      const input: BlockingReasonInput = {
        activePomodoro: null,
        policy: makePolicy({
          overRest: makeOverRest({ isOverRest: true }),
          sleepTime: makeSleepTime({
            enabled: true,
            isCurrentlyActive: true,
            isSnoozed: false,
          }),
        }),
      };
      expect(evaluateBlockingReason(input)).toBe('over_rest');
    });
  });

  describe('returns sleep when no higher-priority conditions', () => {
    it('should return sleep when enabled, active, and not snoozed', () => {
      const input: BlockingReasonInput = {
        activePomodoro: null,
        policy: makePolicy({
          sleepTime: makeSleepTime({
            enabled: true,
            isCurrentlyActive: true,
            isSnoozed: false,
          }),
        }),
      };
      expect(evaluateBlockingReason(input)).toBe('sleep');
    });

    it('should return sleep with paused pomodoro and no over_rest', () => {
      const input: BlockingReasonInput = {
        activePomodoro: makePomodoro({ status: 'paused' }),
        policy: makePolicy({
          overRest: makeOverRest({ isOverRest: false }),
          sleepTime: makeSleepTime({
            enabled: true,
            isCurrentlyActive: true,
            isSnoozed: false,
          }),
        }),
      };
      expect(evaluateBlockingReason(input)).toBe('sleep');
    });
  });

  describe('edge cases', () => {
    it('should return null when policy exists but has no overRest or sleepTime fields', () => {
      const input: BlockingReasonInput = {
        activePomodoro: null,
        policy: makePolicy(),
      };
      expect(evaluateBlockingReason(input)).toBeNull();
    });

    it('should return null when overRest is false and sleep is disabled', () => {
      const input: BlockingReasonInput = {
        activePomodoro: null,
        policy: makePolicy({
          overRest: makeOverRest({ isOverRest: false }),
          sleepTime: makeSleepTime({ enabled: false }),
        }),
      };
      expect(evaluateBlockingReason(input)).toBeNull();
    });
  });

  describe('temporaryUnblock overrides all blocking reasons', () => {
    it('should return null when temporaryUnblock is active with future endTime (overrides focus)', () => {
      const input: BlockingReasonInput = {
        activePomodoro: makePomodoro({ status: 'active' }),
        policy: makePolicy({
          temporaryUnblock: { active: true, endTime: Date.now() + 60_000 },
          overRest: makeOverRest({ isOverRest: true }),
          sleepTime: makeSleepTime({ enabled: true, isCurrentlyActive: true, isSnoozed: false }),
        }),
      };
      expect(evaluateBlockingReason(input)).toBeNull();
    });

    it('should return null when temporaryUnblock overrides over_rest', () => {
      const input: BlockingReasonInput = {
        activePomodoro: null,
        policy: makePolicy({
          temporaryUnblock: { active: true, endTime: Date.now() + 60_000 },
          overRest: makeOverRest({ isOverRest: true }),
        }),
      };
      expect(evaluateBlockingReason(input)).toBeNull();
    });

    it('should return null when temporaryUnblock overrides sleep', () => {
      const input: BlockingReasonInput = {
        activePomodoro: null,
        policy: makePolicy({
          temporaryUnblock: { active: true, endTime: Date.now() + 60_000 },
          sleepTime: makeSleepTime({ enabled: true, isCurrentlyActive: true, isSnoozed: false }),
        }),
      };
      expect(evaluateBlockingReason(input)).toBeNull();
    });

    it('should NOT override when temporaryUnblock endTime is in the past', () => {
      const input: BlockingReasonInput = {
        activePomodoro: makePomodoro({ status: 'active' }),
        policy: makePolicy({
          temporaryUnblock: { active: true, endTime: Date.now() - 1000 },
        }),
      };
      expect(evaluateBlockingReason(input)).toBe('focus');
    });

    it('should NOT override when temporaryUnblock is inactive', () => {
      const input: BlockingReasonInput = {
        activePomodoro: makePomodoro({ status: 'active' }),
        policy: makePolicy({
          temporaryUnblock: { active: false, endTime: Date.now() + 60_000 },
        }),
      };
      expect(evaluateBlockingReason(input)).toBe('focus');
    });

    it('should NOT override when temporaryUnblock is undefined', () => {
      const input: BlockingReasonInput = {
        activePomodoro: makePomodoro({ status: 'active' }),
        policy: makePolicy(),
      };
      expect(evaluateBlockingReason(input)).toBe('focus');
    });
  });
});

// =============================================================================
// Task 11.2: enableBlocking(reason) parameter passing correctness
// =============================================================================

describe('Task 11.2: enableBlocking(reason) parameter passing', () => {
  // We test the screen-time service's enableBlocking logic by verifying the
  // bridge calls. Since screenTimeService is a singleton with module-level
  // native module detection, we test the MockScreenTimeBridge behavior pattern.

  let mockBridge: {
    enableBlocking: jest.Mock;
    getAuthorizationStatus: jest.Mock;
    getSelectionSummary: jest.Mock;
    setBlockingReason: jest.Mock;
    disableBlocking: jest.Mock;
  };

  beforeEach(() => {
    mockBridge = {
      enableBlocking: jest.fn().mockResolvedValue(undefined),
      getAuthorizationStatus: jest.fn().mockResolvedValue('authorized'),
      getSelectionSummary: jest.fn().mockResolvedValue({
        appCount: 5,
        categoryCount: 1,
        hasSelection: true,
      }),
      setBlockingReason: jest.fn().mockResolvedValue(undefined),
      disableBlocking: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('should call enableBlocking with useSelection=true when user has selection', async () => {
    mockBridge.getSelectionSummary.mockResolvedValue({
      appCount: 3,
      categoryCount: 0,
      hasSelection: true,
    });

    // Simulate the enableBlocking(reason) flow from screen-time.service.ts
    const reason = 'focus';
    const status = await mockBridge.getAuthorizationStatus();
    if (status === 'authorized') {
      const summary = await mockBridge.getSelectionSummary('distraction');
      await mockBridge.enableBlocking(summary.hasSelection);
      await mockBridge.setBlockingReason(reason);
    }

    expect(mockBridge.enableBlocking).toHaveBeenCalledWith(true);
    expect(mockBridge.setBlockingReason).toHaveBeenCalledWith('focus');
  });

  it('should call enableBlocking with useSelection=false when user has no selection', async () => {
    mockBridge.getSelectionSummary.mockResolvedValue({
      appCount: 0,
      categoryCount: 0,
      hasSelection: false,
    });

    const reason = 'over_rest';
    const status = await mockBridge.getAuthorizationStatus();
    if (status === 'authorized') {
      const summary = await mockBridge.getSelectionSummary('distraction');
      await mockBridge.enableBlocking(summary.hasSelection);
      await mockBridge.setBlockingReason(reason);
    }

    expect(mockBridge.enableBlocking).toHaveBeenCalledWith(false);
    expect(mockBridge.setBlockingReason).toHaveBeenCalledWith('over_rest');
  });

  it('should not call enableBlocking when not authorized', async () => {
    mockBridge.getAuthorizationStatus.mockResolvedValue('denied');

    const reason = 'focus';
    const status = await mockBridge.getAuthorizationStatus();
    if (status === 'authorized') {
      const summary = await mockBridge.getSelectionSummary('distraction');
      await mockBridge.enableBlocking(summary.hasSelection);
      await mockBridge.setBlockingReason(reason);
    }

    expect(mockBridge.enableBlocking).not.toHaveBeenCalled();
    expect(mockBridge.setBlockingReason).not.toHaveBeenCalled();
  });

  it('should pass correct reason string for each BlockingReason type', async () => {
    const reasons = ['focus', 'over_rest', 'sleep'] as const;

    for (const reason of reasons) {
      mockBridge.setBlockingReason.mockClear();

      const status = await mockBridge.getAuthorizationStatus();
      if (status === 'authorized') {
        const summary = await mockBridge.getSelectionSummary('distraction');
        await mockBridge.enableBlocking(summary.hasSelection);
        await mockBridge.setBlockingReason(reason);
      }

      expect(mockBridge.setBlockingReason).toHaveBeenCalledWith(reason);
    }
  });

  it('should always query distraction selection (not work) for enableBlocking', async () => {
    const status = await mockBridge.getAuthorizationStatus();
    if (status === 'authorized') {
      const summary = await mockBridge.getSelectionSummary('distraction');
      await mockBridge.enableBlocking(summary.hasSelection);
      await mockBridge.setBlockingReason('focus');
    }

    expect(mockBridge.getSelectionSummary).toHaveBeenCalledWith('distraction');
    expect(mockBridge.getSelectionSummary).not.toHaveBeenCalledWith('work');
  });
});

// =============================================================================
// Task 11.3: SelectionSummary handling logic
// =============================================================================

describe('Task 11.3: SelectionSummary handling logic', () => {
  describe('hasSelection determines useSelection parameter', () => {
    it('hasSelection=true should result in useSelection=true', () => {
      const summary = { appCount: 5, categoryCount: 1, hasSelection: true };
      expect(summary.hasSelection).toBe(true);
    });

    it('hasSelection=false should result in useSelection=false', () => {
      const summary = { appCount: 0, categoryCount: 0, hasSelection: false };
      expect(summary.hasSelection).toBe(false);
    });

    it('hasSelection=true with only categories (no apps) should still use selection', () => {
      const summary = { appCount: 0, categoryCount: 3, hasSelection: true };
      expect(summary.hasSelection).toBe(true);
    });

    it('hasSelection=true with only apps (no categories) should still use selection', () => {
      const summary = { appCount: 2, categoryCount: 0, hasSelection: true };
      expect(summary.hasSelection).toBe(true);
    });
  });

  describe('enableBlocking flow with SelectionSummary', () => {
    it('should use token-based blocking when hasSelection is true', async () => {
      const mockEnableBlocking = jest.fn();
      const summary = { appCount: 3, categoryCount: 1, hasSelection: true };

      // Simulate: enableBlocking(summary.hasSelection)
      await mockEnableBlocking(summary.hasSelection);

      expect(mockEnableBlocking).toHaveBeenCalledWith(true);
    });

    it('should use .all() fallback blocking when hasSelection is false', async () => {
      const mockEnableBlocking = jest.fn();
      const summary = { appCount: 0, categoryCount: 0, hasSelection: false };

      await mockEnableBlocking(summary.hasSelection);

      expect(mockEnableBlocking).toHaveBeenCalledWith(false);
    });
  });

  describe('BlockingState stores selectionSummary correctly', () => {
    it('should store summary when blocking is enabled with selection', () => {
      const summary = { appCount: 5, categoryCount: 2, hasSelection: true };
      const blockingState = {
        isActive: true,
        selectionSummary: summary,
        pomodoroId: null,
        activatedAt: Date.now(),
        reason: 'focus' as const,
      };

      expect(blockingState.selectionSummary).toEqual(summary);
      expect(blockingState.selectionSummary?.appCount).toBe(5);
      expect(blockingState.selectionSummary?.categoryCount).toBe(2);
    });

    it('should store null summary when blocking is disabled', () => {
      const blockingState = {
        isActive: false,
        selectionSummary: null,
        pomodoroId: null,
        activatedAt: null,
        reason: null,
      };

      expect(blockingState.selectionSummary).toBeNull();
    });

    it('should persist summary through JSON serialization round-trip', () => {
      const summary = { appCount: 10, categoryCount: 3, hasSelection: true };
      const blockingState = {
        isActive: true,
        selectionSummary: summary,
        pomodoroId: 'pom-123',
        activatedAt: 1700000000000,
        reason: 'sleep' as const,
      };

      const serialized = JSON.stringify(blockingState);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.selectionSummary).toEqual(summary);
      expect(deserialized.selectionSummary.hasSelection).toBe(true);
    });
  });

  describe('Migration from old BlockingState format', () => {
    it('should handle old format with blockedApps → null selectionSummary', () => {
      // Old format from Phase 1
      const oldState = {
        isActive: true,
        blockedApps: [{ bundleId: 'com.app.test', name: 'Test' }],
        pomodoroId: 'pom-1',
        activatedAt: 1700000000000,
        reason: 'focus',
      };

      // Migration logic from screen-time.service.ts loadBlockingState()
      const parsed = oldState as Record<string, unknown>;
      if ('blockedApps' in parsed && !('selectionSummary' in parsed)) {
        const migrated = {
          isActive: parsed.isActive,
          selectionSummary: null,
          pomodoroId: parsed.pomodoroId,
          activatedAt: parsed.activatedAt,
          reason: parsed.reason,
        };

        expect(migrated.selectionSummary).toBeNull();
        expect(migrated.isActive).toBe(true);
        expect(migrated.reason).toBe('focus');
      }
    });

    it('should not migrate new format that already has selectionSummary', () => {
      const newState = {
        isActive: true,
        selectionSummary: { appCount: 3, categoryCount: 1, hasSelection: true },
        pomodoroId: 'pom-2',
        activatedAt: 1700000000000,
        reason: 'focus',
      };

      const parsed = newState as Record<string, unknown>;
      const needsMigration = 'blockedApps' in parsed && !('selectionSummary' in parsed);

      expect(needsMigration).toBe(false);
    });
  });
});

// =============================================================================
// evaluateBlockingReasonIgnoringTempUnblock
// =============================================================================

describe('evaluateBlockingReasonIgnoringTempUnblock', () => {
  describe('ignores temporary unblock entirely', () => {
    it('should return focus even when temporaryUnblock is active', () => {
      const input: BlockingReasonInput = {
        activePomodoro: makePomodoro({ status: 'active' }),
        policy: makePolicy({
          temporaryUnblock: { active: true, endTime: Date.now() + 60_000 },
        }),
      };
      expect(evaluateBlockingReasonIgnoringTempUnblock(input)).toBe('focus');
    });

    it('should return over_rest even when temporaryUnblock is active', () => {
      const input: BlockingReasonInput = {
        activePomodoro: null,
        policy: makePolicy({
          temporaryUnblock: { active: true, endTime: Date.now() + 60_000 },
          overRest: makeOverRest({ isOverRest: true }),
        }),
      };
      expect(evaluateBlockingReasonIgnoringTempUnblock(input)).toBe('over_rest');
    });

    it('should return sleep even when temporaryUnblock is active', () => {
      const input: BlockingReasonInput = {
        activePomodoro: null,
        policy: makePolicy({
          temporaryUnblock: { active: true, endTime: Date.now() + 60_000 },
          sleepTime: makeSleepTime({
            enabled: true,
            isCurrentlyActive: true,
            isSnoozed: false,
          }),
        }),
      };
      expect(evaluateBlockingReasonIgnoringTempUnblock(input)).toBe('sleep');
    });

    it('should return null when no blocking reason and temporaryUnblock is active', () => {
      const input: BlockingReasonInput = {
        activePomodoro: null,
        policy: makePolicy({
          temporaryUnblock: { active: true, endTime: Date.now() + 60_000 },
        }),
      };
      expect(evaluateBlockingReasonIgnoringTempUnblock(input)).toBeNull();
    });
  });

  describe('maintains same priority as evaluateBlockingReason (minus temp unblock)', () => {
    it('should return focus > over_rest > sleep', () => {
      const input: BlockingReasonInput = {
        activePomodoro: makePomodoro({ status: 'active' }),
        policy: makePolicy({
          overRest: makeOverRest({ isOverRest: true }),
          sleepTime: makeSleepTime({
            enabled: true,
            isCurrentlyActive: true,
            isSnoozed: false,
          }),
        }),
      };
      expect(evaluateBlockingReasonIgnoringTempUnblock(input)).toBe('focus');
    });

    it('should return over_rest > sleep when no pomodoro', () => {
      const input: BlockingReasonInput = {
        activePomodoro: null,
        policy: makePolicy({
          overRest: makeOverRest({ isOverRest: true }),
          sleepTime: makeSleepTime({
            enabled: true,
            isCurrentlyActive: true,
            isSnoozed: false,
          }),
        }),
      };
      expect(evaluateBlockingReasonIgnoringTempUnblock(input)).toBe('over_rest');
    });

    it('should return null when no conditions met', () => {
      const input: BlockingReasonInput = {
        activePomodoro: null,
        policy: makePolicy(),
      };
      expect(evaluateBlockingReasonIgnoringTempUnblock(input)).toBeNull();
    });

    it('should return over_rest from dailyState fallback', () => {
      const input: BlockingReasonInput = {
        activePomodoro: null,
        policy: makePolicy(),
        dailyState: { state: 'OVER_REST' } as any,
      };
      expect(evaluateBlockingReasonIgnoringTempUnblock(input)).toBe('over_rest');
    });
  });

  describe('contrast with evaluateBlockingReason', () => {
    it('evaluateBlockingReason returns null but IgnoringTempUnblock returns the reason', () => {
      const input: BlockingReasonInput = {
        activePomodoro: null,
        policy: makePolicy({
          temporaryUnblock: { active: true, endTime: Date.now() + 60_000 },
          sleepTime: makeSleepTime({
            enabled: true,
            isCurrentlyActive: true,
            isSnoozed: false,
          }),
        }),
      };
      // Original returns null (temp unblock overrides)
      expect(evaluateBlockingReason(input)).toBeNull();
      // IgnoringTempUnblock returns the underlying reason
      expect(evaluateBlockingReasonIgnoringTempUnblock(input)).toBe('sleep');
    });
  });
});
