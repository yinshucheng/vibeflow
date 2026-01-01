// Core domain services
export { userService } from './user.service';
export type {
  UpdateSettingsInput,
  DevModeConfig,
  UserContext,
  ServiceResult,
} from './user.service';

export { authService } from './auth.service';
export type {
  CreateTokenInput,
  TokenValidationResult,
  TokenInfo,
} from './auth.service';
export { CreateTokenSchema } from './auth.service';

export { projectService } from './project.service';
export type {
  CreateProjectInput,
  UpdateProjectInput,
  ProjectWithGoals,
} from './project.service';

export { taskService } from './task.service';
export type {
  CreateTaskInput,
  UpdateTaskInput,
  TaskWithSubtasks,
} from './task.service';

export { goalService } from './goal.service';
export type {
  CreateGoalInput,
  UpdateGoalInput,
  GoalProgress,
  GoalWithProjects,
} from './goal.service';

export { pomodoroService } from './pomodoro.service';
export type {
  StartPomodoroInput,
  CompletePomodoroInput,
  PomodoroWithTask,
} from './pomodoro.service';

export { dailyStateService } from './daily-state.service';
export type {
  CompleteAirlockInput,
  OverrideCapInput,
  DailyStateWithProgress,
} from './daily-state.service';

export { activityLogService } from './activity-log.service';
export type {
  CreateActivityLogInput,
  CreateActivityLogBatchInput,
  GetActivityLogsInput,
  ActivitySummary,
} from './activity-log.service';

export { socketBroadcastService } from './socket-broadcast.service';
export {
  broadcastStateChange,
  broadcastPolicyUpdate,
  sendExecuteCommand,
  broadcastIdleAlert,
  isBroadcastReady,
} from './socket-broadcast.service';

export { notificationService } from './notification.service';
export type {
  NotificationSoundType,
  NotificationConfig,
} from './notification.service';
export {
  requestNotificationPermission,
  isNotificationSupported,
  preloadSounds,
  playSound,
  startTabFlash,
  stopTabFlash,
  showBrowserNotification,
  notifyPomodoroComplete,
  notifyIdleAlert,
} from './notification.service';

export { idleService, getIdleService, resetIdleService, IdleService } from './idle.service';
export type {
  IdleConfig,
  IdleState,
  IdleAlertEvent,
  IdleAlertCallback,
} from './idle.service';
export {
  isWithinWorkHours,
  shouldTriggerIdleAlert,
  validateWorkTimeSlots,
  parseTimeToMinutes,
  getCurrentTimeMinutes,
} from './idle.service';

export { statsService } from './stats.service';
export type {
  GetStatsInput,
  ProjectStats,
  TaskStats,
  DayStats,
  PomodoroStats,
} from './stats.service';
export { calculateDateRange } from './stats.service';

export { timelineService } from './timeline.service';
export type {
  CreateTimelineEventInput,
  GetTimelineEventsInput,
  GetTimelineEventsRangeInput,
  TimelineEventWithGap,
  DailyTimelineSummary,
  TimelineEventTypeValue,
} from './timeline.service';
export { TimelineEventType } from './timeline.service';

export { reviewService, calculateAchievementRate } from './review.service';
export type {
  DailyReviewData,
  WeeklyTrendData,
  GetDailyReviewInput,
  GetWeeklyTrendInput,
  GetReviewRangeInput,
} from './review.service';

export { settingsLockService } from './settings-lock.service';
export type {
  LockableSetting,
  SettingLockStatus,
  CanModifyResult,
  SettingsLockConfig,
} from './settings-lock.service';
export {
  isDevelopmentMode,
  isLockableSetting,
  canModifySetting,
  getAllSettingsLockStatus,
  getSettingLockStatus,
  getSettingDisplayName,
  getNextUnlockTime,
  formatUnlockTime,
  LOCKABLE_SETTINGS,
} from './settings-lock.service';

export { skipTokenService } from './skip-token.service';
export type {
  SkipTokenAction,
  SkipTokenConsumeResult,
  SkipTokenStatus,
  SkipTokenHistoryEntry,
  ConsumeSkipTokenInput,
} from './skip-token.service';
export { MODE_TOKEN_LIMITS } from './skip-token.service';

export { settingsModificationLogService } from './settings-modification-log.service';
export type {
  CreateLogInput,
  GetLogsOptions,
  ModificationSummary,
} from './settings-modification-log.service';

export { clientRegistryService } from './client-registry.service';
export {
  ClientConnectionSchema,
  ClientMetadataUpdateSchema,
} from './client-registry.service';

