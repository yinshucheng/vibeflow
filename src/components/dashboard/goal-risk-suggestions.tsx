'use client';

/**
 * GoalRiskSuggestions Component
 * 
 * Displays actionable suggestions when the daily goal is at risk.
 * Shows additional time needed, goal adjustment option, and quick start focus session.
 * 
 * Requirements: 19.1.1, 19.1.2, 19.1.3, 19.1.4, 19.1.5, 19.1.6, 19.1.7
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui';

interface GoalRiskSuggestionsProps {
  onStartFocusSession?: (duration: number) => void;
  compact?: boolean;
}

export function GoalRiskSuggestions({ 
  onStartFocusSession,
  compact = false 
}: GoalRiskSuggestionsProps) {
  const [showGoalAdjust, setShowGoalAdjust] = useState(false);
  const [newGoal, setNewGoal] = useState<number | null>(null);

  const utils = trpc.useUtils();

  // Get daily progress to check pressure level
  const { data: progress } = trpc.dailyState.getDailyProgress.useQuery();

  // Get goal risk suggestions (Requirements: 19.1.1-19.1.7)
  const { data: suggestions, isLoading } = trpc.dailyState.getGoalRiskSuggestions.useQuery(
    undefined,
    { enabled: progress?.isGoalAtRisk === true }
  );

  // Mutation for adjusting today's goal (Requirements: 19.1.5)
  const adjustGoalMutation = trpc.dailyState.adjustTodayGoal.useMutation({
    onSuccess: () => {
      utils.dailyState.getDailyProgress.invalidate();
      utils.dailyState.isTodayGoalAdjusted.invalidate();
      utils.dailyState.getGoalRiskSuggestions.invalidate();
      setShowGoalAdjust(false);
      setNewGoal(null);
    },
  });

  // Start focus session mutation
  const startFocusMutation = trpc.focusSession.startSession.useMutation({
    onSuccess: () => {
      utils.focusSession.getActiveSession.invalidate();
      onStartFocusSession?.(suggestions?.suggestedFocusSessionDuration ?? 60);
    },
  });

  // Don't show if goal is not at risk
  if (!progress?.isGoalAtRisk || progress.remainingPomodoros <= 0) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="animate-pulse h-32 bg-gray-100 rounded-lg" />
    );
  }

  if (!suggestions) {
    return null;
  }

  // Calculate suggested reduced goal
  const currentTarget = progress.targetPomodoros;
  const suggestedTarget = Math.max(
    progress.completedPomodoros,
    currentTarget - suggestions.suggestedGoalReduction
  );

  return (
    <div className={`p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg ${compact ? 'text-sm' : ''}`}>
      {/* Header (Requirements: 19.1.1) */}
      <div className="flex items-start gap-2 mb-3">
        <span className="text-xl">💡</span>
        <div>
          <h4 className="font-medium text-amber-900">Suggestions</h4>
          <p className="text-xs text-amber-700 mt-0.5">
            Your daily goal is at risk. Here are some options:
          </p>
        </div>
      </div>

      {/* Trade-off Message (Requirements: 19.1.6) */}
      {suggestions.tradeOffMessage && (
        <div className="mb-4 p-2 bg-white/50 rounded text-sm text-amber-800">
          {suggestions.tradeOffMessage}
        </div>
      )}

      {/* Cannot Meet Goal Message (Requirements: 19.1.7) */}
      {!suggestions.canMeetGoal && (
        <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          <span className="font-medium">⚠️ Goal cannot be met today.</span>
          <p className="text-xs mt-1">
            Focus on completing high-priority tasks instead.
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-3">
        {/* Start Focus Session (Requirements: 19.1.3) */}
        {suggestions.canMeetGoal && suggestions.additionalMinutesNeeded > 0 && (
          <div className="flex items-center justify-between gap-3 p-2 bg-white/70 rounded-lg">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-800">
                Add {formatDuration(suggestions.additionalMinutesNeeded)} of focus time
              </p>
              <p className="text-xs text-gray-500">
                Start an ad-hoc focus session
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => startFocusMutation.mutate({ 
                duration: suggestions.suggestedFocusSessionDuration 
              })}
              disabled={startFocusMutation.isPending}
              isLoading={startFocusMutation.isPending}
            >
              🎯 Start ({suggestions.suggestedFocusSessionDuration}m)
            </Button>
          </div>
        )}

        {/* Adjust Goal (Requirements: 19.1.4, 19.1.5) */}
        {suggestions.suggestedGoalReduction > 0 && (
          <div className="p-2 bg-white/70 rounded-lg">
            {showGoalAdjust ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">New goal:</span>
                <input
                  type="number"
                  min={progress.completedPomodoros}
                  max={currentTarget}
                  value={newGoal ?? suggestedTarget}
                  onChange={(e) => setNewGoal(parseInt(e.target.value) || suggestedTarget)}
                  className="w-16 px-2 py-1 text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-500">pomodoros</span>
                <div className="flex-1" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowGoalAdjust(false);
                    setNewGoal(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => adjustGoalMutation.mutate({ 
                    newTarget: newGoal ?? suggestedTarget 
                  })}
                  disabled={adjustGoalMutation.isPending}
                  isLoading={adjustGoalMutation.isPending}
                >
                  Save
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">
                    Reduce today&apos;s goal by {suggestions.suggestedGoalReduction}
                  </p>
                  <p className="text-xs text-gray-500">
                    Adjust from {currentTarget} → {suggestedTarget} pomodoros
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowGoalAdjust(true);
                    setNewGoal(suggestedTarget);
                  }}
                >
                  📉 Adjust Goal
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error Display */}
      {(startFocusMutation.error || adjustGoalMutation.error) && (
        <p className="mt-2 text-xs text-red-600">
          {startFocusMutation.error?.message || adjustGoalMutation.error?.message}
        </p>
      )}
    </div>
  );
}

/**
 * Format duration in a human-readable format
 */
function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} minutes`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  }
  return `${hours}h ${mins}m`;
}
