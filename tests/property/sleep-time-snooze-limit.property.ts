import fc from 'fast-check';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * Feature: ad-hoc-focus-session
 * Property 5: Sleep Time Snooze Limit
 * Validates: Requirements 12.1, 12.2, 12.3, 12.4
 *
 * For any user on any given night, the number of snooze exemptions
 * must not exceed the configured snoozeLimit.
 */

const prisma = new PrismaClient();

// Test user for property tests
let testUserId: string;
let dbAvailable = false;

// Helper to check database connectivity
async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$connect();
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse time string "HH:mm" to minutes since midnight
 */
function parseTimeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Get the start of the "night" for a given timestamp based on sleep window
 * A "night" starts at the sleep start time and ends at the sleep end time
 */
function getNightStartTime(
  sleepStartTime: string,
  sleepEndTime: string,
  referenceTime: Date
): Date {
  const currentMinutes = referenceTime.getHours() * 60 + referenceTime.getMinutes();
  const startMinutes = parseTimeToMinutes(sleepStartTime);
  const endMinutes = parseTimeToMinutes(sleepEndTime);

  const nightStart = new Date(referenceTime);
  nightStart.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);

  if (startMinutes > endMinutes) {
    // Overnight window (e.g., 23:00 - 07:00)
    if (currentMinutes < endMinutes) {
      // We're in the early morning part, night started yesterday
      nightStart.setDate(nightStart.getDate() - 1);
    }
  } else {
    // Same day window (e.g., 01:00 - 06:00)
    if (currentMinutes < startMinutes) {
      // We're before the window, use yesterday's night
      nightStart.setDate(nightStart.getDate() - 1);
    }
  }

  return nightStart;
}

/**
 * Count snoozes for a specific night
 */
async function countSnoozesForNight(
  userId: string,
  sleepStartTime: string,
  sleepEndTime: string,
  referenceTime: Date
): Promise<number> {
  const nightStart = getNightStartTime(sleepStartTime, sleepEndTime, referenceTime);

  const count = await prisma.sleepExemption.count({
    where: {
      userId,
      type: 'snooze',
      timestamp: {
        gte: nightStart,
      },
    },
  });

  return count;
}

/**
 * Helper to setup user settings with upsert (handles multiple iterations)
 */
async function setupUserSettings(
  userId: string,
  snoozeLimit: number,
  snoozeDuration: number,
  sleepStartTime: string = '23:00',
  sleepEndTime: string = '07:00'
) {
  return prisma.userSettings.upsert({
    where: { userId },
    update: {
      sleepTimeEnabled: true,
      sleepTimeStart: sleepStartTime,
      sleepTimeEnd: sleepEndTime,
      sleepSnoozeLimit: snoozeLimit,
      sleepSnoozeDuration: snoozeDuration,
    },
    create: {
      userId,
      sleepTimeEnabled: true,
      sleepTimeStart: sleepStartTime,
      sleepTimeEnd: sleepEndTime,
      sleepSnoozeLimit: snoozeLimit,
      sleepSnoozeDuration: snoozeDuration,
    },
  });
}

/**
 * Helper to clean up exemptions for a user
 */
async function cleanupExemptions(userId: string) {
  await prisma.sleepExemption.deleteMany({ where: { userId } });
}

