/**
 * VibeFlow State Machine — 3-State Model
 *
 * States: IDLE, FOCUS, OVER_REST
 * Engine: XState v5 used as a pure-function transition validator (no actors).
 *
 * Design: .kiro/specs/state-management-overhaul/design.md
 */

import { assign, setup } from 'xstate';
import {
  normalizeState,
  serializeState,
  type SystemState,
} from '@/lib/state-utils';

// Re-export the canonical SystemState from state-utils
export type { SystemState } from '@/lib/state-utils';

// ── Types ──────────────────────────────────────────────────────────

/** @deprecated Airlock is removed in the 3-state model */
export type AirlockStep = 'REVIEW' | 'PLAN' | 'COMMIT';

export interface TaskStackEntry {
  taskId: string | null; // null = taskless segment
  startTime: number; // epoch ms (was Date, now number for serialisation)
}

export interface VibeFlowContext {
  userId: string;
  todayPomodoroCount: number;
  dailyCap: number;

  // Pomodoro-related
  currentPomodoroId: string | null;
  currentTaskId: string | null;
  pomodoroStartTime: number | null; // epoch ms
  taskStack: TaskStackEntry[];
  isTaskless: boolean;

  // Rest tracking (IDLE sub-phase)
  lastPomodoroEndTime: number | null; // epoch ms, set on COMPLETE_POMODORO

  // OVER_REST exit constraints
  overRestEnteredAt: number | null; // epoch ms
  overRestExitCount: number; // daily counter for RETURN_TO_IDLE
}

export type VibeFlowEvent =
  | { type: 'START_POMODORO'; pomodoroId: string; taskId: string | null; isTaskless?: boolean }
  | { type: 'COMPLETE_POMODORO' }
  | { type: 'ABORT_POMODORO' }
  | { type: 'SWITCH_TASK'; taskId: string; timeSliceId: string }
  | { type: 'COMPLETE_CURRENT_TASK' }
  | { type: 'ENTER_OVER_REST' }
  | { type: 'RETURN_TO_IDLE' }
  | { type: 'WORK_TIME_ENDED' }
  | { type: 'DAILY_RESET' };

export interface VibeFlowInput {
  userId: string;
  dailyCap?: number;
  todayPomodoroCount?: number;
}

// ── Machine ────────────────────────────────────────────────────────

/** OVER_REST cooldown: 10 minutes before user can RETURN_TO_IDLE */
const OVER_REST_COOLDOWN_MS = 10 * 60 * 1000;
/** Max RETURN_TO_IDLE per day */
const MAX_OVER_REST_EXITS = 3;

export const vibeflowMachine = setup({
  types: {
    context: {} as VibeFlowContext,
    events: {} as VibeFlowEvent,
    input: {} as VibeFlowInput,
  },
  guards: {
    canStartPomodoro: ({ context }) =>
      context.todayPomodoroCount < context.dailyCap,

    canReturnToIdle: ({ context }) => {
      if (context.overRestExitCount >= MAX_OVER_REST_EXITS) return false;
      if (!context.overRestEnteredAt) return false;
      const elapsed = Date.now() - context.overRestEnteredAt;
      return elapsed >= OVER_REST_COOLDOWN_MS;
    },
  },
  actions: {
    startPomodoro: assign(({ context, event }) => {
      if (event.type !== 'START_POMODORO') return {};
      const now = Date.now();
      return {
        currentPomodoroId: event.pomodoroId,
        currentTaskId: event.taskId,
        pomodoroStartTime: now,
        isTaskless: event.isTaskless ?? false,
        taskStack: event.taskId
          ? [{ taskId: event.taskId, startTime: now }]
          : [],
        lastPomodoroEndTime: null,
        overRestEnteredAt: null,
      };
    }),

    completePomodoro: assign({
      currentPomodoroId: () => null,
      currentTaskId: () => null,
      pomodoroStartTime: () => null,
      taskStack: () => [] as TaskStackEntry[],
      isTaskless: () => false,
      todayPomodoroCount: ({ context }) => context.todayPomodoroCount + 1,
      lastPomodoroEndTime: () => Date.now(),
    }),

    abortPomodoro: assign({
      currentPomodoroId: () => null,
      currentTaskId: () => null,
      pomodoroStartTime: () => null,
      taskStack: () => [] as TaskStackEntry[],
      isTaskless: () => false,
      // Intentionally NOT setting lastPomodoroEndTime:
      // abort = user chose to stop, should NOT be penalised with OVER_REST.
    }),

    enterOverRest: assign({
      overRestEnteredAt: () => Date.now(),
    }),

    returnToIdle: assign(({ context }) => ({
      overRestEnteredAt: null,
      overRestExitCount: context.overRestExitCount + 1,
    })),

    resetDaily: assign({
      todayPomodoroCount: () => 0,
      currentPomodoroId: () => null,
      currentTaskId: () => null,
      pomodoroStartTime: () => null,
      taskStack: () => [] as TaskStackEntry[],
      isTaskless: () => false,
      lastPomodoroEndTime: () => null,
      overRestEnteredAt: () => null,
      overRestExitCount: () => 0,
    }),

    switchTask: assign(({ context, event }) => {
      if (event.type !== 'SWITCH_TASK') return {};
      return {
        currentTaskId: event.taskId,
        taskStack: [
          ...context.taskStack,
          { taskId: event.taskId, startTime: Date.now() },
        ],
      };
    }),

    completeCurrentTask: assign(({ context }) => ({
      currentTaskId: null,
      taskStack: [
        ...context.taskStack,
        { taskId: null, startTime: Date.now() },
      ],
    })),
  },
}).createMachine({
  id: 'vibeflow',
  initial: 'idle',
  context: ({ input }) => ({
    userId: input.userId,
    todayPomodoroCount: input.todayPomodoroCount ?? 0,
    dailyCap: input.dailyCap ?? 8,
    currentPomodoroId: null,
    currentTaskId: null,
    pomodoroStartTime: null,
    taskStack: [],
    isTaskless: false,
    lastPomodoroEndTime: null,
    overRestEnteredAt: null,
    overRestExitCount: 0,
  }),
  states: {
    idle: {
      on: {
        START_POMODORO: {
          target: 'focus',
          guard: 'canStartPomodoro',
          actions: 'startPomodoro',
        },
        ENTER_OVER_REST: {
          target: 'over_rest',
          actions: 'enterOverRest',
        },
        DAILY_RESET: {
          target: 'idle',
          actions: 'resetDaily',
        },
      },
    },
    focus: {
      on: {
        COMPLETE_POMODORO: {
          target: 'idle',
          actions: 'completePomodoro',
        },
        ABORT_POMODORO: {
          target: 'idle',
          actions: 'abortPomodoro',
        },
        SWITCH_TASK: {
          actions: 'switchTask',
        },
        COMPLETE_CURRENT_TASK: {
          actions: 'completeCurrentTask',
        },
        DAILY_RESET: {
          target: 'idle',
          actions: 'resetDaily',
        },
      },
    },
    over_rest: {
      on: {
        START_POMODORO: {
          target: 'focus',
          guard: 'canStartPomodoro',
          actions: 'startPomodoro',
        },
        RETURN_TO_IDLE: {
          target: 'idle',
          guard: 'canReturnToIdle',
          actions: 'returnToIdle',
        },
        WORK_TIME_ENDED: {
          target: 'idle',
          // No guard — unconditional when work time ends
          actions: 'returnToIdle',
        },
        DAILY_RESET: {
          target: 'idle',
          actions: 'resetDaily',
        },
      },
    },
  },
});

