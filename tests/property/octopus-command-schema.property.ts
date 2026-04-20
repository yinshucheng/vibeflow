import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import {
  validateCommand,
  type ClientType,
  type CommandPriority,
  type ActionType,
  type EnforcementMode,
  type UIType,
} from '@/types/octopus';

/**
 * Feature: octopus-architecture
 * Property 2: Command Schema Validation
 * Validates: Requirements 2.4, 8.2, 8.3, 8.4, 8.5, 8.6
 *
 * For any command sent from Vibe Brain to a Tentacle, the command SHALL contain
 * all required base fields (commandId, commandType, targetClient, priority,
 * requiresAck, createdAt) and type-specific payload fields.
 */

// =============================================================================
// GENERATORS
// =============================================================================

const clientTypeArb = fc.constantFrom<ClientType>('web', 'desktop', 'browser_ext', 'mobile');
const targetClientArb = fc.oneof(clientTypeArb, fc.constant('all' as const));
const commandPriorityArb = fc.constantFrom<CommandPriority>('low', 'normal', 'high', 'critical');
const actionTypeArb = fc.constantFrom<ActionType>(
  'CLOSE_APP',
  'HIDE_APP',
  'BRING_TO_FRONT',
  'SHOW_NOTIFICATION',
  'CLOSE_TAB',
  'REDIRECT_TAB',
  'INJECT_OVERLAY',
  'ADD_SESSION_WHITELIST',
  'SEND_PUSH',
  'PLAY_SOUND',
  'VIBRATE'
);
const enforcementModeArb = fc.constantFrom<EnforcementMode>('strict', 'gentle');
const uiTypeArb = fc.constantFrom<UIType>('notification', 'modal', 'overlay', 'toast');

// Invalid value generators (for rejection tests)
const invalidCommandTypeArb = fc.constantFrom('INVALID', 'UNKNOWN', 'BAD_TYPE', 'sync_state', '');
const invalidTargetClientArb = fc.constantFrom('invalid', 'unknown', 'bad', 'WEB', '');
const invalidPriorityArb = fc.constantFrom('invalid', 'NORMAL', 'urgent', 'medium', '');
const invalidActionTypeArb = fc.constantFrom('INVALID', 'close', 'QUIT_APP', 'unknown', '');
const invalidEnforcementModeArb = fc.constantFrom('invalid', 'STRICT', 'hard', 'soft', '');
const invalidUITypeArb = fc.constantFrom('invalid', 'MODAL', 'popup', 'alert', '');

// Base command fields generator
const baseCommandFieldsArb = fc.record({
  commandId: fc.uuid(),
  targetClient: targetClientArb,
  priority: commandPriorityArb,
  requiresAck: fc.boolean(),
  expiryTime: fc.option(fc.integer({ min: 1, max: Date.now() + 86400000 * 30 }), { nil: undefined }),
  createdAt: fc.integer({ min: 1, max: Date.now() + 86400000 }),
});

// System state generator
const systemStateArb = fc.record({
  state: fc.constantFrom('IDLE', 'FOCUS', 'OVER_REST'),
  dailyCapReached: fc.boolean(),
  skipTokensRemaining: fc.integer({ min: 0, max: 10 }),
});

// Daily state generator
const dailyStateArb = fc.record({
  date: fc.constantFrom('2024-01-01', '2024-06-15', '2025-12-31'),
  completedPomodoros: fc.integer({ min: 0, max: 20 }),
  totalFocusMinutes: fc.integer({ min: 0, max: 480 }),
  top3TaskIds: fc.constant(['task-1', 'task-2']),
});

// Pomodoro state generator
const pomodoroStateArb = fc.record({
  id: fc.constantFrom('pomo-1', 'pomo-2', 'pomo-3'),
  taskId: fc.constantFrom('task-1', 'task-2', 'task-3'),
  startTime: fc.integer({ min: 1700000000000, max: 1800000000000 }),
  duration: fc.constantFrom(1500, 1800, 3000),
  status: fc.constantFrom('active' as const, 'paused' as const, 'completed' as const, 'aborted' as const),
});

// Task state generator
const taskStateArb = fc.record({
  id: fc.constantFrom('task-1', 'task-2', 'task-3'),
  title: fc.constantFrom('Task A', 'Task B', 'Task C'),
  status: fc.constantFrom('pending', 'in_progress', 'completed'),
  priority: fc.constantFrom('P1', 'P2', 'P3'),
});

// User settings state generator
const userSettingsStateArb = fc.record({
  pomodoroDuration: fc.constantFrom(25, 30, 45, 60),
  shortBreakDuration: fc.constantFrom(5, 10),
  longBreakDuration: fc.constantFrom(15, 20, 30),
  dailyCap: fc.constantFrom(6, 8, 10),
  enforcementMode: enforcementModeArb,
});

