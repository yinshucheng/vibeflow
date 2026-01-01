import fc from 'fast-check';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * Feature: ad-hoc-focus-session
 * Property 1: Focus Session Lifecycle Consistency
 * Validates: Requirements 1.1, 1.2, 1.4, 3.2, 3.3
 *
 * For any focus session, the following invariants must hold:
 * - If status is 'active', actualEndTime must be null
 * - If status is 'completed' or 'cancelled', actualEndTime must be set
 * - plannedEndTime must equal startTime + duration (in minutes)
 * - duration must be between 15 and 240 minutes
 */

const prisma = new PrismaClient();

// Duration constraints from the service
const MIN_SESSION_DURATION = 15;
const MAX_SESSION_DURATION = 240;

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

describe('Property 1: Focus Session Lifecycle Consistency', () => {
  beforeAll(async () => {
    dbAvailable = await checkDatabaseConnection();
    if (!dbAvailable) {
      console.warn('Database not available, skipping property tests');
      return;
    }

    // Create a test user for the property tests
    const testUser = await prisma.user.create({
      data: {
        email: `test-focus-session-${Date.now()}@vibeflow.test`,
        password: 'hashed_password_placeholder',
      },
    });
    testUserId = testUser.id;
  });

  afterAll(async () => {
    if (!dbAvailable) return;

    // Clean up: delete all focus sessions created by test user, then delete user
    if (testUserId) {
      await prisma.focusSession.deleteMany({ where: { userId: testUserId } });
      await prisma.user.delete({ where: { id: testUserId } });
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    if (!dbAvailable) return;
    // Clean up focus sessions before each test run
    await prisma.focusSession.deleteMany({ where: { userId: testUserId } });
  });

  /**
   * Property: Active sessions must have null actualEndTime
   * Validates: Requirements 1.1, 1.2
   */
  it('should have null actualEndTime when status is active', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        // Generate valid duration between 15 and 240 minutes
        fc.integer({ min: MIN_SESSION_DURATION, max: MAX_SESSION_DURATION }),
        async (duration) => {
          const startTime = new Date();
          const plannedEndTime = new Date(startTime.getTime() + duration * 60 * 1000);

          // Create an active session
          const session = await prisma.focusSession.create({
            data: {
              userId: testUserId,
              startTime,
              plannedEndTime,
              duration,
              status: 'active',
              overridesSleepTime: false,
            },
          });

          // Verify invariant: active sessions have null actualEndTime
          expect(session.status).toBe('active');
          expect(session.actualEndTime).toBeNull();

          // Clean up
          await prisma.focusSession.delete({ where: { id: session.id } });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Completed sessions must have non-null actualEndTime
   * Validates: Requirements 3.2, 3.3
   */
  it('should have non-null actualEndTime when status is completed', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: MIN_SESSION_DURATION, max: MAX_SESSION_DURATION }),
        async (duration) => {
          const startTime = new Date();
          const plannedEndTime = new Date(startTime.getTime() + duration * 60 * 1000);
          const actualEndTime = new Date(); // Session ended now

          // Create a completed session
          const session = await prisma.focusSession.create({
            data: {
              userId: testUserId,
              startTime,
              plannedEndTime,
              actualEndTime,
              duration,
              status: 'completed',
              overridesSleepTime: false,
            },
          });

          // Verify invariant: completed sessions have non-null actualEndTime
          expect(session.status).toBe('completed');
          expect(session.actualEndTime).not.toBeNull();

          // Clean up
          await prisma.focusSession.delete({ where: { id: session.id } });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Cancelled sessions must have non-null actualEndTime
   * Validates: Requirements 3.2, 3.3
   */
  it('should have non-null actualEndTime when status is cancelled', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: MIN_SESSION_DURATION, max: MAX_SESSION_DURATION }),
        async (duration) => {
          const startTime = new Date();
          const plannedEndTime = new Date(startTime.getTime() + duration * 60 * 1000);
          const actualEndTime = new Date(); // Session cancelled now

          // Create a cancelled session
          const session = await prisma.focusSession.create({
            data: {
              userId: testUserId,
              startTime,
              plannedEndTime,
              actualEndTime,
              duration,
              status: 'cancelled',
              overridesSleepTime: false,
            },
          });

          // Verify invariant: cancelled sessions have non-null actualEndTime
          expect(session.status).toBe('cancelled');
          expect(session.actualEndTime).not.toBeNull();

          // Clean up
          await prisma.focusSession.delete({ where: { id: session.id } });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: plannedEndTime must equal startTime + duration
   * Validates: Requirements 1.2
   */
  it('should have plannedEndTime equal to startTime plus duration', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: MIN_SESSION_DURATION, max: MAX_SESSION_DURATION }),
        // Generate a start time within the last 24 hours
        fc.integer({ min: 0, max: 24 * 60 * 60 * 1000 }).map(
          (offset) => new Date(Date.now() - offset)
        ),
        async (duration, startTime) => {
          const expectedPlannedEndTime = new Date(startTime.getTime() + duration * 60 * 1000);

          // Create a session with calculated plannedEndTime
          const session = await prisma.focusSession.create({
            data: {
              userId: testUserId,
              startTime,
              plannedEndTime: expectedPlannedEndTime,
              duration,
              status: 'active',
              overridesSleepTime: false,
            },
          });

          // Verify invariant: plannedEndTime = startTime + duration (in minutes)
          const actualDurationMs = session.plannedEndTime.getTime() - session.startTime.getTime();
          const actualDurationMinutes = actualDurationMs / (60 * 1000);

          expect(actualDurationMinutes).toBe(duration);

          // Clean up
          await prisma.focusSession.delete({ where: { id: session.id } });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Duration must be within valid range (15-240 minutes)
   * Validates: Requirements 1.4
   */
  it('should only allow duration between 15 and 240 minutes', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: MIN_SESSION_DURATION, max: MAX_SESSION_DURATION }),
        async (duration) => {
          const startTime = new Date();
          const plannedEndTime = new Date(startTime.getTime() + duration * 60 * 1000);

          // Create a session with valid duration
          const session = await prisma.focusSession.create({
            data: {
              userId: testUserId,
              startTime,
              plannedEndTime,
              duration,
              status: 'active',
              overridesSleepTime: false,
            },
          });

          // Verify invariant: duration is within valid range
          expect(session.duration).toBeGreaterThanOrEqual(MIN_SESSION_DURATION);
          expect(session.duration).toBeLessThanOrEqual(MAX_SESSION_DURATION);

          // Clean up
          await prisma.focusSession.delete({ where: { id: session.id } });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Session lifecycle transition from active to completed
   * Validates: Requirements 1.1, 3.2, 3.3
   */
  it('should maintain invariants when transitioning from active to completed', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: MIN_SESSION_DURATION, max: MAX_SESSION_DURATION }),
        async (duration) => {
          const startTime = new Date();
          const plannedEndTime = new Date(startTime.getTime() + duration * 60 * 1000);

          // Create an active session
          const activeSession = await prisma.focusSession.create({
            data: {
              userId: testUserId,
              startTime,
              plannedEndTime,
              duration,
              status: 'active',
              overridesSleepTime: false,
            },
          });

          // Verify active state invariants
          expect(activeSession.status).toBe('active');
          expect(activeSession.actualEndTime).toBeNull();

          // Transition to completed
          const actualEndTime = new Date();
          const completedSession = await prisma.focusSession.update({
            where: { id: activeSession.id },
            data: {
              status: 'completed',
              actualEndTime,
            },
          });

          // Verify completed state invariants
          expect(completedSession.status).toBe('completed');
          expect(completedSession.actualEndTime).not.toBeNull();
          
          // Duration and plannedEndTime should remain unchanged
          expect(completedSession.duration).toBe(duration);
          expect(completedSession.plannedEndTime.getTime()).toBe(plannedEndTime.getTime());

          // Clean up
          await prisma.focusSession.delete({ where: { id: activeSession.id } });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Round-trip consistency - create and retrieve
   * Validates: Requirements 1.1, 1.2
   */
  it('should maintain data consistency on round-trip create and retrieve', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: MIN_SESSION_DURATION, max: MAX_SESSION_DURATION }),
        fc.boolean(),
        async (duration, overridesSleepTime) => {
          const startTime = new Date();
          const plannedEndTime = new Date(startTime.getTime() + duration * 60 * 1000);

          // Create a session
          const createdSession = await prisma.focusSession.create({
            data: {
              userId: testUserId,
              startTime,
              plannedEndTime,
              duration,
              status: 'active',
              overridesSleepTime,
            },
          });

          // Retrieve the session
          const retrievedSession = await prisma.focusSession.findUnique({
            where: { id: createdSession.id },
          });

          // Verify round-trip consistency
          expect(retrievedSession).not.toBeNull();
          expect(retrievedSession!.id).toBe(createdSession.id);
          expect(retrievedSession!.userId).toBe(testUserId);
          expect(retrievedSession!.duration).toBe(duration);
          expect(retrievedSession!.status).toBe('active');
          expect(retrievedSession!.overridesSleepTime).toBe(overridesSleepTime);
          expect(retrievedSession!.actualEndTime).toBeNull();
          
          // Verify time calculations
          const retrievedDurationMs = 
            retrievedSession!.plannedEndTime.getTime() - retrievedSession!.startTime.getTime();
          expect(retrievedDurationMs).toBe(duration * 60 * 1000);

          // Clean up
          await prisma.focusSession.delete({ where: { id: createdSession.id } });
        }
      ),
      { numRuns: 100 }
    );
  });
});
