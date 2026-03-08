import { z } from 'zod';
import prisma from '@/lib/prisma';
import type { Project, ProjectStatus } from '@prisma/client';
import { calculateEstimatedPomodoros } from './task.service';

// Validation schemas
export const CreateProjectSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  deliverable: z.string().min(1, 'Deliverable is required').max(1000),
  goalIds: z.array(z.string().uuid()).optional(),
});

export const UpdateProjectSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  deliverable: z.string().min(1).max(1000).optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'ARCHIVED']).optional(),
  goalIds: z.array(z.string().uuid()).optional(),
});

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

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

// Project with goals type
export type ProjectWithGoals = Project & {
  goals: { goalId: string }[];
};

// Project estimation interface (Requirements: 21.1, 21.2, 21.3, 21.4, 21.5)
export interface ProjectEstimation {
  projectId: string;
  totalEstimatedMinutes: number;
  totalEstimatedPomodoros: number;
  completedMinutes: number;
  completedPomodoros: number;
  remainingMinutes: number;
  remainingPomodoros: number;
  taskCount: number;
  tasksWithEstimates: number;
  completionPercentage: number;
}

export const projectService = {
  /**
   * Create a new project
   * Requirements: 1.1, 1.2
   */
  async create(userId: string, data: CreateProjectInput): Promise<ServiceResult<Project>> {
    try {
      const validated = CreateProjectSchema.parse(data);

      const project = await prisma.project.create({
        data: {
          title: validated.title,
          deliverable: validated.deliverable,
          userId,
          goals: validated.goalIds?.length
            ? {
                create: validated.goalIds.map((goalId) => ({ goalId })),
              }
            : undefined,
        },
        include: {
          goals: true,
        },
      });

      return { success: true, data: project };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid project data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create project',
        },
      };
    }
  },

  /**
   * Update an existing project
   * Requirements: 1.4
   */
  async update(
    id: string,
    userId: string,
    data: UpdateProjectInput
  ): Promise<ServiceResult<Project>> {
    try {
      const validated = UpdateProjectSchema.parse(data);

      // Check project exists and belongs to user
      const existing = await prisma.project.findFirst({
        where: { id, userId },
      });

      if (!existing) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Project not found',
          },
        };
      }

      // Handle goal updates if provided
      if (validated.goalIds !== undefined) {
        // Verify all goalIds belong to the user
        if (validated.goalIds.length > 0) {
          const ownedGoals = await prisma.goal.findMany({
            where: { id: { in: validated.goalIds }, userId },
            select: { id: true },
          });
          if (ownedGoals.length !== validated.goalIds.length) {
            return {
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'One or more goals not found or do not belong to user',
              },
            };
          }
        }

        // Delete existing goal associations
        await prisma.projectGoal.deleteMany({
          where: { projectId: id },
        });

        // Create new associations
        if (validated.goalIds.length > 0) {
          await prisma.projectGoal.createMany({
            data: validated.goalIds.map((goalId) => ({
              projectId: id,
              goalId,
            })),
          });
        }
      }

      const project = await prisma.project.update({
        where: { id },
        data: {
          title: validated.title,
          deliverable: validated.deliverable,
          status: validated.status as ProjectStatus | undefined,
        },
        include: {
          goals: true,
        },
      });

      return { success: true, data: project };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid project data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update project',
        },
      };
    }
  },

  /**
   * Archive a project and all its tasks
   * Requirements: 1.5
   */
  async archive(id: string, userId: string): Promise<ServiceResult<Project>> {
    try {
      // Check project exists and belongs to user
      const existing = await prisma.project.findFirst({
        where: { id, userId },
      });

      if (!existing) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Project not found',
          },
        };
      }

      // Archive project and update all tasks to archived state (DONE)
      const [project] = await prisma.$transaction([
        prisma.project.update({
          where: { id },
          data: { status: 'ARCHIVED' },
        }),
        prisma.task.updateMany({
          where: { projectId: id },
          data: { status: 'DONE' },
        }),
      ]);

      return { success: true, data: project };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to archive project',
        },
      };
    }
  },

  /**
   * Get all projects for a user, grouped by status
   * Requirements: 1.3
   */
  async getByUser(userId: string): Promise<ServiceResult<Project[]>> {
    try {
      const projects = await prisma.project.findMany({
        where: { userId },
        include: {
          goals: {
            include: {
              goal: true,
            },
          },
          _count: {
            select: { tasks: true },
          },
        },
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      });

      return { success: true, data: projects };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get projects',
        },
      };
    }
  },

  /**
   * Get a single project by ID
   */
  async getById(id: string, userId: string): Promise<ServiceResult<Project | null>> {
    try {
      const project = await prisma.project.findFirst({
        where: { id, userId },
        include: {
          goals: {
            include: {
              goal: true,
            },
          },
          tasks: {
            where: { parentId: null },
            include: {
              subTasks: true,
            },
            orderBy: { sortOrder: 'asc' },
          },
        },
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

      return { success: true, data: project };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get project',
        },
      };
    }
  },

  /**
   * Get project estimation aggregation
   * Requirements: 21.1, 21.2, 21.3, 21.4, 21.5
   * 
   * Property 8: Task Estimation Aggregation
   * - Sum of estimatedMinutes from all tasks equals project's total estimated time
   */
  async getProjectEstimation(
    projectId: string,
    userId: string,
    pomodoroDuration: number = 25
  ): Promise<ServiceResult<ProjectEstimation>> {
    try {
      // Verify project exists and belongs to user
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

      // Get all tasks for the project with their pomodoros
      const tasks = await prisma.task.findMany({
        where: { projectId },
        include: {
          pomodoros: {
            where: { status: 'COMPLETED' },
            select: { duration: true },
          },
        },
      });

      // Calculate aggregations
      let totalEstimatedMinutes = 0;
      let completedMinutes = 0;
      let tasksWithEstimates = 0;

      for (const task of tasks) {
        // Sum estimated minutes (Requirements: 21.1)
        if (task.estimatedMinutes != null) {
          totalEstimatedMinutes += task.estimatedMinutes;
          tasksWithEstimates++;
        }

        // Sum completed pomodoro durations (Requirements: 21.3)
        for (const pomodoro of task.pomodoros) {
          completedMinutes += pomodoro.duration;
        }
      }

      // Calculate pomodoro counts (Requirements: 21.2)
      const totalEstimatedPomodoros = calculateEstimatedPomodoros(totalEstimatedMinutes, pomodoroDuration) ?? 0;
      const completedPomodoros = Math.floor(completedMinutes / pomodoroDuration);

      // Calculate remaining (Requirements: 21.3)
      const remainingMinutes = Math.max(0, totalEstimatedMinutes - completedMinutes);
      const remainingPomodoros = Math.max(0, totalEstimatedPomodoros - completedPomodoros);

      // Calculate completion percentage
      const completionPercentage = totalEstimatedMinutes > 0
        ? Math.min(100, Math.round((completedMinutes / totalEstimatedMinutes) * 100))
        : 0;

      return {
        success: true,
        data: {
          projectId,
          totalEstimatedMinutes,
          totalEstimatedPomodoros,
          completedMinutes,
          completedPomodoros,
          remainingMinutes,
          remainingPomodoros,
          taskCount: tasks.length,
          tasksWithEstimates,
          completionPercentage,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get project estimation',
        },
      };
    }
  },

  /**
   * Get all projects with estimation data for a user
   * Requirements: 21.4
   */
  async getProjectsWithEstimation(
    userId: string,
    pomodoroDuration: number = 25
  ): Promise<ServiceResult<Array<Project & { estimation: ProjectEstimation }>>> {
    try {
      const projects = await prisma.project.findMany({
        where: { userId },
        include: {
          goals: {
            include: {
              goal: true,
            },
          },
          tasks: {
            include: {
              pomodoros: {
                where: { status: 'COMPLETED' },
                select: { duration: true },
              },
            },
          },
        },
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      });

      const projectsWithEstimation = projects.map((project) => {
        let totalEstimatedMinutes = 0;
        let completedMinutes = 0;
        let tasksWithEstimates = 0;

        for (const task of project.tasks) {
          if (task.estimatedMinutes != null) {
            totalEstimatedMinutes += task.estimatedMinutes;
            tasksWithEstimates++;
          }

          for (const pomodoro of task.pomodoros) {
            completedMinutes += pomodoro.duration;
          }
        }

        const totalEstimatedPomodoros = calculateEstimatedPomodoros(totalEstimatedMinutes, pomodoroDuration) ?? 0;
        const completedPomodoros = Math.floor(completedMinutes / pomodoroDuration);
        const remainingMinutes = Math.max(0, totalEstimatedMinutes - completedMinutes);
        const remainingPomodoros = Math.max(0, totalEstimatedPomodoros - completedPomodoros);
        const completionPercentage = totalEstimatedMinutes > 0
          ? Math.min(100, Math.round((completedMinutes / totalEstimatedMinutes) * 100))
          : 0;

        // Remove tasks from the returned project to avoid circular data
        const { tasks, ...projectWithoutTasks } = project;

        return {
          ...projectWithoutTasks,
          estimation: {
            projectId: project.id,
            totalEstimatedMinutes,
            totalEstimatedPomodoros,
            completedMinutes,
            completedPomodoros,
            remainingMinutes,
            remainingPomodoros,
            taskCount: tasks.length,
            tasksWithEstimates,
            completionPercentage,
          },
        };
      });

      return { success: true, data: projectsWithEstimation };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get projects with estimation',
        },
      };
    }
  },
};

export default projectService;
