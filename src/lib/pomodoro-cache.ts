/**
 * Pomodoro State Cache Utility
 * 
 * Provides localStorage-based caching for pomodoro session state
 * to enable state persistence across page refreshes.
 * 
 * Requirements: 1.1, 1.5
 */

// Local Storage Key
const POMODORO_STATE_KEY = 'vibeflow_pomodoro_state';

/**
 * Cached pomodoro state structure stored in localStorage
 */
export interface CachedPomodoroState {
  id: string;
  taskId: string;
  taskTitle: string;
  duration: number;      // Total duration in minutes
  startTime: string;     // ISO string
  cachedAt: string;      // ISO string - when the state was cached
}

/**
 * Pomodoro data structure from server
 */
export interface PomodoroData {
  id: string;
  taskId: string;
  duration: number;
  startTime: Date | string;
  task: {
    id: string;
    title: string;
    projectId: string;
  };
}

/**
 * Cache the current pomodoro state to localStorage
 * 
 * Requirements: 1.1 - Store session state in local storage
 * 
 * @param pomodoro - The pomodoro session data to cache
 */
export function cachePomodoroState(pomodoro: PomodoroData): void {
  if (typeof window === 'undefined') return;
  
  const state: CachedPomodoroState = {
    id: pomodoro.id,
    taskId: pomodoro.taskId,
    taskTitle: pomodoro.task.title,
    duration: pomodoro.duration,
    startTime: pomodoro.startTime instanceof Date 
      ? pomodoro.startTime.toISOString() 
      : pomodoro.startTime,
    cachedAt: new Date().toISOString(),
  };
  
  try {
    localStorage.setItem(POMODORO_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to cache pomodoro state:', error);
  }
}

/**
 * Restore pomodoro state from localStorage
 * 
 * Returns null if:
 * - No cached state exists
 * - The cached session has expired (endTime < now)
 * - The cached data is invalid
 * 
 * Requirements: 1.1, 1.5 - Restore state and handle expiration
 * 
 * @returns The cached state if valid and not expired, null otherwise
 */
export function restorePomodoroState(): CachedPomodoroState | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const cached = localStorage.getItem(POMODORO_STATE_KEY);
    if (!cached) return null;
    
    const state: CachedPomodoroState = JSON.parse(cached);
    
    // Validate required fields
    if (!state.id || !state.taskId || !state.duration || !state.startTime) {
      clearPomodoroCache();
      return null;
    }
    
    // Check if session has expired
    const startTime = new Date(state.startTime);
    const endTime = new Date(startTime.getTime() + state.duration * 60 * 1000);
    
    if (endTime < new Date()) {
      // Session has expired - clear cache but return state for completion handling
      // The caller should handle the expired session appropriately
      return state;
    }
    
    return state;
  } catch (error) {
    console.error('Failed to restore pomodoro state:', error);
    clearPomodoroCache();
    return null;
  }
}

/**
 * Clear the cached pomodoro state from localStorage
 * 
 * Requirements: 1.5 - Clear local storage state when session ends
 */
export function clearPomodoroCache(): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(POMODORO_STATE_KEY);
  } catch (error) {
    console.error('Failed to clear pomodoro cache:', error);
  }
}

/**
 * Calculate remaining seconds for a pomodoro session
 * 
 * Requirements: 1.2 - Calculate accurate remaining time
 * 
 * @param startTime - Session start time (Date or ISO string)
 * @param duration - Total duration in minutes
 * @returns Remaining seconds (minimum 0)
 */
export function calculateRemainingSeconds(
  startTime: Date | string,
  duration: number
): number {
  const start = startTime instanceof Date ? startTime : new Date(startTime);
  const endTime = start.getTime() + duration * 60 * 1000;
  const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
  return remaining;
}

/**
 * Check if a cached pomodoro session has expired
 * 
 * @param state - The cached state to check
 * @returns true if the session has expired
 */
export function isSessionExpired(state: CachedPomodoroState): boolean {
  const startTime = new Date(state.startTime);
  const endTime = new Date(startTime.getTime() + state.duration * 60 * 1000);
  return endTime < new Date();
}

/**
 * Get the localStorage key used for caching
 * Exported for testing purposes
 */
export function getPomodoroStateKey(): string {
  return POMODORO_STATE_KEY;
}
