import fc from 'fast-check';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  demoModeService,
  DEFAULT_DEMO_MAX_DURATION_MINUTES,
  MIN_DEMO_DURATION_MINUTES,
  MAX_DEMO_DURATION_MINUTES,
  DEFAULT_CONFIRMATION_PHRASE,
} from '@/services/demo-mode.service';
import prisma from '@/lib/prisma';

/**
 * Feature: desktop-production-resilience
 * Property 7: Demo Mode Duration Limit
 * Validates: Requirements 6.4, 6.6
 * 
 * For any active demo mode session, the duration SHALL not exceed the
 * configured maximum (default: 90 minutes). The system SHALL automatically
 * exit demo mode when the duration expires.
 */

// =============================================================================
// TEST SETUP
// =============================================================================

let testUserId: string;
let testUserEmail: string;

beforeEach(async () => {
  // Create a unique test user for each test
  testUserEmail = `test-demo-duration-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
  const user = await prisma.user.create({
    data: {
      email: testUserEmail,
      password: 'hashed-password',
    },
  });
  testUserId = user.id;
  
  // Create user settings with default demo mode configuration
  await prisma.userSettings.create({
    data: {
      userId: testUserId,
      demoTokensPerMonth: 10, // Allow many activations for testing
      demoMaxDurationMinutes: DEFAULT_DEMO_MAX_DURATION_MINUTES,
    },
  });
});

afterEach(async () => {
  // Clean up test data
  if (testUserId) {
    // Delete demo mode events
    await prisma.demoModeEvent.deleteMany({
      where: { userId: testUserId },
    }).catch(() => {});
    
    // Delete demo tokens
    await prisma.demoToken.deleteMany({
      where: { userId: testUserId },
    }).catch(() => {});
    
    // Delete user settings
    await prisma.userSettings.deleteMany({
      where: { userId: testUserId },
    }).catch(() => {});
    
    // Delete the user
    await prisma.user.delete({
      where: { id: testUserId },
    }).catch(() => {});
  }
});

// =============================================================================
// GENERATORS
// =============================================================================

/**
 * Generator for valid duration configurations
 */
const durationMinutesArb = fc.integer({
  min: MIN_DEMO_DURATION_MINUTES,
  max: MAX_DEMO_DURATION_MINUTES,
});

/**
 * Generator for requested durations (may exceed max)
 */
const requestedDurationArb = fc.integer({
  min: 1,
  max: MAX_DEMO_DURATION_MINUTES + 60, // Allow requests beyond max
});

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Property 7: Demo Mode Duration Limit', () => {
  /**
   * Feature: desktop-production-resilience, Property 7: Demo Mode Duration Limit
   * Validates: Requirements 6.4, 6.6
   *
   * For any active demo mode session, the duration SHALL not exceed the
   * configured maximum (default: 90 minutes). The system SHALL automatically
   * exit demo mode when the duration expires.
   */

  it('should never exceed the configured maximum duration', async () => {
    await fc.assert(
      fc.asyncProperty(
        durationMinutesArb,
        requestedDurationArb,
        async (configuredMax, requestedDuration) => {
          // Clean up any existing tokens and events
          await prisma.demoModeEvent.deleteMany({
            where: { userId: testUserId },
          });
          await prisma.demoToken.deleteMany({
            where: { userId: testUserId },
          });
          
          // Update user settings with the configured max duration
          await prisma.userSettings.update({
            where: { userId: testUserId },
            data: { demoMaxDurationMinutes: configuredMax },
          });
          
          // Activate demo mode with requested duration
          const activateResult = await demoModeService.activateDemoMode({
            userId: testUserId,
            confirmPhrase: DEFAULT_CONFIRMATION_PHRASE,
            durationMinutes: requestedDuration,
          });
          
          if (activateResult.success && activateResult.data) {
            // The remaining minutes should never exceed the configured max
            expect(activateResult.data.remainingMinutes).toBeLessThanOrEqual(configuredMax);
            
            // If requested duration was within limits, it should be used
            if (requestedDuration <= configuredMax && requestedDuration >= MIN_DEMO_DURATION_MINUTES) {
              expect(activateResult.data.remainingMinutes).toBe(requestedDuration);
            } else if (requestedDuration > configuredMax) {
              // If requested exceeded max, should be capped at max
              expect(activateResult.data.remainingMinutes).toBe(configuredMax);
            }
            
            // Clean up
            await demoModeService.deactivateDemoMode(testUserId);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should calculate correct expiry time based on duration', async () => {
    await fc.assert(
      fc.asyncProperty(durationMinutesArb, async (configuredMax) => {
        // Clean up any existing tokens and events
        await prisma.demoModeEvent.deleteMany({
          where: { userId: testUserId },
        });
        await prisma.demoToken.deleteMany({
          where: { userId: testUserId },
        });
        
        // Update user settings
        await prisma.userSettings.update({
          where: { userId: testUserId },
          data: { demoMaxDurationMinutes: configuredMax },
        });
        
        // Activate demo mode
        const activateResult = await demoModeService.activateDemoMode({
          userId: testUserId,
          confirmPhrase: DEFAULT_CONFIRMATION_PHRASE,
        });
        
        if (activateResult.success && activateResult.data) {
          const { startedAt, expiresAt, remainingMinutes } = activateResult.data;
          
          expect(startedAt).not.toBeNull();
          expect(expiresAt).not.toBeNull();
          expect(remainingMinutes).not.toBeNull();
          
          if (startedAt && expiresAt && remainingMinutes !== null) {
            // Expiry should be startedAt + duration
            const expectedExpiryMs = startedAt.getTime() + remainingMinutes * 60 * 1000;
            expect(expiresAt.getTime()).toBe(expectedExpiryMs);
            
            // Duration should not exceed configured max
            expect(remainingMinutes).toBeLessThanOrEqual(configuredMax);
          }
          
          // Clean up
          await demoModeService.deactivateDemoMode(testUserId);
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should auto-expire demo mode when duration is exceeded', async () => {
    // Clean up any existing tokens and events
    await prisma.demoModeEvent.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.demoToken.deleteMany({
      where: { userId: testUserId },
    });
    
    // Activate demo mode
    const activateResult = await demoModeService.activateDemoMode({
      userId: testUserId,
      confirmPhrase: DEFAULT_CONFIRMATION_PHRASE,
    });
    
    expect(activateResult.success).toBe(true);
    if (!activateResult.success || !activateResult.data) return;
    
    const tokenId = activateResult.data.activeTokenId;
    expect(tokenId).not.toBeNull();
    
    // Manually set the token's usedAt to be in the past (beyond max duration)
    const pastTime = new Date(Date.now() - (DEFAULT_DEMO_MAX_DURATION_MINUTES + 10) * 60 * 1000);
    await prisma.demoToken.update({
      where: { id: tokenId! },
      data: { usedAt: pastTime },
    });
    
    // Get demo mode state - should auto-expire
    const stateResult = await demoModeService.getDemoModeState(testUserId);
    
    expect(stateResult.success).toBe(true);
    if (stateResult.success && stateResult.data) {
      // Demo mode should no longer be active
      expect(stateResult.data.isActive).toBe(false);
      expect(stateResult.data.activeTokenId).toBeNull();
    }
    
    // Verify the token was ended
    const token = await prisma.demoToken.findUnique({
      where: { id: tokenId! },
    });
    
    expect(token?.endedAt).not.toBeNull();
    
    // Verify an expired event was created
    const expiredEvent = await prisma.demoModeEvent.findFirst({
      where: {
        tokenId: tokenId!,
        eventType: 'expired',
      },
    });
    
    expect(expiredEvent).not.toBeNull();
    expect(expiredEvent?.reason).toBe('duration_expired');
  });

  it('should respect duration bounds', () => {
    fc.assert(
      fc.property(durationMinutesArb, (duration) => {
        // All generated values should be within bounds
        expect(duration).toBeGreaterThanOrEqual(MIN_DEMO_DURATION_MINUTES);
        expect(duration).toBeLessThanOrEqual(MAX_DEMO_DURATION_MINUTES);
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should return correct default duration configuration', () => {
    const config = demoModeService.getDefaultConfig();
    
    expect(config.maxDurationMinutes).toBe(DEFAULT_DEMO_MAX_DURATION_MINUTES);
    
    // Verify bounds are sensible
    expect(MIN_DEMO_DURATION_MINUTES).toBeLessThanOrEqual(config.maxDurationMinutes);
    expect(config.maxDurationMinutes).toBeLessThanOrEqual(MAX_DEMO_DURATION_MINUTES);
  });

  it('should track remaining time correctly in state', async () => {
    // Clean up any existing tokens and events
    await prisma.demoModeEvent.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.demoToken.deleteMany({
      where: { userId: testUserId },
    });
    
    // Activate demo mode
    const activateResult = await demoModeService.activateDemoMode({
      userId: testUserId,
      confirmPhrase: DEFAULT_CONFIRMATION_PHRASE,
    });
    
    expect(activateResult.success).toBe(true);
    if (!activateResult.success) return;
    
    // Get state immediately
    const stateResult = await demoModeService.getDemoModeState(testUserId);
    
    expect(stateResult.success).toBe(true);
    if (stateResult.success && stateResult.data) {
      expect(stateResult.data.isActive).toBe(true);
      expect(stateResult.data.remainingMinutes).not.toBeNull();
      
      // Remaining time should be close to max duration (within 1 minute tolerance)
      expect(stateResult.data.remainingMinutes).toBeLessThanOrEqual(DEFAULT_DEMO_MAX_DURATION_MINUTES);
      expect(stateResult.data.remainingMinutes).toBeGreaterThanOrEqual(DEFAULT_DEMO_MAX_DURATION_MINUTES - 1);
    }
    
    // Clean up
    await demoModeService.deactivateDemoMode(testUserId);
  });

  it('should record duration in token when deactivated', async () => {
    // Clean up any existing tokens and events
    await prisma.demoModeEvent.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.demoToken.deleteMany({
      where: { userId: testUserId },
    });
    
    // Activate demo mode
    const activateResult = await demoModeService.activateDemoMode({
      userId: testUserId,
      confirmPhrase: DEFAULT_CONFIRMATION_PHRASE,
    });
    
    expect(activateResult.success).toBe(true);
    if (!activateResult.success || !activateResult.data) return;
    
    const tokenId = activateResult.data.activeTokenId;
    
    // Wait a tiny bit to ensure some duration
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Deactivate
    const deactivateResult = await demoModeService.deactivateDemoMode(testUserId);
    expect(deactivateResult.success).toBe(true);
    
    // Check the token has duration recorded
    const token = await prisma.demoToken.findUnique({
      where: { id: tokenId! },
    });
    
    expect(token?.endedAt).not.toBeNull();
    expect(token?.durationMinutes).not.toBeNull();
    expect(token?.durationMinutes).toBeGreaterThanOrEqual(0);
    expect(token?.durationMinutes).toBeLessThanOrEqual(DEFAULT_DEMO_MAX_DURATION_MINUTES);
  });

  it('should process expired demo modes correctly', async () => {
    // Clean up any existing tokens and events
    await prisma.demoModeEvent.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.demoToken.deleteMany({
      where: { userId: testUserId },
    });
    
    // Activate demo mode
    const activateResult = await demoModeService.activateDemoMode({
      userId: testUserId,
      confirmPhrase: DEFAULT_CONFIRMATION_PHRASE,
    });
    
    expect(activateResult.success).toBe(true);
    if (!activateResult.success || !activateResult.data) return;
    
    const tokenId = activateResult.data.activeTokenId;
    
    // Manually set the token's usedAt to be in the past
    const pastTime = new Date(Date.now() - (DEFAULT_DEMO_MAX_DURATION_MINUTES + 5) * 60 * 1000);
    await prisma.demoToken.update({
      where: { id: tokenId! },
      data: { usedAt: pastTime },
    });
    
    // Process expired demo modes
    const processResult = await demoModeService.processExpiredDemoModes();
    
    expect(processResult.success).toBe(true);
    if (processResult.success && processResult.data) {
      expect(processResult.data.processed).toBeGreaterThanOrEqual(1);
    }
    
    // Verify the token was ended
    const token = await prisma.demoToken.findUnique({
      where: { id: tokenId! },
    });
    
    expect(token?.endedAt).not.toBeNull();
  });

  it('should cap duration at configured maximum even when requesting more', async () => {
    await fc.assert(
      fc.asyncProperty(
        durationMinutesArb,
        fc.integer({ min: MAX_DEMO_DURATION_MINUTES + 1, max: MAX_DEMO_DURATION_MINUTES + 100 }),
        async (configuredMax, excessiveDuration) => {
          // Clean up any existing tokens and events
          await prisma.demoModeEvent.deleteMany({
            where: { userId: testUserId },
          });
          await prisma.demoToken.deleteMany({
            where: { userId: testUserId },
          });
          
          // Update user settings
          await prisma.userSettings.update({
            where: { userId: testUserId },
            data: { demoMaxDurationMinutes: configuredMax },
          });
          
          // Try to activate with excessive duration
          const activateResult = await demoModeService.activateDemoMode({
            userId: testUserId,
            confirmPhrase: DEFAULT_CONFIRMATION_PHRASE,
            durationMinutes: excessiveDuration,
          });
          
          // Should either fail validation or cap at max
          if (activateResult.success && activateResult.data) {
            // Duration should be capped at configured max
            expect(activateResult.data.remainingMinutes).toBeLessThanOrEqual(configuredMax);
            
            // Clean up
            await demoModeService.deactivateDemoMode(testUserId);
          }
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});
