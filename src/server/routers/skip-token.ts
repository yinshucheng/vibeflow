/**
 * Skip Token tRPC Router
 * 
 * Exposes skip token management endpoints for focus enforcement.
 * Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.7
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { skipTokenService, ConsumeSkipTokenSchema } from '@/services/skip-token.service';

export const skipTokenRouter = router({
  /**
   * Get current skip token status
   * Requirements: 5.4, 5.5
   */
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const result = await skipTokenService.getStatus(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get skip token status',
      });
    }
    
    return result.data;
  }),

  /**
   * Consume a skip token (skip or delay)
   * Requirements: 5.2, 5.3
   */
  consume: protectedProcedure
    .input(ConsumeSkipTokenSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await skipTokenService.consume(ctx.user.userId, input);
      
      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to consume skip token',
          cause: result.error?.details,
        });
      }
      
      return result.data;
    }),

  /**
   * Check if user can skip (has remaining tokens)
   * Requirements: 5.5
   */
  canSkip: protectedProcedure.query(async ({ ctx }) => {
    const result = await skipTokenService.canSkip(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to check skip availability',
      });
    }
    
    return result.data;
  }),

  /**
   * Get skip token usage history
   * Requirements: 5.7
   */
  getHistory: protectedProcedure
    .input(z.object({
      startDate: z.date(),
      endDate: z.date(),
    }))
    .query(async ({ ctx, input }) => {
      const result = await skipTokenService.getHistory(
        ctx.user.userId,
        input.startDate,
        input.endDate
      );
      
      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get skip token history',
        });
      }
      
      return result.data;
    }),
});
