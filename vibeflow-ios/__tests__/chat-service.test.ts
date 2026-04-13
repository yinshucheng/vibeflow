/**
 * Chat Service Tests
 *
 * Tests for the chat service: WebSocket event sending, command handling,
 * and integration with the chat store.
 *
 * Mock strategy: mock websocketService to isolate chat service logic.
 */

import { useChatStore } from '../src/store/chat.store';
import type { ChatResponsePayload, ChatSyncPayload } from '../src/types';

// =============================================================================
// MOCK SETUP
// =============================================================================

// Variables prefixed with 'mock' are allowed in jest.mock() factory
const mockCommandHandlers: Map<string, Array<(payload: unknown) => void>> = new Map();
const mockSentEvents: Array<{ eventType: string; payload: unknown }> = [];

jest.mock('../src/services/websocket.service', () => ({
  websocketService: {
    sendEvent: jest.fn((event: { eventType: string; payload: unknown }) => {
      mockSentEvents.push({ eventType: event.eventType, payload: event.payload });
    }),
    onCommand: jest.fn(
      (commandType: string, handler: (payload: unknown) => void) => {
        const handlers = mockCommandHandlers.get(commandType) || [];
        handlers.push(handler);
        mockCommandHandlers.set(commandType, handlers);

        return () => {
          const current = mockCommandHandlers.get(commandType) || [];
          mockCommandHandlers.set(
            commandType,
            current.filter((h) => h !== handler)
          );
        };
      }
    ),
    onActionResult: jest.fn(() => () => {}),
    onStatusChange: jest.fn(() => () => {}),
    isConnected: jest.fn(() => true),
  },
}));

// Import after mock setup
import { chatService } from '../src/services/chat.service';

// =============================================================================
// HELPERS
// =============================================================================

function resetAll() {
  useChatStore.getState().reset();
  mockCommandHandlers.clear();
  mockSentEvents.length = 0;
  jest.clearAllMocks();
}

/**
 * Simulate a server command by invoking the registered handler.
 */
function simulateCommand(commandType: string, payload: unknown) {
  const handlers = mockCommandHandlers.get(commandType) || [];
  handlers.forEach((h) => h(payload));
}

// =============================================================================
// TESTS
// =============================================================================

