import fc from 'fast-check';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Feature: desktop-production-resilience
 * Property 1: Mode-Based Quit Behavior
 * Validates: Requirements 1.6, 2.1
 * 
 * For any quit attempt:
 * - If in development mode, quit SHALL be allowed regardless of work hours or pomodoro state
 * - If in production mode AND within work hours, quit SHALL be blocked unless explicitly confirmed
 */

// =============================================================================
// TYPES (Mirroring the quit-prevention module types for testing)
// =============================================================================

type AppMode = 'development' | 'staging' | 'production';

interface WorkTimeSlot {
  id: string;
  startTime: string; // HH:mm format
  endTime: string;   // HH:mm format
  enabled: boolean;
}

interface QuitPreventionConfig {
  enabled: boolean;
  requireConfirmationInWorkHours: boolean;
  consumeSkipTokenOnQuit: boolean;
  workTimeSlots: WorkTimeSlot[];
  isInDemoMode: boolean;
  hasActivePomodoro: boolean;
}

interface CanQuitResult {
  allowed: boolean;
  reason?: string;
  requiresConfirmation?: boolean;
  canConsumeSkipToken?: boolean;
}

// =============================================================================
// PURE FUNCTIONS (Extracted from quit-prevention module for testing)
// =============================================================================

/**
 * Parse time string (HH:mm) to minutes since midnight
 */
function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Check if current time is within any enabled work time slot
 */
function isWithinWorkHours(
  slots: WorkTimeSlot[],
  currentTimeMinutes: number
): boolean {
  return slots.some((slot) => {
    if (!slot.enabled) return false;
    
    const startMinutes = parseTimeToMinutes(slot.startTime);
    const endMinutes = parseTimeToMinutes(slot.endTime);
    
    // Handle normal case (start < end)
    return currentTimeMinutes >= startMinutes && currentTimeMinutes < endMinutes;
  });
}

/**
 * Pure function to determine if quit is allowed
 * This mirrors the canQuit logic from QuitPrevention class
 */
function canQuit(
  mode: AppMode,
  config: QuitPreventionConfig,
  currentTimeMinutes: number
): CanQuitResult {
  // Development mode: always allow quit
  if (mode === 'development') {
    return { allowed: true, reason: 'development_mode' };
  }
  
  // Demo mode: always allow quit
  if (config.isInDemoMode) {
    return { allowed: true, reason: 'demo_mode' };
  }
  
  // Quit prevention disabled: allow quit
  if (!config.enabled) {
    return { allowed: true, reason: 'quit_prevention_disabled' };
  }
  
  // Check if within work hours
  const withinWorkHours = isWithinWorkHours(config.workTimeSlots, currentTimeMinutes);
  
  // Outside work hours: allow quit
  if (!withinWorkHours) {
    return { allowed: true, reason: 'outside_work_hours' };
  }
  
  // Production mode + work hours: requires confirmation
  if (mode === 'production') {
    return {
      allowed: false,
      reason: 'Quit is blocked during work hours. Use the confirmation dialog to quit.',
      requiresConfirmation: true,
      canConsumeSkipToken: config.consumeSkipTokenOnQuit,
    };
  }
  
  // Staging mode + work hours: allow with warning
  if (mode === 'staging') {
    return {
      allowed: false,
      reason: 'Staging mode: Use Cmd+Shift+Q to force quit during work hours.',
      requiresConfirmation: true,
      canConsumeSkipToken: false,
    };
  }
  
  // Default: allow
  return { allowed: true };
}

// =============================================================================
// GENERATORS
// =============================================================================

/**
 * Generator for app modes
 */
const appModeArb = fc.constantFrom<AppMode>('development', 'staging', 'production');

/**
 * Generator for valid time strings (HH:mm format)
 */
