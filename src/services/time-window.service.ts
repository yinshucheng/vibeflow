/**
 * Time Window Service
 *
 * Unified abstraction for determining "what time period is the user in"
 * and "what behavior is expected" during that period.
 *
 * ## Core Concepts
 *
 * ### Time Periods (prioritized, highest to lowest):
 * 1. **focus_session** — User explicitly started an ad-hoc work session (加班)
 *    - Overrides everything, even sleep time
 *    - Expected: pomodoro cycles with short breaks
 * 2. **sleep_time** — Configured sleep window (can cross midnight)
 *    - Expected: user should be sleeping, device blocked
 * 3. **work_time** — Configured work hours (multiple slots possible)
 *    - Expected: pomodoro cycles with short breaks
 * 4. **free_time** — None of the above
 *    - Expected: user freedom, no enforcement
 *
 * ### Expected Behaviors per Period:
 * - `pomodoro_cycle` — Work in pomodoro rhythm, OVER_REST triggers on rest timeout
 * - `sleep` — Should not be using device
 * - `free` — No expectations, no enforcement
 *
 * ### Future Extensibility:
 * - Geographic context (office vs home vs commute)
 * - Calendar integration (meetings, focus blocks)
 * - AI-based suggestions (learned patterns, anomaly detection)
 * - Health signals (fatigue detection, break recommendations)
 *
 * Design: .kiro/specs/state-management-overhaul/requirements.md §2.1-2.4
 */

import prisma from '@/lib/prisma';
import { isWithinWorkHours } from './idle.service';
import { sleepTimeService } from './sleep-time.service';
import { focusSessionService } from './focus-session.service';
import type { WorkTimeSlot } from './user.service';

// ── Types ──────────────────────────────────────────────────────────────

/** Time period types, in priority order (highest first) */
export type TimePeriod = 'focus_session' | 'sleep_time' | 'work_time' | 'free_time';

/** Expected behavior during a time period */
export type ExpectedBehavior = 'pomodoro_cycle' | 'sleep' | 'free';

/** Full context about the current time window */
export interface TimeWindowContext {
  /** Current time period (highest priority that applies) */
  period: TimePeriod;

  /** Expected behavior during this period */
  expectedBehavior: ExpectedBehavior;

  /** Whether OVER_REST can be triggered in this context */
  overRestAllowed: boolean;

  /** Individual time window checks (for debugging/display) */
  checks: {
    inFocusSession: boolean;
    inSleepTime: boolean;
    inWorkTime: boolean;
  };

  /** Focus session details (if active) */
  focusSession?: {
    id: string;
    endTime: Date;
    remainingMinutes: number;
    overridesSleepTime: boolean;
  };

  /** Sleep time details (if in sleep window) */
  sleepTime?: {
    endTime: string; // HH:mm
    remainingMinutes: number;
  };

  /** Work time details (if in work hours) */
  workTime?: {
    currentSlot: {
      startTime: string; // HH:mm
      endTime: string; // HH:mm
    };
    remainingMinutes: number;
  };
}

/** Service result wrapper */
export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

// ── Constants ──────────────────────────────────────────────────────────

/** Mapping from time period to expected behavior */
const PERIOD_TO_BEHAVIOR: Record<TimePeriod, ExpectedBehavior> = {
  focus_session: 'pomodoro_cycle',
  sleep_time: 'sleep',
  work_time: 'pomodoro_cycle',
  free_time: 'free',
};

/** Which periods allow OVER_REST enforcement */
const OVER_REST_ALLOWED_PERIODS = new Set<TimePeriod>([
  'focus_session',
  'work_time',
]);

// ── Helper Functions ───────────────────────────────────────────────────

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function getCurrentTimeMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function findCurrentWorkSlot(slots: WorkTimeSlot[]): WorkTimeSlot | null {
  const currentMinutes = getCurrentTimeMinutes();

  for (const slot of slots) {
    if (!slot.enabled) continue;

    const startMinutes = parseTimeToMinutes(slot.startTime);
    const endMinutes = parseTimeToMinutes(slot.endTime);

    if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
      return slot;
    }
  }

  return null;
}

function calculateRemainingMinutes(endTime: string): number {
  const currentMinutes = getCurrentTimeMinutes();
  const endMinutes = parseTimeToMinutes(endTime);

  if (endMinutes > currentMinutes) {
    return endMinutes - currentMinutes;
  }

  // Handle overnight case (endTime is tomorrow)
  return (24 * 60 - currentMinutes) + endMinutes;
}

// ── Service ────────────────────────────────────────────────────────────

