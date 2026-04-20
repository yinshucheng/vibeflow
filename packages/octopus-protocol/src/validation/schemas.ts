/**
 * Octopus Architecture - Zod Validation Schemas
 *
 * Runtime validation schemas for all protocol types.
 */

import { z } from 'zod';

// =============================================================================
// ENUM SCHEMAS
// =============================================================================

// Event type enum schema
export const EventTypeSchema = z.enum([
  'ACTIVITY_LOG',
  'STATE_CHANGE',
  'USER_ACTION',
  'HEARTBEAT',
  'TIMELINE_EVENT',
  'BLOCK_EVENT',
  'INTERRUPTION_EVENT',
  'BROWSER_ACTIVITY',
  'BROWSER_SESSION',
  'TAB_SWITCH',
  'BROWSER_FOCUS',
  'ENTERTAINMENT_MODE',
  'WORK_START',
  'CHAT_MESSAGE',
  'CHAT_ACTION',
]);

// Client type enum schema
export const ClientTypeSchema = z.enum(['web', 'desktop', 'browser_ext', 'mobile']);

// Command type enum schema
export const CommandTypeSchema = z.enum([
  'SYNC_STATE',
  'EXECUTE_ACTION',
  'UPDATE_POLICY',
  'SHOW_UI',
  'CHAT_RESPONSE',
  'CHAT_TOOL_CALL',
  'CHAT_TOOL_RESULT',
  'CHAT_SYNC',
]);

// Action type enum schema
export const ActionTypeSchema = z.enum([
  'CLOSE_APP',
  'HIDE_APP',
  'BRING_TO_FRONT',
  'SHOW_NOTIFICATION',
  'CLOSE_TAB',
  'REDIRECT_TAB',
  'INJECT_OVERLAY',
  'ADD_SESSION_WHITELIST',
  'SEND_PUSH',
  'PLAY_SOUND',
  'VIBRATE',
]);

// Activity category schema
export const ActivityCategorySchema = z.enum(['productive', 'neutral', 'distracting']);

// Connection quality schema
export const ConnectionQualitySchema = z.enum(['good', 'degraded', 'poor']);

// Navigation type schema
export const NavigationTypeSchema = z.enum(['link', 'typed', 'reload', 'back_forward', 'other']);

// Search engine schema
export const SearchEngineSchema = z.enum(['google', 'bing', 'duckduckgo', 'other']);

// Browser focus state schema
export const BrowserFocusStateSchema = z.enum(['focused', 'blurred', 'unknown']);

// Entertainment stop reason schema
export const EntertainmentStopReasonSchema = z.enum(['manual', 'quota_exhausted', 'work_time_start']);

// Command priority schema
export const CommandPrioritySchema = z.enum(['low', 'normal', 'high', 'critical']);

// UI type schema
export const UITypeSchema = z.enum(['notification', 'modal', 'overlay', 'toast']);

// =============================================================================
// EVENT SCHEMAS
// =============================================================================

// Base event schema (validates required fields)
export const BaseEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: EventTypeSchema,
  userId: z.string().min(1),
  clientId: z.string().min(1),
  clientType: ClientTypeSchema,
  timestamp: z.number().int().positive(),
  sequenceNumber: z.number().int().nonnegative(),
});

// Activity log payload schema
export const ActivityLogPayloadSchema = z.object({
  source: z.enum(['browser', 'desktop_app', 'mobile_app']),
  identifier: z.string().min(1),
  title: z.string(),
  duration: z.number().nonnegative(),
  category: ActivityCategorySchema,
  metadata: z.object({
    domain: z.string().optional(),
    appBundleId: z.string().optional(),
    windowTitle: z.string().optional(),
  }).optional(),
});

// Activity log event schema
export const ActivityLogEventSchema = BaseEventSchema.extend({
  eventType: z.literal('ACTIVITY_LOG'),
  payload: ActivityLogPayloadSchema,
});

