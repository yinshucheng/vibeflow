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
  CompletePomodoroSchema 
} from '@/services/pomodoro.service';
import { dailyStateService } from '@/services/daily-state.service';
import { statsService, GetStatsSchema } from '@/services/stats.service';
import { socketServer } from '@/server/socket';
import { broadcastPolicyUpdate } from '@/services/socket-broadcast.service';

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
      
      // Broadcast policy update to stop over rest enforcement on desktop
      await broadcastPolicyUpdate(ctx.user.userId);
      
      return result.data;
    }),

  /**
   * Complete a pomodoro session
   * Requirements: 4.6
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

      // Increment pomodoro count and update system state to REST
      await dailyStateService.incrementPomodoroCount(ctx.user.userId);
      await dailyStateService.updateSystemState(ctx.user.userId, 'rest');
      
      // Broadcast policy update to update over rest status on desktop
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
});
