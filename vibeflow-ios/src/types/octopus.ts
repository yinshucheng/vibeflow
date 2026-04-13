/**
 * Octopus Architecture Types for iOS App
 * 
 * Subset of types from the main project's octopus.ts
 * Used for communication between iOS Tentacle and Vibe Brain
 */

// =============================================================================
// ENUMS
// =============================================================================

export type EventType =
  | 'ACTIVITY_LOG'
  | 'STATE_CHANGE'
  | 'USER_ACTION'
  | 'HEARTBEAT'
  | 'TIMELINE_EVENT'
  | 'BLOCK_EVENT'
  | 'INTERRUPTION_EVENT'
  | 'BROWSER_ACTIVITY'
  | 'BROWSER_SESSION'
  | 'TAB_SWITCH'
  | 'BROWSER_FOCUS'
  | 'ENTERTAINMENT_MODE'
  | 'WORK_START'
  | 'CHAT_MESSAGE'
  | 'CHAT_ACTION'
  | 'CHAT_HISTORY_REQUEST';

export type ClientType = 'web' | 'desktop' | 'browser_ext' | 'mobile';

export type CommandType =
  | 'SYNC_STATE'
  | 'EXECUTE_ACTION'
  | 'UPDATE_POLICY'
  | 'SHOW_UI'
  | 'ACTION_RESULT'
  | 'CHAT_RESPONSE'
  | 'CHAT_TOOL_CALL'
  | 'CHAT_TOOL_RESULT'
  | 'CHAT_SYNC';

export type ActionType =
  | 'CLOSE_APP'
  | 'HIDE_APP'
  | 'BRING_TO_FRONT'
  | 'SHOW_NOTIFICATION'
  | 'CLOSE_TAB'
  | 'REDIRECT_TAB'
  | 'INJECT_OVERLAY'
  | 'ADD_SESSION_WHITELIST'
  | 'SEND_PUSH'
  | 'PLAY_SOUND'
  | 'VIBRATE';

export type ActivityCategory = 'productive' | 'neutral' | 'distracting';
export type ConnectionQuality = 'good' | 'degraded' | 'poor';
export type CommandPriority = 'low' | 'normal' | 'high' | 'critical';
export type EnforcementMode = 'strict' | 'gentle';

// =============================================================================
// EVENT STREAM TYPES (Tentacle → Vibe Brain)
// =============================================================================

export interface BaseEvent {
  eventId: string;
  eventType: EventType;
  userId: string;
  clientId: string;
  clientType: ClientType;
  timestamp: number;
  sequenceNumber: number;
}

export interface HeartbeatPayload {
  clientVersion: string;
  platform: string;
  connectionQuality: ConnectionQuality;
  localStateHash: string;
  capabilities: string[];
  uptime: number;
}

export interface HeartbeatEvent extends BaseEvent {
  eventType: 'HEARTBEAT';
  payload: HeartbeatPayload;
}

// =============================================================================
// COMMAND STREAM TYPES (Vibe Brain → Tentacle)
// =============================================================================

export interface BaseCommand {
  commandId: string;
  commandType: CommandType;
  targetClient: ClientType | 'all';
  priority: CommandPriority;
  requiresAck: boolean;
  expiryTime?: number;
  createdAt: number;
}

export interface SystemState {
  state: string;
  dailyCapReached: boolean;
  skipTokensRemaining: number;
}

export interface DailyState {
  date: string;
  completedPomodoros: number;
  totalFocusMinutes: number;
  top3TaskIds: string[];
}

export interface PomodoroState {
  id: string;
  taskId: string | null;
  taskTitle?: string | null;
  startTime: number;
  duration: number;
  status: 'active' | 'paused' | 'completed' | 'aborted';
}

export interface TaskState {
  id: string;
  title: string;
  status: string;
  priority: string;
}

export interface UserSettingsState {
  pomodoroDuration: number;
  shortBreakDuration: number;
  longBreakDuration: number;
  dailyCap: number;
  enforcementMode: EnforcementMode;
}

export interface FullState {
  systemState: SystemState;
  dailyState: DailyState;
  activePomodoro: PomodoroState | null;
  top3Tasks: TaskState[];
  settings: UserSettingsState;
}

export interface StateDeltaChange {
  path: string;
  operation: 'set' | 'delete';
  value?: unknown;
}

export interface StateDelta {
  changes: StateDeltaChange[];
}

export interface SyncStatePayload {
  syncType: 'full' | 'delta';
  version: number;
  state?: FullState;
  delta?: StateDelta;
}

export interface SyncStateCommand extends BaseCommand {
  commandType: 'SYNC_STATE';
  payload: SyncStatePayload;
}

// =============================================================================
// POLICY TYPES
// =============================================================================

export interface DistractionApp {
  bundleId: string;
  name: string;
  action: 'force_quit' | 'hide_window';
}

