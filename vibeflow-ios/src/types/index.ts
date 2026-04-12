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

export interface PolicyData {
  version: number;
  distractionApps: BlockedApp[];
  updatedAt: number;
  sleepTime?: SleepTimePolicyData;
  overRest?: OverRestPolicyData;
  temporaryUnblock?: TemporaryUnblockData;
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

export type BlockingReason = 'focus' | 'over_rest' | 'sleep';

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
// SERVICE RESULT TYPES
// =============================================================================

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };
