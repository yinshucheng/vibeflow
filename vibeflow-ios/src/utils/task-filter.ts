/**
 * Task Filter Utilities
 *
 * Provides filtering and sorting functions for task lists.
 * All operations are read-only - no state modifications.
 *
 * Requirements: 5.1, 5.2
 */

import type { TaskData } from '@/types';

// =============================================================================
// DATE UTILITIES
// =============================================================================

/**
 * Get today's date string in YYYY-MM-DD format
 */
export function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Check if a date string matches today
 */
export function isToday(dateString: string | undefined): boolean {
  if (!dateString) return false;
  return dateString === getTodayString();
}

// =============================================================================
// TASK FILTERING
// =============================================================================

/**
 * Filter tasks to only include today's tasks
 * Returns tasks where planDate equals today's date (YYYY-MM-DD format)
 *
 * Property 9: Today Task Filtering
 * For any list of tasks, filtering by today's date SHALL return only tasks
 * where planDate equals the current date string (YYYY-MM-DD format).
 *
 * @param tasks - Array of tasks to filter
 * @param today - Optional date string to filter by (defaults to today)
 * @returns Array of tasks scheduled for today
 */
export function filterTodayTasks(
  tasks: TaskData[],
  today?: string
): TaskData[] {
  const targetDate = today ?? getTodayString();
  return tasks.filter((task) => task.planDate === targetDate);
}

/**
 * Get Top 3 tasks from a task list
 * Returns tasks where isTop3 is true
 *
 * @param tasks - Array of tasks to filter
 * @returns Array of Top 3 tasks
 */
export function getTop3Tasks(tasks: TaskData[]): TaskData[] {
  return tasks.filter((task) => task.isTop3);
}

/**
 * Get non-Top3 tasks from today's tasks
 *
 * @param tasks - Array of tasks to filter
 * @returns Array of today's tasks that are not in Top 3
 */
export function getNonTop3TodayTasks(tasks: TaskData[]): TaskData[] {
  return tasks.filter((task) => !task.isTop3);
}

// =============================================================================
// TASK SORTING
// =============================================================================

/**
 * Priority weight for sorting (lower = higher priority)
 */
const PRIORITY_WEIGHT: Record<TaskData['priority'], number> = {
  P1: 1,
  P2: 2,
  P3: 3,
};

/**
 * Status weight for sorting (lower = more important to show first)
 */
const STATUS_WEIGHT: Record<TaskData['status'], number> = {
  in_progress: 1,
  pending: 2,
  completed: 3,
};

/**
 * Sort tasks by priority (P1 > P2 > P3)
 *
 * @param tasks - Array of tasks to sort
 * @returns Sorted array (does not mutate original)
 */
export function sortByPriority(tasks: TaskData[]): TaskData[] {
  return [...tasks].sort(
    (a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]
  );
}

/**
 * Sort tasks by status (in_progress > pending > completed)
 *
 * @param tasks - Array of tasks to sort
 * @returns Sorted array (does not mutate original)
 */
export function sortByStatus(tasks: TaskData[]): TaskData[] {
  return [...tasks].sort(
    (a, b) => STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status]
  );
}

/**
 * Sort tasks by status first, then by priority
 * Current task (in_progress) comes first, then pending by priority, then completed
 *
 * @param tasks - Array of tasks to sort
 * @returns Sorted array (does not mutate original)
 */
export function sortTasksForDisplay(tasks: TaskData[]): TaskData[] {
  return [...tasks].sort((a, b) => {
    // Current task always first
    if (a.isCurrentTask && !b.isCurrentTask) return -1;
    if (!a.isCurrentTask && b.isCurrentTask) return 1;

    // Then by status
    const statusDiff = STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status];
    if (statusDiff !== 0) return statusDiff;

    // Then by priority
    return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
  });
}

// =============================================================================
// TASK GROUPING
// =============================================================================

/**
 * Group tasks by status
 *
 * @param tasks - Array of tasks to group
 * @returns Object with tasks grouped by status
 */
export function groupTasksByStatus(tasks: TaskData[]): {
  inProgress: TaskData[];
  pending: TaskData[];
  completed: TaskData[];
} {
  return {
    inProgress: tasks.filter((t) => t.status === 'in_progress'),
    pending: tasks.filter((t) => t.status === 'pending'),
    completed: tasks.filter((t) => t.status === 'completed'),
  };
}

// =============================================================================
// TASK STATISTICS
// =============================================================================

/**
 * Calculate task completion statistics
 *
 * @param tasks - Array of tasks
 * @returns Statistics object
 */
export function getTaskStats(tasks: TaskData[]): {
  total: number;
  completed: number;
  pending: number;
  inProgress: number;
  completionRate: number;
} {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const pending = tasks.filter((t) => t.status === 'pending').length;
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
  const completionRate = total > 0 ? (completed / total) * 100 : 0;

  return {
    total,
    completed,
    pending,
    inProgress,
    completionRate,
  };
}

/**
 * Get the current task (task being worked on)
 *
 * @param tasks - Array of tasks
 * @returns The current task or null
 */
export function getCurrentTask(tasks: TaskData[]): TaskData | null {
  return tasks.find((t) => t.isCurrentTask) ?? null;
}
