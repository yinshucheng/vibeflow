/**
 * Time Slice tRPC Router
 *
 * Manages task time slices within pomodoro sessions for multi-task tracking.
 * Requirements: Req 1, Req 4
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, readProcedure, writeProcedure } from '../trpc';
import { timeSliceService } from '@/services/time-slice.service';

export const timeSliceRouter = router({
  /**
   * Switch to a different task during an active pomodoro
   */
  switch: writeProcedure
    .input(z.object({
      pomodoroId: z.string().uuid(),
      currentSliceId: z.string().uuid().nullable(),
      newTaskId: z.string().uuid().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await timeSliceService.switchTask(
        input.pomodoroId,
        input.currentSliceId,
        input.newTaskId,
        ctx.user!.userId
      );

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to switch task',
        });
      }

      return result.data;
    }),

  /**
   * Get all time slices for a pomodoro
   */
  getByPomodoro: readProcedure
    .input(z.object({ pomodoroId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const result = await timeSliceService.getByPomodoro(input.pomodoroId, ctx.user!.userId);

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get time slices',
        });
      }

      return result.data;
    }),

  /**
   * Update a time slice (for retroactive editing)
   */
  update: writeProcedure
    .input(z.object({
      sliceId: z.string().uuid(),
      taskId: z.string().uuid().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await timeSliceService.updateSlice(input.sliceId, {
        taskId: input.taskId,
      }, ctx.user!.userId);

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to update time slice',
        });
      }

      return result.data;
    }),
});
