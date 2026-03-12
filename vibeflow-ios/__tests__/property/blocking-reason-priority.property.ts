/**
 * Property Test: Blocking Reason Priority
 *
 * Task 11.4: Blocking reason priority correctness under arbitrary combinations
 *
 * Property: For any combination of active pomodoro state, over_rest state,
 * and sleep state, evaluateBlockingReason SHALL return the highest-priority
 * active reason: focus > over_rest > sleep > null.
 */

import * as fc from 'fast-check';
import { evaluateBlockingReason } from '../../src/utils/blocking-reason';
import type { BlockingReasonInput } from '../../src/utils/blocking-reason';
import type {
  ActivePomodoroData,
  PolicyData,
  BlockingReason,
} from '../../src/types';

// =============================================================================
// GENERATORS
// =============================================================================

/**
 * Generator for ActivePomodoroData (can be null)
 */
const activePomodoroArb: fc.Arbitrary<ActivePomodoroData | null> = fc.oneof(
  fc.constant(null),
  fc.record({
    id: fc.uuid(),
    taskId: fc.oneof(fc.uuid(), fc.constant(null)) as fc.Arbitrary<string | null>,
    taskTitle: fc.string({ minLength: 1, maxLength: 50 }),
    startTime: fc.integer({ min: 1000000000000, max: 2000000000000 }),
    duration: fc.integer({ min: 1, max: 120 }),
    status: fc.constantFrom('active', 'paused') as fc.Arbitrary<'active' | 'paused'>,
  })
);

/**
 * Generator for boolean signal: is over_rest active?
 */
const overRestActiveArb = fc.boolean();

/**
 * Generator for sleep state: [enabled, isCurrentlyActive, isSnoozed]
 */
const sleepStateArb = fc.record({
  enabled: fc.boolean(),
  isCurrentlyActive: fc.boolean(),
  isSnoozed: fc.boolean(),
});

/**
 * Generator for temporaryUnblock state.
 * endTime is relative to "now" — can be in the past or future.
 */
const temporaryUnblockArb: fc.Arbitrary<{ active: boolean; endTime: number } | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.record({
    active: fc.boolean(),
    endTime: fc.integer({ min: -300_000, max: 300_000 }).map((offset) => Date.now() + offset),
  })
);

/**
 * Build a BlockingReasonInput from individual signal generators
 */
function buildInput(
  pomodoro: ActivePomodoroData | null,
  overRestActive: boolean,
  sleepState: { enabled: boolean; isCurrentlyActive: boolean; isSnoozed: boolean },
  temporaryUnblock?: { active: boolean; endTime: number }
): BlockingReasonInput {
  const policy: PolicyData = {
    version: 1,
    distractionApps: [],
    updatedAt: Date.now(),
    overRest: {
      isOverRest: overRestActive,
      overRestMinutes: overRestActive ? 10 : 0,
    },
    sleepTime: {
      enabled: sleepState.enabled,
      startTime: '23:00',
      endTime: '07:00',
      isCurrentlyActive: sleepState.isCurrentlyActive,
      isSnoozed: sleepState.isSnoozed,
    },
    temporaryUnblock,
  };

  return { activePomodoro: pomodoro, policy };
}

/**
 * Compute the expected blocking reason manually based on priority rules.
 */
function expectedReason(
  pomodoro: ActivePomodoroData | null,
  overRestActive: boolean,
  sleepState: { enabled: boolean; isCurrentlyActive: boolean; isSnoozed: boolean },
  temporaryUnblock?: { active: boolean; endTime: number }
): BlockingReason | null {
  // Priority 0: temporaryUnblock — overrides ALL blocking reasons
  if (temporaryUnblock?.active && Date.now() < temporaryUnblock.endTime) {
    return null;
  }

  // Priority 1: focus — active pomodoro with status 'active'
  if (pomodoro && pomodoro.status === 'active') {
    return 'focus';
  }

  // Priority 2: over_rest
  if (overRestActive) {
    return 'over_rest';
  }

  // Priority 3: sleep — enabled AND currently active AND not snoozed
  if (sleepState.enabled && sleepState.isCurrentlyActive && !sleepState.isSnoozed) {
    return 'sleep';
  }

  return null;
}

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Property: Blocking Reason Priority', () => {
  it('should match expected priority for any combination of signals', () => {
    fc.assert(
      fc.property(
        activePomodoroArb,
        overRestActiveArb,
        sleepStateArb,
        temporaryUnblockArb,
        (pomodoro, overRestActive, sleepState, tempUnblock) => {
          const input = buildInput(pomodoro, overRestActive, sleepState, tempUnblock);
          const actual = evaluateBlockingReason(input);
          const expected = expectedReason(pomodoro, overRestActive, sleepState, tempUnblock);
          return actual === expected;
        }
      ),
      { numRuns: 500 }
    );
  });

  it('focus should always beat over_rest when both conditions are met', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          taskId: fc.uuid() as fc.Arbitrary<string | null>,
          taskTitle: fc.string({ minLength: 1, maxLength: 50 }),
          startTime: fc.integer({ min: 1000000000000, max: 2000000000000 }),
          duration: fc.integer({ min: 1, max: 120 }),
          status: fc.constant('active' as const),
        }),
        sleepStateArb,
        (activePomodoro, sleepState) => {
          const input = buildInput(activePomodoro, true, sleepState);
          return evaluateBlockingReason(input) === 'focus';
        }
      ),
      { numRuns: 100 }
    );
  });

  it('focus should always beat sleep when both conditions are met', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          taskId: fc.uuid() as fc.Arbitrary<string | null>,
          taskTitle: fc.string({ minLength: 1, maxLength: 50 }),
          startTime: fc.integer({ min: 1000000000000, max: 2000000000000 }),
          duration: fc.integer({ min: 1, max: 120 }),
          status: fc.constant('active' as const),
        }),
        overRestActiveArb,
        (activePomodoro, overRestActive) => {
          const sleepState = { enabled: true, isCurrentlyActive: true, isSnoozed: false };
          const input = buildInput(activePomodoro, overRestActive, sleepState);
          return evaluateBlockingReason(input) === 'focus';
        }
      ),
      { numRuns: 100 }
    );
  });

  it('over_rest should always beat sleep when focus is not active', () => {
    fc.assert(
      fc.property(
        // Ensure no active pomodoro (null or paused)
        fc.oneof(
          fc.constant(null),
          fc.record({
            id: fc.uuid(),
            taskId: fc.uuid() as fc.Arbitrary<string | null>,
            taskTitle: fc.string({ minLength: 1, maxLength: 50 }),
            startTime: fc.integer({ min: 1000000000000, max: 2000000000000 }),
            duration: fc.integer({ min: 1, max: 120 }),
            status: fc.constant('paused' as const),
          })
        ) as fc.Arbitrary<ActivePomodoroData | null>,
        (pomodoroOrNull) => {
          const sleepState = { enabled: true, isCurrentlyActive: true, isSnoozed: false };
          const input = buildInput(pomodoroOrNull, true, sleepState);
          return evaluateBlockingReason(input) === 'over_rest';
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return null when no conditions are active', () => {
    fc.assert(
      fc.property(
        // No active pomodoro
        fc.oneof(
          fc.constant(null),
          fc.record({
            id: fc.uuid(),
            taskId: fc.uuid() as fc.Arbitrary<string | null>,
            taskTitle: fc.string({ minLength: 1, maxLength: 50 }),
            startTime: fc.integer({ min: 1000000000000, max: 2000000000000 }),
            duration: fc.integer({ min: 1, max: 120 }),
            status: fc.constant('paused' as const),
          })
        ) as fc.Arbitrary<ActivePomodoroData | null>,
        // Sleep is disabled or not active or snoozed
        fc.record({
          enabled: fc.boolean(),
          isCurrentlyActive: fc.boolean(),
          isSnoozed: fc.boolean(),
        }).filter(
          (s) => !(s.enabled && s.isCurrentlyActive && !s.isSnoozed)
        ),
        (pomodoroOrNull, sleepState) => {
          const input = buildInput(pomodoroOrNull, false, sleepState);
          return evaluateBlockingReason(input) === null;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('paused pomodoro should not trigger focus blocking', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          taskId: fc.uuid() as fc.Arbitrary<string | null>,
          taskTitle: fc.string({ minLength: 1, maxLength: 50 }),
          startTime: fc.integer({ min: 1000000000000, max: 2000000000000 }),
          duration: fc.integer({ min: 1, max: 120 }),
          status: fc.constant('paused' as const),
        }),
        overRestActiveArb,
        sleepStateArb,
        (pausedPomodoro, overRestActive, sleepState) => {
          const input = buildInput(pausedPomodoro, overRestActive, sleepState);
          const result = evaluateBlockingReason(input);
          return result !== 'focus';
        }
      ),
      { numRuns: 100 }
    );
  });

  it('result should always be one of: focus, over_rest, sleep, or null', () => {
    fc.assert(
      fc.property(
        activePomodoroArb,
        overRestActiveArb,
        sleepStateArb,
        temporaryUnblockArb,
        (pomodoro, overRestActive, sleepState, tempUnblock) => {
          const input = buildInput(pomodoro, overRestActive, sleepState, tempUnblock);
          const result = evaluateBlockingReason(input);
          return (
            result === 'focus' ||
            result === 'over_rest' ||
            result === 'sleep' ||
            result === null
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('active temporaryUnblock with future endTime should always return null regardless of other conditions', () => {
    fc.assert(
      fc.property(
        activePomodoroArb,
        overRestActiveArb,
        sleepStateArb,
        (pomodoro, overRestActive, sleepState) => {
          const futureUnblock = { active: true, endTime: Date.now() + 300_000 };
          const input = buildInput(pomodoro, overRestActive, sleepState, futureUnblock);
          return evaluateBlockingReason(input) === null;
        }
      ),
      { numRuns: 200 }
    );
  });

  it('expired temporaryUnblock should NOT override blocking reasons', () => {
    fc.assert(
      fc.property(
        // Force at least one blocking condition active (active pomodoro)
        fc.record({
          id: fc.uuid(),
          taskId: fc.uuid() as fc.Arbitrary<string | null>,
          taskTitle: fc.string({ minLength: 1, maxLength: 50 }),
          startTime: fc.integer({ min: 1000000000000, max: 2000000000000 }),
          duration: fc.integer({ min: 1, max: 120 }),
          status: fc.constant('active' as const),
        }),
        sleepStateArb,
        (activePomodoro, sleepState) => {
          const expiredUnblock = { active: true, endTime: Date.now() - 60_000 };
          const input = buildInput(activePomodoro, false, sleepState, expiredUnblock);
          return evaluateBlockingReason(input) === 'focus';
        }
      ),
      { numRuns: 100 }
    );
  });

  it('inactive temporaryUnblock should NOT override blocking reasons', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          taskId: fc.uuid() as fc.Arbitrary<string | null>,
          taskTitle: fc.string({ minLength: 1, maxLength: 50 }),
          startTime: fc.integer({ min: 1000000000000, max: 2000000000000 }),
          duration: fc.integer({ min: 1, max: 120 }),
          status: fc.constant('active' as const),
        }),
        sleepStateArb,
        (activePomodoro, sleepState) => {
          const inactiveUnblock = { active: false, endTime: Date.now() + 300_000 };
          const input = buildInput(activePomodoro, false, sleepState, inactiveUnblock);
          return evaluateBlockingReason(input) === 'focus';
        }
      ),
      { numRuns: 100 }
    );
  });
});
