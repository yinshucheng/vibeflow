import { z } from 'zod';
import prisma from '@/lib/prisma';
import type { Pomodoro, PomodoroStatus } from '@prisma/client';
import { mcpEventService } from './mcp-event.service';
import { dailyStateService } from './daily-state.service';
import { overRestService } from './over-rest.service';

// Timer configuration constraints (Requirements: 14.5)
const MIN_POMODORO_DURATION = 10; // minutes
const MIN_REST_DURATION = 2; // minutes
const MAX_POMODORO_DURATION = 120; // minutes
const DEFAULT_POMODORO_DURATION = 25; // minutes

// Validation schemas
export const StartPomodoroSchema = z.object({
  taskId: z.string().uuid('Invalid task ID').nullable().optional(),
  duration: z
    .number()
    .min(MIN_POMODORO_DURATION, `Duration must be at least ${MIN_POMODORO_DURATION} minutes`)
    .max(MAX_POMODORO_DURATION, `Duration must be at most ${MAX_POMODORO_DURATION} minutes`)
    .optional(),
  label: z.string().max(100).optional(),
});

export const CompletePomodoroSchema = z.object({
  summary: z.string().max(1000).optional(),
});

export type StartPomodoroInput = z.infer<typeof StartPomodoroSchema>;
export type CompletePomodoroInput = z.infer<typeof CompletePomodoroSchema>;

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

// Pomodoro with task type (task is nullable for taskless pomodoros)
export type PomodoroWithTask = Pomodoro & {
  task: {
    id: string;
    title: string;
    projectId: string;
  } | null;
};

// Time slice summary for pomodoro completion
export interface TimeSliceSummary {
  totalSeconds: number;
  taskBreakdown: Array<{
    taskId: string | null;
    taskName: string | null;
    seconds: number;
    percentage: number;
  }>;
  switchCount: number;
}

