/**
 * Habit Service — CRUD + completion records for habit tracking
 *
 * Follows project service pattern:
 * - Zod schemas for validation
 * - ServiceResult<T> return type
 * - userId ownership verification on all operations
 * - Singleton object export
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';
import type { Habit, HabitEntry, HabitStatus } from '@prisma/client';
import { getTodayDate } from '@/services/daily-state.service';
import { habitStatsService } from '@/services/habit-stats.service';
import type { EntryForStats, StreakResult } from '@/services/habit-stats.service';

// ===== ServiceResult =====

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

// ===== Zod Schemas =====

export const CreateHabitSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100),
  type: z.enum(['BOOLEAN', 'MEASURABLE', 'TIMED']).default('BOOLEAN'),
  freqNum: z.number().int().min(1).max(31).default(1),
  freqDen: z.number().int().min(1).max(31).default(1),
  description: z.string().max(500).optional(),
  question: z.string().max(200).optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  reminderEnabled: z.boolean().optional(),
  reminderTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format')
    .optional(),
});

export const UpdateHabitSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  type: z.enum(['BOOLEAN', 'MEASURABLE', 'TIMED']).optional(),
  freqNum: z.number().int().min(1).max(31).optional(),
  freqDen: z.number().int().min(1).max(31).optional(),
  description: z.string().max(500).optional().nullable(),
  question: z.string().max(200).optional().nullable(),
  targetValue: z.number().positive().optional().nullable(),
  targetUnit: z.string().max(20).optional().nullable(),
  icon: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  reminderEnabled: z.boolean().optional(),
  reminderTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format')
    .optional()
    .nullable(),
});

export const RecordEntrySchema = z.object({
  habitId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  value: z.number().min(0),
  note: z.string().max(200).optional(),
});

export type CreateHabitInput = z.input<typeof CreateHabitSchema>;
export type UpdateHabitInput = z.input<typeof UpdateHabitSchema>;
export type RecordEntryInput = z.input<typeof RecordEntrySchema>;

// ===== Types =====

export type TodayHabit = Habit & {
  todayEntry: HabitEntry | null;
  streak: StreakResult;
  isDue: boolean;
};

// ===== Helpers =====

/** Parse YYYY-MM-DD string to Date at midnight */
function parseDateString(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Format Date to YYYY-MM-DD string */
function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Convert entries from Prisma to stats-compatible format */
function toEntryForStats(entries: HabitEntry[]): EntryForStats[] {
  return entries.map((e) => ({
    date: e.date,
    value: e.value,
    entryType: e.entryType,
  }));
}

// ===== Service =====

export const habitService = {
  /**
   * Create a new habit
   */
  async create(
    userId: string,
    data: CreateHabitInput,
  ): Promise<ServiceResult<Habit>> {
    try {
      const validated = CreateHabitSchema.parse(data);

      // Get max sortOrder for user's habits
      const maxSortOrder = await prisma.habit.aggregate({
        where: { userId },
        _max: { sortOrder: true },
      });

      const habit = await prisma.habit.create({
        data: {
          userId,
          title: validated.title,
          type: validated.type,
          freqNum: validated.freqNum,
          freqDen: validated.freqDen,
          description: validated.description,
          question: validated.question,
          icon: validated.icon,
          color: validated.color,
          reminderEnabled: validated.reminderEnabled ?? false,
          reminderTime: validated.reminderTime,
          sortOrder: (maxSortOrder._max.sortOrder ?? 0) + 1,
        },
      });

      return { success: true, data: habit };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid habit data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'Failed to create habit',
        },
      };
    }
  },

  /**
   * Update an existing habit
   */
  async update(
    userId: string,
    habitId: string,
    data: UpdateHabitInput,
  ): Promise<ServiceResult<Habit>> {
    try {
      const validated = UpdateHabitSchema.parse(data);

      // Verify ownership
      const existing = await prisma.habit.findFirst({
        where: { id: habitId, userId },
      });
      if (!existing) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Habit not found' },
        };
      }

      const habit = await prisma.habit.update({
        where: { id: habitId },
        data: validated,
      });

      return { success: true, data: habit };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid habit data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'Failed to update habit',
        },
      };
    }
  },

  /**
   * Update habit status (ACTIVE / PAUSED / ARCHIVED)
   */
  async updateStatus(
    userId: string,
    habitId: string,
    status: HabitStatus,
  ): Promise<ServiceResult<Habit>> {
    try {
      const existing = await prisma.habit.findFirst({
        where: { id: habitId, userId },
      });
      if (!existing) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Habit not found' },
        };
      }

      const habit = await prisma.habit.update({
        where: { id: habitId },
        data: { status },
      });

      return { success: true, data: habit };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to update habit status',
        },
      };
    }
  },

  /**
   * Delete a habit (cascade deletes entries via Prisma onDelete: Cascade)
   */
  async delete(userId: string, habitId: string): Promise<ServiceResult<void>> {
    try {
      const existing = await prisma.habit.findFirst({
        where: { id: habitId, userId },
      });
      if (!existing) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Habit not found' },
        };
      }

      await prisma.habit.delete({ where: { id: habitId } });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'Failed to delete habit',
        },
      };
    }
  },

  /**
   * List habits by user, optionally filtered by status
   */
  async listByUser(
    userId: string,
    filter?: { status?: HabitStatus },
  ): Promise<ServiceResult<Habit[]>> {
    try {
      const habits = await prisma.habit.findMany({
        where: {
          userId,
          ...(filter?.status ? { status: filter.status } : {}),
        },
        orderBy: { sortOrder: 'asc' },
      });

      return { success: true, data: habits };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'Failed to list habits',
        },
      };
    }
  },

  /**
   * Get a single habit by ID
   */
  async getById(
    userId: string,
    habitId: string,
  ): Promise<ServiceResult<Habit>> {
    try {
      const habit = await prisma.habit.findFirst({
        where: { id: habitId, userId },
      });
      if (!habit) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Habit not found' },
        };
      }

      return { success: true, data: habit };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'Failed to get habit',
        },
      };
    }
  },

  /**
   * Get today's habits: all ACTIVE habits filtered by isDueToday,
   * with today's entry and streak info.
   */
  async getTodayHabits(
    userId: string,
  ): Promise<ServiceResult<TodayHabit[]>> {
    try {
      const today = getTodayDate();
      const todayStr = formatDateString(today);

      // Get all active habits
      const habits = await prisma.habit.findMany({
        where: { userId, status: 'ACTIVE' },
        orderBy: { sortOrder: 'asc' },
      });

      if (habits.length === 0) {
        return { success: true, data: [] };
      }

      const habitIds = habits.map((h) => h.id);

      // Get today's entries for all habits
      const todayEntries = await prisma.habitEntry.findMany({
        where: {
          habitId: { in: habitIds },
          userId,
          date: parseDateString(todayStr),
        },
      });
      const todayEntryMap = new Map(
        todayEntries.map((e) => [e.habitId, e]),
      );

      // Get recent entries for isDueToday checks (current week/period)
      // For weekly habits we need the current ISO week entries
      // For simplicity, fetch entries from the past 31 days (covers any freqDen up to 31)
      const thirtyOneDaysAgo = new Date(today);
      thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);
      const recentEntries = await prisma.habitEntry.findMany({
        where: {
          habitId: { in: habitIds },
          userId,
          date: { gte: thirtyOneDaysAgo },
        },
      });

      // Group entries by habitId
      const entriesByHabit = new Map<string, HabitEntry[]>();
      for (const entry of recentEntries) {
        const list = entriesByHabit.get(entry.habitId) ?? [];
        list.push(entry);
        entriesByHabit.set(entry.habitId, list);
      }

      // Also get all entries for streak calculation (up to 365 days back)
      const yearAgo = new Date(today);
      yearAgo.setDate(yearAgo.getDate() - 365);
      const allEntries = await prisma.habitEntry.findMany({
        where: {
          habitId: { in: habitIds },
          userId,
          date: { gte: yearAgo },
        },
      });
      const allEntriesByHabit = new Map<string, HabitEntry[]>();
      for (const entry of allEntries) {
        const list = allEntriesByHabit.get(entry.habitId) ?? [];
        list.push(entry);
        allEntriesByHabit.set(entry.habitId, list);
      }

      const result: TodayHabit[] = [];
      for (const habit of habits) {
        const habitEntries = entriesByHabit.get(habit.id) ?? [];
        const isDue = habitStatsService.isDueToday(
          {
            status: habit.status,
            freqNum: habit.freqNum,
            freqDen: habit.freqDen,
            createdAt: habit.createdAt,
          },
          toEntryForStats(habitEntries),
          today,
        );

        if (!isDue) continue;

        const allHabitEntries = allEntriesByHabit.get(habit.id) ?? [];
        const streak = habitStatsService.calculateStreak(
          toEntryForStats(allHabitEntries),
          { num: habit.freqNum, den: habit.freqDen },
        );

        result.push({
          ...habit,
          todayEntry: todayEntryMap.get(habit.id) ?? null,
          streak,
          isDue,
        });
      }

      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to get today habits',
        },
      };
    }
  },

  /**
   * Record or update a habit entry (upsert).
   * If entry already exists for the date, update value + entryType.
   */
  async recordEntry(
    userId: string,
    habitId: string,
    date: string,
    value: number,
    note?: string,
  ): Promise<ServiceResult<HabitEntry>> {
    try {
      // Validate input
      RecordEntrySchema.parse({ habitId, date, value, note });

      // Verify habit ownership
      const habit = await prisma.habit.findFirst({
        where: { id: habitId, userId },
      });
      if (!habit) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Habit not found' },
        };
      }

      // Validate value by type
      if (habit.type === 'BOOLEAN' && value !== 1) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'BOOLEAN habit value must be 1',
          },
        };
      }
      if (
        (habit.type === 'MEASURABLE' || habit.type === 'TIMED') &&
        value <= 0
      ) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `${habit.type} habit value must be greater than 0`,
          },
        };
      }

      // Validate date range: not more than 7 days ago, not in the future
      const today = getTodayDate();
      const entryDate = parseDateString(date);
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      if (entryDate > today) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Cannot record entries for future dates',
          },
        };
      }
      if (entryDate < sevenDaysAgo) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Cannot record entries more than 7 days ago',
          },
        };
      }

      // Upsert: create or update entry for this habit+date
      const entry = await prisma.habitEntry.upsert({
        where: {
          habitId_date: {
            habitId,
            date: entryDate,
          },
        },
        create: {
          habitId,
          userId,
          date: entryDate,
          value,
          entryType: 'YES_MANUAL',
          note,
        },
        update: {
          value,
          entryType: 'YES_MANUAL',
          note,
        },
      });

      return { success: true, data: entry };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid entry data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to record entry',
        },
      };
    }
  },

  /**
   * Skip a habit entry for a given date (upsert with entryType=SKIP)
   */
  async skipEntry(
    userId: string,
    habitId: string,
    date: string,
  ): Promise<ServiceResult<HabitEntry>> {
    try {
      // Verify habit ownership
      const habit = await prisma.habit.findFirst({
        where: { id: habitId, userId },
      });
      if (!habit) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Habit not found' },
        };
      }

      const entryDate = parseDateString(date);

      const entry = await prisma.habitEntry.upsert({
        where: {
          habitId_date: {
            habitId,
            date: entryDate,
          },
        },
        create: {
          habitId,
          userId,
          date: entryDate,
          value: 0,
          entryType: 'SKIP',
        },
        update: {
          value: 0,
          entryType: 'SKIP',
          note: null,
        },
      });

      return { success: true, data: entry };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to skip entry',
        },
      };
    }
  },

  /**
   * Delete a habit entry for a given date
   */
  async deleteEntry(
    userId: string,
    habitId: string,
    date: string,
  ): Promise<ServiceResult<void>> {
    try {
      // Verify habit ownership
      const habit = await prisma.habit.findFirst({
        where: { id: habitId, userId },
      });
      if (!habit) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Habit not found' },
        };
      }

      const entryDate = parseDateString(date);

      // Try to find and delete the entry
      const existing = await prisma.habitEntry.findUnique({
        where: {
          habitId_date: {
            habitId,
            date: entryDate,
          },
        },
      });

      if (!existing) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Entry not found' },
        };
      }

      await prisma.habitEntry.delete({
        where: { id: existing.id },
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to delete entry',
        },
      };
    }
  },
};

export default habitService;
