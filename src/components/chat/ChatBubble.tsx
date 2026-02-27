'use client';

/**
 * ChatBubble
 *
 * Renders a single chat message. User messages align right (blue),
 * assistant messages align left (gray). Tool call/result cards rendered inline.
 */

import type { ChatMessage, PendingToolCall } from './ChatProvider';

interface ChatBubbleProps {
  message: ChatMessage;
  pendingToolCall?: PendingToolCall;
  onConfirm?: (conversationId: string, toolCallId: string) => void;
  onCancel?: (conversationId: string, toolCallId: string) => void;
}

export function ChatBubble({ message, pendingToolCall, onConfirm, onCancel }: ChatBubbleProps) {
  if (message.role === 'tool_call') {
    const meta = message.metadata as {
      toolName?: string;
      parameters?: Record<string, unknown>;
      requiresConfirmation?: boolean;
      conversationId?: string;
      toolCallId?: string;
    } | undefined;
    const params = meta?.parameters ?? {};
    const paramEntries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);

    return (
      <div className="flex justify-start px-3 py-1" data-testid="chat-bubble-tool_call">
        <div className="max-w-[80%] rounded-notion-md border border-yellow-300 bg-yellow-50 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-yellow-700">
            <span>⚠️</span>
            <span>确认操作</span>
          </div>
          <p className="mb-2 text-sm text-notion-text">{message.content}</p>
          {paramEntries.length > 0 && (
            <pre className="mb-2 rounded-md bg-yellow-100 p-2 text-xs text-notion-text-secondary">
              {paramEntries.map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join('\n')}
            </pre>
          )}
          {pendingToolCall && (
            <div className="flex justify-end gap-2">
              <button
                className="rounded-md bg-notion-bg-tertiary px-3 py-1.5 text-xs font-medium text-notion-text-secondary hover:bg-notion-bg-hover"
                onClick={() => onCancel?.(pendingToolCall.conversationId, pendingToolCall.toolCallId)}
                data-testid="tool-call-cancel"
              >
                取消
              </button>
              <button
                className="rounded-md bg-notion-accent-red px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                onClick={() => onConfirm?.(pendingToolCall.conversationId, pendingToolCall.toolCallId)}
                data-testid="tool-call-confirm"
              >
                确认
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (message.role === 'tool_result') {
    const success = (message.metadata as { success?: boolean })?.success ?? true;
    return (
      <div className="flex justify-start px-3 py-1" data-testid="chat-bubble-tool_result">
        <div
          className={`max-w-[80%] rounded-notion-md border p-3 ${
            success
              ? 'border-green-300 bg-green-50'
              : 'border-red-300 bg-red-50'
          }`}
        >
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
            <span>{success ? '✅' : '❌'}</span>
            <span className={success ? 'text-green-700' : 'text-red-700'}>
              {success ? '操作成功' : '操作失败'}
            </span>
          </div>
          <p className="text-sm text-notion-text">{message.content}</p>
        </div>
      </div>
    );
  }

  const isUser = message.role === 'user';

  return (
    <div
      className={`flex px-3 py-1 ${isUser ? 'justify-end' : 'justify-start'}`}
      data-testid={`chat-bubble-${message.role}`}
    >
      <div
        className={`max-w-[80%] rounded-notion-md px-3.5 py-2.5 ${
          isUser
            ? 'bg-notion-accent-blue text-white'
            : 'bg-notion-bg-tertiary text-notion-text'
        }`}
      >
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {message.content}
        </p>
      </div>
    </div>
  );
}
