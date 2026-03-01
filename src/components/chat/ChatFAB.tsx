'use client';

/**
 * ChatFAB
 *
 * Floating action button in the bottom-right corner to open the chat panel.
 * Hidden when the panel is already open.
 */

import { useChatContext } from './ChatProvider';

export function ChatFAB() {
  const { isPanelOpen, openPanel } = useChatContext();

  if (isPanelOpen) return null;

  return (
    <button
      className="fixed bottom-20 right-6 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-notion-accent-blue text-white shadow-notion-md transition-transform hover:scale-105 active:scale-95 md:bottom-6"
      onClick={openPanel}
      aria-label="打开 AI 对话"
      data-testid="chat-fab"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-5 w-5"
      >
        <path
          fillRule="evenodd"
          d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  );
}
