/**
 * Property Test: Pomodoro Remaining Time Calculation
 *
 * Feature: ios-mvp, Property 7: Pomodoro Remaining Time Calculation
 * Validates: Requirements 4.2
 *
 * For any active pomodoro with startTime and duration, the calculated
 * remaining time SHALL be non-negative and SHALL decrease monotonically
 * as time passes, reaching 0 when elapsed time equals duration.
 */

import * as fc from 'fast-check';
import {
  calculateRemainingTimeAt,
  calculateProgressAt,
  formatRemainingTime,
  formatPomodoroCount,
  formatFocusMinutes,
  getPomodoroEndTime,
} from '../../src/utils/pomodoro-calculator';
import type { ActivePomodoroData } from '../../src/types';

// =============================================================================
// GENERATORS
// =============================================================================

/**
 * Generator for ActivePomodoroData
 */
const activePomodoroArb = fc.record({
  id: fc.uuid(),
  taskId: fc.uuid(),
  taskTitle: fc.string({ minLength: 1, maxLength: 100 }),
  startTime: fc.integer({ min: 1000000000000, max: 2000000000000 }), // Valid timestamps
  duration: fc.integer({ min: 1, max: 120 }), // 1-120 minutes
  status: fc.constantFrom('active', 'paused') as fc.Arbitrary<'active' | 'paused'>,
});

/**
 * Generator for time offset (milliseconds from start)
 */
