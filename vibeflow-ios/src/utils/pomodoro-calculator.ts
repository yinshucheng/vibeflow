/**
 * Pomodoro Time Calculator
 *
 * Utility functions for calculating and formatting pomodoro time.
 * All calculations are based on server-synced startTime.
 *
 * Requirements: 4.2
 */

import type { ActivePomodoroData } from '@/types';

// =============================================================================
// TIME CALCULATION
// =============================================================================

/**
 * Calculate remaining seconds for an active pomodoro
 *
 * @param pomodoro Active pomodoro data with startTime and duration
 * @returns Remaining seconds (non-negative, 0 when time is up)
 */
export function calculateRemainingTime(pomodoro: ActivePomodoroData): number {
  const elapsedMs = Date.now() - pomodoro.startTime;
  const totalMs = pomodoro.duration * 60 * 1000;
  const remainingMs = Math.max(0, totalMs - elapsedMs);
  return Math.ceil(remainingMs / 1000);
}

/**
 * Calculate remaining seconds with a custom current time
 * Useful for testing and offline mode estimation
 *
 * @param pomodoro Active pomodoro data
 * @param currentTime Current timestamp to use for calculation
 * @returns Remaining seconds (non-negative)
 */
export function calculateRemainingTimeAt(
  pomodoro: ActivePomodoroData,
  currentTime: number
): number {
  const elapsedMs = currentTime - pomodoro.startTime;
  const totalMs = pomodoro.duration * 60 * 1000;
  const remainingMs = Math.max(0, totalMs - elapsedMs);
  return Math.ceil(remainingMs / 1000);
}

// =============================================================================
// TIME FORMATTING
// =============================================================================

/**
 * Format seconds as MM:SS string
 *
 * @param seconds Total seconds to format
 * @returns Formatted string like "25:00" or "05:30"
 */
export function formatRemainingTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format seconds as human-readable string (Chinese)
 *
 * @param seconds Total seconds
 * @returns Formatted string like "25分钟" or "5分30秒"
 */
export function formatRemainingTimeHuman(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;

  if (mins === 0) {
    return `${secs}秒`;
  }
  if (secs === 0) {
    return `${mins}分钟`;
  }
  return `${mins}分${secs}秒`;
}

// =============================================================================
// PROGRESS CALCULATION
// =============================================================================

/**
 * Calculate progress percentage (0-100)
 *
 * @param pomodoro Active pomodoro data
 * @returns Progress percentage from 0 to 100
 */
export function calculateProgress(pomodoro: ActivePomodoroData): number {
  const elapsedMs = Date.now() - pomodoro.startTime;
  const totalMs = pomodoro.duration * 60 * 1000;
  const progress = (elapsedMs / totalMs) * 100;
  return Math.min(100, Math.max(0, progress));
}

/**
 * Calculate progress with a custom current time
 *
 * @param pomodoro Active pomodoro data
 * @param currentTime Current timestamp
 * @returns Progress percentage from 0 to 100
 */
export function calculateProgressAt(
  pomodoro: ActivePomodoroData,
  currentTime: number
): number {
  const elapsedMs = currentTime - pomodoro.startTime;
  const totalMs = pomodoro.duration * 60 * 1000;
  const progress = (elapsedMs / totalMs) * 100;
  return Math.min(100, Math.max(0, progress));
}

// =============================================================================
// POMODORO COUNT FORMATTING
// =============================================================================

/**
 * Format pomodoro count display
 *
 * @param completed Number of completed pomodoros
 * @param dailyCap Daily cap (target)
 * @returns Formatted string like "3/8 番茄"
 */
export function formatPomodoroCount(completed: number, dailyCap: number): string {
  return `${completed}/${dailyCap} 番茄`;
}

/**
 * Format total focus minutes
 *
 * @param minutes Total focus minutes
 * @returns Formatted string like "75分钟" or "1小时15分钟"
 */
export function formatFocusMinutes(minutes: number): string {
  const safeMinutes = Math.max(0, Math.floor(minutes));
  
  if (safeMinutes < 60) {
    return `${safeMinutes}分钟`;
  }
  
  const hours = Math.floor(safeMinutes / 60);
  const remainingMins = safeMinutes % 60;
  
  if (remainingMins === 0) {
    return `${hours}小时`;
  }
  
  return `${hours}小时${remainingMins}分钟`;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Check if a pomodoro has ended
 *
 * @param pomodoro Active pomodoro data
 * @returns true if the pomodoro time has elapsed
 */
export function isPomodoroEnded(pomodoro: ActivePomodoroData): boolean {
  return calculateRemainingTime(pomodoro) === 0;
}

/**
 * Get the end timestamp of a pomodoro
 *
 * @param pomodoro Active pomodoro data
 * @returns Unix timestamp when the pomodoro will end
 */
export function getPomodoroEndTime(pomodoro: ActivePomodoroData): number {
  return pomodoro.startTime + pomodoro.duration * 60 * 1000;
}
