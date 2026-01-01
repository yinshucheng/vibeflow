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
export type SystemState = 'locked' | 'planning' | 'focus' | 'rest';

// Airlock wizard steps
export type AirlockStep = 'REVIEW' | 'PLAN' | 'COMMIT';

// Machine context
export interface VibeFlowContext {
  userId: string;
  currentTaskId: string | null;
  currentPomodoroId: string | null;
  todayPomodoroCount: number;
  dailyCap: number;
  top3TaskIds: string[];
  airlockStep: AirlockStep | null;
  restDuration: number; // in minutes
  pomodoroStartTime: Date | null;
  restStartTime: Date | null;
}

// Machine events
export type VibeFlowEvent =
  | { type: 'COMPLETE_AIRLOCK'; top3TaskIds: string[] }
  | { type: 'START_POMODORO'; taskId: string; pomodoroId: string }
  | { type: 'COMPLETE_POMODORO' }
  | { type: 'ABORT_POMODORO' }
  | { type: 'COMPLETE_REST' }
  | { type: 'DAILY_RESET' }
  | { type: 'OVERRIDE_CAP' }
  | { type: 'SET_AIRLOCK_STEP'; step: AirlockStep }
  | { type: 'INCREMENT_POMODORO_COUNT' }
  | { type: 'SET_DAILY_CAP'; cap: number }
  | { type: 'SYNC_STATE'; context: Partial<VibeFlowContext> };

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
    }),

    /**
     * Complete a pomodoro and increment count
     */
    completePomodoro: assign({
      todayPomodoroCount: ({ context }) => context.todayPomodoroCount + 1,
      currentPomodoroId: () => null,
      pomodoroStartTime: () => null,
      restStartTime: () => new Date(),
    }),

    /**
     * Abort a pomodoro session
     */
    abortPomodoro: assign({
      currentTaskId: () => null,
      currentPomodoroId: () => null,
      pomodoroStartTime: () => null,
    }),

    /**
     * Complete rest period
     */
    completeRest: assign({
      currentTaskId: () => null,
      restStartTime: () => null,
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
        COMPLETE_POMODORO: {
          target: 'rest',
          actions: 'completePomodoro',
        },
        ABORT_POMODORO: {
          target: 'planning',
          actions: 'abortPomodoro',
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
      return ['START_POMODORO', 'DAILY_RESET', 'SET_DAILY_CAP'];
    case 'focus':
      return ['COMPLETE_POMODORO', 'ABORT_POMODORO', 'DAILY_RESET'];
    case 'rest':
      return ['COMPLETE_REST', 'OVERRIDE_CAP', 'DAILY_RESET'];
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
  if (['locked', 'planning', 'focus', 'rest'].includes(normalized)) {
    return normalized as SystemState;
  }
  return 'locked'; // Default to locked for safety
}

/**
 * Map SystemState to database string
 */
export function serializeSystemState(state: SystemState): string {
  return state.toUpperCase();
}
