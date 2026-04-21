/**
 * Protocol Conformance Tests
 *
 * Validates that TypeScript types, Zod schemas, and discriminated unions
 * are all in sync. Catches drift between interfaces and runtime validation.
 *
 * Phase D: Tasks 74-78
 */

import { describe, it, expect, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import {
  EventTypeSchema,
  CommandTypeSchema,
  ClientTypeSchema,
  ActionTypeSchema,
  OctopusEventSchema,
  OctopusCommandSchema,
  PolicySchema,
  PolicyConfigSchema,
  PolicyStateSchema,
  BaseEventSchema,
  BaseCommandSchema,
  ActionResultCommandSchema,
  ActionResultPayloadSchema,
} from '../src/validation/schemas';
import { validateEvent, validateCommand, validatePolicy } from '../src/validation/functions';
import { createCommandHandler } from '../src/protocol/command-handler';
import type {
  EventType,
  CommandType,
  ClientType,
  ActionType,
  OctopusEvent,
  OctopusCommand,
  Policy,
  PolicyConfig,
  PolicyState,
} from '../src/types';

// =============================================================================
// HELPERS
// =============================================================================

const ALL_EVENT_TYPES: EventType[] = [
  'ACTIVITY_LOG', 'STATE_CHANGE', 'USER_ACTION', 'HEARTBEAT',
  'TIMELINE_EVENT', 'BLOCK_EVENT', 'INTERRUPTION_EVENT',
  'BROWSER_ACTIVITY', 'BROWSER_SESSION', 'TAB_SWITCH', 'BROWSER_FOCUS',
  'ENTERTAINMENT_MODE', 'WORK_START',
  'CHAT_MESSAGE', 'CHAT_ACTION', 'CHAT_HISTORY_REQUEST',
  'DESKTOP_APP_USAGE', 'DESKTOP_IDLE', 'DESKTOP_WINDOW_CHANGE',
];

const ALL_COMMAND_TYPES: CommandType[] = [
  'SYNC_STATE', 'EXECUTE_ACTION', 'UPDATE_POLICY', 'SHOW_UI',
  'ACTION_RESULT',
  'CHAT_RESPONSE', 'CHAT_TOOL_CALL', 'CHAT_TOOL_RESULT', 'CHAT_SYNC',
];

const ALL_CLIENT_TYPES: ClientType[] = ['web', 'desktop', 'browser_ext', 'mobile', 'api'];

const ALL_ACTION_TYPES: ActionType[] = [
  'CLOSE_APP', 'HIDE_APP', 'BRING_TO_FRONT', 'SHOW_NOTIFICATION',
  'CLOSE_TAB', 'REDIRECT_TAB', 'INJECT_OVERLAY', 'ADD_SESSION_WHITELIST',
  'SEND_PUSH', 'PLAY_SOUND', 'VIBRATE',
];

function makeBaseEvent(eventType: EventType) {
  return {
    eventId: uuidv4(),
    eventType,
    userId: 'user-1',
    clientId: 'client-1',
    clientType: 'web' as ClientType,
    timestamp: Date.now(),
    sequenceNumber: 0,
  };
}

function makeBaseCommand(commandType: CommandType) {
  return {
    commandId: uuidv4(),
    commandType,
    targetClient: 'all' as const,
    priority: 'normal' as const,
    requiresAck: false,
    createdAt: Date.now(),
  };
}

function makeSamplePolicy(): Policy {
  return {
    config: {
      version: 1,
      updatedAt: Date.now(),
      blacklist: ['example.com', 'distraction.io'],
      whitelist: ['docs.google.com'],
      enforcementMode: 'strict',
      workTimeSlots: [{ dayOfWeek: 1, startHour: 9, startMinute: 0, endHour: 17, endMinute: 0 }],
      skipTokens: { maxPerDay: 3, delayMinutes: 5 },
      distractionApps: [{ bundleId: 'com.twitter', name: 'Twitter', action: 'force_quit' }],
      sleepTime: {
        enabled: true,
        startTime: '23:00',
        endTime: '07:00',
        enforcementApps: [{ bundleId: 'com.slack', name: 'Slack' }],
      },
      overRestEnforcementApps: [{ bundleId: 'com.code', name: 'VSCode', action: 'hide_window' }],
      restEnforcement: {
        workApps: [{ bundleId: 'com.code', name: 'VSCode' }],
        actions: ['close', 'hide'],
        graceDurationMinutes: 2,
      },
    },
    state: {
      skipTokensRemaining: 2,
      isSleepTimeActive: false,
      isSleepSnoozed: false,
      isOverRest: false,
      overRestMinutes: 0,
      overRestBringToFront: false,
      isRestEnforcementActive: false,
      restGrace: { available: true, remaining: 120 },
      adhocFocusSession: { active: true, endTime: Date.now() + 3600000, overridesSleepTime: true },
      temporaryUnblock: { active: false, endTime: Date.now() + 300000 },
      healthLimit: { type: '2hours', message: 'Take a break!', repeating: true, intervalMinutes: 15 },
    },
  };
}

// =============================================================================
// Task 75: EventType ↔ interface ↔ Zod schema mapping
// =============================================================================

describe('EventType conformance', () => {
  it('Zod EventTypeSchema accepts every TypeScript EventType value', () => {
    for (const eventType of ALL_EVENT_TYPES) {
      const result = EventTypeSchema.safeParse(eventType);
      expect(result.success, `EventTypeSchema should accept '${eventType}'`).toBe(true);
    }
  });

  it('Zod EventTypeSchema has exactly the same members as TypeScript EventType', () => {
    const zodValues = EventTypeSchema.options;
    expect([...zodValues].sort()).toEqual([...ALL_EVENT_TYPES].sort());
  });

  it('OctopusEventSchema discriminated union covers events with Zod-validatable schemas', () => {
    // Build a valid event for each event type that has a dedicated schema
    const sampleEvents: Record<string, unknown> = {
      ACTIVITY_LOG: {
        ...makeBaseEvent('ACTIVITY_LOG'),
        payload: {
          source: 'browser', identifier: 'https://example.com', title: 'Example',
          duration: 30, category: 'productive',
        },
      },
      STATE_CHANGE: {
        ...makeBaseEvent('STATE_CHANGE'),
        payload: { previousState: 'idle', newState: 'focus', trigger: 'user', timestamp: Date.now() },
      },
      USER_ACTION: {
        ...makeBaseEvent('USER_ACTION'),
        payload: { actionType: 'TASK_COMPLETE', targetEntity: 't1', parameters: {}, result: 'ok' },
      },
      HEARTBEAT: {
        ...makeBaseEvent('HEARTBEAT'),
        payload: {
          clientVersion: '1.0.0', platform: 'macos', connectionQuality: 'good',
          localStateHash: 'abc123', capabilities: ['sensor:app'], uptime: 42,
        },
      },
      BROWSER_ACTIVITY: {
        ...makeBaseEvent('BROWSER_ACTIVITY'),
        payload: {
          url: 'https://example.com', title: 'Example', domain: 'example.com',
          startTime: Date.now() - 60000, endTime: Date.now(), duration: 60,
          activeDuration: 50, idleTime: 10, category: 'productive', productivityScore: 80,
          scrollDepth: 50, interactionCount: 5, isMediaPlaying: false, mediaPlayDuration: 0,
          navigationType: 'link',
        },
      },
      BROWSER_SESSION: {
        ...makeBaseEvent('BROWSER_SESSION'),
        payload: {
          sessionId: 'session-1', startTime: Date.now() - 3600000, endTime: Date.now(),
          totalDuration: 3600, activeDuration: 3000, domainBreakdown: [
            { domain: 'example.com', duration: 1800, activeDuration: 1500, category: 'productive', visitCount: 5 },
          ],
          tabSwitchCount: 10, rapidTabSwitches: 2, uniqueDomainsVisited: 3,
          productiveTime: 2000, distractingTime: 500, neutralTime: 500, productivityScore: 75,
        },
      },
      TAB_SWITCH: {
        ...makeBaseEvent('TAB_SWITCH'),
        payload: {
          fromTabId: 1, toTabId: 2, fromUrl: 'https://a.com', toUrl: 'https://b.com',
          fromDomain: 'a.com', toDomain: 'b.com', timeSinceLastSwitch: 5000, isRapidSwitch: false,
        },
      },
      BROWSER_FOCUS: {
        ...makeBaseEvent('BROWSER_FOCUS'),
        payload: { isFocused: true, previousState: 'blurred' },
      },
      ENTERTAINMENT_MODE: {
        ...makeBaseEvent('ENTERTAINMENT_MODE'),
        payload: {
          action: 'start', sessionId: 'ent-1', timestamp: Date.now(),
          quotaUsedBefore: 10,
        },
      },
      WORK_START: {
        ...makeBaseEvent('WORK_START'),
        payload: {
          date: '2026-04-21', configuredStartTime: '09:00',
          actualStartTime: Date.now(), delayMinutes: 5, trigger: 'first_pomodoro',
        },
      },
      CHAT_MESSAGE: {
        ...makeBaseEvent('CHAT_MESSAGE'),
        payload: { conversationId: 'conv-1', messageId: 'msg-1', content: 'hello' },
      },
      CHAT_ACTION: {
        ...makeBaseEvent('CHAT_ACTION'),
        payload: { conversationId: 'conv-1', toolCallId: 'tc-1', action: 'confirm' },
      },
      CHAT_HISTORY_REQUEST: {
        ...makeBaseEvent('CHAT_HISTORY_REQUEST'),
        payload: {},
      },
    };

    for (const [eventType, event] of Object.entries(sampleEvents)) {
      const result = OctopusEventSchema.safeParse(event);
      expect(result.success, `OctopusEventSchema should validate ${eventType}: ${JSON.stringify(result.success ? {} : result.error.issues)}`).toBe(true);
    }
  });

  it('WorkStartPayload.trigger accepts both first_pomodoro and airlock_complete', () => {
    const base = {
      ...makeBaseEvent('WORK_START'),
      payload: {
        date: '2026-04-21', configuredStartTime: '09:00',
        actualStartTime: Date.now(), delayMinutes: 0, trigger: 'airlock_complete',
      },
    };
    const result = OctopusEventSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it('BaseEventSchema accepts all ClientType values', () => {
    for (const clientType of ALL_CLIENT_TYPES) {
      const event = {
        eventId: uuidv4(),
        eventType: 'HEARTBEAT',
        userId: 'user-1',
        clientId: 'client-1',
        clientType,
        timestamp: Date.now(),
        sequenceNumber: 0,
      };
      const result = BaseEventSchema.safeParse(event);
      expect(result.success, `BaseEventSchema should accept clientType '${clientType}'`).toBe(true);
    }
  });
});

// =============================================================================
// Task 76: CommandType ↔ interface ↔ Zod schema mapping
// =============================================================================

describe('CommandType conformance', () => {
  it('Zod CommandTypeSchema accepts every TypeScript CommandType value', () => {
    for (const commandType of ALL_COMMAND_TYPES) {
      const result = CommandTypeSchema.safeParse(commandType);
      expect(result.success, `CommandTypeSchema should accept '${commandType}'`).toBe(true);
    }
  });

  it('Zod CommandTypeSchema has exactly the same members as TypeScript CommandType', () => {
    const zodValues = CommandTypeSchema.options;
    expect([...zodValues].sort()).toEqual([...ALL_COMMAND_TYPES].sort());
  });

  it('OctopusCommandSchema discriminated union covers all command types with schemas', () => {
    const now = Date.now();
    const sampleCommands: Record<string, unknown> = {
      SYNC_STATE: {
        ...makeBaseCommand('SYNC_STATE'),
        payload: {
          syncType: 'full', version: 1,
          state: {
            systemState: { state: 'idle', dailyCapReached: false, skipTokensRemaining: 3 },
            dailyState: { date: '2026-04-21', completedPomodoros: 0, totalFocusMinutes: 0, top3TaskIds: [] },
            activePomodoro: null,
            top3Tasks: [],
            settings: {
              pomodoroDuration: 25, shortBreakDuration: 5, longBreakDuration: 15,
              dailyCap: 8, enforcementMode: 'strict',
            },
          },
        },
      },
      EXECUTE_ACTION: {
        ...makeBaseCommand('EXECUTE_ACTION'),
        payload: { action: 'CLOSE_APP', parameters: { bundleId: 'com.test' } },
      },
      UPDATE_POLICY: {
        ...makeBaseCommand('UPDATE_POLICY'),
        payload: {
          policyType: 'full',
          policy: makeSamplePolicy(),
          effectiveTime: now,
        },
      },
      SHOW_UI: {
        ...makeBaseCommand('SHOW_UI'),
        payload: { uiType: 'toast', content: { message: 'hello' }, dismissible: true },
      },
      ACTION_RESULT: {
        ...makeBaseCommand('ACTION_RESULT'),
        payload: { optimisticId: 'opt-1', success: true, data: { taskId: 't1' } },
      },
      CHAT_RESPONSE: {
        ...makeBaseCommand('CHAT_RESPONSE'),
        payload: { conversationId: 'conv-1', messageId: 'msg-1', type: 'complete', content: 'hello' },
      },
      CHAT_TOOL_CALL: {
        ...makeBaseCommand('CHAT_TOOL_CALL'),
        payload: {
          conversationId: 'conv-1', messageId: 'msg-1', toolCallId: 'tc-1',
          toolName: 'search', description: 'search tasks', parameters: {},
          requiresConfirmation: false,
        },
      },
      CHAT_TOOL_RESULT: {
        ...makeBaseCommand('CHAT_TOOL_RESULT'),
        payload: {
          conversationId: 'conv-1', messageId: 'msg-1', toolCallId: 'tc-1',
          success: true, summary: 'found 3 tasks',
        },
      },
      CHAT_SYNC: {
        ...makeBaseCommand('CHAT_SYNC'),
        payload: { conversationId: 'conv-1', messages: [] },
      },
    };

    for (const [commandType, command] of Object.entries(sampleCommands)) {
      const result = OctopusCommandSchema.safeParse(command);
      expect(result.success, `OctopusCommandSchema should validate ${commandType}: ${JSON.stringify(result.success ? {} : result.error.issues)}`).toBe(true);
    }
  });

  it('ActionType Zod schema matches TypeScript ActionType', () => {
    for (const actionType of ALL_ACTION_TYPES) {
      const result = ActionTypeSchema.safeParse(actionType);
      expect(result.success, `ActionTypeSchema should accept '${actionType}'`).toBe(true);
    }
    expect([...ActionTypeSchema.options].sort()).toEqual([...ALL_ACTION_TYPES].sort());
  });

  it('ClientType Zod schema matches TypeScript ClientType', () => {
    for (const clientType of ALL_CLIENT_TYPES) {
      const result = ClientTypeSchema.safeParse(clientType);
      expect(result.success, `ClientTypeSchema should accept '${clientType}'`).toBe(true);
    }
    expect([...ClientTypeSchema.options].sort()).toEqual([...ALL_CLIENT_TYPES].sort());
  });
});

// =============================================================================
// Task 77: Policy (Config + State) JSON roundtrip
// =============================================================================

describe('Policy JSON roundtrip', () => {
  it('full policy survives JSON.stringify → JSON.parse → Zod validation', () => {
    const original = makeSamplePolicy();
    const json = JSON.stringify(original);
    const parsed = JSON.parse(json);
    const result = PolicySchema.safeParse(parsed);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.config.blacklist).toEqual(original.config.blacklist);
      expect(result.data.config.enforcementMode).toBe('strict');
      expect(result.data.state.skipTokensRemaining).toBe(2);
      expect(result.data.state.isOverRest).toBe(false);
      expect(result.data.config.sleepTime?.enabled).toBe(true);
      expect(result.data.state.adhocFocusSession?.active).toBe(true);
      expect(result.data.state.healthLimit?.type).toBe('2hours');
    }
  });

  it('PolicyConfig roundtrip preserves all fields', () => {
    const config: PolicyConfig = {
      version: 5,
      updatedAt: Date.now(),
      blacklist: ['a.com', 'b.com'],
      whitelist: ['c.com'],
      enforcementMode: 'gentle',
      workTimeSlots: [
        { dayOfWeek: 0, startHour: 8, startMinute: 30, endHour: 12, endMinute: 0 },
        { dayOfWeek: 5, startHour: 13, startMinute: 0, endHour: 17, endMinute: 30 },
      ],
      skipTokens: { maxPerDay: 5, delayMinutes: 10 },
      distractionApps: [],
    };

    const json = JSON.stringify(config);
    const parsed = JSON.parse(json);
    const result = PolicyConfigSchema.safeParse(parsed);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.workTimeSlots).toHaveLength(2);
      expect(result.data.enforcementMode).toBe('gentle');
      expect(result.data.skipTokens.maxPerDay).toBe(5);
    }
  });

  it('PolicyState roundtrip preserves all fields', () => {
    const state: PolicyState = {
      skipTokensRemaining: 0,
      isSleepTimeActive: true,
      isSleepSnoozed: true,
      sleepSnoozeEndTime: Date.now() + 900000,
      isOverRest: true,
      overRestMinutes: 15,
      overRestBringToFront: true,
      isRestEnforcementActive: true,
      restGrace: { available: false, remaining: 0 },
      temporaryUnblock: { active: true, endTime: Date.now() + 60000 },
    };

    const json = JSON.stringify(state);
    const parsed = JSON.parse(json);
    const result = PolicyStateSchema.safeParse(parsed);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isSleepTimeActive).toBe(true);
      expect(result.data.isSleepSnoozed).toBe(true);
      expect(result.data.sleepSnoozeEndTime).toBeGreaterThan(0);
      expect(result.data.isOverRest).toBe(true);
      expect(result.data.overRestMinutes).toBe(15);
      expect(result.data.temporaryUnblock?.active).toBe(true);
    }
  });

  it('minimal policy (no optional fields) validates', () => {
    const minimal: Policy = {
      config: {
        version: 1,
        updatedAt: Date.now(),
        blacklist: [],
        whitelist: [],
        enforcementMode: 'strict',
        workTimeSlots: [],
        skipTokens: { maxPerDay: 3, delayMinutes: 5 },
        distractionApps: [],
      },
      state: {
        skipTokensRemaining: 3,
        isSleepTimeActive: false,
        isSleepSnoozed: false,
        isOverRest: false,
        overRestMinutes: 0,
        overRestBringToFront: false,
        isRestEnforcementActive: false,
      },
    };

    const json = JSON.stringify(minimal);
    const parsed = JSON.parse(json);
    const result = PolicySchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it('validatePolicy() function works with full policy', () => {
    const policy = makeSamplePolicy();
    const result = validatePolicy(policy);
    expect(result.success).toBe(true);
  });

  it('validatePolicy() rejects invalid policy', () => {
    const result = validatePolicy({ config: 'invalid', state: null });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
  });
});

