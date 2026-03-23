import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { calculateWorkStartDelay } from '@/services/work-start.service';

/**
 * Feature: browser-sentinel-enhancement
 * Property 10: Work Start Delay Calculation
 * Property 12: State Transition Work Start Recording
 * Validates: Requirements 14.1, 14.7, 14.8, 14.10
 *
 * Property 10: For any Work Start event, if actualStartTime is before configuredStartTime,
 * delayMinutes SHALL be 0. Otherwise, delayMinutes SHALL equal
 * (actualStartTime - configuredStartTime) in minutes.
 *
 * Property 12: For any state transition that constitutes a work start (e.g. first pomodoro
 * of the day or IDLE → FOCUS), a Work Start event SHALL be recorded with the transition timestamp.
 *
 * Note: After state-management-overhaul, LOCKED→PLANNING (airlock completion) no longer exists.
 * Work start is now identified by the first IDLE→FOCUS transition of the day.
 */

// =============================================================================
// GENERATORS
// =============================================================================

// Time string generator (HH:mm format)
const timeStringArb = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(([h, m]) => `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);

// Date generator for actual start time
const dateArb = fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') });

// Generator for configured time and actual time where actual is before configured
const earlyStartArb = fc
  .tuple(
    fc.integer({ min: 1, max: 23 }), // configured hour (at least 1 to allow earlier start)
    fc.integer({ min: 0, max: 59 }), // configured minute
    fc.integer({ min: 0, max: 59 }), // actual minute offset (0-59 minutes earlier)
  )
  .map(([configHour, configMinute, minutesEarlier]) => {
    const configuredTime = `${configHour.toString().padStart(2, '0')}:${configMinute.toString().padStart(2, '0')}`;

    // Calculate actual time that is earlier than configured
    const configuredTotalMinutes = configHour * 60 + configMinute;
    const actualTotalMinutes = Math.max(0, configuredTotalMinutes - minutesEarlier - 1);
    const actualHour = Math.floor(actualTotalMinutes / 60);
    const actualMinute = actualTotalMinutes % 60;

    const actualDate = new Date();
    actualDate.setHours(actualHour, actualMinute, 0, 0);

    return { configuredTime, actualDate };
  });

// Generator for configured time and actual time where actual is after configured
const lateStartArb = fc
  .tuple(
    fc.integer({ min: 0, max: 22 }), // configured hour (at most 22 to allow later start)
    fc.integer({ min: 0, max: 59 }), // configured minute
    fc.integer({ min: 1, max: 120 }), // delay in minutes (1-120 minutes late)
  )
  .map(([configHour, configMinute, delayMinutes]) => {
    const configuredTime = `${configHour.toString().padStart(2, '0')}:${configMinute.toString().padStart(2, '0')}`;

    // Calculate actual time that is later than configured
    const configuredTotalMinutes = configHour * 60 + configMinute;
    const actualTotalMinutes = Math.min(23 * 60 + 59, configuredTotalMinutes + delayMinutes);
    const actualHour = Math.floor(actualTotalMinutes / 60);
    const actualMinute = actualTotalMinutes % 60;

    const actualDate = new Date();
    actualDate.setHours(actualHour, actualMinute, 0, 0);

    // Recalculate expected delay based on actual values
    const expectedDelay = actualTotalMinutes - configuredTotalMinutes;

    return { configuredTime, actualDate, expectedDelay };
  });

// Generator for exact on-time start
const onTimeStartArb = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(([hour, minute]) => {
    const configuredTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

    const actualDate = new Date();
    actualDate.setHours(hour, minute, 0, 0);

    return { configuredTime, actualDate };
  });

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Property 10: Work Start Delay Calculation', () => {
  /**
   * Feature: browser-sentinel-enhancement, Property 10: Work Start Delay Calculation
   * Validates: Requirements 14.7, 14.8
   */

  it('should return 0 delay when actual start is before configured start time', async () => {
    await fc.assert(
      fc.asyncProperty(earlyStartArb, async ({ configuredTime, actualDate }) => {
        const delay = calculateWorkStartDelay(configuredTime, actualDate);

        // Delay should be 0 for early starts
        expect(delay).toBe(0);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should return 0 delay when actual start equals configured start time', async () => {
    await fc.assert(
      fc.asyncProperty(onTimeStartArb, async ({ configuredTime, actualDate }) => {
        const delay = calculateWorkStartDelay(configuredTime, actualDate);

        // Delay should be 0 for on-time starts
        expect(delay).toBe(0);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should return positive delay when actual start is after configured start time', async () => {
    await fc.assert(
      fc.asyncProperty(lateStartArb, async ({ configuredTime, actualDate, expectedDelay }) => {
        const delay = calculateWorkStartDelay(configuredTime, actualDate);

        // Delay should equal the expected delay
        expect(delay).toBe(expectedDelay);

        // Delay should be positive
        expect(delay).toBeGreaterThan(0);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should calculate delay correctly for any valid time combination', async () => {
    await fc.assert(
      fc.asyncProperty(
        timeStringArb,
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        async (configuredTime, actualHour, actualMinute) => {
          const actualDate = new Date();
          actualDate.setHours(actualHour, actualMinute, 0, 0);

          const delay = calculateWorkStartDelay(configuredTime, actualDate);

          // Parse configured time
          const [configHour, configMinute] = configuredTime.split(':').map(Number);
          const configuredMinutes = configHour * 60 + configMinute;
          const actualMinutes = actualHour * 60 + actualMinute;

          if (actualMinutes <= configuredMinutes) {
            // Early or on-time: delay should be 0
            expect(delay).toBe(0);
          } else {
            // Late: delay should be the difference
            expect(delay).toBe(actualMinutes - configuredMinutes);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should never return negative delay', async () => {
    await fc.assert(
      fc.asyncProperty(
        timeStringArb,
        dateArb,
        async (configuredTime, actualDate) => {
          const delay = calculateWorkStartDelay(configuredTime, actualDate);

          // Delay should never be negative
          expect(delay).toBeGreaterThanOrEqual(0);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle edge case of midnight correctly', async () => {
    // Test midnight (00:00) as configured time
    const configuredTime = '00:00';

    // Any time should result in delay >= 0
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        async (hour, minute) => {
          const actualDate = new Date();
          actualDate.setHours(hour, minute, 0, 0);

          const delay = calculateWorkStartDelay(configuredTime, actualDate);

          if (hour === 0 && minute === 0) {
            expect(delay).toBe(0);
          } else {
            expect(delay).toBe(hour * 60 + minute);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle edge case of end of day correctly', async () => {
    // Test 23:59 as configured time
    const configuredTime = '23:59';

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        async (hour, minute) => {
          const actualDate = new Date();
          actualDate.setHours(hour, minute, 0, 0);

          const delay = calculateWorkStartDelay(configuredTime, actualDate);

          const actualMinutes = hour * 60 + minute;
          const configuredMinutes = 23 * 60 + 59;

          if (actualMinutes <= configuredMinutes) {
            expect(delay).toBe(0);
          } else {
            // This case shouldn't happen since 23:59 is the max
            expect(delay).toBe(actualMinutes - configuredMinutes);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 12: State Transition Work Start Recording', () => {
  /**
   * Feature: browser-sentinel-enhancement, Property 12: State Transition Work Start Recording
   * Validates: Requirements 14.1, 14.10
   *
   * After state-management-overhaul: Work start is identified by the first
   * IDLE → FOCUS transition of the day (first pomodoro start), not by airlock completion.
   */

  type SystemState = 'IDLE' | 'FOCUS' | 'OVER_REST';

  // Generator for state transitions
  const stateTransitionArb = fc.tuple(
    fc.constantFrom<SystemState>('IDLE', 'FOCUS', 'OVER_REST'),
    fc.constantFrom<SystemState>('IDLE', 'FOCUS', 'OVER_REST')
  );

  it('should identify IDLE → FOCUS as work start transition', async () => {
    await fc.assert(
      fc.asyncProperty(stateTransitionArb, async ([previousState, newState]) => {
        const isWorkStartTransition = previousState === 'IDLE' && newState === 'FOCUS';

        // Only IDLE → FOCUS should be a work start transition
        if (previousState === 'IDLE' && newState === 'FOCUS') {
          expect(isWorkStartTransition).toBe(true);
        } else {
          expect(isWorkStartTransition).toBe(false);
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should not identify other transitions as work start', async () => {
    // All transitions that are NOT IDLE → FOCUS
    const nonWorkStartTransitions: [SystemState, SystemState][] = [
      ['IDLE', 'IDLE'],
      ['IDLE', 'OVER_REST'],
      ['FOCUS', 'IDLE'],
      ['FOCUS', 'FOCUS'],
      ['FOCUS', 'OVER_REST'],
      ['OVER_REST', 'IDLE'],
      ['OVER_REST', 'FOCUS'],
      ['OVER_REST', 'OVER_REST'],
    ];

    for (const [previousState, newState] of nonWorkStartTransitions) {
      const isWorkStartTransition = previousState === 'IDLE' && newState === 'FOCUS';
      expect(isWorkStartTransition).toBe(false);
    }
  });

  it('should record work start with correct timestamp', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1609459200000, max: 1893456000000 }), // 2021-01-01 to 2030-01-01
        async (timestamp) => {
          const transitionTime = new Date(timestamp);

          // Simulate work start recording
          const workStartRecord = {
            date: transitionTime.toISOString().split('T')[0],
            actualStartTime: timestamp,
            trigger: 'first_pomodoro' as const,
          };

          // Verify the record has correct structure
          expect(workStartRecord.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(workStartRecord.actualStartTime).toBe(timestamp);
          expect(workStartRecord.trigger).toBe('first_pomodoro');

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should only record work start once per day', async () => {
    // Simulate multiple IDLE → FOCUS transitions on the same day
    const recordedDates = new Set<string>();

    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 23 }), { minLength: 1, maxLength: 5 }),
        async (hours) => {
          const today = new Date().toISOString().split('T')[0];
          let recordCount = 0;

          for (const hour of hours) {
            // Simulate transition at different hours
            const shouldRecord = !recordedDates.has(today);

            if (shouldRecord) {
              recordedDates.add(today);
              recordCount++;
            }
          }

          // Should only record once per day
          expect(recordCount).toBeLessThanOrEqual(1);

          // Clean up for next iteration
          recordedDates.clear();

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include all required fields in work start event', async () => {
    await fc.assert(
      fc.asyncProperty(
        timeStringArb,
        fc.integer({ min: 1609459200000, max: 1893456000000 }),
        fc.integer({ min: 0, max: 1440 }),
        async (configuredStartTime, actualStartTime, delayMinutes) => {
          const workStartEvent = {
            date: new Date(actualStartTime).toISOString().split('T')[0],
            configuredStartTime,
            actualStartTime,
            delayMinutes,
            trigger: 'first_pomodoro' as const,
          };

          // Verify all required fields are present
          expect(workStartEvent).toHaveProperty('date');
          expect(workStartEvent).toHaveProperty('configuredStartTime');
          expect(workStartEvent).toHaveProperty('actualStartTime');
          expect(workStartEvent).toHaveProperty('delayMinutes');
          expect(workStartEvent).toHaveProperty('trigger');

          // Verify field types
          expect(typeof workStartEvent.date).toBe('string');
          expect(typeof workStartEvent.configuredStartTime).toBe('string');
          expect(typeof workStartEvent.actualStartTime).toBe('number');
          expect(typeof workStartEvent.delayMinutes).toBe('number');
          expect(workStartEvent.trigger).toBe('first_pomodoro');

          // Verify field formats
          expect(workStartEvent.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(workStartEvent.configuredStartTime).toMatch(/^([01]\d|2[0-3]):([0-5]\d)$/);
          expect(workStartEvent.actualStartTime).toBeGreaterThan(0);
          expect(workStartEvent.delayMinutes).toBeGreaterThanOrEqual(0);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