// Full state generator
const fullStateArb = fc.record({
  systemState: systemStateArb,
  dailyState: dailyStateArb,
  activePomodoro: fc.option(pomodoroStateArb, { nil: null }),
  top3Tasks: fc.array(taskStateArb, { minLength: 0, maxLength: 2 }),
  settings: userSettingsStateArb,
});

// Time slot generator
const timeSlotArb = fc.record({
  dayOfWeek: fc.integer({ min: 0, max: 6 }),
  startHour: fc.constantFrom(8, 9, 10),
  startMinute: fc.constantFrom(0, 30),
  endHour: fc.constantFrom(17, 18, 19),
  endMinute: fc.constantFrom(0, 30),
});

// Skip token config generator
const skipTokenConfigArb = fc.record({
  remaining: fc.integer({ min: 0, max: 5 }),
  maxPerDay: fc.constantFrom(3, 5),
  delayMinutes: fc.constantFrom(5, 10, 15),
});

// Distraction app generator
const distractionAppArb = fc.record({
  bundleId: fc.constantFrom('com.twitter.app', 'com.facebook.app', 'com.reddit.app'),
  name: fc.constantFrom('Twitter', 'Facebook', 'Reddit'),
  action: fc.constantFrom('force_quit' as const, 'hide_window' as const),
});

// Policy generator (simplified)
const policyArb = fc.record({
  version: fc.integer({ min: 1, max: 1000 }),
  blacklist: fc.constant(['twitter.com', 'facebook.com']),
  whitelist: fc.constant(['github.com', 'stackoverflow.com']),
  enforcementMode: enforcementModeArb,
  workTimeSlots: fc.array(timeSlotArb, { minLength: 0, maxLength: 2 }),
  skipTokens: skipTokenConfigArb,
  distractionApps: fc.array(distractionAppArb, { minLength: 0, maxLength: 2 }),
  updatedAt: fc.integer({ min: 1700000000000, max: 1800000000000 }),
});

// =============================================================================
// COMMAND GENERATORS
// =============================================================================

// SyncStateCommand generator (full sync)
const syncStateFullCommandArb = fc.tuple(
  baseCommandFieldsArb,
  fullStateArb,
  fc.integer({ min: 1, max: 1000000 })
).map(([base, state, version]) => ({
  ...base,
  commandType: 'SYNC_STATE' as const,
  payload: {
    syncType: 'full' as const,
    version,
    state,
  },
}));

// ExecuteActionCommand generator
const executeActionCommandArb = fc.tuple(
  baseCommandFieldsArb,
  fc.record({
    action: actionTypeArb,
    parameters: fc.constant({} as Record<string, unknown>),
    timeout: fc.option(fc.integer({ min: 1, max: 60000 }), { nil: undefined }),
    fallbackAction: fc.option(actionTypeArb, { nil: undefined }),
  })
).map(([base, payload]) => ({
  ...base,
  commandType: 'EXECUTE_ACTION' as const,
  payload,
}));

// UpdatePolicyCommand generator
const updatePolicyCommandArb = fc.tuple(
  baseCommandFieldsArb,
  fc.record({
    policyType: fc.constantFrom('full' as const, 'partial' as const),
    policy: policyArb,
    effectiveTime: fc.integer({ min: 1, max: Date.now() + 86400000 * 30 }),
  })
).map(([base, payload]) => ({
  ...base,
  commandType: 'UPDATE_POLICY' as const,
  payload,
}));