export interface TimeSlot {
  dayOfWeek: number;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

export interface SkipTokenConfig {
  remaining: number;
  maxPerDay: number;
  delayMinutes: number;
}

export interface SleepEnforcementAppPolicy {
  bundleId: string;
  name: string;
}

export interface SleepTimePolicy {
  enabled: boolean;
  startTime: string;
  endTime: string;
  enforcementApps: SleepEnforcementAppPolicy[];
  isCurrentlyActive: boolean;
  isSnoozed: boolean;
  snoozeEndTime?: number;
}

export interface OverRestPolicy {
  isOverRest: boolean;
  overRestMinutes: number;
  enforcementApps: SleepEnforcementAppPolicy[];
  bringToFront: boolean;
}

export interface AdhocFocusSession {
  active: boolean;
  endTime: number;
  overridesSleepTime?: boolean;
}

export interface WorkTimePolicy {
  enabled: boolean;
  isCurrentlyActive: boolean;
  isInRestPeriod: boolean;
  slots: { startTime: string; endTime: string }[];
}

export interface Policy {
  version: number;
  blacklist: string[];
  whitelist: string[];
  enforcementMode: EnforcementMode;
  workTimeSlots: TimeSlot[];
  skipTokens: SkipTokenConfig;
  distractionApps: DistractionApp[];
  updatedAt: number;
  sleepTime?: SleepTimePolicy;
  overRest?: OverRestPolicy;
  adhocFocusSession?: AdhocFocusSession;
  temporaryUnblock?: {
    active: boolean;
    endTime: number;
  };
  workTime?: WorkTimePolicy;
}

export interface UpdatePolicyPayload {
  policyType: 'full' | 'partial';
  policy: Policy;
  effectiveTime: number;
}

export interface UpdatePolicyCommand extends BaseCommand {
  commandType: 'UPDATE_POLICY';
  payload: UpdatePolicyPayload;
}

// =============================================================================
// UNION TYPES
// =============================================================================

// =============================================================================
// USER ACTION TYPES (iOS → Vibe Brain)
// =============================================================================

export type UserActionType =
  | 'TASK_COMPLETE'
  | 'TASK_STATUS_CHANGE'
  | 'TASK_CREATE'
  | 'TASK_UPDATE'
  | 'POMODORO_START'
  | 'POMODORO_SWITCH_TASK'
  | 'TOP3_SET'
  | 'POLICY_UPDATE'
  | 'SLEEP_TIME_UPDATE'
  | 'HABIT_GET_TODAY'
  | 'HABIT_LIST'
  | 'HABIT_CREATE'
  | 'HABIT_UPDATE'
  | 'HABIT_DELETE'
  | 'HABIT_RECORD_ENTRY'
  | 'HABIT_DELETE_ENTRY';

export interface UserActionPayload {
  actionType: UserActionType;
  optimisticId: string;
  data: Record<string, unknown>;
}

export interface UserActionEvent extends BaseEvent {
  eventType: 'USER_ACTION';
  payload: UserActionPayload;
}

// =============================================================================
// ACTION RESULT TYPES (Vibe Brain → iOS)
// =============================================================================

export interface ActionResultPayload {
  optimisticId: string;
  success: boolean;
  error?: { code: string; message: string };
  data?: Record<string, unknown>;
}

export interface ActionResultCommand extends BaseCommand {
  commandType: 'ACTION_RESULT';
  payload: ActionResultPayload;
}

// =============================================================================
// UNION TYPES
// =============================================================================

// =============================================================================
// CHAT EVENT TYPES (iOS → Vibe Brain)
// =============================================================================

import type {
  ChatMessagePayload,
  ChatActionPayload,
  ChatResponsePayload,
  ChatToolCallPayload,
  ChatToolResultPayload,
  ChatSyncPayload,
} from './chat';

export interface ChatMessageEvent extends BaseEvent {
  eventType: 'CHAT_MESSAGE';
  payload: ChatMessagePayload;
}

export interface ChatActionEvent extends BaseEvent {
  eventType: 'CHAT_ACTION';
  payload: ChatActionPayload;
}

export interface ChatHistoryRequestEvent extends BaseEvent {
  eventType: 'CHAT_HISTORY_REQUEST';
  payload: Record<string, never>;
}

// =============================================================================
// CHAT COMMAND TYPES (Vibe Brain → iOS)
// =============================================================================

export interface ChatResponseCommand extends BaseCommand {
  commandType: 'CHAT_RESPONSE';
  payload: ChatResponsePayload;
}

export interface ChatToolCallCommand extends BaseCommand {
  commandType: 'CHAT_TOOL_CALL';
  payload: ChatToolCallPayload;
}

export interface ChatToolResultCommand extends BaseCommand {
  commandType: 'CHAT_TOOL_RESULT';
  payload: ChatToolResultPayload;
}

export interface ChatSyncCommand extends BaseCommand {
  commandType: 'CHAT_SYNC';
  payload: ChatSyncPayload;
}

// =============================================================================
// UNION TYPES
// =============================================================================

export type OctopusEvent = HeartbeatEvent | UserActionEvent | ChatMessageEvent | ChatActionEvent | ChatHistoryRequestEvent;

export type OctopusCommand =
  | SyncStateCommand
  | UpdatePolicyCommand
  | ActionResultCommand
  | ChatResponseCommand
  | ChatToolCallCommand
  | ChatToolResultCommand
  | ChatSyncCommand;