export { policyDistributionService } from './policy-distribution.service';
export type { ServiceResult as PolicyServiceResult } from './policy-distribution.service';

export { commandQueueService } from './command-queue.service';
export type {
  ServiceResult as CommandQueueServiceResult,
  QueuedCommand,
} from './command-queue.service';
export { EnqueueInputSchema } from './command-queue.service';

export { activityAggregationService } from './activity-aggregation.service';
export type {
  ServiceResult as ActivityAggregationServiceResult,
  AggregatedStats,
  ActivityExport,
  IngestActivityInput,
  IngestBatchInput,
  GetAggregatedStatsInput,
  ActivitySource,
  ActivityCategory,
} from './activity-aggregation.service';
export {
  IngestActivitySchema,
  IngestBatchSchema,
  GetAggregatedStatsSchema,
  ActivitySourceSchema,
  ActivityCategorySchema,
} from './activity-aggregation.service';


export { dataAccessAuditService, verifyResourceOwnership, ensureUserOwnership } from './data-access-audit.service';
export type {
  DataAccessAction,
  DataResource,
  LogAccessInput,
  GetLogsOptions as DataAccessGetLogsOptions,
} from './data-access-audit.service';
export {
  DataAccessActionSchema,
  DataResourceSchema,
  LogAccessInputSchema,
} from './data-access-audit.service';

export { focusSessionService } from './focus-session.service';
export type {
  StartSessionInput,
  ExtendSessionInput,
  FocusSessionStatus,
  ServiceResult as FocusSessionServiceResult,
} from './focus-session.service';
export {
  StartSessionSchema,
  ExtendSessionSchema,
} from './focus-session.service';

export { sleepTimeService } from './sleep-time.service';
export type {
  SleepEnforcementApp,
  SleepTimeConfig,
  SleepExemptionType,
  UpdateSleepTimeConfigInput,
  RecordExemptionInput,
  ServiceResult as SleepTimeServiceResult,
} from './sleep-time.service';
export {
  SleepEnforcementAppSchema,
  UpdateSleepTimeConfigSchema,
  RecordExemptionSchema,
  PRESET_SLEEP_ENFORCEMENT_APPS,
  parseTimeToMinutes as parseSleepTimeToMinutes,
  getCurrentTimeMinutes as getSleepCurrentTimeMinutes,
  isTimeInSleepWindow,
  getNightStartTime,
} from './sleep-time.service';

export { progressCalculationService } from './progress-calculation.service';
export type {
  TimeContext,
  ExpectedState,
  PressureLevel,
  CurrentStatus,
  DailyProgress,
  TaskSuggestion,
  ServiceResult as ProgressCalculationServiceResult,
} from './progress-calculation.service';
export {
  calculatePressureLevel,
  getPressureMessage,
} from './progress-calculation.service';

// Task service exports
export { calculateEstimatedPomodoros } from './task.service';

// Project service exports
export type { ProjectEstimation } from './project.service';

// Efficiency Analysis Service exports (Requirements: 24.1-24.5, 25.1-25.4)
export { efficiencyAnalysisService } from './efficiency-analysis.service';
export type {
  TimePeriod,
  TimePeriodStats,
  EfficiencyInsight,
  HourlyHeatmapData,
  HistoricalAnalysis,
  DayOfWeekStats,
  GoalRealismCheck,
  GetHistoricalAnalysisInput,
  ServiceResult as EfficiencyAnalysisServiceResult,
} from './efficiency-analysis.service';
export { GetHistoricalAnalysisSchema } from './efficiency-analysis.service';

// Early Warning Service exports (Requirements: 26.1-26.5, 26.1.1-26.1.6)
export { earlyWarningService } from './early-warning.service';
export type {
  EarlyWarningConfig,
  EarlyWarningCheckResult,
  EarlyWarningNotification,
  EarlyWarningAction,
  UpdateEarlyWarningConfigInput,
  ServiceResult as EarlyWarningServiceResult,
} from './early-warning.service';
export {
  UpdateEarlyWarningConfigSchema,
} from './early-warning.service';

// Over Rest Service exports (Requirements: 15.2, 15.3, 16.1-16.5)
export { overRestService } from './over-rest.service';
export type {
  OverRestAction,
  OverRestApp,
  OverRestStatus,
  OverRestConfig,
  ServiceResult as OverRestServiceResult,
} from './over-rest.service';
export {
  OverRestActionSchema,
  OverRestAppSchema,
  PRESET_OVER_REST_APPS,
} from './over-rest.service';
