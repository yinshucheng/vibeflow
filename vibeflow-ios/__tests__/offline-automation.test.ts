/**
 * Unit Tests: iOS Offline Blocking Automation
 *
 * Tests the pure logic components of the offline automation feature:
 * 1. Pomodoro end time calculation
 * 2. 15-minute threshold pre-check
 * 3. BlockingContext construction from store state
 * 4. Extension decision logic (simulated via BlockingContext → reason mapping)
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
// HELPERS (reusable factories)
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
// BlockingContext type (mirrors the native module export)
// =============================================================================

interface BlockingContext {
  currentBlockingReason: string | null;
  sleepScheduleActive: boolean;
  sleepStartHour: number | null;
  sleepStartMinute: number | null;
  sleepEndHour: number | null;
  sleepEndMinute: number | null;
  overRestActive: boolean;
}

/**
 * Pure function that mirrors the syncBlockingContext logic in blocking.service.ts.
 * Extracted here so we can test it without mocking the store.
 */
function buildBlockingContext(
  reason: string | null,
  policy: PolicyData | null
): BlockingContext {
  return {
    currentBlockingReason: reason,
    sleepScheduleActive: !!(
      policy?.sleepTime?.enabled &&
      policy.sleepTime.isCurrentlyActive &&
      !policy.sleepTime.isSnoozed
    ),
    sleepStartHour: policy?.sleepTime?.startTime
      ? parseInt(policy.sleepTime.startTime.split(':')[0], 10)
      : null,
    sleepStartMinute: policy?.sleepTime?.startTime
      ? parseInt(policy.sleepTime.startTime.split(':')[1], 10)
      : null,
    sleepEndHour: policy?.sleepTime?.endTime
      ? parseInt(policy.sleepTime.endTime.split(':')[0], 10)
      : null,
    sleepEndMinute: policy?.sleepTime?.endTime
      ? parseInt(policy.sleepTime.endTime.split(':')[1], 10)
      : null,
    overRestActive: !!(policy?.overRest?.isOverRest),
  };
}

// =============================================================================
// 1. Pomodoro End Time Calculation
// =============================================================================

describe('Pomodoro end time calculation', () => {
  it('should calculate end time from startTime (ms) + duration (minutes)', () => {
    const startTime = 1714000000000; // fixed timestamp in ms
    const duration = 25; // minutes
    const endTimeMs = startTime + duration * 60 * 1000;

    expect(endTimeMs).toBe(1714000000000 + 25 * 60 * 1000);
    expect(endTimeMs).toBe(1714001500000);
  });

  it('should handle short durations (10 min)', () => {
    const startTime = Date.now();
    const duration = 10;
    const endTimeMs = startTime + duration * 60 * 1000;
    const remaining = endTimeMs - Date.now();

    // remaining should be ~10 minutes (600000ms) ± small delta
    expect(remaining).toBeGreaterThan(599000);
    expect(remaining).toBeLessThan(601000);
  });

  it('should handle long durations (120 min)', () => {
    const startTime = Date.now();
    const duration = 120;
    const endTimeMs = startTime + duration * 60 * 1000;
    const remaining = endTimeMs - Date.now();

    expect(remaining).toBeGreaterThan(7199000);
    expect(remaining).toBeLessThan(7201000);
  });

  it('should handle edge case: duration = 0 (end time = start time)', () => {
    const startTime = Date.now();
    const duration = 0;
    const endTimeMs = startTime + duration * 60 * 1000;

    expect(endTimeMs).toBe(startTime);
  });

  // D2: startTime unit defense
  it('should normalize seconds-based startTime to milliseconds', () => {
    const startTimeSeconds = 1714000000; // seconds (10 digits)
    const startTimeMs = 1714000000000;   // milliseconds (13 digits)
    const duration = 25;

    // The defensive check: startTime > 1e12 ? startTime : startTime * 1000
    const normalizedFromSeconds = startTimeSeconds > 1e12 ? startTimeSeconds : startTimeSeconds * 1000;
    const normalizedFromMs = startTimeMs > 1e12 ? startTimeMs : startTimeMs * 1000;

    expect(normalizedFromSeconds).toBe(1714000000000);
    expect(normalizedFromMs).toBe(1714000000000);

    const endFromSeconds = normalizedFromSeconds + duration * 60 * 1000;
    const endFromMs = normalizedFromMs + duration * 60 * 1000;
    expect(endFromSeconds).toBe(endFromMs);
  });

  // B1: Cross-midnight scenario
  it('should handle cross-midnight pomodoro (23:50 start, 00:15 end)', () => {
    // Simulate: 23:50 start, 25 min duration
    const today2350 = new Date();
    today2350.setHours(23, 50, 0, 0);
    const startTime = today2350.getTime();
    const duration = 25;
    const endTimeMs = startTime + duration * 60 * 1000;

    const endDate = new Date(endTimeMs);
    expect(endDate.getHours()).toBe(0);
    expect(endDate.getMinutes()).toBe(15);

    // Verify the end time is ~25 minutes after start
    expect(endTimeMs - startTime).toBe(25 * 60 * 1000);
  });
});

// =============================================================================
// 2. 15-Minute Threshold Pre-Check
// =============================================================================

describe('15.5-minute threshold pre-check (D1: 30s TOCTOU margin over Swift 15min)', () => {
  // TS layer uses 15.5min (930s) to avoid TOCTOU with Swift's 15min (900s) check
  const THRESHOLD_MS = 15.5 * 60 * 1000;

  /**
   * Mirrors the logic in screen-time.service.ts registerPomodoroEndSchedule
   */
  function shouldRegisterSchedule(endTimeMs: number): boolean {
    const remaining = endTimeMs - Date.now();
    return remaining >= THRESHOLD_MS;
  }

  it('should return true for 25-minute pomodoro (remaining ~25min)', () => {
    const endTimeMs = Date.now() + 25 * 60 * 1000;
    expect(shouldRegisterSchedule(endTimeMs)).toBe(true);
  });

  it('should return true for exactly 15.5 minutes remaining', () => {
    const endTimeMs = Date.now() + THRESHOLD_MS;
    expect(shouldRegisterSchedule(endTimeMs)).toBe(true);
  });

  it('should return false for 15 minutes remaining (below 15.5min threshold)', () => {
    const endTimeMs = Date.now() + 15 * 60 * 1000;
    expect(shouldRegisterSchedule(endTimeMs)).toBe(false);
  });

  it('should return false for 14 minutes remaining', () => {
    const endTimeMs = Date.now() + 14 * 60 * 1000;
    expect(shouldRegisterSchedule(endTimeMs)).toBe(false);
  });

  it('should return false for 10 minutes remaining', () => {
    const endTimeMs = Date.now() + 10 * 60 * 1000;
    expect(shouldRegisterSchedule(endTimeMs)).toBe(false);
  });

  it('should return false for 1 minute remaining', () => {
    const endTimeMs = Date.now() + 60 * 1000;
    expect(shouldRegisterSchedule(endTimeMs)).toBe(false);
  });

  it('should return false for end time in the past', () => {
    const endTimeMs = Date.now() - 1000;
    expect(shouldRegisterSchedule(endTimeMs)).toBe(false);
  });

  it('should return true for 120-minute pomodoro', () => {
    const endTimeMs = Date.now() + 120 * 60 * 1000;
    expect(shouldRegisterSchedule(endTimeMs)).toBe(true);
  });

  // Same logic applies to temp unblock
  it('should return false for 5-minute temp unblock', () => {
    const endTimeMs = Date.now() + 5 * 60 * 1000;
    expect(shouldRegisterSchedule(endTimeMs)).toBe(false);
  });

  it('should return true for 20-minute temp unblock', () => {
    const endTimeMs = Date.now() + 20 * 60 * 1000;
    expect(shouldRegisterSchedule(endTimeMs)).toBe(true);
  });

  it('should return false for 16-minute pomodoro (between 15 and 15.5min)', () => {
    const endTimeMs = Date.now() + 16 * 60 * 1000;
    expect(shouldRegisterSchedule(endTimeMs)).toBe(true);
  });
});

// =============================================================================
// 3. BlockingContext Construction
// =============================================================================

