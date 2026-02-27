'use client';

/**
 * ChatPanel
 *
 * Slide-in panel that contains the chat message list and input.
 * Positioned at the right side of the viewport.
 */

import { useChatContext } from './ChatProvider';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';

export function ChatPanel() {
  const { isPanelOpen, closePanel } = useChatContext();

  if (!isPanelOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/10 transition-opacity"
        onClick={closePanel}
        data-testid="chat-panel-backdrop"
      />

      {/* Panel */}
      <div
        className="fixed bottom-0 right-0 top-0 z-50 flex w-[380px] max-w-full flex-col border-l border-notion-border bg-notion-bg shadow-notion-lg"
        data-testid="chat-panel"
      >
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-notion-border px-4">
          <h2 className="text-sm font-semibold text-notion-text">AI 助手</h2>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-notion-sm text-notion-text-secondary hover:bg-notion-bg-hover hover:text-notion-text"
            onClick={closePanel}
            aria-label="关闭"
            data-testid="chat-panel-close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <ChatMessageList />

        {/* Input */}
        <ChatInput />
      </div>
    </>
  );
}
