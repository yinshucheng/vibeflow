'use client';

/**
 * ChatInput
 *
 * Text input with send button for composing chat messages.
 * Disabled while streaming. Supports Enter to send, Shift+Enter for newline.
 */

import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { useChatContext } from './ChatProvider';

const MAX_LENGTH = 2000;

export function ChatInput() {
  const { sendMessage, isStreaming } = useChatContext();
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    sendMessage(trimmed);
    setText('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, isStreaming, sendMessage]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }, []);

  return (
    <div
      className="flex items-end gap-2 border-t border-notion-border bg-notion-bg px-3 py-2"
      data-testid="chat-input"
    >
      <textarea
        ref={textareaRef}
        className="flex-1 resize-none rounded-notion-md border border-notion-border bg-notion-bg-secondary px-3 py-2 text-sm text-notion-text placeholder:text-notion-text-tertiary focus:border-notion-accent-blue focus:outline-none"
        placeholder="输入消息..."
        rows={1}
        maxLength={MAX_LENGTH}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        disabled={isStreaming}
      />
      <button
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-notion-md bg-notion-accent-blue text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        onClick={handleSend}
        disabled={!text.trim() || isStreaming}
        aria-label="发送"
        data-testid="chat-send-button"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
        </svg>
      </button>
    </div>
  );
}
