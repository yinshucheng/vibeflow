import fc from 'fast-check';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  demoModeService,
  DEFAULT_DEMO_TOKENS_PER_MONTH,
  MIN_DEMO_TOKENS_PER_MONTH,
  MAX_DEMO_TOKENS_PER_MONTH,
  DEFAULT_CONFIRMATION_PHRASE,
} from '@/services/demo-mode.service';
import prisma from '@/lib/prisma';

/**
 * Feature: desktop-production-resilience
 * Property 6: Demo Token Monthly Limit
 * Validates: Requirements 6.3
 * 
 * For any user, the number of available demo tokens SHALL not exceed the
 * configured monthly limit (default: 3). Tokens SHALL reset at the start
 * of each month.
 */

// =============================================================================
// TEST SETUP
// =============================================================================

let testUserId: string;
let testUserEmail: string;

beforeEach(async () => {
  // Create a unique test user for each test
  testUserEmail = `test-demo-token-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
  const user = await prisma.user.create({
    data: {
      email: testUserEmail,
      password: 'hashed-password',
    },
  });
  testUserId = user.id;
  
  // Create user settings with default demo token configuration
  await prisma.userSettings.create({
    data: {
      userId: testUserId,
      demoTokensPerMonth: DEFAULT_DEMO_TOKENS_PER_MONTH,
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
 * Generator for valid token count configurations
 */
const tokenCountArb = fc.integer({
  min: MIN_DEMO_TOKENS_PER_MONTH,
  max: MAX_DEMO_TOKENS_PER_MONTH,
});

/**
 * Generator for number of activation attempts
 */
const activationAttemptsArb = fc.integer({
  min: 1,
  max: MAX_DEMO_TOKENS_PER_MONTH + 3, // Allow attempts beyond limit
});

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Property 6: Demo Token Monthly Limit', () => {
  /**
   * Feature: desktop-production-resilience, Property 6: Demo Token Monthly Limit
   * Validates: Requirements 6.3
   *
   * For any user, the number of available demo tokens SHALL not exceed the
   * configured monthly limit (default: 3). Tokens SHALL reset at the start
   * of each month.
   */

  it('should never exceed the configured monthly token limit', async () => {
    await fc.assert(
      fc.asyncProperty(tokenCountArb, async (configuredLimit) => {
        // Update user settings with the configured limit
        await prisma.userSettings.update({
          where: { userId: testUserId },
          data: { demoTokensPerMonth: configuredLimit },
        });
        
        // Clean up any existing tokens for this user
        await prisma.demoToken.deleteMany({
          where: { userId: testUserId },
        });
        
        // Get remaining tokens (this will allocate them)
        const result = await demoModeService.getRemainingTokens(testUserId);
        
        expect(result.success).toBe(true);
        if (result.success && result.data !== undefined) {
          // Remaining tokens should never exceed the configured limit
          expect(result.data).toBeLessThanOrEqual(configuredLimit);
          // Initially should equal the configured limit
          expect(result.data).toBe(configuredLimit);
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should decrease available tokens after each activation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: DEFAULT_DEMO_TOKENS_PER_MONTH }),
        async (activationsToPerform) => {
          // Clean up any existing tokens and events
          await prisma.demoModeEvent.deleteMany({
            where: { userId: testUserId },
          });
          await prisma.demoToken.deleteMany({
            where: { userId: testUserId },
          });
          
          // Get initial token count
          const initialResult = await demoModeService.getRemainingTokens(testUserId);
          expect(initialResult.success).toBe(true);
          const initialTokens = initialResult.data!;
          
          // Perform activations
          for (let i = 0; i < activationsToPerform; i++) {
            // Activate demo mode
            const activateResult = await demoModeService.activateDemoMode({
              userId: testUserId,
              confirmPhrase: DEFAULT_CONFIRMATION_PHRASE,
            });
            
            if (activateResult.success) {
              // Deactivate immediately to allow next activation
              await demoModeService.deactivateDemoMode(testUserId);
            }
          }
          
          // Get remaining tokens
          const finalResult = await demoModeService.getRemainingTokens(testUserId);
          expect(finalResult.success).toBe(true);
          
          // Remaining tokens should be initial minus activations performed
          const expectedRemaining = Math.max(0, initialTokens - activationsToPerform);
          expect(finalResult.data).toBe(expectedRemaining);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should reject activation when no tokens are available', async () => {
    // Clean up any existing tokens and events
    await prisma.demoModeEvent.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.demoToken.deleteMany({
      where: { userId: testUserId },
    });
    
    // Use all available tokens
    for (let i = 0; i < DEFAULT_DEMO_TOKENS_PER_MONTH; i++) {
      const activateResult = await demoModeService.activateDemoMode({
        userId: testUserId,
        confirmPhrase: DEFAULT_CONFIRMATION_PHRASE,
      });
      
      if (activateResult.success) {
        await demoModeService.deactivateDemoMode(testUserId);
      }
    }
    
    // Verify no tokens remaining
    const remainingResult = await demoModeService.getRemainingTokens(testUserId);
    expect(remainingResult.success).toBe(true);
    expect(remainingResult.data).toBe(0);
    
    // Try to activate again - should fail
    const failedActivation = await demoModeService.activateDemoMode({
      userId: testUserId,
      confirmPhrase: DEFAULT_CONFIRMATION_PHRASE,
    });
    
    expect(failedActivation.success).toBe(false);
    expect(failedActivation.error?.code).toBe('VALIDATION_ERROR');
    expect(failedActivation.error?.message).toContain('No demo tokens available');
  });

  it('should allocate exactly the configured number of tokens', async () => {
    await fc.assert(
      fc.asyncProperty(tokenCountArb, async (configuredLimit) => {
        // Update user settings with the configured limit
        await prisma.userSettings.update({
          where: { userId: testUserId },
          data: { demoTokensPerMonth: configuredLimit },
        });
        
        // Clean up any existing tokens
        await prisma.demoToken.deleteMany({
          where: { userId: testUserId },
        });
        
        // Trigger token allocation by getting remaining tokens
        await demoModeService.getRemainingTokens(testUserId);
        
        // Count allocated tokens in database
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        
        const tokenCount = await prisma.demoToken.count({
          where: {
            userId: testUserId,
            allocatedAt: {
              gte: monthStart,
              lt: monthEnd,
            },
          },
        });
        
        // Should have exactly the configured number of tokens
        expect(tokenCount).toBe(configuredLimit);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should not allocate more tokens when called multiple times', async () => {
    // Clean up any existing tokens
    await prisma.demoToken.deleteMany({
      where: { userId: testUserId },
    });
    
    // Call getRemainingTokens multiple times
    for (let i = 0; i < 5; i++) {
      await demoModeService.getRemainingTokens(testUserId);
    }
    
    // Count allocated tokens
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    
    const tokenCount = await prisma.demoToken.count({
      where: {
        userId: testUserId,
        allocatedAt: {
          gte: monthStart,
          lt: monthEnd,
        },
      },
    });
    
    // Should still have exactly the default number of tokens
    expect(tokenCount).toBe(DEFAULT_DEMO_TOKENS_PER_MONTH);
  });

  it('should respect token limit bounds', () => {
    fc.assert(
      fc.property(tokenCountArb, (tokenCount) => {
        // All generated values should be within bounds
        expect(tokenCount).toBeGreaterThanOrEqual(MIN_DEMO_TOKENS_PER_MONTH);
        expect(tokenCount).toBeLessThanOrEqual(MAX_DEMO_TOKENS_PER_MONTH);
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should return correct default configuration', () => {
    const config = demoModeService.getDefaultConfig();
    
    expect(config.tokensPerMonth).toBe(DEFAULT_DEMO_TOKENS_PER_MONTH);
    
    // Verify bounds are sensible
    expect(MIN_DEMO_TOKENS_PER_MONTH).toBeLessThanOrEqual(config.tokensPerMonth);
    expect(config.tokensPerMonth).toBeLessThanOrEqual(MAX_DEMO_TOKENS_PER_MONTH);
  });

  it('should track token usage in history', async () => {
    // Clean up any existing tokens and events
    await prisma.demoModeEvent.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.demoToken.deleteMany({
      where: { userId: testUserId },
    });
    
    // Activate and deactivate demo mode once
    const activateResult = await demoModeService.activateDemoMode({
      userId: testUserId,
      confirmPhrase: DEFAULT_CONFIRMATION_PHRASE,
    });
    
    expect(activateResult.success).toBe(true);
    
    await demoModeService.deactivateDemoMode(testUserId);
    
    // Get history
    const historyResult = await demoModeService.getDemoModeHistory(testUserId);
    
    expect(historyResult.success).toBe(true);
    if (historyResult.success && historyResult.data) {
      expect(historyResult.data.totalUsedThisMonth).toBe(1);
      expect(historyResult.data.tokens.length).toBeGreaterThanOrEqual(1);
      
      // Find the used token
      const usedToken = historyResult.data.tokens.find(t => t.usedAt !== null);
      expect(usedToken).toBeDefined();
    }
  });

  it('should provide next reset date', () => {
    const resetDate = demoModeService.getNextTokenResetDate();
    const now = new Date();
    
    // Reset date should be the start of next month
    const expectedResetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    
    expect(resetDate.getFullYear()).toBe(expectedResetDate.getFullYear());
    expect(resetDate.getMonth()).toBe(expectedResetDate.getMonth());
    expect(resetDate.getDate()).toBe(1);
  });
});