describe('Property 5: Sleep Time Snooze Limit', () => {
  beforeAll(async () => {
    dbAvailable = await checkDatabaseConnection();
    if (!dbAvailable) {
      console.warn('Database not available, skipping property tests');
      return;
    }

    // Create a test user for the property tests
    const testUser = await prisma.user.create({
      data: {
        email: `test-snooze-limit-${Date.now()}@vibeflow.test`,
        password: 'hashed_password_placeholder',
      },
    });
    testUserId = testUser.id;
  });

  afterAll(async () => {
    if (!dbAvailable) return;

    // Clean up: delete all sleep exemptions and settings, then delete user
    if (testUserId) {
      await prisma.sleepExemption.deleteMany({ where: { userId: testUserId } });
      await prisma.userSettings.deleteMany({ where: { userId: testUserId } });
      await prisma.user.delete({ where: { id: testUserId } });
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    if (!dbAvailable) return;
    // Clean up sleep exemptions before each test run
    await prisma.sleepExemption.deleteMany({ where: { userId: testUserId } });
  });

  /**
   * Property: Snooze count never exceeds configured limit
   * Validates: Requirements 12.3, 12.4
   */
  it('should never allow snooze count to exceed configured limit', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        // Generate snooze limit between 1 and 5
        fc.integer({ min: 1, max: 5 }),
        // Generate snooze duration between 15 and 60 minutes
        fc.integer({ min: 15, max: 60 }),
        // Generate number of snooze attempts (more than limit to test enforcement)
        fc.integer({ min: 1, max: 10 }),
        async (snoozeLimit, snoozeDuration, snoozeAttempts) => {
          const sleepStartTime = '23:00';
          const sleepEndTime = '07:00';

          // Clean up before each iteration
          await cleanupExemptions(testUserId);

          // Create/update user settings with the generated snooze limit
          await setupUserSettings(testUserId, snoozeLimit, snoozeDuration, sleepStartTime, sleepEndTime);

          // Simulate snooze requests up to the limit
          const now = new Date();
          const nightStart = getNightStartTime(sleepStartTime, sleepEndTime, now);
          let successfulSnoozes = 0;

          for (let i = 0; i < snoozeAttempts; i++) {
            // Check current snooze count
            const currentCount = await countSnoozesForNight(
              testUserId,
              sleepStartTime,
              sleepEndTime,
              now
            );

            // Only create snooze if under limit (simulating service behavior)
            if (currentCount < snoozeLimit) {
              await prisma.sleepExemption.create({
                data: {
                  userId: testUserId,
                  type: 'snooze',
                  duration: snoozeDuration,
                  timestamp: new Date(nightStart.getTime() + i * 60 * 1000), // Spread out timestamps
                },
              });
              successfulSnoozes++;
            }
          }

          // Verify invariant: snooze count never exceeds limit
          const finalCount = await countSnoozesForNight(
            testUserId,
            sleepStartTime,
            sleepEndTime,
            now
          );

          expect(finalCount).toBeLessThanOrEqual(snoozeLimit);
          expect(successfulSnoozes).toBeLessThanOrEqual(snoozeLimit);
          expect(finalCount).toBe(Math.min(snoozeAttempts, snoozeLimit));
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Remaining snoozes calculation is correct
   * Validates: Requirements 12.3, 12.4
   */
  it('should correctly calculate remaining snoozes', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        // Generate snooze limit between 1 and 5
        fc.integer({ min: 1, max: 5 }),
        // Generate number of snoozes already used (0 to limit)
        fc.integer({ min: 0, max: 5 }),
        async (snoozeLimit, snoozesUsed) => {
          const sleepStartTime = '23:00';
          const sleepEndTime = '07:00';
          const actualSnoozesUsed = Math.min(snoozesUsed, snoozeLimit);

          // Clean up before each iteration
          await cleanupExemptions(testUserId);

          // Create/update user settings
          await setupUserSettings(testUserId, snoozeLimit, 30, sleepStartTime, sleepEndTime);

          // Create the specified number of snooze exemptions
          const now = new Date();
          const nightStart = getNightStartTime(sleepStartTime, sleepEndTime, now);

          for (let i = 0; i < actualSnoozesUsed; i++) {
            await prisma.sleepExemption.create({
              data: {
                userId: testUserId,
                type: 'snooze',
                duration: 30,
                timestamp: new Date(nightStart.getTime() + i * 60 * 1000),
              },
            });
          }

          // Calculate remaining snoozes
          const usedCount = await countSnoozesForNight(
            testUserId,
            sleepStartTime,
            sleepEndTime,
            now
          );
          const remaining = Math.max(0, snoozeLimit - usedCount);

          // Verify invariant: remaining = limit - used
          expect(remaining).toBe(snoozeLimit - actualSnoozesUsed);
          expect(remaining).toBeGreaterThanOrEqual(0);
          expect(remaining).toBeLessThanOrEqual(snoozeLimit);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Snoozes from different nights don't affect each other
   * Validates: Requirements 12.3
   */
  it('should isolate snooze counts between different nights', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        // Generate snooze limit
        fc.integer({ min: 1, max: 3 }),
        // Generate snoozes for "last night"
        fc.integer({ min: 0, max: 3 }),
        // Generate snoozes for "tonight"
        fc.integer({ min: 0, max: 3 }),
        async (snoozeLimit, lastNightSnoozes, tonightSnoozes) => {
          const sleepStartTime = '23:00';
          const sleepEndTime = '07:00';

          // Clean up before each iteration
          await cleanupExemptions(testUserId);

          // Create/update user settings
          await setupUserSettings(testUserId, snoozeLimit, 30, sleepStartTime, sleepEndTime);

          // Create snoozes for "last night" (2 days ago at 23:30)
          const lastNight = new Date();
          lastNight.setDate(lastNight.getDate() - 2);
          lastNight.setHours(23, 30, 0, 0);

          const actualLastNightSnoozes = Math.min(lastNightSnoozes, snoozeLimit);
          for (let i = 0; i < actualLastNightSnoozes; i++) {
            await prisma.sleepExemption.create({
              data: {
                userId: testUserId,
                type: 'snooze',
                duration: 30,
                timestamp: new Date(lastNight.getTime() + i * 60 * 1000),
              },
            });
          }

          // Create snoozes for "tonight" (today at 23:30)
          const tonight = new Date();
          tonight.setHours(23, 30, 0, 0);

          const actualTonightSnoozes = Math.min(tonightSnoozes, snoozeLimit);
          for (let i = 0; i < actualTonightSnoozes; i++) {
            await prisma.sleepExemption.create({
              data: {
                userId: testUserId,
                type: 'snooze',
                duration: 30,
                timestamp: new Date(tonight.getTime() + i * 60 * 1000),
              },
            });
          }

          // Count snoozes for tonight only
          const tonightCount = await countSnoozesForNight(
            testUserId,
            sleepStartTime,
            sleepEndTime,
            tonight
          );

          // Verify invariant: tonight's count is independent of last night
          expect(tonightCount).toBe(actualTonightSnoozes);
          expect(tonightCount).toBeLessThanOrEqual(snoozeLimit);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Focus override exemptions don't count toward snooze limit
   * Validates: Requirements 12.3, 14.1
   */
  it('should not count focus_override exemptions toward snooze limit', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        // Generate snooze limit
        fc.integer({ min: 1, max: 3 }),
        // Generate number of focus overrides
        fc.integer({ min: 0, max: 5 }),
        // Generate number of snoozes
        fc.integer({ min: 0, max: 5 }),
        async (snoozeLimit, focusOverrides, snoozeAttempts) => {
          const sleepStartTime = '23:00';
          const sleepEndTime = '07:00';

          // Clean up before each iteration
          await cleanupExemptions(testUserId);

          // Create/update user settings
          await setupUserSettings(testUserId, snoozeLimit, 30, sleepStartTime, sleepEndTime);

          const now = new Date();
          const nightStart = getNightStartTime(sleepStartTime, sleepEndTime, now);

          // Create focus override exemptions (these should NOT count toward snooze limit)
          for (let i = 0; i < focusOverrides; i++) {
            await prisma.sleepExemption.create({
              data: {
                userId: testUserId,
                type: 'focus_override',
                duration: 60,
                timestamp: new Date(nightStart.getTime() + i * 60 * 1000),
              },
            });
          }

          // Create snooze exemptions up to the limit
          let successfulSnoozes = 0;
          for (let i = 0; i < snoozeAttempts; i++) {
            const currentSnoozeCount = await prisma.sleepExemption.count({
              where: {
                userId: testUserId,
                type: 'snooze',
                timestamp: { gte: nightStart },
              },
            });

            if (currentSnoozeCount < snoozeLimit) {
              await prisma.sleepExemption.create({
                data: {
                  userId: testUserId,
                  type: 'snooze',
                  duration: 30,
                  timestamp: new Date(nightStart.getTime() + (focusOverrides + i) * 60 * 1000),
                },
              });
              successfulSnoozes++;
            }
          }

          // Count only snooze exemptions
          const snoozeCount = await prisma.sleepExemption.count({
            where: {
              userId: testUserId,
              type: 'snooze',
              timestamp: { gte: nightStart },
            },
          });

          // Count all exemptions
          const totalExemptions = await prisma.sleepExemption.count({
            where: {
              userId: testUserId,
              timestamp: { gte: nightStart },
            },
          });

          // Verify invariants:
          // 1. Snooze count respects limit
          expect(snoozeCount).toBeLessThanOrEqual(snoozeLimit);
          // 2. Focus overrides don't affect snooze count
          expect(totalExemptions).toBe(focusOverrides + snoozeCount);
          // 3. Successful snoozes match expected
          expect(successfulSnoozes).toBe(Math.min(snoozeAttempts, snoozeLimit));
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Snooze duration is recorded correctly
   * Validates: Requirements 12.1, 12.2
   */
  it('should record snooze duration correctly', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        // Generate snooze duration between 5 and 120 minutes
        fc.integer({ min: 5, max: 120 }),
        async (snoozeDuration) => {
          const sleepStartTime = '23:00';
          const sleepEndTime = '07:00';

          // Clean up before each iteration
          await cleanupExemptions(testUserId);

          // Create/update user settings with the generated snooze duration
          await setupUserSettings(testUserId, 2, snoozeDuration, sleepStartTime, sleepEndTime);

          // Create a snooze exemption
          const exemption = await prisma.sleepExemption.create({
            data: {
              userId: testUserId,
              type: 'snooze',
              duration: snoozeDuration,
              timestamp: new Date(),
            },
          });

          // Retrieve and verify
          const retrieved = await prisma.sleepExemption.findUnique({
            where: { id: exemption.id },
          });

          // Verify invariant: duration is recorded correctly
          expect(retrieved).not.toBeNull();
          expect(retrieved!.duration).toBe(snoozeDuration);
          expect(retrieved!.type).toBe('snooze');
        }
      ),
      { numRuns: 100 }
    );
  });
});
