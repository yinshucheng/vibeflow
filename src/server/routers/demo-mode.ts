/**
 * Demo Mode tRPC Router
 * 
 * Exposes endpoints for demo mode management including activation,
 * deactivation, state queries, and history.
 * Requirements: 6.8, 6.11
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, readProcedure, writeProcedure } from '../trpc';
import {
  demoModeService,
  MIN_DEMO_DURATION_MINUTES,
  MAX_DEMO_DURATION_MINUTES,
} from '@/services/demo-mode.service';

export const demoModeRouter = router({
  /**
   * Get the current demo mode state
   * Requirements: 6.5, 6.6
   */
  getDemoModeState: readProcedure.query(async ({ ctx }) => {
    const result = await demoModeService.getDemoModeState(ctx.user.userId);

    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get demo mode state',
      });
    }

    return result.data;
  }),

  /**
   * Get remaining demo tokens for the current month
   * Requirements: 6.3
   */
  getRemainingTokens: readProcedure.query(async ({ ctx }) => {
    const result = await demoModeService.getRemainingTokens(ctx.user.userId);

    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get remaining tokens',
      });
    }

    return result.data;
  }),

  /**
   * Activate demo mode
   * Requirements: 6.1, 6.2, 7.1, 7.2, 7.3, 7.4, 7.5
   */
  activateDemoMode: writeProcedure
    .input(
      z.object({
        confirmPhrase: z.string().min(1, 'Confirmation phrase is required'),
        durationMinutes: z
          .number()
          .int()
          .min(MIN_DEMO_DURATION_MINUTES)
          .max(MAX_DEMO_DURATION_MINUTES)
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await demoModeService.activateDemoMode({
        userId: ctx.user.userId,
        confirmPhrase: input.confirmPhrase,
        durationMinutes: input.durationMinutes,
      });

      if (!result.success) {
        const errorCode = result.error?.code;
        let trpcCode: 'BAD_REQUEST' | 'CONFLICT' | 'INTERNAL_SERVER_ERROR' = 'INTERNAL_SERVER_ERROR';
        
        if (errorCode === 'VALIDATION_ERROR') {
          trpcCode = 'BAD_REQUEST';
        } else if (errorCode === 'CONFLICT') {
          trpcCode = 'CONFLICT';
        }

        throw new TRPCError({
          code: trpcCode,
          message: result.error?.message ?? 'Failed to activate demo mode',
        });
      }

      return result.data;
    }),

  /**
   * Deactivate demo mode (manual exit)
   * Requirements: 6.7
   */
  deactivateDemoMode: writeProcedure.mutation(async ({ ctx }) => {
    const result = await demoModeService.deactivateDemoMode(ctx.user.userId);

    if (!result.success) {
      const errorCode = result.error?.code;
      let trpcCode: 'NOT_FOUND' | 'INTERNAL_SERVER_ERROR' = 'INTERNAL_SERVER_ERROR';
      
      if (errorCode === 'NOT_FOUND') {
        trpcCode = 'NOT_FOUND';
      }

      throw new TRPCError({
        code: trpcCode,
        message: result.error?.message ?? 'Failed to deactivate demo mode',
      });
    }

    return { success: true };
  }),

  /**
   * Get demo mode usage history
   * Requirements: 6.8, 6.11
   */
  getDemoModeHistory: readProcedure
    .input(
      z.object({
        months: z.number().int().min(1).max(12).optional().default(3),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const months = input?.months ?? 3;
      const result = await demoModeService.getDemoModeHistory(ctx.user.userId, months);

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get demo mode history',
        });
      }

      return result.data;
    }),

  /**
   * Check if user can activate demo mode
   * Returns detailed information about activation eligibility
   * Requirements: 7.2, 7.3, 7.4, 7.5
   */
  canActivateDemoMode: readProcedure.query(async ({ ctx }) => {
    const result = await demoModeService.canActivateDemoMode(ctx.user.userId);

    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to check demo mode activation',
      });
    }

    return result.data;
  }),

  /**
   * Get demo mode configuration
   * Returns default and user-specific configuration
   */
  getConfig: readProcedure.query(async () => {
    const defaultConfig = demoModeService.getDefaultConfig();
    const nextResetDate = demoModeService.getNextTokenResetDate();

    return {
      ...defaultConfig,
      nextResetDate,
      minDurationMinutes: MIN_DEMO_DURATION_MINUTES,
      maxDurationMinutes: MAX_DEMO_DURATION_MINUTES,
    };
  }),
});