export const timeWindowService = {
  /**
   * Get the current time window context for a user.
   *
   * This is the main entry point — call this to know:
   * - What time period the user is in
   * - What behavior is expected
   * - Whether OVER_REST should be enforced
   */
  async getCurrentContext(userId: string): Promise<ServiceResult<TimeWindowContext>> {
    try {
      // Fetch all data in parallel
      const [settings, focusSessionResult, sleepTimeResult] = await Promise.all([
        prisma.userSettings.findFirst({ where: { userId } }),
        focusSessionService.getActiveSession(userId),
        sleepTimeService.isInSleepTime(userId),
      ]);

      const settingsAny = settings as Record<string, unknown> | null;
      const workTimeSlots = (settingsAny?.workTimeSlots as unknown as WorkTimeSlot[]) || [];

      // Individual checks
      const inFocusSession = focusSessionResult.success && focusSessionResult.data !== null;
      const activeFocusSession = focusSessionResult.success ? focusSessionResult.data : null;
      const inSleepTime = sleepTimeResult.success && sleepTimeResult.data === true;
      const inWorkTime = isWithinWorkHours(workTimeSlots);

      // Determine period (priority order)
      let period: TimePeriod;
      if (inFocusSession) {
        period = 'focus_session';
      } else if (inSleepTime) {
        period = 'sleep_time';
      } else if (inWorkTime) {
        period = 'work_time';
      } else {
        period = 'free_time';
      }

      const expectedBehavior = PERIOD_TO_BEHAVIOR[period];
      const overRestAllowed = OVER_REST_ALLOWED_PERIODS.has(period);

      // Build context
      const context: TimeWindowContext = {
        period,
        expectedBehavior,
        overRestAllowed,
        checks: {
          inFocusSession,
          inSleepTime,
          inWorkTime,
        },
      };

      // Add focus session details
      if (activeFocusSession) {
        const remainingMs = activeFocusSession.plannedEndTime.getTime() - Date.now();
        context.focusSession = {
          id: activeFocusSession.id,
          endTime: activeFocusSession.plannedEndTime,
          remainingMinutes: Math.max(0, Math.floor(remainingMs / 1000 / 60)),
          overridesSleepTime: activeFocusSession.overridesSleepTime ?? false,
        };
      }

      // Add sleep time details
      if (inSleepTime) {
        const sleepConfig = await sleepTimeService.getConfig(userId);
        if (sleepConfig.success && sleepConfig.data) {
          context.sleepTime = {
            endTime: sleepConfig.data.endTime,
            remainingMinutes: calculateRemainingMinutes(sleepConfig.data.endTime),
          };
        }
      }

      // Add work time details
      if (inWorkTime) {
        const currentSlot = findCurrentWorkSlot(workTimeSlots);
        if (currentSlot) {
          context.workTime = {
            currentSlot: {
              startTime: currentSlot.startTime,
              endTime: currentSlot.endTime,
            },
            remainingMinutes: calculateRemainingMinutes(currentSlot.endTime),
          };
        }
      }

      return { success: true, data: context };
    } catch (error) {
      console.error('[TimeWindowService] getCurrentContext error:', error);
      return {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get time window context' },
      };
    }
  },

  /**
   * Quick check: is OVER_REST allowed right now?
   *
   * This is a convenience method for the common case where you only
   * need to know if OVER_REST should trigger.
   *
   * Formula: inFocusSession || (inWorkTime && !inSleepTime)
   */
  async isOverRestAllowed(userId: string): Promise<ServiceResult<boolean>> {
    const contextResult = await this.getCurrentContext(userId);
    if (!contextResult.success) {
      return contextResult;
    }
    return { success: true, data: contextResult.data.overRestAllowed };
  },

  /**
   * Get just the current time period (without full context).
   *
   * Lightweight version for cases where you only need the period type.
   */
  async getCurrentPeriod(userId: string): Promise<ServiceResult<TimePeriod>> {
    const contextResult = await this.getCurrentContext(userId);
    if (!contextResult.success) {
      return contextResult;
    }
    return { success: true, data: contextResult.data.period };
  },

  /**
   * Get expected behavior for the current time window.
   */
  async getExpectedBehavior(userId: string): Promise<ServiceResult<ExpectedBehavior>> {
    const contextResult = await this.getCurrentContext(userId);
    if (!contextResult.success) {
      return contextResult;
    }
    return { success: true, data: contextResult.data.expectedBehavior };
  },

  /**
   * Check if user is in a "productive" time window (work_time or focus_session).
   *
   * Useful for features that should only activate during work periods.
   */
  async isInProductiveWindow(userId: string): Promise<ServiceResult<boolean>> {
    const contextResult = await this.getCurrentContext(userId);
    if (!contextResult.success) {
      return contextResult;
    }
    const period = contextResult.data.period;
    return { success: true, data: period === 'work_time' || period === 'focus_session' };
  },
};

export default timeWindowService;
