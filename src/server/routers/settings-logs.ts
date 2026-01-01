/**
 * Settings Modification Logs tRPC Router
 * 
 * Exposes endpoints for viewing settings modification audit trail.
 * Requirements: 8.7
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { settingsModificationLogService } from '@/services/settings-modification-log.service';

// Query options schema
const GetLogsOptionsSchema = z.object({
  settingKey: z.string().optional(),
  startDate: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
  endDate: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
  successOnly: z.boolean().optional(),
  failedOnly: z.boolean().optional(),
  limit: z.number().min(1).max(100).optional().default(50),
  offset: z.number().min(0).optional().default(0),
});

export const settingsLogsRouter = router({
  /**
   * Get settings modification logs
   * Requirements: 8.7
   */
  list: protectedProcedure
    .input(GetLogsOptionsSchema.optional())
    .query(async ({ ctx, input }) => {
      const result = await settingsModificationLogService.getLogs(ctx.user.userId, input);
      
      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get settings modification logs',
        });
      }
      
      return result.data ?? [];
    }),

  /**
   * Get a single log entry by ID
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const result = await settingsModificationLogService.getById(ctx.user.userId, input.id);
      
      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get settings modification log',
        });
      }
      
      if (!result.data) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Log entry not found',
        });
      }
      
      return result.data;
    }),

  /**
   * Get modification summary
   * Requirements: 8.7
   */
  summary: protectedProcedure
    .input(z.object({
      startDate: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
      endDate: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
    }).optional())
    .query(async ({ ctx, input }) => {
      const result = await settingsModificationLogService.getSummary(ctx.user.userId, input);
      
      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get modification summary',
        });
      }
      
      return result.data;
    }),

  /**
   * Get logs for a specific setting
   * Requirements: 8.7
   */
  forSetting: protectedProcedure
    .input(z.object({
      settingKey: z.string(),
      limit: z.number().min(1).max(100).optional().default(20),
    }))
    .query(async ({ ctx, input }) => {
      const result = await settingsModificationLogService.getLogsForSetting(
        ctx.user.userId,
        input.settingKey,
        input.limit
      );
      
      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get logs for setting',
        });
      }
      
      return result.data ?? [];
    }),

  /**
   * Get failed modification attempts
   * Requirements: 8.7
   */
  failedAttempts: protectedProcedure
    .input(z.object({
      startDate: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
      endDate: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
      limit: z.number().min(1).max(100).optional().default(20),
    }).optional())
    .query(async ({ ctx, input }) => {
      const result = await settingsModificationLogService.getFailedAttempts(ctx.user.userId, input);
      
      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get failed attempts',
        });
      }
      
      return result.data ?? [];
    }),

  /**
   * Count total logs
   */
  count: protectedProcedure
    .input(z.object({
      settingKey: z.string().optional(),
      successOnly: z.boolean().optional(),
      failedOnly: z.boolean().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const result = await settingsModificationLogService.countLogs(ctx.user.userId, input);
      
      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to count logs',
        });
      }
      
      return result.data ?? 0;
    }),
});
