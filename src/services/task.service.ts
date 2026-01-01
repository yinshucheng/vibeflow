import { z } from 'zod';
import prisma from '@/lib/prisma';
import type { Task, TaskStatus, Priority } from '@prisma/client';

// Validation schemas
export const CreateTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500),
  projectId: z.string().uuid('Invalid project ID'),
  parentId: z.string().uuid().optional().nullable(),
  priority: z.enum(['P1', 'P2', 'P3']).default('P2'),
  planDate: z.coerce.date().optional().nullable(),
  estimatedMinutes: z.number().int().min(1).max(480).optional().nullable(), // 1 min to 8 hours (Requirements: 20.1, 20.2)
});

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  priority: z.enum(['P1', 'P2', 'P3']).optional(),
  planDate: z.coerce.date().optional().nullable(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional(),
  estimatedMinutes: z.number().int().min(1).max(480).optional().nullable(), // 1 min to 8 hours (Requirements: 20.1, 20.2)
});

/**
 * Calculate estimated pomodoro count from estimated minutes
 * Requirements: 20.3, 20.6
 * 
 * @param estimatedMinutes - Estimated time in minutes
 * @param pomodoroDuration - Duration of one pomodoro in minutes (default: 25)
 * @returns Estimated number of pomodoros (rounded up)
 */
export function calculateEstimatedPomodoros(
  estimatedMinutes: number | null | undefined,
  pomodoroDuration: number = 25
): number | null {
  if (estimatedMinutes == null || estimatedMinutes <= 0) {
    return null;
  }
  // Round up to ensure we have enough time
  return Math.ceil(estimatedMinutes / pomodoroDuration);
}

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;

// Service result type
export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

// Task with subtasks type
export type TaskWithSubtasks = Task & {
  subTasks: Task[];
};

export const taskService = {
  /**
   * Create a new task
   * Requirements: 2.1, 2.2, 2.3
   */
  async create(userId: string, data: CreateTaskInput): Promise<ServiceResult<Task>> {
    try {
      const validated = CreateTaskSchema.parse(data);

      // Verify project exists and belongs to user
      const project = await prisma.project.findFirst({
        where: { id: validated.projectId, userId },
      });

      if (!project) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Project not found or does not belong to user',
          },
        };
      }

      // If parentId is provided, verify parent task exists and belongs to same project
      if (validated.parentId) {
        const parentTask = await prisma.task.findFirst({
          where: {
            id: validated.parentId,
            projectId: validated.projectId,
            userId,
          },
        });

        if (!parentTask) {
          return {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Parent task not found or does not belong to the same project',
            },
          };
        }
      }

      // Get max sortOrder for the project (or parent task)
      const maxSortOrder = await prisma.task.aggregate({
        where: {
          projectId: validated.projectId,
          parentId: validated.parentId || null,
        },
        _max: { sortOrder: true },
      });

      const task = await prisma.task.create({
        data: {
          title: validated.title,
          projectId: validated.projectId,
          parentId: validated.parentId || null,
          priority: validated.priority as Priority,
          planDate: validated.planDate,
          estimatedMinutes: validated.estimatedMinutes ?? null, // Requirements: 20.1, 20.2
          userId,
          sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
        },
        include: {
          subTasks: true,
        },
      });

      return { success: true, data: task };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid task data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create task',
        },
      };
    }
  },

  /**
   * Update an existing task
   * Requirements: 2.5
   */
  async update(id: string, userId: string, data: UpdateTaskInput): Promise<ServiceResult<Task>> {
    try {
      const validated = UpdateTaskSchema.parse(data);

      // Check task exists and belongs to user
      const existing = await prisma.task.findFirst({
        where: { id, userId },
      });

      if (!existing) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Task not found',
          },
        };
      }

      const task = await prisma.task.update({
        where: { id },
        data: {
          title: validated.title,
          priority: validated.priority as Priority | undefined,
          planDate: validated.planDate,
          status: validated.status as TaskStatus | undefined,
          estimatedMinutes: validated.estimatedMinutes, // Requirements: 20.1, 20.2
        },
        include: {
          subTasks: true,
        },
      });

      return { success: true, data: task };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid task data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update task',
        },
      };
    }
  },

  /**
   * Update task status with optional cascade to subtasks
   * Requirements: 2.5, 2.7
   */
  async updateStatus(
    id: string,
    userId: string,
    status: TaskStatus,
    cascadeToSubtasks: boolean = false
  ): Promise<ServiceResult<Task>> {
    try {
      // Check task exists and belongs to user
      const existing = await prisma.task.findFirst({
        where: { id, userId },
        include: { subTasks: true },
      });

      if (!existing) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Task not found',
          },
        };
      }

      // If marking as DONE and has incomplete subtasks, handle cascade
      if (status === 'DONE' && existing.subTasks.length > 0 && cascadeToSubtasks) {
        await prisma.task.updateMany({
          where: {
            parentId: id,
            status: { not: 'DONE' },
          },
          data: { status: 'DONE' },
        });
      }

      const task = await prisma.task.update({
        where: { id },
        data: { status },
        include: {
          subTasks: true,
        },
      });

      return { success: true, data: task };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update task status',
        },
      };
    }
  },

  /**
   * Reorder a task within its project
   * Requirements: 2.6
   */
  async reorder(
    taskId: string,
    userId: string,
    newIndex: number
  ): Promise<ServiceResult<void>> {
    try {
      // Get the task to reorder
      const task = await prisma.task.findFirst({
        where: { id: taskId, userId },
      });

      if (!task) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Task not found',
          },
        };
      }

      // Get all sibling tasks (same project and parent)
      const siblings = await prisma.task.findMany({
        where: {
          projectId: task.projectId,
          parentId: task.parentId,
          userId,
        },
        orderBy: { sortOrder: 'asc' },
      });

      // Remove the task from its current position
      const currentIndex = siblings.findIndex((t) => t.id === taskId);
      if (currentIndex === -1) {
        return {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Task not found in siblings',
          },
        };
      }

      // Clamp newIndex to valid range
      const clampedIndex = Math.max(0, Math.min(newIndex, siblings.length - 1));

      // Reorder in memory
      const reordered = [...siblings];
      const [removed] = reordered.splice(currentIndex, 1);
      reordered.splice(clampedIndex, 0, removed);

      // Update sortOrder for all affected tasks
      await prisma.$transaction(
        reordered.map((t, index) =>
          prisma.task.update({
            where: { id: t.id },
            data: { sortOrder: index },
          })
        )
      );

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to reorder task',
        },
      };
    }
  },

  /**
   * Get all tasks for a project with hierarchy
   * Requirements: 2.4
   */
  async getByProject(projectId: string, userId: string): Promise<ServiceResult<Task[]>> {
    try {
      // Verify project belongs to user
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId },
      });

      if (!project) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Project not found',
          },
        };
      }

      // Get root tasks with nested subtasks
      const tasks = await prisma.task.findMany({
        where: {
          projectId,
          parentId: null,
        },
        include: {
          subTasks: {
            include: {
              subTasks: {
                include: {
                  subTasks: true, // 3 levels deep
                },
              },
            },
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { sortOrder: 'asc' },
      });

      return { success: true, data: tasks };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get tasks',
        },
      };
    }
  },

  /**
   * Get today's tasks for a user
   */
  async getTodayTasks(userId: string): Promise<ServiceResult<Task[]>> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const tasks = await prisma.task.findMany({
        where: {
          userId,
          planDate: {
            gte: today,
            lt: tomorrow,
          },
          status: { not: 'DONE' },
        },
        include: {
          project: true,
          subTasks: true,
        },
        orderBy: [{ priority: 'asc' }, { sortOrder: 'asc' }],
      });

      return { success: true, data: tasks };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get today tasks',
        },
      };
    }
  },

  /**
   * Get backlog tasks (no plan date or future date)
   */
  async getBacklog(userId: string): Promise<ServiceResult<Task[]>> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tasks = await prisma.task.findMany({
        where: {
          userId,
          status: { not: 'DONE' },
          OR: [{ planDate: null }, { planDate: { gt: today } }],
        },
        include: {
          project: true,
        },
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      });

      return { success: true, data: tasks };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get backlog',
        },
      };
    }
  },

  /**
   * Delete a task
   */
  async delete(id: string, userId: string): Promise<ServiceResult<void>> {
    try {
      const existing = await prisma.task.findFirst({
        where: { id, userId },
      });

      if (!existing) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Task not found',
          },
        };
      }

      // Cascade delete is handled by Prisma schema
      await prisma.task.delete({
        where: { id },
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to delete task',
        },
      };
    }
  },

  /**
   * Get yesterday's incomplete tasks for airlock review
   * Requirements: 3.3
   */
  async getYesterdayIncompleteTasks(userId: string): Promise<ServiceResult<Task[]>> {
    try {
      // Calculate yesterday's date range (accounting for 4 AM reset)
      const now = new Date();
      const today = new Date(now);
      
      // If before 4 AM, "today" is actually yesterday
      if (now.getHours() < 4) {
        today.setDate(today.getDate() - 1);
      }
      today.setHours(0, 0, 0, 0);
      
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const tasks = await prisma.task.findMany({
        where: {
          userId,
          status: { not: 'DONE' },
          planDate: {
            gte: yesterday,
            lt: today,
          },
        },
        include: {
          project: true,
          subTasks: true,
        },
        orderBy: [{ priority: 'asc' }, { sortOrder: 'asc' }],
      });

      return { success: true, data: tasks };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get yesterday tasks',
        },
      };
    }
  },

  /**
   * Defer a task to today (reschedule)
   * Requirements: 3.4
   */
  async deferToToday(id: string, userId: string): Promise<ServiceResult<Task>> {
    try {
      const existing = await prisma.task.findFirst({
        where: { id, userId },
      });

      if (!existing) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Task not found',
          },
        };
      }

      // Calculate today's date (accounting for 4 AM reset)
      const now = new Date();
      const today = new Date(now);
      if (now.getHours() < 4) {
        today.setDate(today.getDate() - 1);
      }
      today.setHours(0, 0, 0, 0);

      const task = await prisma.task.update({
        where: { id },
        data: { planDate: today },
        include: {
          project: true,
          subTasks: true,
        },
      });

      return { success: true, data: task };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to defer task',
        },
      };
    }
  },

  /**
   * Set plan date for a task (for dragging to Today list)
   * Requirements: 3.6
   */
  async setPlanDate(id: string, userId: string, planDate: Date | null): Promise<ServiceResult<Task>> {
    try {
      const existing = await prisma.task.findFirst({
        where: { id, userId },
      });

      if (!existing) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Task not found',
          },
        };
      }

      const task = await prisma.task.update({
        where: { id },
        data: { planDate },
        include: {
          project: true,
          subTasks: true,
        },
      });

      return { success: true, data: task };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to set plan date',
        },
      };
    }
  },

  /**
   * Get all incomplete tasks grouped by project (for backlog in airlock)
   * Requirements: 3.5
   */
  async getBacklogByProject(userId: string): Promise<ServiceResult<Record<string, Task[]>>> {
    try {
      // Calculate today's date (accounting for 4 AM reset)
      const now = new Date();
      const today = new Date(now);
      if (now.getHours() < 4) {
        today.setDate(today.getDate() - 1);
      }
      today.setHours(0, 0, 0, 0);

      const tasks = await prisma.task.findMany({
        where: {
          userId,
          status: { not: 'DONE' },
          OR: [
            { planDate: null },
            { planDate: { gt: today } },
          ],
        },
        include: {
          project: true,
        },
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      });

      // Group by project
      const grouped: Record<string, Task[]> = {};
      for (const task of tasks) {
        const projectId = task.projectId;
        if (!grouped[projectId]) {
          grouped[projectId] = [];
        }
        grouped[projectId].push(task);
      }

      return { success: true, data: grouped };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get backlog by project',
        },
      };
    }
  },

  /**
   * Get actual time spent on a task (sum of completed pomodoro durations)
   * Requirements: 20.4, 20.5
   */
  async getActualTimeSpent(taskId: string, userId: string): Promise<ServiceResult<number>> {
    try {
      const task = await prisma.task.findFirst({
        where: { id: taskId, userId },
      });

      if (!task) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Task not found',
          },
        };
      }

      // Sum up all completed pomodoro durations for this task
      const result = await prisma.pomodoro.aggregate({
        where: {
          taskId,
          status: 'COMPLETED',
        },
        _sum: {
          duration: true,
        },
      });

      return { success: true, data: result._sum.duration ?? 0 };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get actual time spent',
        },
      };
    }
  },

  /**
   * Get task with estimation details (estimated vs actual time)
   * Requirements: 20.4, 20.5
   */
  async getTaskWithEstimation(
    taskId: string,
    userId: string,
    pomodoroDuration: number = 25
  ): Promise<ServiceResult<{
    task: Task;
    estimatedMinutes: number | null;
    estimatedPomodoros: number | null;
    actualMinutes: number;
    actualPomodoros: number;
  }>> {
    try {
      const task = await prisma.task.findFirst({
        where: { id: taskId, userId },
        include: {
          project: true,
          subTasks: true,
        },
      });

      if (!task) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Task not found',
          },
        };
      }

      // Get actual time spent
      const actualResult = await this.getActualTimeSpent(taskId, userId);
      const actualMinutes = actualResult.success ? actualResult.data ?? 0 : 0;

      // Calculate pomodoro counts
      const estimatedPomodoros = calculateEstimatedPomodoros(task.estimatedMinutes, pomodoroDuration);
      const actualPomodoros = Math.floor(actualMinutes / pomodoroDuration);

      return {
        success: true,
        data: {
          task,
          estimatedMinutes: task.estimatedMinutes,
          estimatedPomodoros,
          actualMinutes,
          actualPomodoros,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get task with estimation',
        },
      };
    }
  },
};

export default taskService;