const timeOffsetArb = fc.integer({ min: 0, max: 200 * 60 * 1000 }); // 0 to 200 minutes

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Property 7: Pomodoro Remaining Time Calculation', () => {
  /**
   * Feature: ios-mvp, Property 7: Pomodoro Remaining Time Calculation
   * Validates: Requirements 4.2
   */
  it('should always return non-negative remaining time', () => {
    fc.assert(
      fc.property(activePomodoroArb, timeOffsetArb, (pomodoro, offset) => {
        const currentTime = pomodoro.startTime + offset;
        const remaining = calculateRemainingTimeAt(pomodoro, currentTime);
        return remaining >= 0;
      }),
      { numRuns: 100 }
    );
  });

  it('should return 0 when elapsed time exceeds duration', () => {
    fc.assert(
      fc.property(activePomodoroArb, (pomodoro) => {
        // Time well past the end
        const currentTime = pomodoro.startTime + (pomodoro.duration + 10) * 60 * 1000;
        const remaining = calculateRemainingTimeAt(pomodoro, currentTime);
        return remaining === 0;
      }),
      { numRuns: 100 }
    );
  });

  it('should return full duration at start time', () => {
    fc.assert(
      fc.property(activePomodoroArb, (pomodoro) => {
        const remaining = calculateRemainingTimeAt(pomodoro, pomodoro.startTime);
        // Should be approximately duration * 60 seconds (within 1 second due to ceiling)
        const expectedSeconds = pomodoro.duration * 60;
        return remaining === expectedSeconds;
      }),
      { numRuns: 100 }
    );
  });

  it('should decrease monotonically as time passes', () => {
    fc.assert(
      fc.property(
        activePomodoroArb,
        fc.integer({ min: 0, max: 100 * 60 * 1000 }), // offset1
        fc.integer({ min: 1, max: 60 * 1000 }), // additional offset (positive)
        (pomodoro, offset1, additionalOffset) => {
          const time1 = pomodoro.startTime + offset1;
          const time2 = time1 + additionalOffset;

          const remaining1 = calculateRemainingTimeAt(pomodoro, time1);
          const remaining2 = calculateRemainingTimeAt(pomodoro, time2);

          // remaining2 should be <= remaining1 (monotonically decreasing)
          return remaining2 <= remaining1;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reach exactly 0 when elapsed equals duration', () => {
    fc.assert(
      fc.property(activePomodoroArb, (pomodoro) => {
        const endTime = pomodoro.startTime + pomodoro.duration * 60 * 1000;
        const remaining = calculateRemainingTimeAt(pomodoro, endTime);
        return remaining === 0;
      }),
      { numRuns: 100 }
    );
  });
});

describe('Property 8: Pomodoro Count Display Format', () => {
  /**
   * Feature: ios-mvp, Property 8: Pomodoro Count Display Format
   * Validates: Requirements 4.4
   */
  it('should format as "{C}/{D} 番茄" for non-negative integers', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 20 }), // completed
        fc.integer({ min: 1, max: 20 }), // dailyCap
        (completed, dailyCap) => {
          const formatted = formatPomodoroCount(completed, dailyCap);
          const expected = `${completed}/${dailyCap} 番茄`;
          return formatted === expected;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Progress Calculation Properties', () => {
  it('should return progress between 0 and 100', () => {
    fc.assert(
      fc.property(activePomodoroArb, timeOffsetArb, (pomodoro, offset) => {
        const currentTime = pomodoro.startTime + offset;
        const progress = calculateProgressAt(pomodoro, currentTime);
        return progress >= 0 && progress <= 100;
      }),
      { numRuns: 100 }
    );
  });

  it('should return 0 at start time', () => {
    fc.assert(
      fc.property(activePomodoroArb, (pomodoro) => {
        const progress = calculateProgressAt(pomodoro, pomodoro.startTime);
        return progress === 0;
      }),
      { numRuns: 100 }
    );
  });

  it('should return 100 at or after end time', () => {
    fc.assert(
      fc.property(activePomodoroArb, (pomodoro) => {
        const endTime = pomodoro.startTime + pomodoro.duration * 60 * 1000;
        const progress = calculateProgressAt(pomodoro, endTime);
        return progress === 100;
      }),
      { numRuns: 100 }
    );
  });

  it('should increase monotonically as time passes', () => {
    fc.assert(
      fc.property(
        activePomodoroArb,
        fc.integer({ min: 0, max: 100 * 60 * 1000 }),
        fc.integer({ min: 1, max: 60 * 1000 }),
        (pomodoro, offset1, additionalOffset) => {
          const time1 = pomodoro.startTime + offset1;
          const time2 = time1 + additionalOffset;

          const progress1 = calculateProgressAt(pomodoro, time1);
          const progress2 = calculateProgressAt(pomodoro, time2);

          return progress2 >= progress1;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Time Formatting Properties', () => {
  it('should format as MM:SS with leading zeros for values under 100 minutes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5999 }), (seconds) => {
        const formatted = formatRemainingTime(seconds);
        // Should match pattern XX:XX for values under 100 minutes
        return /^\d{2}:\d{2}$/.test(formatted);
      }),
      { numRuns: 100 }
    );
  });

  it('should handle values over 99 minutes correctly', () => {
    fc.assert(
      fc.property(fc.integer({ min: 6000, max: 7200 }), (seconds) => {
        const formatted = formatRemainingTime(seconds);
        // Should match pattern XXX:XX for values >= 100 minutes
        return /^\d+:\d{2}$/.test(formatted);
      }),
      { numRuns: 100 }
    );
  });

  it('should correctly represent minutes and seconds', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 7200 }), (seconds) => {
        const formatted = formatRemainingTime(seconds);
        const [mins, secs] = formatted.split(':').map(Number);

        const expectedMins = Math.floor(seconds / 60);
        const expectedSecs = seconds % 60;

        return mins === expectedMins && secs === expectedSecs;
      }),
      { numRuns: 100 }
    );
  });

  it('should handle negative input gracefully', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: -1 }), (negativeSeconds) => {
        const formatted = formatRemainingTime(negativeSeconds);
        // Should return "00:00" for negative input
        return formatted === '00:00';
      }),
      { numRuns: 100 }
    );
  });
});

describe('Focus Minutes Formatting Properties', () => {
  it('should format minutes less than 60 as "X分钟"', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 59 }), (minutes) => {
        const formatted = formatFocusMinutes(minutes);
        return formatted === `${minutes}分钟`;
      }),
      { numRuns: 100 }
    );
  });

  it('should format exact hours as "X小时"', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (hours) => {
        const minutes = hours * 60;
        const formatted = formatFocusMinutes(minutes);
        return formatted === `${hours}小时`;
      }),
      { numRuns: 100 }
    );
  });

  it('should format hours with remaining minutes as "X小时Y分钟"', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }), // hours
        fc.integer({ min: 1, max: 59 }), // remaining minutes
        (hours, remainingMins) => {
          const totalMinutes = hours * 60 + remainingMins;
          const formatted = formatFocusMinutes(totalMinutes);
          return formatted === `${hours}小时${remainingMins}分钟`;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('End Time Calculation Properties', () => {
  it('should calculate end time as startTime + duration in ms', () => {
    fc.assert(
      fc.property(activePomodoroArb, (pomodoro) => {
        const endTime = getPomodoroEndTime(pomodoro);
        const expected = pomodoro.startTime + pomodoro.duration * 60 * 1000;
        return endTime === expected;
      }),
      { numRuns: 100 }
    );
  });
});
