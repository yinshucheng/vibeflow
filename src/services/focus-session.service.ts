import { z } from 'zod';
import prisma from '@/lib/prisma';
import type { FocusSession } from '@prisma/client';
import { sleepTimeService } from './sleep-time.service';
import { isWithinWorkHours } from './idle.service';
import type { WorkTimeSlot } from './user.service';

// Duration constraints (Requirements: 1.4)
const MIN_SESSION_DURATION = 15; // minutes
const MAX_SESSION_DURATION = 240; // minutes (4 hours)
const MIN_EXTENSION_DURATION = 15; // minutes
const MAX_EXTENSION_DURATION = 120; // minutes (2 hours)

// Validation schemas
export const StartSessionSchema = z.object({
  duration: z
    .number()
    .int()
    .min(MIN_SESSION_DURATION, `Duration must be at least ${MIN_SESSION_DURATION} minutes`)
    .max(MAX_SESSION_DURATION, `Duration must be at most ${MAX_SESSION_DURATION} minutes`),
  overrideSleepTime: z.boolean().optional().default(false),
  overrideWorkHours: z.boolean().optional().default(false),
});

export const ExtendSessionSchema = z.object({
  additionalMinutes: z
    .number()
    .int()
    .min(MIN_EXTENSION_DURATION, `Extension must be at least ${MIN_EXTENSION_DURATION} minutes`)
    .max(MAX_EXTENSION_DURATION, `Extension must be at most ${MAX_EXTENSION_DURATION} minutes`),
});

export type StartSessionInput = z.infer<typeof StartSessionSchema>;
export type ExtendSessionInput = z.infer<typeof ExtendSessionSchema>;

// Service result type
export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

// Focus session status type
export type FocusSessionStatus = 'active' | 'completed' | 'cancelled';

