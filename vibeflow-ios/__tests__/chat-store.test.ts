/**
 * Chat Store Tests
 *
 * Tests for the Zustand chat store: message management, streaming,
 * panel state, and tool call handling.
 */

import { useChatStore } from '../src/store/chat.store';
import type { ChatMessage, PendingToolCall } from '../src/types';

// =============================================================================
// HELPERS
// =============================================================================

function resetStore() {
  useChatStore.getState().reset();
}

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    role: 'user',
    content: 'Hello',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createToolCall(overrides: Partial<PendingToolCall> = {}): PendingToolCall {
  return {
    toolCallId: 'tc-1',
    toolName: 'flow_create_task_from_nl',
    description: 'Create a task',
    parameters: { description: 'buy coffee' },
    requiresConfirmation: true,
    messageId: 'msg-1',
    conversationId: 'conv-1',
    ...overrides,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('Chat Store', () => {
  beforeEach(() => {
    resetStore();
  });

  // ---- Panel state ----

  describe('openPanel / closePanel', () => {
    it('should open the panel', () => {
      expect(useChatStore.getState().isPanelOpen).toBe(false);

      useChatStore.getState().openPanel();

      expect(useChatStore.getState().isPanelOpen).toBe(true);
    });

    it('should close the panel', () => {
      useChatStore.getState().openPanel();
      expect(useChatStore.getState().isPanelOpen).toBe(true);

      useChatStore.getState().closePanel();

      expect(useChatStore.getState().isPanelOpen).toBe(false);
    });

    it('should toggle between open and closed', () => {
      useChatStore.getState().openPanel();
      expect(useChatStore.getState().isPanelOpen).toBe(true);

      useChatStore.getState().closePanel();
      expect(useChatStore.getState().isPanelOpen).toBe(false);

      useChatStore.getState().openPanel();
      expect(useChatStore.getState().isPanelOpen).toBe(true);
    });
  });

  // ---- Panel height ----

  describe('togglePanelHeight', () => {
    it('should toggle between half and full', () => {
      expect(useChatStore.getState().panelHeight).toBe('half');

      useChatStore.getState().togglePanelHeight();
      expect(useChatStore.getState().panelHeight).toBe('full');

      useChatStore.getState().togglePanelHeight();
      expect(useChatStore.getState().panelHeight).toBe('half');
    });
  });

  // ---- sendMessage ----

  describe('sendMessage', () => {
    it('should append a user message to messages', () => {
      useChatStore.getState().sendMessage('Hello AI');

      const { messages } = useChatStore.getState();
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Hello AI');
      expect(messages[0].id).toBeDefined();
      expect(messages[0].createdAt).toBeDefined();
    });

    it('should set isStreaming to true', () => {
      useChatStore.getState().sendMessage('Hello');

      expect(useChatStore.getState().isStreaming).toBe(true);
    });

    it('should clear streamingContent', () => {
      // Simulate existing streaming content
      useChatStore.getState().appendStreamDelta('partial');
      expect(useChatStore.getState().streamingContent).toBe('partial');

      useChatStore.getState().sendMessage('New message');

      expect(useChatStore.getState().streamingContent).toBe('');
    });
  });

  // ---- appendStreamDelta ----

  describe('appendStreamDelta', () => {
    it('should append delta to streamingContent', () => {
      useChatStore.getState().appendStreamDelta('Hello');
      expect(useChatStore.getState().streamingContent).toBe('Hello');

      useChatStore.getState().appendStreamDelta(' world');
      expect(useChatStore.getState().streamingContent).toBe('Hello world');
    });

    it('should concatenate multiple deltas correctly', () => {
      const deltas = ['The ', 'quick ', 'brown ', 'fox'];
      deltas.forEach((d) => useChatStore.getState().appendStreamDelta(d));

      expect(useChatStore.getState().streamingContent).toBe('The quick brown fox');
    });
  });

  // ---- finalizeStreamMessage ----

  describe('finalizeStreamMessage', () => {
    it('should add complete assistant message to messages', () => {
      useChatStore.getState().sendMessage('Hello');
      useChatStore.getState().appendStreamDelta('Hi there');

      useChatStore.getState().finalizeStreamMessage('msg-ai-1', 'Hi there');

      const { messages } = useChatStore.getState();
      expect(messages).toHaveLength(2);
      expect(messages[1].role).toBe('assistant');
      expect(messages[1].content).toBe('Hi there');
      expect(messages[1].id).toBe('msg-ai-1');
    });

    it('should set isStreaming to false', () => {
      useChatStore.getState().sendMessage('Hello');
      expect(useChatStore.getState().isStreaming).toBe(true);

      useChatStore.getState().finalizeStreamMessage('msg-ai-1', 'Response');

      expect(useChatStore.getState().isStreaming).toBe(false);
    });

    it('should clear streamingContent', () => {
      useChatStore.getState().sendMessage('Hello');
      useChatStore.getState().appendStreamDelta('Partial response');

      useChatStore.getState().finalizeStreamMessage('msg-ai-1', 'Full response');

      expect(useChatStore.getState().streamingContent).toBe('');
    });
  });

  // ---- setMessages ----

  describe('setMessages', () => {
    it('should replace messages entirely', () => {
      useChatStore.getState().sendMessage('Old message');

      const newMessages = [
        createMessage({ id: 'sync-1', content: 'Synced message 1' }),
        createMessage({ id: 'sync-2', role: 'assistant', content: 'Synced message 2' }),
      ];
      useChatStore.getState().setMessages(newMessages);

      const { messages } = useChatStore.getState();
      expect(messages).toHaveLength(2);
      expect(messages[0].id).toBe('sync-1');
      expect(messages[1].id).toBe('sync-2');
    });
  });

  // ---- Tool calls ----

  describe('confirmToolCall', () => {
    it('should remove the matching pending tool call', () => {
      const tc1 = createToolCall({ toolCallId: 'tc-1' });
      const tc2 = createToolCall({ toolCallId: 'tc-2', toolName: 'flow_start_pomodoro' });

      useChatStore.getState().addPendingToolCall(tc1);
      useChatStore.getState().addPendingToolCall(tc2);
      expect(useChatStore.getState().pendingToolCalls).toHaveLength(2);

      useChatStore.getState().confirmToolCall('tc-1');

      const remaining = useChatStore.getState().pendingToolCalls;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].toolCallId).toBe('tc-2');
    });

    it('should not affect other tool calls when confirming', () => {
      const tc1 = createToolCall({ toolCallId: 'tc-1' });
      useChatStore.getState().addPendingToolCall(tc1);

      useChatStore.getState().confirmToolCall('non-existent');

      expect(useChatStore.getState().pendingToolCalls).toHaveLength(1);
    });
  });

  describe('cancelToolCall', () => {
    it('should remove the matching pending tool call', () => {
      const tc1 = createToolCall({ toolCallId: 'tc-1' });
      useChatStore.getState().addPendingToolCall(tc1);

      useChatStore.getState().cancelToolCall('tc-1');

      expect(useChatStore.getState().pendingToolCalls).toHaveLength(0);
    });
  });

  // ---- Reset ----

  describe('reset', () => {
    it('should restore initial state', () => {
      useChatStore.getState().openPanel();
      useChatStore.getState().sendMessage('Hello');
      useChatStore.getState().appendStreamDelta('test');
      useChatStore.getState().addPendingToolCall(createToolCall());

      useChatStore.getState().reset();

      const state = useChatStore.getState();
      expect(state.isPanelOpen).toBe(false);
      expect(state.panelHeight).toBe('half');
      expect(state.messages).toHaveLength(0);
      expect(state.isStreaming).toBe(false);
      expect(state.streamingContent).toBe('');
      expect(state.pendingToolCalls).toHaveLength(0);
    });
  });
});
