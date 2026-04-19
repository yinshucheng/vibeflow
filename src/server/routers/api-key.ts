/**
 * API Key Management tRPC Router
 *
 * Provides endpoints for creating, listing, and revoking API keys.
 * Requirements: R7.2, R7.3, R7.5, R7.6, R7.9
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, readProcedure, adminProcedure } from '../trpc';
import { authService } from '@/services';

export const apiKeyRouter = router({
  /**
   * List all active API keys for the current user
   * Requirements: R7.5
   */
  list: readProcedure.query(async ({ ctx }) => {
    const result = await authService.getUserTokens(ctx.user.userId);

    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to list API keys',
      });
    }

    return result.data;
  }),

  /**
   * Create a new API key
   * Requirements: R7.3, R7.9
   */
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        description: z.string().max(200).optional(),
        scopes: z.array(z.enum(['read', 'write', 'admin'])).min(1).default(['read', 'write']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check active token limit (max 10)
      const countResult = await authService.countActiveTokens(ctx.user.userId);
      if (!countResult.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to check token count',
        });
      }

      if (countResult.data! >= 10) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: '最多创建 10 个活跃 API Key',
        });
      }

      const result = await authService.createToken(ctx.user.userId, {
        name: input.name,
        description: input.description,
        scopes: input.scopes,
        clientType: 'api',
      });

      if (!result.success) {
        if (result.error?.code === 'VALIDATION_ERROR') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: result.error.message,
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to create API key',
        });
      }

      return result.data;
    }),

  /**
   * Revoke an API key
   * Requirements: R7.6
   */
  revoke: adminProcedure
    .input(
      z.object({
        tokenId: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await authService.revokeToken(ctx.user.userId, input.tokenId);

      if (!result.success) {
        if (result.error?.code === 'NOT_FOUND') {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'API Key 不存在',
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to revoke API key',
        });
      }

      return { success: true };
    }),
});
