/**
 * Chat Store (Zustand)
 *
 * Manages AI chat panel UI state, messages, streaming, and tool calls.
 * Used by ChatPanel, ChatFAB, ChatService, and related components.
 */

import { create } from 'zustand';
import type {
  ChatMessage,
  PendingToolCall,
  PanelHeight,
} from '@/types';

// =============================================================================
// STORE INTERFACES
// =============================================================================

export interface ChatState {
  // UI
  isPanelOpen: boolean;
  panelHeight: PanelHeight;

  // Messages
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;

  // Pending tool calls awaiting confirmation
  pendingToolCalls: PendingToolCall[];
}

export interface ChatActions {
  // Panel actions
  openPanel: () => void;
  closePanel: () => void;
  togglePanelHeight: () => void;

  // Message actions
  sendMessage: (content: string) => void;
  appendStreamDelta: (delta: string) => void;
  finalizeStreamMessage: (messageId: string, content: string) => void;
  setMessages: (messages: ChatMessage[]) => void;

  // Tool call actions
  addPendingToolCall: (toolCall: PendingToolCall) => void;
  confirmToolCall: (toolCallId: string) => void;
  cancelToolCall: (toolCallId: string) => void;

  // Reset
  reset: () => void;
}

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialState: ChatState = {
  isPanelOpen: false,
  panelHeight: 'half',
  messages: [],
  isStreaming: false,
  streamingContent: '',
  pendingToolCalls: [],
};

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Generate a UUID v4 string.
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// =============================================================================
// STORE
// =============================================================================

export const useChatStore = create<ChatState & ChatActions>((set) => ({
  ...initialState,

  // ---- Panel actions ----

  openPanel: () => set({ isPanelOpen: true }),

  closePanel: () => set({ isPanelOpen: false }),

  togglePanelHeight: () =>
    set((state) => ({
      panelHeight: state.panelHeight === 'half' ? 'full' : 'half',
    })),

  // ---- Message actions ----

  sendMessage: (content: string) => {
    const userMessage: ChatMessage = {
      id: generateUUID(),
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isStreaming: true,
      streamingContent: '',
    }));
  },

  appendStreamDelta: (delta: string) =>
    set((state) => ({
      streamingContent: state.streamingContent + delta,
    })),

  finalizeStreamMessage: (messageId: string, content: string) => {
    const assistantMessage: ChatMessage = {
      id: messageId,
      role: 'assistant',
      content,
      createdAt: new Date().toISOString(),
    };

    set((state) => ({
      messages: [...state.messages, assistantMessage],
      isStreaming: false,
      streamingContent: '',
    }));
  },

  setMessages: (messages: ChatMessage[]) => set({ messages }),

  // ---- Tool call actions ----

  addPendingToolCall: (toolCall: PendingToolCall) =>
    set((state) => ({
      pendingToolCalls: [...state.pendingToolCalls, toolCall],
    })),

  confirmToolCall: (toolCallId: string) =>
    set((state) => ({
      pendingToolCalls: state.pendingToolCalls.filter(
        (tc) => tc.toolCallId !== toolCallId
      ),
    })),

  cancelToolCall: (toolCallId: string) =>
    set((state) => ({
      pendingToolCalls: state.pendingToolCalls.filter(
        (tc) => tc.toolCallId !== toolCallId
      ),
    })),

  // ---- Reset ----

  reset: () => set(initialState),
}));

// =============================================================================
// SELECTOR HOOKS
// =============================================================================

export function useChatPanelOpen(): boolean {
  return useChatStore((state) => state.isPanelOpen);
}

export function useChatMessages(): ChatMessage[] {
  return useChatStore((state) => state.messages);
}

export function useChatStreaming(): { isStreaming: boolean; streamingContent: string } {
  return useChatStore((state) => ({
    isStreaming: state.isStreaming,
    streamingContent: state.streamingContent,
  }));
}

export function usePendingToolCalls(): PendingToolCall[] {
  return useChatStore((state) => state.pendingToolCalls);
}
