/**
 * iOS App Type Definitions
 */

export * from './octopus';
export * from './chat';

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
