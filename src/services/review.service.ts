/**
 * Review Service
 * 
 * Provides daily review data calculation and achievement rate computation.
 * Requirements: 10.3, 10.4, 10.5, 10.6
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';
import type { Pomodoro } from '@prisma/client';

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

// Weekday expectation interface
export interface WeekdayExpectation {
  workMinutes: number;
  pomodoroCount: number;
}

// Weekday expectations map (0-6 for Sunday-Saturday)
export type WeekdayExpectations = Record<string, WeekdayExpectation>;

// Daily review data with achievement rates
export interface DailyReviewData {
  date: string;
  
  // Expected values
  expectedWorkMinutes: number;
  expectedPomodoroCount: number;
  
  // Actual values
  actualWorkMinutes: number;
  actualPomodoroCount: number;
  completedPomodoros: number;
  interruptedPomodoros: number;
  abortedPomodoros: number;
  
  // Achievement rates (0-100+)
  workTimeAchievementRate: number;
  pomodoroAchievementRate: number;
  
  // Website usage statistics
  productiveMinutes: number;
  distractingMinutes: number;
  neutralMinutes: number;
}

// Weekly trend data
export interface WeeklyTrendData {
  weekStart: string;
  days: DailyReviewData[];
  
  // Weekly totals
  totalExpectedMinutes: number;
  totalActualMinutes: number;
  totalExpectedPomodoros: number;
  totalActualPomodoros: number;
  
  // Weekly averages
  averageWorkAchievementRate: number;
  averagePomodoroAchievementRate: number;
}

// Input schemas
export const GetDailyReviewSchema = z.object({
  date: z.date(),
});

export const GetWeeklyTrendSchema = z.object({
  weekStart: z.date(),
});

export const GetReviewRangeSchema = z.object({
  startDate: z.date(),
  endDate: z.date(),
});

export type GetDailyReviewInput = z.infer<typeof GetDailyReviewSchema>;
export type GetWeeklyTrendInput = z.infer<typeof GetWeeklyTrendSchema>;
export type GetReviewRangeInput = z.infer<typeof GetReviewRangeSchema>;

// Helper function to format date as YYYY-MM-DD
function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Helper function to get start of day
function getStartOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Helper function to get end of day
function getEndOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

// Helper function to get start of week (Sunday)
function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Calculate achievement rate
 * Requirements: 10.3, 10.4
 * 
 * @param actual - Actual value achieved
 * @param expected - Expected value
 * @returns Achievement rate as percentage (0-100+)
 */
export function calculateAchievementRate(actual: number, expected: number): number {
  if (expected === 0) {
    return actual > 0 ? 100 : 0;
  }
  return (actual / expected) * 100;
}

/**
 * Get expected values for a specific day
 * Uses weekday-specific expectations if available, otherwise uses default
 */
function getExpectedValuesForDay(
  date: Date,
  defaultWorkMinutes: number,
  defaultPomodoroCount: number,
  weekdayExpectations?: WeekdayExpectations
): { workMinutes: number; pomodoroCount: number } {
  const dayOfWeek = date.getDay().toString();
  
  if (weekdayExpectations && weekdayExpectations[dayOfWeek]) {
    return weekdayExpectations[dayOfWeek];
  }
  
  return {
    workMinutes: defaultWorkMinutes,
    pomodoroCount: defaultPomodoroCount,
  };
}

/**
 * Calculate actual work minutes from pomodoros
 */
function calculateActualWorkMinutes(pomodoros: Pomodoro[]): number {
  return pomodoros.reduce((total, p) => {
    if (p.status === 'IN_PROGRESS') {
      // For in-progress, calculate elapsed time
      const elapsed = (Date.now() - p.startTime.getTime()) / 1000 / 60;
      return total + Math.min(elapsed, p.duration);
    }
    
    if (p.endTime) {
      // Use actual duration
      const actual = (p.endTime.getTime() - p.startTime.getTime()) / 1000 / 60;
      return total + Math.min(actual, p.duration);
    }
    
    // Fallback to planned duration
    return total + p.duration;
  }, 0);
}