export const focusSessionService = {
  /**
   * Start a new ad-hoc focus session
   * Requirements: 1.1, 1.2, 1.4, 1.5, 13.1, 13.2, 13.3, 13.4, 13.5
   */
  async startSession(
    userId: string,
    input: StartSessionInput
  ): Promise<ServiceResult<FocusSession>> {
    try {
      const validated = StartSessionSchema.parse(input);

      // Check for existing active session (Requirements: 1.5)
      const existingSession = await prisma.focusSession.findFirst({
        where: {
          userId,
          status: 'active',
        },
      });

      if (existingSession) {
        return {
          success: false,
          error: {
            code: 'SESSION_ALREADY_ACTIVE',
            message: 'A focus session is already active. End the current session before starting a new one.',
          },
        };
      }

      // Check if currently in sleep time (Requirements: 13.1, 13.2)
      const sleepTimeResult = await sleepTimeService.isInSleepTime(userId);
      const isInSleepTime = sleepTimeResult.success && sleepTimeResult.data === true;

      // If in sleep time and override not confirmed, return error asking for confirmation (Requirements: 13.1)
      if (isInSleepTime && !validated.overrideSleepTime) {
        return {
          success: false,
          error: {
            code: 'SLEEP_TIME_ACTIVE',
            message: 'You are currently in sleep time. Starting a focus session will override sleep enforcement. Please confirm to proceed.',
          },
        };
      }

      // Calculate planned end time (Requirements: 1.2)
      const startTime = new Date();
      const plannedEndTime = new Date(startTime.getTime() + validated.duration * 60 * 1000);

      // Server-side validation: only set overridesWorkHours when actually outside work hours
      let actuallyOverridesWorkHours = false;
      if (validated.overrideWorkHours) {
        const settings = await prisma.userSettings.findFirst({ where: { userId } });
        const workTimeSlots = ((settings as Record<string, unknown> | null)?.workTimeSlots as unknown as WorkTimeSlot[]) || [];
        actuallyOverridesWorkHours = workTimeSlots.length > 0 && !isWithinWorkHours(workTimeSlots);
      }

      // Create the session (Requirements: 1.1)
      const session = await prisma.focusSession.create({
        data: {
          userId,
          startTime,
          plannedEndTime,
          duration: validated.duration,
          status: 'active',
          overridesSleepTime: isInSleepTime && validated.overrideSleepTime,
          overridesWorkHours: actuallyOverridesWorkHours,
        },
      });

      // If overriding sleep time, record the exemption (Requirements: 13.3, 14.1, 14.2)
      if (isInSleepTime && validated.overrideSleepTime) {
        await sleepTimeService.recordExemption(userId, {
          type: 'focus_override',
          duration: validated.duration,
          focusSessionId: session.id,
        });
      }

      return { success: true, data: session };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid session data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to start focus session',
        },
      };
    }
  },

  /**
   * End the current active session
   * Requirements: 3.2, 3.3, 13.4
   * Note: When a sleep-overriding focus session ends, sleep enforcement resumes
   * automatically because the policy distribution service will no longer include
   * the active focus session in the compiled policy.
   */
  async endSession(userId: string): Promise<ServiceResult<FocusSession>> {
    try {
      // Find active session
      const activeSession = await prisma.focusSession.findFirst({
        where: {
          userId,
          status: 'active',
        },
      });

      if (!activeSession) {
        return {
          success: false,
          error: {
            code: 'SESSION_NOT_FOUND',
            message: 'No active focus session found',
          },
        };
      }

      // Update session to completed (Requirements: 3.3)
      // When overridesSleepTime is true, ending the session will resume sleep enforcement (Requirements: 13.4)
      const session = await prisma.focusSession.update({
        where: { id: activeSession.id },
        data: {
          status: 'completed',
          actualEndTime: new Date(),
        },
      });

      return { success: true, data: session };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to end focus session',
        },
      };
    }
  },

  /**
   * Get the current active session (if any)
   * Requirements: 5.1
   */
  async getActiveSession(userId: string): Promise<ServiceResult<FocusSession | null>> {
    try {
      const session = await prisma.focusSession.findFirst({
        where: {
          userId,
          status: 'active',
        },
      });

      return { success: true, data: session };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get active session',
        },
      };
    }
  },

  /**
   * Check if user is currently in a focus session
   */
  async isInFocusSession(userId: string): Promise<ServiceResult<boolean>> {
    try {
      const session = await prisma.focusSession.findFirst({
        where: {
          userId,
          status: 'active',
        },
      });

      return { success: true, data: session !== null };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to check focus session status',
        },
      };
    }
  },


  /**
   * Extend the current active session
   * Requirements: 4.1, 4.2, 4.3, 4.4
   */
  async extendSession(
    userId: string,
    input: ExtendSessionInput
  ): Promise<ServiceResult<FocusSession>> {
    try {
      const validated = ExtendSessionSchema.parse(input);

      // Find active session
      const activeSession = await prisma.focusSession.findFirst({
        where: {
          userId,
          status: 'active',
        },
      });

      if (!activeSession) {
        return {
          success: false,
          error: {
            code: 'SESSION_NOT_FOUND',
            message: 'No active focus session found to extend',
          },
        };
      }

      // Calculate new end time (Requirements: 4.2)
      const newPlannedEndTime = new Date(
        activeSession.plannedEndTime.getTime() + validated.additionalMinutes * 60 * 1000
      );

      // Update session with new end time (Requirements: 4.4)
      const session = await prisma.focusSession.update({
        where: { id: activeSession.id },
        data: {
          plannedEndTime: newPlannedEndTime,
          duration: activeSession.duration + validated.additionalMinutes,
        },
      });

      return { success: true, data: session };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid extension data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to extend focus session',
        },
      };
    }
  },

  /**
   * Get session history for stats
   * Requirements: 8.1, 8.2, 8.3
   */
  async getSessionHistory(
    userId: string,
    days: number = 7
  ): Promise<ServiceResult<FocusSession[]>> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      const sessions = await prisma.focusSession.findMany({
        where: {
          userId,
          createdAt: {
            gte: startDate,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return { success: true, data: sessions };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get session history',
        },
      };
    }
  },

  /**
   * Check and auto-end expired sessions
   * Requirements: 3.1
   */
  async checkExpiredSessions(): Promise<ServiceResult<number>> {
    try {
      const now = new Date();

      // Find all active sessions that have passed their planned end time
      const expiredSessions = await prisma.focusSession.findMany({
        where: {
          status: 'active',
          plannedEndTime: {
            lte: now,
          },
        },
      });

      if (expiredSessions.length === 0) {
        return { success: true, data: 0 };
      }

      // Update all expired sessions to completed
      await prisma.focusSession.updateMany({
        where: {
          id: {
            in: expiredSessions.map((s) => s.id),
          },
        },
        data: {
          status: 'completed',
          actualEndTime: now,
        },
      });

      return { success: true, data: expiredSessions.length };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to check expired sessions',
        },
      };
    }
  },

  /**
   * Get session statistics for a time period
   * Requirements: 8.2, 8.3
   */
  async getSessionStats(
    userId: string,
    days: number = 7
  ): Promise<ServiceResult<{ totalSessions: number; totalMinutes: number; averageDuration: number }>> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      const sessions = await prisma.focusSession.findMany({
        where: {
          userId,
          status: 'completed',
          createdAt: {
            gte: startDate,
          },
        },
      });

      const totalSessions = sessions.length;
      const totalMinutes = sessions.reduce((sum, s) => sum + s.duration, 0);
      const averageDuration = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0;

      return {
        success: true,
        data: {
          totalSessions,
          totalMinutes,
          averageDuration,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get session stats',
        },
      };
    }
  },

  /**
   * Get duration configuration constants
   */
  getDurationConfig() {
    return {
      minSessionDuration: MIN_SESSION_DURATION,
      maxSessionDuration: MAX_SESSION_DURATION,
      minExtensionDuration: MIN_EXTENSION_DURATION,
      maxExtensionDuration: MAX_EXTENSION_DURATION,
    };
  },
};

export default focusSessionService;
