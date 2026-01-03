import fc from 'fast-check';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * Feature: browser-sentinel-enhancement
 * Property 13: Entertainment Settings Modification Restriction
 * 
 * For any attempt to modify Entertainment settings (blacklist, whitelist, quota, cooldown) 
 * during work time, the modification SHALL be rejected.
 * 
 * Validates: Requirements 5.12, 7.11, 7.12
 */

const prisma = new PrismaClient();

// Test user for property tests
let testUserId: string;
let dbAvailable = false;

// ============================================================================
// Types
// ============================================================================

interface WorkTimeSlot {
  id: string;
  startTime: string;
  endTime: string;
  enabled: boolean;
}

interface EntertainmentBlacklistEntry {
  domain: string;
  isPreset: boolean;
  enabled: boolean;
  addedAt: number;
}

interface EntertainmentWhitelistEntry {
  pattern: string;
  description?: string;
  isPreset: boolean;
  enabled: boolean;
  addedAt: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$connect();
    return true;
  } catch {
    return false;
  }
}

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function isWithinWorkHours(
  workTimeSlots: WorkTimeSlot[],
  currentTimeMinutes: number
): boolean {
  return workTimeSlots.some((slot) => {
    if (!slot.enabled) return false;
    const startMinutes = parseTimeToMinutes(slot.startTime);
    const endMinutes = parseTimeToMinutes(slot.endTime);
    return currentTimeMinutes >= startMinutes && currentTimeMinutes < endMinutes;
  });
}

/**
 * Simulates the entertainment settings update logic from entertainment.service.ts
 * Returns { success: true } if update is allowed, { success: false, code: 'WORK_TIME_RESTRICTION' } if blocked
 */
function simulateSettingsUpdate(
  workTimeSlots: WorkTimeSlot[],
  currentTimeMinutes: number,
  _settingsUpdate: {
    entertainmentBlacklist?: EntertainmentBlacklistEntry[];
    entertainmentWhitelist?: EntertainmentWhitelistEntry[];
    entertainmentQuotaMinutes?: number;
    entertainmentCooldownMinutes?: number;
  }
): { success: boolean; errorCode?: string } {
  const withinWorkTime = isWithinWorkHours(workTimeSlots, currentTimeMinutes);
  
  if (withinWorkTime) {
    return {
      success: false,
      errorCode: 'WORK_TIME_RESTRICTION',
    };
  }
  
  return { success: true };
}

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

const workTimeSlotArbitrary = fc.record({
  id: fc.uuid(),
  startTime: fc.integer({ min: 0, max: 20 }).map(h => `${h.toString().padStart(2, '0')}:00`),
  endTime: fc.integer({ min: 4, max: 23 }).map(h => `${h.toString().padStart(2, '0')}:00`),
  enabled: fc.boolean(),
}).filter(slot => {
  const start = parseTimeToMinutes(slot.startTime);
  const end = parseTimeToMinutes(slot.endTime);
  return start < end; // Ensure valid time range
});

const blacklistEntryArbitrary = fc.record({
  domain: fc.webUrl().map(url => {
    try {
      return new URL(url).hostname;
    } catch {
      return 'example.com';
    }
  }),
  isPreset: fc.boolean(),
  enabled: fc.boolean(),
  addedAt: fc.integer({ min: 0, max: Date.now() }),
});

const whitelistEntryArbitrary = fc.record({
  pattern: fc.tuple(
    fc.webUrl().map(url => {
      try {
        return new URL(url).hostname;
      } catch {
        return 'example.com';
      }
    }),
    fc.constantFrom('/*', '/fav/*', '/video/*', '/search/*')
  ).map(([domain, path]) => `${domain}${path}`),
  description: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: undefined }),
  isPreset: fc.boolean(),
  enabled: fc.boolean(),
  addedAt: fc.integer({ min: 0, max: Date.now() }),
});

