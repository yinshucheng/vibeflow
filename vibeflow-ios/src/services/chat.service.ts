/**
 * Chat Service
 *
 * Handles WebSocket communication for AI chat.
 * Listens for server-pushed chat commands and sends user events.
 * Bridges Socket.io events to the Zustand chat store.
 */

import { websocketService } from './websocket.service';
import { useChatStore, generateUUID } from '@/store';
import type {
  ChatResponsePayload,
  ChatToolCallPayload,
  ChatToolResultPayload,
  ChatSyncPayload,
  ChatAttachment,
} from '@/types';

// =============================================================================
// TYPES
// =============================================================================

type CommandHandler<T> = (payload: T) => void;

// =============================================================================
// CHAT SERVICE
// =============================================================================

class ChatService {
  private isInitialized = false;
  private unsubscribers: Array<() => void> = [];

  /**
   * Initialize the chat service.
   * Sets up listeners for server-pushed chat commands.
   */
  initialize(): void {
    if (this.isInitialized) {
      console.warn('[ChatService] Already initialized');
      return;
    }

    this.setupCommandListeners();
    this.isInitialized = true;
    console.log('[ChatService] Initialized');
  }

  /**
   * Cleanup the chat service.
   * Removes all command listeners.
   */
  cleanup(): void {
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];
    this.isInitialized = false;
    console.log('[ChatService] Cleaned up');
  }

  /**
   * Check if the service is initialized.
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  // ===========================================================================
  // SEND EVENTS (Client → Server)
  // ===========================================================================

  /**
   * Send a chat message to the server.
   */
  sendMessage(content: string, attachments?: ChatAttachment[]): void {
    const store = useChatStore.getState();

    // Add user message to local store immediately
    store.sendMessage(content);

    // Send via WebSocket
    const conversationId = 'default';
    const messageId = generateUUID();

    websocketService.sendEvent({
      eventId: generateUUID(),
      eventType: 'CHAT_MESSAGE',
      userId: '',
      clientId: 'ios-app',
      clientType: 'mobile',
      timestamp: Date.now(),
      sequenceNumber: 0,
      payload: {
        conversationId,
        messageId,
        content,
        attachments,
      },
    });
  }

  /**
   * Confirm a pending tool call.
   */
  confirmToolCall(conversationId: string, toolCallId: string): void {
    const store = useChatStore.getState();
    store.confirmToolCall(toolCallId);

    websocketService.sendEvent({
      eventId: generateUUID(),
      eventType: 'CHAT_ACTION',
      userId: '',
      clientId: 'ios-app',
      clientType: 'mobile',
      timestamp: Date.now(),
      sequenceNumber: 0,
      payload: {
        conversationId,
        toolCallId,
        action: 'confirm',
      },
    });
  }

  /**
   * Cancel a pending tool call.
   */
  cancelToolCall(conversationId: string, toolCallId: string): void {
    const store = useChatStore.getState();
    store.cancelToolCall(toolCallId);

    websocketService.sendEvent({
      eventId: generateUUID(),
      eventType: 'CHAT_ACTION',
      userId: '',
      clientId: 'ios-app',
      clientType: 'mobile',
      timestamp: Date.now(),
      sequenceNumber: 0,
      payload: {
        conversationId,
        toolCallId,
        action: 'cancel',
      },
    });
  }

  // ===========================================================================
  // COMMAND LISTENERS (Server → Client)
  // ===========================================================================

  private setupCommandListeners(): void {
    // Listen for CHAT_RESPONSE (streaming AI text)
    const unsubResponse = websocketService.onCommand(
      'CHAT_RESPONSE',
      this.handleChatResponse
    );
    this.unsubscribers.push(unsubResponse);

    // Listen for CHAT_TOOL_CALL (AI requests tool execution)
    const unsubToolCall = websocketService.onCommand(
      'CHAT_TOOL_CALL',
      this.handleToolCall
    );
    this.unsubscribers.push(unsubToolCall);

    // Listen for CHAT_TOOL_RESULT (tool execution result)
    const unsubToolResult = websocketService.onCommand(
      'CHAT_TOOL_RESULT',
      this.handleToolResult
    );
    this.unsubscribers.push(unsubToolResult);

    // Listen for CHAT_SYNC (multi-device sync)
    const unsubSync = websocketService.onCommand(
      'CHAT_SYNC',
      this.handleChatSync
    );
    this.unsubscribers.push(unsubSync);
  }

  private handleChatResponse: CommandHandler<ChatResponsePayload> = (payload) => {
    const store = useChatStore.getState();

    if (payload.type === 'delta') {
      store.appendStreamDelta(payload.content);
    } else {
      store.finalizeStreamMessage(payload.messageId, payload.content);
    }
  };

  private handleToolCall: CommandHandler<ChatToolCallPayload> = (payload) => {
    const store = useChatStore.getState();

    if (payload.requiresConfirmation) {
      store.addPendingToolCall({
        toolCallId: payload.toolCallId,
        toolName: payload.toolName,
        description: payload.description,
        parameters: payload.parameters,
        requiresConfirmation: payload.requiresConfirmation,
        messageId: payload.messageId,
        conversationId: payload.conversationId,
      });
    }
    // Low-risk operations execute automatically server-side, we just wait for TOOL_RESULT
  };

  private handleToolResult: CommandHandler<ChatToolResultPayload> = (_payload) => {
    // Tool result will be included in the next CHAT_RESPONSE from the server
    // For now, we don't need to handle it separately in the store
  };

  private handleChatSync: CommandHandler<ChatSyncPayload> = (payload) => {
    const store = useChatStore.getState();
    store.setMessages(payload.messages);
  };
}

// Export singleton instance
export const chatService = new ChatService();