// State change payload schema
export const StateChangePayloadSchema = z.object({
  previousState: z.string(),
  newState: z.string(),
  trigger: z.string(),
  timestamp: z.number().int().positive(),
});

// State change event schema
export const StateChangeEventSchema = BaseEventSchema.extend({
  eventType: z.literal('STATE_CHANGE'),
  payload: StateChangePayloadSchema,
});

// User action payload schema (supports both legacy and mobile client formats)
export const UserActionPayloadSchema = z.object({
  actionType: z.string(),
  targetEntity: z.string().optional(),
  parameters: z.record(z.unknown()).optional(),
  result: z.string().optional(),
  // Mobile client fields
  optimisticId: z.string().optional(),
  data: z.record(z.unknown()).optional(),
});

// User action event schema
export const UserActionEventSchema = BaseEventSchema.extend({
  eventType: z.literal('USER_ACTION'),
  payload: UserActionPayloadSchema,
});

// Heartbeat payload schema
export const HeartbeatPayloadSchema = z.object({
  clientVersion: z.string().min(1),
  platform: z.string().min(1),
  connectionQuality: ConnectionQualitySchema,
  localStateHash: z.string(),
  capabilities: z.array(z.string()),
  uptime: z.number().nonnegative(),
});

// Heartbeat event schema
export const HeartbeatEventSchema = BaseEventSchema.extend({
  eventType: z.literal('HEARTBEAT'),
  payload: HeartbeatPayloadSchema,
});

// Browser activity payload schema
export const BrowserActivityPayloadSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  domain: z.string(),
  startTime: z.number().int().positive(),
  endTime: z.number().int().positive(),
  duration: z.number().nonnegative(),
  activeDuration: z.number().nonnegative(),
  idleTime: z.number().nonnegative(),
  category: ActivityCategorySchema,
  productivityScore: z.number().min(0).max(100),
  scrollDepth: z.number().min(0).max(100),
  interactionCount: z.number().int().nonnegative(),
  isMediaPlaying: z.boolean(),
  mediaPlayDuration: z.number().nonnegative(),
  referrer: z.string().optional(),
  navigationType: NavigationTypeSchema,
  searchQuery: z.string().optional(),
  searchEngine: SearchEngineSchema.optional(),
});

// Browser activity event schema
export const BrowserActivityEventSchema = BaseEventSchema.extend({
  eventType: z.literal('BROWSER_ACTIVITY'),
  payload: BrowserActivityPayloadSchema,
});

// Domain breakdown entry schema
export const DomainBreakdownEntrySchema = z.object({
  domain: z.string(),
  duration: z.number().nonnegative(),
  activeDuration: z.number().nonnegative(),
  category: ActivityCategorySchema,
  visitCount: z.number().int().positive(),
});

// Browser session payload schema
export const BrowserSessionPayloadSchema = z.object({
  sessionId: z.string().min(1),
  startTime: z.number().int().positive(),
  endTime: z.number().int().positive(),
  totalDuration: z.number().nonnegative(),
  activeDuration: z.number().nonnegative(),
  domainBreakdown: z.array(DomainBreakdownEntrySchema),
  tabSwitchCount: z.number().int().nonnegative(),
  rapidTabSwitches: z.number().int().nonnegative(),
  uniqueDomainsVisited: z.number().int().nonnegative(),
  productiveTime: z.number().nonnegative(),
  distractingTime: z.number().nonnegative(),
  neutralTime: z.number().nonnegative(),
  productivityScore: z.number().min(0).max(100),
});

// Browser session event schema
export const BrowserSessionEventSchema = BaseEventSchema.extend({
  eventType: z.literal('BROWSER_SESSION'),
  payload: BrowserSessionPayloadSchema,
});

