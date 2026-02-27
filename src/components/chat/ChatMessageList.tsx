'use client';

/**
 * ChatMessageList
 *
 * Scrollable list of chat messages with auto-scroll to bottom.
 * Renders streaming content indicator below the last message.
 */

import { useEffect, useRef } from 'react';
import { ChatBubble } from './ChatBubble';
import { useChatContext } from './ChatProvider';

export function ChatMessageList() {
  const {
    messages,
    isStreaming,
    streamingContent,
    pendingToolCalls,
    confirmToolCall,
    cancelToolCall,
  } = useChatContext();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change or streaming content updates
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  return (
    <div className="flex-1 overflow-y-auto py-2" data-testid="chat-message-list">
      {messages.length === 0 && !isStreaming && (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-notion-text-tertiary">
            输入消息开始对话
          </p>
        </div>
      )}

      {messages.map((msg) => {
        const pending = pendingToolCalls.find(
          (tc) => tc.toolCallId === msg.id
        );
        return (
          <ChatBubble
            key={msg.id}
            message={msg}
            pendingToolCall={pending}
            onConfirm={confirmToolCall}
            onCancel={cancelToolCall}
          />
        );
      })}

      {isStreaming && streamingContent && (
        <div className="flex justify-start px-3 py-1">
          <div className="max-w-[80%] rounded-notion-md bg-notion-bg-tertiary px-3.5 py-2.5 text-notion-text">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {streamingContent}
              <span className="ml-0.5 inline-block h-4 w-1 animate-pulse bg-notion-text-tertiary" />
            </p>
          </div>
        </div>
      )}

      {isStreaming && !streamingContent && (
        <div className="flex justify-start px-3 py-1">
          <div className="rounded-notion-md bg-notion-bg-tertiary px-3.5 py-2.5">
            <div className="flex gap-1">
              <span className="h-2 w-2 animate-bounce rounded-full bg-notion-text-tertiary [animation-delay:0ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-notion-text-tertiary [animation-delay:150ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-notion-text-tertiary [animation-delay:300ms]" />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