// ShowUICommand generator
const showUICommandArb = fc.tuple(
  baseCommandFieldsArb,
  fc.record({
    uiType: uiTypeArb,
    content: fc.constant({} as Record<string, unknown>),
    duration: fc.option(fc.integer({ min: 1, max: 60000 }), { nil: undefined }),
    dismissible: fc.boolean(),
  })
).map(([base, payload]) => ({
  ...base,
  commandType: 'SHOW_UI' as const,
  payload,
}));

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Property 2: Command Schema Validation', () => {
  /**
   * Feature: octopus-architecture, Property 2: Command Schema Validation
   * Validates: Requirements 2.4, 8.2, 8.3, 8.4, 8.5, 8.6
   */

  it('should accept valid SyncStateCommand with full sync', () => {
    fc.assert(
      fc.property(syncStateFullCommandArb, (command) => {
        const result = validateCommand(command);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.commandType).toBe('SYNC_STATE');
          expect(result.data.commandId).toBe(command.commandId);
          expect(result.data.targetClient).toBe(command.targetClient);
          expect(result.data.priority).toBe(command.priority);
          expect(result.data.requiresAck).toBe(command.requiresAck);
          expect(result.data.createdAt).toBe(command.createdAt);
        }
        return true;
      }),
      { numRuns: 50 }
    );
  });

  it('should accept valid ExecuteActionCommand with all required fields', () => {
    fc.assert(
      fc.property(executeActionCommandArb, (command) => {
        const result = validateCommand(command);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.commandType).toBe('EXECUTE_ACTION');
        }
        return true;
      }),
      { numRuns: 50 }
    );
  });

  it('should accept valid UpdatePolicyCommand with all required fields', () => {
    fc.assert(
      fc.property(updatePolicyCommandArb, (command) => {
        const result = validateCommand(command);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.commandType).toBe('UPDATE_POLICY');
        }
        return true;
      }),
      { numRuns: 50 }
    );
  });

  it('should accept valid ShowUICommand with all required fields', () => {
    fc.assert(
      fc.property(showUICommandArb, (command) => {
        const result = validateCommand(command);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.commandType).toBe('SHOW_UI');
        }
        return true;
      }),
      { numRuns: 50 }
    );
  });

  it('should reject commands missing required base fields', () => {
    const requiredFields = ['commandId', 'commandType', 'targetClient', 'priority', 'requiresAck', 'createdAt'];

    fc.assert(
      fc.property(
        executeActionCommandArb,
        fc.subarray(requiredFields, { minLength: 1 }),
        (validCommand, fieldsToRemove) => {
          const invalidCommand = { ...validCommand } as Record<string, unknown>;
          for (const field of fieldsToRemove) {
            delete invalidCommand[field];
          }

          const result = validateCommand(invalidCommand);
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.code).toBe('VALIDATION_ERROR');
          }
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should reject commands with invalid commandType', () => {
    fc.assert(
      fc.property(
        executeActionCommandArb,
        invalidCommandTypeArb,
        (validCommand, invalidCommandType) => {
          const invalidCommand = { ...validCommand, commandType: invalidCommandType };
          const result = validateCommand(invalidCommand);
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.code).toBe('VALIDATION_ERROR');
          }
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should reject commands with invalid targetClient', () => {
    fc.assert(
      fc.property(
        executeActionCommandArb,
        invalidTargetClientArb,
        (validCommand, invalidTargetClient) => {
          const invalidCommand = { ...validCommand, targetClient: invalidTargetClient };
          const result = validateCommand(invalidCommand);
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.code).toBe('VALIDATION_ERROR');
          }
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should reject commands with invalid priority', () => {
    fc.assert(
      fc.property(
        executeActionCommandArb,
        invalidPriorityArb,
        (validCommand, invalidPriority) => {
          const invalidCommand = { ...validCommand, priority: invalidPriority };
          const result = validateCommand(invalidCommand);
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.code).toBe('VALIDATION_ERROR');
          }
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should reject commands with negative createdAt', () => {
    fc.assert(
      fc.property(executeActionCommandArb, fc.integer({ min: -1000000, max: 0 }), (validCommand, negativeCreatedAt) => {
        const invalidCommand = { ...validCommand, createdAt: negativeCreatedAt };
        const result = validateCommand(invalidCommand);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('VALIDATION_ERROR');
        }
        return true;
      }),
      { numRuns: 50 }
    );
  });

  it('should reject ExecuteActionCommand with invalid action type', () => {
    fc.assert(
      fc.property(
        executeActionCommandArb,
        invalidActionTypeArb,
        (validCommand, invalidAction) => {
          const invalidCommand = {
            ...validCommand,
            payload: { ...validCommand.payload, action: invalidAction },
          };
          const result = validateCommand(invalidCommand);
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.code).toBe('VALIDATION_ERROR');
          }
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should reject UpdatePolicyCommand with invalid enforcement mode', () => {
    fc.assert(
      fc.property(
        updatePolicyCommandArb,
        invalidEnforcementModeArb,
        (validCommand, invalidMode) => {
          const invalidCommand = {
            ...validCommand,
            payload: {
              ...validCommand.payload,
              policy: { ...validCommand.payload.policy, enforcementMode: invalidMode },
            },
          };
          const result = validateCommand(invalidCommand);
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.code).toBe('VALIDATION_ERROR');
          }
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should reject ShowUICommand with invalid UI type', () => {
    fc.assert(
      fc.property(
        showUICommandArb,
        invalidUITypeArb,
        (validCommand, invalidUIType) => {
          const invalidCommand = {
            ...validCommand,
            payload: { ...validCommand.payload, uiType: invalidUIType },
          };
          const result = validateCommand(invalidCommand);
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.code).toBe('VALIDATION_ERROR');
          }
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});
