'use client';

/**
 * Header Component
 * 
 * Top header bar with state indicator and MCP status.
 * Requirements: 5.7, 9.8
 * Requirements: 9.4, 9.5 - Offline mode indicator
 */

import { StateIndicator, StateIndicatorSkeleton } from '@/components/ui/state-indicator';
import { MCPIndicatorWithPolling } from '@/components/ui/mcp-indicator';
import { OfflineModeIndicatorWithStatus } from '@/components/ui/offline-mode-indicator';
import { trpc } from '@/lib/trpc';
import type { SystemState } from '@/machines/vibeflow.machine';

interface HeaderProps {
  title?: string;
}

export function Header({ title = 'VibeFlow' }: HeaderProps) {
  const { data: dailyState, isLoading } = trpc.dailyState.getToday.useQuery(undefined, {
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const systemState = dailyState?.systemState?.toLowerCase() as SystemState | undefined;

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
            <StateIndicator state={systemState} />
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
