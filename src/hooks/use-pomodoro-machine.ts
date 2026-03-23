/**
 * usePomodoroMachine Hook
 *
 * Centralized state machine for pomodoro workflow management.
 * Provides single source of truth and idempotent operations.
 *
 * Key principles:
 * 1. Single source of truth - all pomodoro state flows through this hook
 * 2. Idempotent operations - duplicate calls are safely ignored
 * 3. State-driven rendering - phase determines what UI to show
 * 4. Data preservation - pomodoro info saved before state transitions
 *
 * Requirements: 4.1-4.7, 7.1-7.6
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { useSocket } from '@/hooks/use-socket';
import { normalizeState, type SystemState } from '@/lib/state-utils';

/**
 * Pomodoro workflow phases
 */
export type PomodoroPhase =
  | 'loading'        // Initial loading state
  | 'idle'           // No active pomodoro, waiting to start
  | 'focus'          // Focus session in progress
  | 'completing'     // Completing pomodoro (API call in progress)
  | 'break_prompt'   // Showing break confirmation modal
  | 'resting';       // Rest period in progress

/**
 * Pomodoro data structure
 */
export interface PomodoroData {
  id: string;
  taskId: string | null;
  duration: number;
  startTime: Date;
  status: string;
  task?: {
    id: string;
    title: string;
  } | null;
  label?: string | null;
}

/**
 * Rest status data
 */
export interface RestStatusData {
  restStartTime: string;
  restDuration: number;
  isLongRest: boolean;
  pomodoroCount: number;
  isOverRest: boolean;
  lastTaskId?: string;
  lastTaskTitle?: string;
}

/**
 * Machine state
 */
export interface PomodoroMachineState {
  phase: PomodoroPhase;
  pomodoro: PomodoroData | null;
  completedPomodoro: PomodoroData | null;
  restStatus: RestStatusData | null;
  systemState: SystemState | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Machine actions
 */
export interface PomodoroMachineActions {
  /** Start a new pomodoro (idle -> focus) */
  startPomodoro: (taskId: string, duration?: number) => Promise<void>;

  /** Start a taskless pomodoro (idle -> focus) */
  startTasklessPomodoro: (label?: string) => Promise<void>;

  /** Trigger pomodoro completion - idempotent (focus -> completing -> break_prompt) */
  triggerComplete: () => void;

  /** Confirm break and transition to rest (break_prompt -> resting) */
  confirmBreak: (summary?: string) => Promise<void>;

  /** Start next pomodoro from rest (resting -> focus) */
  startNextPomodoro: (taskId: string, duration?: number) => Promise<void>;

  /** Abort current pomodoro (focus -> idle) */
  abortPomodoro: () => Promise<void>;

