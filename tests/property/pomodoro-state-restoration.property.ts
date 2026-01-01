import fc from 'fast-check';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateRemainingSeconds } from '@/lib/pomodoro-cache';

/**
 * Feature: pomodoro-enhancement
 * Property 2: State Restoration Accuracy
 * Validates: Requirements 1.2, 1.3
 *
 * For any running pomodoro session with a known startTime and duration,
 * restoring the state at any point in time SHALL calculate the remaining
 * seconds as `max(0, (startTime + duration * 60 * 1000 - currentTime) / 1000)`.
 */

describe('Property 2: State Restoration Accuracy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Property 2.1: Remaining seconds calculation is accurate for any valid session
   * 
   * For any startTime and duration, the calculateRemainingSeconds function
   * should return the correct remaining seconds based on the formula:
   * max(0, floor((startTime + duration * 60 * 1000 - currentTime) / 1000))
   */
  it('should calculate remaining seconds accurately for any valid session', () => {
    fc.assert(
      fc.property(
        // Generate a start time within the last hour (realistic scenario)
        fc.integer({ min: 0, max: 60 * 60 * 1000 }).map(offset => {
          const now = Date.now();
          return new Date(now - offset);
        }),
        // Generate duration between 1 and 120 minutes (valid pomodoro range)
        fc.integer({ min: 1, max: 120 }),
        // Generate elapsed time offset (0 to 2x duration to test both running and expired)
        fc.integer({ min: 0, max: 240 * 60 * 1000 }),
        (startTime, duration, elapsedOffset) => {
          // Set the current time to startTime + elapsedOffset
          const currentTime = startTime.getTime() + elapsedOffset;
          vi.setSystemTime(currentTime);

          // Calculate expected remaining seconds using the formula from design doc
          const endTime = startTime.getTime() + duration * 60 * 1000;
          const expectedRemaining = Math.max(0, Math.floor((endTime - currentTime) / 1000));

          // Calculate actual remaining seconds using the function
          const actualRemaining = calculateRemainingSeconds(startTime, duration);

          // Verify the calculation matches
          expect(actualRemaining).toBe(expectedRemaining);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.2: Remaining seconds is always non-negative
   * 
   * For any startTime and duration, the remaining seconds should never be negative,
   * even when the session has expired.
   */
  it('should always return non-negative remaining seconds', () => {
    fc.assert(
      fc.property(
        // Generate any start time
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
        // Generate any duration
        fc.integer({ min: 1, max: 120 }),
        // Generate any current time (including far future)
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
        (startTime, duration, currentTime) => {
          vi.setSystemTime(currentTime);

          const remaining = calculateRemainingSeconds(startTime, duration);

          // Remaining should always be >= 0
          expect(remaining).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.3: Remaining seconds equals duration * 60 at start time
   * 
   * When currentTime equals startTime, remaining seconds should equal duration * 60.
   */
  it('should return full duration in seconds when at start time', () => {
    fc.assert(
      fc.property(
        // Generate any start time
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
        // Generate any duration
        fc.integer({ min: 1, max: 120 }),
        (startTime, duration) => {
          // Set current time to exactly the start time
          vi.setSystemTime(startTime);

          const remaining = calculateRemainingSeconds(startTime, duration);

          // At start time, remaining should be full duration in seconds
          expect(remaining).toBe(duration * 60);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.4: Remaining seconds is zero when session has expired
   * 
   * When currentTime >= startTime + duration * 60 * 1000, remaining should be 0.
   */
  it('should return zero when session has expired', () => {
    fc.assert(
      fc.property(
        // Generate any start time
        fc.date({ min: new Date('2020-01-01'), max: new Date('2025-01-01') }),
        // Generate any duration
        fc.integer({ min: 1, max: 120 }),
        // Generate additional time past expiration (0 to 1 hour)
        fc.integer({ min: 0, max: 60 * 60 * 1000 }),
        (startTime, duration, additionalTime) => {
          // Set current time to after the session end
          const endTime = startTime.getTime() + duration * 60 * 1000;
          vi.setSystemTime(endTime + additionalTime);

          const remaining = calculateRemainingSeconds(startTime, duration);

          // After expiration, remaining should be 0
          expect(remaining).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.5: Remaining seconds decreases monotonically with time
   * 
   * For any two times t1 < t2 during a session, remaining(t1) >= remaining(t2).
   */
  it('should decrease monotonically as time progresses', () => {
    fc.assert(
      fc.property(
        // Generate any start time
        fc.date({ min: new Date('2020-01-01'), max: new Date('2025-01-01') }),
        // Generate any duration
        fc.integer({ min: 1, max: 120 }),
        // Generate two time offsets where t1 < t2
        fc.integer({ min: 0, max: 120 * 60 * 1000 }),
        fc.integer({ min: 1, max: 120 * 60 * 1000 }),
        (startTime, duration, offset1, additionalOffset) => {
          const t1 = startTime.getTime() + offset1;
          const t2 = t1 + additionalOffset;

          // Calculate remaining at t1
          vi.setSystemTime(t1);
          const remaining1 = calculateRemainingSeconds(startTime, duration);

          // Calculate remaining at t2
          vi.setSystemTime(t2);
          const remaining2 = calculateRemainingSeconds(startTime, duration);

          // remaining at t1 should be >= remaining at t2
          expect(remaining1).toBeGreaterThanOrEqual(remaining2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.6: Works with both Date objects and ISO strings
   * 
   * The function should produce identical results whether startTime is
   * provided as a Date object or an ISO string.
   */
  it('should produce identical results for Date and ISO string inputs', () => {
    fc.assert(
      fc.property(
        // Generate any start time
        fc.date({ min: new Date('2020-01-01'), max: new Date('2025-01-01') }),
        // Generate any duration
        fc.integer({ min: 1, max: 120 }),
        (startTime, duration) => {
          const isoString = startTime.toISOString();

          // Calculate with Date object
          const remainingFromDate = calculateRemainingSeconds(startTime, duration);

          // Calculate with ISO string
          const remainingFromString = calculateRemainingSeconds(isoString, duration);

          // Results should be identical
          expect(remainingFromDate).toBe(remainingFromString);
        }
      ),
      { numRuns: 100 }
    );
  });
});
