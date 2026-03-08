import prisma from '@/lib/prisma';
import type { TaskTimeSlice } from '@prisma/client';

const MERGE_THRESHOLD_SECONDS = 60; // Merge if switching back within 60s
const FRAGMENT_THRESHOLD_SECONDS = 30; // Mark as fragment if < 30s

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export const timeSliceService = {
  /**
   * Start a new time slice for a pomodoro
   * If switching back to same task within 60s, merge with previous slice
   */
  async startSlice(
    pomodoroId: string,
    taskId: string | null,
    userId?: string
  ): Promise<ServiceResult<TaskTimeSlice>> {
    try {
      // Verify pomodoro ownership if userId provided
      if (userId) {
        const pomodoro = await prisma.pomodoro.findFirst({
          where: { id: pomodoroId, userId },
        });
        if (!pomodoro) {
          return { success: false, error: { code: 'NOT_FOUND', message: 'Pomodoro not found' } };
        }
      }

      // Check for recent slice of same task to merge
      if (taskId) {
        const recentSlice = await prisma.taskTimeSlice.findFirst({
          where: {
            pomodoroId,
            taskId,
            endTime: { not: null },
          },
          orderBy: { endTime: 'desc' },
        });

        if (recentSlice?.endTime) {
          const secondsSinceEnd = (Date.now() - recentSlice.endTime.getTime()) / 1000;
          if (secondsSinceEnd <= MERGE_THRESHOLD_SECONDS) {
            // Merge: reopen the previous slice
            const merged = await prisma.taskTimeSlice.update({
              where: { id: recentSlice.id },
              data: { endTime: null, durationSeconds: 0 },
            });
            return { success: true, data: merged };
          }
        }
      }

      // Create new slice
      const slice = await prisma.taskTimeSlice.create({
        data: { pomodoroId, taskId },
      });
      return { success: true, data: slice };
    } catch (error) {
      return {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to start slice' },
      };
    }
  },

  /**
   * End the current time slice
   * Marks as fragment if duration < 30s
   */
  async endSlice(sliceId: string, userId?: string): Promise<ServiceResult<TaskTimeSlice>> {
    try {
      const slice = await prisma.taskTimeSlice.findUnique({
        where: { id: sliceId },
        include: { pomodoro: { select: { userId: true } } },
      });
      if (!slice) {
        return { success: false, error: { code: 'NOT_FOUND', message: 'Slice not found' } };
      }
      // Verify ownership if userId provided
      if (userId && slice.pomodoro.userId !== userId) {
        return { success: false, error: { code: 'NOT_FOUND', message: 'Slice not found' } };
      }
      if (slice.endTime) {
        return { success: false, error: { code: 'CONFLICT', message: 'Slice already ended' } };
      }

      const endTime = new Date();
      const durationSeconds = Math.floor((endTime.getTime() - slice.startTime.getTime()) / 1000);
      const isFragment = durationSeconds < FRAGMENT_THRESHOLD_SECONDS;

      const updated = await prisma.taskTimeSlice.update({
        where: { id: sliceId },
        data: { endTime, durationSeconds, isFragment },
      });
      return { success: true, data: updated };
    } catch (error) {
      return {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to end slice' },
      };
    }
  },

  /**
   * Switch task: end current slice and start new one
   */
  async switchTask(
    pomodoroId: string,
    currentSliceId: string | null,
    newTaskId: string | null,
    userId?: string
  ): Promise<ServiceResult<TaskTimeSlice>> {
    try {
      // Verify pomodoro ownership if userId provided
      if (userId) {
        const pomodoro = await prisma.pomodoro.findFirst({
          where: { id: pomodoroId, userId },
        });
        if (!pomodoro) {
          return { success: false, error: { code: 'NOT_FOUND', message: 'Pomodoro not found' } };
        }
      }

      // End current slice if exists
      if (currentSliceId) {
        await this.endSlice(currentSliceId);
      }

      // Increment switch count on pomodoro
      await prisma.pomodoro.update({
        where: { id: pomodoroId },
        data: { taskSwitchCount: { increment: 1 } },
      });

      // Start new slice
      return this.startSlice(pomodoroId, newTaskId);
    } catch (error) {
      return {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to switch task' },
      };
    }
  },

  /**
   * Get all slices for a pomodoro
   */
  async getByPomodoro(pomodoroId: string, userId?: string): Promise<ServiceResult<TaskTimeSlice[]>> {
    try {
      // Verify pomodoro ownership if userId provided
      if (userId) {
        const pomodoro = await prisma.pomodoro.findFirst({
          where: { id: pomodoroId, userId },
        });
        if (!pomodoro) {
          return { success: false, error: { code: 'NOT_FOUND', message: 'Pomodoro not found' } };
        }
      }

      const slices = await prisma.taskTimeSlice.findMany({
        where: { pomodoroId },
        orderBy: { startTime: 'asc' },
        include: { task: { select: { id: true, title: true, projectId: true } } },
      });
      return { success: true, data: slices };
    } catch (error) {
      return {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to get slices' },
      };
    }
  },

  /**
   * Update a slice (for retroactive editing)
   * Triggers sync statistics recalculation (Phase 5 will upgrade to async)
   */
  async updateSlice(
    sliceId: string,
    data: { taskId?: string | null },
    userId?: string
  ): Promise<ServiceResult<TaskTimeSlice>> {
    try {
      // Verify ownership if userId provided
      if (userId) {
        const slice = await prisma.taskTimeSlice.findUnique({
          where: { id: sliceId },
          include: { pomodoro: { select: { userId: true } } },
        });
        if (!slice || slice.pomodoro.userId !== userId) {
          return { success: false, error: { code: 'NOT_FOUND', message: 'Slice not found' } };
        }
      }

      const updated = await prisma.taskTimeSlice.update({
        where: { id: sliceId },
        data,
      });
      // TODO: Phase 5 - trigger async statistics recalculation
      return { success: true, data: updated };
    } catch (error) {
      return {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to update slice' },
      };
    }
  },
};

export default timeSliceService;
