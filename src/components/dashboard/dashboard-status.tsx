'use client';

/**
 * DashboardStatus Component
 * 
 * Displays the current time context and expected state on the dashboard.
 * Shows over rest warning when applicable.
 * 
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5
 */

import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import type { TimeContext, ExpectedState } from '@/services/progress-calculation.service';

// Time context display configuration (Requirements: 15.4)
const TIME_CONTEXT_CONFIG: Record<TimeContext, { icon: string; label: string; color: string }> = {
  work_time: { icon: '💼', label: 'Work Time', color: 'text-blue-600 bg-blue-50' },
  adhoc_focus: { icon: '🎯', label: 'Ad-hoc Focus', color: 'text-purple-600 bg-purple-50' },
  sleep_time: { icon: '🌙', label: 'Sleep Time', color: 'text-indigo-600 bg-indigo-50' },
  free_time: { icon: '☕', label: 'Free Time', color: 'text-gray-600 bg-gray-50' },
};

// Expected state display configuration (Requirements: 15.1, 15.2, 15.3)
const EXPECTED_STATE_CONFIG: Record<ExpectedState, { icon: string; label: string; color: string }> = {
  in_pomodoro: { icon: '🍅', label: 'In Pomodoro', color: 'text-red-600 bg-red-50' },
  normal_rest: { icon: '☕', label: 'Resting', color: 'text-green-600 bg-green-50' },
  over_rest: { icon: '⚠️', label: 'Over Rest', color: 'text-amber-600 bg-amber-50' },
};

interface DashboardStatusProps {
  compact?: boolean;
}

export function DashboardStatus({ compact = false }: DashboardStatusProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  // Get current status (Requirements: 15.1-15.5)
  const { data: status, isLoading, error } = trpc.dailyState.getCurrentStatus.useQuery(
    undefined,
    { refetchInterval: 30000 } // Refetch every 30 seconds
  );

  // Update current time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className={`animate-pulse ${compact ? 'h-16' : 'h-24'} bg-gray-100 rounded-lg`} />
    );
  }

  if (error || !status) {
    return (
      <div className="text-center py-4 text-gray-500">
        <span className="text-2xl">❓</span>
        <p className="text-sm mt-1">Unable to load status</p>
      </div>
    );
  }

  const timeContextConfig = TIME_CONTEXT_CONFIG[status.timeContext];
  const expectedStateConfig = EXPECTED_STATE_CONFIG[status.expectedState];

  // Format time remaining for focus session or sleep time
  const formatMinutes = (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  return (
    <div className={`flex flex-col gap-3 ${compact ? 'py-2' : 'py-4'}`}>
      {/* Current Time Display */}
      <div className="text-center">
        <div className="text-3xl font-bold text-gray-900">
          {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div className="text-xs text-gray-500">
          {currentTime.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
        </div>
      </div>

      {/* Time Context Badge (Requirements: 15.4) */}
      <div className="flex justify-center">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${timeContextConfig.color}`}>
          <span>{timeContextConfig.icon}</span>
          <span>{timeContextConfig.label}</span>
          {/* Show remaining time for focus session */}
          {status.timeContext === 'adhoc_focus' && status.focusSessionRemaining !== undefined && (
            <span className="text-xs opacity-75">
              ({formatMinutes(status.focusSessionRemaining)} left)
            </span>
          )}
        </span>
      </div>

      {/* Expected State (Requirements: 15.1, 15.2, 15.3) */}
      {(status.timeContext === 'work_time' || status.timeContext === 'adhoc_focus') && (
        <div className="flex justify-center">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${expectedStateConfig.color}`}>
            <span>{expectedStateConfig.icon}</span>
            <span>{expectedStateConfig.label}</span>
          </span>
        </div>
      )}

      {/* Over Rest Warning (Requirements: 15.2, 15.3) */}
      {status.expectedState === 'over_rest' && status.overRestMinutes !== undefined && (
        <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-2">
            <span className="text-lg">⚠️</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">
                Over Rest by {status.overRestMinutes} minute{status.overRestMinutes !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                Time to get back to work!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Sleep Time Info */}
      {status.timeContext === 'sleep_time' && status.sleepTimeRemaining !== undefined && (
        <div className="text-center text-xs text-gray-500">
          Sleep time ends in {formatMinutes(status.sleepTimeRemaining)}
        </div>
      )}
    </div>
  );
}
