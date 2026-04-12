/**
 * DailyStateService
 * 
 * Manages daily state including system state, Top 3 tasks, and daily cap enforcement.
 * 
 * Requirements: 3.1, 3.8, 3.9, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';
import type { DailyState } from '@prisma/client';


export const OverrideCapSchema = z.object({
  confirmation: z.literal(true, {
    errorMap: () => ({ message: 'Must explicitly confirm override' }),
  }),
});

export type OverrideCapInput = z.infer<typeof OverrideCapSchema>;

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

// Extended daily state with computed fields
export interface DailyStateWithProgress extends DailyState {
  progress: {
    pomodoroCount: number;
    dailyCap: number;
    percentage: number;
    isCapped: boolean;
    overrideCount: number;
  };
}

// Daily reset time (04:00 AM)
const DAILY_RESET_HOUR = 4;


/**
 * Get today's date normalized to midnight
 * Accounts for the 04:00 AM reset time
 */
export function getTodayDate(): Date {
  const now = new Date();
  const today = new Date(now);
  
  // If before 4 AM, consider it still "yesterday"
  if (now.getHours() < DAILY_RESET_HOUR) {
    today.setDate(today.getDate() - 1);
  }
  
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * Check if daily reset should occur
 * Requirements: 3.1
 */
function shouldResetDaily(lastState: DailyState | null): boolean {
  if (!lastState) return true;
  
  const today = getTodayDate();
  const stateDate = new Date(lastState.date);
  stateDate.setHours(0, 0, 0, 0);
  
  return today.getTime() > stateDate.getTime();
}

export const dailyStateService = {
  /**
   * Get or create today's daily state
   * Requirements: 3.1
   */
  async getOrCreateToday(userId: string): Promise<ServiceResult<DailyState>> {
    try {
      const today = getTodayDate();

      // Use upsert to avoid race conditions from concurrent requests
      const dailyState = await prisma.dailyState.upsert({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
        // If record already exists, return it as-is (no update)
        update: {},
        create: {
          userId,
          date: today,
          systemState: 'IDLE',
          top3TaskIds: [],
          pomodoroCount: 0,
          capOverrideCount: 0,
          airlockCompleted: false,
        },
      });

      return { success: true, data: dailyState };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get daily state',
        },
      };
    }
  },

  /**
   * Get today's state with progress information
   * Requirements: 12.6
   */
  async getTodayWithProgress(userId: string): Promise<ServiceResult<DailyStateWithProgress>> {
    try {
      const stateResult = await this.getOrCreateToday(userId);
      if (!stateResult.success || !stateResult.data) {
        return {
          success: false,
          error: stateResult.error,
        };
      }

      const dailyState = stateResult.data;

      // Use DB state directly — OVER_REST is now a real DB state written by StateEngine
      // Normalize to lowercase 3-state value for consistent API responses
      const { normalizeState } = await import('@/lib/state-utils');
      const effectiveSystemState = normalizeState(dailyState.systemState);

      // Get user's daily cap setting
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
      });
      const dailyCap = settings?.dailyCap ?? 8;

      const progress = {
        pomodoroCount: dailyState.pomodoroCount,
        dailyCap,
        percentage: Math.min(100, Math.round((dailyState.pomodoroCount / dailyCap) * 100)),
        isCapped: dailyState.pomodoroCount >= dailyCap,
        overrideCount: dailyState.capOverrideCount,
      };

      return {
        success: true,
        data: {
          ...dailyState,
          systemState: effectiveSystemState,
          progress,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get daily state with progress',
        },
      };
    }
  },


  /**
   * Check if daily cap is reached
   * Requirements: 12.2
   */
  async isDailyCapped(userId: string): Promise<ServiceResult<boolean>> {
    try {
      const progressResult = await this.getTodayWithProgress(userId);
      if (!progressResult.success || !progressResult.data) {
        return {
          success: false,
          error: progressResult.error,
        };
      }

      return { success: true, data: progressResult.data.progress.isCapped };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to check daily cap',
        },
      };
    }
  },

  /**
   * Check if user can start a new pomodoro
   * Requirements: 12.2, 12.3
   */
  async canStartPomodoro(userId: string): Promise<ServiceResult<boolean>> {
    try {
      const cappedResult = await this.isDailyCapped(userId);
      if (!cappedResult.success) {
        return {
          success: false,
          error: cappedResult.error,
        };
      }

      // Can start if not capped
      return { success: true, data: !cappedResult.data };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to check if can start pomodoro',
        },
      };
    }
  },

  /**
   * Override daily cap with explicit confirmation
   * Requirements: 12.4
   */
  async overrideCap(
    userId: string,
    data: OverrideCapInput
  ): Promise<ServiceResult<DailyState>> {
    try {
      const validated = OverrideCapSchema.parse(data);
      
      if (!validated.confirmation) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Must explicitly confirm override',
          },
        };
      }

      const today = getTodayDate();

      const dailyState = await prisma.dailyState.upsert({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
        update: {
          capOverrideCount: { increment: 1 },
        },
        create: {
          userId,
          date: today,
          systemState: 'IDLE',
          top3TaskIds: [],
          pomodoroCount: 0,
          capOverrideCount: 1,
          airlockCompleted: false,
        },
      });

      return { success: true, data: dailyState };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid override data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to override cap',
        },
      };
    }
  },

  /**
   * Get override frequency for warnings
   * Requirements: 12.5
   */
  async getOverrideFrequency(
    userId: string,
    days: number = 7
  ): Promise<ServiceResult<{ totalOverrides: number; daysWithOverrides: number }>> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      const states = await prisma.dailyState.findMany({
        where: {
          userId,
          date: { gte: startDate },
          capOverrideCount: { gt: 0 },
        },
      });

      const totalOverrides = states.reduce((sum, s) => sum + s.capOverrideCount, 0);
      const daysWithOverrides = states.length;

      return {
        success: true,
        data: { totalOverrides, daysWithOverrides },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get override frequency',
        },
      };
    }
  },

  /**
   * Get Top 3 tasks for today
   * Requirements: 3.8
   */
  async getTop3Tasks(userId: string): Promise<ServiceResult<string[]>> {
    try {
      const stateResult = await this.getOrCreateToday(userId);
      if (!stateResult.success || !stateResult.data) {
        return {
          success: false,
          error: stateResult.error,
        };
      }

      return { success: true, data: stateResult.data.top3TaskIds };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get top 3 tasks',
        },
      };
    }
  },

  /**
   * Reset daily state (for testing or manual reset)
   * Requirements: 6.7
   */
  async resetToday(userId: string): Promise<ServiceResult<DailyState>> {
    try {
      // Use StateEngine for state transition (DAILY_RESET event)
      const { stateEngineService } = await import('./state-engine.service');
      const result = await stateEngineService.send(userId, { type: 'DAILY_RESET' });
      if (!result.success) {
        return {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: `State transition failed: ${result.message}`,
          },
        };
      }

      // Also reset non-state fields (top3, capOverride, airlock)
      const today = getTodayDate();
      const dailyState = await prisma.dailyState.update({
        where: {
          userId_date: { userId, date: today },
        },
        data: {
          top3TaskIds: [],
          capOverrideCount: 0,
          airlockCompleted: false,
        },
      });

      return { success: true, data: dailyState };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to reset daily state',
        },
      };
    }
  },

  /**
   * Get daily reset hour
   */
  getDailyResetHour(): number {
    return DAILY_RESET_HOUR;
  },

  /**
   * Check if user is currently in over-rest state
   * Requirements: 7.1, 7.2
   */
  async isInOverRest(userId: string): Promise<ServiceResult<boolean>> {
    try {
      const { stateEngineService } = await import('./state-engine.service');
      const currentState = await stateEngineService.getState(userId);
      return { success: true, data: currentState === 'over_rest' };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to check over-rest status',
        },
      };
    }
  },

};

export default dailyStateService;
