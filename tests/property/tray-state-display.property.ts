import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { TrayIntegrationService } from '@/services/tray-integration.service';
import { TimeFormatter } from '@/lib/time-formatter';

/**
 * Feature: desktop-tray-enhancement, Property 2: State Display Consistency
 * 
 * For any system state transition, the tray display should update within 1 second 
 * to reflect the new state accurately.
 * 
 * Validates: Requirements 2.5, 5.1, 5.2, 5.3
 */

// Mock window.vibeflow for testing
const mockTrayUpdate = {
  calls: [] as Array<any>,
  clear: () => { mockTrayUpdate.calls = []; }
};

// Setup global mock
(global as any).window = {
  vibeflow: {
    platform: { isElectron: true },
    tray: {
      updateMenu: (state: any) => {
        mockTrayUpdate.calls.push({ timestamp: Date.now(), state });
      }
    }
  }
};

describe('Property 2: State Display Consistency', () => {
  /**
   * Property 2.1: System state mapping consistency
   * For any valid system state, the mapping to tray state should be consistent and accurate
   */
  it('system state mapping produces consistent tray state for any valid system state', () => {
    fc.assert(
      fc.property(
        // Generate valid system states
        fc.constantFrom('idle', 'focus', 'over_rest'),
        (systemState) => {
          mockTrayUpdate.clear();
          const service = new TrayIntegrationService();

          // Update system state
          service.updateSystemState(systemState as any);

          // Property: Should have made exactly one tray update call
          expect(mockTrayUpdate.calls.length).toBe(1);

          const update = mockTrayUpdate.calls[0];

          // Property: Update should contain systemState field
          expect(update.state).toHaveProperty('systemState');

          // Property: System state mapping should be consistent
          const expectedTrayState = mapSystemStateToExpected(systemState);
          expect(update.state.systemState).toBe(expectedTrayState);

          // Property: Update should clear rest-related data when not in over_rest state
          if (systemState !== 'over_rest') {
            expect(update.state.restTimeRemaining).toBeUndefined();
            expect(update.state.overRestDuration).toBeUndefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.2: Rest state data consistency
   * For any rest state with valid rest data, the display should accurately reflect the rest information
   */
  it('rest state data is consistently formatted and displayed for any valid rest duration', () => {
    fc.assert(
      fc.property(
        // Generate rest duration (1-60 minutes)
        fc.integer({ min: 1, max: 60 }),
        // Generate elapsed time (0 to duration + buffer)
        fc.integer({ min: 0, max: 70 * 60 * 1000 }), // milliseconds
        // Generate whether it's over-rest
        fc.boolean(),
        (durationMinutes, elapsedMs, isOverRest) => {
          mockTrayUpdate.clear();
          const service = new TrayIntegrationService();
          
          const restData = {
            startTime: new Date(Date.now() - elapsedMs),
            duration: durationMinutes,
            isOverRest
          };
          
          // Update system state with rest data
          const systemState = isOverRest ? 'over_rest' : 'idle';
          service.updateSystemState(systemState as any, restData);
          
          // Property: Should have made exactly one tray update call
          expect(mockTrayUpdate.calls.length).toBe(1);
          
          const update = mockTrayUpdate.calls[0];
          
          if (isOverRest) {
            // Property: Over-rest should show duration and clear countdown
            expect(update.state.overRestDuration).toBeDefined();
            expect(typeof update.state.overRestDuration).toBe('string');
            expect(update.state.restTimeRemaining).toBeUndefined();
            
            // Property: Over-rest duration should be valid format (supports "15s", "5 min", "1h", "2h 30m")
            const duration = update.state.overRestDuration;
            expect(duration).toMatch(/^\d+s$|^\d+ min$|^\d+h$|^\d+h \d+m$/);
          } else {
            // Property: Rest should show countdown and clear over-rest duration
            expect(update.state.restTimeRemaining).toBeDefined();
            expect(typeof update.state.restTimeRemaining).toBe('string');
            expect(update.state.overRestDuration).toBeUndefined();
            
            // Property: Rest countdown should be valid MM:SS format
            const countdown = update.state.restTimeRemaining;
            expect(TimeFormatter.isValidTimeFormat(countdown)).toBe(true);
            
            // Property: Countdown should not be negative
            const parsed = TimeFormatter.parseTime(countdown);
            expect(parsed).toBeGreaterThanOrEqual(0);
          }
          
          // Property: System state should be correctly set
          const expectedTrayState = isOverRest ? 'OVER_REST' : 'PLANNING';
          expect(update.state.systemState).toBe(expectedTrayState);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.3: Pomodoro state consistency
   * For any pomodoro data, the tray display should accurately reflect the pomodoro information
   */
  it('pomodoro state is consistently displayed for any valid pomodoro session', () => {
    fc.assert(
      fc.property(
        // Generate pomodoro duration (10-120 minutes)
        fc.integer({ min: 10, max: 120 }),
        // Generate elapsed time
        fc.integer({ min: 0, max: 130 * 60 * 1000 }), // milliseconds
        // Generate task title
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
        (durationMinutes, elapsedMs, taskTitle) => {
          mockTrayUpdate.clear();
          const service = new TrayIntegrationService();
          
          const pomodoroData = {
            id: 'test-pomodoro-id',
            taskId: 'test-task-id',
            duration: durationMinutes,
            startTime: new Date(Date.now() - elapsedMs),
            task: { title: taskTitle }
          };
          
          // Update pomodoro state
          service.updatePomodoroState(pomodoroData);
          
          // Property: Should have made exactly one tray update call
          expect(mockTrayUpdate.calls.length).toBe(1);
          
          const update = mockTrayUpdate.calls[0];
          
          // Property: Should indicate pomodoro is active
          expect(update.state.pomodoroActive).toBe(true);
          
          // Property: Should have valid time remaining
          expect(update.state.pomodoroTimeRemaining).toBeDefined();
          expect(typeof update.state.pomodoroTimeRemaining).toBe('string');
          expect(TimeFormatter.isValidTimeFormat(update.state.pomodoroTimeRemaining)).toBe(true);
          
          // Property: Should show current task
          expect(update.state.currentTask).toBe(taskTitle);
          
          // Property: System state should be FOCUS
          expect(update.state.systemState).toBe('FOCUS');
          
          // Property: Time remaining should be non-negative
          const parsed = TimeFormatter.parseTime(update.state.pomodoroTimeRemaining);
          expect(parsed).toBeGreaterThanOrEqual(0);
          
          // Property: When pomodoro time is up, remaining should be 0
          const totalMs = durationMinutes * 60 * 1000;
          if (elapsedMs >= totalMs) {
            expect(parsed).toBe(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.4: State transition completeness
   * For any state transition, all relevant fields should be updated appropriately
   */
  it('state transitions update all relevant fields appropriately for any valid transition', () => {
    fc.assert(
      fc.property(
        // Generate initial state
        fc.constantFrom('idle', 'focus', 'over_rest'),
        // Generate target state
        fc.constantFrom('idle', 'focus', 'over_rest'),
        (initialState, targetState) => {
          mockTrayUpdate.clear();
          const service = new TrayIntegrationService();
          
          // Set initial state
          service.updateSystemState(initialState as any);
          mockTrayUpdate.clear(); // Clear initial call
          
          // Transition to target state
          service.updateSystemState(targetState as any);
          
          // Property: Should have made exactly one update call for transition
          expect(mockTrayUpdate.calls.length).toBe(1);
          
          const update = mockTrayUpdate.calls[0];
          
          // Property: System state should be updated to target
          const expectedTrayState = mapSystemStateToExpected(targetState);
          expect(update.state.systemState).toBe(expectedTrayState);
          
          // Property: Non-over_rest states should clear rest-related data
          if (targetState !== 'over_rest') {
            expect(update.state.restTimeRemaining).toBeUndefined();
            expect(update.state.overRestDuration).toBeUndefined();
          }
          
          // Property: Update should have timestamp within reasonable range
          const now = Date.now();
          expect(update.timestamp).toBeGreaterThan(now - 1000); // Within last second
          expect(update.timestamp).toBeLessThanOrEqual(now);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.5: User settings consistency
   * For any valid user settings, the tray display should accurately reflect the settings
   */
  it('user settings are consistently displayed for any valid settings combination', () => {
    fc.assert(
      fc.property(
        // Generate enforcement mode
        fc.constantFrom('strict', 'gentle'),
        // Generate skip tokens (0-10)
        fc.integer({ min: 0, max: 10 }),
        // Generate demo mode status
        fc.boolean(),
        (enforcementMode, skipTokens, isInDemoMode) => {
          mockTrayUpdate.clear();
          const service = new TrayIntegrationService();
          
          const settings = {
            enforcementMode: enforcementMode as 'strict' | 'gentle',
            skipTokensRemaining: skipTokens,
            isInDemoMode
          };
          
          // Update user settings
          service.updateUserSettings(settings);
          
          // Property: Should have made exactly one tray update call
          expect(mockTrayUpdate.calls.length).toBe(1);
          
          const update = mockTrayUpdate.calls[0];
          
          // Property: All settings should be reflected in update
          expect(update.state.enforcementMode).toBe(enforcementMode);
          expect(update.state.skipTokensRemaining).toBe(skipTokens);
          expect(update.state.isInDemoMode).toBe(isInDemoMode);
          
          // Property: Settings should be of correct types
          expect(typeof update.state.enforcementMode).toBe('string');
          expect(typeof update.state.skipTokensRemaining).toBe('number');
          expect(typeof update.state.isInDemoMode).toBe('boolean');
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Helper function to map system state to expected tray state
 */
function mapSystemStateToExpected(systemState: string): string {
  switch (systemState) {
    case 'idle':
      return 'PLANNING';
    case 'focus':
      return 'FOCUS';
    case 'over_rest':
      return 'OVER_REST';
    default:
      return 'PLANNING';
  }
}