import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { calculatePressureLevel, PressureLevel } from '@/services/progress-calculation.service';

/**
 * Feature: ad-hoc-focus-session
 * Property 7: Pressure Level Calculation Consistency
 * Validates: Requirements 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7
 *
 * For any daily progress calculation:
 * - If remainingPomodoros <= 0, pressureLevel must be 'on_track'
 * - If remainingPomodoros > maxPossiblePomodoros, pressureLevel must be 'critical'
 * - pressureLevel must be monotonically increasing as the ratio of remainingPomodoros/maxPossiblePomodoros increases
 */

// Pressure level ordering for monotonicity check
const PRESSURE_LEVEL_ORDER: Record<PressureLevel, number> = {
  on_track: 0,
  moderate: 1,
  high: 2,
  critical: 3,
};

describe('Property 7: Pressure Level Calculation Consistency', () => {
  /**
   * Property: When remainingPomodoros <= 0, pressureLevel must be 'on_track'
   * Validates: Requirements 19.1, 19.3
   */
  it('should return on_track when remainingPomodoros is zero or negative', () => {
    fc.assert(
      fc.property(
        // Generate remainingPomodoros <= 0
        fc.integer({ min: -10, max: 0 }),
        // Generate maxPossiblePomodoros (any positive value)
        fc.integer({ min: 0, max: 20 }),
        // Generate completionPercentage (0-100)
        fc.integer({ min: 0, max: 100 }),
        (remainingPomodoros, maxPossiblePomodoros, completionPercentage) => {
          const result = calculatePressureLevel(
            remainingPomodoros,
            maxPossiblePomodoros,
            completionPercentage
          );

          // Invariant: goal already achieved means on_track
          expect(result).toBe('on_track');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: When remainingPomodoros > maxPossiblePomodoros, pressureLevel must be 'critical'
   * Validates: Requirements 19.1, 19.6
   */
  it('should return critical when remainingPomodoros exceeds maxPossiblePomodoros', () => {
    fc.assert(
      fc.property(
        // Generate maxPossiblePomodoros (0 or positive)
        fc.integer({ min: 0, max: 15 }),
        // Generate excess (how much remaining exceeds max)
        fc.integer({ min: 1, max: 10 }),
        // Generate completionPercentage (0-100)
        fc.integer({ min: 0, max: 100 }),
        (maxPossiblePomodoros, excess, completionPercentage) => {
          const remainingPomodoros = maxPossiblePomodoros + excess;

          const result = calculatePressureLevel(
            remainingPomodoros,
            maxPossiblePomodoros,
            completionPercentage
          );

          // Invariant: impossible to complete means critical
          expect(result).toBe('critical');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: When maxPossiblePomodoros is 0 and remainingPomodoros > 0, pressureLevel must be 'critical'
   * Validates: Requirements 19.1, 19.6
   */
  it('should return critical when no time remaining but pomodoros still needed', () => {
    fc.assert(
      fc.property(
        // Generate remainingPomodoros > 0
        fc.integer({ min: 1, max: 20 }),
        // Generate completionPercentage (0-100)
        fc.integer({ min: 0, max: 100 }),
        (remainingPomodoros, completionPercentage) => {
          const result = calculatePressureLevel(
            remainingPomodoros,
            0, // No time remaining
            completionPercentage
          );

          // Invariant: no time left with work remaining means critical
          expect(result).toBe('critical');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Pressure level is monotonically increasing as ratio increases
   * Validates: Requirements 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7
   */
  it('should have monotonically increasing pressure as ratio increases', () => {
    fc.assert(
      fc.property(
        // Generate maxPossiblePomodoros (positive to avoid division issues)
        fc.integer({ min: 1, max: 20 }),
        // Generate two different ratios (0 to 1.5 to cover all cases)
        fc.float({ min: 0, max: 1.5, noNaN: true }),
        fc.float({ min: 0, max: 1.5, noNaN: true }),
        // Generate completionPercentage (0-100)
        fc.integer({ min: 0, max: 100 }),
        (maxPossiblePomodoros, ratio1, ratio2, completionPercentage) => {
          const remaining1 = Math.round(ratio1 * maxPossiblePomodoros);
          const remaining2 = Math.round(ratio2 * maxPossiblePomodoros);

          const level1 = calculatePressureLevel(
            remaining1,
            maxPossiblePomodoros,
            completionPercentage
          );
          const level2 = calculatePressureLevel(
            remaining2,
            maxPossiblePomodoros,
            completionPercentage
          );

          // Invariant: if ratio1 <= ratio2, then level1 <= level2 (monotonically increasing)
          if (remaining1 <= remaining2) {
            expect(PRESSURE_LEVEL_ORDER[level1]).toBeLessThanOrEqual(
              PRESSURE_LEVEL_ORDER[level2]
            );
          } else {
            expect(PRESSURE_LEVEL_ORDER[level1]).toBeGreaterThanOrEqual(
              PRESSURE_LEVEL_ORDER[level2]
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Pressure level thresholds are correctly applied
   * Validates: Requirements 19.3, 19.4, 19.5, 19.6
   * 
   * Thresholds based on implementation:
   * - on_track: ratio <= 0.5
   * - moderate: 0.5 < ratio <= 0.75
   * - high: 0.75 < ratio <= 1.0
   * - critical: ratio > 1.0
   */
  it('should apply correct thresholds for pressure levels', () => {
    fc.assert(
      fc.property(
        // Generate maxPossiblePomodoros large enough to avoid rounding issues
        fc.integer({ min: 10, max: 100 }),
        // Generate completionPercentage (0-100)
        fc.integer({ min: 0, max: 100 }),
        (maxPossiblePomodoros, completionPercentage) => {
          // Test on_track (ratio = 0.25, well within <= 0.5)
          const onTrackRemaining = Math.round(0.25 * maxPossiblePomodoros);
          if (onTrackRemaining > 0) {
            const onTrackLevel = calculatePressureLevel(
              onTrackRemaining,
              maxPossiblePomodoros,
              completionPercentage
            );
            expect(onTrackLevel).toBe('on_track');
          }

          // Test moderate (ratio = 0.65, well within 0.5 < ratio <= 0.75)
          const moderateRemaining = Math.round(0.65 * maxPossiblePomodoros);
          if (moderateRemaining > 0) {
            const actualRatio = moderateRemaining / maxPossiblePomodoros;
            // Only test if the actual ratio falls in moderate range
            if (actualRatio > 0.5 && actualRatio <= 0.75) {
              const moderateLevel = calculatePressureLevel(
                moderateRemaining,
                maxPossiblePomodoros,
                completionPercentage
              );
              expect(moderateLevel).toBe('moderate');
            }
          }

          // Test high (ratio = 0.85, well within 0.75 < ratio <= 1.0)
          const highRemaining = Math.round(0.85 * maxPossiblePomodoros);
          if (highRemaining > 0) {
            const actualRatio = highRemaining / maxPossiblePomodoros;
            // Only test if the actual ratio falls in high range
            if (actualRatio > 0.75 && actualRatio <= 1.0) {
              const highLevel = calculatePressureLevel(
                highRemaining,
                maxPossiblePomodoros,
                completionPercentage
              );
              expect(highLevel).toBe('high');
            }
          }

          // Test critical (ratio = 1.5, well above 1.0)
          const criticalRemaining = Math.round(1.5 * maxPossiblePomodoros);
          const criticalLevel = calculatePressureLevel(
            criticalRemaining,
            maxPossiblePomodoros,
            completionPercentage
          );
          expect(criticalLevel).toBe('critical');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Pressure level is always one of the valid values
   * Validates: Requirements 19.1
   */
  it('should always return a valid pressure level', () => {
    fc.assert(
      fc.property(
        // Generate any remainingPomodoros
        fc.integer({ min: -10, max: 30 }),
        // Generate any maxPossiblePomodoros
        fc.integer({ min: 0, max: 20 }),
        // Generate completionPercentage (0-100)
        fc.integer({ min: 0, max: 100 }),
        (remainingPomodoros, maxPossiblePomodoros, completionPercentage) => {
          const result = calculatePressureLevel(
            remainingPomodoros,
            maxPossiblePomodoros,
            completionPercentage
          );

          // Invariant: result is always a valid pressure level
          expect(['on_track', 'moderate', 'high', 'critical']).toContain(result);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Boundary conditions at exact thresholds
   * Validates: Requirements 19.3, 19.4, 19.5, 19.6
   */
  it('should handle exact threshold boundaries correctly', () => {
    fc.assert(
      fc.property(
        // Generate maxPossiblePomodoros (use values that divide evenly)
        fc.integer({ min: 4, max: 20 }).map(n => n * 4), // Multiples of 4 for clean division
        // Generate completionPercentage (0-100)
        fc.integer({ min: 0, max: 100 }),
        (maxPossiblePomodoros, completionPercentage) => {
          // Test exact 50% threshold (boundary between on_track and moderate)
          const halfRemaining = maxPossiblePomodoros / 2;
          const halfLevel = calculatePressureLevel(
            halfRemaining,
            maxPossiblePomodoros,
            completionPercentage
          );
          // At exactly 50%, should be on_track (ratio <= 0.5)
          expect(halfLevel).toBe('on_track');

          // Test exact 75% threshold (boundary between moderate and high)
          const threeQuarterRemaining = (maxPossiblePomodoros * 3) / 4;
          const threeQuarterLevel = calculatePressureLevel(
            threeQuarterRemaining,
            maxPossiblePomodoros,
            completionPercentage
          );
          // At exactly 75%, should be moderate (ratio <= 0.75)
          expect(threeQuarterLevel).toBe('moderate');

          // Test exact 100% threshold (boundary between high and critical)
          const fullRemaining = maxPossiblePomodoros;
          const fullLevel = calculatePressureLevel(
            fullRemaining,
            maxPossiblePomodoros,
            completionPercentage
          );
          // At exactly 100%, should be high (ratio <= 1.0)
          expect(fullLevel).toBe('high');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: completionPercentage does not affect pressure level calculation
   * (based on current implementation which only uses remainingPomodoros and maxPossiblePomodoros)
   * Validates: Requirements 19.2
   */
  it('should calculate pressure level independently of completionPercentage', () => {
    fc.assert(
      fc.property(
        // Generate remainingPomodoros
        fc.integer({ min: 1, max: 15 }),
        // Generate maxPossiblePomodoros
        fc.integer({ min: 1, max: 20 }),
        // Generate two different completionPercentages
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        (remainingPomodoros, maxPossiblePomodoros, percentage1, percentage2) => {
          const level1 = calculatePressureLevel(
            remainingPomodoros,
            maxPossiblePomodoros,
            percentage1
          );
          const level2 = calculatePressureLevel(
            remainingPomodoros,
            maxPossiblePomodoros,
            percentage2
          );

          // Invariant: same remaining/max should give same level regardless of percentage
          expect(level1).toBe(level2);
        }
      ),
      { numRuns: 100 }
    );
  });
});