// Tab switch payload schema
export const TabSwitchPayloadSchema = z.object({
  fromTabId: z.number().int(),
  toTabId: z.number().int(),
  fromUrl: z.string(),
  toUrl: z.string(),
  fromDomain: z.string(),
  toDomain: z.string(),
  timeSinceLastSwitch: z.number().nonnegative(),
  isRapidSwitch: z.boolean(),
});

// Tab switch event schema
export const TabSwitchEventSchema = BaseEventSchema.extend({
  eventType: z.literal('TAB_SWITCH'),
  payload: TabSwitchPayloadSchema,
});

// Browser focus payload schema
export const BrowserFocusPayloadSchema = z.object({
  isFocused: z.boolean(),
  previousState: BrowserFocusStateSchema,
  focusDuration: z.number().nonnegative().optional(),
});

// Browser focus event schema
export const BrowserFocusEventSchema = BaseEventSchema.extend({
  eventType: z.literal('BROWSER_FOCUS'),
  payload: BrowserFocusPayloadSchema,
});

// Entertainment mode payload schema
// Requirements: 8.6, 10.3, 12.1, 12.2
export const EntertainmentModePayloadSchema = z.object({
  action: z.enum(['start', 'stop']),
  sessionId: z.string().min(1),
  timestamp: z.number().int().positive(),
  quotaUsedBefore: z.number().nonnegative(),
  quotaUsedAfter: z.number().nonnegative().optional(),
  duration: z.number().nonnegative().optional(),
  sitesVisited: z.array(z.string()).optional(),
  reason: EntertainmentStopReasonSchema.optional(),
});

// Entertainment mode event schema
// Requirements: 8.6, 10.3, 12.1, 12.2
export const EntertainmentModeEventSchema = BaseEventSchema.extend({
  eventType: z.literal('ENTERTAINMENT_MODE'),
  payload: EntertainmentModePayloadSchema,
});

// Work start payload schema
// Requirements: 14.1, 14.2, 14.9, 14.10
export const WorkStartPayloadSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD'),
  configuredStartTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format. Use HH:mm'),
  actualStartTime: z.number().int().positive(),
  delayMinutes: z.number().int().nonnegative(),
  trigger: z.literal('first_pomodoro'),
});

// Work start event schema
// Requirements: 14.1, 14.2, 14.9, 14.10
export const WorkStartEventSchema = BaseEventSchema.extend({
  eventType: z.literal('WORK_START'),
  payload: WorkStartPayloadSchema,
});

// ---- AI Chat Event Schemas ----

export const ChatAttachmentSchema = z.object({
  type: z.enum(['task', 'project', 'goal', 'pomodoro']),
  id: z.string(),
  title: z.string(),
});

export const ChatMessagePayloadSchema = z.object({
  conversationId: z.string(),
  messageId: z.string(),
  content: z.string(),
  attachments: z.array(ChatAttachmentSchema).optional(),
});

export const ChatMessageEventSchema = BaseEventSchema.extend({
  eventType: z.literal('CHAT_MESSAGE'),
  payload: ChatMessagePayloadSchema,
});

export const ChatActionPayloadSchema = z.object({
  conversationId: z.string(),
  toolCallId: z.string(),
  action: z.enum(['confirm', 'cancel']),
});

export const ChatActionEventSchema = BaseEventSchema.extend({
  eventType: z.literal('CHAT_ACTION'),
  payload: ChatActionPayloadSchema,
});

export const ChatHistoryRequestEventSchema = BaseEventSchema.extend({
  eventType: z.literal('CHAT_HISTORY_REQUEST'),
  payload: z.object({}).passthrough(),
});

// Union schema for all events
export const OctopusEventSchema = z.discriminatedUnion('eventType', [
  ActivityLogEventSchema,
  StateChangeEventSchema,
  UserActionEventSchema,
  HeartbeatEventSchema,
  BrowserActivityEventSchema,
  BrowserSessionEventSchema,
  TabSwitchEventSchema,
  BrowserFocusEventSchema,
  EntertainmentModeEventSchema,
  WorkStartEventSchema,
  ChatMessageEventSchema,
  ChatActionEventSchema,
  ChatHistoryRequestEventSchema,
]);

