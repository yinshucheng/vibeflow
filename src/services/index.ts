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

export { trayIntegrationService } from './tray-integration.service';

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
export { pomodoroSchedulerService } from './pomodoro-scheduler.service';
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

// Entertainment Service exports (Requirements: 8.1-8.9)
export { entertainmentService } from './entertainment.service';
export type {
  EntertainmentStatus,
  EntertainmentStartResult,
  EntertainmentStopReason,
  UpdateEntertainmentSettingsInput,
  ServiceResult as EntertainmentServiceResult,
} from './entertainment.service';
export {
  UpdateEntertainmentSettingsSchema,
} from './entertainment.service';

// Work Start Service exports (Requirements: 14.1, 14.2, 14.7, 14.8)
export { workStartService } from './work-start.service';
export type {
  WorkStartInfo,
  WorkStartStats,
  RecordWorkStartInput,
  ServiceResult as WorkStartServiceResult,
} from './work-start.service';
export {
  RecordWorkStartSchema,
  calculateWorkStartDelay,
} from './work-start.service';

// Daily Reset Scheduler Service exports (Requirements: 5.7)
export { dailyResetSchedulerService } from './daily-reset-scheduler.service';

// Blocker Resolver Service exports (Requirements: 5.1, 5.2, 5.3, 5.4, 5.5)
export { blockerResolverService } from './blocker-resolver.service';
export type {
  BlockerCategory,
  DependencyType,
  BlockerWithTask,
  PotentialBlockerResult,
  DependencyInfo,
  ReportBlockerInput,
  TrackDependencyInput,
  ResolveBlockerInput,
  GetBlockerHistoryInput,
  ServiceResult as BlockerResolverServiceResult,
} from './blocker-resolver.service';
export {
  ReportBlockerSchema,
  TrackDependencySchema,
  ResolveBlockerSchema,
  GetBlockerHistorySchema,
} from './blocker-resolver.service';

// Task Decomposer Service exports (Requirements: 2.1, 2.2, 2.3, 2.4, 2.5)
export { taskDecomposerService } from './task-decomposer.service';
export type {
  SubtaskSuggestion,
  DecompositionResult,
  AcceptSuggestionsInput,
  RecordFeedbackInput,
  ServiceResult as TaskDecomposerServiceResult,
} from './task-decomposer.service';
export {
  SubtaskSuggestionSchema,
  AcceptSuggestionsSchema,
  RecordFeedbackSchema,
} from './task-decomposer.service';

// Smart Suggestion Service exports (Requirements: 3.1, 3.2, 3.3, 3.5, 9.1, 9.2, 9.3, 9.4, 9.5)
export { smartSuggestionService } from './smart-suggestion.service';
export type {
  TaskSuggestion as SmartTaskSuggestion,
  SuggestionContext,
  AirlockSuggestionsResult,
  RecordSuggestionFeedbackInput,
  ServiceResult as SmartSuggestionServiceResult,
} from './smart-suggestion.service';
export {
  RecordSuggestionFeedbackSchema,
} from './smart-suggestion.service';

// MCP Audit Service exports (Requirement 4.5)
export { mcpAuditService } from './mcp-audit.service';
export type {
  LogToolCallInput,
  GetAuditLogsInput,
  AuditLogSummary,
  ServiceResult as MCPAuditServiceResult,
} from './mcp-audit.service';
export {
  LogToolCallSchema,
  GetAuditLogsSchema,
} from './mcp-audit.service';

// Context Provider Service exports (Requirements: 6.1, 6.2, 6.3, 6.4, 6.5)
export { contextProviderService } from './context-provider.service';
export type {
  AIContext,
  CurrentTaskContext,
  CurrentProjectContext,
  RecentActivityEntry,
  PomodoroStatusContext,
  TodayProgressContext,
  GetRecentActivityInput,
  ServiceResult as ContextProviderServiceResult,
} from './context-provider.service';
export {
  GetRecentActivitySchema,
} from './context-provider.service';

// Progress Analyzer Service exports (Requirements: 7.1, 7.2, 7.3, 7.4, 7.5)
export { progressAnalyzerService } from './progress-analyzer.service';
export type {
  ProductivityTrend,
  ProductivityScore,
  PeakHoursAnalysis,
  GoalPrediction,
  ProductivityInsight,
  TrendDetectionResult,
  ServiceResult as ProgressAnalyzerServiceResult,
} from './progress-analyzer.service';
export {
  calculateProductivityScore,
  detectTrend,
} from './progress-analyzer.service';


// Natural Language Parser Service exports (Requirements: 8.1, 8.2, 8.3, 8.4, 8.5)
export { nlParserService } from './nl-parser.service';
export type {
  ParsedTask,
  ProjectCandidate,
  ConfirmAndCreateInput,
  ServiceResult as NLParserServiceResult,
} from './nl-parser.service';
export {
  ConfirmAndCreateSchema,
} from './nl-parser.service';


// MCP Event Service exports (Requirements: 10.1, 10.2, 10.3, 10.4, 10.5)
export { mcpEventService, registerMCPEventBroadcaster } from './mcp-event.service';
export type {
  MCPEventType,
  MCPEvent,
  EventSubscription,
  SubscribeInput,
  PublishEventInput,
  GetEventHistoryInput,
  ServiceResult as MCPEventServiceResult,
} from './mcp-event.service';
export {
  MCPEventTypeSchema,
  SubscribeInputSchema,
  PublishEventInputSchema,
  GetEventHistoryInputSchema,
} from './mcp-event.service';

