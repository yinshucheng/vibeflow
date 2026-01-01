/**
 * Goal tRPC Router
 * 
 * Exposes CRUD and progress endpoints for Goal management.
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.9
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { 
  goalService, 
  CreateGoalSchema, 
  UpdateGoalSchema 
} from '@/services/goal.service';

export const goalRouter = router({
  /**
   * Get all goals for the current user
   * Requirements: 11.1
   */
  list: protectedProcedure.query(async ({ ctx }) => {
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
  getProgress: protectedProcedure
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
  create: protectedProcedure
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
      
      return result.data;
    }),

  /**
   * Update an existing goal
   */
  update: protectedProcedure
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
      
      return result.data;
    }),

  /**
   * Archive a goal
   */
  archive: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await goalService.archive(input.id, ctx.user.userId);
      
      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to archive goal',
        });
      }
      
      return result.data;
    }),

  /**
   * Link a project to a goal
   * Requirements: 11.4, 11.5
   */
  linkProject: protectedProcedure
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
      
      return { success: true };
    }),

  /**
   * Unlink a project from a goal
   */
  unlinkProject: protectedProcedure
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
      
      return { success: true };
    }),
});
