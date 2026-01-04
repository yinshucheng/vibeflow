/**
 * Heartbeat tRPC Router
 * 
 * Exposes endpoints for client heartbeat tracking and uptime statistics.
 * Requirements: 3.5, 3.6
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { heartbeatService } from '@/services/heartbeat.service';

export const heartbeatRouter = router({
  /**
   * Get uptime statistics for the user
   * Requirements: 3.6
   */
  getUptimeStats: protectedProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(365).optional().default(30),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 30;
      const result = await heartbeatService.getUptimeStats(ctx.user.userId, days);

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get uptime stats',
        });
      }

      return result.data;
    }),

  /**
   * Get offline event history for the user
   * Requirements: 3.5, 3.6
   */
  getOfflineHistory: protectedProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(365).optional().default(30),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 30;
      const result = await heartbeatService.getOfflineHistory(ctx.user.userId, days);

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get offline history',
        });
      }

      return result.data;
    }),

  /**
   * Get all connected clients for the user
   */
  getClientsByUser: protectedProcedure.query(async ({ ctx }) => {
    const result = await heartbeatService.getClientsByUser(ctx.user.userId);

    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get clients',
      });
    }

    return result.data;
  }),

  /**
   * Get status of a specific client
   */
  getClientStatus: protectedProcedure
    .input(
      z.object({
        clientId: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      const result = await heartbeatService.getClientStatus(input.clientId);

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get client status',
        });
      }

      return result.data;
    }),

  /**
   * Get heartbeat configuration
   */
  getConfig: protectedProcedure.query(() => {
    return heartbeatService.getConfig();
  }),
});
