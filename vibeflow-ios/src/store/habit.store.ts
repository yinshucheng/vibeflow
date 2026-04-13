/**
 * Habit Store (Zustand)
 *
 * State management for habit tracking on iOS.
 * Communicates with server via WebSocket USER_ACTION events.
 * Listens for real-time habit broadcast events.
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { actionService, type ActionResult } from '@/services/action.service';
import { websocketService } from '@/services/websocket.service';
import type { TodayHabitData, HabitData } from '@/types';

// Lazy imports to avoid pulling expo-notifications at module load time (breaks Jest)
let _notificationService: typeof import('@/services/notification.service').notificationService | null = null;
let _habitNotificationService: typeof import('@/services/habit-notification.service').habitNotificationService | null = null;

async function getNotificationService() {
  if (!_notificationService) {
    const mod = await import('@/services/notification.service');
    _notificationService = mod.notificationService;
  }
  // Ensure hasPermission is up-to-date (checkPermission is idempotent)
  // This covers the race condition where habit socket listener fires
  // before notificationTriggerService.initialize() completes
  await _notificationService.checkPermission();
  return _notificationService;
}

async function getHabitNotificationService() {
  if (!_habitNotificationService) {
    const mod = await import('@/services/habit-notification.service');
    _habitNotificationService = mod.habitNotificationService;
  }
  return _habitNotificationService;
}

// =============================================================================
// STORE STATE
// =============================================================================

export interface HabitState {
  todayHabits: TodayHabitData[];
  habits: HabitData[];
  loading: boolean;
  todayLoading: boolean;
}

export interface HabitActions {
  // Fetches
  fetchTodayHabits: () => Promise<void>;
  fetchHabits: (status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED') => Promise<void>;

  // Mutations
  recordEntry: (habitId: string, date: string, value: number) => Promise<ActionResult>;
  deleteEntry: (habitId: string, date: string) => Promise<ActionResult>;
  createHabit: (data: {
    title: string;
    type?: string;
    freqNum?: number;
    freqDen?: number;
    description?: string;
    question?: string;
    icon?: string;
    color?: string;
    reminderEnabled?: boolean;
    reminderTime?: string;
  }) => Promise<ActionResult<{ habit: HabitData }>>;
  updateHabit: (id: string, updates: Record<string, unknown>) => Promise<ActionResult>;
  deleteHabit: (id: string) => Promise<ActionResult>;

  // Socket event handlers
  handleHabitCreated: (payload: { habit: Record<string, unknown> }) => void;
  handleHabitUpdated: (payload: { habit: Record<string, unknown> }) => void;
  handleHabitDeleted: (payload: { habitId: string }) => void;
  handleEntryUpdated: (payload: { habitId: string; date: string; entry?: Record<string, unknown> }) => void;
}

// =============================================================================
// STORE
// =============================================================================

export const useHabitStore = create<HabitState & HabitActions>((set, get) => ({
  // State
  todayHabits: [],
  habits: [],
  loading: false,
  todayLoading: false,

  // ===========================================================================
  // FETCH ACTIONS
  // ===========================================================================

  fetchTodayHabits: async () => {
    set({ todayLoading: true });
    try {
      const result = await actionService.sendHabitAction<{ habits: TodayHabitData[] }>(
        'HABIT_GET_TODAY',
        {},
      );
      if (result.success && result.data) {
        set({ todayHabits: result.data.habits });
      }
    } catch (err) {
      console.error('[HabitStore] Failed to fetch today habits:', err);
    } finally {
      set({ todayLoading: false });
    }
  },

  fetchHabits: async (status) => {
    set({ loading: true });
    try {
      const result = await actionService.sendHabitAction<{ habits: HabitData[] }>(
        'HABIT_LIST',
        status ? { status } : {},
      );
      if (result.success && result.data) {
        set({ habits: result.data.habits });
      }
    } catch (err) {
      console.error('[HabitStore] Failed to fetch habits:', err);
    } finally {
      set({ loading: false });
    }
  },

  // ===========================================================================
  // MUTATION ACTIONS
  // ===========================================================================

  recordEntry: async (habitId, date, value) => {
    // Optimistic update for today habits
    const { todayHabits } = get();
    const previousHabits = [...todayHabits];

    set({
      todayHabits: todayHabits.map((h) =>
        h.id === habitId
          ? {
              ...h,
              todayEntry: {
                id: `optimistic_${Date.now()}`,
                habitId,
                userId: '',
                date,
                value,
                entryType: 'YES_MANUAL' as const,
                note: null,
                pomodoroIds: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              streak: { current: h.streak.current + 1, best: Math.max(h.streak.best, h.streak.current + 1) },
            }
          : h,
      ),
    });

    const result = await actionService.sendHabitAction(
      'HABIT_RECORD_ENTRY',
      { habitId, date, value },
    );

    if (!result.success) {
      // Rollback
      set({ todayHabits: previousHabits });
    } else {
      // Cancel today's local notification for this habit (prevent duplicate)
      getHabitNotificationService().then((svc) => svc.cancelTodayReminder(habitId));
    }

    return result;
  },

  deleteEntry: async (habitId, date) => {
    // Optimistic update
    const { todayHabits } = get();
    const previousHabits = [...todayHabits];

    set({
      todayHabits: todayHabits.map((h) =>
        h.id === habitId
          ? {
              ...h,
              todayEntry: null,
              streak: { current: Math.max(0, h.streak.current - 1), best: h.streak.best },
            }
          : h,
      ),
    });

    const result = await actionService.sendHabitAction(
      'HABIT_DELETE_ENTRY',
      { habitId, date },
    );

    if (!result.success) {
      set({ todayHabits: previousHabits });
    }

    return result;
  },

  createHabit: async (data) => {
    const result = await actionService.sendHabitAction<{ habit: HabitData }>(
      'HABIT_CREATE',
      data,
    );
    // Socket broadcast will trigger refresh
    return result;
  },

  updateHabit: async (id, updates) => {
    const result = await actionService.sendHabitAction(
      'HABIT_UPDATE',
      { id, updates },
    );
    return result;
  },

  deleteHabit: async (id) => {
    const result = await actionService.sendHabitAction(
      'HABIT_DELETE',
      { id },
    );
    return result;
  },

  // ===========================================================================
  // SOCKET EVENT HANDLERS
  // ===========================================================================

  handleHabitCreated: (_payload) => {
    // Refresh lists when a habit is created (from any client)
    get().fetchTodayHabits();
    get().fetchHabits();
  },

  handleHabitUpdated: (_payload) => {
    get().fetchTodayHabits();
    get().fetchHabits();
  },

  handleHabitDeleted: (payload) => {
    set({
      todayHabits: get().todayHabits.filter((h) => h.id !== payload.habitId),
      habits: get().habits.filter((h) => h.id !== payload.habitId),
    });
  },

  handleEntryUpdated: (_payload) => {
    // Refresh today habits to get fresh streak + entry data
    get().fetchTodayHabits();
  },
}));

// =============================================================================
// SOCKET SUBSCRIPTION
// =============================================================================

let socketCleanups: (() => void)[] = [];

/**
 * Initialize socket event listeners for habit updates.
 * Call once during app initialization.
 */
