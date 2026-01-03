/**
 * Work Start Service
 * 
 * Tracks when users complete Airlock to record work start times.
 * Used to analyze work avoidance patterns and improve discipline.
 * 
 * Requirements: 14.1, 14.2, 14.7, 14.8
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';
import type { WorkStartRecord } from '@prisma/client';
import { parseTimeToMinutes, getCurrentTimeMinutes } from './idle.service';
import type { WorkTimeSlot } from './user.service';

// ============================================================================
// Constants
// ============================================================================

const DAILY_RESET_HOUR = 4; // 04:00 AM

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

export interface WorkStartInfo {
  date: string;                    // YYYY-MM-DD
  configuredStartTime: string;     // HH:mm
  actualStartTime: number;         // Unix timestamp
  delayMinutes: number;            // 0 if on-time or early, positive if late
}

export interface WorkStartStats {
  totalDays: number;
  onTimeDays: number;
  lateDays: number;
  averageDelayMinutes: number;
  maxDelayMinutes: number;
  onTimePercentage: number;
}

// ============================================================================
// Validation Schemas
// ============================================================================

export const RecordWorkStartSchema = z.object({
  configuredStartTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:mm)'),
  actualStartTime: z.date().optional(),
});

export type RecordWorkStartInput = z.infer<typeof RecordWorkStartSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get today's date normalized to midnight, accounting for 04:00 AM reset
 */
function getTodayDate(): Date {
  const now = new Date();
  const today = new Date(now);
  
  if (now.getHours() < DAILY_RESET_HOUR) {
    today.setDate(today.getDate() - 1);
  }
  
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * Calculate delay in minutes between configured start time and actual start time
 * Requirements: 14.7, 14.8
 * 
 * @param configuredStartTime - The configured work start time in HH:mm format
 * @param actualStartTime - The actual timestamp when Airlock was completed
 * @returns Delay in minutes (0 if on-time or early, positive if late)
 */
export function calculateWorkStartDelay(
  configuredStartTime: string,
  actualStartTime: Date
): number {
  const configuredMinutes = parseTimeToMinutes(configuredStartTime);
  const actualMinutes = actualStartTime.getHours() * 60 + actualStartTime.getMinutes();
  
  // If actual start is before or at configured time, delay is 0
  if (actualMinutes <= configuredMinutes) {
    return 0;
  }
  
  return actualMinutes - configuredMinutes;
}

/**
 * Get the earliest configured work start time from work time slots
 */
function getEarliestWorkStartTime(workTimeSlots: WorkTimeSlot[]): string | null {
  const enabledSlots = workTimeSlots.filter(slot => slot.enabled);
  
  if (enabledSlots.length === 0) {
    return null;
  }
  
  // Sort by start time and return the earliest
  const sorted = [...enabledSlots].sort((a, b) => 
    parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)
  );
  
  return sorted[0].startTime;
}

// ============================================================================
// Work Start Service
// ============================================================================

