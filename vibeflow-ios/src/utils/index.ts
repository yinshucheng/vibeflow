/**
 * Utils Index
 *
 * Export all utility functions for easy importing.
 */

export {
  getOrCreateClientId,
  clearClientId,
  hasClientId,
} from './client-id';

export {
  evaluateBlockingReason,
} from './blocking-reason';

export {
  getTodayString,
  isToday,
  filterTodayTasks,
  getTop3Tasks,
  getNonTop3TodayTasks,
  sortByPriority,
  sortByStatus,
  sortTasksForDisplay,
  groupTasksByStatus,
  getTaskStats,
  getCurrentTask,
} from './task-filter';
