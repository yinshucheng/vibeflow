/**
 * AI Chat Type Definitions for iOS App
 *
 * Types for the chat UI, store, and service layer.
 * Mirrors the server-side Octopus protocol types for chat.
 */

// =============================================================================
// MESSAGE TYPES
// =============================================================================

export type ChatMessageRole = 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// =============================================================================
// ATTACHMENT & TOOL TYPES
// =============================================================================

export interface ChatAttachment {
  type: 'task' | 'project' | 'goal' | 'pomodoro';
  id: string;
  title: string;
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

// =============================================================================
// PAYLOAD TYPES (Server ↔ Client protocol)
// =============================================================================

/** Server → Client: AI text response (streaming) */
export interface ChatResponsePayload {
  conversationId: string;
  messageId: string;
  /** 'delta' = streaming fragment, 'complete' = final message */
  type: 'delta' | 'complete';
  content: string;
  /** Only present when type === 'complete' */
  usage?: { inputTokens: number; outputTokens: number };
  /** True when message is an AI-initiated proactive push (S4) */
  isProactive?: boolean;
  /** Trigger that generated this proactive message (S4) */
  triggerId?: string;
}

/** Server → Client: AI requests tool execution */
export interface ChatToolCallPayload {
  conversationId: string;
  messageId: string;
  toolCallId: string;
  toolName: string;
  description: string;
  parameters: Record<string, unknown>;
  requiresConfirmation: boolean;
}

/** Server → Client: Tool execution result */
export interface ChatToolResultPayload {
  conversationId: string;
  messageId: string;
  toolCallId: string;
  success: boolean;
  summary: string;
}

/** Server → Client: Multi-device sync */
export interface ChatSyncPayload {
  conversationId: string;
  messages: ChatMessage[];
}

/** Client → Server: User sends a message */
export interface ChatMessagePayload {
  conversationId: string;
  messageId: string;
  content: string;
  attachments?: ChatAttachment[];
}

/** Client → Server: User confirms/cancels a tool call */
export interface ChatActionPayload {
  conversationId: string;
  toolCallId: string;
  action: 'confirm' | 'cancel';
}

// =============================================================================
// PANEL TYPES
// =============================================================================

export type PanelHeight = 'half' | 'full';
