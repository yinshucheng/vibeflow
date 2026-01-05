/**
 * iOS App Type Definitions
 */

export * from './octopus';

// =============================================================================
// APP STATE TYPES
// =============================================================================

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

export interface DailyStateData {
  state: 'LOCKED' | 'PLANNING' | 'FOCUS' | 'REST';
  completedPomodoros: number;
  dailyCap: number;
  totalFocusMinutes: number;
}

export interface ActivePomodoroData {
  id: string;
  taskId: string;
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

export interface PolicyData {
  version: number;
  distractionApps: BlockedApp[];
  updatedAt: number;
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

export interface BlockingState {
  isActive: boolean;
  blockedApps: BlockedApp[];
  pomodoroId: string | null;
  activatedAt: number | null;
}

// =============================================================================
// SERVICE RESULT TYPES
// =============================================================================

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };
