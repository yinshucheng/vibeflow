/**
 * App State Store (Zustand)
 *
 * Central state management for the iOS app.
 * All state is read-only - updates come only from server via WebSocket.
 *
 * Requirements: 2.3, 4.1
 */

import { create } from 'zustand';
import type {
  ConnectionStatus,
  DailyStateData,
  ActivePomodoroData,
  TaskData,
  PolicyData,
  BlockedApp,
  SyncStateCommand,
  UpdatePolicyCommand,
  FullState,
  StateDelta,
} from '@/types';

// =============================================================================
// STORE STATE INTERFACE
// =============================================================================

export interface AppState {
  // Connection state
  connectionStatus: ConnectionStatus;
  lastSyncTime: number | null;

  // Authentication state (read-only from server)
  isAuthenticated: boolean;
  userId: string | null;
  userEmail: string | null;

  // Daily state (read-only from server)
  dailyState: DailyStateData | null;

  // Pomodoro state (read-only from server)
  activePomodoro: ActivePomodoroData | null;

  // Task lists (read-only from server)
  top3Tasks: TaskData[];
  todayTasks: TaskData[];

  // Policy data (read-only from server)
  policy: PolicyData | null;

  // Blocking state
  isBlockingActive: boolean;
  blockedApps: BlockedApp[];
  screenTimeAuthorized: boolean;

  // State version for sync
  stateVersion: number;
}

// =============================================================================
// STORE ACTIONS INTERFACE
// =============================================================================

export interface AppActions {
  // Connection actions
  setConnectionStatus: (status: ConnectionStatus) => void;

  // Sync handlers (read-only updates from server)
  handleSyncState: (command: SyncStateCommand) => void;
  handlePolicyUpdate: (command: UpdatePolicyCommand) => void;

  // Blocking state
  setBlockingActive: (active: boolean) => void;
  setBlockedApps: (apps: BlockedApp[]) => void;
  setScreenTimeAuthorized: (authorized: boolean) => void;

  // Clear state
  clearState: () => void;

  // Set user info (from server sync)
  setUserInfo: (userId: string, email: string) => void;
}

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialState: AppState = {
  connectionStatus: 'disconnected',
  lastSyncTime: null,
  isAuthenticated: false,
  userId: null,
  userEmail: null,
  dailyState: null,
  activePomodoro: null,
  top3Tasks: [],
  todayTasks: [],
  policy: null,
  isBlockingActive: false,
  blockedApps: [],
  screenTimeAuthorized: false,
  stateVersion: 0,
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Convert server FullState to app state format
 */
function mapFullStateToAppState(
  fullState: FullState
): Partial<AppState> {
  const { systemState, dailyState, activePomodoro, top3Tasks, settings } = fullState;

  // Map daily state
  const mappedDailyState: DailyStateData = {
    state: systemState.state as DailyStateData['state'],
    completedPomodoros: dailyState.completedPomodoros,
    dailyCap: settings.dailyCap,
    totalFocusMinutes: dailyState.totalFocusMinutes,
  };

  // Map active pomodoro
  const mappedPomodoro: ActivePomodoroData | null = activePomodoro
    ? {
        id: activePomodoro.id,
        taskId: activePomodoro.taskId,
        taskTitle: findTaskTitle(top3Tasks, activePomodoro.taskId),
        startTime: activePomodoro.startTime,
        duration: activePomodoro.duration,
        status: activePomodoro.status === 'active' || activePomodoro.status === 'paused'
          ? activePomodoro.status
          : 'active',
      }
    : null;

  // Map tasks
  const mappedTasks: TaskData[] = top3Tasks.map((task) => ({
    id: task.id,
    title: task.title,
    priority: mapPriority(task.priority),
    status: mapTaskStatus(task.status),
    isTop3: true,
    isCurrentTask: activePomodoro?.taskId === task.id,
    planDate: dailyState.date,
  }));

  return {
    dailyState: mappedDailyState,
    activePomodoro: mappedPomodoro,
    top3Tasks: mappedTasks,
    todayTasks: mappedTasks, // In MVP, today tasks = top3 tasks
    isBlockingActive: mappedPomodoro !== null && mappedPomodoro.status === 'active',
  };
}

/**
 * Find task title by ID
 */
function findTaskTitle(
  tasks: { id: string; title: string }[],
  taskId: string
): string {
  const task = tasks.find((t) => t.id === taskId);
  return task?.title ?? 'Unknown Task';
}

/**
 * Map server priority to app priority
 */
function mapPriority(priority: string): TaskData['priority'] {
  if (priority === 'P1' || priority === 'P2' || priority === 'P3') {
    return priority;
  }
  return 'P3'; // Default to P3
}

/**
 * Map server task status to app status
 */
function mapTaskStatus(status: string): TaskData['status'] {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'in_progress':
      return 'in_progress';
    default:
      return 'pending';
  }
}

/**
 * Apply delta changes to current state
 */
