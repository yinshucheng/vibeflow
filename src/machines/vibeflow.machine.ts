/**
 * VibeFlow State Machine
 * 
 * Implements the core system state management using XState v5.
 * States: LOCKED, PLANNING, FOCUS, REST
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7
 */

import { createMachine, assign, setup } from 'xstate';

// System states
export type SystemState = 'locked' | 'planning' | 'focus' | 'rest' | 'over_rest';

// Airlock wizard steps
export type AirlockStep = 'REVIEW' | 'PLAN' | 'COMMIT';

// Task stack entry for multi-task tracking (Req 1)
export interface TaskStackEntry {
  taskId: string | null;  // null = taskless segment
  startedAt: Date;
}

// Machine context
export interface VibeFlowContext {
  userId: string;
  /** @deprecated Use taskStack.at(-1)?.taskId instead */
  currentTaskId: string | null;
  currentPomodoroId: string | null;
  todayPomodoroCount: number;
  dailyCap: number;
  top3TaskIds: string[];
  airlockStep: AirlockStep | null;
  restDuration: number; // in minutes
  pomodoroStartTime: Date | null;
  restStartTime: Date | null;
  overRestStartTime: Date | null;
  // Multi-task enhancement fields (Req 1, 3)
  taskStack: TaskStackEntry[];
  currentTimeSliceId: string | null;
  isTaskless: boolean;
}

// Machine events
export type VibeFlowEvent =
  | { type: 'COMPLETE_AIRLOCK'; top3TaskIds: string[] }
  | { type: 'START_POMODORO'; taskId: string; pomodoroId: string }
  | { type: 'START_TASKLESS_POMODORO'; pomodoroId: string; label?: string }
  | { type: 'COMPLETE_POMODORO' }
  | { type: 'ABORT_POMODORO' }
  | { type: 'COMPLETE_REST' }
  | { type: 'ENTER_OVER_REST' }
  | { type: 'DAILY_RESET' }
  | { type: 'OVERRIDE_CAP' }
  | { type: 'SET_AIRLOCK_STEP'; step: AirlockStep }
  | { type: 'INCREMENT_POMODORO_COUNT' }
  | { type: 'SET_DAILY_CAP'; cap: number }
  | { type: 'SYNC_STATE'; context: Partial<VibeFlowContext> }
  // Multi-task enhancement events (Req 1, 2, 3)
  | { type: 'SWITCH_TASK'; taskId: string | null; timeSliceId: string }
  | { type: 'ASSOCIATE_TASK'; taskId: string; timeSliceId: string }
  | { type: 'COMPLETE_CURRENT_TASK' };

// Input for machine initialization
export interface VibeFlowInput {
  userId: string;
  dailyCap?: number;
  todayPomodoroCount?: number;
  top3TaskIds?: string[];
  airlockCompleted?: boolean;
  currentPomodoroId?: string | null;
  currentTaskId?: string | null;
}

// Default context values
const defaultContext: VibeFlowContext = {
  userId: '',
  currentTaskId: null,
  currentPomodoroId: null,
  todayPomodoroCount: 0,
  dailyCap: 8,
  top3TaskIds: [],
  airlockStep: 'REVIEW',
  restDuration: 5,
  pomodoroStartTime: null,
  restStartTime: null,
  overRestStartTime: null,
  // Multi-task enhancement defaults
  taskStack: [],
  currentTimeSliceId: null,
  isTaskless: false,
};


/**
 * VibeFlow State Machine Definition
 * 
 * State Transitions:
 * - LOCKED → PLANNING (via COMPLETE_AIRLOCK)
 * - PLANNING → FOCUS (via START_POMODORO)
 * - FOCUS → REST (via COMPLETE_POMODORO)
 * - FOCUS → PLANNING (via ABORT_POMODORO)
 * - REST → PLANNING (via COMPLETE_REST)
 * - Any state → LOCKED (via DAILY_RESET)
 */
