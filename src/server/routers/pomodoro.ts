/**
 * Pomodoro tRPC Router
 * 
 * Exposes start, complete, abort endpoints for Pomodoro management.
 * Requirements: 4.1, 4.6, 4.8
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import {
  pomodoroService,
  StartPomodoroSchema,
  CompletePomodoroSchema,
  RecordPomodoroSchema,
} from '@/services/pomodoro.service';
import { dailyStateService } from '@/services/daily-state.service';
import { statsService, GetStatsSchema } from '@/services/stats.service';
import { socketServer } from '@/server/socket';
import { broadcastPolicyUpdate } from '@/services/socket-broadcast.service';
import { trayIntegrationService } from '@/services/tray-integration.service';
import prisma from '@/lib/prisma';

export const pomodoroRouter = router({
  /**
   * Get current in-progress pomodoro
   */
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    const result = await pomodoroService.getCurrent(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get current pomodoro',
      });
    }
    
    return result.data;
  }),

  /**
   * Get today's completed pomodoro count
   */
  getTodayCount: protectedProcedure.query(async ({ ctx }) => {
    const result = await pomodoroService.getTodayCount(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get today count',
      });
    }
    
    return result.data;
  }),

  /**
   * Check if daily cap is reached
   */
  isDailyCapped: protectedProcedure.query(async ({ ctx }) => {
    const result = await pomodoroService.isDailyCapped(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to check daily cap',
      });
    }
    
    return result.data;
  }),

  /**
   * Get pomodoros for a specific task
   */
  getByTask: protectedProcedure
    .input(z.object({ taskId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const result = await pomodoroService.getByTask(input.taskId, ctx.user.userId);
      
      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get pomodoros',
        });
      }
      
      return result.data;
    }),

  /**
   * Get timer configuration constants
   */
  getTimerConfig: protectedProcedure.query(() => {
    return pomodoroService.getTimerConfig();
  }),

  /**
   * Get pomodoro statistics with multi-dimensional grouping
   * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
   */
  getStats: protectedProcedure
    .input(GetStatsSchema)
    .query(async ({ ctx, input }) => {
      const result = await statsService.getStats(ctx.user.userId, input);
      
      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get statistics',
          cause: result.error?.details,
        });
      }
      
      return result.data;
    }),

  /**
   * Start a new pomodoro session
   * Requirements: 4.1
   */
  start: protectedProcedure
    .input(StartPomodoroSchema)
    .mutation(async ({ ctx, input }) => {
      // Check if daily cap is reached
      const cappedResult = await dailyStateService.isDailyCapped(ctx.user.userId);
      if (cappedResult.success && cappedResult.data) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Daily cap reached. Override required to start new pomodoro.',
        });
      }

      const result = await pomodoroService.start(ctx.user.userId, input);
      
      if (!result.success) {
        const code = 
          result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' :
          result.error?.code === 'CONFLICT' ? 'CONFLICT' :
          'INTERNAL_SERVER_ERROR';
          
        throw new TRPCError({
          code,
          message: result.error?.message ?? 'Failed to start pomodoro',
          cause: result.error?.details,
        });
      }

      // Update system state to FOCUS
      await dailyStateService.updateSystemState(ctx.user.userId, 'focus');
      
      // Update tray with pomodoro start
      if (result.data) {
        const pomodoroData = result.data as {
          id: string;
          taskId: string | null;
          duration: number;
          startTime: Date;
          task?: { title: string } | null;
        };
        trayIntegrationService.updatePomodoroState({
          id: pomodoroData.id,
          taskId: pomodoroData.taskId,
          duration: pomodoroData.duration,
          startTime: pomodoroData.startTime,
          task: pomodoroData.task,
        });
      }
      
      // Broadcast policy update to stop over rest enforcement on desktop
      await broadcastPolicyUpdate(ctx.user.userId);
      
      return result.data;
    }),

  /**
   * Complete a pomodoro session
   * Requirements: 4.6, 7.1-7.9
   */
  complete: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        summary: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await pomodoroService.complete(
        input.id,
        ctx.user.userId,
        input.summary ? { summary: input.summary } : undefined
      );
      
      if (!result.success) {
        const code = 
          result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' :
          result.error?.code === 'CONFLICT' ? 'CONFLICT' :
          'INTERNAL_SERVER_ERROR';
          
        throw new TRPCError({
          code,
          message: result.error?.message ?? 'Failed to complete pomodoro',
        });
      }

      // Increment pomodoro count
      await dailyStateService.incrementPomodoroCount(ctx.user.userId);

      // Always transition to rest state on completion
      await dailyStateService.updateSystemState(ctx.user.userId, 'rest');

      // Get user settings for rest duration
      const settings = await prisma.userSettings.findUnique({
        where: { userId: ctx.user.userId },
      });
      const restDuration = settings?.shortRestDuration ?? 5;

      const restData = {
        startTime: new Date(),
        duration: restDuration,
        isOverRest: false,
      };

      // Update tray with completion state
      trayIntegrationService.handlePomodoroCompletion({
        wasInOverRest: false,
        newState: 'rest',
        restData,
      });

      // Broadcast policy update to update desktop clients
      await broadcastPolicyUpdate(ctx.user.userId);

      // Send WebSocket event to Browser Sentinel (Requirement 4.6)
      if (result.data) {
        const pomodoroData = result.data as {
          id: string;
          taskId: string;
          duration: number;
          task?: { title: string };
        };
        socketServer.sendExecuteCommand(ctx.user.userId, {
          action: 'POMODORO_COMPLETE',
          params: {
            pomodoroId: pomodoroData.id,
            taskId: pomodoroData.taskId,
            taskTitle: pomodoroData.task?.title ?? 'Unknown Task',
            duration: pomodoroData.duration,
          },
        });
      }
      
      return result.data;
    }),

  /**
   * Abort a pomodoro session
   * Requirements: 4.8
   */
  abort: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await pomodoroService.abort(input.id, ctx.user.userId);
      
      if (!result.success) {
        const code = 
          result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' :
          result.error?.code === 'CONFLICT' ? 'CONFLICT' :
          'INTERNAL_SERVER_ERROR';
          
        throw new TRPCError({
          code,
          message: result.error?.message ?? 'Failed to abort pomodoro',
        });
      }

      // Update system state back to PLANNING
      await dailyStateService.updateSystemState(ctx.user.userId, 'planning');
      
      // Broadcast policy update to update over rest status on desktop
      await broadcastPolicyUpdate(ctx.user.userId);
      
      return result.data;
    }),

  /**
   * Interrupt a pomodoro session with a reason
   */
  interrupt: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        reason: z.string().min(1).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await pomodoroService.interrupt(
        input.id,
        ctx.user.userId,
        input.reason
      );
      
      if (!result.success) {
        const code = 
          result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' :
          result.error?.code === 'CONFLICT' ? 'CONFLICT' :
          'INTERNAL_SERVER_ERROR';
          
        throw new TRPCError({
          code,
          message: result.error?.message ?? 'Failed to interrupt pomodoro',
        });
      }

      // Update system state back to PLANNING
      await dailyStateService.updateSystemState(ctx.user.userId, 'planning');

      // Broadcast policy update to update over rest status on desktop
      await broadcastPolicyUpdate(ctx.user.userId);

      return result.data;
    }),

  /**
   * Start a taskless pomodoro session
   * Requirements: Req 3 - Taskless Pomodoro
   */
  startTaskless: protectedProcedure
    .input(z.object({ label: z.string().max(100).optional() }))
    .mutation(async ({ ctx, input }) => {
      const cappedResult = await dailyStateService.isDailyCapped(ctx.user.userId);
      if (cappedResult.success && cappedResult.data) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Daily cap reached. Override required to start new pomodoro.',
        });
      }

      const result = await pomodoroService.startTaskless(ctx.user.userId, input.label);

      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'CONFLICT' ? 'CONFLICT' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to start taskless pomodoro',
        });
      }

      await dailyStateService.updateSystemState(ctx.user.userId, 'focus');
      await broadcastPolicyUpdate(ctx.user.userId);

      return result.data;
    }),

  /**
   * Get time slice summary for a pomodoro
   * Requirements: Req 4 - Time Attribution
   */
  getSummary: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const result = await pomodoroService.getSummary(input.id, ctx.user.userId);

      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get summary',
        });
      }

      return result.data;
    }),

  /**
   * Complete the current task during an active pomodoro
   * Requirements: Req 2 - Complete Task in Pomodoro
   */
  completeTask: protectedProcedure
    .input(z.object({
      pomodoroId: z.string().uuid(),
      nextTaskId: z.string().uuid().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await pomodoroService.completeTaskInPomodoro(
        input.pomodoroId,
        ctx.user.userId,
        input.nextTaskId
      );

      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to complete task',
        });
      }

      return result.data;
    }),

  /**
   * Get the last task worked on
   */
  getLastTask: protectedProcedure.query(async ({ ctx }) => {
    const result = await pomodoroService.getLastTask(ctx.user.userId);

    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get last task',
      });
    }

    return result.data;
  }),

  /**
   * Record a pomodoro retroactively (for forgotten sessions)
   */
  record: protectedProcedure
    .input(RecordPomodoroSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await pomodoroService.record(ctx.user.userId, input);

      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to record pomodoro',
        });
      }

      // Increment pomodoro count for the day of completion
      await dailyStateService.incrementPomodoroCount(ctx.user.userId);

      return result.data;
    }),
});
