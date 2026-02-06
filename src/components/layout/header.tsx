'use client';

/**
 * Header Component
 *
 * Top header bar with state indicator and MCP status.
 * Requirements: 5.7, 9.8
 * Requirements: 9.4, 9.5 - Offline mode indicator
 * Requirements: 6.7 - Real-time state updates via WebSocket
 * Requirements: 7.1 - Rest period tracking with countdown display
 */

import { useState, useEffect, useCallback } from 'react';
import { StateIndicator, StateIndicatorSkeleton } from '@/components/ui/state-indicator';
import { MCPIndicatorWithPolling } from '@/components/ui/mcp-indicator';
import { OfflineModeIndicatorWithStatus } from '@/components/ui/offline-mode-indicator';
import { trpc } from '@/lib/trpc';
import { useSocket } from '@/hooks/use-socket';
import type { SystemState } from '@/machines/vibeflow.machine';

interface HeaderProps {
  title?: string;
}

export function Header({ title = 'VibeFlow' }: HeaderProps) {
  // Use WebSocket for real-time state updates
  const { systemState: socketState } = useSocket();

  // Fallback to tRPC for initial load and progress data
  const { data: dailyState, isLoading } = trpc.dailyState.getToday.useQuery(undefined, {
    refetchInterval: 30000, // Refetch every 30 seconds for progress data
  });

  // Prefer WebSocket state (real-time) over tRPC state (polled)
  const systemState = socketState || (dailyState?.systemState?.toLowerCase() as SystemState | undefined);

  // Get rest status for countdown display (when in rest or over_rest state)
  const isInRestState = systemState === 'rest' || systemState === 'over_rest';
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

  return (
    <header className="sticky top-0 z-10 bg-white border-b border-gray-200">
      <div className="flex items-center justify-between h-14 px-4">
        {/* Left: Logo and Title */}
        <div className="flex items-center gap-3">
          <span className="text-2xl">🌊</span>
          <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        </div>

        {/* Right: Status Indicators */}
        <div className="flex items-center gap-4">
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
            <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600">
              <span>🍅</span>
              <span>
                {dailyState.progress.pomodoroCount}/{dailyState.progress.dailyCap}
              </span>
              <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-500 transition-all duration-300"
                  style={{ width: `${dailyState.progress.percentage}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
