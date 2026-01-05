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
  | 'WORK_START';

export type ClientType = 'web' | 'desktop' | 'browser_ext' | 'mobile';

export type CommandType =
  | 'SYNC_STATE'
  | 'EXECUTE_ACTION'
  | 'UPDATE_POLICY'
  | 'SHOW_UI';

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
  taskId: string;
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

export interface Policy {
  version: number;
  blacklist: string[];
  whitelist: string[];
  enforcementMode: EnforcementMode;
  workTimeSlots: TimeSlot[];
  skipTokens: SkipTokenConfig;
  distractionApps: DistractionApp[];
  updatedAt: number;
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

export type OctopusEvent = HeartbeatEvent;

export type OctopusCommand = SyncStateCommand | UpdatePolicyCommand;
