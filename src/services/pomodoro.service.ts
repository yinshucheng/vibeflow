import { z } from 'zod';
import prisma from '@/lib/prisma';
import type { Pomodoro, PomodoroStatus } from '@prisma/client';
import { mcpEventService } from './mcp-event.service';

// Timer configuration constraints (Requirements: 14.5)
const MIN_POMODORO_DURATION = 10; // minutes
const MIN_REST_DURATION = 2; // minutes
const MAX_POMODORO_DURATION = 120; // minutes
const DEFAULT_POMODORO_DURATION = 25; // minutes

// Validation schemas
export const StartPomodoroSchema = z.object({
  taskId: z.string().uuid('Invalid task ID'),
  duration: z
    .number()
    .min(MIN_POMODORO_DURATION, `Duration must be at least ${MIN_POMODORO_DURATION} minutes`)
    .max(MAX_POMODORO_DURATION, `Duration must be at most ${MAX_POMODORO_DURATION} minutes`)
    .optional(),
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

// Pomodoro with task type
export type PomodoroWithTask = Pomodoro & {
  task: {
    id: string;
    title: string;
    projectId: string;
  };
};

export const pomodoroService = {
  /**
   * Start a new pomodoro session
   * Requirements: 4.1, 4.2, 14.4
   */
  async start(userId: string, data: StartPomodoroInput): Promise<ServiceResult<Pomodoro>> {
    try {
      const validated = StartPomodoroSchema.parse(data);

      // Verify task exists and belongs to user
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
          taskTitle: pomodoro.task.title,
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

      const pomodoro = await prisma.pomodoro.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          endTime: new Date(),
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
          taskTitle: pomodoro.task.title,
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
          taskTitle: pomodoro.task.title,
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
   * Get current in-progress pomodoro
   */
  async getCurrent(userId: string): Promise<ServiceResult<PomodoroWithTask | null>> {
    try {
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
};

export default pomodoroService;
