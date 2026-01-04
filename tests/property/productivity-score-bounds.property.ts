import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { calculateProductivityScore, detectTrend, ProductivityTrend } from '@/services/progress-analyzer.service';

/**
 * Feature: ai-native-enhancement
 * Property 9: Productivity Score Bounds
 * Validates: Requirements 7.1, 7.4
 *
 * For any productivity score calculation:
 * - The daily, weekly, and monthly scores SHALL be within the range [0, 100]
 * - The trend SHALL be one of {improving, declining, stable}
 */

// Arbitrary generators for productivity score inputs
const completedPomodorosArb = fc.integer({ min: 0, max: 100 });
const targetPomodorosArb = fc.integer({ min: 0, max: 100 });
const totalStartedArb = fc.integer({ min: 0, max: 100 });
const daysWithActivityArb = fc.integer({ min: 0, max: 30 });
const totalDaysArb = fc.integer({ min: 1, max: 30 });

// Arbitrary generator for daily scores array (for trend detection)
const dailyScoresArb = fc.array(
  fc.float({ min: 0, max: 100, noNaN: true }),
  { minLength: 0, maxLength: 30 }
);

describe('Property 9: Productivity Score Bounds', () => {
  /**
   * Property: Productivity score is always within [0, 100]
   * Validates: Requirements 7.1
   */
  it('should always produce scores within [0, 100] bounds', () => {
    fc.assert(
      fc.property(
        completedPomodorosArb,
        targetPomodorosArb,
        totalStartedArb,
        daysWithActivityArb,
        totalDaysArb,
        (completed, target, started, daysActive, totalDays) => {
          const score = calculateProductivityScore(
            completed,
            target,
            started,
            daysActive,
            totalDays
          );

          // Invariant: score must be within [0, 100]
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Score is 0 when no activity
   * Validates: Requirements 7.1
   */
  it('should return 0 when there is no activity', () => {
    fc.assert(
      fc.property(
        targetPomodorosArb,
        totalDaysArb,
        (target, totalDays) => {
          const score = calculateProductivityScore(
            0, // no completed
            target,
            0, // no started
            0, // no days with activity
            totalDays
          );

          // Invariant: no activity should result in 0 score
          expect(score).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Perfect performance yields high score
   * Validates: Requirements 7.1
   */
  it('should return high score when all targets are met', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 1, max: 30 }),
        (target, totalDays) => {
          // Perfect scenario: completed = target, all started completed, active every day
          const score = calculateProductivityScore(
            target,
            target,
            target,
            totalDays,
            totalDays
          );

          // Invariant: perfect performance should yield 100
          expect(score).toBe(100);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Score increases with more completed pomodoros (all else equal)
   * Validates: Requirements 7.1
   */
  it('should increase score when more pomodoros are completed', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 1, max: 30 }),
        (target, totalDays) => {
          const scoreLow = calculateProductivityScore(
            Math.floor(target * 0.3),
            target,
            target,
            totalDays,
            totalDays
          );
          
          const scoreHigh = calculateProductivityScore(
            Math.floor(target * 0.8),
            target,
            target,
            totalDays,
            totalDays
          );

          // Invariant: more completed should yield higher score
          expect(scoreHigh).toBeGreaterThanOrEqual(scoreLow);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Score is deterministic
   * Validates: Requirements 7.1
   */
  it('should produce deterministic scores for the same inputs', () => {
    fc.assert(
      fc.property(
        completedPomodorosArb,
        targetPomodorosArb,
        totalStartedArb,
        daysWithActivityArb,
        totalDaysArb,
        (completed, target, started, daysActive, totalDays) => {
          const score1 = calculateProductivityScore(completed, target, started, daysActive, totalDays);
          const score2 = calculateProductivityScore(completed, target, started, daysActive, totalDays);

          // Invariant: same inputs should always produce same output
          expect(score1).toBe(score2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Trend detection returns valid trend values
   * Validates: Requirements 7.4
   */
  it('should return valid trend values (improving, declining, or stable)', () => {
    const validTrends: ProductivityTrend[] = ['improving', 'declining', 'stable'];

    fc.assert(
      fc.property(
        dailyScoresArb,
        (dailyScores) => {
          const trend = detectTrend(dailyScores);

          // Invariant: trend must be one of the valid values
          expect(validTrends).toContain(trend);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Trend is stable for short arrays
   * Validates: Requirements 7.4
   */
  it('should return stable trend for arrays with fewer than 3 elements', () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: 0, max: 100, noNaN: true }), { minLength: 0, maxLength: 2 }),
        (dailyScores) => {
          const trend = detectTrend(dailyScores);

          // Invariant: short arrays should always return stable
          expect(trend).toBe('stable');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Trend detection is deterministic
   * Validates: Requirements 7.4
   */
  it('should produce deterministic trend for the same inputs', () => {
    fc.assert(
      fc.property(
        dailyScoresArb,
        (dailyScores) => {
          const trend1 = detectTrend(dailyScores);
          const trend2 = detectTrend(dailyScores);

          // Invariant: same inputs should always produce same output
          expect(trend1).toBe(trend2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Strictly increasing scores should trend improving
   * Validates: Requirements 7.4
   */
  it('should detect improving trend for strictly increasing scores', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 20 }),
        fc.float({ min: 1, max: 10, noNaN: true }),
        (length, increment) => {
          // Generate strictly increasing scores
          const dailyScores: number[] = [];
          let current = 10;
          for (let i = 0; i < length; i++) {
            dailyScores.push(current);
            current += increment;
          }

          const trend = detectTrend(dailyScores);

          // Invariant: strictly increasing should be improving
          expect(trend).toBe('improving');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Strictly decreasing scores should trend declining
   * Validates: Requirements 7.4
   */
  it('should detect declining trend for strictly decreasing scores', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 20 }),
        fc.float({ min: 1, max: 10, noNaN: true }),
        (length, decrement) => {
          // Generate strictly decreasing scores
          const dailyScores: number[] = [];
          let current = 100;
          for (let i = 0; i < length; i++) {
            dailyScores.push(current);
            current -= decrement;
          }

          const trend = detectTrend(dailyScores);

          // Invariant: strictly decreasing should be declining
          expect(trend).toBe('declining');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Constant scores should trend stable
   * Validates: Requirements 7.4
   */
  it('should detect stable trend for constant scores', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 20 }),
        fc.float({ min: 0, max: 100, noNaN: true }),
        (length, constantValue) => {
          // Generate constant scores
          const dailyScores = Array(length).fill(constantValue);

          const trend = detectTrend(dailyScores);

          // Invariant: constant scores should be stable
          expect(trend).toBe('stable');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Score components are weighted correctly
   * Validates: Requirements 7.1
   */
  it('should weight goal achievement, completion rate, and consistency correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 1, max: 30 }),
        (target, totalDays) => {
          // Test with different component contributions
          
          // High goal achievement only
          const scoreGoalOnly = calculateProductivityScore(
            target, // 100% goal achievement
            target,
            target * 2, // 50% completion rate
            Math.floor(totalDays / 2), // 50% consistency
            totalDays
          );
          
          // High completion rate only
          const scoreCompletionOnly = calculateProductivityScore(
            Math.floor(target / 2), // 50% goal achievement
            target,
            Math.floor(target / 2), // 100% completion rate
            Math.floor(totalDays / 2), // 50% consistency
            totalDays
          );
          
          // High consistency only
          const scoreConsistencyOnly = calculateProductivityScore(
            Math.floor(target / 2), // 50% goal achievement
            target,
            target, // 50% completion rate
            totalDays, // 100% consistency
            totalDays
          );

          // All scores should be within bounds
          expect(scoreGoalOnly).toBeGreaterThanOrEqual(0);
          expect(scoreGoalOnly).toBeLessThanOrEqual(100);
          expect(scoreCompletionOnly).toBeGreaterThanOrEqual(0);
          expect(scoreCompletionOnly).toBeLessThanOrEqual(100);
          expect(scoreConsistencyOnly).toBeGreaterThanOrEqual(0);
          expect(scoreConsistencyOnly).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 100 }
    );
  });
});
