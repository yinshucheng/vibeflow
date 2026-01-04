import fc from 'fast-check';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  demoModeService,
  DEFAULT_CONFIRMATION_PHRASE,
} from '@/services/demo-mode.service';
import prisma from '@/lib/prisma';

/**
 * Feature: desktop-production-resilience
 * Property 9: Demo Mode Activation Restriction
 * Validates: Requirements 7.5
 * 
 * For any demo mode activation attempt during an active pomodoro session,
 * the activation SHALL be rejected.
 */

// =============================================================================
// TEST SETUP
// =============================================================================

let testUserId: string;
let testUserEmail: string;
let testProjectId: string;
let testTaskId: string;

beforeEach(async () => {
  // Create a unique test user for each test
  testUserEmail = `test-demo-activation-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
  const user = await prisma.user.create({
    data: {
      email: testUserEmail,
      password: 'hashed-password',
    },
  });
  testUserId = user.id;
  
  // Create user settings with demo mode configuration
  await prisma.userSettings.create({
    data: {
      userId: testUserId,
      demoTokensPerMonth: 10, // Allow many activations for testing
    },
  });
  
  // Create a project and task for pomodoro tests
  const project = await prisma.project.create({
    data: {
      title: 'Test Project',
      deliverable: 'Test deliverable',
      userId: testUserId,
    },
  });
  testProjectId = project.id;
  
  const task = await prisma.task.create({
    data: {
      title: 'Test Task',
      projectId: testProjectId,
      userId: testUserId,
    },
  });
  testTaskId = task.id;
});

afterEach(async () => {
  // Clean up test data
  if (testUserId) {
    // Delete pomodoros
    await prisma.pomodoro.deleteMany({
      where: { userId: testUserId },
    }).catch(() => {});
    
    // Delete tasks
    await prisma.task.deleteMany({
      where: { userId: testUserId },
    }).catch(() => {});
    
    // Delete projects
    await prisma.project.deleteMany({
      where: { userId: testUserId },
    }).catch(() => {});
    
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
 * Generator for pomodoro durations
 */
const pomodoroDurationArb = fc.integer({ min: 10, max: 120 });

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Property 9: Demo Mode Activation Restriction', () => {
  /**
   * Feature: desktop-production-resilience, Property 9: Demo Mode Activation Restriction
   * Validates: Requirements 7.5
   *
   * For any demo mode activation attempt during an active pomodoro session,
   * the activation SHALL be rejected.
   */

  it('should reject demo mode activation during active pomodoro', async () => {
    await fc.assert(
      fc.asyncProperty(pomodoroDurationArb, async (duration) => {
        // Clean up any existing tokens and events
        await prisma.demoModeEvent.deleteMany({
          where: { userId: testUserId },
        });
        await prisma.demoToken.deleteMany({
          where: { userId: testUserId },
        });
        await prisma.pomodoro.deleteMany({
          where: { userId: testUserId },
        });
        
        // Start a pomodoro
        await prisma.pomodoro.create({
          data: {
            userId: testUserId,
            taskId: testTaskId,
            duration,
            status: 'IN_PROGRESS',
          },
        });
        
        // Try to activate demo mode
        const activateResult = await demoModeService.activateDemoMode({
          userId: testUserId,
          confirmPhrase: DEFAULT_CONFIRMATION_PHRASE,
        });
        
        // Should be rejected
        expect(activateResult.success).toBe(false);
        expect(activateResult.error?.code).toBe('VALIDATION_ERROR');
        expect(activateResult.error?.message).toContain('pomodoro');
        
        return true;
      }),
      { numRuns: 50 }
    );
  });

  it('should allow demo mode activation when no pomodoro is active', async () => {
    // Clean up any existing tokens, events, and pomodoros
    await prisma.demoModeEvent.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.demoToken.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.pomodoro.deleteMany({
      where: { userId: testUserId },
    });
    
    // Verify no active pomodoro
    const activePomodoro = await prisma.pomodoro.findFirst({
      where: {
        userId: testUserId,
        status: 'IN_PROGRESS',
      },
    });
    expect(activePomodoro).toBeNull();
    
    // Try to activate demo mode
    const activateResult = await demoModeService.activateDemoMode({
      userId: testUserId,
      confirmPhrase: DEFAULT_CONFIRMATION_PHRASE,
    });
    
    // Should succeed
    expect(activateResult.success).toBe(true);
    
    // Clean up
    await demoModeService.deactivateDemoMode(testUserId);
  });

  it('should allow demo mode activation after pomodoro is completed', async () => {
    // Clean up any existing tokens, events, and pomodoros
    await prisma.demoModeEvent.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.demoToken.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.pomodoro.deleteMany({
      where: { userId: testUserId },
    });
    
    // Start a pomodoro
    const pomodoro = await prisma.pomodoro.create({
      data: {
        userId: testUserId,
        taskId: testTaskId,
        duration: 25,
        status: 'IN_PROGRESS',
      },
    });
    
    // Complete the pomodoro
    await prisma.pomodoro.update({
      where: { id: pomodoro.id },
      data: {
        status: 'COMPLETED',
        endTime: new Date(),
      },
    });
    
    // Try to activate demo mode
    const activateResult = await demoModeService.activateDemoMode({
      userId: testUserId,
      confirmPhrase: DEFAULT_CONFIRMATION_PHRASE,
    });
    
    // Should succeed
    expect(activateResult.success).toBe(true);
    
    // Clean up
    await demoModeService.deactivateDemoMode(testUserId);
  });

  it('should allow demo mode activation after pomodoro is aborted', async () => {
    // Clean up any existing tokens, events, and pomodoros
    await prisma.demoModeEvent.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.demoToken.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.pomodoro.deleteMany({
      where: { userId: testUserId },
    });
    
    // Start a pomodoro
    const pomodoro = await prisma.pomodoro.create({
      data: {
        userId: testUserId,
        taskId: testTaskId,
        duration: 25,
        status: 'IN_PROGRESS',
      },
    });
    
    // Abort the pomodoro
    await prisma.pomodoro.update({
      where: { id: pomodoro.id },
      data: {
        status: 'ABORTED',
        endTime: new Date(),
      },
    });
    
    // Try to activate demo mode
    const activateResult = await demoModeService.activateDemoMode({
      userId: testUserId,
      confirmPhrase: DEFAULT_CONFIRMATION_PHRASE,
    });
    
    // Should succeed
    expect(activateResult.success).toBe(true);
    
    // Clean up
    await demoModeService.deactivateDemoMode(testUserId);
  });

  it('should report pomodoro status in canActivateDemoMode check', async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (hasActivePomodoro) => {
        // Clean up any existing tokens, events, and pomodoros
        await prisma.demoModeEvent.deleteMany({
          where: { userId: testUserId },
        });
        await prisma.demoToken.deleteMany({
          where: { userId: testUserId },
        });
        await prisma.pomodoro.deleteMany({
          where: { userId: testUserId },
        });
        
        if (hasActivePomodoro) {
          // Start a pomodoro
          await prisma.pomodoro.create({
            data: {
              userId: testUserId,
              taskId: testTaskId,
              duration: 25,
              status: 'IN_PROGRESS',
            },
          });
        }
        
        // Check if can activate
        const canActivateResult = await demoModeService.canActivateDemoMode(testUserId);
        
        expect(canActivateResult.success).toBe(true);
        if (canActivateResult.success && canActivateResult.data) {
          expect(canActivateResult.data.hasActivePomodoro).toBe(hasActivePomodoro);
          
          if (hasActivePomodoro) {
            expect(canActivateResult.data.canActivate).toBe(false);
            expect(canActivateResult.data.reason).toContain('pomodoro');
          }
        }
        
        return true;
      }),
      { numRuns: 50 }
    );
  });

  it('should reject activation with wrong confirmation phrase', async () => {
    // Clean up any existing tokens, events, and pomodoros
    await prisma.demoModeEvent.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.demoToken.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.pomodoro.deleteMany({
      where: { userId: testUserId },
    });
    
    // Try to activate with wrong phrase
    const activateResult = await demoModeService.activateDemoMode({
      userId: testUserId,
      confirmPhrase: 'wrong phrase',
    });
    
    // Should be rejected
    expect(activateResult.success).toBe(false);
    expect(activateResult.error?.code).toBe('VALIDATION_ERROR');
    expect(activateResult.error?.message).toContain('confirmation phrase');
  });

  it('should reject activation when already in demo mode', async () => {
    // Clean up any existing tokens, events, and pomodoros
    await prisma.demoModeEvent.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.demoToken.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.pomodoro.deleteMany({
      where: { userId: testUserId },
    });
    
    // Activate demo mode
    const firstActivation = await demoModeService.activateDemoMode({
      userId: testUserId,
      confirmPhrase: DEFAULT_CONFIRMATION_PHRASE,
    });
    
    expect(firstActivation.success).toBe(true);
    
    // Try to activate again
    const secondActivation = await demoModeService.activateDemoMode({
      userId: testUserId,
      confirmPhrase: DEFAULT_CONFIRMATION_PHRASE,
    });
    
    // Should be rejected
    expect(secondActivation.success).toBe(false);
    expect(secondActivation.error?.code).toBe('CONFLICT');
    expect(secondActivation.error?.message).toContain('already active');
    
    // Clean up
    await demoModeService.deactivateDemoMode(testUserId);
  });

  it('should provide comprehensive activation check', async () => {
    // Clean up any existing tokens, events, and pomodoros
    await prisma.demoModeEvent.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.demoToken.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.pomodoro.deleteMany({
      where: { userId: testUserId },
    });
    
    // Check activation status
    const canActivateResult = await demoModeService.canActivateDemoMode(testUserId);
    
    expect(canActivateResult.success).toBe(true);
    if (canActivateResult.success && canActivateResult.data) {
      // Should have all required fields
      expect(canActivateResult.data).toHaveProperty('canActivate');
      expect(canActivateResult.data).toHaveProperty('remainingTokens');
      expect(canActivateResult.data).toHaveProperty('hasActivePomodoro');
      expect(canActivateResult.data).toHaveProperty('isAlreadyActive');
      expect(canActivateResult.data).toHaveProperty('nextResetDate');
      
      // With no pomodoro and tokens available, should be able to activate
      expect(canActivateResult.data.canActivate).toBe(true);
      expect(canActivateResult.data.hasActivePomodoro).toBe(false);
      expect(canActivateResult.data.isAlreadyActive).toBe(false);
      expect(canActivateResult.data.remainingTokens).toBeGreaterThan(0);
    }
  });

  it('should handle multiple pomodoro states correctly', async () => {
    // Clean up any existing tokens, events, and pomodoros
    await prisma.demoModeEvent.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.demoToken.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.pomodoro.deleteMany({
      where: { userId: testUserId },
    });
    
    // Create pomodoros in different states
    await prisma.pomodoro.createMany({
      data: [
        {
          userId: testUserId,
          taskId: testTaskId,
          duration: 25,
          status: 'COMPLETED',
          endTime: new Date(),
        },
        {
          userId: testUserId,
          taskId: testTaskId,
          duration: 25,
          status: 'ABORTED',
          endTime: new Date(),
        },
        {
          userId: testUserId,
          taskId: testTaskId,
          duration: 25,
          status: 'INTERRUPTED',
          endTime: new Date(),
        },
      ],
    });
    
    // Should be able to activate (no IN_PROGRESS pomodoro)
    const activateResult = await demoModeService.activateDemoMode({
      userId: testUserId,
      confirmPhrase: DEFAULT_CONFIRMATION_PHRASE,
    });
    
    expect(activateResult.success).toBe(true);
    
    // Clean up
    await demoModeService.deactivateDemoMode(testUserId);
  });

  it('should only check for IN_PROGRESS pomodoros', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('COMPLETED', 'ABORTED', 'INTERRUPTED'),
        async (status) => {
          // Clean up any existing tokens, events, and pomodoros
          await prisma.demoModeEvent.deleteMany({
            where: { userId: testUserId },
          });
          await prisma.demoToken.deleteMany({
            where: { userId: testUserId },
          });
          await prisma.pomodoro.deleteMany({
            where: { userId: testUserId },
          });
          
          // Create a pomodoro with non-active status
          await prisma.pomodoro.create({
            data: {
              userId: testUserId,
              taskId: testTaskId,
              duration: 25,
              status: status as 'COMPLETED' | 'ABORTED' | 'INTERRUPTED',
              endTime: new Date(),
            },
          });
          
          // Should be able to activate
          const activateResult = await demoModeService.activateDemoMode({
            userId: testUserId,
            confirmPhrase: DEFAULT_CONFIRMATION_PHRASE,
          });
          
          expect(activateResult.success).toBe(true);
          
          // Clean up
          await demoModeService.deactivateDemoMode(testUserId);
          
          return true;
        }
      ),
      { numRuns: 30 }
    );
  });
});