export const vibeFlowMachine = setup({
  types: {
    context: {} as VibeFlowContext,
    events: {} as VibeFlowEvent,
    input: {} as VibeFlowInput,
  },
  guards: {
    /**
     * Check if user can start a new pomodoro
     * Requirements: 12.2, 12.3
     */
    canStartPomodoro: ({ context }) => {
      // Cannot start if daily cap is reached
      return context.todayPomodoroCount < context.dailyCap;
    },

    /**
     * Check if daily cap has been reached
     * Requirements: 12.2
     */
    isDailyCapped: ({ context }) => {
      return context.todayPomodoroCount >= context.dailyCap;
    },

    /**
     * Check if airlock has valid top 3 tasks
     * Requirements: 3.8
     */
    hasValidTop3: ({ event }) => {
      if (event.type !== 'COMPLETE_AIRLOCK') return false;
      return event.top3TaskIds.length === 3;
    },

    /**
     * Check if there's an active pomodoro
     */
    hasActivePomodoro: ({ context }) => {
      return context.currentPomodoroId !== null;
    },

    /**
     * Check if system is currently in over-rest state
     */
    isInOverRest: ({ context }) => {
      return context.overRestStartTime !== null;
    },
  },
  actions: {
    /**
     * Set top 3 tasks from airlock completion
     */
    setTop3Tasks: assign({
      top3TaskIds: ({ event }) => {
        if (event.type === 'COMPLETE_AIRLOCK') {
          return event.top3TaskIds;
        }
        return [];
      },
      airlockStep: () => null,
    }),

    /**
     * Start a pomodoro session
     */
    startPomodoro: assign({
      currentTaskId: ({ event }) => {
        if (event.type === 'START_POMODORO') {
          return event.taskId;
        }
        return null;
      },
      currentPomodoroId: ({ event }) => {
        if (event.type === 'START_POMODORO') {
          return event.pomodoroId;
        }
        return null;
      },
      pomodoroStartTime: () => new Date(),
      overRestStartTime: () => null, // Exit over-rest when starting pomodoro
      // Multi-task: initialize taskStack with the starting task
      taskStack: ({ event }) => {
        if (event.type === 'START_POMODORO') {
          return [{ taskId: event.taskId, startedAt: new Date() }];
        }
        return [];
      },
      isTaskless: () => false,
      currentTimeSliceId: () => null,
    }),

    /**
     * Start a taskless pomodoro session (Req 3)
     */
    startTasklessPomodoro: assign({
      currentTaskId: () => null,
      currentPomodoroId: ({ event }) => {
        if (event.type === 'START_TASKLESS_POMODORO') {
          return event.pomodoroId;
        }
        return null;
      },
      pomodoroStartTime: () => new Date(),
      overRestStartTime: () => null,
      taskStack: () => [],
      isTaskless: () => true,
      currentTimeSliceId: () => null,
    }),

    /**
     * Switch to a different task during pomodoro (Req 1)
     */
    switchTask: assign({
      taskStack: ({ context, event }) => {
        if (event.type === 'SWITCH_TASK') {
          return [...context.taskStack, { taskId: event.taskId, startedAt: new Date() }];
        }
        return context.taskStack;
      },
      currentTaskId: ({ event }) => {
        if (event.type === 'SWITCH_TASK') {
          return event.taskId;
        }
        return null;
      },
      currentTimeSliceId: ({ event }) => {
        if (event.type === 'SWITCH_TASK') {
          return event.timeSliceId;
        }
        return null;
      },
    }),

    /**
     * Complete current task during pomodoro (Req 2)
     */
    completeCurrentTask: assign({
      taskStack: ({ context }) => [
        ...context.taskStack,
        { taskId: null, startedAt: new Date() },
      ],
      currentTaskId: () => null,
    }),

    /**
     * Associate a task to a taskless pomodoro (Req 3)
     */
    associateTask: assign({
      isTaskless: () => false,
      taskStack: ({ event }) => {
        if (event.type === 'ASSOCIATE_TASK') {
          return [{ taskId: event.taskId, startedAt: new Date() }];
        }
        return [];
      },
      currentTaskId: ({ event }) => {
        if (event.type === 'ASSOCIATE_TASK') {
          return event.taskId;
        }
        return null;
      },
      currentTimeSliceId: ({ event }) => {
        if (event.type === 'ASSOCIATE_TASK') {
          return event.timeSliceId;
        }
        return null;
      },
    }),

    /**
     * Complete a pomodoro and increment count
     */
    completePomodoro: assign({
      todayPomodoroCount: ({ context }) => context.todayPomodoroCount + 1,
      currentPomodoroId: () => null,
      pomodoroStartTime: () => null,
      restStartTime: () => new Date(),
      // Reset multi-task fields
      taskStack: () => [],
      currentTimeSliceId: () => null,
      isTaskless: () => false,
    }),

    /**
     * Complete a pomodoro when already in over-rest
     * Stay in over-rest state, don't start new rest period
     */
    completePomodoroInOverRest: assign({
      todayPomodoroCount: ({ context }) => context.todayPomodoroCount + 1,
      currentPomodoroId: () => null,
      pomodoroStartTime: () => null,
      // Keep existing overRestStartTime, don't start new rest
      // Reset multi-task fields
      taskStack: () => [],
      currentTimeSliceId: () => null,
      isTaskless: () => false,
    }),

    /**
     * Abort a pomodoro session
     */
    abortPomodoro: assign({
      currentTaskId: () => null,
      currentPomodoroId: () => null,
      pomodoroStartTime: () => null,
      // Reset multi-task fields
      taskStack: () => [],
      currentTimeSliceId: () => null,
      isTaskless: () => false,
    }),

    /**
     * Complete rest period
     */
    completeRest: assign({
      currentTaskId: () => null,
      restStartTime: () => null,
    }),

    /**
     * Enter over-rest state
     */
    enterOverRest: assign({
      overRestStartTime: () => new Date(),
      restStartTime: () => null,
    }),

    /**
     * Exit over-rest state (when starting new pomodoro)
     */
    exitOverRest: assign({
      overRestStartTime: () => null,
    }),

    /**
     * Reset daily state for new day
     */
    resetDaily: assign({
      todayPomodoroCount: () => 0,
      top3TaskIds: () => [],
      airlockStep: () => 'REVIEW' as AirlockStep,
      currentTaskId: () => null,
      currentPomodoroId: () => null,
      pomodoroStartTime: () => null,
      restStartTime: () => null,
      overRestStartTime: () => null,
      // Reset multi-task fields
      taskStack: () => [],
      currentTimeSliceId: () => null,
      isTaskless: () => false,
    }),

    /**
     * Set airlock step
     */
    setAirlockStep: assign({
      airlockStep: ({ event }) => {
        if (event.type === 'SET_AIRLOCK_STEP') {
          return event.step;
        }
        return null;
      },
    }),

    /**
     * Set daily cap
     */
    setDailyCap: assign({
      dailyCap: ({ event }) => {
        if (event.type === 'SET_DAILY_CAP') {
          return event.cap;
        }
        return 8;
      },
    }),

    /**
     * Sync state from external source
     */
    syncState: assign(({ context, event }) => {
      if (event.type === 'SYNC_STATE') {
        return { ...context, ...event.context };
      }
      return context;
    }),
  },
}).createMachine({
  id: 'vibeflow',
  initial: 'locked',
  context: ({ input }) => ({
    ...defaultContext,
    userId: input.userId,
    dailyCap: input.dailyCap ?? defaultContext.dailyCap,
    todayPomodoroCount: input.todayPomodoroCount ?? 0,
    top3TaskIds: input.top3TaskIds ?? [],
    currentPomodoroId: input.currentPomodoroId ?? null,
    currentTaskId: input.currentTaskId ?? null,
    airlockStep: input.airlockCompleted ? null : 'REVIEW',
  }),
  states: {
    /**
     * LOCKED State
     * Requirements: 5.3 - Only allow Morning_Airlock interactions
     */
    locked: {
      on: {
        COMPLETE_AIRLOCK: {
          target: 'planning',
          guard: 'hasValidTop3',
          actions: 'setTop3Tasks',
        },
        SET_AIRLOCK_STEP: {
          actions: 'setAirlockStep',
        },
        SYNC_STATE: {
          actions: 'syncState',
        },
      },
    },

    /**
     * PLANNING State
     * Requirements: 5.4 - Allow Task management and Pomodoro start
     */
    planning: {
      on: {
        START_POMODORO: {
          target: 'focus',
          guard: 'canStartPomodoro',
          actions: 'startPomodoro',
        },
        START_TASKLESS_POMODORO: {
          target: 'focus',
          guard: 'canStartPomodoro',
          actions: 'startTasklessPomodoro',
        },
        ENTER_OVER_REST: {
          target: 'over_rest',
          actions: 'enterOverRest',
        },
        DAILY_RESET: {
          target: 'locked',
          actions: 'resetDaily',
        },
        SET_DAILY_CAP: {
          actions: 'setDailyCap',
        },
        SYNC_STATE: {
          actions: 'syncState',
        },
      },
    },

    /**
     * FOCUS State
     * Requirements: 5.5 - Minimize UI distractions, show only current Task and timer
     */
    focus: {
      on: {
        COMPLETE_POMODORO: [
          {
            target: 'over_rest',
            guard: 'isInOverRest',
            actions: 'completePomodoroInOverRest',
          },
          {
            target: 'rest',
            actions: 'completePomodoro',
          },
        ],
        ABORT_POMODORO: {
          target: 'planning',
          actions: 'abortPomodoro',
        },
        // Multi-task events (Req 1, 2, 3)
        SWITCH_TASK: {
          actions: 'switchTask',
        },
        ASSOCIATE_TASK: {
          actions: 'associateTask',
        },
        COMPLETE_CURRENT_TASK: {
          actions: 'completeCurrentTask',
        },
        DAILY_RESET: {
          target: 'locked',
          actions: 'resetDaily',
        },
        SYNC_STATE: {
          actions: 'syncState',
        },
      },
    },

    /**
     * REST State
     * Requirements: 5.6 - Display rest countdown and motivational content
     */
    rest: {
      on: {
        COMPLETE_REST: [
          {
            target: 'planning',
            guard: { type: 'isDailyCapped', params: {} },
            actions: 'completeRest',
          },
          {
            target: 'planning',
            actions: 'completeRest',
          },
        ],
        ENTER_OVER_REST: {
          target: 'over_rest',
          actions: 'enterOverRest',
        },
        OVERRIDE_CAP: {
          target: 'planning',
          actions: 'completeRest',
        },
        DAILY_RESET: {
          target: 'locked',
          actions: 'resetDaily',
        },
        SYNC_STATE: {
          actions: 'syncState',
        },
      },
    },

    /**
     * OVER_REST State
     * Requirements: 7.1-7.9 - Handle over-rest state transitions
     */
    over_rest: {
      on: {
        START_POMODORO: {
          target: 'focus',
          guard: 'canStartPomodoro',
          actions: 'startPomodoro',
        },
        START_TASKLESS_POMODORO: {
          target: 'focus',
          guard: 'canStartPomodoro',
          actions: 'startTasklessPomodoro',
        },
        DAILY_RESET: {
          target: 'locked',
          actions: 'resetDaily',
        },
        SYNC_STATE: {
          actions: 'syncState',
        },
      },
    },
  },
});