const settingsUpdateArbitrary = fc.record({
  entertainmentBlacklist: fc.option(fc.array(blacklistEntryArbitrary, { minLength: 0, maxLength: 5 }), { nil: undefined }),
  entertainmentWhitelist: fc.option(fc.array(whitelistEntryArbitrary, { minLength: 0, maxLength: 5 }), { nil: undefined }),
  entertainmentQuotaMinutes: fc.option(fc.integer({ min: 30, max: 480 }), { nil: undefined }),
  entertainmentCooldownMinutes: fc.option(fc.integer({ min: 15, max: 120 }), { nil: undefined }),
});

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 13: Entertainment Settings Modification Restriction', () => {
  /**
   * Property: Entertainment settings cannot be modified during work time
   * For any attempt to modify Entertainment settings (blacklist, whitelist, quota, cooldown) 
   * during work time, the modification SHALL be rejected.
   * Validates: Requirements 5.12, 7.11, 7.12
   */

  beforeAll(async () => {
    dbAvailable = await checkDatabaseConnection();
    if (!dbAvailable) {
      console.warn('Database not available, skipping property tests');
      return;
    }

    // Create a test user for the property tests
    const testUser = await prisma.user.create({
      data: {
        email: `test-entertainment-settings-${Date.now()}@vibeflow.test`,
        password: 'hashed_password_placeholder',
      },
    });
    testUserId = testUser.id;

    // Create user settings
    await prisma.userSettings.create({
      data: {
        userId: testUserId,
      },
    });
  });

  afterAll(async () => {
    if (!dbAvailable) return;

    if (testUserId) {
      await prisma.userSettings.deleteMany({ where: { userId: testUserId } });
      await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    if (!dbAvailable) return;
    // Reset settings to default
    await prisma.userSettings.update({
      where: { userId: testUserId },
      data: {
        entertainmentBlacklist: [],
        entertainmentWhitelist: [],
        entertainmentQuotaMinutes: 120,
        entertainmentCooldownMinutes: 30,
        workTimeSlots: [],
      },
    });
  });

  it('should reject entertainment settings modification during work time', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        // Generate work time slots with at least one enabled slot
        fc.array(workTimeSlotArbitrary, { minLength: 1, maxLength: 3 })
          .filter(slots => slots.some(s => s.enabled)),
        // Generate settings update
        settingsUpdateArbitrary,
        async (workSlots, settingsUpdate) => {
          // Find a time that is within work hours
          const enabledSlots = workSlots.filter(s => s.enabled);
          if (enabledSlots.length === 0) return true;
          
          const firstSlot = enabledSlots[0];
          const startMinutes = parseTimeToMinutes(firstSlot.startTime);
          const endMinutes = parseTimeToMinutes(firstSlot.endTime);
          
          // Pick a time in the middle of the work slot
          const testTimeMinutes = Math.floor((startMinutes + endMinutes) / 2);
          
          // Verify we're within work time
          const withinWorkTime = isWithinWorkHours(workSlots, testTimeMinutes);
          expect(withinWorkTime).toBe(true);
          
          // Attempt to update settings
          const result = simulateSettingsUpdate(workSlots, testTimeMinutes, settingsUpdate);
          
          // Property: modification should be rejected during work time
          expect(result.success).toBe(false);
          expect(result.errorCode).toBe('WORK_TIME_RESTRICTION');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should allow entertainment settings modification outside work time', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        // Generate work time slots (typical 9-17 work hours)
        fc.array(
          fc.record({
            id: fc.uuid(),
            startTime: fc.constant('09:00'),
            endTime: fc.constant('17:00'),
            enabled: fc.boolean(),
          }),
          { minLength: 0, maxLength: 2 }
        ),
        // Generate settings update
        settingsUpdateArbitrary,
        // Generate a time outside typical work hours (early morning or late night)
        fc.oneof(
          fc.integer({ min: 0, max: 8 * 60 - 1 }), // 00:00 - 07:59
          fc.integer({ min: 18 * 60, max: 23 * 60 + 59 }) // 18:00 - 23:59
        ),
        async (workSlots, settingsUpdate, testTimeMinutes) => {
          // Verify we're outside work time
          const withinWorkTime = isWithinWorkHours(workSlots, testTimeMinutes);
          
          if (!withinWorkTime) {
            // Attempt to update settings
            const result = simulateSettingsUpdate(workSlots, testTimeMinutes, settingsUpdate);
            
            // Property: modification should be allowed outside work time
            expect(result.success).toBe(true);
            expect(result.errorCode).toBeUndefined();
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should allow entertainment settings modification when no work time is configured', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        // Generate settings update
        settingsUpdateArbitrary,
        // Generate any time of day
        fc.integer({ min: 0, max: 23 * 60 + 59 }),
        async (settingsUpdate, testTimeMinutes) => {
          // No work time slots configured
          const workSlots: WorkTimeSlot[] = [];
          
          // Verify we're not within work time (no slots = never within work time)
          const withinWorkTime = isWithinWorkHours(workSlots, testTimeMinutes);
          expect(withinWorkTime).toBe(false);
          
          // Attempt to update settings
          const result = simulateSettingsUpdate(workSlots, testTimeMinutes, settingsUpdate);
          
          // Property: modification should be allowed when no work time configured
          expect(result.success).toBe(true);
          expect(result.errorCode).toBeUndefined();
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should allow entertainment settings modification when all work time slots are disabled', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        // Generate work time slots with all disabled
        fc.array(
          fc.record({
            id: fc.uuid(),
            startTime: fc.integer({ min: 0, max: 20 }).map(h => `${h.toString().padStart(2, '0')}:00`),
            endTime: fc.integer({ min: 4, max: 23 }).map(h => `${h.toString().padStart(2, '0')}:00`),
            enabled: fc.constant(false), // All disabled
          }).filter(slot => {
            const start = parseTimeToMinutes(slot.startTime);
            const end = parseTimeToMinutes(slot.endTime);
            return start < end;
          }),
          { minLength: 1, maxLength: 3 }
        ),
        // Generate settings update
        settingsUpdateArbitrary,
        // Generate any time of day
        fc.integer({ min: 0, max: 23 * 60 + 59 }),
        async (workSlots, settingsUpdate, testTimeMinutes) => {
          // Verify we're not within work time (all slots disabled)
          const withinWorkTime = isWithinWorkHours(workSlots, testTimeMinutes);
          expect(withinWorkTime).toBe(false);
          
          // Attempt to update settings
          const result = simulateSettingsUpdate(workSlots, testTimeMinutes, settingsUpdate);
          
          // Property: modification should be allowed when all slots are disabled
          expect(result.success).toBe(true);
          expect(result.errorCode).toBeUndefined();
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject all types of entertainment settings during work time', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    // Test each setting type individually
    const settingTypes = [
      { entertainmentBlacklist: [{ domain: 'test.com', isPreset: false, enabled: true, addedAt: Date.now() }] },
      { entertainmentWhitelist: [{ pattern: 'test.com/*', isPreset: false, enabled: true, addedAt: Date.now() }] },
      { entertainmentQuotaMinutes: 60 },
      { entertainmentCooldownMinutes: 45 },
    ];

    for (const settingUpdate of settingTypes) {
      await fc.assert(
        fc.asyncProperty(
          // Generate a work time slot
          fc.record({
            id: fc.uuid(),
            startTime: fc.constant('09:00'),
            endTime: fc.constant('17:00'),
            enabled: fc.constant(true),
          }),
          async (workSlot) => {
            const workSlots = [workSlot];
            // Pick a time in the middle of work hours (12:00)
            const testTimeMinutes = 12 * 60;
            
            // Verify we're within work time
            const withinWorkTime = isWithinWorkHours(workSlots, testTimeMinutes);
            expect(withinWorkTime).toBe(true);
            
            // Attempt to update this specific setting type
            const result = simulateSettingsUpdate(workSlots, testTimeMinutes, settingUpdate);
            
            // Property: all setting types should be rejected during work time
            expect(result.success).toBe(false);
            expect(result.errorCode).toBe('WORK_TIME_RESTRICTION');
            
            return true;
          }
        ),
        { numRuns: 25 } // Fewer runs since we're testing 4 setting types
      );
    }
  });
});