export const workStartService = {
  /**
   * Record work start when Airlock is completed
   * Requirements: 14.1, 14.2
   */
  async recordWorkStart(
    userId: string,
    input?: RecordWorkStartInput
  ): Promise<ServiceResult<WorkStartRecord>> {
    try {
      const today = getTodayDate();
      const actualStartTime = input?.actualStartTime ?? new Date();
      
      // Get user's work time settings to determine configured start time
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
      });
      
      const workTimeSlots = (settings?.workTimeSlots as unknown as WorkTimeSlot[]) || [];
      
      // Use provided configured start time or get from settings
      let configuredStartTime: string = input?.configuredStartTime ?? '';
      if (!configuredStartTime) {
        const earliestStartTime = getEarliestWorkStartTime(workTimeSlots);
        configuredStartTime = earliestStartTime ?? '09:00';
      }
      
      // Calculate delay
      const delayMinutes = calculateWorkStartDelay(configuredStartTime, actualStartTime);
      
      // Upsert the work start record (only one per day)
      const record = await prisma.workStartRecord.upsert({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
        update: {
          configuredStartTime,
          actualStartTime,
          delayMinutes,
        },
        create: {
          userId,
          date: today,
          configuredStartTime,
          actualStartTime,
          delayMinutes,
        },
      });
      
      return { success: true, data: record };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid work start data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to record work start',
        },
      };
    }
  },

  /**
   * Get today's work start record
   * Requirements: 14.2
   */
  async getTodayWorkStart(userId: string): Promise<ServiceResult<WorkStartInfo | null>> {
    try {
      const today = getTodayDate();
      
      const record = await prisma.workStartRecord.findUnique({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
      });
      
      if (!record) {
        return { success: true, data: null };
      }
      
      const info: WorkStartInfo = {
        date: record.date.toISOString().split('T')[0],
        configuredStartTime: record.configuredStartTime,
        actualStartTime: record.actualStartTime.getTime(),
        delayMinutes: record.delayMinutes,
      };
      
      return { success: true, data: info };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get today work start',
        },
      };
    }
  },

  /**
   * Get work start history for stats
   * Requirements: 14.5, 14.6
   */
  async getHistory(
    userId: string,
    days: number = 30
  ): Promise<ServiceResult<WorkStartRecord[]>> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);
      
      const records = await prisma.workStartRecord.findMany({
        where: {
          userId,
          date: { gte: startDate },
        },
        orderBy: {
          date: 'desc',
        },
      });
      
      return { success: true, data: records };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get work start history',
        },
      };
    }
  },

  /**
   * Get work start statistics
   * Requirements: 14.5, 14.6
   */
  async getStats(
    userId: string,
    days: number = 30
  ): Promise<ServiceResult<WorkStartStats>> {
    try {
      const historyResult = await this.getHistory(userId, days);
      
      if (!historyResult.success || !historyResult.data) {
        return {
          success: false,
          error: historyResult.error,
        };
      }
      
      const records = historyResult.data;
      
      if (records.length === 0) {
        return {
          success: true,
          data: {
            totalDays: 0,
            onTimeDays: 0,
            lateDays: 0,
            averageDelayMinutes: 0,
            maxDelayMinutes: 0,
            onTimePercentage: 100,
          },
        };
      }
      
      const totalDays = records.length;
      const onTimeDays = records.filter(r => r.delayMinutes === 0).length;
      const lateDays = totalDays - onTimeDays;
      const totalDelay = records.reduce((sum, r) => sum + r.delayMinutes, 0);
      const averageDelayMinutes = Math.round(totalDelay / totalDays);
      const maxDelayMinutes = Math.max(...records.map(r => r.delayMinutes));
      const onTimePercentage = Math.round((onTimeDays / totalDays) * 100);
      
      return {
        success: true,
        data: {
          totalDays,
          onTimeDays,
          lateDays,
          averageDelayMinutes,
          maxDelayMinutes,
          onTimePercentage,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get work start stats',
        },
      };
    }
  },

  /**
   * Get work start trend data for charts
   * Requirements: 14.6
   */
  async getTrend(
    userId: string,
    days: number = 30
  ): Promise<ServiceResult<Array<{ date: string; delayMinutes: number }>>> {
    try {
      const historyResult = await this.getHistory(userId, days);
      
      if (!historyResult.success || !historyResult.data) {
        return {
          success: false,
          error: historyResult.error,
        };
      }
      
      const trend = historyResult.data.map(record => ({
        date: record.date.toISOString().split('T')[0],
        delayMinutes: record.delayMinutes,
      }));
      
      // Sort by date ascending for chart display
      trend.sort((a, b) => a.date.localeCompare(b.date));
      
      return { success: true, data: trend };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get work start trend',
        },
      };
    }
  },

  /**
   * Get configuration constants
   */
  getConfig() {
    return {
      dailyResetHour: DAILY_RESET_HOUR,
    };
  },
};

export default workStartService;
