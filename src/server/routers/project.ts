/**
 * Project tRPC Router
 * 
 * Exposes CRUD endpoints for Project management.
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, readProcedure, writeProcedure } from '../trpc';
import {
  projectService,
  CreateProjectSchema,
  UpdateProjectSchema
} from '@/services/project.service';
import { broadcastDataChange } from '@/services/socket-broadcast.service';

export const projectRouter = router({
  /**
   * Get all projects for the current user
   * Requirements: 1.3
   */
  list: readProcedure.query(async ({ ctx }) => {
    const result = await projectService.getByUser(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get projects',
      });
    }
    
    return result.data;
  }),

  /**
   * Get a single project by ID
   */
  getById: readProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const result = await projectService.getById(input.id, ctx.user.userId);
      
      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get project',
        });
      }
      
      return result.data;
    }),

  /**
   * Create a new project
   * Requirements: 1.1, 1.2
   */
  create: writeProcedure
    .input(CreateProjectSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await projectService.create(ctx.user.userId, input);

      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to create project',
          cause: result.error?.details,
        });
      }

      broadcastDataChange(ctx.user.userId, 'project', 'create', [result.data!.id]);
      return result.data;
    }),

  /**
   * Update an existing project
   * Requirements: 1.4
   */
  update: writeProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: UpdateProjectSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await projectService.update(
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
          message: result.error?.message ?? 'Failed to update project',
          cause: result.error?.details,
        });
      }

      broadcastDataChange(ctx.user.userId, 'project', 'update', [input.id]);
      return result.data;
    }),

  /**
   * Archive a project and all its tasks
   * Requirements: 1.5
   */
  archive: writeProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await projectService.archive(input.id, ctx.user.userId);

      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to archive project',
        });
      }

      broadcastDataChange(ctx.user.userId, 'project', 'delete', [input.id]);
      return result.data;
    }),

  /**
   * Get project estimation (aggregated time from tasks)
   * Requirements: 21.1, 21.2, 21.3, 21.4
   */
  getProjectEstimation: readProcedure
    .input(z.object({ 
      id: z.string().uuid(),
      pomodoroDuration: z.number().min(10).max(120).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const result = await projectService.getProjectEstimation(
        input.id,
        ctx.user.userId,
        input.pomodoroDuration
      );
      
      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get project estimation',
        });
      }
      
      return result.data;
    }),
});
