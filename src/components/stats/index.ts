/**
 * Stats Components Barrel Export
 */

export { StatsDashboard, formatDuration } from './stats-dashboard';
export type { TimeRangeType, TimeRangeFilter, DimensionType, DimensionFilter } from './stats-dashboard';
export { ProjectStats } from './project-stats';
export { TaskStats } from './task-stats';
export { DailyStats } from './daily-stats';
export { DailyReviewCard } from './daily-review-card';
export { TrendChart } from './trend-chart';
export { SkipTokenStats } from './skip-token-stats';
export { EfficiencyAnalysis } from './efficiency-analysis';
export { ProductivityHeatmap } from './productivity-heatmap';
export { ExemptionHistory } from './exemption-history';
export { FocusSessionStats } from './focus-session-stats';

// Re-export types from stats service for convenience
export type { 
  PomodoroStats, 
  ProjectStats as ProjectStatsData, 
  TaskStats as TaskStatsData, 
  DayStats as DayStatsData 
} from '@/services/stats.service';

// Re-export types from review service for convenience
export type {
  DailyReviewData,
  WeeklyTrendData,
} from '@/services/review.service';

// Re-export types from efficiency analysis service for convenience
export type {
  TimePeriod,
  TimePeriodStats,
  EfficiencyInsight,
  HourlyHeatmapData,
  HistoricalAnalysis,
} from '@/services/efficiency-analysis.service';
