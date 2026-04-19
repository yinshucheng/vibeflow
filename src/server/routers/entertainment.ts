/**
 * Entertainment tRPC Router
 * 
 * Exposes endpoints for managing entertainment mode, quota, and settings.
 * Requirements: 5.7, 8.2, 8.3, 8.4, 8.5
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, readProcedure, writeProcedure } from '../trpc';
import {
  entertainmentService,
  UpdateEntertainmentSettingsSchema,
} from '@/services/entertainment.service';
import { dailyResetSchedulerService } from '@/services/daily-reset-scheduler.service';
import { broadcastPolicyUpdate } from '@/services/socket-broadcast.service';

export const entertainmentRouter = router({
  /**
   * Get entertainment status (quota, cooldown, active session)
   * Requirements: 8.2
   */
  getStatus: readProcedure.query(async ({ ctx }) => {
    const result = await entertainmentService.getStatus(ctx.user.userId);

    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get entertainment status',
      });
    }

    return result.data;
  }),

  /**
   * Start entertainment mode
   * Requirements: 8.3
   */
  start: writeProcedure.mutation(async ({ ctx }) => {
    const result = await entertainmentService.startEntertainment(ctx.user.userId);

    if (!result.success) {
      const code =
        result.error?.code === 'ENT_WORK_TIME'
          ? 'PRECONDITION_FAILED'
          : result.error?.code === 'ENT_QUOTA_EXHAUSTED'
            ? 'PRECONDITION_FAILED'
            : result.error?.code === 'ENT_COOLDOWN'
              ? 'PRECONDITION_FAILED'
              : result.error?.code === 'ENT_SESSION_ACTIVE'
                ? 'CONFLICT'
                : 'INTERNAL_SERVER_ERROR';

      throw new TRPCError({
        code,
        message: result.error?.message ?? 'Failed to start entertainment mode',
      });
    }

    // Broadcast updated policy to all connected clients
    await broadcastPolicyUpdate(ctx.user.userId);

    return result.data;
  }),

  /**
   * Stop entertainment mode
   * Requirements: 8.4
   */
  stop: writeProcedure
    .input(
      z.object({
        reason: z.enum(['manual', 'quota_exhausted', 'work_time_start']).optional().default('manual'),
      }).optional()
    )
    .mutation(async ({ ctx, input }) => {
      const reason = input?.reason ?? 'manual';
      const result = await entertainmentService.stopEntertainment(ctx.user.userId, reason);

      if (!result.success) {
        const code =
          result.error?.code === 'SESSION_NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR';

        throw new TRPCError({
          code,
          message: result.error?.message ?? 'Failed to stop entertainment mode',
        });
      }

      // Broadcast updated policy to all connected clients
      await broadcastPolicyUpdate(ctx.user.userId);

      return result.data;
    }),

  /**
   * Update entertainment settings (blacklist, whitelist, quota, cooldown)
   * Requirements: 8.5, 7.11, 7.12
   */
  updateSettings: writeProcedure
    .input(UpdateEntertainmentSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await entertainmentService.updateSettings(ctx.user.userId, input);

      if (!result.success) {
        const code =
          result.error?.code === 'VALIDATION_ERROR'
            ? 'BAD_REQUEST'
            : result.error?.code === 'WORK_TIME_RESTRICTION'
              ? 'PRECONDITION_FAILED'
              : 'INTERNAL_SERVER_ERROR';

        throw new TRPCError({
          code,
          message: result.error?.message ?? 'Failed to update entertainment settings',
          cause: result.error?.details,
        });
      }

      // Broadcast updated policy to all connected clients
      await broadcastPolicyUpdate(ctx.user.userId);

      return result.data;
    }),

  /**
   * Update quota usage (for syncing from clients)
   * Requirements: 8.5, 8.7
   */
  updateQuotaUsage: writeProcedure
    .input(
      z.object({
        usedMinutes: z.number().int().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await entertainmentService.updateQuotaUsage(
        ctx.user.userId,
        input.usedMinutes
      );

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to update quota usage',
        });
      }

      return result.data;
    }),

  /**
   * Get entertainment history for stats
   */
  getHistory: readProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(365).optional().default(7),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 7;
      const result = await entertainmentService.getHistory(ctx.user.userId, days);

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get entertainment history',
        });
      }

      return result.data;
    }),

  /**
   * Get configuration constants
   */
  getConfig: readProcedure.query(() => {
    return entertainmentService.getConfig();
  }),

  /**
   * Add a visited site to today's entertainment state
   */
  addVisitedSite: writeProcedure
    .input(
      z.object({
        domain: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await entertainmentService.addVisitedSite(ctx.user.userId, input.domain);

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to add visited site',
        });
      }

      return { success: true };
    }),

  /**
   * Reset daily quota for the current user
   * Requirements: 5.7
   * 
   * This is useful for testing or when a user needs their quota reset manually.
   */
  resetMyDailyQuota: writeProcedure.mutation(async ({ ctx }) => {
    const result = await entertainmentService.resetUserDailyQuota(ctx.user.userId);

    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to reset daily quota',
      });
    }

    // Broadcast updated policy to all connected clients
    await broadcastPolicyUpdate(ctx.user.userId);

    return result.data;
  }),

  /**
   * Get daily reset scheduler status
   * Requirements: 5.7
   */
  getResetSchedulerStatus: readProcedure.query(() => {
    return dailyResetSchedulerService.getStatus();
  }),

  /**
   * Get next reset time
   * Requirements: 5.7
   */
  getNextResetTime: readProcedure.query(() => {
    return {
      nextResetTime: entertainmentService.getNextResetTime().toISOString(),
      millisecondsUntilReset: entertainmentService.getMillisecondsUntilReset(),
    };
  }),
});
