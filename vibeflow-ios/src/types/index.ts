/**
 * iOS App Type Definitions
 *
 * Re-exports shared protocol types from @vibeflow/octopus-protocol
 * and defines iOS-specific types.
 */

// =============================================================================
// SHARED PROTOCOL TYPES (from @vibeflow/octopus-protocol)
// =============================================================================

// Enums
export type {
  EventType,
  ClientType,
  CommandType,
  ActionType,
  ActivityCategory,
  ConnectionQuality,
  CommandPriority,
  EnforcementMode,
  UserActionType,
} from '@vibeflow/octopus-protocol';

// Event stream types (Tentacle -> Vibe Brain)
export type {
  BaseEvent,
  HeartbeatPayload,
  HeartbeatEvent,
} from '@vibeflow/octopus-protocol';

// Command stream types (Vibe Brain -> Tentacle)
export type {
  BaseCommand,
  UpdatePolicyPayload,
  UpdatePolicyCommand,
} from '@vibeflow/octopus-protocol';

// State types
export type {
  SystemState,
  DailyState,
  PomodoroState,
  TaskState,
  UserSettingsState,
  FullState,
  SyncStatePayload,
  SyncStateCommand,
} from '@vibeflow/octopus-protocol';

// Policy types
export type {
  DistractionApp,
  TimeSlot,
  SkipTokenConfig,
  SleepEnforcementAppPolicy,
  SleepTimePolicy,
  OverRestPolicy,
  AdhocFocusSession,
  Policy,
} from '@vibeflow/octopus-protocol';

// Action result types (Vibe Brain -> iOS)
export type {
  ActionResultPayload,
  ActionResultCommand,
} from '@vibeflow/octopus-protocol';

// Mobile user action types (aliased to match iOS convention)
export type {
  MobileUserActionPayload as UserActionPayload,
  MobileUserActionEvent as UserActionEvent,
} from '@vibeflow/octopus-protocol';

// Chat protocol types
export type {
  ChatAttachment,
  ChatMessagePayload,
  ChatActionPayload,
  ChatResponsePayload,
  ChatToolCallPayload,
  ChatToolResultPayload,
} from '@vibeflow/octopus-protocol';

// Chat event/command types
export type {
  ChatMessageEvent,
  ChatActionEvent,
  ChatHistoryRequestEvent,
  ChatResponseCommand,
  ChatToolCallCommand,
  ChatToolResultCommand,
  ChatSyncCommand,
} from '@vibeflow/octopus-protocol';

// Union types
export type {
  OctopusEvent,
  OctopusCommand,
} from '@vibeflow/octopus-protocol';

// =============================================================================
// iOS-SPECIFIC CHAT TYPES (not in shared package)
// =============================================================================

export type ChatMessageRole = 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface PendingToolCall {
  toolCallId: string;
  toolName: string;
  description: string;
  parameters: Record<string, unknown>;
  requiresConfirmation: boolean;
  messageId: string;
  conversationId: string;
}

/**
 * ChatSyncPayload - iOS-specific override with typed ChatMessage[]
 * (shared package uses inline type with role: string, iOS needs ChatMessageRole)
 */
export interface ChatSyncPayload {
  conversationId: string;
  messages: ChatMessage[];
}

export type PanelHeight = 'half' | 'full';

// =============================================================================
// APP STATE TYPES
// =============================================================================

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

export interface DailyStateData {
  state: 'IDLE' | 'FOCUS' | 'OVER_REST';
  completedPomodoros: number;
  dailyCap: number;
  totalFocusMinutes: number;
}

export interface ActivePomodoroData {
  id: string;
  taskId: string | null;
  taskTitle: string;
  startTime: number;
  duration: number;
  status: 'active' | 'paused';
}

export interface TaskData {
  id: string;
  title: string;
  priority: 'P1' | 'P2' | 'P3';
  status: 'pending' | 'in_progress' | 'completed';
  isTop3: boolean;
  isCurrentTask: boolean;
  planDate?: string;
}

export interface SleepTimePolicyData {
  enabled: boolean;
  startTime: string;
  endTime: string;
  isCurrentlyActive: boolean;
  isSnoozed: boolean;
  snoozeEndTime?: number;
}

export interface OverRestPolicyData {
  isOverRest: boolean;
  overRestMinutes: number;
}

export interface TemporaryUnblockData {
  active: boolean;
  endTime: number; // Unix timestamp ms
}

export interface WorkTimePolicyData {
  enabled: boolean;
  isCurrentlyActive: boolean;
  isInRestPeriod: boolean;
  slots: { startTime: string; endTime: string }[];
}

export interface PolicyData {
  version: number;
  distractionApps: BlockedApp[];
  updatedAt: number;
  sleepTime?: SleepTimePolicyData;
  overRest?: OverRestPolicyData;
  temporaryUnblock?: TemporaryUnblockData;
  workTime?: WorkTimePolicyData;
}

export interface BlockedApp {
  bundleId: string;
  name: string;
}

// =============================================================================
// CACHE TYPES
// =============================================================================

export interface CachedState {
  dailyState: DailyStateData;
  activePomodoro: ActivePomodoroData | null;
  todayTasks: TaskData[];
  policy: PolicyData;
  cachedAt: number;
}

// =============================================================================
// SCREEN TIME TYPES
// =============================================================================

export type AuthorizationStatus =
  | 'authorized'
  | 'denied'
  | 'notDetermined'
  | 'restricted';

export type BlockingReason = 'focus' | 'over_rest' | 'sleep' | 'work_time';

export interface SelectionSummary {
  appCount: number;
  categoryCount: number;
  hasSelection: boolean;
}

export interface SleepScheduleConfig {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

export interface BlockingState {
  isActive: boolean;
  selectionSummary: SelectionSummary | null;
  pomodoroId: string | null;
  activatedAt: number | null;
  reason: BlockingReason | null;
}

// =============================================================================
// HABIT TYPES
// =============================================================================

export type HabitType = 'BOOLEAN' | 'MEASURABLE' | 'TIMED';
export type HabitStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export type HabitEntryType = 'NO' | 'UNKNOWN' | 'YES_MANUAL' | 'YES_AUTO' | 'SKIP';

export interface HabitData {
  id: string;
  title: string;
  description?: string | null;
  question?: string | null;
  type: HabitType;
  targetValue?: number | null;
  targetUnit?: string | null;
  freqNum: number;
  freqDen: number;
  icon?: string | null;
  color?: string | null;
  sortOrder: number;
  status: HabitStatus;
  reminderEnabled: boolean;
  reminderTime?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HabitEntryData {
  id: string;
  habitId: string;
  userId: string;
  date: string;
  value: number;
  entryType: HabitEntryType;
  note?: string | null;
  pomodoroIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TodayHabitData extends HabitData {
  todayEntry: HabitEntryData | null;
  streak: { current: number; best: number };
  isDue: boolean;
}

// =============================================================================
// SERVICE RESULT TYPES
// =============================================================================

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };
