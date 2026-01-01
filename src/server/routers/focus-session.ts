/**
 * Focus Session tRPC Router
 * 
 * Exposes endpoints for managing ad-hoc focus sessions.
 * Requirements: 1.1, 3.2, 4.1, 5.1, 8.2
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import {
  focusSessionService,
  StartSessionSchema,
  ExtendSessionSchema,
} from '@/services/focus-session.service';
import { broadcastPolicyUpdate } from '@/services/socket-broadcast.service';

export const focusSessionRouter = router({
  /**
   * Get the current active focus session (if any)
   * Requirements: 5.1
   */
  getActiveSession: protectedProcedure.query(async ({ ctx }) => {
    const result = await focusSessionService.getActiveSession(ctx.user.userId);

    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get active session',
      });
    }

    return result.data;
  }),

  /**
   * Start a new ad-hoc focus session
   * Requirements: 1.1, 13.1, 13.2, 13.3
   */
  startSession: protectedProcedure
    .input(StartSessionSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await focusSessionService.startSession(ctx.user.userId, input);

      if (!result.success) {
        const code =
          result.error?.code === 'VALIDATION_ERROR'
            ? 'BAD_REQUEST'
            : result.error?.code === 'SESSION_ALREADY_ACTIVE'
              ? 'CONFLICT'
              : result.error?.code === 'SLEEP_TIME_ACTIVE'
                ? 'PRECONDITION_FAILED'
                : 'INTERNAL_SERVER_ERROR';

        throw new TRPCError({
          code,
          message: result.error?.message ?? 'Failed to start focus session',
          cause: result.error?.details,
        });
      }

      // Broadcast updated policy to all connected clients (Requirements: 2.5)
      await broadcastPolicyUpdate(ctx.user.userId);

      return result.data;
    }),

  /**
   * End the current active session
   * Requirements: 3.2, 13.4
   * Note: When a sleep-overriding focus session ends, sleep enforcement resumes automatically
   */
  endSession: protectedProcedure.mutation(async ({ ctx }) => {
    const result = await focusSessionService.endSession(ctx.user.userId);

    if (!result.success) {
      const code =
        result.error?.code === 'SESSION_NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR';

      throw new TRPCError({
        code,
        message: result.error?.message ?? 'Failed to end focus session',
      });
    }

    // Broadcast updated policy to remove enforcement (Requirements: 2.6)
    // This also resumes sleep enforcement if the session was overriding sleep time (Requirements: 13.4)
    await broadcastPolicyUpdate(ctx.user.userId);

    return result.data;
  }),

  /**
   * Extend the current active session
   * Requirements: 4.1
   */
  extendSession: protectedProcedure
    .input(ExtendSessionSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await focusSessionService.extendSession(ctx.user.userId, input);

      if (!result.success) {
        const code =
          result.error?.code === 'VALIDATION_ERROR'
            ? 'BAD_REQUEST'
            : result.error?.code === 'SESSION_NOT_FOUND'
              ? 'NOT_FOUND'
              : 'INTERNAL_SERVER_ERROR';

        throw new TRPCError({
          code,
          message: result.error?.message ?? 'Failed to extend focus session',
          cause: result.error?.details,
        });
      }

      // Broadcast updated policy with new end time
      await broadcastPolicyUpdate(ctx.user.userId);

      return result.data;
    }),

  /**
   * Get session history for stats
   * Requirements: 8.2
   */
  getSessionHistory: protectedProcedure
    .input(
      z
        .object({
          days: z.number().int().min(1).max(365).optional().default(7),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 7;
      const result = await focusSessionService.getSessionHistory(ctx.user.userId, days);

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get session history',
        });
      }

      return result.data;
    }),

  /**
   * Get session statistics
   * Requirements: 8.2, 8.3
   */
  getSessionStats: protectedProcedure
    .input(
      z
        .object({
          days: z.number().int().min(1).max(365).optional().default(7),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 7;
      const result = await focusSessionService.getSessionStats(ctx.user.userId, days);

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get session stats',
        });
      }

      return result.data;
    }),

  /**
   * Check if user is currently in a focus session
   */
  isInFocusSession: protectedProcedure.query(async ({ ctx }) => {
    const result = await focusSessionService.isInFocusSession(ctx.user.userId);

    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to check focus session status',
      });
    }

    return result.data;
  }),

  /**
   * Get duration configuration constants
   */
  getDurationConfig: protectedProcedure.query(() => {
    return focusSessionService.getDurationConfig();
  }),
});