export function initHabitSocketListeners(): void {
  cleanupHabitSocketListeners();

  const store = useHabitStore.getState();

  const socket = (websocketService as unknown as { socket: {
    on: (event: string, handler: (...args: unknown[]) => void) => void;
    off: (event: string, handler: (...args: unknown[]) => void) => void;
  } | null }).socket;

  if (!socket) {
    console.warn('[HabitStore] Socket not available, deferring listener setup');
    return;
  }

  const handlers = {
    'habit:created': (payload: unknown) =>
      store.handleHabitCreated(payload as { habit: Record<string, unknown> }),
    'habit:updated': (payload: unknown) =>
      store.handleHabitUpdated(payload as { habit: Record<string, unknown> }),
    'habit:deleted': (payload: unknown) =>
      store.handleHabitDeleted(payload as { habitId: string }),
    'habit:entry_updated': (payload: unknown) =>
      store.handleEntryUpdated(payload as { habitId: string; date: string; entry?: Record<string, unknown> }),
  };

  for (const [event, handler] of Object.entries(handlers)) {
    socket.on(event, handler);
    socketCleanups.push(() => socket.off(event, handler));
  }

  // Listen for EXECUTE commands (legacy format) for HABIT_REMINDER
  const handleHabitReminder = async (params: {
    habitId?: string;
    title?: string;
    question?: string;
    streak?: number;
  }) => {
    const notifSvc = await getNotificationService();
    notifSvc.showCustomNotification({
      title: `🌱 ${params.title ?? '习惯提醒'}`,
      body: params.question ?? `该完成「${params.title}」了`,
      data: { type: 'habit_reminder', habitId: params.habitId ?? '' },
    });
    if (params.habitId) {
      const habitNotifSvc = await getHabitNotificationService();
      habitNotifSvc.onRemotePushReceived(params.habitId);
    }
  };

  const handleExecute = (command: unknown) => {
    const cmd = command as { action?: string; params?: Record<string, unknown> };
    if (cmd.action === 'HABIT_REMINDER' && cmd.params) {
      handleHabitReminder(cmd.params as { habitId?: string; title?: string; question?: string; streak?: number });
    }
  };
  socket.on('EXECUTE', handleExecute);
  socketCleanups.push(() => socket.off('EXECUTE', handleExecute));

  // Also listen for Octopus EXECUTE_ACTION command
  const cleanupExecuteAction = websocketService.onCommand<{
    action: string;
    params?: Record<string, unknown>;
  }>('EXECUTE_ACTION', (payload) => {
    if (payload.action === 'HABIT_REMINDER' && payload.params) {
      handleHabitReminder(payload.params as { habitId?: string; title?: string; question?: string; streak?: number });
    }
  });
  socketCleanups.push(cleanupExecuteAction);

  console.log('[HabitStore] Socket listeners initialized');
}

export function cleanupHabitSocketListeners(): void {
  socketCleanups.forEach((cleanup) => cleanup());
  socketCleanups = [];
}

// =============================================================================
// SELECTOR HOOKS
// =============================================================================

export const useTodayHabits = () =>
  useHabitStore(useShallow((state) => state.todayHabits));

export const useTodayHabitsLoading = () =>
  useHabitStore((state) => state.todayLoading);

export const useHabits = () =>
  useHabitStore(useShallow((state) => state.habits));

export const useHabitsLoading = () =>
  useHabitStore((state) => state.loading);