// =============================================================================
// COMMAND SCHEMAS
// =============================================================================

// Base command schema
export const BaseCommandSchema = z.object({
  commandId: z.string().uuid(),
  commandType: CommandTypeSchema,
  targetClient: z.union([ClientTypeSchema, z.literal('all')]),
  priority: CommandPrioritySchema,
  requiresAck: z.boolean(),
  expiryTime: z.number().int().positive().optional(),
  createdAt: z.number().int().positive(),
});

// System state schema
export const SystemStateSchema = z.object({
  state: z.string(),
  dailyCapReached: z.boolean(),
  skipTokensRemaining: z.number().int().nonnegative(),
});

// Daily state schema
export const DailyStateSchema = z.object({
  date: z.string(),
  completedPomodoros: z.number().int().nonnegative(),
  totalFocusMinutes: z.number().nonnegative(),
  top3TaskIds: z.array(z.string()),
});

// Pomodoro state schema
export const PomodoroStateSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  startTime: z.number().int().positive(),
  duration: z.number().positive(),
  status: z.enum(['active', 'paused', 'completed', 'aborted']),
});

// Task state schema
export const TaskStateSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  priority: z.string(),
});

// User settings state schema
export const UserSettingsStateSchema = z.object({
  pomodoroDuration: z.number().positive(),
  shortBreakDuration: z.number().positive(),
  longBreakDuration: z.number().positive(),
  dailyCap: z.number().int().positive(),
  enforcementMode: z.enum(['strict', 'gentle']),
});

// Full state schema
export const FullStateSchema = z.object({
  systemState: SystemStateSchema,
  dailyState: DailyStateSchema,
  activePomodoro: PomodoroStateSchema.nullable(),
  top3Tasks: z.array(TaskStateSchema),
  settings: UserSettingsStateSchema,
});

// Sync state payload schema (full sync only -- delta sync deferred for future optimization)
export const SyncStatePayloadSchema = z.object({
  syncType: z.literal('full'),
  version: z.number().int().positive(),
  state: FullStateSchema.optional(),
});

// Sync state command schema
export const SyncStateCommandSchema = BaseCommandSchema.extend({
  commandType: z.literal('SYNC_STATE'),
  payload: SyncStatePayloadSchema,
});

// Execute action payload schema
export const ExecuteActionPayloadSchema = z.object({
  action: ActionTypeSchema,
  parameters: z.record(z.unknown()),
  timeout: z.number().positive().optional(),
  fallbackAction: ActionTypeSchema.optional(),
});

// Execute action command schema
export const ExecuteActionCommandSchema = BaseCommandSchema.extend({
  commandType: z.literal('EXECUTE_ACTION'),
  payload: ExecuteActionPayloadSchema,
});

// =============================================================================
// POLICY SCHEMAS
// =============================================================================

// Time slot schema
export const TimeSlotSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startHour: z.number().int().min(0).max(23),
  startMinute: z.number().int().min(0).max(59),
  endHour: z.number().int().min(0).max(23),
  endMinute: z.number().int().min(0).max(59),
});

// Skip token config schema (config portion only — remaining is in PolicyState)
export const SkipTokenConfigSchema = z.object({
  maxPerDay: z.number().int().positive(),
  delayMinutes: z.number().positive(),
});

// Distraction app schema
export const DistractionAppSchema = z.object({
  bundleId: z.string().min(1),
  name: z.string().min(1),
  action: z.enum(['force_quit', 'hide_window']),
});

// Ad-hoc focus session schema
// Requirements: 2.3, 13.1, 13.2
export const AdhocFocusSessionSchema = z.object({
  active: z.boolean(),
  endTime: z.number().int().positive(),
  overridesSleepTime: z.boolean().optional(),
  overridesWorkHours: z.boolean().optional(),
});

