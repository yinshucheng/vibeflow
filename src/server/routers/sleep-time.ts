/**
 * Sleep Time tRPC Router
 * 
 * Exposes endpoints for managing sleep time configuration and snooze functionality.
 * Requirements: 9.1, 12.1
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, readProcedure, writeProcedure } from '../trpc';
import {
  sleepTimeService,
  UpdateSleepTimeConfigSchema,
} from '@/services/sleep-time.service';
import { broadcastPolicyUpdate } from '@/services/socket-broadcast.service';

export const sleepTimeRouter = router({
  /**
   * Get sleep time configuration
   * Requirements: 9.1
   */
  getConfig: readProcedure.query(async ({ ctx }) => {
    const result = await sleepTimeService.getConfig(ctx.user.userId);

    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get sleep time config',
      });
    }

    return result.data;
  }),

  /**
   * Update sleep time configuration
   * Requirements: 9.1, 9.4
   */
  updateConfig: writeProcedure
    .input(UpdateSleepTimeConfigSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await sleepTimeService.updateConfig(ctx.user.userId, input);

      if (!result.success) {
        const code =
          result.error?.code === 'VALIDATION_ERROR'
            ? 'BAD_REQUEST'
            : 'INTERNAL_SERVER_ERROR';

        throw new TRPCError({
          code,
          message: result.error?.message ?? 'Failed to update sleep time config',
          cause: result.error?.details,
        });
      }

      // Broadcast updated policy to all connected clients
      await broadcastPolicyUpdate(ctx.user.userId);

      return result.data;
    }),

  /**
   * Request snooze for sleep enforcement
   * Requirements: 12.1
   */
  requestSnooze: writeProcedure.mutation(async ({ ctx }) => {
    const result = await sleepTimeService.requestSnooze(ctx.user.userId);

    if (!result.success) {
      const code =
        result.error?.code === 'SNOOZE_LIMIT_REACHED'
          ? 'PRECONDITION_FAILED'
          : 'INTERNAL_SERVER_ERROR';

      throw new TRPCError({
        code,
        message: result.error?.message ?? 'Failed to request snooze',
      });
    }

    // Broadcast updated policy with snooze state
    await broadcastPolicyUpdate(ctx.user.userId);

    return result.data;
  }),

  /**
   * Get remaining snoozes for tonight
   * Requirements: 12.3, 12.4
   */
  getRemainingSnoozes: readProcedure.query(async ({ ctx }) => {
    const result = await sleepTimeService.getRemainingSnoozes(ctx.user.userId);

    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get remaining snoozes',
      });
    }

    return result.data;
  }),

  /**
   * Check if currently in sleep time window
   * Requirements: 9.4
   */
  isInSleepTime: readProcedure.query(async ({ ctx }) => {
    const result = await sleepTimeService.isInSleepTime(ctx.user.userId);

    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to check sleep time status',
      });
    }

    return result.data;
  }),

  /**
   * Check if currently in an active snooze period
   */
  isInSnooze: readProcedure.query(async ({ ctx }) => {
    const result = await sleepTimeService.isInSnooze(ctx.user.userId);

    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to check snooze status',
      });
    }

    return result.data;
  }),

  /**
   * Get exemption history
   * Requirements: 14.3, 14.4, 14.5
   */
  getExemptionHistory: readProcedure
    .input(
      z
        .object({
          days: z.number().int().min(1).max(365).optional().default(7),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 7;
      const result = await sleepTimeService.getExemptionHistory(ctx.user.userId, days);

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get exemption history',
        });
      }

      return result.data;
    }),

  /**
   * Get exemption statistics
   * Requirements: 14.4, 14.5
   */
  getExemptionStats: readProcedure
    .input(
      z
        .object({
          days: z.number().int().min(1).max(365).optional().default(7),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 7;
      const result = await sleepTimeService.getExemptionStats(ctx.user.userId, days);

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get exemption stats',
        });
      }

      return result.data;
    }),

  /**
   * Get preset sleep enforcement apps
   * Requirements: 10.2
   */
  getPresetApps: readProcedure.query(() => {
    return sleepTimeService.getPresetApps();
  }),
});
