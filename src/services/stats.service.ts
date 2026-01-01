/**
 * Stats Service
 * 
 * Provides multi-dimensional pomodoro statistics with time range filtering.
 * Requirements: 3.1, 3.2, 3.3, 3.6
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';
import type { Pomodoro, PomodoroStatus } from '@prisma/client';

// Validation schemas
export const GetStatsSchema = z.object({
  timeRange: z.enum(['today', 'week', 'month', 'custom']),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  projectId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
});

export type GetStatsInput = z.infer<typeof GetStatsSchema>;

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

// Stats data types
export interface ProjectStats {
  projectId: string;
  projectTitle: string;
  totalMinutes: number;
  percentage: number;
  pomodoroCount: number;
}

export interface TaskStats {
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectTitle: string;
  totalMinutes: number;
  completedCount: number;
  interruptedCount: number;
  abortedCount: number;
}

export interface DayStats {
  date: string;
  totalMinutes: number;
  pomodoroCount: number;
  completedCount: number;
  interruptedCount: number;
  abortedCount: number;
}

export interface PomodoroStats {
  totalMinutes: number;
  completedCount: number;
  interruptedCount: number;
  abortedCount: number;
  averageDuration: number;
  byProject: ProjectStats[];
  byTask: TaskStats[];
  byDay: DayStats[];
}

// Helper function to calculate date range based on time range type
export function calculateDateRange(
  timeRange: 'today' | 'week' | 'month' | 'custom',
  startDate?: Date,
  endDate?: Date
): { start: Date; end: Date } {
  const now = new Date();
  
  switch (timeRange) {
    case 'today': {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case 'week': {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case 'custom': {
      if (!startDate || !endDate) {
        // Default to today if custom dates not provided
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        const end = new Date(now);
        end.setHours(23, 59, 59, 999);
        return { start, end };
      }
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
  }
}

// Helper function to calculate actual duration of a pomodoro
function calculateActualDuration(pomodoro: Pomodoro): number {
  if (pomodoro.status === 'IN_PROGRESS') {
    // For in-progress pomodoros, calculate elapsed time
    const elapsed = (Date.now() - pomodoro.startTime.getTime()) / 1000 / 60;
    return Math.min(elapsed, pomodoro.duration);
  }
  
  if (pomodoro.endTime) {
    // Use actual duration from start to end
    const actual = (pomodoro.endTime.getTime() - pomodoro.startTime.getTime()) / 1000 / 60;
    return Math.min(actual, pomodoro.duration);
  }
  
  // Fallback to planned duration
  return pomodoro.duration;
}

// Helper function to format date as YYYY-MM-DD
function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

export const statsService = {
  /**
   * Get pomodoro statistics with multi-dimensional grouping
   * Requirements: 3.1, 3.2, 3.3, 3.6
   */
  async getStats(userId: string, input: GetStatsInput): Promise<ServiceResult<PomodoroStats>> {
    try {
      const validated = GetStatsSchema.parse(input);
      const { start, end } = calculateDateRange(
        validated.timeRange,
        validated.startDate,
        validated.endDate
      );

      // Build where clause for filtering
      const whereClause: {
        userId: string;
        startTime: { gte: Date; lte: Date };
        status: { not: PomodoroStatus };
        task?: { projectId?: string; id?: string };
      } = {
        userId,
        startTime: {
          gte: start,
          lte: end,
        },
        status: {
          not: 'IN_PROGRESS',
        },
      };

      // Add project/task filters if specified
      if (validated.projectId || validated.taskId) {
        whereClause.task = {};
        if (validated.projectId) {
          whereClause.task.projectId = validated.projectId;
        }
        if (validated.taskId) {
          whereClause.task.id = validated.taskId;
        }
      }

      // Fetch all pomodoros in the time range
      const pomodoros = await prisma.pomodoro.findMany({
        where: whereClause,
        include: {
          task: {
            select: {
              id: true,
              title: true,
              projectId: true,
              project: {
                select: {
                  id: true,
                  title: true,
                },
              },
            },
          },
        },
        orderBy: {
          startTime: 'asc',
        },
      });

      // Calculate overall stats
      let totalMinutes = 0;
      let completedCount = 0;
      let interruptedCount = 0;
      let abortedCount = 0;

      // Maps for grouping
      const projectMap = new Map<string, {
        projectId: string;
        projectTitle: string;
        totalMinutes: number;
        pomodoroCount: number;
      }>();

      const taskMap = new Map<string, {
        taskId: string;
        taskTitle: string;
        projectId: string;
        projectTitle: string;
        totalMinutes: number;
        completedCount: number;
        interruptedCount: number;
        abortedCount: number;
      }>();

      const dayMap = new Map<string, {
        date: string;
        totalMinutes: number;
        pomodoroCount: number;
        completedCount: number;
        interruptedCount: number;
        abortedCount: number;
      }>();

      // Process each pomodoro
      for (const pomodoro of pomodoros) {
        const duration = calculateActualDuration(pomodoro);
        totalMinutes += duration;

        // Count by status
        switch (pomodoro.status) {
          case 'COMPLETED':
            completedCount++;
            break;
          case 'INTERRUPTED':
            interruptedCount++;
            break;
          case 'ABORTED':
            abortedCount++;
            break;
        }

        // Group by project (Requirement 3.1)
        const projectId = pomodoro.task.projectId;
        const projectTitle = pomodoro.task.project.title;
        const existingProject = projectMap.get(projectId);
        if (existingProject) {
          existingProject.totalMinutes += duration;
          existingProject.pomodoroCount++;
        } else {
          projectMap.set(projectId, {
            projectId,
            projectTitle,
            totalMinutes: duration,
            pomodoroCount: 1,
          });
        }

        // Group by task (Requirement 3.2)
        const taskId = pomodoro.task.id;
        const taskTitle = pomodoro.task.title;
        const existingTask = taskMap.get(taskId);
        if (existingTask) {
          existingTask.totalMinutes += duration;
          if (pomodoro.status === 'COMPLETED') existingTask.completedCount++;
          if (pomodoro.status === 'INTERRUPTED') existingTask.interruptedCount++;
          if (pomodoro.status === 'ABORTED') existingTask.abortedCount++;
        } else {
          taskMap.set(taskId, {
            taskId,
            taskTitle,
            projectId,
            projectTitle,
            totalMinutes: duration,
            completedCount: pomodoro.status === 'COMPLETED' ? 1 : 0,
            interruptedCount: pomodoro.status === 'INTERRUPTED' ? 1 : 0,
            abortedCount: pomodoro.status === 'ABORTED' ? 1 : 0,
          });
        }

        // Group by day (Requirement 3.3)
        const dateKey = formatDateKey(pomodoro.startTime);
        const existingDay = dayMap.get(dateKey);
        if (existingDay) {
          existingDay.totalMinutes += duration;
          existingDay.pomodoroCount++;
          if (pomodoro.status === 'COMPLETED') existingDay.completedCount++;
          if (pomodoro.status === 'INTERRUPTED') existingDay.interruptedCount++;
          if (pomodoro.status === 'ABORTED') existingDay.abortedCount++;
        } else {
          dayMap.set(dateKey, {
            date: dateKey,
            totalMinutes: duration,
            pomodoroCount: 1,
            completedCount: pomodoro.status === 'COMPLETED' ? 1 : 0,
            interruptedCount: pomodoro.status === 'INTERRUPTED' ? 1 : 0,
            abortedCount: pomodoro.status === 'ABORTED' ? 1 : 0,
          });
        }
      }

      // Calculate percentages for projects
      const byProject: ProjectStats[] = Array.from(projectMap.values()).map(p => ({
        ...p,
        percentage: totalMinutes > 0 ? (p.totalMinutes / totalMinutes) * 100 : 0,
      }));

      // Sort by total minutes descending
      byProject.sort((a, b) => b.totalMinutes - a.totalMinutes);

      // Convert task map to array and sort
      const byTask: TaskStats[] = Array.from(taskMap.values());
      byTask.sort((a, b) => b.totalMinutes - a.totalMinutes);

      // Convert day map to array and sort by date
      const byDay: DayStats[] = Array.from(dayMap.values());
      byDay.sort((a, b) => a.date.localeCompare(b.date));

      // Calculate average duration
      const totalCount = completedCount + interruptedCount + abortedCount;
      const averageDuration = totalCount > 0 ? totalMinutes / totalCount : 0;

      const stats: PomodoroStats = {
        totalMinutes,
        completedCount,
        interruptedCount,
        abortedCount,
        averageDuration,
        byProject,
        byTask,
        byDay,
      };

      return { success: true, data: stats };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid stats query parameters',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get stats',
        },
      };
    }
  },

  /**
   * Get stats grouped by project only
   * Requirements: 3.1
   */
  async getStatsByProject(
    userId: string,
    timeRange: 'today' | 'week' | 'month' | 'custom',
    startDate?: Date,
    endDate?: Date
  ): Promise<ServiceResult<ProjectStats[]>> {
    const result = await this.getStats(userId, { timeRange, startDate, endDate });
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return { success: true, data: result.data?.byProject ?? [] };
  },

  /**
   * Get stats grouped by task only
   * Requirements: 3.2
   */
  async getStatsByTask(
    userId: string,
    timeRange: 'today' | 'week' | 'month' | 'custom',
    startDate?: Date,
    endDate?: Date,
    projectId?: string
  ): Promise<ServiceResult<TaskStats[]>> {
    const result = await this.getStats(userId, { timeRange, startDate, endDate, projectId });
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return { success: true, data: result.data?.byTask ?? [] };
  },

  /**
   * Get stats grouped by day only
   * Requirements: 3.3
   */
  async getStatsByDay(
    userId: string,
    timeRange: 'today' | 'week' | 'month' | 'custom',
    startDate?: Date,
    endDate?: Date
  ): Promise<ServiceResult<DayStats[]>> {
    const result = await this.getStats(userId, { timeRange, startDate, endDate });
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return { success: true, data: result.data?.byDay ?? [] };
  },
};

export default statsService;
