'use client';

/**
 * ChatProvider
 *
 * Context provider that manages WebSocket listeners for chat events
 * (CHAT_RESPONSE, CHAT_TOOL_CALL, CHAT_TOOL_RESULT, CHAT_SYNC).
 * Wraps the app so any child can access chat state.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getSocket } from '@/lib/socket-client';

// =============================================================================
// TYPES
// =============================================================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'system';
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface PendingToolCall {
  toolCallId: string;
  toolName: string;
  description: string;
  parameters: Record<string, unknown>;
  requiresConfirmation: boolean;
  messageId: string;
  conversationId: string;
}

interface ChatContextValue {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  isPanelOpen: boolean;
  pendingToolCalls: PendingToolCall[];
  openPanel: () => void;
  closePanel: () => void;
  sendMessage: (content: string) => void;
  confirmToolCall: (conversationId: string, toolCallId: string) => void;
  cancelToolCall: (conversationId: string, toolCallId: string) => void;
}

// =============================================================================
// CONTEXT
// =============================================================================

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChatContext must be used within ChatProvider');
  return ctx;
}

// =============================================================================
// HELPERS
// =============================================================================

function generateId(): string {
  return crypto.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// =============================================================================
// PROVIDER
// =============================================================================

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [pendingToolCalls, setPendingToolCalls] = useState<PendingToolCall[]>([]);
  const listenerAttached = useRef(false);

  // Attach Socket.io listeners for OCTOPUS_COMMAND events
  useEffect(() => {
    if (listenerAttached.current) return;
    listenerAttached.current = true;

    const socket = getSocket();
    if (!socket) return;

    const handler = (command: { commandType: string; payload: Record<string, unknown> }) => {
      switch (command.commandType) {
        case 'CHAT_RESPONSE': {
          const p = command.payload as {
            messageId: string;
            type: 'delta' | 'complete';
            content: string;
          };
          if (p.type === 'delta') {
            setStreamingContent((prev) => prev + p.content);
          } else {
            setMessages((prev) => [
              ...prev,
              {
                id: p.messageId,
                role: 'assistant',
                content: p.content,
                createdAt: new Date().toISOString(),
              },
            ]);
            setIsStreaming(false);
            setStreamingContent('');
          }
          break;
        }
        case 'CHAT_TOOL_CALL': {
          const p = command.payload as {
            conversationId: string;
            messageId: string;
            toolCallId: string;
            toolName: string;
            description: string;
            parameters: Record<string, unknown>;
            requiresConfirmation: boolean;
          };
          // Add as a message for visual display
          setMessages((prev) => [
            ...prev,
            {
              id: p.toolCallId,
              role: 'tool_call',
              content: p.description || p.toolName,
              metadata: {
                toolCallId: p.toolCallId,
                toolName: p.toolName,
                parameters: p.parameters,
                requiresConfirmation: p.requiresConfirmation,
                conversationId: p.conversationId,
              },
              createdAt: new Date().toISOString(),
            },
          ]);
          if (p.requiresConfirmation) {
            setPendingToolCalls((prev) => [...prev, {
              toolCallId: p.toolCallId,
              toolName: p.toolName,
              description: p.description,
              parameters: p.parameters,
              requiresConfirmation: p.requiresConfirmation,
              messageId: p.messageId,
              conversationId: p.conversationId,
            }]);
          }
          break;
        }
        case 'CHAT_TOOL_RESULT': {
          const p = command.payload as {
            toolCallId: string;
            success: boolean;
            summary: string;
          };
          setMessages((prev) => [
            ...prev,
            {
              id: `result-${p.toolCallId}`,
              role: 'tool_result',
              content: p.summary,
              metadata: { toolCallId: p.toolCallId, success: p.success },
              createdAt: new Date().toISOString(),
            },
          ]);
          break;
        }
        case 'CHAT_SYNC': {
          const p = command.payload as { messages: ChatMessage[] };
          setMessages(p.messages);
          break;
        }
      }
    };

    // Socket types don't include OCTOPUS_COMMAND — use untyped access
    const untypedSocket = socket as unknown as {
      on: (event: string, handler: (data: unknown) => void) => void;
      off: (event: string, handler: (data: unknown) => void) => void;
    };
    untypedSocket.on('OCTOPUS_COMMAND', handler as (data: unknown) => void);

    return () => {
      untypedSocket.off('OCTOPUS_COMMAND', handler as (data: unknown) => void);
      listenerAttached.current = false;
    };
  }, []);

  const openPanel = useCallback(() => setIsPanelOpen(true), []);
  const closePanel = useCallback(() => setIsPanelOpen(false), []);

  const sendMessage = useCallback((content: string) => {
    const socket = getSocket();
    if (!socket?.connected) return;

    const messageId = generateId();
    const userMsg: ChatMessage = {
      id: messageId,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    setStreamingContent('');

    // Socket types don't include OCTOPUS_EVENT — cast to untyped
    (socket as unknown as { emit: (event: string, data: unknown) => void }).emit(
      'OCTOPUS_EVENT',
      {
        eventId: generateId(),
        eventType: 'CHAT_MESSAGE',
        userId: '',
        clientId: 'web-app',
        clientType: 'web',
        timestamp: Date.now(),
        sequenceNumber: 0,
        payload: {
          conversationId: 'default',
          messageId,
          content,
        },
      }
    );
  }, []);

  const confirmToolCall = useCallback((conversationId: string, toolCallId: string) => {
    const socket = getSocket();
    if (!socket?.connected) return;

    setPendingToolCalls((prev) => prev.filter((tc) => tc.toolCallId !== toolCallId));

    (socket as unknown as { emit: (event: string, data: unknown) => void }).emit(
      'OCTOPUS_EVENT',
      {
        eventId: generateId(),
        eventType: 'CHAT_ACTION',
        userId: '',
        clientId: 'web-app',
        clientType: 'web',
        timestamp: Date.now(),
        sequenceNumber: 0,
        payload: { conversationId, toolCallId, action: 'confirm' },
      }
    );
  }, []);

  const cancelToolCall = useCallback((conversationId: string, toolCallId: string) => {
    const socket = getSocket();
    if (!socket?.connected) return;

    setPendingToolCalls((prev) => prev.filter((tc) => tc.toolCallId !== toolCallId));

    (socket as unknown as { emit: (event: string, data: unknown) => void }).emit(
      'OCTOPUS_EVENT',
      {
        eventId: generateId(),
        eventType: 'CHAT_ACTION',
        userId: '',
        clientId: 'web-app',
        clientType: 'web',
        timestamp: Date.now(),
        sequenceNumber: 0,
        payload: { conversationId, toolCallId, action: 'cancel' },
      }
    );
  }, []);

  // Listen for Desktop global shortcut toggle
  useEffect(() => {
    const vibeflow = (window as { vibeflow?: { chat?: { onToggleChat: (cb: () => void) => () => void } } }).vibeflow;
    if (vibeflow?.chat?.onToggleChat) {
      const unsub = vibeflow.chat.onToggleChat(() => {
        setIsPanelOpen((prev) => !prev);
      });
      return unsub;
    }
  }, []);

  return (
    <ChatContext.Provider
      value={{
        messages,
        isStreaming,
        streamingContent,
        isPanelOpen,
        pendingToolCalls,
        openPanel,
        closePanel,
        sendMessage,
        confirmToolCall,
        cancelToolCall,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
