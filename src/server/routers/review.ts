/**
 * Review tRPC Router
 * 
 * Exposes daily review and trend data endpoints.
 * Requirements: 10.3, 10.4, 10.5, 10.6, 10.8
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, readProcedure } from '../trpc';
import { reviewService } from '@/services/review.service';

export const reviewRouter = router({
  /**
   * Get daily review data for a specific date
   * Requirements: 10.3, 10.4, 10.5, 10.6
   */
  getDaily: readProcedure
    .input(z.object({
      date: z.date(),
    }))
    .query(async ({ ctx, input }) => {
      const result = await reviewService.getDailyReview(ctx.user.userId, input.date);
      
      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get daily review',
        });
      }
      
      return result.data;
    }),

  /**
   * Get today's review data
   * Requirements: 10.3, 10.4, 10.5, 10.6
   */
  getToday: readProcedure.query(async ({ ctx }) => {
    const result = await reviewService.getDailyReview(ctx.user.userId, new Date());
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get today review',
      });
    }
    
    return result.data;
  }),

  /**
   * Get weekly trend data
   * Requirements: 10.8
   */
  getWeeklyTrend: readProcedure
    .input(z.object({
      weekStart: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const weekStart = input.weekStart ?? new Date();
      const result = await reviewService.getWeeklyTrend(ctx.user.userId, weekStart);
      
      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get weekly trend',
        });
      }
      
      return result.data;
    }),

  /**
   * Get review data for a date range
   * Requirements: 10.8
   */
  getRange: readProcedure
    .input(z.object({
      startDate: z.date(),
      endDate: z.date(),
    }))
    .query(async ({ ctx, input }) => {
      const result = await reviewService.getReviewRange(
        ctx.user.userId,
        input.startDate,
        input.endDate
      );
      
      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get review range',
        });
      }
      
      return result.data;
    }),
});