// Sleep enforcement app schema for policy
export const SleepEnforcementAppPolicySchema = z.object({
  bundleId: z.string().min(1),
  name: z.string().min(1),
});

// --- Config sub-schemas ---

// Sleep time config schema (config portion — schedule and enforcement apps)
export const SleepTimeConfigSchema = z.object({
  enabled: z.boolean(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format. Use HH:mm'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format. Use HH:mm'),
  enforcementApps: z.array(SleepEnforcementAppPolicySchema),
});

// REST enforcement config schema (config portion — apps, actions, grace duration)
export const RestEnforcementConfigSchema = z.object({
  workApps: z.array(SleepEnforcementAppPolicySchema),
  actions: z.array(z.string()),
  graceDurationMinutes: z.number().int().positive(),
});

// PolicyConfig schema — user settings, low-frequency change
export const PolicyConfigSchema = z.object({
  version: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  blacklist: z.array(z.string()),
  whitelist: z.array(z.string()),
  enforcementMode: z.enum(['strict', 'gentle']),
  workTimeSlots: z.array(TimeSlotSchema),
  skipTokens: SkipTokenConfigSchema,
  distractionApps: z.array(DistractionAppSchema),
  sleepTime: SleepTimeConfigSchema.optional(),
  overRestEnforcementApps: z.array(DistractionAppSchema).optional(),
  restEnforcement: RestEnforcementConfigSchema.optional(),
});

// --- State sub-schemas ---

// Health limit notification schema
export const HealthLimitSchema = z.object({
  type: z.enum(['2hours', 'daily']),
  message: z.string(),
  repeating: z.boolean().optional(),
  intervalMinutes: z.number().int().positive().optional(),
});

// Temporary unblock schema
export const TemporaryUnblockSchema = z.object({
  active: z.boolean(),
  endTime: z.number().int().positive(),
});

// PolicyState schema — runtime computed values, changes with state transitions
export const PolicyStateSchema = z.object({
  skipTokensRemaining: z.number().int().nonnegative(),
  isSleepTimeActive: z.boolean(),
  isSleepSnoozed: z.boolean(),
  sleepSnoozeEndTime: z.number().int().positive().optional(),
  isOverRest: z.boolean(),
  overRestMinutes: z.number().int().nonnegative(),
  overRestBringToFront: z.boolean(),
  isRestEnforcementActive: z.boolean(),
  restGrace: z.object({
    available: z.boolean(),
    remaining: z.number().int().nonnegative(),
  }).optional(),
  adhocFocusSession: AdhocFocusSessionSchema.optional(),
  temporaryUnblock: TemporaryUnblockSchema.optional(),
  healthLimit: HealthLimitSchema.optional(),
});

// Policy schema — Config + State combined
export const PolicySchema = z.object({
  config: PolicyConfigSchema,
  state: PolicyStateSchema,
});

// --- Legacy flat schemas (deprecated, kept for property tests transition) ---

/** @deprecated Use SleepTimeConfigSchema + PolicyStateSchema */
export const SleepTimePolicySchema = z.object({
  enabled: z.boolean(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format. Use HH:mm'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format. Use HH:mm'),
  enforcementApps: z.array(SleepEnforcementAppPolicySchema),
  isCurrentlyActive: z.boolean(),
  isSnoozed: z.boolean(),
  snoozeEndTime: z.number().int().positive().optional(),
});

/** @deprecated Use PolicyStateSchema.isOverRest + related fields */
export const OverRestPolicySchema = z.object({
  isOverRest: z.boolean(),
  overRestMinutes: z.number().int().nonnegative(),
  enforcementApps: z.array(SleepEnforcementAppPolicySchema),
  bringToFront: z.boolean(),
});

/** @deprecated Use TemporaryUnblockSchema */
export const TemporaryUnblockPolicySchema = z.object({
  active: z.boolean(),
  endTime: z.number().int().positive(),
});