// Export machine type for use in other files
export type VibeFlowMachine = typeof vibeFlowMachine;


/**
 * Helper functions for state machine operations
 */

/**
 * Get allowed events for a given state
 * Requirements: 5.2 - Update UI to reflect available actions
 */
export function getAllowedEvents(state: SystemState): string[] {
  switch (state) {
    case 'locked':
      return ['COMPLETE_AIRLOCK', 'SET_AIRLOCK_STEP'];
    case 'planning':
      return ['START_POMODORO', 'ENTER_OVER_REST', 'DAILY_RESET', 'SET_DAILY_CAP'];
    case 'focus':
      return ['COMPLETE_POMODORO', 'ABORT_POMODORO', 'DAILY_RESET'];
    case 'rest':
      return ['COMPLETE_REST', 'ENTER_OVER_REST', 'OVERRIDE_CAP', 'DAILY_RESET'];
    case 'over_rest':
      return ['START_POMODORO', 'DAILY_RESET'];
    default:
      return [];
  }
}

/**
 * Check if an event is allowed in the current state
 */
export function isEventAllowed(state: SystemState, eventType: string): boolean {
  return getAllowedEvents(state).includes(eventType);
}

/**
 * Get state display information
 * Requirements: 5.7 - Display current System_State visually
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
    case 'locked':
      return {
        state: 'locked',
        label: 'Locked',
        color: 'gray',
        icon: '🔒',
        description: 'Complete the Morning Airlock to start your day',
      };
    case 'planning':
      return {
        state: 'planning',
        label: 'Planning',
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
    case 'rest':
      return {
        state: 'rest',
        label: 'Rest',
        color: 'purple',
        icon: '☕',
        description: 'Take a break, you earned it',
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
        state: 'locked',
        label: 'Unknown',
        color: 'gray',
        icon: '❓',
        description: 'Unknown state',
      };
  }
}

/**
 * Validate state transition
 * Returns error message if transition is invalid, null if valid
 */
export function validateTransition(
  currentState: SystemState,
  eventType: string
): string | null {
  if (!isEventAllowed(currentState, eventType)) {
    return `Cannot perform ${eventType} while in ${currentState} state. Allowed events: ${getAllowedEvents(currentState).join(', ')}`;
  }
  return null;
}

/**
 * Map database state string to SystemState type
 */
export function parseSystemState(stateString: string): SystemState {
  const normalized = stateString.toLowerCase();
  // Handle both underscore and non-underscore formats for compatibility
  if (normalized === 'over_rest' || normalized === 'overrest') {
    return 'over_rest';
  }
  if (['locked', 'planning', 'focus', 'rest'].includes(normalized)) {
    return normalized as SystemState;
  }
  return 'locked'; // Default to locked for safety
}

/**
 * Map SystemState to database string
 */
export function serializeSystemState(state: SystemState): string {
  // Convert over_rest to OVER_REST for database storage
  if (state === 'over_rest') {
    return 'OVER_REST';
  }
  return state.toUpperCase();
}
