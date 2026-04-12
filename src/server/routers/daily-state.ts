/**
 * Daily State tRPC Router
 * 
 * Exposes endpoints for daily state management and system state.
 * Requirements: 5.1, 5.2, 5.7, 12.1, 12.6, 22.1-22.4
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import prisma from '@/lib/prisma';
import {
  dailyStateService,
  OverrideCapSchema
} from '@/services/daily-state.service';
import { stateEngineService } from '@/services/state-engine.service';
import { progressCalculationService } from '@/services/progress-calculation.service';
import { parseSystemState } from '@/machines/vibeflow.machine';

export const dailyStateRouter = router({
  /**
   * Get today's daily state with progress
   * Requirements: 5.7, 12.6
   */
  getToday: protectedProcedure.query(async ({ ctx }) => {
    const result = await dailyStateService.getTodayWithProgress(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get daily state',
      });
    }
    
    return result.data;
  }),

  /**
   * Get current system state
   * Requirements: 5.1, 5.7
   */
  getCurrentState: protectedProcedure.query(async ({ ctx }) => {
    return stateEngineService.getState(ctx.user.userId);
  }),

  /**
   * Check if user can start a pomodoro
   * Requirements: 12.2, 12.3
   */
  canStartPomodoro: protectedProcedure.query(async ({ ctx }) => {
    const result = await dailyStateService.canStartPomodoro(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to check pomodoro availability',
      });
    }
    
    return result.data;
  }),

  /**
   * Override daily cap
   * Requirements: 12.4
   */
  overrideCap: protectedProcedure
    .input(OverrideCapSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await dailyStateService.overrideCap(ctx.user.userId, input);
      
      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to override cap',
          cause: result.error?.details,
        });
      }
      
      return result.data;
    }),

  /**
   * Get override frequency for warnings
   * Requirements: 12.5
   */
  getOverrideFrequency: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(30).optional().default(7) }))
    .query(async ({ ctx, input }) => {
      const result = await dailyStateService.getOverrideFrequency(ctx.user.userId, input.days);
      
      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get override frequency',
        });
      }
      
      return result.data;
    }),

  /**
   * Get Top 3 tasks for today
   * Requirements: 3.8
   */
  getTop3Tasks: protectedProcedure.query(async ({ ctx }) => {
    const result = await dailyStateService.getTop3Tasks(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get top 3 tasks',
      });
    }
    
    return result.data;
  }),


  /**
   * Get daily progress with predictions
   * Requirements: 17.1, 17.2, 17.3, 17.4, 19.1-19.7
   */
  getDailyProgress: protectedProcedure.query(async ({ ctx }) => {
    const result = await progressCalculationService.getDailyProgress(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get daily progress',
      });
    }
    
    return result.data;
  }),

  /**
   * Get current status (time context and expected state)
   * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5
   */
  getCurrentStatus: protectedProcedure.query(async ({ ctx }) => {
    const result = await progressCalculationService.getCurrentStatus(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get current status',
      });
    }
    
    return result.data;
  }),

  /**
   * Get task suggestions for today
   * Requirements: 22.1, 22.2, 22.3, 22.4
   */
  getTaskSuggestions: protectedProcedure
    .input(z.object({ maxSuggestions: z.number().int().min(1).max(10).optional().default(3) }))
    .query(async ({ ctx, input }) => {
      const result = await progressCalculationService.getTaskSuggestions(ctx.user.userId, input.maxSuggestions);
      
      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get task suggestions',
        });
      }
      
      return result.data;
    }),

  /**
   * Adjust today's goal temporarily
   * Requirements: 23.1, 23.2, 23.3, 23.4, 23.5
   */
  adjustTodayGoal: protectedProcedure
    .input(z.object({ newTarget: z.number().int().min(0).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const result = await progressCalculationService.adjustTodayGoal(ctx.user.userId, input.newTarget);
      
      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to adjust today\'s goal',
        });
      }
      
      return { success: true };
    }),

  /**
   * Check if today's goal is adjusted
   * Requirements: 23.4
   */
  isTodayGoalAdjusted: protectedProcedure.query(async ({ ctx }) => {
    const result = await progressCalculationService.isTodayGoalAdjusted(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to check goal adjustment',
      });
    }
    
    return result.data;
  }),

  /**
   * Reset today's goal to default
   * Requirements: 23.5
   */
  resetTodayGoal: protectedProcedure.mutation(async ({ ctx }) => {
    const result = await progressCalculationService.resetTodayGoal(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to reset today\'s goal',
      });
    }
    
    return { success: true };
  }),

  /**
   * Get goal risk suggestions
   * Requirements: 19.1.1-19.1.7
   */
  getGoalRiskSuggestions: protectedProcedure.query(async ({ ctx }) => {
    const result = await progressCalculationService.getGoalRiskSuggestions(ctx.user.userId);

    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get goal risk suggestions',
      });
    }

    return result.data;
  }),

  /**
   * Get current rest status for UI recovery
   * Returns rest start time and duration to restore rest countdown after page refresh
   * Requirements: 7.1 - Rest period tracking
   */
  getRestStatus: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.userId;

    // Get current daily state
    const dailyState = await dailyStateService.getTodayWithProgress(userId);
    if (!dailyState.success || !dailyState.data) {
      return null;
    }

    // Return data if in idle (rest sub-phase) or over_rest state
    const currentState = parseSystemState(dailyState.data.systemState);
    if (currentState !== 'idle' && currentState !== 'over_rest') {
      return null;
    }

    // Use lastPomodoroEndTime from DailyState (set by state engine on COMPLETE_POMODORO)
    // This is scoped to today's daily cycle, avoiding stale data from previous days
    const restStartTime = dailyState.data.lastPomodoroEndTime;
    if (!restStartTime) {
      return null;
    }

    // Get last completed pomodoro for task suggestion
    const lastPomodoro = await prisma.pomodoro.findFirst({
      where: { userId, status: 'COMPLETED' },
      orderBy: { endTime: 'desc' },
      include: { task: { select: { id: true, title: true } } },
    });

    // Get user settings for rest duration calculation
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    // Calculate rest duration based on pomodoro count and settings
    const pomodoroCount = dailyState.data.progress?.pomodoroCount ?? 0;
    const longRestInterval = settings?.longRestInterval ?? 4;
    const isLongRest = pomodoroCount > 0 && pomodoroCount % longRestInterval === 0;
    const restDuration = isLongRest
      ? (settings?.longRestDuration ?? 15)
      : (settings?.shortRestDuration ?? 5);

    return {
      restStartTime: new Date(restStartTime).toISOString(),
      restDuration, // in minutes
      isLongRest,
      pomodoroCount,
      isOverRest: currentState === 'over_rest',
      lastTaskId: lastPomodoro?.taskId ?? undefined,
      lastTaskTitle: lastPomodoro?.task?.title ?? undefined,
    };
  }),
});
