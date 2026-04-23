/**
 * Octopus Architecture - Enum Type Definitions
 *
 * String union types and constants used across the protocol.
 */
/** Current protocol version — bump when breaking changes are made */
export declare const PROTOCOL_VERSION = "1.0.0";
/**
 * Event types for Event Stream (Tentacle -> Vibe Brain)
 */
export type EventType = 'ACTIVITY_LOG' | 'STATE_CHANGE' | 'USER_ACTION' | 'HEARTBEAT' | 'TIMELINE_EVENT' | 'BLOCK_EVENT' | 'INTERRUPTION_EVENT' | 'BROWSER_ACTIVITY' | 'BROWSER_SESSION' | 'TAB_SWITCH' | 'BROWSER_FOCUS' | 'ENTERTAINMENT_MODE' | 'WORK_START' | 'CHAT_MESSAGE' | 'CHAT_ACTION' | 'CHAT_HISTORY_REQUEST' | 'DESKTOP_APP_USAGE' | 'DESKTOP_IDLE' | 'DESKTOP_WINDOW_CHANGE';
/**
 * Client types for identifying the source/target of events and commands
 */
export type ClientType = 'web' | 'desktop' | 'browser_ext' | 'mobile' | 'api';
/**
 * Command types for Command Stream (Vibe Brain -> Tentacle)
 */
export type CommandType = 'SYNC_STATE' | 'EXECUTE_ACTION' | 'UPDATE_POLICY' | 'SHOW_UI' | 'ACTION_RESULT' | 'DATA_CHANGE' | 'CHAT_RESPONSE' | 'CHAT_TOOL_CALL' | 'CHAT_TOOL_RESULT' | 'CHAT_SYNC';
/**
 * Entity types for DATA_CHANGE notifications.
 * Tells clients which data category changed so they can refetch.
 */
export type DataChangeEntity = 'task' | 'project' | 'goal' | 'settings' | 'dailyState' | 'habit';
/**
 * Action types for DATA_CHANGE notifications.
 */
export type DataChangeAction = 'create' | 'update' | 'delete' | 'batch';
/**
 * Action types that can be executed by clients
 */
export type ActionType = 'CLOSE_APP' | 'HIDE_APP' | 'BRING_TO_FRONT' | 'SHOW_NOTIFICATION' | 'CLOSE_TAB' | 'REDIRECT_TAB' | 'INJECT_OVERLAY' | 'ADD_SESSION_WHITELIST' | 'SEND_PUSH' | 'PLAY_SOUND' | 'VIBRATE';
/**
 * Activity categories for productivity tracking
 */
export type ActivityCategory = 'productive' | 'neutral' | 'distracting';
/**
 * Activity source types
 */
export type ActivitySource = 'browser' | 'desktop_app' | 'mobile_app';
/**
 * Connection quality levels
 */
export type ConnectionQuality = 'good' | 'degraded' | 'poor';
/**
 * Navigation types for browser activity
 */
export type NavigationType = 'link' | 'typed' | 'reload' | 'back_forward' | 'other';
/**
 * Search engine types
 */
export type SearchEngine = 'google' | 'bing' | 'duckduckgo' | 'other';
/**
 * Browser focus states
 */
export type BrowserFocusState = 'focused' | 'blurred' | 'unknown';
/**
 * Interaction types for user engagement tracking
 */
export type InteractionType = 'click' | 'input' | 'scroll' | 'keypress' | 'video_play' | 'video_pause';
/**
 * Command priority levels
 */
export type CommandPriority = 'low' | 'normal' | 'high' | 'critical';
/**
 * Enforcement mode for policy
 */
export type EnforcementMode = 'strict' | 'gentle';
/**
 * Entertainment mode stop reason
 */
export type EntertainmentStopReason = 'manual' | 'quota_exhausted' | 'work_time_start';
/**
 * UI types for show UI command
 */
export type UIType = 'notification' | 'modal' | 'overlay' | 'toast';
/**
 * Client status
 */
export type ClientStatus = 'online' | 'offline';
/**
 * Command queue status
 */
export type CommandQueueStatus = 'pending' | 'delivered' | 'acknowledged' | 'expired';
/**
 * Error codes for protocol errors
 */
export type ErrorCode = 'VALIDATION_ERROR' | 'AUTH_ERROR' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'RATE_LIMITED' | 'INTERNAL_ERROR';
/**
 * User action types (iOS -> Vibe Brain)
 */
export type UserActionType = 'TASK_COMPLETE' | 'TASK_STATUS_CHANGE' | 'TASK_CREATE' | 'TASK_UPDATE' | 'TASK_GET_TODAY' | 'TASK_GET_OVERDUE' | 'POMODORO_START' | 'POMODORO_SWITCH_TASK' | 'TOP3_SET' | 'POLICY_UPDATE' | 'SLEEP_TIME_UPDATE' | 'HABIT_GET_TODAY' | 'HABIT_LIST' | 'HABIT_CREATE' | 'HABIT_UPDATE' | 'HABIT_DELETE' | 'HABIT_RECORD_ENTRY' | 'HABIT_DELETE_ENTRY';
//# sourceMappingURL=enums.d.ts.map