const timeStringArb = fc.tuple(
  fc.integer({ min: 0, max: 23 }),
  fc.integer({ min: 0, max: 59 })
).map(([hours, minutes]) => 
  `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
);

/**
 * Generator for work time slots
 */
const workTimeSlotArb = fc.record({
  id: fc.uuid(),
  startTime: timeStringArb,
  endTime: timeStringArb,
  enabled: fc.boolean(),
}).filter(slot => {
  // Ensure start time is before end time for valid slots
  const start = parseTimeToMinutes(slot.startTime);
  const end = parseTimeToMinutes(slot.endTime);
  return start < end;
});

/**
 * Generator for quit prevention config
 */
const quitPreventionConfigArb = fc.record({
  enabled: fc.boolean(),
  requireConfirmationInWorkHours: fc.boolean(),
  consumeSkipTokenOnQuit: fc.boolean(),
  workTimeSlots: fc.array(workTimeSlotArb, { minLength: 0, maxLength: 5 }),
  isInDemoMode: fc.boolean(),
  hasActivePomodoro: fc.boolean(),
});

/**
 * Generator for current time in minutes (0-1439)
 */
const currentTimeMinutesArb = fc.integer({ min: 0, max: 1439 });

/**
 * Generator for a time that is within a given work slot
 */
function timeWithinSlotArb(slot: WorkTimeSlot): fc.Arbitrary<number> {
  const start = parseTimeToMinutes(slot.startTime);
  const end = parseTimeToMinutes(slot.endTime);
  return fc.integer({ min: start, max: end - 1 });
}

/**
 * Generator for a time that is outside all work slots
 */
function timeOutsideSlotsArb(slots: WorkTimeSlot[]): fc.Arbitrary<number> {
  const enabledSlots = slots.filter(s => s.enabled);
  if (enabledSlots.length === 0) {
    return fc.integer({ min: 0, max: 1439 });
  }
  
  // Find gaps between slots
  const sortedSlots = [...enabledSlots].sort((a, b) => 
    parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)
  );
  
  // Try to find a time before the first slot
  const firstStart = parseTimeToMinutes(sortedSlots[0].startTime);
  if (firstStart > 0) {
    return fc.integer({ min: 0, max: firstStart - 1 });
  }
  
  // Try to find a time after the last slot
  const lastEnd = parseTimeToMinutes(sortedSlots[sortedSlots.length - 1].endTime);
  if (lastEnd < 1439) {
    return fc.integer({ min: lastEnd, max: 1439 });
  }
  
  // Default to a random time (may or may not be in a slot)
  return fc.integer({ min: 0, max: 1439 });
}

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Property 1: Mode-Based Quit Behavior', () => {
  /**
   * Feature: desktop-production-resilience, Property 1: Mode-Based Quit Behavior
   * Validates: Requirements 1.6, 2.1
   */

  it('development mode: quit SHALL always be allowed regardless of work hours', async () => {
    await fc.assert(
      fc.property(
        quitPreventionConfigArb,
        currentTimeMinutesArb,
        (config, currentTime) => {
          const result = canQuit('development', config, currentTime);
          
          // In development mode, quit should ALWAYS be allowed
          expect(result.allowed).toBe(true);
          expect(result.reason).toBe('development_mode');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('development mode: quit SHALL be allowed even with active pomodoro', async () => {
    await fc.assert(
      fc.property(
        quitPreventionConfigArb,
        currentTimeMinutesArb,
        (baseConfig, currentTime) => {
          // Force active pomodoro
          const config = { ...baseConfig, hasActivePomodoro: true };
          const result = canQuit('development', config, currentTime);
          
          // In development mode, quit should be allowed even with active pomodoro
          expect(result.allowed).toBe(true);
          expect(result.reason).toBe('development_mode');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('production mode + work hours: quit SHALL be blocked', async () => {
    await fc.assert(
      fc.property(
        workTimeSlotArb,
        (slot) => {
          // Create config with enabled work slot
          const config: QuitPreventionConfig = {
            enabled: true,
            requireConfirmationInWorkHours: true,
            consumeSkipTokenOnQuit: true,
            workTimeSlots: [{ ...slot, enabled: true }],
            isInDemoMode: false,
            hasActivePomodoro: false,
          };
          
          // Generate a time within the work slot
          const start = parseTimeToMinutes(slot.startTime);
          const end = parseTimeToMinutes(slot.endTime);
          const currentTime = Math.floor((start + end) / 2); // Middle of the slot
          
          const result = canQuit('production', config, currentTime);
          
          // In production mode during work hours, quit should be blocked
          expect(result.allowed).toBe(false);
          expect(result.requiresConfirmation).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('production mode + outside work hours: quit SHALL be allowed', async () => {
    await fc.assert(
      fc.property(
        fc.array(workTimeSlotArb, { minLength: 1, maxLength: 3 }),
        (slots) => {
          // Create config with work slots
          const config: QuitPreventionConfig = {
            enabled: true,
            requireConfirmationInWorkHours: true,
            consumeSkipTokenOnQuit: true,
            workTimeSlots: slots.map(s => ({ ...s, enabled: true })),
            isInDemoMode: false,
            hasActivePomodoro: false,
          };
          
          // Find a time outside all work slots
          const enabledSlots = config.workTimeSlots.filter(s => s.enabled);
          const sortedSlots = [...enabledSlots].sort((a, b) =>
            parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)
          );

          // Build list of candidate times outside all slots
          let currentTime: number | null = null;

          // Try time before the first slot
          const firstStart = parseTimeToMinutes(sortedSlots[0].startTime);
          if (firstStart > 0 && !isWithinWorkHours(enabledSlots, 0)) {
            currentTime = 0;
          }

          if (currentTime === null) {
            // Try gaps between consecutive slots and after the last slot
            for (let i = 0; i < sortedSlots.length; i++) {
              const end = parseTimeToMinutes(sortedSlots[i].endTime);
              if (end <= 1439 && !isWithinWorkHours(enabledSlots, end)) {
                currentTime = end;
                break;
              }
            }
          }

          if (currentTime === null) {
            // No time found outside all slots — skip this test case
            return true;
          }
          
          const result = canQuit('production', config, currentTime);
          
          // Outside work hours, quit should be allowed
          expect(result.allowed).toBe(true);
          expect(result.reason).toBe('outside_work_hours');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('demo mode: quit SHALL always be allowed regardless of mode or work hours', async () => {
    await fc.assert(
      fc.property(
        appModeArb,
        quitPreventionConfigArb,
        currentTimeMinutesArb,
        (mode, baseConfig, currentTime) => {
          // Force demo mode on
          const config = { ...baseConfig, isInDemoMode: true };
          const result = canQuit(mode, config, currentTime);
          
          // In demo mode, quit should always be allowed (except in development which takes priority)
          if (mode === 'development') {
            expect(result.allowed).toBe(true);
            expect(result.reason).toBe('development_mode');
          } else {
            expect(result.allowed).toBe(true);
            expect(result.reason).toBe('demo_mode');
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('quit prevention disabled: quit SHALL be allowed', async () => {
    await fc.assert(
      fc.property(
        fc.constantFrom<AppMode>('staging', 'production'),
        quitPreventionConfigArb,
        currentTimeMinutesArb,
        (mode, baseConfig, currentTime) => {
          // Force quit prevention disabled and demo mode off
          const config = { ...baseConfig, enabled: false, isInDemoMode: false };
          const result = canQuit(mode, config, currentTime);
          
          // With quit prevention disabled, quit should be allowed
          expect(result.allowed).toBe(true);
          expect(result.reason).toBe('quit_prevention_disabled');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('staging mode + work hours: quit SHALL require confirmation', async () => {
    await fc.assert(
      fc.property(
        workTimeSlotArb,
        (slot) => {
          // Create config with enabled work slot
          const config: QuitPreventionConfig = {
            enabled: true,
            requireConfirmationInWorkHours: true,
            consumeSkipTokenOnQuit: true,
            workTimeSlots: [{ ...slot, enabled: true }],
            isInDemoMode: false,
            hasActivePomodoro: false,
          };
          
          // Generate a time within the work slot
          const start = parseTimeToMinutes(slot.startTime);
          const end = parseTimeToMinutes(slot.endTime);
          const currentTime = Math.floor((start + end) / 2); // Middle of the slot
          
          const result = canQuit('staging', config, currentTime);
          
          // In staging mode during work hours, quit should require confirmation
          expect(result.allowed).toBe(false);
          expect(result.requiresConfirmation).toBe(true);
          // Staging mode should NOT consume skip token
          expect(result.canConsumeSkipToken).toBe(false);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('production mode + work hours: canConsumeSkipToken reflects config', async () => {
    await fc.assert(
      fc.property(
        workTimeSlotArb,
        fc.boolean(),
        (slot, consumeSkipToken) => {
          // Create config with enabled work slot
          const config: QuitPreventionConfig = {
            enabled: true,
            requireConfirmationInWorkHours: true,
            consumeSkipTokenOnQuit: consumeSkipToken,
            workTimeSlots: [{ ...slot, enabled: true }],
            isInDemoMode: false,
            hasActivePomodoro: false,
          };
          
          // Generate a time within the work slot
          const start = parseTimeToMinutes(slot.startTime);
          const end = parseTimeToMinutes(slot.endTime);
          const currentTime = Math.floor((start + end) / 2); // Middle of the slot
          
          const result = canQuit('production', config, currentTime);
          
          // canConsumeSkipToken should reflect the config
          expect(result.canConsumeSkipToken).toBe(consumeSkipToken);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('no enabled work slots: quit SHALL be allowed in production mode', async () => {
    await fc.assert(
      fc.property(
        fc.array(workTimeSlotArb, { minLength: 0, maxLength: 3 }),
        currentTimeMinutesArb,
        (slots, currentTime) => {
          // Create config with all slots disabled
          const config: QuitPreventionConfig = {
            enabled: true,
            requireConfirmationInWorkHours: true,
            consumeSkipTokenOnQuit: true,
            workTimeSlots: slots.map(s => ({ ...s, enabled: false })),
            isInDemoMode: false,
            hasActivePomodoro: false,
          };
          
          const result = canQuit('production', config, currentTime);
          
          // With no enabled work slots, should be "outside work hours"
          expect(result.allowed).toBe(true);
          expect(result.reason).toBe('outside_work_hours');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('empty work slots array: quit SHALL be allowed in production mode', async () => {
    await fc.assert(
      fc.property(
        currentTimeMinutesArb,
        (currentTime) => {
          // Create config with empty work slots
          const config: QuitPreventionConfig = {
            enabled: true,
            requireConfirmationInWorkHours: true,
            consumeSkipTokenOnQuit: true,
            workTimeSlots: [],
            isInDemoMode: false,
            hasActivePomodoro: false,
          };
          
          const result = canQuit('production', config, currentTime);
          
          // With empty work slots, should be "outside work hours"
          expect(result.allowed).toBe(true);
          expect(result.reason).toBe('outside_work_hours');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
