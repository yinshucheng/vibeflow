import { z } from 'zod';
import prisma from '@/lib/prisma';
import type { Blocker } from '@prisma/client';

// Blocker category types (Requirement 5.2)
export type BlockerCategory = 'technical' | 'dependency' | 'unclear_requirements' | 'other';

// Dependency type for external tracking (Requirement 5.4)
export type DependencyType = 'person' | 'system' | 'external';

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

// Blocker with task info
export type BlockerWithTask = Blocker & {
  task: {
    id: string;
    title: string;
    projectId: string;
  };
};

// Potential blocker detection result (Requirement 5.1)
export interface PotentialBlockerResult {
  isBlocked: boolean;
  pomodoroCount: number;
  taskTitle: string;
  lastProgressUpdate: Date | null;
}

// Dependency info for tracking (Requirement 5.4)
export interface DependencyInfo {
  type: DependencyType;
  identifier: string;
  expectedResolution?: Date;
}

// Validation schemas
export const ReportBlockerSchema = z.object({
  taskId: z.string().uuid('Invalid task ID'),
  description: z.string().min(1, 'Description is required').max(2000, 'Description too long'),
});

export const TrackDependencySchema = z.object({
  blockerId: z.string().uuid('Invalid blocker ID'),
  dependencyType: z.enum(['person', 'system', 'external']),
  dependencyIdentifier: z.string().min(1, 'Identifier is required'),
  expectedResolution: z.date().optional(),
});

export const ResolveBlockerSchema = z.object({
  blockerId: z.string().uuid('Invalid blocker ID'),
  resolution: z.string().min(1, 'Resolution is required').max(2000, 'Resolution too long'),
});

export const GetBlockerHistorySchema = z.object({
  taskId: z.string().uuid().optional(),
  category: z.enum(['technical', 'dependency', 'unclear_requirements', 'other']).optional(),
  status: z.enum(['active', 'resolved']).optional(),
  limit: z.number().min(1).max(100).default(50),
});

export type ReportBlockerInput = z.infer<typeof ReportBlockerSchema>;
export type TrackDependencyInput = z.infer<typeof TrackDependencySchema>;
export type ResolveBlockerInput = z.infer<typeof ResolveBlockerSchema>;
export type GetBlockerHistoryInput = z.infer<typeof GetBlockerHistorySchema>;

// Category keywords for automatic classification (Requirement 5.2)
const CATEGORY_KEYWORDS: Record<BlockerCategory, string[]> = {
  technical: [
    'bug', 'error', 'crash', 'performance', 'memory', 'api', 'database',
    'exception', 'timeout', 'connection', 'server', 'client', 'network',
    'compile', 'build', 'deploy', 'config', 'configuration', 'syntax',
    'runtime', 'debug', 'stack', 'trace', 'null', 'undefined', 'type',
  ],
  dependency: [
    'waiting', 'blocked by', 'need from', 'depends on', 'external',
    'third party', 'vendor', 'team', 'colleague', 'approval', 'review',
    'merge', 'pr', 'pull request', 'upstream', 'downstream', 'integration',
    'service', 'api key', 'credentials', 'access', 'permission',
  ],
  unclear_requirements: [
    'unclear', 'ambiguous', 'need clarification', 'spec', 'requirements',
    'specification', 'design', 'scope', 'definition', 'acceptance criteria',
    'user story', 'ticket', 'jira', 'task description', 'what should',
    'how should', 'expected behavior', 'edge case', 'corner case',
  ],
  other: [],
};

// Resolution suggestions by category (Requirement 5.3)
const RESOLUTION_SUGGESTIONS: Record<BlockerCategory, string[]> = {
  technical: [
    'Break down the problem into smaller parts and debug step by step',
    'Search for similar issues in documentation or Stack Overflow',
    'Add logging to identify the exact point of failure',
    'Review recent code changes that might have caused the issue',
    'Try a different approach or algorithm',
    'Consult with a team member who has experience with this area',
    'Create a minimal reproduction case to isolate the issue',
  ],
  dependency: [
    'Send a follow-up message to the person/team you are waiting on',
    'Escalate to your manager if the dependency is blocking critical work',
    'Look for alternative approaches that do not require this dependency',
    'Document the dependency clearly and set up notifications for updates',
    'Work on other tasks while waiting for the dependency to be resolved',
    'Schedule a meeting to discuss and resolve the dependency',
  ],
  unclear_requirements: [
    'Schedule a meeting with the product owner or stakeholder',
    'Write down your assumptions and get them validated',
    'Create a prototype or mockup to clarify the expected behavior',
    'Review similar features in the codebase for reference',
    'Document the ambiguity and propose multiple solutions',
    'Ask specific questions in the ticket or communication channel',
  ],
  other: [
    'Take a short break and return with fresh perspective',
    'Discuss the blocker with a colleague for new ideas',
    'Document what you have tried so far',
    'Consider if the task needs to be re-scoped or broken down',
    'Review the task priority and consider working on something else temporarily',
  ],
};

export const blockerResolverService = {
  /**
   * Detect potential blocker based on pomodoro count without progress
   * Requirement 5.1: When a user spends more than 2 Pomodoros on the same task without progress
   */
  async detectPotentialBlocker(
    userId: string,
    taskId: string
  ): Promise<ServiceResult<PotentialBlockerResult>> {
    try {
      // Verify task exists and belongs to user
      const task = await prisma.task.findFirst({
        where: { id: taskId, userId },
        select: {
          id: true,
          title: true,
          status: true,
          updatedAt: true,
        },
      });

      if (!task) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Task not found or does not belong to user',
          },
        };
      }

      // Count completed pomodoros for this task since last status change
      // We consider "progress" as task status change or task update
      const pomodoroCount = await prisma.pomodoro.count({
        where: {
          taskId,
          userId,
          status: 'COMPLETED',
          createdAt: {
            gte: task.updatedAt,
          },
        },
      });

      // Check if there's an active blocker already
      const existingBlocker = await prisma.blocker.findFirst({
        where: {
          taskId,
          userId,
          status: 'active',
        },
      });

      // Blocked if 2+ pomodoros without progress and no active blocker reported
      const isBlocked = pomodoroCount >= 2 && !existingBlocker;

      return {
        success: true,
        data: {
          isBlocked,
          pomodoroCount,
          taskTitle: task.title,
          lastProgressUpdate: task.updatedAt,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to detect potential blocker',
        },
      };
    }
  },

  /**
   * Categorize blocker based on description keywords
   * Requirement 5.2: Categorize as technical, dependency, unclear requirements, or other
   */
  categorizeBlocker(description: string): BlockerCategory {
    const lowerDesc = description.toLowerCase();

    // Check each category's keywords
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (category === 'other') continue; // Skip 'other' as it's the default

      if (keywords.some(keyword => lowerDesc.includes(keyword))) {
        return category as BlockerCategory;
      }
    }

    return 'other';
  },

  /**
   * Report a blocker for a task
   * Requirement 5.2: Report and categorize blocker
   */
  async reportBlocker(
    userId: string,
    input: ReportBlockerInput
  ): Promise<ServiceResult<BlockerWithTask>> {
    try {
      const validated = ReportBlockerSchema.parse(input);

      // Verify task exists and belongs to user
      const task = await prisma.task.findFirst({
        where: { id: validated.taskId, userId },
        select: { id: true, title: true, projectId: true },
      });

      if (!task) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Task not found or does not belong to user',
          },
        };
      }

      // Check for existing active blocker on this task
      const existingBlocker = await prisma.blocker.findFirst({
        where: {
          taskId: validated.taskId,
          userId,
          status: 'active',
        },
      });

      if (existingBlocker) {
        return {
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'An active blocker already exists for this task',
          },
        };
      }

      // Auto-categorize the blocker
      const category = this.categorizeBlocker(validated.description);

      const blocker = await prisma.blocker.create({
        data: {
          userId,
          taskId: validated.taskId,
          description: validated.description,
          category,
          status: 'active',
        },
        include: {
          task: {
            select: {
              id: true,
              title: true,
              projectId: true,
            },
          },
        },
      });

      return { success: true, data: blocker };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid blocker data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to report blocker',
        },
      };
    }
  },

  /**
   * Get suggested resolutions based on blocker category
   * Requirement 5.3: Suggest resolution strategies based on category and historical patterns
   */
  async getSuggestedResolutions(
    category: BlockerCategory,
    userId: string
  ): Promise<ServiceResult<string[]>> {
    try {
      // Get base suggestions for the category
      const baseSuggestions = [...RESOLUTION_SUGGESTIONS[category]];

      // Get historical resolutions for this user and category
      const historicalBlockers = await prisma.blocker.findMany({
        where: {
          userId,
          category,
          status: 'resolved',
          resolution: { not: null },
        },
        orderBy: { resolvedAt: 'desc' },
        take: 5,
        select: { resolution: true },
      });

      // Add historical resolutions as suggestions if they exist
      const historicalSuggestions = historicalBlockers
        .map(b => b.resolution)
        .filter((r): r is string => r !== null && r.length > 0);

      if (historicalSuggestions.length > 0) {
        baseSuggestions.unshift(
          ...historicalSuggestions.map(r => `Previously worked: ${r}`)
        );
      }

      return { success: true, data: baseSuggestions };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get suggested resolutions',
        },
      };
    }
  },


  /**
   * Track external dependency for a blocker
   * Requirement 5.4: Track dependency and notify when resolved
   */
  async trackDependency(
    userId: string,
    input: TrackDependencyInput
  ): Promise<ServiceResult<BlockerWithTask>> {
    try {
      const validated = TrackDependencySchema.parse(input);

      // Verify blocker exists and belongs to user
      const blocker = await prisma.blocker.findFirst({
        where: { id: validated.blockerId, userId },
      });

      if (!blocker) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Blocker not found or does not belong to user',
          },
        };
      }

      if (blocker.status !== 'active') {
        return {
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'Cannot track dependency for a resolved blocker',
          },
        };
      }

      const updatedBlocker = await prisma.blocker.update({
        where: { id: validated.blockerId },
        data: {
          dependencyType: validated.dependencyType,
          dependencyIdentifier: validated.dependencyIdentifier,
          expectedResolution: validated.expectedResolution,
        },
        include: {
          task: {
            select: {
              id: true,
              title: true,
              projectId: true,
            },
          },
        },
      });

      return { success: true, data: updatedBlocker };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid dependency data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to track dependency',
        },
      };
    }
  },

  /**
   * Resolve a blocker
   * Requirement 5.4: Resolve blocker with resolution description
   */
  async resolveBlocker(
    userId: string,
    input: ResolveBlockerInput
  ): Promise<ServiceResult<BlockerWithTask>> {
    try {
      const validated = ResolveBlockerSchema.parse(input);

      // Verify blocker exists and belongs to user
      const blocker = await prisma.blocker.findFirst({
        where: { id: validated.blockerId, userId },
      });

      if (!blocker) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Blocker not found or does not belong to user',
          },
        };
      }

      if (blocker.status === 'resolved') {
        return {
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'Blocker is already resolved',
          },
        };
      }

      const resolvedBlocker = await prisma.blocker.update({
        where: { id: validated.blockerId },
        data: {
          status: 'resolved',
          resolution: validated.resolution,
          resolvedAt: new Date(),
        },
        include: {
          task: {
            select: {
              id: true,
              title: true,
              projectId: true,
            },
          },
        },
      });

      return { success: true, data: resolvedBlocker };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid resolution data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to resolve blocker',
        },
      };
    }
  },

  /**
   * Get blocker history for pattern analysis
   * Requirement 5.5: Maintain blocker history for pattern analysis and prevention
   */
  async getBlockerHistory(
    userId: string,
    input?: GetBlockerHistoryInput
  ): Promise<ServiceResult<BlockerWithTask[]>> {
    try {
      const validated = input ? GetBlockerHistorySchema.parse(input) : { limit: 50 };

      const where: {
        userId: string;
        taskId?: string;
        category?: BlockerCategory;
        status?: string;
      } = { userId };

      if (validated.taskId) {
        where.taskId = validated.taskId;
      }
      if (validated.category) {
        where.category = validated.category;
      }
      if (validated.status) {
        where.status = validated.status;
      }

      const blockers = await prisma.blocker.findMany({
        where,
        include: {
          task: {
            select: {
              id: true,
              title: true,
              projectId: true,
            },
          },
        },
        orderBy: { reportedAt: 'desc' },
        take: validated.limit,
      });

      return { success: true, data: blockers };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid filter options',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get blocker history',
        },
      };
    }
  },

  /**
   * Get active blockers for a user
   * Used by MCP resource vibe://blockers/active
   */
  async getActiveBlockers(userId: string): Promise<ServiceResult<BlockerWithTask[]>> {
    try {
      const blockers = await prisma.blocker.findMany({
        where: {
          userId,
          status: 'active',
        },
        include: {
          task: {
            select: {
              id: true,
              title: true,
              projectId: true,
            },
          },
        },
        orderBy: { reportedAt: 'desc' },
      });

      return { success: true, data: blockers };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get active blockers',
        },
      };
    }
  },

  /**
   * Get blockers with pending dependencies that may have been resolved
   * Useful for notifying users when expected resolution dates have passed
   */
  async getBlockersWithPendingDependencies(
    userId: string
  ): Promise<ServiceResult<BlockerWithTask[]>> {
    try {
      const now = new Date();

      const blockers = await prisma.blocker.findMany({
        where: {
          userId,
          status: 'active',
          dependencyType: { not: null },
          expectedResolution: {
            lte: now,
          },
        },
        include: {
          task: {
            select: {
              id: true,
              title: true,
              projectId: true,
            },
          },
        },
        orderBy: { expectedResolution: 'asc' },
      });

      return { success: true, data: blockers };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get blockers with pending dependencies',
        },
      };
    }
  },

  /**
   * Get blocker statistics for a user
   * Useful for pattern analysis and prevention
   */
  async getBlockerStats(userId: string): Promise<ServiceResult<{
    totalBlockers: number;
    activeBlockers: number;
    resolvedBlockers: number;
    byCategory: Record<BlockerCategory, number>;
    averageResolutionTimeHours: number | null;
  }>> {
    try {
      const [total, active, resolved, byCategory, resolutionTimes] = await Promise.all([
        prisma.blocker.count({ where: { userId } }),
        prisma.blocker.count({ where: { userId, status: 'active' } }),
        prisma.blocker.count({ where: { userId, status: 'resolved' } }),
        prisma.blocker.groupBy({
          by: ['category'],
          where: { userId },
          _count: { category: true },
        }),
        prisma.blocker.findMany({
          where: {
            userId,
            status: 'resolved',
            resolvedAt: { not: null },
          },
          select: {
            reportedAt: true,
            resolvedAt: true,
          },
        }),
      ]);

      // Calculate category counts
      const categoryCounts: Record<BlockerCategory, number> = {
        technical: 0,
        dependency: 0,
        unclear_requirements: 0,
        other: 0,
      };

      for (const item of byCategory) {
        const cat = item.category as BlockerCategory;
        if (cat in categoryCounts) {
          categoryCounts[cat] = item._count.category;
        }
      }

      // Calculate average resolution time
      let averageResolutionTimeHours: number | null = null;
      if (resolutionTimes.length > 0) {
        const totalHours = resolutionTimes.reduce((sum, b) => {
          if (b.resolvedAt) {
            const hours = (b.resolvedAt.getTime() - b.reportedAt.getTime()) / (1000 * 60 * 60);
            return sum + hours;
          }
          return sum;
        }, 0);
        averageResolutionTimeHours = Math.round((totalHours / resolutionTimes.length) * 10) / 10;
      }

      return {
        success: true,
        data: {
          totalBlockers: total,
          activeBlockers: active,
          resolvedBlockers: resolved,
          byCategory: categoryCounts,
          averageResolutionTimeHours,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get blocker stats',
        },
      };
    }
  },
};

export default blockerResolverService;