// =============================================================================
// Task 78: Unknown commandType graceful ignore
// =============================================================================

describe('Unknown commandType graceful ignore', () => {
  it('createCommandHandler ignores unknown commandType without throwing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handler = createCommandHandler({
      onStateSync: vi.fn(),
      onPolicyUpdate: vi.fn(),
      onExecuteAction: vi.fn(),
      onShowUI: vi.fn(),
      onActionResult: vi.fn(),
    });

    const futureCommand = {
      ...makeBaseCommand('SYNC_STATE'), // base with valid shape
      commandType: 'FUTURE_COMMAND_V2',
      payload: { data: 'something new' },
    } as unknown as OctopusCommand;

    expect(() => handler(futureCommand)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('FUTURE_COMMAND_V2'));
    warnSpy.mockRestore();
  });

  it('validateCommand() rejects unknown commandType', () => {
    const badCommand = {
      ...makeBaseCommand('SYNC_STATE'),
      commandType: 'NONEXISTENT',
      payload: {},
    };
    const result = validateCommand(badCommand);
    expect(result.success).toBe(false);
  });

  it('validateEvent() rejects unknown eventType', () => {
    const badEvent = {
      ...makeBaseEvent('HEARTBEAT'),
      eventType: 'NONEXISTENT',
      payload: {},
    };
    const result = validateEvent(badEvent);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Validation functions integration
// =============================================================================

describe('Validation functions integration', () => {
  it('validateEvent() accepts a valid HEARTBEAT event', () => {
    const event = {
      ...makeBaseEvent('HEARTBEAT'),
      payload: {
        clientVersion: '1.0.0', platform: 'macos', connectionQuality: 'good',
        localStateHash: 'hash', capabilities: ['sensor:app'], uptime: 100,
      },
    };
    const result = validateEvent(event);
    expect(result.success).toBe(true);
  });

  it('validateCommand() accepts a valid SYNC_STATE command', () => {
    const cmd = {
      ...makeBaseCommand('SYNC_STATE'),
      payload: { syncType: 'full', version: 1 },
    };
    const result = validateCommand(cmd);
    expect(result.success).toBe(true);
  });

  it('validateCommand() accepts ACTION_RESULT command', () => {
    const cmd = {
      ...makeBaseCommand('ACTION_RESULT'),
      payload: { optimisticId: 'opt-1', success: true },
    };
    const result = validateCommand(cmd);
    expect(result.success).toBe(true);
  });
});
