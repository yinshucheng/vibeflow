"use strict";
/**
 * Octopus Architecture - Zod Validation Schemas
 *
 * Runtime validation schemas for all protocol types.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncStateCommandSchema = exports.SyncStatePayloadSchema = exports.FullStateSchema = exports.UserSettingsStateSchema = exports.TaskStateSchema = exports.PomodoroStateSchema = exports.DailyStateSchema = exports.SystemStateSchema = exports.BaseCommandSchema = exports.OctopusEventSchema = exports.ChatHistoryRequestEventSchema = exports.ChatActionEventSchema = exports.ChatActionPayloadSchema = exports.ChatMessageEventSchema = exports.ChatMessagePayloadSchema = exports.ChatAttachmentSchema = exports.WorkStartEventSchema = exports.WorkStartPayloadSchema = exports.EntertainmentModeEventSchema = exports.EntertainmentModePayloadSchema = exports.BrowserFocusEventSchema = exports.BrowserFocusPayloadSchema = exports.TabSwitchEventSchema = exports.TabSwitchPayloadSchema = exports.BrowserSessionEventSchema = exports.BrowserSessionPayloadSchema = exports.DomainBreakdownEntrySchema = exports.BrowserActivityEventSchema = exports.BrowserActivityPayloadSchema = exports.HeartbeatEventSchema = exports.HeartbeatPayloadSchema = exports.UserActionEventSchema = exports.UserActionPayloadSchema = exports.StateChangeEventSchema = exports.StateChangePayloadSchema = exports.ActivityLogEventSchema = exports.ActivityLogPayloadSchema = exports.BaseEventSchema = exports.UITypeSchema = exports.CommandPrioritySchema = exports.EntertainmentStopReasonSchema = exports.BrowserFocusStateSchema = exports.SearchEngineSchema = exports.NavigationTypeSchema = exports.ConnectionQualitySchema = exports.ActivityCategorySchema = exports.ActionTypeSchema = exports.CommandTypeSchema = exports.ClientTypeSchema = exports.EventTypeSchema = void 0;
exports.OctopusCommandSchema = exports.ChatSyncCommandSchema = exports.ChatSyncPayloadSchema = exports.ChatToolResultCommandSchema = exports.ChatToolResultPayloadSchema = exports.ChatToolCallCommandSchema = exports.ChatToolCallPayloadSchema = exports.ChatResponseCommandSchema = exports.ChatResponsePayloadSchema = exports.ActionResultCommandSchema = exports.ActionResultPayloadSchema = exports.ShowUICommandSchema = exports.ShowUIPayloadSchema = exports.UpdatePolicyCommandSchema = exports.UpdatePolicyPayloadSchema = exports.WorkTimePolicySchema = exports.RestEnforcementPolicySchema = exports.TemporaryUnblockPolicySchema = exports.OverRestPolicySchema = exports.SleepTimePolicySchema = exports.PolicySchema = exports.PolicyStateSchema = exports.TemporaryUnblockSchema = exports.HealthLimitSchema = exports.PolicyConfigSchema = exports.RestEnforcementConfigSchema = exports.SleepTimeConfigSchema = exports.SleepEnforcementAppPolicySchema = exports.AdhocFocusSessionSchema = exports.DistractionAppSchema = exports.SkipTokenConfigSchema = exports.TimeSlotSchema = exports.ExecuteActionCommandSchema = exports.ExecuteActionPayloadSchema = void 0;
const zod_1 = require("zod");
// =============================================================================
// ENUM SCHEMAS
// =============================================================================
// Event type enum schema
exports.EventTypeSchema = zod_1.z.enum([
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
    'CHAT_HISTORY_REQUEST',
    'DESKTOP_APP_USAGE',
    'DESKTOP_IDLE',
    'DESKTOP_WINDOW_CHANGE',
]);
// Client type enum schema
exports.ClientTypeSchema = zod_1.z.enum(['web', 'desktop', 'browser_ext', 'mobile', 'api']);
// Command type enum schema
exports.CommandTypeSchema = zod_1.z.enum([
    'SYNC_STATE',
    'EXECUTE_ACTION',
    'UPDATE_POLICY',
    'SHOW_UI',
    'ACTION_RESULT',
    'CHAT_RESPONSE',
    'CHAT_TOOL_CALL',
    'CHAT_TOOL_RESULT',
    'CHAT_SYNC',
]);
// Action type enum schema
exports.ActionTypeSchema = zod_1.z.enum([
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
exports.ActivityCategorySchema = zod_1.z.enum(['productive', 'neutral', 'distracting']);
// Connection quality schema
exports.ConnectionQualitySchema = zod_1.z.enum(['good', 'degraded', 'poor']);
// Navigation type schema
exports.NavigationTypeSchema = zod_1.z.enum(['link', 'typed', 'reload', 'back_forward', 'other']);
// Search engine schema
exports.SearchEngineSchema = zod_1.z.enum(['google', 'bing', 'duckduckgo', 'other']);
// Browser focus state schema
exports.BrowserFocusStateSchema = zod_1.z.enum(['focused', 'blurred', 'unknown']);
// Entertainment stop reason schema
exports.EntertainmentStopReasonSchema = zod_1.z.enum(['manual', 'quota_exhausted', 'work_time_start']);
// Command priority schema
exports.CommandPrioritySchema = zod_1.z.enum(['low', 'normal', 'high', 'critical']);
// UI type schema
exports.UITypeSchema = zod_1.z.enum(['notification', 'modal', 'overlay', 'toast']);
// =============================================================================
// EVENT SCHEMAS
// =============================================================================
// Base event schema (validates required fields)
exports.BaseEventSchema = zod_1.z.object({
    eventId: zod_1.z.string().uuid(),
    eventType: exports.EventTypeSchema,
    userId: zod_1.z.string().min(1),
    clientId: zod_1.z.string().min(1),
    clientType: exports.ClientTypeSchema,
    timestamp: zod_1.z.number().int().positive(),
    sequenceNumber: zod_1.z.number().int().nonnegative(),
});
// Activity log payload schema
exports.ActivityLogPayloadSchema = zod_1.z.object({
    source: zod_1.z.enum(['browser', 'desktop_app', 'mobile_app']),
    identifier: zod_1.z.string().min(1),
    title: zod_1.z.string(),
    duration: zod_1.z.number().nonnegative(),
    category: exports.ActivityCategorySchema,
    metadata: zod_1.z.object({
        domain: zod_1.z.string().optional(),
        appBundleId: zod_1.z.string().optional(),
        windowTitle: zod_1.z.string().optional(),
    }).optional(),
});
// Activity log event schema
exports.ActivityLogEventSchema = exports.BaseEventSchema.extend({
    eventType: zod_1.z.literal('ACTIVITY_LOG'),
    payload: exports.ActivityLogPayloadSchema,
});
// State change payload schema
exports.StateChangePayloadSchema = zod_1.z.object({
    previousState: zod_1.z.string(),
    newState: zod_1.z.string(),
    trigger: zod_1.z.string(),
    timestamp: zod_1.z.number().int().positive(),
});
// State change event schema
exports.StateChangeEventSchema = exports.BaseEventSchema.extend({
    eventType: zod_1.z.literal('STATE_CHANGE'),
    payload: exports.StateChangePayloadSchema,
});
// User action payload schema (supports both legacy and mobile client formats)
exports.UserActionPayloadSchema = zod_1.z.object({
    actionType: zod_1.z.string(),
    targetEntity: zod_1.z.string().optional(),
    parameters: zod_1.z.record(zod_1.z.unknown()).optional(),
    result: zod_1.z.string().optional(),
    // Mobile client fields
    optimisticId: zod_1.z.string().optional(),
    data: zod_1.z.record(zod_1.z.unknown()).optional(),
});
// User action event schema
exports.UserActionEventSchema = exports.BaseEventSchema.extend({
    eventType: zod_1.z.literal('USER_ACTION'),
    payload: exports.UserActionPayloadSchema,
});
// Heartbeat payload schema
exports.HeartbeatPayloadSchema = zod_1.z.object({
    clientVersion: zod_1.z.string().min(1),
    platform: zod_1.z.string().min(1),
    connectionQuality: exports.ConnectionQualitySchema,
    localStateHash: zod_1.z.string(),
    capabilities: zod_1.z.array(zod_1.z.string()),
    uptime: zod_1.z.number().nonnegative(),
});
// Heartbeat event schema
exports.HeartbeatEventSchema = exports.BaseEventSchema.extend({
    eventType: zod_1.z.literal('HEARTBEAT'),
    payload: exports.HeartbeatPayloadSchema,
});
// Browser activity payload schema
exports.BrowserActivityPayloadSchema = zod_1.z.object({
    url: zod_1.z.string().url(),
    title: zod_1.z.string(),
    domain: zod_1.z.string(),
    startTime: zod_1.z.number().int().positive(),
    endTime: zod_1.z.number().int().positive(),
    duration: zod_1.z.number().nonnegative(),
    activeDuration: zod_1.z.number().nonnegative(),
    idleTime: zod_1.z.number().nonnegative(),
    category: exports.ActivityCategorySchema,
    productivityScore: zod_1.z.number().min(0).max(100),
    scrollDepth: zod_1.z.number().min(0).max(100),
    interactionCount: zod_1.z.number().int().nonnegative(),
    isMediaPlaying: zod_1.z.boolean(),
    mediaPlayDuration: zod_1.z.number().nonnegative(),
    referrer: zod_1.z.string().optional(),
    navigationType: exports.NavigationTypeSchema,
    searchQuery: zod_1.z.string().optional(),
    searchEngine: exports.SearchEngineSchema.optional(),
});
// Browser activity event schema
exports.BrowserActivityEventSchema = exports.BaseEventSchema.extend({
    eventType: zod_1.z.literal('BROWSER_ACTIVITY'),
    payload: exports.BrowserActivityPayloadSchema,
});
// Domain breakdown entry schema
exports.DomainBreakdownEntrySchema = zod_1.z.object({
    domain: zod_1.z.string(),
    duration: zod_1.z.number().nonnegative(),
    activeDuration: zod_1.z.number().nonnegative(),
    category: exports.ActivityCategorySchema,
    visitCount: zod_1.z.number().int().positive(),
});
// Browser session payload schema
exports.BrowserSessionPayloadSchema = zod_1.z.object({
    sessionId: zod_1.z.string().min(1),
    startTime: zod_1.z.number().int().positive(),
    endTime: zod_1.z.number().int().positive(),
    totalDuration: zod_1.z.number().nonnegative(),
    activeDuration: zod_1.z.number().nonnegative(),
    domainBreakdown: zod_1.z.array(exports.DomainBreakdownEntrySchema),
    tabSwitchCount: zod_1.z.number().int().nonnegative(),
    rapidTabSwitches: zod_1.z.number().int().nonnegative(),
    uniqueDomainsVisited: zod_1.z.number().int().nonnegative(),
    productiveTime: zod_1.z.number().nonnegative(),
    distractingTime: zod_1.z.number().nonnegative(),
    neutralTime: zod_1.z.number().nonnegative(),
    productivityScore: zod_1.z.number().min(0).max(100),
});
// Browser session event schema
exports.BrowserSessionEventSchema = exports.BaseEventSchema.extend({
    eventType: zod_1.z.literal('BROWSER_SESSION'),
    payload: exports.BrowserSessionPayloadSchema,
});
// Tab switch payload schema
exports.TabSwitchPayloadSchema = zod_1.z.object({
    fromTabId: zod_1.z.number().int(),
    toTabId: zod_1.z.number().int(),
    fromUrl: zod_1.z.string(),
    toUrl: zod_1.z.string(),
    fromDomain: zod_1.z.string(),
    toDomain: zod_1.z.string(),
    timeSinceLastSwitch: zod_1.z.number().nonnegative(),
    isRapidSwitch: zod_1.z.boolean(),
});
// Tab switch event schema
exports.TabSwitchEventSchema = exports.BaseEventSchema.extend({
    eventType: zod_1.z.literal('TAB_SWITCH'),
    payload: exports.TabSwitchPayloadSchema,
});
// Browser focus payload schema
exports.BrowserFocusPayloadSchema = zod_1.z.object({
    isFocused: zod_1.z.boolean(),
    previousState: exports.BrowserFocusStateSchema,
    focusDuration: zod_1.z.number().nonnegative().optional(),
});
// Browser focus event schema
exports.BrowserFocusEventSchema = exports.BaseEventSchema.extend({
    eventType: zod_1.z.literal('BROWSER_FOCUS'),
    payload: exports.BrowserFocusPayloadSchema,
});
// Entertainment mode payload schema
// Requirements: 8.6, 10.3, 12.1, 12.2
exports.EntertainmentModePayloadSchema = zod_1.z.object({
    action: zod_1.z.enum(['start', 'stop']),
    sessionId: zod_1.z.string().min(1),
    timestamp: zod_1.z.number().int().positive(),
    quotaUsedBefore: zod_1.z.number().nonnegative(),
    quotaUsedAfter: zod_1.z.number().nonnegative().optional(),
    duration: zod_1.z.number().nonnegative().optional(),
    sitesVisited: zod_1.z.array(zod_1.z.string()).optional(),
    reason: exports.EntertainmentStopReasonSchema.optional(),
});
// Entertainment mode event schema
// Requirements: 8.6, 10.3, 12.1, 12.2
exports.EntertainmentModeEventSchema = exports.BaseEventSchema.extend({
    eventType: zod_1.z.literal('ENTERTAINMENT_MODE'),
    payload: exports.EntertainmentModePayloadSchema,
});
// Work start payload schema
// Requirements: 14.1, 14.2, 14.9, 14.10
exports.WorkStartPayloadSchema = zod_1.z.object({
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD'),
    configuredStartTime: zod_1.z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format. Use HH:mm'),
    actualStartTime: zod_1.z.number().int().positive(),
    delayMinutes: zod_1.z.number().int().nonnegative(),
    trigger: zod_1.z.enum(['first_pomodoro', 'airlock_complete']),
});
// Work start event schema
// Requirements: 14.1, 14.2, 14.9, 14.10
exports.WorkStartEventSchema = exports.BaseEventSchema.extend({
    eventType: zod_1.z.literal('WORK_START'),
    payload: exports.WorkStartPayloadSchema,
});
// ---- AI Chat Event Schemas ----
exports.ChatAttachmentSchema = zod_1.z.object({
    type: zod_1.z.enum(['task', 'project', 'goal', 'pomodoro']),
    id: zod_1.z.string(),
    title: zod_1.z.string(),
});
exports.ChatMessagePayloadSchema = zod_1.z.object({
    conversationId: zod_1.z.string(),
    messageId: zod_1.z.string(),
    content: zod_1.z.string(),
    attachments: zod_1.z.array(exports.ChatAttachmentSchema).optional(),
});
exports.ChatMessageEventSchema = exports.BaseEventSchema.extend({
    eventType: zod_1.z.literal('CHAT_MESSAGE'),
    payload: exports.ChatMessagePayloadSchema,
});
exports.ChatActionPayloadSchema = zod_1.z.object({
    conversationId: zod_1.z.string(),
    toolCallId: zod_1.z.string(),
    action: zod_1.z.enum(['confirm', 'cancel']),
});
exports.ChatActionEventSchema = exports.BaseEventSchema.extend({
    eventType: zod_1.z.literal('CHAT_ACTION'),
    payload: exports.ChatActionPayloadSchema,
});
exports.ChatHistoryRequestEventSchema = exports.BaseEventSchema.extend({
    eventType: zod_1.z.literal('CHAT_HISTORY_REQUEST'),
    payload: zod_1.z.object({}).passthrough(),
});
// Union schema for all events
exports.OctopusEventSchema = zod_1.z.discriminatedUnion('eventType', [
    exports.ActivityLogEventSchema,
    exports.StateChangeEventSchema,
    exports.UserActionEventSchema,
    exports.HeartbeatEventSchema,
    exports.BrowserActivityEventSchema,
    exports.BrowserSessionEventSchema,
    exports.TabSwitchEventSchema,
    exports.BrowserFocusEventSchema,
    exports.EntertainmentModeEventSchema,
    exports.WorkStartEventSchema,
    exports.ChatMessageEventSchema,
    exports.ChatActionEventSchema,
    exports.ChatHistoryRequestEventSchema,
]);
// =============================================================================
// COMMAND SCHEMAS
// =============================================================================
// Base command schema
exports.BaseCommandSchema = zod_1.z.object({
    commandId: zod_1.z.string().uuid(),
    commandType: exports.CommandTypeSchema,
    targetClient: zod_1.z.union([exports.ClientTypeSchema, zod_1.z.literal('all')]),
    priority: exports.CommandPrioritySchema,
    requiresAck: zod_1.z.boolean(),
    expiryTime: zod_1.z.number().int().positive().optional(),
    createdAt: zod_1.z.number().int().positive(),
});
// System state schema
exports.SystemStateSchema = zod_1.z.object({
    state: zod_1.z.string(),
    timeContext: zod_1.z.string().optional(),
    dailyCapReached: zod_1.z.boolean(),
    skipTokensRemaining: zod_1.z.number().int().nonnegative(),
});
// Daily state schema
exports.DailyStateSchema = zod_1.z.object({
    date: zod_1.z.string(),
    completedPomodoros: zod_1.z.number().int().nonnegative(),
    totalFocusMinutes: zod_1.z.number().nonnegative(),
    top3TaskIds: zod_1.z.array(zod_1.z.string()),
});
// Pomodoro state schema
exports.PomodoroStateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    taskId: zod_1.z.string().nullable(),
    taskTitle: zod_1.z.string().nullable().optional(),
    startTime: zod_1.z.number().int().positive(),
    duration: zod_1.z.number().positive(),
    status: zod_1.z.enum(['active', 'paused', 'completed', 'aborted']),
});
// Task state schema
exports.TaskStateSchema = zod_1.z.object({
    id: zod_1.z.string(),
    title: zod_1.z.string(),
    status: zod_1.z.string(),
    priority: zod_1.z.string(),
});
// User settings state schema
exports.UserSettingsStateSchema = zod_1.z.object({
    pomodoroDuration: zod_1.z.number().positive(),
    shortBreakDuration: zod_1.z.number().positive(),
    longBreakDuration: zod_1.z.number().positive(),
    dailyCap: zod_1.z.number().int().positive(),
    enforcementMode: zod_1.z.enum(['strict', 'gentle']),
});
// Full state schema
exports.FullStateSchema = zod_1.z.object({
    systemState: exports.SystemStateSchema,
    dailyState: exports.DailyStateSchema,
    activePomodoro: exports.PomodoroStateSchema.nullable(),
    top3Tasks: zod_1.z.array(exports.TaskStateSchema),
    settings: exports.UserSettingsStateSchema,
});
// Sync state payload schema (full sync only -- delta sync deferred for future optimization)
exports.SyncStatePayloadSchema = zod_1.z.object({
    syncType: zod_1.z.literal('full'),
    version: zod_1.z.number().int().positive(),
    state: exports.FullStateSchema.optional(),
});
// Sync state command schema
exports.SyncStateCommandSchema = exports.BaseCommandSchema.extend({
    commandType: zod_1.z.literal('SYNC_STATE'),
    payload: exports.SyncStatePayloadSchema,
});
// Execute action payload schema
exports.ExecuteActionPayloadSchema = zod_1.z.object({
    action: exports.ActionTypeSchema,
    parameters: zod_1.z.record(zod_1.z.unknown()),
    timeout: zod_1.z.number().positive().optional(),
    fallbackAction: exports.ActionTypeSchema.optional(),
});
// Execute action command schema
exports.ExecuteActionCommandSchema = exports.BaseCommandSchema.extend({
    commandType: zod_1.z.literal('EXECUTE_ACTION'),
    payload: exports.ExecuteActionPayloadSchema,
});
// =============================================================================
// POLICY SCHEMAS
// =============================================================================
// Time slot schema
exports.TimeSlotSchema = zod_1.z.object({
    dayOfWeek: zod_1.z.number().int().min(0).max(6),
    startHour: zod_1.z.number().int().min(0).max(23),
    startMinute: zod_1.z.number().int().min(0).max(59),
    endHour: zod_1.z.number().int().min(0).max(23),
    endMinute: zod_1.z.number().int().min(0).max(59),
});
// Skip token config schema (config portion only — remaining is in PolicyState)
exports.SkipTokenConfigSchema = zod_1.z.object({
    maxPerDay: zod_1.z.number().int().positive(),
    delayMinutes: zod_1.z.number().positive(),
});
// Distraction app schema
exports.DistractionAppSchema = zod_1.z.object({
    bundleId: zod_1.z.string().min(1),
    name: zod_1.z.string().min(1),
    action: zod_1.z.enum(['force_quit', 'hide_window']),
});
// Ad-hoc focus session schema
// Requirements: 2.3, 13.1, 13.2
exports.AdhocFocusSessionSchema = zod_1.z.object({
    active: zod_1.z.boolean(),
    endTime: zod_1.z.number().int().positive(),
    overridesSleepTime: zod_1.z.boolean().optional(),
    overridesWorkHours: zod_1.z.boolean().optional(),
});
// Sleep enforcement app schema for policy
exports.SleepEnforcementAppPolicySchema = zod_1.z.object({
    bundleId: zod_1.z.string().min(1),
    name: zod_1.z.string().min(1),
});
// --- Config sub-schemas ---
// Sleep time config schema (config portion — schedule and enforcement apps)
exports.SleepTimeConfigSchema = zod_1.z.object({
    enabled: zod_1.z.boolean(),
    startTime: zod_1.z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format. Use HH:mm'),
    endTime: zod_1.z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format. Use HH:mm'),
    enforcementApps: zod_1.z.array(exports.SleepEnforcementAppPolicySchema),
});
// REST enforcement config schema (config portion — apps, actions, grace duration)
exports.RestEnforcementConfigSchema = zod_1.z.object({
    workApps: zod_1.z.array(exports.SleepEnforcementAppPolicySchema),
    actions: zod_1.z.array(zod_1.z.string()),
    graceDurationMinutes: zod_1.z.number().int().positive(),
});
// PolicyConfig schema — user settings, low-frequency change
exports.PolicyConfigSchema = zod_1.z.object({
    version: zod_1.z.number().int().positive(),
    updatedAt: zod_1.z.number().int().positive(),
    blacklist: zod_1.z.array(zod_1.z.string()),
    whitelist: zod_1.z.array(zod_1.z.string()),
    enforcementMode: zod_1.z.enum(['strict', 'gentle']),
    workTimeSlots: zod_1.z.array(exports.TimeSlotSchema),
    skipTokens: exports.SkipTokenConfigSchema,
    distractionApps: zod_1.z.array(exports.DistractionAppSchema),
    sleepTime: exports.SleepTimeConfigSchema.optional(),
    overRestEnforcementApps: zod_1.z.array(exports.DistractionAppSchema).optional(),
    restEnforcement: exports.RestEnforcementConfigSchema.optional(),
});
// --- State sub-schemas ---
// Health limit notification schema
exports.HealthLimitSchema = zod_1.z.object({
    type: zod_1.z.enum(['2hours', 'daily']),
    message: zod_1.z.string(),
    repeating: zod_1.z.boolean().optional(),
    intervalMinutes: zod_1.z.number().int().positive().optional(),
});
// Temporary unblock schema
exports.TemporaryUnblockSchema = zod_1.z.object({
    active: zod_1.z.boolean(),
    endTime: zod_1.z.number().int().positive(),
});
// PolicyState schema — runtime computed values, changes with state transitions
exports.PolicyStateSchema = zod_1.z.object({
    skipTokensRemaining: zod_1.z.number().int().nonnegative(),
    isSleepTimeActive: zod_1.z.boolean(),
    isSleepSnoozed: zod_1.z.boolean(),
    sleepSnoozeEndTime: zod_1.z.number().int().positive().optional(),
    isOverRest: zod_1.z.boolean(),
    overRestMinutes: zod_1.z.number().int().nonnegative(),
    overRestBringToFront: zod_1.z.boolean(),
    isRestEnforcementActive: zod_1.z.boolean(),
    restGrace: zod_1.z.object({
        available: zod_1.z.boolean(),
        remaining: zod_1.z.number().int().nonnegative(),
    }).optional(),
    adhocFocusSession: exports.AdhocFocusSessionSchema.optional(),
    temporaryUnblock: exports.TemporaryUnblockSchema.optional(),
    healthLimit: exports.HealthLimitSchema.optional(),
});
// Policy schema — Config + State combined
exports.PolicySchema = zod_1.z.object({
    config: exports.PolicyConfigSchema,
    state: exports.PolicyStateSchema,
});
// --- Legacy flat schemas (deprecated, kept for property tests transition) ---
/** @deprecated Use SleepTimeConfigSchema + PolicyStateSchema */
exports.SleepTimePolicySchema = zod_1.z.object({
    enabled: zod_1.z.boolean(),
    startTime: zod_1.z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format. Use HH:mm'),
    endTime: zod_1.z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format. Use HH:mm'),
    enforcementApps: zod_1.z.array(exports.SleepEnforcementAppPolicySchema),
    isCurrentlyActive: zod_1.z.boolean(),
    isSnoozed: zod_1.z.boolean(),
    snoozeEndTime: zod_1.z.number().int().positive().optional(),
});
/** @deprecated Use PolicyStateSchema.isOverRest + related fields */
exports.OverRestPolicySchema = zod_1.z.object({
    isOverRest: zod_1.z.boolean(),
    overRestMinutes: zod_1.z.number().int().nonnegative(),
    enforcementApps: zod_1.z.array(exports.SleepEnforcementAppPolicySchema),
    bringToFront: zod_1.z.boolean(),
});
/** @deprecated Use TemporaryUnblockSchema */
exports.TemporaryUnblockPolicySchema = zod_1.z.object({
    active: zod_1.z.boolean(),
    endTime: zod_1.z.number().int().positive(),
});
/** @deprecated Use RestEnforcementConfigSchema + PolicyStateSchema */
exports.RestEnforcementPolicySchema = zod_1.z.object({
    isActive: zod_1.z.boolean(),
    workApps: zod_1.z.array(exports.SleepEnforcementAppPolicySchema),
    actions: zod_1.z.array(zod_1.z.string()),
    grace: zod_1.z.object({
        available: zod_1.z.boolean(),
        remaining: zod_1.z.number().int().nonnegative(),
        durationMinutes: zod_1.z.number().int().positive(),
    }),
});
/** @deprecated Dead field — never populated by server */
exports.WorkTimePolicySchema = zod_1.z.object({
    enabled: zod_1.z.boolean(),
    isCurrentlyActive: zod_1.z.boolean(),
    isInRestPeriod: zod_1.z.boolean(),
    slots: zod_1.z.array(zod_1.z.object({
        startTime: zod_1.z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
        endTime: zod_1.z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    })),
});
// Update policy payload schema
exports.UpdatePolicyPayloadSchema = zod_1.z.object({
    policyType: zod_1.z.enum(['full', 'partial']),
    policy: exports.PolicySchema,
    effectiveTime: zod_1.z.number().int().positive(),
});
// Update policy command schema
exports.UpdatePolicyCommandSchema = exports.BaseCommandSchema.extend({
    commandType: zod_1.z.literal('UPDATE_POLICY'),
    payload: exports.UpdatePolicyPayloadSchema,
});
// Show UI payload schema
exports.ShowUIPayloadSchema = zod_1.z.object({
    uiType: exports.UITypeSchema,
    content: zod_1.z.record(zod_1.z.unknown()),
    duration: zod_1.z.number().positive().optional(),
    dismissible: zod_1.z.boolean(),
});
// Show UI command schema
exports.ShowUICommandSchema = exports.BaseCommandSchema.extend({
    commandType: zod_1.z.literal('SHOW_UI'),
    payload: exports.ShowUIPayloadSchema,
});
// Action result payload schema
exports.ActionResultPayloadSchema = zod_1.z.object({
    optimisticId: zod_1.z.string(),
    success: zod_1.z.boolean(),
    error: zod_1.z.object({ code: zod_1.z.string(), message: zod_1.z.string() }).optional(),
    data: zod_1.z.record(zod_1.z.unknown()).optional(),
});
// Action result command schema
exports.ActionResultCommandSchema = exports.BaseCommandSchema.extend({
    commandType: zod_1.z.literal('ACTION_RESULT'),
    payload: exports.ActionResultPayloadSchema,
});
// ---- AI Chat Command Schemas ----
exports.ChatResponsePayloadSchema = zod_1.z.object({
    conversationId: zod_1.z.string(),
    messageId: zod_1.z.string(),
    type: zod_1.z.enum(['delta', 'complete']),
    content: zod_1.z.string(),
    usage: zod_1.z.object({
        inputTokens: zod_1.z.number(),
        outputTokens: zod_1.z.number(),
    }).optional(),
    isProactive: zod_1.z.boolean().optional(),
    triggerId: zod_1.z.string().optional(),
});
exports.ChatResponseCommandSchema = exports.BaseCommandSchema.extend({
    commandType: zod_1.z.literal('CHAT_RESPONSE'),
    payload: exports.ChatResponsePayloadSchema,
});
exports.ChatToolCallPayloadSchema = zod_1.z.object({
    conversationId: zod_1.z.string(),
    messageId: zod_1.z.string(),
    toolCallId: zod_1.z.string(),
    toolName: zod_1.z.string(),
    description: zod_1.z.string(),
    parameters: zod_1.z.record(zod_1.z.unknown()),
    requiresConfirmation: zod_1.z.boolean(),
});
exports.ChatToolCallCommandSchema = exports.BaseCommandSchema.extend({
    commandType: zod_1.z.literal('CHAT_TOOL_CALL'),
    payload: exports.ChatToolCallPayloadSchema,
});
exports.ChatToolResultPayloadSchema = zod_1.z.object({
    conversationId: zod_1.z.string(),
    messageId: zod_1.z.string(),
    toolCallId: zod_1.z.string(),
    success: zod_1.z.boolean(),
    summary: zod_1.z.string(),
});
exports.ChatToolResultCommandSchema = exports.BaseCommandSchema.extend({
    commandType: zod_1.z.literal('CHAT_TOOL_RESULT'),
    payload: exports.ChatToolResultPayloadSchema,
});
exports.ChatSyncPayloadSchema = zod_1.z.object({
    conversationId: zod_1.z.string(),
    messages: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string(),
        role: zod_1.z.string(),
        content: zod_1.z.string(),
        metadata: zod_1.z.record(zod_1.z.unknown()).optional(),
        createdAt: zod_1.z.string(),
    })),
});
exports.ChatSyncCommandSchema = exports.BaseCommandSchema.extend({
    commandType: zod_1.z.literal('CHAT_SYNC'),
    payload: exports.ChatSyncPayloadSchema,
});
// Union schema for all commands
exports.OctopusCommandSchema = zod_1.z.discriminatedUnion('commandType', [
    exports.SyncStateCommandSchema,
    exports.ExecuteActionCommandSchema,
    exports.UpdatePolicyCommandSchema,
    exports.ShowUICommandSchema,
    exports.ActionResultCommandSchema,
    exports.ChatResponseCommandSchema,
    exports.ChatToolCallCommandSchema,
    exports.ChatToolResultCommandSchema,
    exports.ChatSyncCommandSchema,
]);
//# sourceMappingURL=schemas.js.map