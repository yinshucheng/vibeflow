'use client';

/**
 * DailyProgressCard Component
 *
 * Notion-style daily pomodoro progress with progress bar, remaining count,
 * and pressure indicator.
 *
 * Requirements: 17.1, 17.2, 17.3, 17.4, 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7
 */

import { trpc } from '@/lib/trpc';
import { Icons } from '@/lib/icons';
import type { PressureLevel } from '@/services/progress-calculation.service';

// Pressure level display configuration (Requirements: 19.3-19.6)
const PRESSURE_CONFIG: Record<
  PressureLevel,
  {
    colorClass: string;
    bgClass: string;
    progressColor: string;
    icon: keyof typeof Icons;
  }
> = {
  on_track: {
    colorClass: 'text-notion-accent-green',
    bgClass: 'bg-notion-accent-green-bg',
    progressColor: 'bg-notion-accent-green',
    icon: 'check',
  },
  moderate: {
    colorClass: 'text-notion-accent-orange',
    bgClass: 'bg-notion-accent-orange-bg',
    progressColor: 'bg-notion-accent-orange',
    icon: 'alert',
  },
  high: {
    colorClass: 'text-notion-accent-orange',
    bgClass: 'bg-notion-accent-orange-bg',
    progressColor: 'bg-notion-accent-orange',
    icon: 'alert',
  },
  critical: {
    colorClass: 'text-notion-accent-red',
    bgClass: 'bg-notion-accent-red-bg',
    progressColor: 'bg-notion-accent-red',
    icon: 'alert',
  },
};

interface DailyProgressCardProps {
  compact?: boolean;
  showPace?: boolean;
}

export function DailyProgressCard({ compact = false, showPace = true }: DailyProgressCardProps) {
  // Get daily progress (Requirements: 17.1-17.4, 19.1-19.7)
  const {
    data: progress,
    isLoading,
    error,
  } = trpc.dailyState.getDailyProgress.useQuery(undefined, {
    refetchInterval: 60000, // Refetch every minute
  });

  // Check if today's goal is adjusted (Requirements: 23.4)
  const { data: goalAdjustment } = trpc.dailyState.isTodayGoalAdjusted.useQuery();

  if (isLoading) {
    return (
      <div
        className={`animate-pulse ${compact ? 'h-24' : 'h-40'} bg-notion-bg-tertiary rounded-notion-lg`}
      />
    );
  }

  if (error || !progress) {
    const AlertIcon = Icons.alert;
    return (
      <div className="text-center py-4 text-notion-text-tertiary">
        <AlertIcon className="w-6 h-6 mx-auto" />
        <p className="text-sm mt-1">Unable to load progress</p>
      </div>
    );
  }

  const pressureConfig = PRESSURE_CONFIG[progress.pressureLevel];
  const PressureIcon = Icons[pressureConfig.icon];
  const TimerIcon = Icons.pomodoro;
  const CheckIcon = Icons.check;

  return (
    <div className={`flex flex-col gap-4 ${compact ? 'py-2' : 'py-4'}`}>
      {/* Pomodoro Count Display (Requirements: 17.1) */}
      <div className="text-center">
        <div className="flex items-baseline justify-center gap-1">
          <span className="text-4xl font-bold text-notion-text">
            {progress.completedPomodoros}
          </span>
          <span className="text-xl text-notion-text-tertiary">/</span>
          <span className="text-2xl text-notion-text-secondary">{progress.targetPomodoros}</span>
        </div>
        <div className="flex items-center justify-center gap-1.5 text-sm text-notion-text-secondary">
          <TimerIcon className="w-3.5 h-3.5" />
          <span>Pomodoros today</span>
          {/* Show indicator if goal is adjusted (Requirements: 23.4) */}
          {goalAdjustment?.isAdjusted && (
            <span
              className="text-xs text-notion-accent-blue"
              title={`Default: ${goalAdjustment.defaultGoal}`}
            >
              (adjusted)
            </span>
          )}
        </div>
      </div>

      {/* Progress Bar (Requirements: 17.2) */}
      <div className="w-full">
        <div className="h-2 bg-notion-bg-tertiary rounded-full overflow-hidden">
          <div
            className={`h-full ${pressureConfig.progressColor} transition-all duration-500 ease-out`}
            style={{ width: `${Math.min(100, progress.completionPercentage)}%` }}
          />
        </div>
        <div className="flex justify-between mt-1.5 text-xs text-notion-text-tertiary">
          <span>{progress.completionPercentage}% complete</span>
          <span>{progress.remainingPomodoros} remaining</span>
        </div>
      </div>

      {/* Success Indicator (Requirements: 17.4) */}
      {progress.completedPomodoros >= progress.targetPomodoros && (
        <div className="flex items-center justify-center gap-2 p-2 bg-notion-accent-green-bg rounded-notion-lg">
          <CheckIcon className="w-4 h-4 text-notion-accent-green" />
          <span className="text-sm font-medium text-notion-accent-green">
            Daily goal achieved!
          </span>
        </div>
      )}

      {/* Pressure Indicator (Requirements: 19.1-19.7) */}
      {progress.remainingPomodoros > 0 && (
        <div
          className={`flex items-center justify-between p-3 rounded-notion-lg ${pressureConfig.bgClass}`}
        >
          <div className="flex items-center gap-2">
            <PressureIcon className={`w-4 h-4 ${pressureConfig.colorClass}`} />
            <div>
              <span className={`text-sm font-medium ${pressureConfig.colorClass}`}>
                {progress.pressureMessage}
              </span>
              {/* Show required pace (Requirements: 18.5) */}
              {showPace && progress.remainingWorkMinutes > 0 && (
                <p className="text-xs text-notion-text-tertiary mt-0.5">
                  {progress.requiredPace}
                </p>
              )}
            </div>
          </div>

          {/* Remaining work time indicator */}
          {progress.remainingWorkMinutes > 0 && (
            <div className="text-right">
              <div className="text-sm font-medium text-notion-text">
                {formatWorkTime(progress.remainingWorkMinutes)}
              </div>
              <div className="text-xs text-notion-text-tertiary">work time left</div>
            </div>
          )}
        </div>
      )}

      {/* Goal at Risk Warning (Requirements: 18.4) */}
      {progress.isGoalAtRisk && progress.remainingPomodoros > 0 && (
        <div className="text-center text-xs text-notion-text-tertiary">
          Max possible: {progress.maxPossiblePomodoros} pomodoros
          {progress.maxPossiblePomodoros < progress.remainingPomodoros && (
            <span className="text-notion-accent-red ml-1">
              (need {progress.remainingPomodoros - progress.maxPossiblePomodoros} more)
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Format work time remaining in a human-readable format
 */
function formatWorkTime(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}
