/**
 * Bypass Detection tRPC Router
 * 
 * Exposes endpoints for bypass detection and monitoring.
 * Requirements: 4.4, 4.5
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, readProcedure } from '../trpc';
import {
  bypassDetectionService,
  GetBypassHistorySchema,
} from '@/services/bypass-detection.service';

export const bypassDetectionRouter = router({
  /**
   * Get the current bypass score for the user
   * Requirements: 4.3, 4.4
   */
  getBypassScore: readProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(30).optional().default(7),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 7;
      const result = await bypassDetectionService.calculateBypassScore(ctx.user.userId, days);

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to calculate bypass score',
        });
      }

      return result.data;
    }),

  /**
   * Get bypass attempt history for the user
   * Requirements: 4.5
   */
  getBypassHistory: readProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(365).optional().default(30),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 30;
      const result = await bypassDetectionService.getBypassHistory({
        userId: ctx.user.userId,
        days,
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get bypass history',
        });
      }

      return result.data;
    }),

  /**
   * Check if a warning should be shown to the user
   * Requirements: 4.4
   */
  shouldShowWarning: readProcedure.query(async ({ ctx }) => {
    const result = await bypassDetectionService.shouldShowWarning(ctx.user.userId);

    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to check warning status',
      });
    }

    return result.data;
  }),

  /**
   * Get bypass statistics for the user
   * Requirements: 4.5
   */
  getBypassStats: readProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(365).optional().default(30),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 30;
      const result = await bypassDetectionService.getBypassStats(ctx.user.userId, days);

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get bypass stats',
        });
      }

      return result.data;
    }),

  /**
   * Get the most recent bypass event
   */
  getLastBypassEvent: readProcedure.query(async ({ ctx }) => {
    const result = await bypassDetectionService.getLastBypassEvent(ctx.user.userId);

    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get last bypass event',
      });
    }

    return result.data;
  }),

  /**
   * Get bypass detection configuration
   */
  getConfig: readProcedure.query(() => {
    return bypassDetectionService.getConfig();
  }),
});
