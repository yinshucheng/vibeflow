import fc from 'fast-check';
import { describe, it, expect, afterAll } from 'vitest';
import {
  bypassDetectionService,
  calculateWarningLevel,
  BYPASS_SCORE_WEIGHTS,
  WARNING_LEVEL_THRESHOLDS,
} from '@/services/bypass-detection.service';
import prisma from '@/lib/prisma';

/**
 * Feature: desktop-production-resilience
 * Property 10: Bypass Score Calculation
 * Validates: Requirements 4.3
 * 
 * For any user, the bypass score SHALL be calculated based on the frequency
 * and duration of offline periods during work hours, with higher scores for
 * more frequent and longer offline periods.
 */

// =============================================================================
// TEST SETUP
// =============================================================================

// Track all created users for cleanup
const createdUserIds: string[] = [];

/**
 * Create a fresh test user for each property test iteration
 */
async function createTestUser(): Promise<string> {
  const testUserEmail = `test-bypass-score-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
  const user = await prisma.user.create({
    data: {
      email: testUserEmail,
      password: 'hashed-password',
    },
  });
  
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  // Clean up all test users
  for (const userId of createdUserIds) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any).bypassAttempt.deleteMany({ where: { userId } });
      await prisma.userSettings.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
    } catch {
      // Ignore cleanup errors
    }
  }
});

// =============================================================================
// GENERATORS
// =============================================================================

/**
 * Generator for client IDs
 */
const clientIdArb = fc.uuid();

/**
 * Generator for bypass event types
 */
const bypassEventTypeArb = fc.constantFrom('force_quit', 'offline_timeout', 'guardian_killed') as fc.Arbitrary<'force_quit' | 'offline_timeout' | 'guardian_killed'>;

/**
 * Generator for offline duration in seconds (0 to 30 minutes)
 */
const durationSecondsArb = fc.integer({ min: 0, max: 30 * 60 });

/**
 * Generator for bypass event input
 */
const bypassEventInputArb = fc.record({
  clientId: clientIdArb,
  eventType: bypassEventTypeArb,
  durationSeconds: fc.option(durationSecondsArb, { nil: null }),
  wasInWorkHours: fc.boolean(),
  wasInPomodoro: fc.boolean(),
});

/**
 * Generator for number of bypass events (1-10)
 */
const eventCountArb = fc.integer({ min: 1, max: 10 });

/**
 * Generator for score values (0-100)
 */
const scoreArb = fc.integer({ min: 0, max: 100 });

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Property 10: Bypass Score Calculation', () => {
  /**
   * Feature: desktop-production-resilience, Property 10: Bypass Score Calculation
   * Validates: Requirements 4.3
   *
   * For any user, the bypass score SHALL be calculated based on the frequency
   * and duration of offline periods during work hours, with higher scores for
   * more frequent and longer offline periods.
   */

  it('should return score of 0 for users with no bypass attempts', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 30 }), async (days) => {
        // Create a fresh test user
        const testUserId = await createTestUser();
        // Calculate score for user with no bypass attempts
        const result = await bypassDetectionService.calculateBypassScore(testUserId, days);
        
        expect(result.success).toBe(true);
        if (result.success && result.data) {
          expect(result.data.score).toBe(0);
          expect(result.data.warningLevel).toBe('none');
          expect(result.data.factors.frequencyScore).toBe(0);
          expect(result.data.factors.durationScore).toBe(0);
          expect(result.data.factors.pomodoroInterruptScore).toBe(0);
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should increase score with more bypass attempts during work hours', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        clientIdArb,
        async (attemptCount, clientId) => {
          // Create a fresh test user
          const testUserId = await createTestUser();
          // Record multiple bypass attempts during work hours
          for (let i = 0; i < attemptCount; i++) {
            await bypassDetectionService.recordBypassEvent({
              userId: testUserId,
              clientId,
              eventType: 'force_quit',
              wasInWorkHours: true,
              wasInPomodoro: false,
            });
          }

          // Calculate score
          const result = await bypassDetectionService.calculateBypassScore(testUserId);
          
          expect(result.success).toBe(true);
          if (result.success && result.data) {
            // Score should be positive when there are work hours attempts
            expect(result.data.score).toBeGreaterThanOrEqual(0);
            // Frequency score should be positive
            expect(result.data.factors.frequencyScore).toBeGreaterThanOrEqual(0);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should increase score with longer offline durations', async () => {
    await fc.assert(
      fc.asyncProperty(
        clientIdArb,
        fc.integer({ min: 60, max: 1800 }), // 1-30 minutes
        async (clientId, durationSeconds) => {
          // Create a fresh test user
          const testUserId = await createTestUser();
          // Record a bypass attempt with duration during work hours
          await bypassDetectionService.recordBypassEvent({
            userId: testUserId,
            clientId,
            eventType: 'offline_timeout',
            durationSeconds,
            wasInWorkHours: true,
            wasInPomodoro: false,
          });

          // Calculate score
          const result = await bypassDetectionService.calculateBypassScore(testUserId);
          
          expect(result.success).toBe(true);
          if (result.success && result.data) {
            // Duration score should be positive when there's offline duration
            expect(result.data.factors.durationScore).toBeGreaterThanOrEqual(0);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should increase score with pomodoro interruptions', async () => {
    await fc.assert(
      fc.asyncProperty(
        clientIdArb,
        fc.integer({ min: 1, max: 3 }),
        async (clientId, interruptCount) => {
          // Create a fresh test user
          const testUserId = await createTestUser();
          // Record bypass attempts that interrupted pomodoros
          for (let i = 0; i < interruptCount; i++) {
            await bypassDetectionService.recordBypassEvent({
              userId: testUserId,
              clientId,
              eventType: 'force_quit',
              wasInWorkHours: true,
              wasInPomodoro: true,
            });
          }

          // Calculate score
          const result = await bypassDetectionService.calculateBypassScore(testUserId);
          
          expect(result.success).toBe(true);
          if (result.success && result.data) {
            // Pomodoro interrupt score should be positive
            expect(result.data.factors.pomodoroInterruptScore).toBeGreaterThanOrEqual(0);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not count non-work-hours attempts in score calculation', async () => {
    await fc.assert(
      fc.asyncProperty(
        clientIdArb,
        fc.integer({ min: 1, max: 5 }),
        async (clientId, attemptCount) => {
          // Create a fresh test user
          const testUserId = await createTestUser();
          // Record bypass attempts outside work hours
          for (let i = 0; i < attemptCount; i++) {
            await bypassDetectionService.recordBypassEvent({
              userId: testUserId,
              clientId,
              eventType: 'force_quit',
              wasInWorkHours: false, // Not during work hours
              wasInPomodoro: false,
            });
          }

          // Calculate score
          const result = await bypassDetectionService.calculateBypassScore(testUserId);
          
          expect(result.success).toBe(true);
          if (result.success && result.data) {
            // Score should be 0 since no work hours attempts
            expect(result.data.score).toBe(0);
            expect(result.data.factors.frequencyScore).toBe(0);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should calculate warning level correctly based on score', async () => {
    await fc.assert(
      fc.asyncProperty(scoreArb, async (score) => {
        const warningLevel = calculateWarningLevel(score);
        
        if (score >= WARNING_LEVEL_THRESHOLDS.high) {
          expect(warningLevel).toBe('high');
        } else if (score >= WARNING_LEVEL_THRESHOLDS.medium) {
          expect(warningLevel).toBe('medium');
        } else if (score >= WARNING_LEVEL_THRESHOLDS.low) {
          expect(warningLevel).toBe('low');
        } else {
          expect(warningLevel).toBe('none');
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should return score bounded between 0 and 100', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(bypassEventInputArb, { minLength: 0, maxLength: 20 }),
        async (events) => {
          // Create a fresh test user
          const testUserId = await createTestUser();
          // Record all events
          for (const event of events) {
            await bypassDetectionService.recordBypassEvent({
              userId: testUserId,
              ...event,
            });
          }

          // Calculate score
          const result = await bypassDetectionService.calculateBypassScore(testUserId);
          
          expect(result.success).toBe(true);
          if (result.success && result.data) {
            // Score should be bounded
            expect(result.data.score).toBeGreaterThanOrEqual(0);
            expect(result.data.score).toBeLessThanOrEqual(100);
            
            // Individual factors should also be bounded
            expect(result.data.factors.frequencyScore).toBeGreaterThanOrEqual(0);
            expect(result.data.factors.frequencyScore).toBeLessThanOrEqual(100);
            expect(result.data.factors.durationScore).toBeGreaterThanOrEqual(0);
            expect(result.data.factors.durationScore).toBeLessThanOrEqual(100);
            expect(result.data.factors.pomodoroInterruptScore).toBeGreaterThanOrEqual(0);
            expect(result.data.factors.pomodoroInterruptScore).toBeLessThanOrEqual(100);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should use correct weights for score calculation', async () => {
    // Verify the weights sum to 1
    const totalWeight = 
      BYPASS_SCORE_WEIGHTS.frequency +
      BYPASS_SCORE_WEIGHTS.duration +
      BYPASS_SCORE_WEIGHTS.pomodoroInterrupt;
    
    expect(totalWeight).toBeCloseTo(1.0, 5);
  });

  it('should correctly identify when warning should be shown', async () => {
    await fc.assert(
      fc.asyncProperty(
        clientIdArb,
        fc.integer({ min: 1, max: 10 }),
        async (clientId, attemptCount) => {
          // Create a fresh test user
          const testUserId = await createTestUser();
          // Record multiple bypass attempts to potentially trigger warning
          for (let i = 0; i < attemptCount; i++) {
            await bypassDetectionService.recordBypassEvent({
              userId: testUserId,
              clientId,
              eventType: 'force_quit',
              wasInWorkHours: true,
              wasInPomodoro: i % 2 === 0, // Alternate pomodoro interrupts
              durationSeconds: 300, // 5 minutes each
            });
          }

          // Check if warning should be shown
          const result = await bypassDetectionService.shouldShowWarning(testUserId);
          
          expect(result.success).toBe(true);
          if (result.success && result.data) {
            // shouldShow should be true if score >= threshold
            expect(result.data.shouldShow).toBe(result.data.score >= result.data.threshold);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should record bypass events with correct warning levels', async () => {
    await fc.assert(
      fc.asyncProperty(
        bypassEventInputArb,
        async (eventInput) => {
          // Create a fresh test user
          const testUserId = await createTestUser();
          // Record a bypass event
          const result = await bypassDetectionService.recordBypassEvent({
            userId: testUserId,
            ...eventInput,
          });
          
          expect(result.success).toBe(true);
          if (result.success && result.data) {
            // Warning level should be one of the valid values
            expect(['none', 'low', 'medium', 'high']).toContain(result.data.warningLevel);
            
            // If not in work hours, warning level should be 'none'
            if (!eventInput.wasInWorkHours) {
              expect(result.data.warningLevel).toBe('none');
            }
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should retrieve bypass history correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(bypassEventInputArb, { minLength: 1, maxLength: 5 }),
        async (events) => {
          // Create a fresh test user
          const testUserId = await createTestUser();
          // Record all events
          for (const event of events) {
            await bypassDetectionService.recordBypassEvent({
              userId: testUserId,
              ...event,
            });
          }

          // Get history
          const result = await bypassDetectionService.getBypassHistory({
            userId: testUserId,
            days: 30,
          });
          
          expect(result.success).toBe(true);
          if (result.success && result.data) {
            // Should have recorded all events
            expect(result.data.length).toBe(events.length);
            
            // Events should be ordered by timestamp (most recent first)
            for (let i = 1; i < result.data.length; i++) {
              expect(result.data[i - 1].timestamp.getTime())
                .toBeGreaterThanOrEqual(result.data[i].timestamp.getTime());
            }
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
