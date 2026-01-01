'use client';

/**
 * DailyProgressCard Component
 * 
 * Displays daily pomodoro progress with progress bar, remaining count,
 * and pressure indicator.
 * 
 * Requirements: 17.1, 17.2, 17.3, 17.4, 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7
 */

import { trpc } from '@/lib/trpc';
import type { PressureLevel } from '@/services/progress-calculation.service';

// Pressure level display configuration (Requirements: 19.3-19.6)
const PRESSURE_CONFIG: Record<PressureLevel, { 
  color: string; 
  bgColor: string; 
  progressColor: string;
  icon: string;
}> = {
  on_track: { 
    color: 'text-green-600', 
    bgColor: 'bg-green-50 border-green-200', 
    progressColor: 'bg-green-500',
    icon: '✅',
  },
  moderate: { 
    color: 'text-yellow-600', 
    bgColor: 'bg-yellow-50 border-yellow-200', 
    progressColor: 'bg-yellow-500',
    icon: '⚡',
  },
  high: { 
    color: 'text-orange-600', 
    bgColor: 'bg-orange-50 border-orange-200', 
    progressColor: 'bg-orange-500',
    icon: '🔥',
  },
  critical: { 
    color: 'text-red-600', 
    bgColor: 'bg-red-50 border-red-200', 
    progressColor: 'bg-red-500',
    icon: '🚨',
  },
};

interface DailyProgressCardProps {
  compact?: boolean;
  showPace?: boolean;
}

export function DailyProgressCard({ compact = false, showPace = true }: DailyProgressCardProps) {
  // Get daily progress (Requirements: 17.1-17.4, 19.1-19.7)
  const { data: progress, isLoading, error } = trpc.dailyState.getDailyProgress.useQuery(
    undefined,
    { refetchInterval: 60000 } // Refetch every minute
  );

  // Check if today's goal is adjusted (Requirements: 23.4)
  const { data: goalAdjustment } = trpc.dailyState.isTodayGoalAdjusted.useQuery();

  if (isLoading) {
    return (
      <div className={`animate-pulse ${compact ? 'h-24' : 'h-40'} bg-gray-100 rounded-lg`} />
    );
  }

  if (error || !progress) {
    return (
      <div className="text-center py-4 text-gray-500">
        <span className="text-2xl">📊</span>
        <p className="text-sm mt-1">Unable to load progress</p>
      </div>
    );
  }

  const pressureConfig = PRESSURE_CONFIG[progress.pressureLevel];

  return (
    <div className={`flex flex-col gap-4 ${compact ? 'py-2' : 'py-4'}`}>
      {/* Pomodoro Count Display (Requirements: 17.1) */}
      <div className="text-center">
        <div className="flex items-baseline justify-center gap-1">
          <span className="text-4xl font-bold text-gray-900">
            {progress.completedPomodoros}
          </span>
          <span className="text-xl text-gray-400">/</span>
          <span className="text-2xl text-gray-600">
            {progress.targetPomodoros}
          </span>
        </div>
        <div className="flex items-center justify-center gap-1 text-sm text-gray-500">
          <span>🍅 Pomodoros today</span>
          {/* Show indicator if goal is adjusted (Requirements: 23.4) */}
          {goalAdjustment?.isAdjusted && (
            <span className="text-xs text-blue-600" title={`Default: ${goalAdjustment.defaultGoal}`}>
              (adjusted)
            </span>
          )}
        </div>
      </div>

      {/* Progress Bar (Requirements: 17.2) */}
      <div className="w-full">
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${pressureConfig.progressColor} transition-all duration-500 ease-out`}
            style={{ width: `${Math.min(100, progress.completionPercentage)}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-xs text-gray-500">
          <span>{progress.completionPercentage}% complete</span>
          <span>{progress.remainingPomodoros} remaining</span>
        </div>
      </div>

      {/* Success Indicator (Requirements: 17.4) */}
      {progress.completedPomodoros >= progress.targetPomodoros && (
        <div className="flex items-center justify-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
          <span className="text-lg">🎉</span>
          <span className="text-sm font-medium text-green-700">
            Daily goal achieved!
          </span>
        </div>
      )}

      {/* Pressure Indicator (Requirements: 19.1-19.7) */}
      {progress.remainingPomodoros > 0 && (
        <div className={`flex items-center justify-between p-3 rounded-lg border ${pressureConfig.bgColor}`}>
          <div className="flex items-center gap-2">
            <span className="text-lg">{pressureConfig.icon}</span>
            <div>
              <span className={`text-sm font-medium ${pressureConfig.color}`}>
                {progress.pressureMessage}
              </span>
              {/* Show required pace (Requirements: 18.5) */}
              {showPace && progress.remainingWorkMinutes > 0 && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {progress.requiredPace}
                </p>
              )}
            </div>
          </div>
          
          {/* Remaining work time indicator */}
          {progress.remainingWorkMinutes > 0 && (
            <div className="text-right">
              <div className="text-sm font-medium text-gray-700">
                {formatWorkTime(progress.remainingWorkMinutes)}
              </div>
              <div className="text-xs text-gray-500">work time left</div>
            </div>
          )}
        </div>
      )}

      {/* Goal at Risk Warning (Requirements: 18.4) */}
      {progress.isGoalAtRisk && progress.remainingPomodoros > 0 && (
        <div className="text-center text-xs text-gray-500">
          Max possible: {progress.maxPossiblePomodoros} pomodoros
          {progress.maxPossiblePomodoros < progress.remainingPomodoros && (
            <span className="text-red-500 ml-1">
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
