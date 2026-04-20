/**
 * App State Store (Zustand)
 *
 * Central state management for the iOS app.
 * Supports optimistic updates for user actions.
 *
 * Requirements: 2.3, 4.1
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type {
  ConnectionStatus,
  DailyStateData,
  ActivePomodoroData,
  TaskData,
  PolicyData,
  BlockingReason,
  SelectionSummary,
  SyncStateCommand,
  UpdatePolicyCommand,
  FullState,
} from '@/types';

// =============================================================================
// OPTIMISTIC UPDATE TYPES
// =============================================================================

export interface OptimisticUpdate {
  id: string;
  type: string;
  previousState: Partial<AppState>;
  timestamp: number;
}

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
  overdueTasks: TaskData[];
  tasksLoading: boolean;

  // Policy data (read-only from server)
  policy: PolicyData | null;

  // Blocking state
  isBlockingActive: boolean;
  selectionSummary: SelectionSummary | null;
  screenTimeAuthorized: boolean;
  blockingReason: BlockingReason | null;

  // State version for sync
  stateVersion: number;

  // Optimistic updates tracking
  pendingUpdates: Map<string, OptimisticUpdate>;
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
  setSelectionSummary: (summary: SelectionSummary | null) => void;
  setScreenTimeAuthorized: (authorized: boolean) => void;
  setBlockingReason: (reason: BlockingReason | null) => void;

  // Task fetch actions
  fetchTodayTasks: () => Promise<void>;
  fetchOverdueTasks: () => Promise<void>;

  // Clear state
  clearState: () => void;

  // Set user info (from server sync)
  setUserInfo: (userId: string, email: string) => void;

  // Optimistic update actions
  optimisticCompleteTask: (taskId: string) => string;
  optimisticStartPomodoro: (taskId?: string) => string;
  optimisticUpdateTaskStatus: (taskId: string, status: TaskData['status']) => string;
  optimisticSetTop3: (taskIds: string[]) => string;
  confirmOptimisticUpdate: (optimisticId: string) => void;
  rollbackOptimisticUpdate: (optimisticId: string) => void;
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
  overdueTasks: [],
  tasksLoading: false,
  policy: null,
  isBlockingActive: false,
  selectionSummary: null,
  screenTimeAuthorized: false,
  blockingReason: null,
  stateVersion: 0,
  pendingUpdates: new Map(),
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Normalize server state values to 3-state model (IDLE/FOCUS/OVER_REST).
 * Handles backward compatibility with legacy 5-state values.
 */
function normalizeState(raw: string): DailyStateData['state'] {
  switch (raw.toUpperCase()) {
    case 'IDLE':
    case 'LOCKED':
    case 'PLANNING':
    case 'REST':
      return 'IDLE';
    case 'FOCUS':
      return 'FOCUS';
    case 'OVER_REST':
      return 'OVER_REST';
    default:
      return 'IDLE';
  }
}

/**
 * Convert server FullState to app state format
 */
function mapFullStateToAppState(
  fullState: FullState
): Partial<AppState> {
  const { systemState, dailyState, activePomodoro, top3Tasks, settings } = fullState;

  // Map daily state (server may send legacy values, normalize to 3-state model)
  const normalizedState = normalizeState(systemState.state);
  const mappedDailyState: DailyStateData = {
    state: normalizedState,
    completedPomodoros: dailyState.completedPomodoros,
    dailyCap: settings.dailyCap,
    totalFocusMinutes: dailyState.totalFocusMinutes,
  };

  // Map active pomodoro
  const mappedPomodoro: ActivePomodoroData | null = activePomodoro
    ? {
        id: activePomodoro.id,
        taskId: activePomodoro.taskId,
        taskTitle: activePomodoro.taskTitle ?? findTaskTitle(top3Tasks, activePomodoro.taskId),
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
    // Note: isBlockingActive is NOT set here — it is managed exclusively by blockingService
    // which evaluates the full state (activePomodoro + policy) via evaluateBlockingReason().
  };
}

/**
 * Find task title by ID
 */
