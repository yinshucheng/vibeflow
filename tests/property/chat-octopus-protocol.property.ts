/**
 * Property tests for Chat Octopus protocol types.
 *
 * Verifies CHAT_* events and commands pass validation and inherit base fields.
 */
import { describe, it, expect } from 'vitest';
import {
  validateEvent,
  validateCommand,
  ChatMessageEventSchema,
  ChatActionEventSchema,
  ChatResponseCommandSchema,
  ChatToolCallCommandSchema,
  ChatToolResultCommandSchema,
  ChatSyncCommandSchema,
} from '../../src/types/octopus';

function makeBaseEvent(eventType: string, payload: Record<string, unknown>) {
  return {
    eventId: crypto.randomUUID(),
    eventType,
    userId: crypto.randomUUID(),
    clientId: crypto.randomUUID(),
    clientType: 'mobile' as const,
    timestamp: Date.now(),
    sequenceNumber: 1,
    payload,
  };
}

function makeBaseCommand(commandType: string, payload: Record<string, unknown>) {
  return {
    commandId: crypto.randomUUID(),
    commandType,
    targetClient: 'mobile' as const,
    priority: 'normal' as const,
    requiresAck: false,
    createdAt: Date.now(),
    payload,
  };
}

describe('Chat Octopus Protocol Properties', () => {
  describe('CHAT_MESSAGE event', () => {
    it('validates a well-formed CHAT_MESSAGE event', () => {
      const event = makeBaseEvent('CHAT_MESSAGE', {
        conversationId: crypto.randomUUID(),
        messageId: crypto.randomUUID(),
        content: '你好',
      });

      const result = validateEvent(event);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.eventType).toBe('CHAT_MESSAGE');
      }
    });

    it('validates CHAT_MESSAGE with attachments', () => {
      const event = makeBaseEvent('CHAT_MESSAGE', {
        conversationId: crypto.randomUUID(),
        messageId: crypto.randomUUID(),
        content: '帮我看看这个任务',
        attachments: [
          { type: 'task', id: crypto.randomUUID(), title: '买咖啡' },
        ],
      });

      const result = validateEvent(event);
      expect(result.success).toBe(true);
    });

    it('rejects CHAT_MESSAGE with missing content', () => {
      const event = makeBaseEvent('CHAT_MESSAGE', {
        conversationId: crypto.randomUUID(),
        messageId: crypto.randomUUID(),
        // content missing
      });

      const result = ChatMessageEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('inherits base event fields', () => {
      const event = makeBaseEvent('CHAT_MESSAGE', {
        conversationId: crypto.randomUUID(),
        messageId: crypto.randomUUID(),
        content: 'test',
      });

      const result = validateEvent(event);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('eventId');
        expect(result.data).toHaveProperty('userId');
        expect(result.data).toHaveProperty('clientId');
        expect(result.data).toHaveProperty('timestamp');
        expect(result.data).toHaveProperty('sequenceNumber');
      }
    });
  });

  describe('CHAT_ACTION event', () => {
    it('validates a well-formed CHAT_ACTION confirm event', () => {
      const event = makeBaseEvent('CHAT_ACTION', {
        conversationId: crypto.randomUUID(),
        toolCallId: crypto.randomUUID(),
        action: 'confirm',
      });

      const result = validateEvent(event);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.eventType).toBe('CHAT_ACTION');
      }
    });

    it('validates CHAT_ACTION cancel event', () => {
      const event = makeBaseEvent('CHAT_ACTION', {
        conversationId: crypto.randomUUID(),
        toolCallId: crypto.randomUUID(),
        action: 'cancel',
      });

      const result = validateEvent(event);
      expect(result.success).toBe(true);
    });

    it('rejects CHAT_ACTION with invalid action value', () => {
      const event = makeBaseEvent('CHAT_ACTION', {
        conversationId: crypto.randomUUID(),
        toolCallId: crypto.randomUUID(),
        action: 'invalid',
      });

      const result = ChatActionEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });
  });

  describe('CHAT_RESPONSE command', () => {
    it('validates a delta response command', () => {
      const cmd = makeBaseCommand('CHAT_RESPONSE', {
        conversationId: crypto.randomUUID(),
        messageId: crypto.randomUUID(),
        type: 'delta',
        content: '你好',
      });

      const result = validateCommand(cmd);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.commandType).toBe('CHAT_RESPONSE');
      }
    });

    it('validates a complete response command with usage', () => {
      const cmd = makeBaseCommand('CHAT_RESPONSE', {
        conversationId: crypto.randomUUID(),
        messageId: crypto.randomUUID(),
        type: 'complete',
        content: '你好，我是 VibeFlow 助手。',
        usage: { inputTokens: 50, outputTokens: 20 },
      });

      const result = validateCommand(cmd);
      expect(result.success).toBe(true);
    });

    it('inherits base command fields', () => {
      const cmd = makeBaseCommand('CHAT_RESPONSE', {
        conversationId: crypto.randomUUID(),
        messageId: crypto.randomUUID(),
        type: 'delta',
        content: 'test',
      });

      const result = validateCommand(cmd);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('commandId');
        expect(result.data).toHaveProperty('targetClient');
        expect(result.data).toHaveProperty('priority');
        expect(result.data).toHaveProperty('requiresAck');
      }
    });
  });

  describe('CHAT_TOOL_CALL command', () => {
    it('validates a tool call command', () => {
      const cmd = makeBaseCommand('CHAT_TOOL_CALL', {
        conversationId: crypto.randomUUID(),
        messageId: crypto.randomUUID(),
        toolCallId: crypto.randomUUID(),
        toolName: 'flow_complete_task',
        description: '完成任务：买咖啡',
        parameters: { taskId: 'task-123' },
        requiresConfirmation: false,
      });

      const result = validateCommand(cmd);
      expect(result.success).toBe(true);
    });

    it('validates a tool call requiring confirmation', () => {
      const cmd = makeBaseCommand('CHAT_TOOL_CALL', {
        conversationId: crypto.randomUUID(),
        messageId: crypto.randomUUID(),
        toolCallId: crypto.randomUUID(),
        toolName: 'flow_delete_task',
        description: '删除任务：买咖啡',
        parameters: { taskId: 'task-123' },
        requiresConfirmation: true,
      });

      const result = validateCommand(cmd);
      expect(result.success).toBe(true);
    });
  });

  describe('CHAT_TOOL_RESULT command', () => {
    it('validates a successful tool result', () => {
      const cmd = makeBaseCommand('CHAT_TOOL_RESULT', {
        conversationId: crypto.randomUUID(),
        messageId: crypto.randomUUID(),
        toolCallId: crypto.randomUUID(),
        success: true,
        summary: '任务已完成',
      });

      const result = validateCommand(cmd);
      expect(result.success).toBe(true);
    });

    it('validates a failed tool result', () => {
      const cmd = makeBaseCommand('CHAT_TOOL_RESULT', {
        conversationId: crypto.randomUUID(),
        messageId: crypto.randomUUID(),
        toolCallId: crypto.randomUUID(),
        success: false,
        summary: '任务不存在',
      });

      const result = validateCommand(cmd);
      expect(result.success).toBe(true);
    });
  });

  describe('CHAT_SYNC command', () => {
    it('validates a sync command with messages', () => {
      const cmd = makeBaseCommand('CHAT_SYNC', {
        conversationId: crypto.randomUUID(),
        messages: [
          {
            id: crypto.randomUUID(),
            role: 'user',
            content: '你好',
            createdAt: new Date().toISOString(),
          },
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: '你好！有什么可以帮你的吗？',
            metadata: { isProactive: false },
            createdAt: new Date().toISOString(),
          },
        ],
      });

      const result = validateCommand(cmd);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.commandType).toBe('CHAT_SYNC');
      }
    });

    it('validates a sync command with empty messages', () => {
      const cmd = makeBaseCommand('CHAT_SYNC', {
        conversationId: crypto.randomUUID(),
        messages: [],
      });

      const result = validateCommand(cmd);
      expect(result.success).toBe(true);
    });
  });

  describe('Protocol consistency', () => {
    it('CHAT_* events use the same base fields as existing events', () => {
      // Verify by constructing an ACTIVITY_LOG and CHAT_MESSAGE with same base
      const base = {
        eventId: crypto.randomUUID(),
        userId: crypto.randomUUID(),
        clientId: crypto.randomUUID(),
        clientType: 'web' as const,
        timestamp: Date.now(),
        sequenceNumber: 42,
      };

      const activityEvent = {
        ...base,
        eventType: 'ACTIVITY_LOG' as const,
        payload: {
          source: 'desktop_app' as const,
          identifier: 'com.test.app',
          title: 'Test App',
          category: 'productive' as const,
          duration: 10,
        },
      };

      const chatEvent = {
        ...base,
        eventType: 'CHAT_MESSAGE' as const,
        payload: {
          conversationId: crypto.randomUUID(),
          messageId: crypto.randomUUID(),
          content: 'test',
        },
      };

      const actResult = validateEvent(activityEvent);
      const chatResult = validateEvent(chatEvent);

      expect(actResult.success).toBe(true);
      expect(chatResult.success).toBe(true);

      if (actResult.success && chatResult.success) {
        // Same base fields
        expect(actResult.data.eventId).toBe(chatResult.data.eventId);
        expect(actResult.data.userId).toBe(chatResult.data.userId);
        expect(actResult.data.sequenceNumber).toBe(chatResult.data.sequenceNumber);
      }
    });
  });
});
