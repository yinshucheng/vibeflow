/**
 * Work Start tRPC Router
 * 
 * Exposes endpoints for work start time tracking and statistics.
 * Requirements: 14.1, 14.2, 14.5, 14.6
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, readProcedure, writeProcedure } from '../trpc';
import { workStartService } from '@/services/work-start.service';

export const workStartRouter = router({
  /**
   * Get today's work start record
   * Requirements: 14.2
   */
  getToday: readProcedure.query(async ({ ctx }) => {
    const result = await workStartService.getTodayWorkStart(ctx.user.userId);

    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get today work start',
      });
    }

    return result.data;
  }),

  /**
   * Record work start (called when Airlock is completed)
   * Requirements: 14.1
   */
  record: writeProcedure
    .input(
      z.object({
        configuredStartTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
        actualStartTime: z.date().optional(),
      }).optional()
    )
    .mutation(async ({ ctx, input }) => {
      // Transform input to match service expectations
      const serviceInput = input?.configuredStartTime 
        ? { configuredStartTime: input.configuredStartTime, actualStartTime: input.actualStartTime }
        : undefined;
      
      const result = await workStartService.recordWorkStart(ctx.user.userId, serviceInput);

      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to record work start',
        });
      }

      return result.data;
    }),

  /**
   * Get work start history
   * Requirements: 14.5
   */
  getHistory: readProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(365).optional().default(30),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 30;
      const result = await workStartService.getHistory(ctx.user.userId, days);

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get work start history',
        });
      }

      return result.data;
    }),

  /**
   * Get work start statistics
   * Requirements: 14.5
   */
  getStats: readProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(365).optional().default(30),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 30;
      const result = await workStartService.getStats(ctx.user.userId, days);

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get work start stats',
        });
      }

      return result.data;
    }),

  /**
   * Get work start trend data for charts
   * Requirements: 14.6
   */
  getTrend: readProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(365).optional().default(30),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 30;
      const result = await workStartService.getTrend(ctx.user.userId, days);

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get work start trend',
        });
      }

      return result.data;
    }),
});