// Heartbeat Service exports (Requirements: 3.2, 3.3, 3.4, 3.5)
export { heartbeatService } from './heartbeat.service';
export type {
  HeartbeatPayload,
  ClientStatus,
  OfflineEventInfo,
  ClientConnectionRecord,
  ClientOfflineEventRecord,
  ServiceResult as HeartbeatServiceResult,
} from './heartbeat.service';
export {
  HeartbeatPayloadSchema,
  HEARTBEAT_INTERVAL_MS,
  OFFLINE_THRESHOLD_MS,
  OFFLINE_CHECK_INTERVAL_MS,
} from './heartbeat.service';

// Grace Period Service exports (Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6)
export { gracePeriodService } from './grace-period.service';
export type {
  GracePeriodConfig,
  GracePeriodState,
  StartGracePeriodInput,
  ServiceResult as GracePeriodServiceResult,
} from './grace-period.service';
export {
  StartGracePeriodSchema,
  GracePeriodConfigSchema,
  DEFAULT_GRACE_PERIOD_MINUTES,
  POMODORO_GRACE_PERIOD_MINUTES,
  MIN_GRACE_PERIOD_MINUTES,
  MAX_GRACE_PERIOD_MINUTES,
  calculateGracePeriodDuration,
} from './grace-period.service';

// Bypass Detection Service exports (Requirements: 4.1, 4.2, 4.3, 4.4, 4.5)
export { bypassDetectionService } from './bypass-detection.service';
export type {
  BypassEventType,
  WarningLevel,
  BypassEvent,
  BypassScoreFactors,
  BypassScore,
  RecordBypassEventInput,
  GetBypassHistoryInput,
  ServiceResult as BypassDetectionServiceResult,
} from './bypass-detection.service';
export {
  BypassEventTypeSchema,
  RecordBypassEventSchema,
  GetBypassHistorySchema,
  DEFAULT_BYPASS_WARNING_THRESHOLD,
  BYPASS_SCORE_WEIGHTS,
  WARNING_LEVEL_THRESHOLDS,
  MAX_FACTOR_SCORES,
  calculateWarningLevel,
} from './bypass-detection.service';

// LLM Adapter Service exports (F2)
export { llmAdapterService } from './llm-adapter.service';
export type {
  CallLLMOptions,
  GenerateTextOptions,
  TokenUsage,
} from './llm-adapter.service';

// Chat Service exports (F3)
export { chatService, conversationLocks, acquireLock } from './chat.service';
export type {
  HandleMessageResult,
  OnDeltaCallback,
} from './chat.service';

// Chat Context Service exports (F6)
export { chatContextService, CONTEXT_WINDOW, estimateTokens, SYSTEM_PROMPT_TEMPLATE } from './chat-context.service';

// Chat Tools Service exports (F4 + S1)
export { chatToolsService, createChatTools, getChatToolDefinitions, CHAT_TOOL_SCHEMAS, HIGH_RISK_TOOLS } from './chat-tools.service';
export type {
  ChatToolDefinition,
  ChatToolResult,
  PendingToolConfirmation,
} from './chat-tools.service';

// Chat Observability Service exports (F7)
export { chatObservabilityService } from './chat-observability.service';
export type {
  TrackUsageInput,
  ConversationTokenStats,
} from './chat-observability.service';

// Demo Mode Service exports (Requirements: 6.1, 6.2, 6.3, 6.4, 6.7, 6.9, 6.10)
export { demoModeService } from './demo-mode.service';
export type {
  DemoModeConfig,
  DemoToken,
  DemoModeState,
  DemoModeHistory,
  ActivateDemoModeInput,
  ServiceResult as DemoModeServiceResult,
} from './demo-mode.service';
export {
  ActivateDemoModeSchema,
  DemoModeConfigSchema,
  DEFAULT_DEMO_TOKENS_PER_MONTH,
  MIN_DEMO_TOKENS_PER_MONTH,
  MAX_DEMO_TOKENS_PER_MONTH,
  DEFAULT_DEMO_MAX_DURATION_MINUTES,
  MIN_DEMO_DURATION_MINUTES,
  MAX_DEMO_DURATION_MINUTES,
  DEFAULT_CONFIRMATION_PHRASE,
} from './demo-mode.service';

// AI Trigger Service exports (S4)
export { aiTriggerService, registerProactiveBroadcaster } from './ai-trigger.service';
export type {
  TriggerDefinition,
  TriggerPriority,
  TriggerSourceType,
  AITriggerConfig,
  FireResult,
} from './ai-trigger.service';
export {
  DEFAULT_AI_TRIGGER_CONFIG,
  BUILTIN_TRIGGERS,
  getEscalationLevel,
  getEscalationTemplate,
} from './ai-trigger.service';

// Chat State Triggers Service exports (S5)
export { chatTriggersStateService } from './chat-triggers-state.service';
export {
  handleDailyStateChanged,
  handlePomodoroCompleted,
  handleOverRestEscalation,
  handlePlanningEnter,
  handleRestEnter,
  handleOverRestEnter,
  handleTaskStuck,
} from './chat-triggers-state.service';
