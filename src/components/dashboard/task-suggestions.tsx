'use client';

/**
 * TaskSuggestions Component
 * 
 * Displays suggested tasks for today based on remaining work time,
 * priority, and estimated duration.
 * 
 * Requirements: 22.1, 22.2, 22.3, 22.4
 */

import Link from 'next/link';
import { trpc } from '@/lib/trpc';

// Priority badge colors
const PRIORITY_COLORS: Record<string, string> = {
  P1: 'bg-red-100 text-red-700',
  P2: 'bg-yellow-100 text-yellow-700',
  P3: 'bg-gray-100 text-gray-700',
};

interface TaskSuggestionsProps {
  maxSuggestions?: number;
  compact?: boolean;
  showReason?: boolean;
}

export function TaskSuggestions({ 
  maxSuggestions = 3,
  compact = false,
  showReason = true 
}: TaskSuggestionsProps) {
  // Get task suggestions (Requirements: 22.1-22.4)
  const { data: suggestions, isLoading, error } = trpc.dailyState.getTaskSuggestions.useQuery(
    { maxSuggestions },
    { refetchInterval: 120000 } // Refetch every 2 minutes
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: maxSuggestions }).map((_, i) => (
          <div key={i} className="animate-pulse h-16 bg-gray-100 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-4 text-gray-500">
        <span className="text-2xl">📋</span>
        <p className="text-sm mt-1">Unable to load suggestions</p>
      </div>
    );
  }

  if (!suggestions || suggestions.length === 0) {
    return (
      <div className="text-center py-6 text-gray-500">
        <span className="text-3xl">✨</span>
        <p className="text-sm mt-2 font-medium">No task suggestions</p>
        <p className="text-xs mt-1">
          Add tasks with plan dates or estimates to get suggestions
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${compact ? 'text-sm' : ''}`}>
      {suggestions.map((task) => (
        <Link
          key={task.taskId}
          href={`/tasks/${task.taskId}`}
          className="block p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all"
        >
          <div className="flex items-start gap-3">
            {/* Priority Badge */}
            <span className={`shrink-0 px-1.5 py-0.5 text-xs font-medium rounded ${PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.P3}`}>
              {task.priority}
            </span>

            {/* Task Info */}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">
                {task.taskTitle}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {task.projectTitle}
              </p>
              
              {/* Reason for suggestion (Requirements: 22.2) */}
              {showReason && task.reason && (
                <p className="text-xs text-blue-600 mt-1">
                  💡 {task.reason}
                </p>
              )}
            </div>

            {/* Estimated Time */}
            <div className="shrink-0 text-right">
              {task.estimatedMinutes ? (
                <>
                  <div className="text-sm font-medium text-gray-700">
                    {formatEstimate(task.estimatedMinutes)}
                  </div>
                  {task.estimatedPomodoros && (
                    <div className="text-xs text-gray-500">
                      ~{task.estimatedPomodoros} 🍅
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-gray-400">
                  No estimate
                </div>
              )}
            </div>
          </div>

          {/* Warning for tasks that may need splitting (Requirements: 22.4) */}
          {task.reason?.includes('split or defer') && (
            <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
              <span>⚠️</span>
              <span>May need to split or defer</span>
            </div>
          )}
        </Link>
      ))}

      {/* View All Tasks Link */}
      <div className="text-center pt-2">
        <Link 
          href="/tasks" 
          className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
        >
          View all tasks →
        </Link>
      </div>
    </div>
  );
}

/**
 * Format estimated time in a compact format
 */
function formatEstimate(minutes: number): string {
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
