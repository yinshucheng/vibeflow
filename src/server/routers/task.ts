/**
 * Task tRPC Router
 * 
 * Exposes CRUD and reorder endpoints for Task management.
 * Requirements: 2.1, 2.3, 2.5, 2.6
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { 
  taskService, 
  CreateTaskSchema, 
  UpdateTaskSchema 
} from '@/services/task.service';

export const taskRouter = router({
  /**
   * Get a single task by ID
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const result = await taskService.getById(input.id, ctx.user.userId);
      
      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get task',
        });
      }
      
      return result.data;
    }),

  /**
   * Get tasks by project with hierarchy
   * Requirements: 2.4
   */
  getByProject: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const result = await taskService.getByProject(input.projectId, ctx.user.userId);
      
      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get tasks',
        });
      }
      
      return result.data;
    }),

  /**
   * Get today's tasks for the current user
   */
  getTodayTasks: protectedProcedure.query(async ({ ctx }) => {
    const result = await taskService.getTodayTasks(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get today tasks',
      });
    }
    
    return result.data;
  }),

  /**
   * Get overdue tasks (past plan date, not completed)
   */
  getOverdue: protectedProcedure.query(async ({ ctx }) => {
    const result = await taskService.getOverdue(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get overdue tasks',
      });
    }
    
    return result.data;
  }),

  /**
   * Get backlog tasks (no plan date or future date)
   */
  getBacklog: protectedProcedure.query(async ({ ctx }) => {
    const result = await taskService.getBacklog(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get backlog',
      });
    }
    
    return result.data;
  }),

  /**
   * Create a new task
   * Requirements: 2.1, 2.3
   */
  create: protectedProcedure
    .input(CreateTaskSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await taskService.create(ctx.user.userId, input);
      
      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to create task',
          cause: result.error?.details,
        });
      }
      
      return result.data;
    }),

  /**
   * Update an existing task
   * Requirements: 2.5
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: UpdateTaskSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await taskService.update(
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
          message: result.error?.message ?? 'Failed to update task',
          cause: result.error?.details,
        });
      }
      
      return result.data;
    }),

  /**
   * Update task status with optional cascade to subtasks
   * Requirements: 2.5, 2.7
   */
  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']),
        cascadeToSubtasks: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await taskService.updateStatus(
        input.id,
        ctx.user.userId,
        input.status,
        input.cascadeToSubtasks
      );
      
      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to update task status',
        });
      }
      
      return result.data;
    }),

  /**
   * Reorder a task within its project
   * Requirements: 2.6
   */
  reorder: protectedProcedure
    .input(
      z.object({
        taskId: z.string().uuid(),
        newIndex: z.number().int().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await taskService.reorder(
        input.taskId,
        ctx.user.userId,
        input.newIndex
      );
      
      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to reorder task',
        });
      }
      
      return { success: true };
    }),

  /**
   * Delete a task
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await taskService.delete(input.id, ctx.user.userId);
      
      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to delete task',
        });
      }
      
      return { success: true };
    }),

  /**
   * Get yesterday's incomplete tasks for airlock review
   * Requirements: 3.3
   */
  getYesterdayIncompleteTasks: protectedProcedure.query(async ({ ctx }) => {
    const result = await taskService.getYesterdayIncompleteTasks(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get yesterday tasks',
      });
    }
    
    return result.data;
  }),

  /**
   * Defer a task to today (reschedule)
   * Requirements: 3.4
   */
  deferToToday: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await taskService.deferToToday(input.id, ctx.user.userId);
      
      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to defer task',
        });
      }
      
      return result.data;
    }),

  /**
   * Set plan date for a task
   * Requirements: 3.6
   */
  setPlanDate: protectedProcedure
    .input(z.object({ 
      id: z.string().uuid(),
      planDate: z.coerce.date().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await taskService.setPlanDate(input.id, ctx.user.userId, input.planDate);
      
      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to set plan date',
        });
      }
      
      return result.data;
    }),

  /**
   * Get backlog tasks grouped by project
   * Requirements: 3.5
   */
  getBacklogByProject: protectedProcedure.query(async ({ ctx }) => {
    const result = await taskService.getBacklogByProject(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get backlog by project',
      });
    }
    
    return result.data;
  }),

  /**
   * Get task with estimation details (estimated vs actual time)
   * Requirements: 20.4, 20.5
   */
  getTaskWithEstimation: protectedProcedure
    .input(z.object({ 
      id: z.string().uuid(),
      pomodoroDuration: z.number().min(10).max(120).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const result = await taskService.getTaskWithEstimation(
        input.id,
        ctx.user.userId,
        input.pomodoroDuration
      );
      
      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get task estimation',
        });
      }
      
      return result.data;
    }),
});
