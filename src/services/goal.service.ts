import { z } from 'zod';
import prisma from '@/lib/prisma';
import type { Goal, GoalType, GoalStatus } from '@prisma/client';

// Validation schemas
export const CreateGoalSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().min(1, 'Description is required').max(2000),
  type: z.enum(['LONG_TERM', 'SHORT_TERM']),
  targetDate: z.coerce.date(),
});

export const UpdateGoalSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().min(1).max(2000).optional(),
  type: z.enum(['LONG_TERM', 'SHORT_TERM']).optional(),
  targetDate: z.coerce.date().optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'ARCHIVED']).optional(),
});

export type CreateGoalInput = z.infer<typeof CreateGoalSchema>;
export type UpdateGoalInput = z.infer<typeof UpdateGoalSchema>;

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

// Goal progress type
export interface GoalProgress {
  goalId: string;
  linkedProjects: number;
  completedProjects: number;
  percentage: number;
}

// Goal with projects type
export type GoalWithProjects = Goal & {
  projects: {
    project: {
      id: string;
      title: string;
      status: string;
    };
  }[];
};

export const goalService = {
  /**
   * Create a new goal
   * Requirements: 11.1, 11.2, 11.3
   */
  async create(userId: string, data: CreateGoalInput): Promise<ServiceResult<Goal>> {
    try {
      const validated = CreateGoalSchema.parse(data);

      // Validate timeframe based on goal type
      const now = new Date();
      const targetDate = new Date(validated.targetDate);
      const monthsDiff = (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30);

      if (validated.type === 'LONG_TERM') {
        // Long-term: 1-5 years (12-60 months)
        if (monthsDiff < 12 || monthsDiff > 60) {
          return {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Long-term goals must have a target date between 1 and 5 years from now',
            },
          };
        }
      } else {
        // Short-term: 1 week to 6 months (0.25-6 months)
        if (monthsDiff < 0.25 || monthsDiff > 6) {
          return {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Short-term goals must have a target date between 1 week and 6 months from now',
            },
          };
        }
      }

      const goal = await prisma.goal.create({
        data: {
          title: validated.title,
          description: validated.description,
          type: validated.type as GoalType,
          targetDate: validated.targetDate,
          userId,
        },
      });

      return { success: true, data: goal };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid goal data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create goal',
        },
      };
    }
  },

  /**
   * Update an existing goal
   * Requirements: 11.8
   */
  async update(id: string, userId: string, data: UpdateGoalInput): Promise<ServiceResult<Goal>> {
    try {
      const validated = UpdateGoalSchema.parse(data);

      // Check goal exists and belongs to user
      const existing = await prisma.goal.findFirst({
        where: { id, userId },
      });

      if (!existing) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Goal not found',
          },
        };
      }

      const goal = await prisma.goal.update({
        where: { id },
        data: {
          title: validated.title,
          description: validated.description,
          type: validated.type as GoalType | undefined,
          targetDate: validated.targetDate,
          status: validated.status as GoalStatus | undefined,
        },
      });

      return { success: true, data: goal };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid goal data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update goal',
        },
      };
    }
  },

  /**
   * Archive a goal
   * Requirements: 11.10
   */
  async archive(id: string, userId: string): Promise<ServiceResult<Goal>> {
    try {
      // Check goal exists and belongs to user
      const existing = await prisma.goal.findFirst({
        where: { id, userId },
      });

      if (!existing) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Goal not found',
          },
        };
      }

      const goal = await prisma.goal.update({
        where: { id },
        data: { status: 'ARCHIVED' },
      });

      return { success: true, data: goal };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to archive goal',
        },
      };
    }
  },

  /**
   * Get all goals for a user
   * Requirements: 11.1
   */
  async getByUser(userId: string): Promise<ServiceResult<GoalWithProjects[]>> {
    try {
      const goals = await prisma.goal.findMany({
        where: { userId },
        include: {
          projects: {
            include: {
              project: {
                select: {
                  id: true,
                  title: true,
                  status: true,
                },
              },
            },
          },
        },
        orderBy: [{ type: 'asc' }, { targetDate: 'asc' }],
      });

      return { success: true, data: goals };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get goals',
        },
      };
    }
  },

  /**
   * Get goal progress based on linked projects
   * Requirements: 11.9
   */
  async getProgress(id: string, userId: string): Promise<ServiceResult<GoalProgress>> {
    try {
      const goal = await prisma.goal.findFirst({
        where: { id, userId },
        include: {
          projects: {
            include: {
              project: {
                select: {
                  status: true,
                },
              },
            },
          },
        },
      });

      if (!goal) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Goal not found',
          },
        };
      }

      const linkedProjects = goal.projects.length;
      const completedProjects = goal.projects.filter(
        (pg) => pg.project.status === 'COMPLETED'
      ).length;
      const percentage = linkedProjects > 0 ? (completedProjects / linkedProjects) * 100 : 0;

      return {
        success: true,
        data: {
          goalId: id,
          linkedProjects,
          completedProjects,
          percentage: Math.round(percentage * 100) / 100,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get goal progress',
        },
      };
    }
  },

  /**
   * Link a project to a goal
   * Requirements: 11.4, 11.5
   */
  async linkProject(
    goalId: string,
    projectId: string,
    userId: string
  ): Promise<ServiceResult<void>> {
    try {
      // Verify goal belongs to user
      const goal = await prisma.goal.findFirst({
        where: { id: goalId, userId },
      });

      if (!goal) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Goal not found',
          },
        };
      }

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

      // Create link (upsert to handle duplicates)
      await prisma.projectGoal.upsert({
        where: {
          projectId_goalId: {
            projectId,
            goalId,
          },
        },
        create: {
          projectId,
          goalId,
        },
        update: {},
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to link project to goal',
        },
      };
    }
  },

  /**
   * Unlink a project from a goal
   */
  async unlinkProject(
    goalId: string,
    projectId: string,
    userId: string
  ): Promise<ServiceResult<void>> {
    try {
      // Verify goal belongs to user
      const goal = await prisma.goal.findFirst({
        where: { id: goalId, userId },
      });

      if (!goal) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Goal not found',
          },
        };
      }

      await prisma.projectGoal.deleteMany({
        where: {
          projectId,
          goalId,
        },
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to unlink project from goal',
        },
      };
    }
  },
};

export default goalService;