/** @deprecated Use RestEnforcementConfigSchema + PolicyStateSchema */
export const RestEnforcementPolicySchema = z.object({
  isActive: z.boolean(),
  workApps: z.array(SleepEnforcementAppPolicySchema),
  actions: z.array(z.string()),
  grace: z.object({
    available: z.boolean(),
    remaining: z.number().int().nonnegative(),
    durationMinutes: z.number().int().positive(),
  }),
});

/** @deprecated Dead field — never populated by server */
export const WorkTimePolicySchema = z.object({
  enabled: z.boolean(),
  isCurrentlyActive: z.boolean(),
  isInRestPeriod: z.boolean(),
  slots: z.array(z.object({
    startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  })),
});

// Update policy payload schema
export const UpdatePolicyPayloadSchema = z.object({
  policyType: z.enum(['full', 'partial']),
  policy: PolicySchema,
  effectiveTime: z.number().int().positive(),
});

// Update policy command schema
export const UpdatePolicyCommandSchema = BaseCommandSchema.extend({
  commandType: z.literal('UPDATE_POLICY'),
  payload: UpdatePolicyPayloadSchema,
});

// Show UI payload schema
export const ShowUIPayloadSchema = z.object({
  uiType: UITypeSchema,
  content: z.record(z.unknown()),
  duration: z.number().positive().optional(),
  dismissible: z.boolean(),
});

// Show UI command schema
export const ShowUICommandSchema = BaseCommandSchema.extend({
  commandType: z.literal('SHOW_UI'),
  payload: ShowUIPayloadSchema,
});

// ---- AI Chat Command Schemas ----

export const ChatResponsePayloadSchema = z.object({
  conversationId: z.string(),
  messageId: z.string(),
  type: z.enum(['delta', 'complete']),
  content: z.string(),
  usage: z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
  }).optional(),
  isProactive: z.boolean().optional(),
  triggerId: z.string().optional(),
});

export const ChatResponseCommandSchema = BaseCommandSchema.extend({
  commandType: z.literal('CHAT_RESPONSE'),
  payload: ChatResponsePayloadSchema,
});

export const ChatToolCallPayloadSchema = z.object({
  conversationId: z.string(),
  messageId: z.string(),
  toolCallId: z.string(),
  toolName: z.string(),
  description: z.string(),
  parameters: z.record(z.unknown()),
  requiresConfirmation: z.boolean(),
});

export const ChatToolCallCommandSchema = BaseCommandSchema.extend({
  commandType: z.literal('CHAT_TOOL_CALL'),
  payload: ChatToolCallPayloadSchema,
});

export const ChatToolResultPayloadSchema = z.object({
  conversationId: z.string(),
  messageId: z.string(),
  toolCallId: z.string(),
  success: z.boolean(),
  summary: z.string(),
});

export const ChatToolResultCommandSchema = BaseCommandSchema.extend({
  commandType: z.literal('CHAT_TOOL_RESULT'),
  payload: ChatToolResultPayloadSchema,
});

export const ChatSyncPayloadSchema = z.object({
  conversationId: z.string(),
  messages: z.array(z.object({
    id: z.string(),
    role: z.string(),
    content: z.string(),
    metadata: z.record(z.unknown()).optional(),
    createdAt: z.string(),
  })),
});

export const ChatSyncCommandSchema = BaseCommandSchema.extend({
  commandType: z.literal('CHAT_SYNC'),
  payload: ChatSyncPayloadSchema,
});

// Union schema for all commands
export const OctopusCommandSchema = z.discriminatedUnion('commandType', [
  SyncStateCommandSchema,
  ExecuteActionCommandSchema,
  UpdatePolicyCommandSchema,
  ShowUICommandSchema,
  ChatResponseCommandSchema,
  ChatToolCallCommandSchema,
  ChatToolResultCommandSchema,
  ChatSyncCommandSchema,
]);