export const pomodoroService = {
  /**
   * Start a new pomodoro session
   * Requirements: 4.1, 4.2, 14.4
   */
  async start(userId: string, data: StartPomodoroInput): Promise<ServiceResult<Pomodoro>> {
    try {
      const validated = StartPomodoroSchema.parse(data);

      // Verify task exists and belongs to user (only if taskId provided)
      if (validated.taskId) {
        const task = await prisma.task.findFirst({
          where: { id: validated.taskId, userId },
        });

        if (!task) {
          return {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Task not found or does not belong to user',
            },
          };
        }
      }

      // Check for existing in-progress pomodoro
      const existingPomodoro = await prisma.pomodoro.findFirst({
        where: {
          userId,
          status: 'IN_PROGRESS',
        },
      });

      if (existingPomodoro) {
        return {
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'A pomodoro is already in progress',
          },
        };
      }

      // Get user settings for default duration
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
      });

      const duration = validated.duration ?? settings?.pomodoroDuration ?? DEFAULT_POMODORO_DURATION;

      // Validate duration against minimum
      if (duration < MIN_POMODORO_DURATION) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Duration must be at least ${MIN_POMODORO_DURATION} minutes`,
          },
        };
      }

      const pomodoro = await prisma.pomodoro.create({
        data: {
          taskId: validated.taskId,
          userId,
          duration,
          status: 'IN_PROGRESS',
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

      // Publish pomodoro.started event (Requirement 10.2)
      await mcpEventService.publish({
        type: 'pomodoro.started',
        userId,
        payload: {
          pomodoroId: pomodoro.id,
          taskId: pomodoro.taskId,
          taskTitle: pomodoro.task?.title ?? 'Taskless',
          duration: pomodoro.duration,
          startTime: pomodoro.startTime.toISOString(),
        },
      });

      return { success: true, data: pomodoro };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid pomodoro data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to start pomodoro',
        },
      };
    }
  },

  /**
   * Complete a pomodoro session
   * Requirements: 4.6
   */
  async complete(
    id: string,
    userId: string,
    data?: CompletePomodoroInput
  ): Promise<ServiceResult<Pomodoro>> {
    try {
      const validated = data ? CompletePomodoroSchema.parse(data) : {};

      // Check pomodoro exists and belongs to user
      const existing = await prisma.pomodoro.findFirst({
        where: { id, userId },
      });

      if (!existing) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Pomodoro not found',
          },
        };
      }

      if (existing.status !== 'IN_PROGRESS') {
        return {
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'Pomodoro is not in progress',
          },
        };
      }

      // Calculate the correct endTime based on startTime + duration
      // This ensures consistent timing regardless of when completion is triggered
      const expectedEndTime = new Date(existing.startTime.getTime() + existing.duration * 60 * 1000);
      const actualEndTime = new Date();
      
      // Use the expected end time if the pomodoro ran its full duration,
      // or actual time if it was completed early (manual completion)
      // But never use a time that's earlier than the start time
      let endTime: Date;
      if (actualEndTime >= expectedEndTime) {
        // Pomodoro ran its full duration - use expected end time for consistency
        endTime = expectedEndTime;
      } else if (actualEndTime > existing.startTime) {
        // Manual completion before full duration - use actual time
        endTime = actualEndTime;
      } else {
        // Edge case: actual time is somehow before start time (clock issues)
        // Use expected end time to maintain data integrity
        console.warn(`Clock inconsistency detected for pomodoro ${id}: actualTime < startTime`);
        endTime = expectedEndTime;
      }

      const pomodoro = await prisma.pomodoro.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          endTime: endTime,
          summary: validated.summary,
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

      // Publish pomodoro.completed event (Requirement 10.2)
      await mcpEventService.publish({
        type: 'pomodoro.completed',
        userId,
        payload: {
          pomodoroId: pomodoro.id,
          taskId: pomodoro.taskId,
          taskTitle: pomodoro.task?.title ?? 'Taskless',
          duration: pomodoro.duration,
          startTime: pomodoro.startTime.toISOString(),
          endTime: pomodoro.endTime?.toISOString() ?? null,
          summary: pomodoro.summary,
        },
      });

      return { success: true, data: pomodoro };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid completion data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to complete pomodoro',
        },
      };
    }
  },

  /**
   * Abort a pomodoro session
   * Requirements: 4.8
   */
  async abort(id: string, userId: string): Promise<ServiceResult<Pomodoro>> {
    try {
      // Check pomodoro exists and belongs to user
      const existing = await prisma.pomodoro.findFirst({
        where: { id, userId },
      });

      if (!existing) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Pomodoro not found',
          },
        };
      }

      if (existing.status !== 'IN_PROGRESS') {
        return {
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'Pomodoro is not in progress',
          },
        };
      }

      const pomodoro = await prisma.pomodoro.update({
        where: { id },
        data: {
          status: 'ABORTED',
          endTime: new Date(),
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

      // Publish pomodoro.aborted event (Requirement 10.2)
      await mcpEventService.publish({
        type: 'pomodoro.aborted',
        userId,
        payload: {
          pomodoroId: pomodoro.id,
          taskId: pomodoro.taskId,
          taskTitle: pomodoro.task?.title ?? 'Taskless',
          duration: pomodoro.duration,
          startTime: pomodoro.startTime.toISOString(),
          endTime: pomodoro.endTime?.toISOString() ?? null,
        },
      });

      return { success: true, data: pomodoro };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to abort pomodoro',
        },
      };
    }
  },

  /**
   * Interrupt a pomodoro session with a reason
   * Requirements: 4.9
   */
  async interrupt(id: string, userId: string, reason: string): Promise<ServiceResult<Pomodoro>> {
    try {
      // Check pomodoro exists and belongs to user
      const existing = await prisma.pomodoro.findFirst({
        where: { id, userId },
      });

      if (!existing) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Pomodoro not found',
          },
        };
      }

      if (existing.status !== 'IN_PROGRESS') {
        return {
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'Pomodoro is not in progress',
          },
        };
      }

      const pomodoro = await prisma.pomodoro.update({
        where: { id },
        data: {
          status: 'INTERRUPTED',
          endTime: new Date(),
          summary: `Interrupted: ${reason}`,
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

      // Note: pomodoro.paused event is not published here as INTERRUPTED is a terminal state
      // The design mentions pomodoro.paused but the current implementation uses INTERRUPTED
      // which is more like an abort with a reason

      return { success: true, data: pomodoro };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to interrupt pomodoro',
        },
      };
    }
  },

  /**
   * Get today's completed pomodoro count
   * Requirements: 12.1, 12.2
   */
  async getTodayCount(userId: string): Promise<ServiceResult<number>> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const count = await prisma.pomodoro.count({
        where: {
          userId,
          status: 'COMPLETED',
          createdAt: {
            gte: today,
            lt: tomorrow,
          },
        },
      });

      return { success: true, data: count };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get today count',
        },
      };
    }
  },

  /**
   * Get pomodoros for a specific task
   */
  async getByTask(taskId: string, userId: string): Promise<ServiceResult<Pomodoro[]>> {
    try {
      // Verify task belongs to user
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

      const pomodoros = await prisma.pomodoro.findMany({
        where: { taskId },
        orderBy: { createdAt: 'desc' },
      });

      return { success: true, data: pomodoros };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get pomodoros',
        },
      };
    }
  },

  /**
   * Check for and complete any expired pomodoros
   * This should be called when getting current pomodoro to ensure data consistency
   */
  async completeExpiredPomodoros(userId: string): Promise<ServiceResult<number>> {
    try {
      // Find all in-progress pomodoros that have exceeded their duration
      const expiredPomodoros = await prisma.pomodoro.findMany({
        where: {
          userId,
          status: 'IN_PROGRESS',
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

      let completedCount = 0;

      for (const pomodoro of expiredPomodoros) {
        const expectedEndTime = new Date(pomodoro.startTime.getTime() + pomodoro.duration * 60 * 1000);
        const now = new Date();

        if (now >= expectedEndTime) {
          // This pomodoro has expired - complete it automatically with expected end time
          try {
            await prisma.pomodoro.update({
              where: { id: pomodoro.id },
              data: {
                status: 'COMPLETED',
                endTime: expectedEndTime, // Use expected end time for consistency
                summary: 'Auto-completed (expired)',
              },
            });

            // Publish pomodoro.completed event
            await mcpEventService.publish({
              type: 'pomodoro.completed',
              userId,
              payload: {
                pomodoroId: pomodoro.id,
                taskId: pomodoro.taskId,
                taskTitle: pomodoro.task?.title ?? 'Taskless',
                duration: pomodoro.duration,
                startTime: pomodoro.startTime.toISOString(),
                endTime: expectedEndTime.toISOString(),
                summary: 'Auto-completed (expired)',
              },
            });

            // Update system state to REST (fixes tray showing PLANNING after auto-complete)
            // Check if already in over-rest state
            const overRestResult = await overRestService.checkOverRestStatus(userId);
            const isOverRest = overRestResult.success && overRestResult.data?.isOverRest;

            if (isOverRest) {
              await dailyStateService.updateSystemState(userId, 'over_rest');
            } else {
              await dailyStateService.updateSystemState(userId, 'rest');
            }
            await dailyStateService.incrementPomodoroCount(userId);

            completedCount++;
          } catch (error) {
            console.error(`Failed to auto-complete expired pomodoro ${pomodoro.id}:`, error);
          }
        }
      }

      return { success: true, data: completedCount };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to complete expired pomodoros',
        },
      };
    }
  },

  /**
   * Get current in-progress pomodoro
   */
  async getCurrent(userId: string): Promise<ServiceResult<PomodoroWithTask | null>> {
    try {
      // First, complete any expired pomodoros
      await this.completeExpiredPomodoros(userId);

      const pomodoro = await prisma.pomodoro.findFirst({
        where: {
          userId,
          status: 'IN_PROGRESS',
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

      return { success: true, data: pomodoro };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get current pomodoro',
        },
      };
    }
  },

  /**
   * Check if daily cap is reached
   * Requirements: 12.1, 12.2
   */
  async isDailyCapped(userId: string): Promise<ServiceResult<boolean>> {
    try {
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
      });

      const dailyCap = settings?.dailyCap ?? 8;

      const countResult = await this.getTodayCount(userId);
      if (!countResult.success) {
        return {
          success: false,
          error: countResult.error,
        };
      }

      return { success: true, data: (countResult.data ?? 0) >= dailyCap };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to check daily cap',
        },
      };
    }
  },

  /**
   * Get timer configuration constants
   */
  getTimerConfig() {
    return {
      minPomodoroDuration: MIN_POMODORO_DURATION,
      minRestDuration: MIN_REST_DURATION,
      maxPomodoroDuration: MAX_POMODORO_DURATION,
      defaultPomodoroDuration: DEFAULT_POMODORO_DURATION,
    };
  },

  /**
   * Start a taskless pomodoro (no task association)
   * Requirements: Req 3 - Taskless Pomodoro
   */
  async startTaskless(userId: string, label?: string): Promise<ServiceResult<Pomodoro>> {
    return this.start(userId, { taskId: null, label });
  },

  /**
   * Get time slice summary for a pomodoro
   * Requirements: Req 4 - Time Attribution
   */
  async getSummary(pomodoroId: string, userId: string): Promise<ServiceResult<TimeSliceSummary>> {
    try {
      const pomodoro = await prisma.pomodoro.findFirst({
        where: { id: pomodoroId, userId },
        include: {
          timeSlices: {
            include: { task: { select: { id: true, title: true } } },
            orderBy: { startTime: 'asc' },
          },
        },
      });

      if (!pomodoro) {
        return { success: false, error: { code: 'NOT_FOUND', message: 'Pomodoro not found' } };
      }

      const taskBreakdown: Record<string, { taskId: string | null; taskName: string | null; seconds: number }> = {};
      let totalSeconds = 0;

      for (const slice of pomodoro.timeSlices) {
        const key = slice.taskId ?? 'taskless';
        if (!taskBreakdown[key]) {
          taskBreakdown[key] = { taskId: slice.taskId, taskName: slice.task?.title ?? null, seconds: 0 };
        }
        taskBreakdown[key].seconds += slice.durationSeconds;
        totalSeconds += slice.durationSeconds;
      }

      const summary: TimeSliceSummary = {
        totalSeconds,
        taskBreakdown: Object.values(taskBreakdown).map((t) => ({
          ...t,
          percentage: totalSeconds > 0 ? Math.round((t.seconds / totalSeconds) * 100) : 0,
        })),
        switchCount: pomodoro.taskSwitchCount,
      };

      return { success: true, data: summary };
    } catch (error) {
      return {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to get summary' },
      };
    }
  },

  /**
   * Complete the current task during an active pomodoro and optionally switch to another task
   * Requirements: Req 2 - Complete Task in Pomodoro
   */
  async completeTaskInPomodoro(
    pomodoroId: string,
    userId: string,
    nextTaskId?: string | null
  ): Promise<ServiceResult<{ completedTaskId: string | null; nextTaskId: string | null }>> {
    try {
      const pomodoro = await prisma.pomodoro.findFirst({
        where: { id: pomodoroId, userId, status: 'IN_PROGRESS' },
      });

      if (!pomodoro) {
        return { success: false, error: { code: 'NOT_FOUND', message: 'Active pomodoro not found' } };
      }

      const completedTaskId = pomodoro.taskId;

      // Mark the current task as done if it exists
      if (completedTaskId) {
        await prisma.task.update({
          where: { id: completedTaskId },
          data: { status: 'DONE' },
        });
      }

      // Update pomodoro to point to next task (or null for taskless)
      await prisma.pomodoro.update({
        where: { id: pomodoroId },
        data: { taskId: nextTaskId ?? null },
      });

      return { success: true, data: { completedTaskId, nextTaskId: nextTaskId ?? null } };
    } catch (error) {
      return {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to complete task' },
      };
    }
  },

  /**
   * Get the last task worked on (from most recent completed pomodoro)
   */
  async getLastTask(userId: string): Promise<ServiceResult<{ id: string; title: string } | null>> {
    try {
      const lastPomodoro = await prisma.pomodoro.findFirst({
        where: { userId, status: 'COMPLETED', taskId: { not: null } },
        orderBy: { endTime: 'desc' },
        include: { task: { select: { id: true, title: true, status: true } } },
      });

      if (!lastPomodoro?.task || lastPomodoro.task.status === 'DONE') {
        return { success: true, data: null };
      }

      return { success: true, data: { id: lastPomodoro.task.id, title: lastPomodoro.task.title } };
    } catch (error) {
      return {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to get last task' },
      };
    }
  },
};

export default pomodoroService;
