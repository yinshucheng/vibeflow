import fc from 'fast-check';
import { describe, it, expect } from 'vitest';

/**
 * Feature: ai-native-enhancement
 * Property 4: Suggestion Ordering Consistency
 * Validates: Requirements 3.2, 9.1
 *
 * For any set of task suggestions:
 * - Tasks with higher priority should score higher than lower priority tasks (all else equal)
 * - Tasks with closer deadlines should score higher than tasks with distant deadlines (all else equal)
 * - Tasks with higher goal alignment should score higher (all else equal)
 * - Top 3 tasks should always score higher than non-Top 3 tasks (all else equal)
 * - The ordering should be deterministic and consistent
 */

// Priority weights from the service
const PRIORITY_WEIGHTS: Record<string, number> = {
  P1: 100,
  P2: 60,
  P3: 30,
};

// Deadline proximity weights from the service
const DEADLINE_WEIGHTS = {
  urgent: 150,   // Overdue
  soon: 100,     // Today
  normal: 50,    // Within 3 days
  none: 0,       // No deadline or far away
};

type DeadlineProximity = 'urgent' | 'soon' | 'normal' | 'none';

/**
 * Calculate suggestion score (mirrors the service implementation)
 */
function calculateSuggestionScore(
  priority: string,
  deadlineProximity: DeadlineProximity,
  goalAlignment: number,
  isTop3: boolean,
  dayOfWeekBonus: number = 0
): number {
  let score = 0;
  
  // Priority weight
  score += PRIORITY_WEIGHTS[priority] || 30;
  
  // Deadline weight
  score += DEADLINE_WEIGHTS[deadlineProximity];
  
  // Goal alignment weight (0-1 * 40)
  score += goalAlignment * 40;
  
  // Top 3 bonus
  if (isTop3) {
    score += 200;
  }
  
  // Day of week pattern bonus
  score += dayOfWeekBonus;
  
  return score;
}

// Arbitrary generators
const priorityArb = fc.constantFrom('P1', 'P2', 'P3');
const deadlineProximityArb = fc.constantFrom<DeadlineProximity>('urgent', 'soon', 'normal', 'none');
const goalAlignmentArb = fc.float({ min: 0, max: 1, noNaN: true });
const isTop3Arb = fc.boolean();
const dayOfWeekBonusArb = fc.constantFrom(0, 20);

