'use client';

/**
 * Header Component
 *
 * Notion-style header bar with state indicator and status.
 * Requirements: 5.7, 9.8
 * Requirements: 9.4, 9.5 - Offline mode indicator
 * Requirements: 6.7 - Real-time state updates via WebSocket
 * Requirements: 7.1 - Rest period tracking with countdown display
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { StateIndicator, StateIndicatorSkeleton } from '@/components/ui/state-indicator';
import { MCPIndicatorWithPolling } from '@/components/ui/mcp-indicator';
import { OfflineModeIndicatorWithStatus } from '@/components/ui/offline-mode-indicator';
import { trpc } from '@/lib/trpc';
import { useSocket } from '@/hooks/use-socket';
import { Icons } from '@/lib/icons';
import { normalizeState } from '@/lib/state-utils';

interface HeaderProps {
  title?: string;
}

export function Header({ title = 'VibeFlow' }: HeaderProps) {
  // Use WebSocket for real-time state updates
  const { systemState: socketState } = useSocket();

  // Fallback to tRPC for initial load and progress data
  const { data: dailyState, isLoading } = trpc.dailyState.getToday.useQuery();

  // Prefer WebSocket state (real-time) over tRPC state (polled)
  const systemState =
    socketState || (dailyState?.systemState ? normalizeState(dailyState.systemState) : undefined);

  // Get rest status for countdown display (when in rest or over_rest state)
  // REST no longer exists as separate state — over_rest is the only rest-like state
  const isInRestState = systemState === 'over_rest';
  const { data: restStatus } = trpc.dailyState.getRestStatus.useQuery(undefined, {
    refetchOnMount: 'always',
    enabled: isInRestState,
  });

  // State for real-time countdown
  const [restTimeRemaining, setRestTimeRemaining] = useState<string | undefined>(undefined);

  // Calculate remaining time
  const calculateRemaining = useCallback(() => {
    if (!isInRestState || !restStatus?.restStartTime) return undefined;

    const restStartMs = new Date(restStatus.restStartTime).getTime();
    const elapsedSeconds = Math.floor((Date.now() - restStartMs) / 1000);
    const totalSeconds = restStatus.restDuration * 60;
    const remaining = Math.max(0, totalSeconds - elapsedSeconds);

    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, [isInRestState, restStatus]);

  // Update countdown every second
  useEffect(() => {
    if (!isInRestState || !restStatus?.restStartTime) {
      setRestTimeRemaining(undefined);
      return;
    }

    // Initial calculation
    setRestTimeRemaining(calculateRemaining());

    // Update every second
    const interval = setInterval(() => {
      setRestTimeRemaining(calculateRemaining());
    }, 1000);

    return () => clearInterval(interval);
  }, [isInRestState, restStatus, calculateRemaining]);

  const TimerIcon = Icons.pomodoro;
  const { data: session } = useSession();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen]);

  const userEmail = session?.user?.email;
  const userInitial = userEmail ? userEmail[0].toUpperCase() : '?';

  return (
    <header className="sticky top-0 z-10 bg-notion-bg border-b border-notion-border">
      <div className="flex items-center justify-between h-12 px-4">
        {/* Left: Title */}
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-medium text-notion-text">{title}</h1>
        </div>

        {/* Right: Status Indicators */}
        <div className="flex items-center gap-3">
          {/* Offline Mode Indicator - Requirements 9.4, 9.5 */}
          <OfflineModeIndicatorWithStatus variant="compact" />

          {/* MCP Connection Status */}
          <MCPIndicatorWithPolling />

          {/* System State */}
          {isLoading ? (
            <StateIndicatorSkeleton />
          ) : systemState ? (
            <StateIndicator state={systemState} timeRemaining={restTimeRemaining} />
          ) : null}

          {/* Pomodoro Progress */}
          {dailyState?.progress && (
            <div className="hidden sm:flex items-center gap-2 text-xs text-notion-text-secondary">
              <TimerIcon className="w-3.5 h-3.5" />
              <span>
                {dailyState.progress.pomodoroCount}/{dailyState.progress.dailyCap}
              </span>
              <div className="w-12 h-1.5 bg-notion-bg-tertiary rounded-full overflow-hidden">
                <div
                  className="h-full bg-notion-accent-green transition-all duration-300"
                  style={{ width: `${dailyState.progress.percentage}%` }}
                />
              </div>
            </div>
          )}

          {/* User Menu */}
          {userEmail && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center justify-center w-7 h-7 rounded-full bg-notion-accent-blue/10 text-notion-accent-blue text-xs font-medium hover:bg-notion-accent-blue/20 transition-colors"
                title={userEmail}
              >
                {userInitial}
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-9 w-56 bg-notion-bg border border-notion-border rounded-lg shadow-lg py-1 z-50">
                  <div className="px-3 py-2 border-b border-notion-border">
                    <p className="text-xs text-notion-text-secondary truncate">{userEmail}</p>
                  </div>
                  <a
                    href="/settings"
                    className="block px-3 py-2 text-sm text-notion-text hover:bg-notion-bg-secondary transition-colors"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    设置
                  </a>
                  <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-notion-bg-secondary transition-colors"
                  >
                    退出登录
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