describe('ChatService', () => {
  beforeEach(() => {
    resetAll();
    // Re-initialize for each test
    chatService.cleanup();
    chatService.initialize();
  });

  afterAll(() => {
    chatService.cleanup();
  });

  // ---- Initialization ----

  describe('initialize / cleanup', () => {
    it('should register command handlers on initialize', () => {
      expect(mockCommandHandlers.has('CHAT_RESPONSE')).toBe(true);
      expect(mockCommandHandlers.has('CHAT_TOOL_CALL')).toBe(true);
      expect(mockCommandHandlers.has('CHAT_TOOL_RESULT')).toBe(true);
      expect(mockCommandHandlers.has('CHAT_SYNC')).toBe(true);
    });

    it('should report ready after initialization', () => {
      expect(chatService.isReady()).toBe(true);
    });

    it('should not double-initialize', () => {
      const initialHandlerCount = mockCommandHandlers.get('CHAT_RESPONSE')?.length ?? 0;
      chatService.initialize(); // second call
      expect(mockCommandHandlers.get('CHAT_RESPONSE')?.length).toBe(initialHandlerCount);
    });
  });

  // ---- sendMessage ----

  describe('sendMessage', () => {
    it('should add user message to store', () => {
      chatService.sendMessage('Hello AI');

      const { messages } = useChatStore.getState();
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Hello AI');
    });

    it('should send CHAT_MESSAGE event via websocket', () => {
      chatService.sendMessage('Hello AI');

      expect(mockSentEvents).toHaveLength(1);
      expect(mockSentEvents[0].eventType).toBe('CHAT_MESSAGE');
      expect((mockSentEvents[0].payload as { content: string }).content).toBe('Hello AI');
    });

    it('should set isStreaming to true', () => {
      chatService.sendMessage('Test');

      expect(useChatStore.getState().isStreaming).toBe(true);
    });
  });

  // ---- CHAT_RESPONSE handling ----

  describe('CHAT_RESPONSE command', () => {
    it('should call appendStreamDelta on delta type', () => {
      const delta: ChatResponsePayload = {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        type: 'delta',
        content: 'Hello',
      };

      simulateCommand('CHAT_RESPONSE', delta);

      expect(useChatStore.getState().streamingContent).toBe('Hello');
    });

    it('should accumulate multiple deltas', () => {
      const delta1: ChatResponsePayload = {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        type: 'delta',
        content: 'Hello ',
      };
      const delta2: ChatResponsePayload = {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        type: 'delta',
        content: 'world',
      };

      simulateCommand('CHAT_RESPONSE', delta1);
      simulateCommand('CHAT_RESPONSE', delta2);

      expect(useChatStore.getState().streamingContent).toBe('Hello world');
    });

    it('should call finalizeStreamMessage on complete type', () => {
      // First send a message to set isStreaming
      useChatStore.getState().sendMessage('Hello');
      expect(useChatStore.getState().isStreaming).toBe(true);

      const complete: ChatResponsePayload = {
        conversationId: 'conv-1',
        messageId: 'msg-ai-1',
        type: 'complete',
        content: 'Hello! How can I help?',
        usage: { inputTokens: 10, outputTokens: 20 },
      };

      simulateCommand('CHAT_RESPONSE', complete);

      expect(useChatStore.getState().isStreaming).toBe(false);
      expect(useChatStore.getState().streamingContent).toBe('');

      const messages = useChatStore.getState().messages;
      const aiMessage = messages.find((m) => m.role === 'assistant');
      expect(aiMessage).toBeDefined();
      expect(aiMessage!.content).toBe('Hello! How can I help?');
      expect(aiMessage!.id).toBe('msg-ai-1');
    });
  });

  // ---- CHAT_SYNC handling ----

  describe('CHAT_SYNC command', () => {
    it('should replace store messages with synced messages', () => {
      // Pre-populate with a local message
      useChatStore.getState().sendMessage('Local message');
      expect(useChatStore.getState().messages).toHaveLength(1);

      const syncPayload: ChatSyncPayload = {
        conversationId: 'conv-1',
        messages: [
          {
            id: 'sync-1',
            role: 'user',
            content: 'Synced from other device',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'sync-2',
            role: 'assistant',
            content: 'AI reply from other device',
            createdAt: '2026-01-01T00:00:01.000Z',
          },
        ],
      };

      simulateCommand('CHAT_SYNC', syncPayload);

      const messages = useChatStore.getState().messages;
      expect(messages).toHaveLength(2);
      expect(messages[0].id).toBe('sync-1');
      expect(messages[0].content).toBe('Synced from other device');
      expect(messages[1].id).toBe('sync-2');
      expect(messages[1].content).toBe('AI reply from other device');
    });
  });

  // ---- CHAT_TOOL_CALL handling ----

  describe('CHAT_TOOL_CALL command', () => {
    it('should add pending tool call when requiresConfirmation is true', () => {
      simulateCommand('CHAT_TOOL_CALL', {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        toolCallId: 'tc-1',
        toolName: 'flow_delete_task',
        description: 'Delete task: buy coffee',
        parameters: { taskId: 'task-123' },
        requiresConfirmation: true,
      });

      const pending = useChatStore.getState().pendingToolCalls;
      expect(pending).toHaveLength(1);
      expect(pending[0].toolCallId).toBe('tc-1');
      expect(pending[0].toolName).toBe('flow_delete_task');
    });

    it('should not add pending tool call when requiresConfirmation is false', () => {
      simulateCommand('CHAT_TOOL_CALL', {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        toolCallId: 'tc-1',
        toolName: 'flow_create_task_from_nl',
        description: 'Create task',
        parameters: { description: 'buy coffee' },
        requiresConfirmation: false,
      });

      expect(useChatStore.getState().pendingToolCalls).toHaveLength(0);
    });
  });

  // ---- confirmToolCall / cancelToolCall ----

  describe('confirmToolCall', () => {
    it('should send CHAT_ACTION confirm event and remove pending tool call', () => {
      // Add a pending tool call
      useChatStore.getState().addPendingToolCall({
        toolCallId: 'tc-1',
        toolName: 'flow_delete_task',
        description: 'Delete task',
        parameters: {},
        requiresConfirmation: true,
        messageId: 'msg-1',
        conversationId: 'conv-1',
      });

      chatService.confirmToolCall('conv-1', 'tc-1');

      // Check store
      expect(useChatStore.getState().pendingToolCalls).toHaveLength(0);

      // Check WebSocket event sent
      const actionEvent = mockSentEvents.find((e) => e.eventType === 'CHAT_ACTION');
      expect(actionEvent).toBeDefined();
      const payload = actionEvent!.payload as { toolCallId: string; action: string };
      expect(payload.toolCallId).toBe('tc-1');
      expect(payload.action).toBe('confirm');
    });
  });

  describe('cancelToolCall', () => {
    it('should send CHAT_ACTION cancel event and remove pending tool call', () => {
      useChatStore.getState().addPendingToolCall({
        toolCallId: 'tc-2',
        toolName: 'flow_delete_task',
        description: 'Delete task',
        parameters: {},
        requiresConfirmation: true,
        messageId: 'msg-1',
        conversationId: 'conv-1',
      });

      chatService.cancelToolCall('conv-1', 'tc-2');

      expect(useChatStore.getState().pendingToolCalls).toHaveLength(0);

      const actionEvent = mockSentEvents.find((e) => e.eventType === 'CHAT_ACTION');
      expect(actionEvent).toBeDefined();
      const payload = actionEvent!.payload as { toolCallId: string; action: string };
      expect(payload.toolCallId).toBe('tc-2');
      expect(payload.action).toBe('cancel');
    });
  });
});