function applyDeltaChanges(
  currentState: AppState,
  delta: StateDelta
): Partial<AppState> {
  const updates: Partial<AppState> = {};

  for (const change of delta.changes) {
    if (change.operation === 'delete') {
      continue; // Handle delete operations if needed
    }

    // Parse path and apply change
    const pathParts = change.path.split('.');
    
    switch (pathParts[0]) {
      case 'systemState':
        if (pathParts[1] === 'state' && currentState.dailyState) {
          updates.dailyState = {
            ...currentState.dailyState,
            state: change.value as DailyStateData['state'],
          };
        }
        break;

      case 'dailyState':
        if (currentState.dailyState) {
          if (pathParts[1] === 'completedPomodoros') {
            updates.dailyState = {
              ...currentState.dailyState,
              completedPomodoros: change.value as number,
            };
          } else if (pathParts[1] === 'totalFocusMinutes') {
            updates.dailyState = {
              ...(updates.dailyState ?? currentState.dailyState),
              totalFocusMinutes: change.value as number,
            };
          }
        }
        break;

      case 'activePomodoro':
        if (change.value === null) {
          updates.activePomodoro = null;
          updates.isBlockingActive = false;
        } else if (typeof change.value === 'object') {
          const pomodoroData = change.value as {
            id: string;
            taskId: string;
            startTime: number;
            duration: number;
            status: string;
          };
          updates.activePomodoro = {
            id: pomodoroData.id,
            taskId: pomodoroData.taskId,
            taskTitle: findTaskTitle(currentState.top3Tasks, pomodoroData.taskId),
            startTime: pomodoroData.startTime,
            duration: pomodoroData.duration,
            status: pomodoroData.status === 'paused' ? 'paused' : 'active',
          };
          updates.isBlockingActive = pomodoroData.status === 'active';
        }
        break;

      case 'top3Tasks':
        if (Array.isArray(change.value)) {
          const tasks = change.value as Array<{
            id: string;
            title: string;
            status: string;
            priority: string;
          }>;
          updates.top3Tasks = tasks.map((task) => ({
            id: task.id,
            title: task.title,
            priority: mapPriority(task.priority),
            status: mapTaskStatus(task.status),
            isTop3: true,
            isCurrentTask: currentState.activePomodoro?.taskId === task.id,
          }));
          updates.todayTasks = updates.top3Tasks;
        }
        break;
    }
  }

  return updates;
}

// =============================================================================
// ZUSTAND STORE
// =============================================================================

export const useAppStore = create<AppState & AppActions>()((set, get) => ({
  ...initialState,

  // ===========================================================================
  // CONNECTION ACTIONS
  // ===========================================================================

  setConnectionStatus: (status: ConnectionStatus) => {
    set({ connectionStatus: status });
  },

  // ===========================================================================
  // SYNC HANDLERS (READ-ONLY UPDATES FROM SERVER)
  // ===========================================================================

  handleSyncState: (command: SyncStateCommand) => {
    const { payload } = command;
    const currentState = get();

    if (payload.syncType === 'full' && payload.state) {
      // Full state sync
      const mappedState = mapFullStateToAppState(payload.state);
      set({
        ...mappedState,
        lastSyncTime: Date.now(),
        stateVersion: payload.version,
        isAuthenticated: true,
      });
    } else if (payload.syncType === 'delta' && payload.delta) {
      // Delta state sync
      const updates = applyDeltaChanges(currentState, payload.delta);
      set({
        ...updates,
        lastSyncTime: Date.now(),
        stateVersion: payload.version,
      });
    }
  },

  handlePolicyUpdate: (command: UpdatePolicyCommand) => {
    const { payload } = command;
    const { policy } = payload;

    // Map policy to app format
    const mappedPolicy: PolicyData = {
      version: policy.version,
      distractionApps: policy.distractionApps.map((app) => ({
        bundleId: app.bundleId,
        name: app.name,
      })),
      updatedAt: policy.updatedAt,
    };

    set({
      policy: mappedPolicy,
      blockedApps: mappedPolicy.distractionApps,
    });
  },

  // ===========================================================================
  // BLOCKING STATE
  // ===========================================================================

  setBlockingActive: (active: boolean) => {
    set({ isBlockingActive: active });
  },

  setBlockedApps: (apps: BlockedApp[]) => {
    set({ blockedApps: apps });
  },

  setScreenTimeAuthorized: (authorized: boolean) => {
    set({ screenTimeAuthorized: authorized });
  },

  // ===========================================================================
  // USER INFO
  // ===========================================================================

  setUserInfo: (userId: string, email: string) => {
    set({
      userId,
      userEmail: email,
      isAuthenticated: true,
    });
  },

  // ===========================================================================
  // CLEAR STATE
  // ===========================================================================

  clearState: () => {
    set(initialState);
  },
}));

// =============================================================================
// SELECTOR HOOKS
// =============================================================================

/**
 * Select connection status
 */
export const useConnectionStatus = () =>
  useAppStore((state) => state.connectionStatus);

/**
 * Select daily state
 */
export const useDailyState = () =>
  useAppStore((state) => state.dailyState);

/**
 * Select active pomodoro
 */
export const useActivePomodoro = () =>
  useAppStore((state) => state.activePomodoro);

/**
 * Select top 3 tasks
 */
export const useTop3Tasks = () =>
  useAppStore((state) => state.top3Tasks);

/**
 * Select today tasks
 */
export const useTodayTasks = () =>
  useAppStore((state) => state.todayTasks);

/**
 * Select blocking state
 */
export const useBlockingState = () =>
  useAppStore((state) => ({
    isBlockingActive: state.isBlockingActive,
    blockedApps: state.blockedApps,
  }));

/**
 * Select policy
 */
export const usePolicy = () =>
  useAppStore((state) => state.policy);

/**
 * Select user info
 */
export const useUserInfo = () =>
  useAppStore((state) => ({
    userId: state.userId,
    userEmail: state.userEmail,
    isAuthenticated: state.isAuthenticated,
  }));

/**
 * Select last sync time
 */
export const useLastSyncTime = () =>
  useAppStore((state) => state.lastSyncTime);
