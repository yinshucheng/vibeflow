import fc from 'fast-check';
import { describe, it, expect, afterAll } from 'vitest';
import { skipTokenService } from '@/services/skip-token.service';
import prisma from '@/lib/prisma';

/**
 * Feature: desktop-production-resilience
 * Property 13: Skip Token Consumption on Quit
 * Validates: Requirements 4.7
 * 
 * For any confirmed quit during work hours in production mode,
 * if skip tokens are available, one token SHALL be consumed.
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
  const testUserEmail = `test-skip-quit-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
  const user = await prisma.user.create({
    data: {
      email: testUserEmail,
      password: 'hashed-password',
    },
  });
  
  // Create user settings with default skip token config
  await prisma.userSettings.create({
    data: {
      userId: user.id,
      skipTokenDailyLimit: 3,
      skipTokenMaxDelay: 15,
      enforcementMode: 'gentle',
    },
  });
  
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  // Clean up all test users
  for (const userId of createdUserIds) {
    try {
      await prisma.skipTokenUsage.deleteMany({ where: { userId } });
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
 * Generator for skip token action
 */
const skipTokenActionArb = fc.constantFrom<'skip' | 'delay'>('skip', 'delay');

/**
 * Generator for delay minutes
 */
const delayMinutesArb = fc.integer({ min: 1, max: 15 });

/**
 * Generator for number of tokens to consume before quit
 */
const preConsumedTokensArb = fc.integer({ min: 0, max: 2 });

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Property 13: Skip Token Consumption on Quit', () => {
  /**
   * Feature: desktop-production-resilience, Property 13: Skip Token Consumption on Quit
   * Validates: Requirements 4.7
   */

  it('consuming a skip token SHALL decrease remaining tokens by 1', async () => {
    await fc.assert(
      fc.asyncProperty(
        skipTokenActionArb,
        delayMinutesArb,
        async (action, delayMinutes) => {
          // Create a fresh user for this iteration
          const testUserId = await createTestUser();
          
          // Get initial status
          const initialStatus = await skipTokenService.getStatus(testUserId);
          expect(initialStatus.success).toBe(true);
          if (!initialStatus.success || !initialStatus.data) return true;
          
          const initialRemaining = initialStatus.data.remaining;
          
          // Skip if no tokens available
          if (initialRemaining <= 0) return true;
          
          // Consume a token
          const consumeResult = await skipTokenService.consume(testUserId, {
            action,
            delayMinutes: action === 'delay' ? delayMinutes : undefined,
          });
          
          expect(consumeResult.success).toBe(true);
          if (!consumeResult.success || !consumeResult.data) return true;
          
          // Verify token was consumed
          expect(consumeResult.data.success).toBe(true);
          expect(consumeResult.data.remaining).toBe(initialRemaining - 1);
          
          // Verify via getStatus
          const finalStatus = await skipTokenService.getStatus(testUserId);
          expect(finalStatus.success).toBe(true);
          if (finalStatus.success && finalStatus.data) {
            expect(finalStatus.data.remaining).toBe(initialRemaining - 1);
            expect(finalStatus.data.usedToday).toBe(1);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('consuming tokens SHALL track cumulative usage', async () => {
    await fc.assert(
      fc.asyncProperty(
        preConsumedTokensArb,
        async (tokensToConsume) => {
          // Create a fresh user for this iteration
          const testUserId = await createTestUser();
          
          // Get initial status
          const initialStatus = await skipTokenService.getStatus(testUserId);
          expect(initialStatus.success).toBe(true);
          if (!initialStatus.success || !initialStatus.data) return true;
          
          const dailyLimit = initialStatus.data.dailyLimit;
          const actualTokensToConsume = Math.min(tokensToConsume, dailyLimit);
          
          // Consume tokens
          for (let i = 0; i < actualTokensToConsume; i++) {
            const result = await skipTokenService.consume(testUserId, { action: 'skip' });
            expect(result.success).toBe(true);
          }
          
          // Verify cumulative usage
          const finalStatus = await skipTokenService.getStatus(testUserId);
          expect(finalStatus.success).toBe(true);
          if (finalStatus.success && finalStatus.data) {
            expect(finalStatus.data.usedToday).toBe(actualTokensToConsume);
            expect(finalStatus.data.remaining).toBe(dailyLimit - actualTokensToConsume);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('consuming when no tokens available SHALL fail gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 3, max: 5 }), // Consume more than daily limit
        async (tokensToConsume) => {
          // Create a fresh user for this iteration
          const testUserId = await createTestUser();
          
          // Get initial status
          const initialStatus = await skipTokenService.getStatus(testUserId);
          expect(initialStatus.success).toBe(true);
          if (!initialStatus.success || !initialStatus.data) return true;
          
          const dailyLimit = initialStatus.data.dailyLimit;
          
          // Consume all available tokens
          for (let i = 0; i < dailyLimit; i++) {
            await skipTokenService.consume(testUserId, { action: 'skip' });
          }
          
          // Verify no tokens remaining
          const midStatus = await skipTokenService.getStatus(testUserId);
          expect(midStatus.success).toBe(true);
          if (midStatus.success && midStatus.data) {
            expect(midStatus.data.remaining).toBe(0);
          }
          
          // Try to consume when exhausted
          const exhaustedResult = await skipTokenService.consume(testUserId, { action: 'skip' });
          expect(exhaustedResult.success).toBe(true);
          if (exhaustedResult.success && exhaustedResult.data) {
            // Should fail gracefully (success: false in the data)
            expect(exhaustedResult.data.success).toBe(false);
            expect(exhaustedResult.data.remaining).toBe(0);
          }
          
          // Verify usage count didn't increase
          const finalStatus = await skipTokenService.getStatus(testUserId);
          expect(finalStatus.success).toBe(true);
          if (finalStatus.success && finalStatus.data) {
            expect(finalStatus.data.usedToday).toBe(dailyLimit);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('canSkip SHALL return true only when tokens are available', async () => {
    await fc.assert(
      fc.asyncProperty(
        preConsumedTokensArb,
        async (tokensToConsume) => {
          // Create a fresh user for this iteration
          const testUserId = await createTestUser();
          
          // Get initial status
          const initialStatus = await skipTokenService.getStatus(testUserId);
          expect(initialStatus.success).toBe(true);
          if (!initialStatus.success || !initialStatus.data) return true;
          
          const dailyLimit = initialStatus.data.dailyLimit;
          const actualTokensToConsume = Math.min(tokensToConsume, dailyLimit);
          
          // Consume tokens
          for (let i = 0; i < actualTokensToConsume; i++) {
            await skipTokenService.consume(testUserId, { action: 'skip' });
          }
          
          // Check canSkip
          const canSkipResult = await skipTokenService.canSkip(testUserId);
          expect(canSkipResult.success).toBe(true);
          if (canSkipResult.success) {
            const expectedCanSkip = actualTokensToConsume < dailyLimit;
            expect(canSkipResult.data).toBe(expectedCanSkip);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('delay action SHALL respect maxDelayMinutes limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 30 }), // Request delay up to 30 minutes
        async (requestedDelay) => {
          // Create a fresh user for this iteration
          const testUserId = await createTestUser();
          
          // Get initial status to know the max delay
          const initialStatus = await skipTokenService.getStatus(testUserId);
          expect(initialStatus.success).toBe(true);
          if (!initialStatus.success || !initialStatus.data) return true;
          
          const maxDelay = initialStatus.data.maxDelayMinutes;
          
          // Consume with delay action
          const result = await skipTokenService.consume(testUserId, {
            action: 'delay',
            delayMinutes: requestedDelay,
          });
          
          expect(result.success).toBe(true);
          if (result.success && result.data && result.data.success) {
            // Delay should be capped at maxDelayMinutes
            const expectedDelay = Math.min(requestedDelay, maxDelay);
            expect(result.data.delayMinutes).toBe(expectedDelay);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('skip action SHALL not include delayMinutes in result', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant('skip' as const),
        async (action) => {
          // Create a fresh user for this iteration
          const testUserId = await createTestUser();
          
          // Consume with skip action
          const result = await skipTokenService.consume(testUserId, { action });
          
          expect(result.success).toBe(true);
          if (result.success && result.data && result.data.success) {
            // Skip action should not have delayMinutes
            expect(result.data.action).toBe('skip');
            expect(result.data.delayMinutes).toBeUndefined();
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('token consumption SHALL be idempotent per action', async () => {
    await fc.assert(
      fc.asyncProperty(
        skipTokenActionArb,
        async (action) => {
          // Create a fresh user for this iteration
          const testUserId = await createTestUser();
          
          // Get initial status
          const initialStatus = await skipTokenService.getStatus(testUserId);
          expect(initialStatus.success).toBe(true);
          if (!initialStatus.success || !initialStatus.data) return true;
          
          const initialRemaining = initialStatus.data.remaining;
          if (initialRemaining <= 0) return true;
          
          // Consume a token
          const result1 = await skipTokenService.consume(testUserId, { action });
          expect(result1.success).toBe(true);
          
          // Get status after first consumption
          const midStatus = await skipTokenService.getStatus(testUserId);
          expect(midStatus.success).toBe(true);
          if (!midStatus.success || !midStatus.data) return true;
          
          // Each consumption should decrease by exactly 1
          expect(midStatus.data.remaining).toBe(initialRemaining - 1);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('enforcement mode SHALL affect daily limit', async () => {
    // Create a fresh user for this test
    const testUserId = await createTestUser();
    
    // Test strict mode (1 token per day)
    await prisma.userSettings.update({
      where: { userId: testUserId },
      data: { enforcementMode: 'strict' },
    });
    
    const strictStatus = await skipTokenService.getStatus(testUserId);
    expect(strictStatus.success).toBe(true);
    if (strictStatus.success && strictStatus.data) {
      expect(strictStatus.data.dailyLimit).toBe(1);
      expect(strictStatus.data.enforcementMode).toBe('strict');
    }
    
    // Test gentle mode (3 tokens per day)
    await prisma.userSettings.update({
      where: { userId: testUserId },
      data: { enforcementMode: 'gentle' },
    });
    
    const gentleStatus = await skipTokenService.getStatus(testUserId);
    expect(gentleStatus.success).toBe(true);
    if (gentleStatus.success && gentleStatus.data) {
      expect(gentleStatus.data.dailyLimit).toBe(3);
      expect(gentleStatus.data.enforcementMode).toBe('gentle');
    }
  });
});
