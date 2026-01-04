import fc from 'fast-check';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  gracePeriodService,
  calculateGracePeriodDuration,
  DEFAULT_GRACE_PERIOD_MINUTES,
  POMODORO_GRACE_PERIOD_MINUTES,
  MIN_GRACE_PERIOD_MINUTES,
  MAX_GRACE_PERIOD_MINUTES,
} from '@/services/grace-period.service';
import prisma from '@/lib/prisma';

/**
 * Feature: desktop-production-resilience
 * Property 5: Grace Period Duration by Context
 * Validates: Requirements 5.1, 5.5
 * 
 * For any grace period, the duration SHALL be the configured default (5 minutes)
 * when no pomodoro is active, and the shorter pomodoro duration (2 minutes)
 * when a pomodoro is active.
 */

// =============================================================================
// TEST SETUP
// =============================================================================

let testUserId: string;
let testUserEmail: string;

beforeEach(async () => {
  // Create a unique test user for each test
  testUserEmail = `test-grace-duration-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
  const user = await prisma.user.create({
    data: {
      email: testUserEmail,
      password: 'hashed-password',
    },
  });
  testUserId = user.id;
  
  // Clear any existing grace periods
  gracePeriodService.clearAllGracePeriods();
});

afterEach(async () => {
  // Clean up grace periods
  gracePeriodService.clearAllGracePeriods();
  
  // Clean up test data
  if (testUserId) {
    // Delete user settings
    await prisma.userSettings.deleteMany({
      where: { userId: testUserId },
    }).catch(() => {
      // Ignore errors
    });
    
    // Delete the user
    await prisma.user.delete({
      where: { id: testUserId },
    }).catch(() => {
      // Ignore if already deleted
    });
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
 * Generator for valid grace period configuration values
 */
const gracePeriodMinutesArb = fc.integer({
  min: MIN_GRACE_PERIOD_MINUTES,
  max: MAX_GRACE_PERIOD_MINUTES,
});

/**
 * Generator for grace period configuration
 */
const gracePeriodConfigArb = fc.record({
  defaultMinutes: gracePeriodMinutesArb,
  pomodoroMinutes: gracePeriodMinutesArb,
});

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Property 5: Grace Period Duration by Context', () => {
  /**
   * Feature: desktop-production-resilience, Property 5: Grace Period Duration by Context
   * Validates: Requirements 5.1, 5.5
   *
   * For any grace period, the duration SHALL be the configured default (5 minutes)
   * when no pomodoro is active, and the shorter pomodoro duration (2 minutes)
   * when a pomodoro is active.
   */

  it('should use default duration when no pomodoro is active', async () => {
    await fc.assert(
      fc.asyncProperty(clientIdArb, async (clientId) => {
        // Start a grace period without pomodoro
        const result = await gracePeriodService.startGracePeriod({
          clientId,
          userId: testUserId,
          isInPomodoro: false,
        });
        
        expect(result.success).toBe(true);
        if (result.success && result.data) {
          // Duration should be the default (5 minutes)
          expect(result.data.durationMinutes).toBe(DEFAULT_GRACE_PERIOD_MINUTES);
          expect(result.data.isInPomodoro).toBe(false);
          
          // Verify expiry time is correct
          const expectedExpiryMs = result.data.startedAt.getTime() + DEFAULT_GRACE_PERIOD_MINUTES * 60 * 1000;
          expect(result.data.expiresAt.getTime()).toBe(expectedExpiryMs);
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should use shorter duration when pomodoro is active', async () => {
    await fc.assert(
      fc.asyncProperty(clientIdArb, async (clientId) => {
        // Start a grace period with pomodoro active
        const result = await gracePeriodService.startGracePeriod({
          clientId,
          userId: testUserId,
          isInPomodoro: true,
        });
        
        expect(result.success).toBe(true);
        if (result.success && result.data) {
          // Duration should be the pomodoro duration (2 minutes)
          expect(result.data.durationMinutes).toBe(POMODORO_GRACE_PERIOD_MINUTES);
          expect(result.data.isInPomodoro).toBe(true);
          
          // Verify expiry time is correct
          const expectedExpiryMs = result.data.startedAt.getTime() + POMODORO_GRACE_PERIOD_MINUTES * 60 * 1000;
          expect(result.data.expiresAt.getTime()).toBe(expectedExpiryMs);
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should calculate duration correctly for any configuration', () => {
    fc.assert(
      fc.property(
        gracePeriodConfigArb,
        fc.boolean(),
        (config, isInPomodoro) => {
          const duration = calculateGracePeriodDuration(isInPomodoro, config);
          
          if (isInPomodoro) {
            // Should use pomodoro duration
            expect(duration).toBe(config.pomodoroMinutes);
          } else {
            // Should use default duration
            expect(duration).toBe(config.defaultMinutes);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should always have pomodoro duration <= default duration in practice', () => {
    // This is a design invariant: pomodoro grace period should be shorter
    expect(POMODORO_GRACE_PERIOD_MINUTES).toBeLessThanOrEqual(DEFAULT_GRACE_PERIOD_MINUTES);
  });

  it('should respect configuration bounds', () => {
    fc.assert(
      fc.property(gracePeriodMinutesArb, (minutes) => {
        // All generated values should be within bounds
        expect(minutes).toBeGreaterThanOrEqual(MIN_GRACE_PERIOD_MINUTES);
        expect(minutes).toBeLessThanOrEqual(MAX_GRACE_PERIOD_MINUTES);
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should return correct default configuration', () => {
    const config = gracePeriodService.getDefaultConfig();
    
    expect(config.defaultMinutes).toBe(DEFAULT_GRACE_PERIOD_MINUTES);
    expect(config.pomodoroMinutes).toBe(POMODORO_GRACE_PERIOD_MINUTES);
    expect(config.minMinutes).toBe(MIN_GRACE_PERIOD_MINUTES);
    expect(config.maxMinutes).toBe(MAX_GRACE_PERIOD_MINUTES);
    
    // Verify bounds are sensible
    expect(config.minMinutes).toBeLessThanOrEqual(config.defaultMinutes);
    expect(config.defaultMinutes).toBeLessThanOrEqual(config.maxMinutes);
    expect(config.minMinutes).toBeLessThanOrEqual(config.pomodoroMinutes);
    expect(config.pomodoroMinutes).toBeLessThanOrEqual(config.maxMinutes);
  });

  it('should correctly track duration in grace period state', async () => {
    await fc.assert(
      fc.asyncProperty(
        clientIdArb,
        fc.boolean(),
        async (clientId, isInPomodoro) => {
          // Start a grace period
          const startResult = await gracePeriodService.startGracePeriod({
            clientId,
            userId: testUserId,
            isInPomodoro,
          });
          
          expect(startResult.success).toBe(true);
          if (!startResult.success || !startResult.data) return true;
          
          // Get the state
          const state = gracePeriodService.getGracePeriodState(clientId);
          
          expect(state).not.toBeNull();
          if (state) {
            // Duration should match the context
            const expectedDuration = isInPomodoro
              ? POMODORO_GRACE_PERIOD_MINUTES
              : DEFAULT_GRACE_PERIOD_MINUTES;
            
            expect(state.durationMinutes).toBe(expectedDuration);
            expect(state.isInPomodoro).toBe(isInPomodoro);
            
            // Verify the expiry calculation
            const calculatedExpiry = state.startedAt.getTime() + state.durationMinutes * 60 * 1000;
            expect(state.expiresAt.getTime()).toBe(calculatedExpiry);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle multiple clients with different contexts independently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            clientId: clientIdArb,
            isInPomodoro: fc.boolean(),
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (clients) => {
          // Ensure unique client IDs
          const uniqueClients = clients.reduce((acc, client, index) => {
            const uniqueId = `${client.clientId}-${index}`;
            acc.push({ ...client, clientId: uniqueId });
            return acc;
          }, [] as typeof clients);
          
          // Start grace periods for all clients
          for (const client of uniqueClients) {
            await gracePeriodService.startGracePeriod({
              clientId: client.clientId,
              userId: testUserId,
              isInPomodoro: client.isInPomodoro,
            });
          }
          
          // Verify each client has the correct duration
          for (const client of uniqueClients) {
            const state = gracePeriodService.getGracePeriodState(client.clientId);
            
            expect(state).not.toBeNull();
            if (state) {
              const expectedDuration = client.isInPomodoro
                ? POMODORO_GRACE_PERIOD_MINUTES
                : DEFAULT_GRACE_PERIOD_MINUTES;
              
              expect(state.durationMinutes).toBe(expectedDuration);
              expect(state.isInPomodoro).toBe(client.isInPomodoro);
            }
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should list all active grace periods correctly', async () => {
    // Clear any leftover grace periods from previous tests
    gracePeriodService.clearAllGracePeriods();
    
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            clientId: clientIdArb,
            isInPomodoro: fc.boolean(),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (clients) => {
          // Clear before each property test iteration
          gracePeriodService.clearAllGracePeriods();
          
          // Ensure unique client IDs
          const uniqueClients = clients.reduce((acc, client, index) => {
            const uniqueId = `${client.clientId}-${index}`;
            acc.push({ ...client, clientId: uniqueId });
            return acc;
          }, [] as typeof clients);
          
          // Start grace periods for all clients
          for (const client of uniqueClients) {
            await gracePeriodService.startGracePeriod({
              clientId: client.clientId,
              userId: testUserId,
              isInPomodoro: client.isInPomodoro,
            });
          }
          
          // Get all active grace periods
          const allPeriods = gracePeriodService.getAllActiveGracePeriods();
          
          // Should have the same count
          expect(allPeriods.length).toBe(uniqueClients.length);
          
          // Each client should be represented
          for (const client of uniqueClients) {
            const found = allPeriods.find(p => p.clientId === client.clientId);
            expect(found).toBeDefined();
            if (found) {
              expect(found.isInPomodoro).toBe(client.isInPomodoro);
            }
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