export const reviewService = {
  /**
   * Get or create daily review for a specific date
   * Requirements: 10.3, 10.4, 10.5, 10.6
   */
  async getDailyReview(userId: string, date: Date): Promise<ServiceResult<DailyReviewData>> {
    try {
      const targetDate = getStartOfDay(date);
      const dateKey = formatDateKey(targetDate);
      
      // Get user settings for expected values
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
      }) as {
        expectedWorkMinutes?: number;
        expectedPomodoroCount?: number;
        weekdayExpectations?: unknown;
      } | null;
      
      const defaultWorkMinutes = settings?.expectedWorkMinutes ?? 360;
      const defaultPomodoroCount = settings?.expectedPomodoroCount ?? 10;
      
      // Parse weekday expectations
      let weekdayExpectations: WeekdayExpectations | undefined;
      if (settings?.weekdayExpectations) {
        try {
          const parsed = typeof settings.weekdayExpectations === 'string'
            ? JSON.parse(settings.weekdayExpectations)
            : settings.weekdayExpectations;
          if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
            weekdayExpectations = parsed as WeekdayExpectations;
          }
        } catch {
          // Use default
        }
      }
      
      // Get expected values for this specific day
      const expected = getExpectedValuesForDay(
        targetDate,
        defaultWorkMinutes,
        defaultPomodoroCount,
        weekdayExpectations
      );
      
      // Check if we have an existing review record
      // Use type assertion for Prisma client with DailyReview model
      const prismaAny = prisma as unknown as {
        dailyReview: {
          findUnique: (args: { where: { userId_date: { userId: string; date: Date } } }) => Promise<unknown>;
          create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
          update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
        };
      };
      let review = await prismaAny.dailyReview.findUnique({
        where: {
          userId_date: {
            userId,
            date: targetDate,
          },
        },
      }) as { id: string } | null;
      
      // Get pomodoros for this day to calculate actual values
      const pomodoros = await prisma.pomodoro.findMany({
        where: {
          userId,
          startTime: {
            gte: targetDate,
            lt: getEndOfDay(targetDate),
          },
          status: {
            not: 'IN_PROGRESS',
          },
        },
      });
      
      // Calculate actual values
      const actualWorkMinutes = Math.round(calculateActualWorkMinutes(pomodoros));
      const completedPomodoros = pomodoros.filter(p => p.status === 'COMPLETED').length;
      const interruptedPomodoros = pomodoros.filter(p => p.status === 'INTERRUPTED').length;
      const abortedPomodoros = pomodoros.filter(p => p.status === 'ABORTED').length;
      const actualPomodoroCount = completedPomodoros + interruptedPomodoros + abortedPomodoros;
      
      // Get activity logs for website usage (if available)
      const activityLogs = await prisma.activityLog.findMany({
        where: {
          userId,
          timestamp: {
            gte: targetDate,
            lt: getEndOfDay(targetDate),
          },
        },
      });
      
      const productiveMinutes = Math.round(
        activityLogs
          .filter(a => a.category === 'productive')
          .reduce((sum, a) => sum + a.duration, 0) / 60
      );
      const distractingMinutes = Math.round(
        activityLogs
          .filter(a => a.category === 'distracting')
          .reduce((sum, a) => sum + a.duration, 0) / 60
      );
      const neutralMinutes = Math.round(
        activityLogs
          .filter(a => a.category === 'neutral')
          .reduce((sum, a) => sum + a.duration, 0) / 60
      );
      
      // Create or update review record
      if (!review) {
        review = await prismaAny.dailyReview.create({
          data: {
            userId,
            date: targetDate,
            expectedWorkMinutes: expected.workMinutes,
            expectedPomodoroCount: expected.pomodoroCount,
            actualWorkMinutes,
            completedPomodoros,
            interruptedPomodoros,
            abortedPomodoros,
            productiveMinutes,
            distractingMinutes,
            neutralMinutes,
          },
        }) as { id: string };
      } else {
        // Update with latest values
        review = await prismaAny.dailyReview.update({
          where: { id: review.id },
          data: {
            actualWorkMinutes,
            completedPomodoros,
            interruptedPomodoros,
            abortedPomodoros,
            productiveMinutes,
            distractingMinutes,
            neutralMinutes,
          },
        }) as { id: string };
      }
      
      // Calculate achievement rates (Requirements 10.3, 10.4)
      const workTimeAchievementRate = calculateAchievementRate(
        actualWorkMinutes,
        expected.workMinutes
      );
      const pomodoroAchievementRate = calculateAchievementRate(
        completedPomodoros,
        expected.pomodoroCount
      );
      
      const reviewData: DailyReviewData = {
        date: dateKey,
        expectedWorkMinutes: expected.workMinutes,
        expectedPomodoroCount: expected.pomodoroCount,
        actualWorkMinutes,
        actualPomodoroCount,
        completedPomodoros,
        interruptedPomodoros,
        abortedPomodoros,
        workTimeAchievementRate,
        pomodoroAchievementRate,
        productiveMinutes,
        distractingMinutes,
        neutralMinutes,
      };
      
      return { success: true, data: reviewData };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get daily review',
        },
      };
    }
  },


  /**
   * Get weekly trend data
   * Requirements: 10.8
   */
  async getWeeklyTrend(userId: string, weekStart: Date): Promise<ServiceResult<WeeklyTrendData>> {
    try {
      const startOfWeek = getStartOfWeek(weekStart);
      const days: DailyReviewData[] = [];
      
      // Get review data for each day of the week
      for (let i = 0; i < 7; i++) {
        const dayDate = new Date(startOfWeek);
        dayDate.setDate(startOfWeek.getDate() + i);
        
        const result = await this.getDailyReview(userId, dayDate);
        if (result.success && result.data) {
          days.push(result.data);
        }
      }
      
      // Calculate weekly totals
      const totalExpectedMinutes = days.reduce((sum, d) => sum + d.expectedWorkMinutes, 0);
      const totalActualMinutes = days.reduce((sum, d) => sum + d.actualWorkMinutes, 0);
      const totalExpectedPomodoros = days.reduce((sum, d) => sum + d.expectedPomodoroCount, 0);
      const totalActualPomodoros = days.reduce((sum, d) => sum + d.completedPomodoros, 0);
      
      // Calculate weekly averages
      const daysWithExpectations = days.filter(d => d.expectedWorkMinutes > 0);
      const averageWorkAchievementRate = daysWithExpectations.length > 0
        ? daysWithExpectations.reduce((sum, d) => sum + d.workTimeAchievementRate, 0) / daysWithExpectations.length
        : 0;
      
      const daysWithPomodoroExpectations = days.filter(d => d.expectedPomodoroCount > 0);
      const averagePomodoroAchievementRate = daysWithPomodoroExpectations.length > 0
        ? daysWithPomodoroExpectations.reduce((sum, d) => sum + d.pomodoroAchievementRate, 0) / daysWithPomodoroExpectations.length
        : 0;
      
      const trendData: WeeklyTrendData = {
        weekStart: formatDateKey(startOfWeek),
        days,
        totalExpectedMinutes,
        totalActualMinutes,
        totalExpectedPomodoros,
        totalActualPomodoros,
        averageWorkAchievementRate,
        averagePomodoroAchievementRate,
      };
      
      return { success: true, data: trendData };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get weekly trend',
        },
      };
    }
  },

  /**
   * Get review data for a date range
   * Requirements: 10.8
   */
  async getReviewRange(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ServiceResult<DailyReviewData[]>> {
    try {
      const start = getStartOfDay(startDate);
      const end = getEndOfDay(endDate);
      const days: DailyReviewData[] = [];
      
      // Iterate through each day in the range
      const currentDate = new Date(start);
      while (currentDate <= end) {
        const result = await this.getDailyReview(userId, currentDate);
        if (result.success && result.data) {
          days.push(result.data);
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      return { success: true, data: days };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get review range',
        },
      };
    }
  },

  /**
   * Check if actual exceeds expected (positive feedback)
   * Requirements: 10.5
   */
  isAchievementExceeded(reviewData: DailyReviewData): {
    workTimeExceeded: boolean;
    pomodoroExceeded: boolean;
  } {
    return {
      workTimeExceeded: reviewData.actualWorkMinutes >= reviewData.expectedWorkMinutes,
      pomodoroExceeded: reviewData.completedPomodoros >= reviewData.expectedPomodoroCount,
    };
  },

  /**
   * Calculate remaining time/pomodoros needed
   * Requirements: 10.6
   */
  calculateRemaining(reviewData: DailyReviewData): {
    remainingMinutes: number;
    remainingPomodoros: number;
  } {
    return {
      remainingMinutes: Math.max(0, reviewData.expectedWorkMinutes - reviewData.actualWorkMinutes),
      remainingPomodoros: Math.max(0, reviewData.expectedPomodoroCount - reviewData.completedPomodoros),
    };
  },
};

export default reviewService;