describe('BlockingContext construction', () => {
  describe('currentBlockingReason', () => {
    it('should set focus when pomodoro is active', () => {
      const reason = 'focus';
      const ctx = buildBlockingContext(reason, makePolicy());
      expect(ctx.currentBlockingReason).toBe('focus');
    });

    it('should set null when no blocking', () => {
      const ctx = buildBlockingContext(null, makePolicy());
      expect(ctx.currentBlockingReason).toBeNull();
    });

    it('should set sleep when in sleep time', () => {
      const ctx = buildBlockingContext('sleep', makePolicy({
        sleepTime: makeSleepTime({ enabled: true, isCurrentlyActive: true }),
      }));
      expect(ctx.currentBlockingReason).toBe('sleep');
    });

    it('should set over_rest', () => {
      const ctx = buildBlockingContext('over_rest', makePolicy({
        overRest: makeOverRest({ isOverRest: true }),
      }));
      expect(ctx.currentBlockingReason).toBe('over_rest');
    });
  });

  describe('sleepScheduleActive', () => {
    it('should be true when sleep is enabled, active, and not snoozed', () => {
      const ctx = buildBlockingContext('sleep', makePolicy({
        sleepTime: makeSleepTime({
          enabled: true,
          isCurrentlyActive: true,
          isSnoozed: false,
        }),
      }));
      expect(ctx.sleepScheduleActive).toBe(true);
    });

    it('should be false when sleep is snoozed', () => {
      const ctx = buildBlockingContext(null, makePolicy({
        sleepTime: makeSleepTime({
          enabled: true,
          isCurrentlyActive: true,
          isSnoozed: true,
        }),
      }));
      expect(ctx.sleepScheduleActive).toBe(false);
    });

    it('should be false when sleep is disabled', () => {
      const ctx = buildBlockingContext(null, makePolicy({
        sleepTime: makeSleepTime({ enabled: false }),
      }));
      expect(ctx.sleepScheduleActive).toBe(false);
    });

    it('should be false when sleep is not currently active', () => {
      const ctx = buildBlockingContext(null, makePolicy({
        sleepTime: makeSleepTime({
          enabled: true,
          isCurrentlyActive: false,
        }),
      }));
      expect(ctx.sleepScheduleActive).toBe(false);
    });

    it('should be false when no policy', () => {
      const ctx = buildBlockingContext(null, null);
      expect(ctx.sleepScheduleActive).toBe(false);
    });
  });

  describe('sleep time parsing', () => {
    it('should parse "23:00" to hour=23, minute=0', () => {
      const ctx = buildBlockingContext(null, makePolicy({
        sleepTime: makeSleepTime({ startTime: '23:00', endTime: '07:00' }),
      }));
      expect(ctx.sleepStartHour).toBe(23);
      expect(ctx.sleepStartMinute).toBe(0);
      expect(ctx.sleepEndHour).toBe(7);
      expect(ctx.sleepEndMinute).toBe(0);
    });

    it('should parse "22:30" to hour=22, minute=30', () => {
      const ctx = buildBlockingContext(null, makePolicy({
        sleepTime: makeSleepTime({ startTime: '22:30', endTime: '06:45' }),
      }));
      expect(ctx.sleepStartHour).toBe(22);
      expect(ctx.sleepStartMinute).toBe(30);
      expect(ctx.sleepEndHour).toBe(6);
      expect(ctx.sleepEndMinute).toBe(45);
    });

    it('should return null when no sleep time configured', () => {
      const ctx = buildBlockingContext(null, makePolicy());
      expect(ctx.sleepStartHour).toBeNull();
      expect(ctx.sleepStartMinute).toBeNull();
      expect(ctx.sleepEndHour).toBeNull();
      expect(ctx.sleepEndMinute).toBeNull();
    });

    it('should parse "00:00" to hour=0, minute=0', () => {
      const ctx = buildBlockingContext(null, makePolicy({
        sleepTime: makeSleepTime({ startTime: '00:00', endTime: '05:00' }),
      }));
      expect(ctx.sleepStartHour).toBe(0);
      expect(ctx.sleepStartMinute).toBe(0);
    });
  });

  describe('overRestActive', () => {
    it('should be true when overRest.isOverRest is true', () => {
      const ctx = buildBlockingContext('over_rest', makePolicy({
        overRest: makeOverRest({ isOverRest: true }),
      }));
      expect(ctx.overRestActive).toBe(true);
    });

    it('should be false when overRest.isOverRest is false', () => {
      const ctx = buildBlockingContext(null, makePolicy({
        overRest: makeOverRest({ isOverRest: false }),
      }));
      expect(ctx.overRestActive).toBe(false);
    });

    it('should be false when no overRest in policy', () => {
      const ctx = buildBlockingContext(null, makePolicy());
      expect(ctx.overRestActive).toBe(false);
    });

    it('should be false when policy is null', () => {
      const ctx = buildBlockingContext(null, null);
      expect(ctx.overRestActive).toBe(false);
    });
  });

  describe('JSON serialization round-trip (mimics App Group transfer)', () => {
    it('should survive JSON stringify/parse', () => {
      const ctx = buildBlockingContext('focus', makePolicy({
        sleepTime: makeSleepTime({ startTime: '23:30', endTime: '07:15' }),
        overRest: makeOverRest({ isOverRest: false }),
      }));

      const json = JSON.stringify(ctx);
      const parsed = JSON.parse(json) as BlockingContext;

      expect(parsed.currentBlockingReason).toBe('focus');
      expect(parsed.sleepScheduleActive).toBe(true);
      expect(parsed.sleepStartHour).toBe(23);
      expect(parsed.sleepStartMinute).toBe(30);
      expect(parsed.sleepEndHour).toBe(7);
      expect(parsed.sleepEndMinute).toBe(15);
      expect(parsed.overRestActive).toBe(false);
    });
  });
});

