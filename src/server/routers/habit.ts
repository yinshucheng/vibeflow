/**
 * Habit tRPC Router
 *
 * Exposes CRUD and entry recording endpoints for habit tracking.
 * Thin router layer — all business logic delegated to habitService.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import {
  habitService,
  CreateHabitSchema,
  UpdateHabitSchema,
  RecordEntrySchema,
} from '@/services/habit.service';

export const habitRouter = router({
  /**
   * Create a new habit
   */
  create: protectedProcedure
    .input(CreateHabitSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await habitService.create(ctx.user.userId, input);

      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to create habit',
          cause: result.error?.details,
        });
      }

      // TODO: broadcastHabitUpdate(ctx.user.userId, { type: 'habit:created', habit: result.data })
      // → To be implemented in Task 1.5 (src/server/socket.ts)

      return result.data;
    }),

  /**
   * Update an existing habit
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: UpdateHabitSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await habitService.update(
        ctx.user.userId,
        input.id,
        input.data,
      );

      if (!result.success) {
        const code =
          result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' :
          result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' :
          'INTERNAL_SERVER_ERROR';

        throw new TRPCError({
          code,
          message: result.error?.message ?? 'Failed to update habit',
          cause: result.error?.details,
        });
      }

      // TODO: broadcastHabitUpdate(ctx.user.userId, { type: 'habit:updated', habit: result.data })
      // → To be implemented in Task 1.5 (src/server/socket.ts)

      return result.data;
    }),

  /**
   * Update habit status (ACTIVE / PAUSED / ARCHIVED)
   */
  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await habitService.updateStatus(
        ctx.user.userId,
        input.id,
        input.status,
      );

      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to update habit status',
        });
      }

      // TODO: broadcastHabitUpdate(ctx.user.userId, { type: 'habit:updated', habit: result.data })
      // → To be implemented in Task 1.5 (src/server/socket.ts)

      return result.data;
    }),

  /**
   * Delete a habit (cascades to entries)
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await habitService.delete(ctx.user.userId, input.id);

      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to delete habit',
        });
      }

      // TODO: broadcastHabitUpdate(ctx.user.userId, { type: 'habit:deleted', habitId: input.id })
      // → To be implemented in Task 1.5 (src/server/socket.ts)

      return { success: true };
    }),

  /**
   * Record a habit entry (complete / update value)
   */
  recordEntry: protectedProcedure
    .input(RecordEntrySchema)
    .mutation(async ({ ctx, input }) => {
      const result = await habitService.recordEntry(
        ctx.user.userId,
        input.habitId,
        input.date,
        input.value,
        input.note,
      );

      if (!result.success) {
        const code =
          result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' :
          result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' :
          'INTERNAL_SERVER_ERROR';

        throw new TRPCError({
          code,
          message: result.error?.message ?? 'Failed to record habit entry',
          cause: result.error?.details,
        });
      }

      // TODO: broadcastHabitUpdate(ctx.user.userId, { type: 'habit:entry_updated', entry: result.data })
      // → To be implemented in Task 1.5 (src/server/socket.ts)

      return result.data;
    }),

  /**
   * Skip a habit for a given date
   */
  skipEntry: protectedProcedure
    .input(
      z.object({
        habitId: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await habitService.skipEntry(
        ctx.user.userId,
        input.habitId,
        input.date,
      );

      if (!result.success) {
        const code =
          result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' :
          result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' :
          'INTERNAL_SERVER_ERROR';

        throw new TRPCError({
          code,
          message: result.error?.message ?? 'Failed to skip habit entry',
          cause: result.error?.details,
        });
      }

      // TODO: broadcastHabitUpdate(ctx.user.userId, { type: 'habit:entry_updated', entry: result.data })
      // → To be implemented in Task 1.5 (src/server/socket.ts)

      return result.data;
    }),

  /**
   * Delete a habit entry for a given date
   */
  deleteEntry: protectedProcedure
    .input(
      z.object({
        habitId: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await habitService.deleteEntry(
        ctx.user.userId,
        input.habitId,
        input.date,
      );

      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to delete habit entry',
        });
      }

      // TODO: broadcastHabitUpdate(ctx.user.userId, { type: 'habit:entry_updated', habitId: input.habitId, date: input.date })
      // → To be implemented in Task 1.5 (src/server/socket.ts)

      return { success: true };
    }),

  /**
   * List habits for the current user
   */
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const result = await habitService.listByUser(
        ctx.user.userId,
        input ? { status: input.status } : undefined,
      );

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to list habits',
        });
      }

      return result.data;
    }),

  /**
   * Get today's due habits with completion status and streak
   */
  getToday: protectedProcedure.query(async ({ ctx }) => {
    const result = await habitService.getTodayHabits(ctx.user.userId);

    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get today habits',
      });
    }

    return result.data;
  }),
});