// Legacy alias for backward compatibility — prefer vibeflowMachine
export const vibeFlowMachine = vibeflowMachine;

export type VibeFlowMachine = typeof vibeflowMachine;

// ── Helper functions ───────────────────────────────────────────────

/**
 * Get allowed events for a given state.
 */
export function getAllowedEvents(state: SystemState): string[] {
  switch (state) {
    case 'idle':
      return ['START_POMODORO', 'ENTER_OVER_REST', 'DAILY_RESET'];
    case 'focus':
      return ['COMPLETE_POMODORO', 'ABORT_POMODORO', 'SWITCH_TASK', 'COMPLETE_CURRENT_TASK', 'DAILY_RESET'];
    case 'over_rest':
      return ['START_POMODORO', 'RETURN_TO_IDLE', 'WORK_TIME_ENDED', 'DAILY_RESET'];
    default:
      return [];
  }
}

/**
 * Check if an event is allowed in the current state.
 */
export function isEventAllowed(state: SystemState, eventType: string): boolean {
  return getAllowedEvents(state).includes(eventType);
}

/**
 * State display information for UI components.
 */
export interface StateDisplayInfo {
  state: SystemState;
  label: string;
  color: string;
  icon: string;
  description: string;
}

export function getStateDisplayInfo(state: SystemState): StateDisplayInfo {
  switch (state) {
    case 'idle':
      return {
        state: 'idle',
        label: 'Idle',
        color: 'blue',
        icon: '📋',
        description: 'Ready to start a focus session',
      };
    case 'focus':
      return {
        state: 'focus',
        label: 'Focus',
        color: 'green',
        icon: '🎯',
        description: 'Deep work in progress',
      };
    case 'over_rest':
      return {
        state: 'over_rest',
        label: 'Over Rest',
        color: 'orange',
        icon: '⚠️',
        description: 'Break time exceeded - consider starting a new focus session',
      };
    default:
      return {
        state: 'idle',
        label: 'Unknown',
        color: 'gray',
        icon: '❓',
        description: 'Unknown state',
      };
  }
}

/**
 * Validate state transition.
 * Returns error message if transition is invalid, null if valid.
 */
export function validateTransition(
  currentState: SystemState,
  eventType: string,
): string | null {
  if (!isEventAllowed(currentState, eventType)) {
    return `Cannot perform ${eventType} while in ${currentState} state. Allowed events: ${getAllowedEvents(currentState).join(', ')}`;
  }
  return null;
}

/**
 * Map database state string to SystemState type.
 * Delegates to normalizeState for the 3-state mapping.
 * @deprecated Use normalizeState from '@/lib/state-utils' directly.
 */
export function parseSystemState(stateString: string): SystemState {
  return normalizeState(stateString);
}

/**
 * Map SystemState to database string (UPPERCASE).
 * @deprecated Use serializeState from '@/lib/state-utils' directly.
 */
export function serializeSystemState(state: SystemState): string {
  return serializeState(state);
}
