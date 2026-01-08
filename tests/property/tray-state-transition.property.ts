import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { TrayIntegrationService } from '@/services/tray-integration.service';

/**
 * Feature: desktop-tray-enhancement, Property 6: State Transition Logic
 * 
 * For any pomodoro completion event, if the system is already in OVER_REST state, 
 * no rest prompt should be shown and the state should remain OVER_REST.
 * 
 * Validates: Requirements 7.1, 7.2, 7.5
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

describe('Property 6: State Transition Logic', () => {
  /**
   * Property 6.1: Over-rest state preservation during pomodoro completion
   * For any pomodoro completion when already in over-rest, the state should remain OVER_REST
   */
  it('pomodoro completion preserves OVER_REST state when already in over-rest', () => {
    fc.assert(
      fc.property(
        // Generate over-rest duration (1-300 minutes)
        fc.integer({ min: 1, max: 300 }),
        // Generate elapsed over-rest time
        fc.integer({ min: 0, max: 400 * 60 * 1000 }), // milliseconds
        (overRestMinutes, elapsedMs) => {
          mockTrayUpdate.clear();
          const service = new TrayIntegrationService();
          
          // Create over-rest data
          const overRestData = {
            startTime: new Date(Date.now() - elapsedMs),
            duration: overRestMinutes, // This represents the original rest duration
            isOverRest: true
          };
          
          // Handle pomodoro completion while in over-rest
          service.handlePomodoroCompletion({
            wasInOverRest: true,
            newState: 'over_rest' as any,
            restData: overRestData
          });
          
          // Property: Should have made exactly one tray update call
          expect(mockTrayUpdate.calls.length).toBe(1);
          
          const update = mockTrayUpdate.calls[0];
          
          // Property: Should clear pomodoro-related state
          expect(update.state.pomodoroActive).toBe(false);
          expect(update.state.pomodoroTimeRemaining).toBeUndefined();
          expect(update.state.currentTask).toBeUndefined();
          
          // Property: Should maintain OVER_REST state
          expect(update.state.systemState).toBe('OVER_REST');
          
          // Property: Should show over-rest duration, not rest countdown
          expect(update.state.overRestDuration).toBeDefined();
          expect(typeof update.state.overRestDuration).toBe('string');
          expect(update.state.restTimeRemaining).toBeUndefined();
          
          // Property: Over-rest duration should be valid format
          const duration = update.state.overRestDuration;
          expect(duration).toMatch(/^\d+[smh]$|^\d+ min$|^\d+h \d+m$/);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6.2: Normal rest state transition during pomodoro completion
   * For any pomodoro completion when not in over-rest, should transition to appropriate rest state
   */
  it('pomodoro completion transitions to appropriate rest state when not in over-rest', () => {
    fc.assert(
      fc.property(
        // Generate rest duration (1-30 minutes)
        fc.integer({ min: 1, max: 30 }),
        // Generate new state after completion
        fc.constantFrom('rest', 'planning'), // Could go to rest or back to planning
        (restDurationMinutes, newState) => {
          mockTrayUpdate.clear();
          const service = new TrayIntegrationService();
          
          let restData = undefined;
          if (newState === 'rest') {
            restData = {
              startTime: new Date(), // Just started rest
              duration: restDurationMinutes,
              isOverRest: false
            };
          }
          
          // Handle pomodoro completion when not in over-rest
          service.handlePomodoroCompletion({
            wasInOverRest: false,
            newState: newState as any,
            restData
          });
          
          // Property: Should have made exactly one tray update call
          expect(mockTrayUpdate.calls.length).toBe(1);
          
          const update = mockTrayUpdate.calls[0];
          
          // Property: Should clear pomodoro-related state
          expect(update.state.pomodoroActive).toBe(false);
          expect(update.state.pomodoroTimeRemaining).toBeUndefined();
          expect(update.state.currentTask).toBeUndefined();
          
          // Property: System state should match the new state
          const expectedTrayState = newState === 'rest' ? 'REST' : 'PLANNING';
          expect(update.state.systemState).toBe(expectedTrayState);
          
          if (newState === 'rest' && restData) {
            // Property: Should show rest countdown, not over-rest duration
            expect(update.state.restTimeRemaining).toBeDefined();
            expect(typeof update.state.restTimeRemaining).toBe('string');
            expect(update.state.overRestDuration).toBeUndefined();
            
            // Property: Rest countdown should be valid format (approximately full duration)
            const countdown = update.state.restTimeRemaining;
            expect(countdown).toMatch(/^\d+:\d{2}$/);
          } else {
            // Property: Should clear all rest-related data
            expect(update.state.restTimeRemaining).toBeUndefined();
            expect(update.state.overRestDuration).toBeUndefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6.3: State transition timing consistency
   * For any pomodoro completion, the tray update should happen immediately
   */
  it('pomodoro completion triggers immediate tray update for any completion scenario', () => {
    fc.assert(
      fc.property(
        // Generate whether was in over-rest
        fc.boolean(),
        // Generate new state
        fc.constantFrom('rest', 'over_rest', 'planning'),
        (wasInOverRest, newState) => {
          mockTrayUpdate.clear();
          const service = new TrayIntegrationService();
          
          const beforeTime = Date.now();
          
          // Create appropriate rest data based on state
          let restData = undefined;
          if (newState === 'rest' || newState === 'over_rest') {
            restData = {
              startTime: new Date(),
              duration: 15, // 15 minutes
              isOverRest: newState === 'over_rest'
            };
          }
          
          // Handle pomodoro completion
          service.handlePomodoroCompletion({
            wasInOverRest,
            newState: newState as any,
            restData
          });
          
          const afterTime = Date.now();
          
          // Property: Should have made exactly one tray update call
          expect(mockTrayUpdate.calls.length).toBe(1);
          
          const update = mockTrayUpdate.calls[0];
          
          // Property: Update should happen immediately (within 100ms)
          expect(update.timestamp).toBeGreaterThanOrEqual(beforeTime);
          expect(update.timestamp).toBeLessThanOrEqual(afterTime);
          expect(update.timestamp - beforeTime).toBeLessThan(100);
          
          // Property: Should always clear pomodoro state
          expect(update.state.pomodoroActive).toBe(false);
          expect(update.state.pomodoroTimeRemaining).toBeUndefined();
          expect(update.state.currentTask).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6.4: Over-rest duration calculation accuracy
   * For any over-rest scenario, the duration calculation should be accurate
   */
  it('over-rest duration calculation is accurate for any over-rest time period', () => {
    fc.assert(
      fc.property(
        // Generate original rest duration (5-30 minutes)
        fc.integer({ min: 5, max: 30 }),
        // Generate over-rest elapsed time (1-120 minutes)
        fc.integer({ min: 1, max: 120 }),
        (originalRestMinutes, overRestMinutes) => {
          mockTrayUpdate.clear();
          const service = new TrayIntegrationService();
          
          // Calculate when rest period ended (over-rest started)
          const overRestStartTime = new Date(Date.now() - (overRestMinutes * 60 * 1000));
          
          const overRestData = {
            startTime: overRestStartTime,
            duration: originalRestMinutes, // Original rest duration
            isOverRest: true
          };
          
          // Handle pomodoro completion while in over-rest
          service.handlePomodoroCompletion({
            wasInOverRest: true,
            newState: 'over_rest' as any,
            restData: overRestData
          });
          
          // Property: Should have made exactly one tray update call
          expect(mockTrayUpdate.calls.length).toBe(1);
          
          const update = mockTrayUpdate.calls[0];
          
          // Property: Should show over-rest duration
          expect(update.state.overRestDuration).toBeDefined();
          
          const durationStr = update.state.overRestDuration;
          
          // Property: Duration should reflect approximately the over-rest time
          // Allow for some variance due to timing and formatting
          if (overRestMinutes < 60) {
            // Should be in minutes format
            expect(durationStr).toMatch(/^\d+ min$/);
            const displayedMinutes = parseInt(durationStr.split(' ')[0], 10);
            expect(displayedMinutes).toBeGreaterThanOrEqual(overRestMinutes - 1);
            expect(displayedMinutes).toBeLessThanOrEqual(overRestMinutes + 1);
          } else {
            // Should be in hours format for longer durations
            expect(durationStr).toMatch(/^\d+h( \d+m)?$/);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6.5: State consistency after multiple transitions
   * For any sequence of state transitions, the final state should be consistent
   */
  it('maintains state consistency after multiple pomodoro completion transitions', () => {
    fc.assert(
      fc.property(
        // Generate sequence of completion scenarios
        fc.array(
          fc.record({
            wasInOverRest: fc.boolean(),
            newState: fc.constantFrom('rest', 'over_rest', 'planning'),
            restDuration: fc.integer({ min: 5, max: 30 })
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (completionSequence) => {
          mockTrayUpdate.clear();
          const service = new TrayIntegrationService();
          
          let lastUpdate: any = null;
          
          // Process each completion in sequence
          for (const completion of completionSequence) {
            const restData = (completion.newState === 'rest' || completion.newState === 'over_rest') ? {
              startTime: new Date(),
              duration: completion.restDuration,
              isOverRest: completion.newState === 'over_rest'
            } : undefined;
            
            service.handlePomodoroCompletion({
              wasInOverRest: completion.wasInOverRest,
              newState: completion.newState as any,
              restData
            });
            
            // Get the latest update
            lastUpdate = mockTrayUpdate.calls[mockTrayUpdate.calls.length - 1];
          }
          
          // Property: Should have made at least one update
          expect(mockTrayUpdate.calls.length).toBeGreaterThanOrEqual(1);
          expect(lastUpdate).toBeDefined();
          
          // Property: Final state should be consistent
          expect(lastUpdate.state.pomodoroActive).toBe(false);
          expect(lastUpdate.state.pomodoroTimeRemaining).toBeUndefined();
          expect(lastUpdate.state.currentTask).toBeUndefined();
          
          // Property: System state should be valid
          expect(['LOCKED', 'PLANNING', 'FOCUS', 'REST', 'OVER_REST']).toContain(lastUpdate.state.systemState);
          
          // Property: Rest-related data should be consistent with system state
          if (lastUpdate.state.systemState === 'REST') {
            expect(lastUpdate.state.restTimeRemaining).toBeDefined();
            expect(lastUpdate.state.overRestDuration).toBeUndefined();
          } else if (lastUpdate.state.systemState === 'OVER_REST') {
            expect(lastUpdate.state.overRestDuration).toBeDefined();
            expect(lastUpdate.state.restTimeRemaining).toBeUndefined();
          } else {
            expect(lastUpdate.state.restTimeRemaining).toBeUndefined();
            expect(lastUpdate.state.overRestDuration).toBeUndefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});