'use client';

/**
 * DashboardStatus Component
 *
 * Notion-style display of current time context and expected state.
 * Shows over rest warning when applicable.
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5
 */

import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Icons } from '@/lib/icons';
import type { TimeContext, ExpectedState } from '@/services/progress-calculation.service';

// Time context display configuration (Requirements: 15.4)
const TIME_CONTEXT_CONFIG: Record<
  TimeContext,
  { icon: keyof typeof Icons; label: string; colorClass: string }
> = {
  work_time: {
    icon: 'pomodoro',
    label: 'Work Time',
    colorClass: 'bg-notion-accent-blue-bg text-notion-accent-blue',
  },
  adhoc_focus: {
    icon: 'goals',
    label: 'Ad-hoc Focus',
    colorClass: 'bg-notion-accent-purple-bg text-notion-accent-purple',
  },
  sleep_time: {
    icon: 'moon',
    label: 'Sleep Time',
    colorClass: 'bg-notion-accent-gray-bg text-notion-accent-gray',
  },
  free_time: {
    icon: 'home',
    label: 'Free Time',
    colorClass: 'bg-notion-bg-tertiary text-notion-text-secondary',
  },
};

// Expected state display configuration (Requirements: 15.1, 15.2, 15.3)
const EXPECTED_STATE_CONFIG: Record<
  ExpectedState,
  { icon: keyof typeof Icons; label: string; colorClass: string }
> = {
  in_pomodoro: {
    icon: 'pomodoro',
    label: 'In Pomodoro',
    colorClass: 'bg-notion-accent-red-bg text-notion-accent-red',
  },
  normal_rest: {
    icon: 'pause',
    label: 'Resting',
    colorClass: 'bg-notion-accent-green-bg text-notion-accent-green',
  },
  over_rest: {
    icon: 'alert',
    label: 'Over Rest',
    colorClass: 'bg-notion-accent-orange-bg text-notion-accent-orange',
  },
};

interface DashboardStatusProps {
  compact?: boolean;
}

export function DashboardStatus({ compact = false }: DashboardStatusProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  // Get current status (Requirements: 15.1-15.5)
  const {
    data: status,
    isLoading,
    error,
  } = trpc.dailyState.getCurrentStatus.useQuery(undefined, {
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Update current time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div
        className={`animate-pulse ${compact ? 'h-16' : 'h-24'} bg-notion-bg-tertiary rounded-notion-lg`}
      />
    );
  }

  if (error || !status) {
    const AlertIcon = Icons.alert;
    return (
      <div className="text-center py-4 text-notion-text-tertiary">
        <AlertIcon className="w-6 h-6 mx-auto" />
        <p className="text-sm mt-1">Unable to load status</p>
      </div>
    );
  }

  const timeContextConfig = TIME_CONTEXT_CONFIG[status.timeContext];
  const expectedStateConfig = EXPECTED_STATE_CONFIG[status.expectedState];
  const TimeContextIcon = Icons[timeContextConfig.icon];
  const ExpectedStateIcon = Icons[expectedStateConfig.icon];
  const AlertIcon = Icons.alert;

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
        <div className="text-3xl font-bold text-notion-text">
          {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div className="text-xs text-notion-text-tertiary">
          {currentTime.toLocaleDateString([], {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          })}
        </div>
      </div>

      {/* Time Context Badge (Requirements: 15.4) */}
      <div className="flex justify-center">
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-notion-md text-sm font-medium ${timeContextConfig.colorClass}`}
        >
          <TimeContextIcon className="w-3.5 h-3.5" />
          <span>{timeContextConfig.label}</span>
          {/* Show remaining time for focus session */}
          {status.timeContext === 'adhoc_focus' &&
            status.focusSessionRemaining !== undefined && (
              <span className="text-xs opacity-75">
                ({formatMinutes(status.focusSessionRemaining)} left)
              </span>
            )}
        </span>
      </div>

      {/* Expected State (Requirements: 15.1, 15.2, 15.3) */}
      {(status.timeContext === 'work_time' || status.timeContext === 'adhoc_focus') && (
        <div className="flex justify-center">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-notion-sm text-xs font-medium ${expectedStateConfig.colorClass}`}
          >
            <ExpectedStateIcon className="w-3 h-3" />
            <span>{expectedStateConfig.label}</span>
          </span>
        </div>
      )}

      {/* Over Rest Warning (Requirements: 15.2, 15.3) */}
      {status.expectedState === 'over_rest' && status.overRestMinutes !== undefined && (
        <div className="mt-2 p-3 bg-notion-accent-orange-bg border border-notion-border rounded-notion-lg">
          <div className="flex items-start gap-2">
            <AlertIcon className="w-4 h-4 text-notion-accent-orange shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-notion-accent-orange">
                Over Rest by {status.overRestMinutes} minute
                {status.overRestMinutes !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-notion-text-tertiary mt-0.5">
                Time to get back to work!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Sleep Time Info */}
      {status.timeContext === 'sleep_time' && status.sleepTimeRemaining !== undefined && (
        <div className="text-center text-xs text-notion-text-tertiary">
          Sleep time ends in {formatMinutes(status.sleepTimeRemaining)}
        </div>
      )}
    </div>
  );
}
