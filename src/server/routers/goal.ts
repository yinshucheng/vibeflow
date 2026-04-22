/**
 * Goal tRPC Router
 * 
 * Exposes CRUD and progress endpoints for Goal management.
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.9
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, readProcedure, writeProcedure } from '../trpc';
import {
  goalService,
  CreateGoalSchema,
  UpdateGoalSchema
} from '@/services/goal.service';
import { broadcastDataChange } from '@/services/socket-broadcast.service';

export const goalRouter = router({
  /**
   * Get all goals for the current user
   * Requirements: 11.1
   */
  list: readProcedure.query(async ({ ctx }) => {
    const result = await goalService.getByUser(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get goals',
      });
    }
    
    return result.data;
  }),

  /**
   * Get goal progress
   * Requirements: 11.9
   */
  getProgress: readProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const result = await goalService.getProgress(input.id, ctx.user.userId);
      
      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get goal progress',
        });
      }
      
      return result.data;
    }),

  /**
   * Create a new goal
   * Requirements: 11.1, 11.2, 11.3
   */
  create: writeProcedure
    .input(CreateGoalSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await goalService.create(ctx.user.userId, input);

      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to create goal',
          cause: result.error?.details,
        });
      }

      broadcastDataChange(ctx.user.userId, 'goal', 'create', [result.data!.id]);
      return result.data;
    }),

  /**
   * Update an existing goal
   */
  update: writeProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: UpdateGoalSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await goalService.update(
        input.id,
        ctx.user.userId,
        input.data
      );

      if (!result.success) {
        const code =
          result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' :
          result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' :
          'INTERNAL_SERVER_ERROR';

        throw new TRPCError({
          code,
          message: result.error?.message ?? 'Failed to update goal',
          cause: result.error?.details,
        });
      }

      broadcastDataChange(ctx.user.userId, 'goal', 'update', [input.id]);
      return result.data;
    }),

  /**
   * Archive a goal
   */
  archive: writeProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await goalService.archive(input.id, ctx.user.userId);

      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to archive goal',
        });
      }

      broadcastDataChange(ctx.user.userId, 'goal', 'delete', [input.id]);
      return result.data;
    }),

  /**
   * Link a project to a goal
   * Requirements: 11.4, 11.5
   */
  linkProject: writeProcedure
    .input(
      z.object({
        goalId: z.string().uuid(),
        projectId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await goalService.linkProject(
        input.goalId,
        input.projectId,
        ctx.user.userId
      );

      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to link project to goal',
        });
      }

      broadcastDataChange(ctx.user.userId, 'goal', 'update', [input.goalId]);
      return { success: true };
    }),

  /**
   * Unlink a project from a goal
   */
  unlinkProject: writeProcedure
    .input(
      z.object({
        goalId: z.string().uuid(),
        projectId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await goalService.unlinkProject(
        input.goalId,
        input.projectId,
        ctx.user.userId
      );

      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to unlink project from goal',
        });
      }

      broadcastDataChange(ctx.user.userId, 'goal', 'update', [input.goalId]);
      return { success: true };
    }),
});
