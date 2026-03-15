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
import { 
  SystemState, 
  parseSystemState, 
  serializeSystemState,
} from '@/machines/vibeflow.machine';
import { broadcastStateChange } from '@/services/socket-broadcast.service';
import { mcpEventService } from './mcp-event.service';
import { overRestService } from './over-rest.service';
import { chatTriggersStateService } from './chat-triggers-state.service';

// Validation schemas
export const CompleteAirlockSchema = z.object({
  top3TaskIds: z.array(z.string().uuid()).min(0).max(3, 'Maximum 3 tasks can be selected'),
});

export const OverrideCapSchema = z.object({
  confirmation: z.literal(true, {
    errorMap: () => ({ message: 'Must explicitly confirm override' }),
  }),
});

export type CompleteAirlockInput = z.infer<typeof CompleteAirlockSchema>;
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
      
      // Try to find existing state for today
      let dailyState = await prisma.dailyState.findUnique({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
      });

      // If no state exists or it's a new day, create new state
      if (!dailyState) {
        dailyState = await prisma.dailyState.create({
          data: {
            userId,
            date: today,
            systemState: 'LOCKED',
            top3TaskIds: [],
            pomodoroCount: 0,
            capOverrideCount: 0,
            airlockCompleted: false,
          },
        });
      }

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

      // Determine effective system state
      // Priority: Active pomodoro > Stored state > Over-rest check (only for rest state)
      let effectiveSystemState = dailyState.systemState;
      const currentState = parseSystemState(dailyState.systemState);

      // First check if there's an active pomodoro - if so, state should be FOCUS
      // This prevents race conditions during state transitions
      const activePomodoro = await prisma.pomodoro.findFirst({
        where: { userId, status: 'IN_PROGRESS' },
      });

      if (activePomodoro) {
        // There's an active pomodoro, state should be FOCUS regardless of stored state
        effectiveSystemState = 'FOCUS';
      } else if (currentState === 'rest') {
        // Only check over-rest if state is explicitly 'rest'
        // Do NOT check for planning - user has explicitly chosen to exit rest
        const overRestResult = await overRestService.checkOverRestStatus(userId);
        if (overRestResult.success && overRestResult.data?.isOverRest) {
          console.log(`[DailyState] REST → OVER_REST transition detected for user ${userId}: restDuration=${overRestResult.data.restDurationMinutes}min, overRestMinutes=${overRestResult.data.overRestMinutes}min, shouldTriggerActions=${overRestResult.data.shouldTriggerActions}, timestamp=${new Date().toISOString()}`);
          effectiveSystemState = 'OVER_REST';
        }
      }
      // For 'planning' state, respect the user's choice - don't override to over_rest

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
   * Update system state
   * Requirements: 5.1, 5.2, 6.7
   */
  async updateSystemState(
    userId: string,
    state: SystemState
  ): Promise<ServiceResult<DailyState>> {
    try {
      const today = getTodayDate();

      // Get previous state for event payload
      const previousState = await prisma.dailyState.findUnique({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
      });

      const dailyState = await prisma.dailyState.upsert({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
        update: {
          systemState: serializeSystemState(state),
        },
        create: {
          userId,
          date: today,
          systemState: serializeSystemState(state),
          top3TaskIds: [],
          pomodoroCount: 0,
          capOverrideCount: 0,
          airlockCompleted: false,
        },
      });

      // Broadcast state change to connected clients
      broadcastStateChange(userId, state);

      // Publish daily_state.changed event (Requirement 10.3)
      const previousSystemState = previousState 
        ? parseSystemState(previousState.systemState) 
        : 'locked';
      
      await mcpEventService.publish({
        type: 'daily_state.changed',
        userId,
        payload: {
          previousState: previousSystemState,
          newState: state,
          date: today.toISOString(),
          pomodoroCount: dailyState.pomodoroCount,
          airlockCompleted: dailyState.airlockCompleted,
        },
      });

      // S4.2: Publish over_rest_entered event if transitioning to over_rest
      if (state === 'over_rest' && previousSystemState !== 'over_rest') {
        console.log(`[DailyState] State transition to OVER_REST for user ${userId}: previousState=${previousSystemState}, timestamp=${new Date().toISOString()}`);
        mcpEventService.publish({
          type: 'daily_state.over_rest_entered',
          userId,
          payload: { previousState: previousSystemState, date: today.toISOString() },
        }).catch((err) => console.error('[MCP Event] over_rest_entered publish error:', err));
      }

      // S4/S5: Fire proactive AI triggers on state transitions (async, non-blocking)
      chatTriggersStateService.handleDailyStateChanged(userId, {
        previousState: previousSystemState,
        newState: state,
        date: today.toISOString(),
        pomodoroCount: dailyState.pomodoroCount,
        airlockCompleted: dailyState.airlockCompleted,
      }).catch((err) => console.error('[AI Trigger] handleDailyStateChanged error:', err));

      return { success: true, data: dailyState };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update system state',
        },
      };
    }
  },

  /**
   * Complete the morning airlock
   * Requirements: 3.8, 3.9, 6.7
   */
  async completeAirlock(
    userId: string,
    data: CompleteAirlockInput
  ): Promise<ServiceResult<DailyState>> {
    try {
      const validated = CompleteAirlockSchema.parse(data);
      const today = getTodayDate();

      // Verify all tasks exist and belong to user (if any tasks selected)
      if (validated.top3TaskIds.length > 0) {
        const tasks = await prisma.task.findMany({
          where: {
            id: { in: validated.top3TaskIds },
            userId,
          },
        });

        if (tasks.length !== validated.top3TaskIds.length) {
          return {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'One or more selected tasks not found or do not belong to user',
            },
          };
        }

        // Update tasks to have today's plan date
        await prisma.task.updateMany({
          where: {
            id: { in: validated.top3TaskIds },
            userId,
          },
          data: {
            planDate: today,
          },
        });
      }

      // Update daily state
      const dailyState = await prisma.dailyState.upsert({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
        update: {
          systemState: 'PLANNING',
          top3TaskIds: validated.top3TaskIds,
          airlockCompleted: true,
        },
        create: {
          userId,
          date: today,
          systemState: 'PLANNING',
          top3TaskIds: validated.top3TaskIds,
          pomodoroCount: 0,
          capOverrideCount: 0,
          airlockCompleted: true,
        },
      });

      // Broadcast state change to connected clients
      broadcastStateChange(userId, 'planning');

      return { success: true, data: dailyState };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid airlock data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to complete airlock',
        },
      };
    }
  },


  /**
   * Increment pomodoro count
   * Requirements: 12.2
   */
  async incrementPomodoroCount(userId: string): Promise<ServiceResult<DailyState>> {
    try {
      const today = getTodayDate();

      const dailyState = await prisma.dailyState.upsert({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
        update: {
          pomodoroCount: { increment: 1 },
        },
        create: {
          userId,
          date: today,
          systemState: 'PLANNING',
          top3TaskIds: [],
          pomodoroCount: 1,
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
          message: error instanceof Error ? error.message : 'Failed to increment pomodoro count',
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
          systemState: 'PLANNING',
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
   * Check if airlock is completed for today
   */
  async isAirlockCompleted(userId: string): Promise<ServiceResult<boolean>> {
    try {
      const stateResult = await this.getOrCreateToday(userId);
      if (!stateResult.success || !stateResult.data) {
        return {
          success: false,
          error: stateResult.error,
        };
      }

      return { success: true, data: stateResult.data.airlockCompleted };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to check airlock status',
        },
      };
    }
  },

  /**
   * Get current system state
   */
  async getCurrentState(userId: string): Promise<ServiceResult<SystemState>> {
    try {
      const stateResult = await this.getOrCreateToday(userId);
      if (!stateResult.success || !stateResult.data) {
        return {
          success: false,
          error: stateResult.error,
        };
      }

      return { 
        success: true, 
        data: parseSystemState(stateResult.data.systemState) 
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get current state',
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
      const today = getTodayDate();

      const dailyState = await prisma.dailyState.upsert({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
        update: {
          systemState: 'LOCKED',
          top3TaskIds: [],
          pomodoroCount: 0,
          capOverrideCount: 0,
          airlockCompleted: false,
        },
        create: {
          userId,
          date: today,
          systemState: 'LOCKED',
          top3TaskIds: [],
          pomodoroCount: 0,
          capOverrideCount: 0,
          airlockCompleted: false,
        },
      });

      // Broadcast state change to connected clients
      broadcastStateChange(userId, 'locked');

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
      // Check current system state
      const currentStateResult = await this.getCurrentState(userId);
      if (!currentStateResult.success) {
        return {
          success: false,
          error: currentStateResult.error,
        };
      }

      // If already in over_rest state, return true
      if (currentStateResult.data === 'over_rest') {
        return { success: true, data: true };
      }

      // Check if user should be in over-rest based on over-rest service
      const overRestResult = await overRestService.checkOverRestStatus(userId);
      if (!overRestResult.success) {
        return {
          success: false,
          error: overRestResult.error,
        };
      }

      return { success: true, data: overRestResult.data?.isOverRest ?? false };
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

  /**
   * Skip airlock for new users (no tasks/projects)
   * Sets system state to PLANNING without requiring Top 3 selection
   */
  async skipAirlockForNewUser(userId: string): Promise<ServiceResult<DailyState>> {
    try {
      const today = getTodayDate();

      const dailyState = await prisma.dailyState.upsert({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
        update: {
          systemState: 'PLANNING',
          top3TaskIds: [],
          airlockCompleted: true,
        },
        create: {
          userId,
          date: today,
          systemState: 'PLANNING',
          top3TaskIds: [],
          pomodoroCount: 0,
          capOverrideCount: 0,
          airlockCompleted: true,
        },
      });

      // Broadcast state change to connected clients
      broadcastStateChange(userId, 'planning');

      return { success: true, data: dailyState };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to skip airlock',
        },
      };
    }
  },
};

export default dailyStateService;