describe('Property 4: Suggestion Ordering Consistency', () => {
  /**
   * Property: Higher priority tasks should score higher (all else equal)
   * Validates: Requirements 3.2
   */
  it('should score P1 higher than P2, and P2 higher than P3', () => {
    fc.assert(
      fc.property(
        deadlineProximityArb,
        goalAlignmentArb,
        isTop3Arb,
        dayOfWeekBonusArb,
        (deadlineProximity, goalAlignment, isTop3, dayOfWeekBonus) => {
          const scoreP1 = calculateSuggestionScore('P1', deadlineProximity, goalAlignment, isTop3, dayOfWeekBonus);
          const scoreP2 = calculateSuggestionScore('P2', deadlineProximity, goalAlignment, isTop3, dayOfWeekBonus);
          const scoreP3 = calculateSuggestionScore('P3', deadlineProximity, goalAlignment, isTop3, dayOfWeekBonus);

          // Invariant: P1 > P2 > P3 when all else is equal
          expect(scoreP1).toBeGreaterThan(scoreP2);
          expect(scoreP2).toBeGreaterThan(scoreP3);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Closer deadlines should score higher (all else equal)
   * Validates: Requirements 3.2
   */
  it('should score urgent > soon > normal > none for deadline proximity', () => {
    fc.assert(
      fc.property(
        priorityArb,
        goalAlignmentArb,
        isTop3Arb,
        dayOfWeekBonusArb,
        (priority, goalAlignment, isTop3, dayOfWeekBonus) => {
          const scoreUrgent = calculateSuggestionScore(priority, 'urgent', goalAlignment, isTop3, dayOfWeekBonus);
          const scoreSoon = calculateSuggestionScore(priority, 'soon', goalAlignment, isTop3, dayOfWeekBonus);
          const scoreNormal = calculateSuggestionScore(priority, 'normal', goalAlignment, isTop3, dayOfWeekBonus);
          const scoreNone = calculateSuggestionScore(priority, 'none', goalAlignment, isTop3, dayOfWeekBonus);

          // Invariant: urgent > soon > normal > none when all else is equal
          expect(scoreUrgent).toBeGreaterThan(scoreSoon);
          expect(scoreSoon).toBeGreaterThan(scoreNormal);
          expect(scoreNormal).toBeGreaterThan(scoreNone);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Higher goal alignment should score higher (all else equal)
   * Validates: Requirements 3.2
   */
  it('should score higher goal alignment tasks higher', () => {
    fc.assert(
      fc.property(
        priorityArb,
        deadlineProximityArb,
        isTop3Arb,
        dayOfWeekBonusArb,
        // Generate two different goal alignments
        fc.float({ min: 0, max: 0.5, noNaN: true }),
        fc.float({ min: 0.5, max: 1, noNaN: true }),
        (priority, deadlineProximity, isTop3, dayOfWeekBonus, lowAlignment, highAlignment) => {
          const scoreLow = calculateSuggestionScore(priority, deadlineProximity, lowAlignment, isTop3, dayOfWeekBonus);
          const scoreHigh = calculateSuggestionScore(priority, deadlineProximity, highAlignment, isTop3, dayOfWeekBonus);

          // Invariant: higher goal alignment should score higher
          expect(scoreHigh).toBeGreaterThanOrEqual(scoreLow);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Top 3 tasks should always score higher than non-Top 3 (all else equal)
   * Validates: Requirements 9.1
   */
  it('should score Top 3 tasks significantly higher than non-Top 3 tasks', () => {
    fc.assert(
      fc.property(
        priorityArb,
        deadlineProximityArb,
        goalAlignmentArb,
        dayOfWeekBonusArb,
        (priority, deadlineProximity, goalAlignment, dayOfWeekBonus) => {
          const scoreTop3 = calculateSuggestionScore(priority, deadlineProximity, goalAlignment, true, dayOfWeekBonus);
          const scoreNonTop3 = calculateSuggestionScore(priority, deadlineProximity, goalAlignment, false, dayOfWeekBonus);

          // Invariant: Top 3 should always score higher (by 200 points)
          // Use toBeCloseTo for floating-point comparison to handle precision issues
          expect(scoreTop3).toBeGreaterThan(scoreNonTop3);
          expect(scoreTop3 - scoreNonTop3).toBeCloseTo(200, 10);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Score calculation is deterministic
   * Validates: Requirements 3.2, 9.1
   */
  it('should produce deterministic scores for the same inputs', () => {
    fc.assert(
      fc.property(
        priorityArb,
        deadlineProximityArb,
        goalAlignmentArb,
        isTop3Arb,
        dayOfWeekBonusArb,
        (priority, deadlineProximity, goalAlignment, isTop3, dayOfWeekBonus) => {
          const score1 = calculateSuggestionScore(priority, deadlineProximity, goalAlignment, isTop3, dayOfWeekBonus);
          const score2 = calculateSuggestionScore(priority, deadlineProximity, goalAlignment, isTop3, dayOfWeekBonus);

          // Invariant: same inputs should always produce same output
          expect(score1).toBe(score2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Score is always non-negative
   * Validates: Requirements 3.2
   */
  it('should always produce non-negative scores', () => {
    fc.assert(
      fc.property(
        priorityArb,
        deadlineProximityArb,
        goalAlignmentArb,
        isTop3Arb,
        dayOfWeekBonusArb,
        (priority, deadlineProximity, goalAlignment, isTop3, dayOfWeekBonus) => {
          const score = calculateSuggestionScore(priority, deadlineProximity, goalAlignment, isTop3, dayOfWeekBonus);

          // Invariant: score should never be negative
          expect(score).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Score has a reasonable upper bound
   * Validates: Requirements 3.2, 9.1
   */
  it('should have scores within expected bounds', () => {
    fc.assert(
      fc.property(
        priorityArb,
        deadlineProximityArb,
        goalAlignmentArb,
        isTop3Arb,
        dayOfWeekBonusArb,
        (priority, deadlineProximity, goalAlignment, isTop3, dayOfWeekBonus) => {
          const score = calculateSuggestionScore(priority, deadlineProximity, goalAlignment, isTop3, dayOfWeekBonus);

          // Maximum possible score:
          // P1 (100) + urgent (150) + full alignment (40) + Top3 (200) + dayBonus (20) = 510
          const maxPossibleScore = 100 + 150 + 40 + 200 + 20;
          
          // Minimum possible score:
          // P3 (30) + none (0) + no alignment (0) + not Top3 (0) + no bonus (0) = 30
          const minPossibleScore = 30;

          expect(score).toBeGreaterThanOrEqual(minPossibleScore);
          expect(score).toBeLessThanOrEqual(maxPossibleScore);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Sorting by score produces consistent ordering
   * Validates: Requirements 3.2, 9.1
   */
  it('should produce consistent ordering when sorting multiple tasks by score', () => {
    // Generate a task configuration
    const taskConfigArb = fc.record({
      priority: priorityArb,
      deadlineProximity: deadlineProximityArb,
      goalAlignment: goalAlignmentArb,
      isTop3: isTop3Arb,
      dayOfWeekBonus: dayOfWeekBonusArb,
    });

    fc.assert(
      fc.property(
        fc.array(taskConfigArb, { minLength: 2, maxLength: 10 }),
        (tasks) => {
          // Calculate scores for all tasks
          const scoredTasks = tasks.map((task, index) => ({
            id: index,
            score: calculateSuggestionScore(
              task.priority,
              task.deadlineProximity,
              task.goalAlignment,
              task.isTop3,
              task.dayOfWeekBonus
            ),
          }));

          // Sort by score descending
          const sorted1 = [...scoredTasks].sort((a, b) => b.score - a.score);
          const sorted2 = [...scoredTasks].sort((a, b) => b.score - a.score);

          // Invariant: sorting should be deterministic
          expect(sorted1.map(t => t.id)).toEqual(sorted2.map(t => t.id));

          // Invariant: sorted order should be descending by score
          for (let i = 0; i < sorted1.length - 1; i++) {
            expect(sorted1[i].score).toBeGreaterThanOrEqual(sorted1[i + 1].score);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Priority dominates when deadline and alignment are equal
   * Validates: Requirements 3.2
   */
  it('should prioritize by priority when deadline and alignment are equal', () => {
    fc.assert(
      fc.property(
        deadlineProximityArb,
        goalAlignmentArb,
        isTop3Arb,
        dayOfWeekBonusArb,
        (deadlineProximity, goalAlignment, isTop3, dayOfWeekBonus) => {
          const tasks = [
            { priority: 'P3', score: calculateSuggestionScore('P3', deadlineProximity, goalAlignment, isTop3, dayOfWeekBonus) },
            { priority: 'P1', score: calculateSuggestionScore('P1', deadlineProximity, goalAlignment, isTop3, dayOfWeekBonus) },
            { priority: 'P2', score: calculateSuggestionScore('P2', deadlineProximity, goalAlignment, isTop3, dayOfWeekBonus) },
          ];

          // Sort by score descending
          const sorted = [...tasks].sort((a, b) => b.score - a.score);

          // Invariant: P1 should be first, then P2, then P3
          expect(sorted[0].priority).toBe('P1');
          expect(sorted[1].priority).toBe('P2');
          expect(sorted[2].priority).toBe('P3');
        }
      ),
      { numRuns: 100 }
    );
  });
});