  /** Reset machine state (for error recovery) */
  reset: () => void;
}

/**
 * Hook return type
 */
export interface UsePomodoroMachineReturn extends PomodoroMachineState {
  actions: PomodoroMachineActions;
}

/**
 * Central pomodoro state machine hook
 */
export function usePomodoroMachine(): UsePomodoroMachineReturn {
  // Local state
  const [phase, setPhase] = useState<PomodoroPhase>('loading');
  const [completedPomodoro, setCompletedPomodoro] = useState<PomodoroData | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Refs for idempotency
  const isCompletingRef = useRef(false);
  const lastCompletedIdRef = useRef<string | null>(null);

  // WebSocket for real-time state updates
  const { systemState: socketState } = useSocket();

  // tRPC utils for cache management
  const utils = trpc.useUtils();

  // tRPC queries
  const {
    data: currentPomodoro,
    isLoading: pomodoroLoading,
    refetch: refetchPomodoro,
  } = trpc.pomodoro.getCurrent.useQuery();

  const {
    data: dailyState,
    isLoading: dailyStateLoading,
  } = trpc.dailyState.getToday.useQuery();

  const {
    data: restStatus,
  } = trpc.dailyState.getRestStatus.useQuery(undefined, {
    enabled: phase === 'resting' || socketState === 'over_rest',
  });

  // tRPC mutations
  const startMutation = trpc.pomodoro.start.useMutation();
  const startTasklessMutation = trpc.pomodoro.startTaskless.useMutation();
  const completeMutation = trpc.pomodoro.complete.useMutation();
  const abortMutation = trpc.pomodoro.abort.useMutation();

  // Derive system state from WebSocket or daily state
  const systemState = useMemo(() => {
    return socketState || (dailyState?.systemState ? normalizeState(dailyState.systemState) : null);
  }, [socketState, dailyState?.systemState]);

  // Determine loading state
  const isLoading = pomodoroLoading || dailyStateLoading;

  // Track if user has explicitly set phase (to prevent server state from overriding)
  // This is cleared when server state matches the user's intent
  const [userIntentPhase, setUserIntentPhase] = useState<PomodoroPhase | null>(null);

  // Phase derivation based on server state
  // This syncs local phase with server state on initial load and WebSocket updates
  // IMPORTANT: currentPomodoro takes highest priority over systemState
  useEffect(() => {
    // Keep showing loading until we have enough data to make a decision
    if (isLoading) {
      setPhase('loading');
      return;
    }

    // Don't override local phases that are in transition
    if (phase === 'completing' || phase === 'break_prompt') {
      return;
    }

    // If user has explicitly set a phase intent, respect it until server catches up
    if (userIntentPhase !== null) {
      // Check if server state now matches user intent - if so, clear the intent
      // Note: 'resting' matches both 'idle' (rest is a sub-phase of idle) and 'over_rest'
      const serverMatchesIntent =
        (userIntentPhase === 'idle' && systemState !== 'over_rest') ||
        (userIntentPhase === 'focus' && currentPomodoro?.status === 'IN_PROGRESS') ||
        (userIntentPhase === 'resting' && (systemState === 'idle' || systemState === 'over_rest'));

      if (serverMatchesIntent) {
        console.log('[PomodoroMachine] Server caught up with user intent, clearing');
        setUserIntentPhase(null);
      } else {
        // Server hasn't caught up yet, keep the user's intended phase
        console.log('[PomodoroMachine] Respecting user intent phase:', userIntentPhase);
        if (phase !== userIntentPhase) {
          setPhase(userIntentPhase);
        }
        return;
      }
    }

    // PRIORITY 1: Active pomodoro always means focus phase
    // This prevents showing rest UI when there's actually an active pomodoro
    if (currentPomodoro && currentPomodoro.status === 'IN_PROGRESS') {
      if (phase !== 'focus') {
        console.log('[PomodoroMachine] Phase -> focus (active pomodoro detected)');
        setPhase('focus');
      }
      return;
    }

    // PRIORITY 2: If pomodoro query returned null/undefined but system state is 'focus',
    // there might be a timing issue - wait for next update
    if (systemState === 'focus' && !currentPomodoro) {
      console.log('[PomodoroMachine] systemState is focus but no pomodoro, waiting...');
      // Don't change phase yet, wait for pomodoro data to arrive
      return;
    }

    // PRIORITY 3: System state determines phase when no active pomodoro
    if (systemState === 'over_rest') {
      if (phase !== 'resting') {
        console.log('[PomodoroMachine] Phase -> resting (systemState:', systemState, ')');
        setPhase('resting');
      }
    } else {
      if (phase !== 'idle') {
        console.log('[PomodoroMachine] Phase -> idle (systemState:', systemState, ')');
        setPhase('idle');
      }
    }
  }, [isLoading, currentPomodoro, systemState, phase, userIntentPhase]);

  // Refresh data when WebSocket state changes
  useEffect(() => {
    if (socketState) {
      utils.dailyState.getToday.invalidate();
      utils.pomodoro.getCurrent.invalidate();
    }
  }, [socketState, utils]);

  /**
   * Start a new pomodoro
   */
  const startPomodoro = useCallback(async (taskId: string, duration?: number) => {
    if (phase !== 'idle' && phase !== 'resting') {
      console.warn('[PomodoroMachine] Cannot start pomodoro in phase:', phase);
      return;
    }

    console.log('[PomodoroMachine] startPomodoro called, current phase:', phase);

    try {
      setError(null);
      // Set user intent before API call to prevent phase flickering
      setUserIntentPhase('focus');
      setPhase('focus');

      await startMutation.mutateAsync({ taskId, duration });
      await Promise.all([
        utils.pomodoro.getCurrent.refetch(),
        utils.dailyState.getToday.refetch(),
      ]);
    } catch (err) {
      // On error, clear the intent and let server state take over
      setUserIntentPhase(null);
      setError(err instanceof Error ? err : new Error('Failed to start pomodoro'));
      throw err;
    }
  }, [phase, startMutation, utils]);

  /**
   * Start a taskless pomodoro
   */
  const startTasklessPomodoro = useCallback(async (label?: string) => {
    if (phase !== 'idle' && phase !== 'resting') {
      console.warn('[PomodoroMachine] Cannot start taskless pomodoro in phase:', phase);
      return;
    }

    try {
      setError(null);
      await startTasklessMutation.mutateAsync({ label });
      await Promise.all([
        utils.pomodoro.getCurrent.refetch(),
        utils.dailyState.getToday.refetch(),
      ]);
      setPhase('focus');
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to start taskless pomodoro'));
      throw err;
    }
  }, [phase, startTasklessMutation, utils]);

  /**
   * Trigger pomodoro completion - IDEMPOTENT
   * Safe to call multiple times, only executes once
   */
  const triggerComplete = useCallback(() => {
    // Idempotency check 1: Already completing
    if (isCompletingRef.current) {
      console.log('[PomodoroMachine] Ignoring triggerComplete: already completing');
      return;
    }

    // Idempotency check 2: Not in focus phase
    if (phase !== 'focus') {
      console.log('[PomodoroMachine] Ignoring triggerComplete: not in focus phase, current:', phase);
      return;
    }

    // Idempotency check 3: No current pomodoro
    if (!currentPomodoro) {
      console.log('[PomodoroMachine] Ignoring triggerComplete: no current pomodoro');
      return;
    }

    // Idempotency check 4: Already completed this pomodoro
    if (lastCompletedIdRef.current === currentPomodoro.id) {
      console.log('[PomodoroMachine] Ignoring triggerComplete: already completed this pomodoro');
      return;
    }

    console.log('[PomodoroMachine] Triggering completion for pomodoro:', currentPomodoro.id);

    // Mark as completing
    isCompletingRef.current = true;
    lastCompletedIdRef.current = currentPomodoro.id;

    // Save pomodoro data before it gets cleared
    setCompletedPomodoro({
      id: currentPomodoro.id,
      taskId: currentPomodoro.taskId,
      duration: currentPomodoro.duration,
      startTime: currentPomodoro.startTime,
      status: currentPomodoro.status,
      task: currentPomodoro.task,
      label: currentPomodoro.label,
    });

    setPhase('completing');

    // Call complete API
    completeMutation.mutate(
      { id: currentPomodoro.id },
      {
        onSuccess: async () => {
          console.log('[PomodoroMachine] Complete success, transitioning to break_prompt');
          await Promise.all([
            utils.pomodoro.getCurrent.refetch(),
            utils.dailyState.getToday.refetch(),
          ]);
          setPhase('break_prompt');
          isCompletingRef.current = false;
        },
        onError: (err) => {
          console.error('[PomodoroMachine] Complete failed:', err);
          setError(err instanceof Error ? err : new Error('Failed to complete pomodoro'));
          setPhase('focus');
          isCompletingRef.current = false;
          // Reset last completed ID so retry is possible
          lastCompletedIdRef.current = null;
        },
      }
    );
  }, [phase, currentPomodoro, completeMutation, utils]);

  /**
   * Confirm break and transition to rest
   * Server already set state to 'idle' during the complete mutation,
   * so we just update local phase.
   */
  const confirmBreak = useCallback(async (_summary?: string) => {
    if (phase !== 'break_prompt') {
      console.warn('[PomodoroMachine] Cannot confirm break in phase:', phase);
      return;
    }

    console.log('[PomodoroMachine] confirmBreak called');

    setError(null);
    setUserIntentPhase('resting');
    setPhase('resting');
    setCompletedPomodoro(null);
    await utils.dailyState.getToday.refetch();
  }, [phase, utils]);

  /**
   * Start next pomodoro from rest
   */
  const startNextPomodoro = useCallback(async (taskId: string, duration?: number) => {
    if (phase !== 'resting') {
      console.warn('[PomodoroMachine] Cannot start next pomodoro in phase:', phase);
      return;
    }

    try {
      setError(null);
      await startMutation.mutateAsync({ taskId, duration });
      await Promise.all([
        utils.pomodoro.getCurrent.refetch(),
        utils.dailyState.getToday.refetch(),
      ]);
      setPhase('focus');
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to start next pomodoro'));
      throw err;
    }
  }, [phase, startMutation, utils]);

  /**
   * Abort current pomodoro
   */
  const abortPomodoro = useCallback(async () => {
    if (phase !== 'focus') {
      console.warn('[PomodoroMachine] Cannot abort pomodoro in phase:', phase);
      return;
    }

    if (!currentPomodoro) {
      console.warn('[PomodoroMachine] No pomodoro to abort');
      return;
    }

    try {
      setError(null);
      await abortMutation.mutateAsync({ id: currentPomodoro.id });
      await Promise.all([
        utils.pomodoro.getCurrent.refetch(),
        utils.dailyState.getToday.refetch(),
      ]);
      setPhase('idle');
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to abort pomodoro'));
      throw err;
    }
  }, [phase, currentPomodoro, abortMutation, utils]);

  /**
   * Reset machine state (for error recovery)
   */
  const reset = useCallback(() => {
    setPhase('loading');
    setCompletedPomodoro(null);
    setError(null);
    isCompletingRef.current = false;
    lastCompletedIdRef.current = null;
    refetchPomodoro();
    utils.dailyState.getToday.invalidate();
  }, [refetchPomodoro, utils]);

  return {
    phase,
    pomodoro: currentPomodoro ?? null,
    completedPomodoro,
    restStatus: restStatus ?? null,
    systemState,
    isLoading,
    error,
    actions: {
      startPomodoro,
      startTasklessPomodoro,
      triggerComplete,
      confirmBreak,
      startNextPomodoro,
      abortPomodoro,
      reset,
    },
  };
}