function findTaskTitle(
  tasks: { id: string; title: string }[],
  taskId: string | null
): string {
  if (!taskId) return '';
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
  const normalized = status.toLowerCase();
  switch (normalized) {
    case 'completed':
    case 'done':
      return 'completed';
    case 'in_progress':
      return 'in_progress';
    default:
      return 'pending';
  }
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

    if (payload.state) {
      // Full state sync — server always sends complete ground truth
      const mappedState = mapFullStateToAppState(payload.state);
      set({
        ...mappedState,
        lastSyncTime: Date.now(),
        stateVersion: payload.version,
        isAuthenticated: true,
      });
      // After full sync, fetch complete today tasks and overdue tasks
      // (FullState only has top3, not full today list or overdue)
      setTimeout(() => {
        get().fetchTodayTasks();
        get().fetchOverdueTasks();
      }, 0);
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
      sleepTime: policy.sleepTime
        ? {
            enabled: policy.sleepTime.enabled,
            startTime: policy.sleepTime.startTime,
            endTime: policy.sleepTime.endTime,
            isCurrentlyActive: policy.sleepTime.isCurrentlyActive,
            isSnoozed: policy.sleepTime.isSnoozed,
            snoozeEndTime: policy.sleepTime.snoozeEndTime,
          }
        : undefined,
      overRest: policy.overRest
        ? {
            isOverRest: policy.overRest.isOverRest,
            overRestMinutes: policy.overRest.overRestMinutes,
          }
        : undefined,
      temporaryUnblock: policy.temporaryUnblock
        ? {
            active: policy.temporaryUnblock.active,
            endTime: policy.temporaryUnblock.endTime,
          }
        : undefined,
    };

    set({
      policy: mappedPolicy,
    });
  },

  // ===========================================================================
  // TASK FETCH ACTIONS
  // ===========================================================================

  fetchTodayTasks: async () => {
    set({ tasksLoading: true });
    try {
      const { actionService } = await import('@/services/action.service');
      const result = await actionService.fetchTodayTasks();
      if (result.success && result.data) {
        const currentState = get();
        const tasks: TaskData[] = result.data.tasks.map((task) => ({
          id: task.id,
          title: task.title,
          priority: mapPriority(task.priority),
          status: mapTaskStatus(task.status),
          isTop3: currentState.top3Tasks.some((t) => t.id === task.id),
          isCurrentTask: currentState.activePomodoro?.taskId === task.id,
          planDate: task.planDate ?? undefined,
        }));
        set({ todayTasks: tasks });
      }
    } catch (err) {
      console.error('[AppStore] Failed to fetch today tasks:', err);
    } finally {
      set({ tasksLoading: false });
    }
  },

  fetchOverdueTasks: async () => {
    try {
      const { actionService } = await import('@/services/action.service');
      const result = await actionService.fetchOverdueTasks();
      if (result.success && result.data) {
        const currentState = get();
        const tasks: TaskData[] = result.data.tasks.map((task) => ({
          id: task.id,
          title: task.title,
          priority: mapPriority(task.priority),
          status: mapTaskStatus(task.status),
          isTop3: false,
          isCurrentTask: currentState.activePomodoro?.taskId === task.id,
          planDate: task.planDate ?? undefined,
        }));
        set({ overdueTasks: tasks });
      }
    } catch (err) {
      console.error('[AppStore] Failed to fetch overdue tasks:', err);
    }
  },

  // ===========================================================================
  // BLOCKING STATE
  // ===========================================================================

  setBlockingActive: (active: boolean) => {
    set({ isBlockingActive: active });
  },

  setSelectionSummary: (summary: SelectionSummary | null) => {
    set({ selectionSummary: summary });
  },

  setScreenTimeAuthorized: (authorized: boolean) => {
    set({ screenTimeAuthorized: authorized });
  },

  setBlockingReason: (reason: BlockingReason | null) => {
    set({ blockingReason: reason });
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

  // ===========================================================================
  // OPTIMISTIC UPDATE ACTIONS
  // ===========================================================================

  optimisticCompleteTask: (taskId: string): string => {
    const optimisticId = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const currentState = get();

    // Save previous state for rollback
    const previousState: Partial<AppState> = {
      top3Tasks: [...currentState.top3Tasks],
      todayTasks: [...currentState.todayTasks],
      overdueTasks: [...currentState.overdueTasks],
    };

    // Apply optimistic update
    const updateTask = (tasks: TaskData[]) =>
      tasks.map((t) => (t.id === taskId ? { ...t, status: 'completed' as const } : t));

    const pendingUpdates = new Map(currentState.pendingUpdates);
    pendingUpdates.set(optimisticId, {
      id: optimisticId,
      type: 'TASK_COMPLETE',
      previousState,
      timestamp: Date.now(),
    });

    set({
      top3Tasks: updateTask(currentState.top3Tasks),
      todayTasks: updateTask(currentState.todayTasks),
      overdueTasks: currentState.overdueTasks.filter((t) => t.id !== taskId),
      pendingUpdates,
    });

    return optimisticId;
  },

  optimisticStartPomodoro: (taskId?: string): string => {
    const optimisticId = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const currentState = get();

    const previousState: Partial<AppState> = {
      activePomodoro: currentState.activePomodoro,
      dailyState: currentState.dailyState,
      isBlockingActive: currentState.isBlockingActive,
    };

    const task = taskId ? currentState.top3Tasks.find((t) => t.id === taskId) : null;

    const pendingUpdates = new Map(currentState.pendingUpdates);
    pendingUpdates.set(optimisticId, {
      id: optimisticId,
      type: 'POMODORO_START',
      previousState,
      timestamp: Date.now(),
    });

    set({
      activePomodoro: {
        id: `temp_${optimisticId}`,
        taskId: taskId ?? '',
        taskTitle: task?.title ?? 'Focus Session',
        startTime: Date.now(),
        duration: 25, // minutes — consistent with server format
        status: 'active',
      },
      dailyState: currentState.dailyState
        ? { ...currentState.dailyState, state: 'FOCUS' }
        : null,
      isBlockingActive: true,
      pendingUpdates,
    });

    return optimisticId;
  },

  optimisticUpdateTaskStatus: (taskId: string, status: TaskData['status']): string => {
    const optimisticId = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const currentState = get();

    const previousState: Partial<AppState> = {
      top3Tasks: [...currentState.top3Tasks],
      todayTasks: [...currentState.todayTasks],
      overdueTasks: [...currentState.overdueTasks],
    };

    const updateTask = (tasks: TaskData[]) =>
      tasks.map((t) => (t.id === taskId ? { ...t, status } : t));

    const pendingUpdates = new Map(currentState.pendingUpdates);
    pendingUpdates.set(optimisticId, {
      id: optimisticId,
      type: 'TASK_STATUS_CHANGE',
      previousState,
      timestamp: Date.now(),
    });

    set({
      top3Tasks: updateTask(currentState.top3Tasks),
      todayTasks: updateTask(currentState.todayTasks),
      overdueTasks: status === 'completed'
        ? currentState.overdueTasks.filter((t) => t.id !== taskId)
        : updateTask(currentState.overdueTasks),
      pendingUpdates,
    });

    return optimisticId;
  },

  optimisticSetTop3: (taskIds: string[]): string => {
    const optimisticId = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const currentState = get();

    const previousState: Partial<AppState> = {
      top3Tasks: [...currentState.top3Tasks],
    };

    const pendingUpdates = new Map(currentState.pendingUpdates);
    pendingUpdates.set(optimisticId, {
      id: optimisticId,
      type: 'SET_TOP3',
      previousState,
      timestamp: Date.now(),
    });

    // Filter tasks from todayTasks that match the taskIds
    const allTasks = [...currentState.todayTasks, ...currentState.top3Tasks];
    const newTop3 = taskIds
      .map((id) => allTasks.find((t) => t.id === id))
      .filter((t): t is TaskData => t !== undefined);

    set({ top3Tasks: newTop3, pendingUpdates });

    return optimisticId;
  },

  confirmOptimisticUpdate: (optimisticId: string): void => {
    const currentState = get();
    const pendingUpdates = new Map(currentState.pendingUpdates);
    pendingUpdates.delete(optimisticId);
    set({ pendingUpdates });
  },

  rollbackOptimisticUpdate: (optimisticId: string): void => {
    const currentState = get();
    const update = currentState.pendingUpdates.get(optimisticId);

    if (update) {
      const pendingUpdates = new Map(currentState.pendingUpdates);
      pendingUpdates.delete(optimisticId);
      set({ ...update.previousState, pendingUpdates });
    }
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
 * Select overdue tasks
 */
export const useOverdueTasks = () =>
  useAppStore((state) => state.overdueTasks);

/**
 * Select tasks loading state
 */
export const useTasksLoading = () =>
  useAppStore((state) => state.tasksLoading);

/**
 * Select blocking state
 */
export const useBlockingState = () =>
  useAppStore(useShallow((state) => ({
    isBlockingActive: state.isBlockingActive,
    selectionSummary: state.selectionSummary,
    blockingReason: state.blockingReason,
  })));

/**
 * Select blocking reason
 */
export const useBlockingReason = () =>
  useAppStore((state) => state.blockingReason);

/**
 * Select policy
 */
export const usePolicy = () =>
  useAppStore((state) => state.policy);

/**
 * Select user info
 */
export const useUserInfo = () =>
  useAppStore(useShallow((state) => ({
    userId: state.userId,
    userEmail: state.userEmail,
    isAuthenticated: state.isAuthenticated,
  })));

/**
 * Select last sync time
 */
export const useLastSyncTime = () =>
  useAppStore((state) => state.lastSyncTime);