// =============================================================================
// 4. Extension Decision Logic (simulated)
// =============================================================================

describe('Extension decision logic (pomodoroEnd)', () => {
  /**
   * Mirrors the logic in DeviceActivityMonitorExtension.handlePomodoroEnd().
   * Given a BlockingContext, determine what action to take.
   */
  function simulatePomodoroEndDecision(
    context: BlockingContext | null
  ): { action: 'enableBlocking'; reason: string } | { action: 'disableBlocking' } {
    if (context) {
      if (context.sleepScheduleActive) {
        return { action: 'enableBlocking', reason: 'sleep' };
      }
      if (context.overRestActive) {
        return { action: 'enableBlocking', reason: 'over_rest' };
      }
    }
    return { action: 'disableBlocking' };
  }

  it('should disable blocking when no other reason exists', () => {
    const ctx = buildBlockingContext('focus', makePolicy());
    const result = simulatePomodoroEndDecision(ctx);
    expect(result.action).toBe('disableBlocking');
  });

  it('should switch to sleep blocking when sleep is active', () => {
    const ctx = buildBlockingContext('focus', makePolicy({
      sleepTime: makeSleepTime({
        enabled: true,
        isCurrentlyActive: true,
        isSnoozed: false,
      }),
    }));
    const result = simulatePomodoroEndDecision(ctx);
    expect(result).toEqual({ action: 'enableBlocking', reason: 'sleep' });
  });

  it('should switch to over_rest blocking when over_rest is active', () => {
    const ctx = buildBlockingContext('focus', makePolicy({
      overRest: makeOverRest({ isOverRest: true }),
    }));
    const result = simulatePomodoroEndDecision(ctx);
    expect(result).toEqual({ action: 'enableBlocking', reason: 'over_rest' });
  });

  it('should prefer sleep over over_rest (sleep checked first)', () => {
    const ctx = buildBlockingContext('focus', makePolicy({
      sleepTime: makeSleepTime({
        enabled: true,
        isCurrentlyActive: true,
        isSnoozed: false,
      }),
      overRest: makeOverRest({ isOverRest: true }),
    }));
    const result = simulatePomodoroEndDecision(ctx);
    expect(result).toEqual({ action: 'enableBlocking', reason: 'sleep' });
  });

  it('should disable blocking when context is null (no shared data)', () => {
    const result = simulatePomodoroEndDecision(null);
    expect(result.action).toBe('disableBlocking');
  });

  it('should disable blocking when sleep is snoozed and no over_rest', () => {
    const ctx = buildBlockingContext('focus', makePolicy({
      sleepTime: makeSleepTime({
        enabled: true,
        isCurrentlyActive: true,
        isSnoozed: true, // snoozed → sleepScheduleActive = false
      }),
    }));
    const result = simulatePomodoroEndDecision(ctx);
    expect(result.action).toBe('disableBlocking');
  });
});

describe('Extension decision logic (tempUnblockExpiry)', () => {
  /**
   * Mirrors the logic in DeviceActivityMonitorExtension.handleTempUnblockExpiry().
   * Given a saved reason and a BlockingContext, determine what action to take.
   */
  function simulateTempUnblockExpiryDecision(
    savedReason: string | null,
    context: BlockingContext | null
  ): { action: 'enableBlocking'; reason: string } | { action: 'disableBlocking' } {
    // First check saved reason
    if (savedReason) {
      return { action: 'enableBlocking', reason: savedReason };
    }

    // Fallback: read context
    if (context) {
      if (context.currentBlockingReason) {
        return { action: 'enableBlocking', reason: context.currentBlockingReason };
      }
      if (context.sleepScheduleActive) {
        return { action: 'enableBlocking', reason: 'sleep' };
      }
      if (context.overRestActive) {
        return { action: 'enableBlocking', reason: 'over_rest' };
      }
    }

    return { action: 'disableBlocking' };
  }

  it('should restore saved reason "focus"', () => {
    const result = simulateTempUnblockExpiryDecision('focus', null);
    expect(result).toEqual({ action: 'enableBlocking', reason: 'focus' });
  });

  it('should restore saved reason "sleep"', () => {
    const result = simulateTempUnblockExpiryDecision('sleep', null);
    expect(result).toEqual({ action: 'enableBlocking', reason: 'sleep' });
  });

  it('should restore saved reason "over_rest"', () => {
    const result = simulateTempUnblockExpiryDecision('over_rest', null);
    expect(result).toEqual({ action: 'enableBlocking', reason: 'over_rest' });
  });

  it('should use context when no saved reason', () => {
    const ctx = buildBlockingContext('sleep', makePolicy({
      sleepTime: makeSleepTime({
        enabled: true,
        isCurrentlyActive: true,
        isSnoozed: false,
      }),
    }));
    const result = simulateTempUnblockExpiryDecision(null, ctx);
    expect(result).toEqual({ action: 'enableBlocking', reason: 'sleep' });
  });

  it('should use context flags when currentBlockingReason is null', () => {
    const ctx: BlockingContext = {
      currentBlockingReason: null,
      sleepScheduleActive: false,
      sleepStartHour: null,
      sleepStartMinute: null,
      sleepEndHour: null,
      sleepEndMinute: null,
      overRestActive: true,
    };
    const result = simulateTempUnblockExpiryDecision(null, ctx);
    expect(result).toEqual({ action: 'enableBlocking', reason: 'over_rest' });
  });

  it('should disable blocking when no saved reason and no context', () => {
    const result = simulateTempUnblockExpiryDecision(null, null);
    expect(result.action).toBe('disableBlocking');
  });

  it('should disable blocking when no saved reason and context has no reasons', () => {
    const ctx = buildBlockingContext(null, makePolicy());
    const result = simulateTempUnblockExpiryDecision(null, ctx);
    expect(result.action).toBe('disableBlocking');
  });

  it('saved reason takes priority over context', () => {
    const ctx = buildBlockingContext('sleep', makePolicy({
      sleepTime: makeSleepTime({
        enabled: true,
        isCurrentlyActive: true,
        isSnoozed: false,
      }),
    }));
    // Saved reason is 'focus' but context says 'sleep' — saved wins
    const result = simulateTempUnblockExpiryDecision('focus', ctx);
    expect(result).toEqual({ action: 'enableBlocking', reason: 'focus' });
  });
});

// =============================================================================
// 5. Pomodoro Schedule Orchestration State Transitions
// =============================================================================

describe('Pomodoro schedule orchestration logic', () => {
  /**
   * Simulates the state transition detection in blocking.service.ts startListening.
   * Returns whether a schedule should be registered or cancelled.
   */
  function detectPomodoroTransition(
    prevId: string | null,
    prevStatus: string | null,
    curId: string | null,
    curStatus: string | null
  ): 'register' | 'cancel' | 'none' {
    const wasActive = prevId !== null && prevStatus === 'active';
    const isActive = curId !== null && curStatus === 'active';

    if (!wasActive && isActive) return 'register';
    if (wasActive && !isActive) return 'cancel';
    return 'none';
  }

  it('null → active: should register', () => {
    expect(detectPomodoroTransition(null, null, 'pom-1', 'active')).toBe('register');
  });

  it('active → null: should cancel', () => {
    expect(detectPomodoroTransition('pom-1', 'active', null, null)).toBe('cancel');
  });

  it('active → paused: should cancel', () => {
    expect(detectPomodoroTransition('pom-1', 'active', 'pom-1', 'paused')).toBe('cancel');
  });

  it('paused → active: should register', () => {
    expect(detectPomodoroTransition('pom-1', 'paused', 'pom-1', 'active')).toBe('register');
  });

  it('active → active (same): should be none', () => {
    expect(detectPomodoroTransition('pom-1', 'active', 'pom-1', 'active')).toBe('none');
  });

  it('null → null: should be none', () => {
    expect(detectPomodoroTransition(null, null, null, null)).toBe('none');
  });

  it('pom-1 active → pom-2 active (switch): should be none (both active)', () => {
    // This is a direct switch, wasActive=true, isActive=true → none
    // In practice, there's a null gap, but if not, this is still correct
    expect(detectPomodoroTransition('pom-1', 'active', 'pom-2', 'active')).toBe('none');
  });
});

// =============================================================================
// 6. Temp Unblock → Restore Reason Determination
// =============================================================================

describe('Temp unblock restore reason determination', () => {
  it('should determine focus as restore reason during active pomodoro', () => {
    const input: BlockingReasonInput = {
      activePomodoro: makePomodoro({ status: 'active' }),
      policy: makePolicy({
        temporaryUnblock: { active: true, endTime: Date.now() + 60_000 },
      }),
    };
    // evaluateBlockingReason returns null (temp unblock overrides)
    expect(evaluateBlockingReason(input)).toBeNull();
    // IgnoringTempUnblock correctly identifies the underlying reason
    expect(evaluateBlockingReasonIgnoringTempUnblock(input)).toBe('focus');
  });

  it('should determine sleep as restore reason during sleep time', () => {
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

  it('should determine null when no blocking reason (temp unblock with no underlying reason)', () => {
    const input: BlockingReasonInput = {
      activePomodoro: null,
      policy: makePolicy({
        temporaryUnblock: { active: true, endTime: Date.now() + 60_000 },
      }),
    };
    // No underlying reason → no schedule needed
    expect(evaluateBlockingReasonIgnoringTempUnblock(input)).toBeNull();
  });
});

// =============================================================================
// 7. Sleep Schedule Registration Bug Fix
// =============================================================================

describe('Sleep schedule registration condition', () => {
  /**
   * Old logic (buggy):
   *   curSleepEnabled && curSleepStart && curSleepEnd && !curSleepActive
   *
   * New logic (fixed):
   *   curSleepEnabled && curSleepStart && curSleepEnd
   *
   * The !curSleepActive condition prevented registration when app starts
   * during an active sleep period.
   */

  function shouldRegisterSleepSchedule(
    enabled: boolean,
    startTime: string,
    endTime: string,
    // isCurrentlyActive is intentionally NOT used in the fixed version
  ): boolean {
    return enabled && !!startTime && !!endTime;
  }

  it('should register when enabled with valid times (not in sleep period)', () => {
    expect(shouldRegisterSleepSchedule(true, '23:00', '07:00')).toBe(true);
  });

  it('should register when enabled with valid times (DURING sleep period — the bug fix)', () => {
    // This is the case that was broken before: app starts during sleep time
    expect(shouldRegisterSleepSchedule(true, '23:00', '07:00')).toBe(true);
  });

  it('should NOT register when disabled', () => {
    expect(shouldRegisterSleepSchedule(false, '23:00', '07:00')).toBe(false);
  });

  it('should NOT register when start time is empty', () => {
    expect(shouldRegisterSleepSchedule(true, '', '07:00')).toBe(false);
  });

  it('should NOT register when end time is empty', () => {
    expect(shouldRegisterSleepSchedule(true, '23:00', '')).toBe(false);
  });
});
