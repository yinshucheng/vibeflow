/**
 * State Utility Functions
 *
 * Shared utilities for the 3-state model (idle/focus/over_rest).
 * Used by both server-side and client-side code.
 */

/**
 * The three system states in the new state model.
 * - idle: Not in a pomodoro (daily base state, includes rest sub-phase)
 * - focus: Pomodoro in progress
 * - over_rest: Exceeded rest time during work hours
 */
export type SystemState = 'idle' | 'focus' | 'over_rest';

/**
 * Map any raw state string (from DB or legacy code) to the new 3-state model.
 * Handles both old 5-state values and new 3-state values, case-insensitive.
 *
 * Mapping:
 *   locked   → idle
 *   planning → idle
 *   rest     → idle
 *   idle     → idle
 *   focus    → focus
 *   over_rest / overrest → over_rest
 *   unknown  → idle
 */
export function normalizeState(raw: string): SystemState {
  const lower = raw.toLowerCase();
  switch (lower) {
    case 'idle':
    case 'locked':
    case 'planning':
    case 'rest':
      return 'idle';
    case 'focus':
      return 'focus';
    case 'over_rest':
    case 'overrest':
      return 'over_rest';
    default:
      return 'idle';
  }
}

/**
 * Serialize a SystemState for DB storage (UPPERCASE).
 * Only writes the 3 new values: IDLE, FOCUS, OVER_REST.
 */
export function serializeState(state: SystemState): string {
  if (state === 'over_rest') {
    return 'OVER_REST';
  }
  return state.toUpperCase();
}
