/**
 * Time Window Utilities
 *
 * Shared functions for time window calculations, supporting cross-midnight scenarios.
 * Used by idle.service, time-window.service, progress-calculation.service, etc.
 */

const MINUTES_PER_DAY = 24 * 60;

/**
 * Parse "HH:mm" string to minutes since midnight.
 */
export function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Get current time as minutes since midnight.
 */
export function getCurrentTimeMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Check if a time (in minutes) is within a time window.
 * Supports cross-midnight windows (e.g., 22:00-02:00).
 *
 * @param currentMinutes - Current time in minutes since midnight
 * @param startMinutes - Window start time in minutes
 * @param endMinutes - Window end time in minutes
 * @returns true if currentMinutes is within [start, end)
 */
export function isTimeInWindow(
  currentMinutes: number,
  startMinutes: number,
  endMinutes: number
): boolean {
  if (startMinutes < endMinutes) {
    // Normal case: e.g., 09:00-18:00
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Cross-midnight case: e.g., 22:00-02:00
    // True if current time is >= start OR < end
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

/**
 * Calculate the duration of a time window in minutes.
 * Supports cross-midnight windows.
 *
 * @param startMinutes - Window start time in minutes
 * @param endMinutes - Window end time in minutes
 * @returns Duration in minutes
 */
export function getWindowDuration(startMinutes: number, endMinutes: number): number {
  if (startMinutes < endMinutes) {
    // Normal case: e.g., 09:00-18:00 = 540 minutes
    return endMinutes - startMinutes;
  } else {
    // Cross-midnight case: e.g., 22:00-02:00 = 240 minutes
    return (MINUTES_PER_DAY - startMinutes) + endMinutes;
  }
}

/**
 * Calculate remaining minutes until a time window ends.
 * Assumes the caller has already verified we're currently IN the window.
 *
 * @param currentMinutes - Current time in minutes since midnight
 * @param endMinutes - Window end time in minutes
 * @returns Remaining minutes until window ends
 */
export function getRemainingMinutesInWindow(
  currentMinutes: number,
  endMinutes: number
): number {
  if (endMinutes > currentMinutes) {
    // End is later today
    return endMinutes - currentMinutes;
  } else {
    // End is tomorrow (cross-midnight)
    return (MINUTES_PER_DAY - currentMinutes) + endMinutes;
  }
}

/**
 * Calculate remaining minutes of a time window from the current time.
 * If we're before the window, returns the full duration.
 * If we're in the window, returns remaining time.
 * If we're after the window, returns 0.
 *
 * @param currentMinutes - Current time in minutes since midnight
 * @param startMinutes - Window start time in minutes
 * @param endMinutes - Window end time in minutes
 * @returns Remaining minutes (can be 0 if window has passed)
 */
export function getWindowRemainingMinutes(
  currentMinutes: number,
  startMinutes: number,
  endMinutes: number
): number {
  const isInWindow = isTimeInWindow(currentMinutes, startMinutes, endMinutes);
  const duration = getWindowDuration(startMinutes, endMinutes);

  if (startMinutes < endMinutes) {
    // Normal case: e.g., 09:00-18:00
    if (currentMinutes < startMinutes) {
      // Before window - return full duration
      return duration;
    } else if (isInWindow) {
      // In window - return remaining
      return endMinutes - currentMinutes;
    } else {
      // After window
      return 0;
    }
  } else {
    // Cross-midnight case: e.g., 22:00-02:00
    // Timeline: 00:00 ... endMinutes ... startMinutes ... 24:00
    if (currentMinutes < endMinutes) {
      // We're in the "morning part" of the window (after midnight, before end)
      return endMinutes - currentMinutes;
    } else if (currentMinutes >= startMinutes) {
      // We're in the "evening part" of the window (after start, before midnight)
      return (MINUTES_PER_DAY - currentMinutes) + endMinutes;
    } else {
      // We're between end and start (daytime gap) - window hasn't started yet today
      // Return full duration (will start at startMinutes)
      return duration;
    }
  }
}

export interface TimeSlot {
  id?: string;
  startTime: string;
  endTime: string;
  enabled: boolean;
}

/**
 * Check if current time is within any enabled time slot.
 * Supports cross-midnight slots.
 */
export function isWithinTimeSlots(
  slots: TimeSlot[],
  currentTimeMinutes?: number
): boolean {
  const currentTime = currentTimeMinutes ?? getCurrentTimeMinutes();

  return slots.some((slot) => {
    if (!slot.enabled) return false;

    const startMinutes = parseTimeToMinutes(slot.startTime);
    const endMinutes = parseTimeToMinutes(slot.endTime);

    return isTimeInWindow(currentTime, startMinutes, endMinutes);
  });
}

/**
 * Find the time slot that contains the current time.
 * Supports cross-midnight slots.
 */
export function findCurrentTimeSlot(
  slots: TimeSlot[],
  currentTimeMinutes?: number
): TimeSlot | null {
  const currentTime = currentTimeMinutes ?? getCurrentTimeMinutes();

  for (const slot of slots) {
    if (!slot.enabled) continue;

    const startMinutes = parseTimeToMinutes(slot.startTime);
    const endMinutes = parseTimeToMinutes(slot.endTime);

    if (isTimeInWindow(currentTime, startMinutes, endMinutes)) {
      return slot;
    }
  }

  return null;
}

/**
 * Calculate total remaining minutes across all enabled time slots.
 * Handles cross-midnight slots correctly.
 */
export function calculateRemainingMinutesInSlots(
  slots: TimeSlot[],
  currentTimeMinutes?: number
): number {
  const currentTime = currentTimeMinutes ?? getCurrentTimeMinutes();
  let remainingMinutes = 0;

  for (const slot of slots) {
    if (!slot.enabled) continue;

    const startMinutes = parseTimeToMinutes(slot.startTime);
    const endMinutes = parseTimeToMinutes(slot.endTime);

    remainingMinutes += getWindowRemainingMinutes(currentTime, startMinutes, endMinutes);
  }

  return remainingMinutes;
}
