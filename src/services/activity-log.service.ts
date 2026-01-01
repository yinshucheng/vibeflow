/**
 * ActivityLogService
 * 
 * Manages activity log storage and retrieval.
 * Activity logs are collected from Browser Sentinel and stored for analytics.
 * 
 * Requirements: 6.6, 7.3
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';
import type { ActivityLog } from '@prisma/client';

// Validation schemas
export const CreateActivityLogSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  duration: z.number().min(0),
  category: z.enum(['productive', 'neutral', 'distracting']),
  source: z.enum(['chrome_ext', 'desktop_ghost', 'mcp_agent']).default('chrome_ext'),
  timestamp: z.date().optional(),
});

export const CreateActivityLogBatchSchema = z.array(CreateActivityLogSchema);

export const GetActivityLogsSchema = z.object({
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  category: z.enum(['productive', 'neutral', 'distracting']).optional(),
  source: z.string().optional(),
  limit: z.number().min(1).max(1000).default(100),
  offset: z.number().min(0).default(0),
});

export type CreateActivityLogInput = z.infer<typeof CreateActivityLogSchema>;
export type CreateActivityLogBatchInput = z.infer<typeof CreateActivityLogBatchSchema>;
export type GetActivityLogsInput = z.infer<typeof GetActivityLogsSchema>;

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

// Activity summary type
export interface ActivitySummary {
  totalDuration: number; // seconds
  productiveDuration: number;
  neutralDuration: number;
  distractingDuration: number;
  productivePercentage: number;
  topSites: Array<{
    domain: string;
    duration: number;
    category: string;
  }>;
}

export const activityLogService = {
  /**
   * Create a single activity log entry
   * Requirements: 6.6, 7.3
   */
  async create(
    userId: string,
    data: CreateActivityLogInput
  ): Promise<ServiceResult<ActivityLog>> {
    try {
      const validated = CreateActivityLogSchema.parse(data);

      const activityLog = await prisma.activityLog.create({
        data: {
          userId,
          url: validated.url,
          title: validated.title,
          duration: validated.duration,
          category: validated.category,
          source: validated.source,
          timestamp: validated.timestamp || new Date(),
        },
      });

      return { success: true, data: activityLog };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid activity log data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create activity log',
        },
      };
    }
  },

  /**
   * Create multiple activity log entries in batch
   * Requirements: 6.6, 7.3
   */
  async createBatch(
    userId: string,
    data: CreateActivityLogBatchInput
  ): Promise<ServiceResult<{ count: number }>> {
    try {
      const validated = CreateActivityLogBatchSchema.parse(data);

      const result = await prisma.activityLog.createMany({
        data: validated.map((log) => ({
          userId,
          url: log.url,
          title: log.title,
          duration: log.duration,
          category: log.category,
          source: log.source,
          timestamp: log.timestamp || new Date(),
        })),
      });

      return { success: true, data: { count: result.count } };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid activity log batch data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create activity logs',
        },
      };
    }
  },

  /**
   * Get activity logs for a user with filtering
   * Requirements: 7.3
   */
  async getByUser(
    userId: string,
    options: Partial<GetActivityLogsInput> = {}
  ): Promise<ServiceResult<ActivityLog[]>> {
    try {
      const validated = GetActivityLogsSchema.parse({
        limit: 100,
        offset: 0,
        ...options,
      });

      const where: Record<string, unknown> = { userId };

      if (validated.startDate || validated.endDate) {
        where.timestamp = {};
        if (validated.startDate) {
          (where.timestamp as Record<string, Date>).gte = validated.startDate;
        }
        if (validated.endDate) {
          (where.timestamp as Record<string, Date>).lte = validated.endDate;
        }
      }

      if (validated.category) {
        where.category = validated.category;
      }

      if (validated.source) {
        where.source = validated.source;
      }

      const activityLogs = await prisma.activityLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: validated.limit,
        skip: validated.offset,
      });

      return { success: true, data: activityLogs };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get activity logs',
        },
      };
    }
  },

  /**
   * Get activity summary for a date range
   * Requirements: 7.3
   */
  async getSummary(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ServiceResult<ActivitySummary>> {
    try {
      const logs = await prisma.activityLog.findMany({
        where: {
          userId,
          timestamp: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      // Calculate durations by category
      let productiveDuration = 0;
      let neutralDuration = 0;
      let distractingDuration = 0;

      const siteDurations = new Map<string, { duration: number; category: string }>();

      for (const log of logs) {
        switch (log.category) {
          case 'productive':
            productiveDuration += log.duration;
            break;
          case 'neutral':
            neutralDuration += log.duration;
            break;
          case 'distracting':
            distractingDuration += log.duration;
            break;
        }

        // Extract domain from URL
        try {
          const domain = new URL(log.url).hostname;
          const existing = siteDurations.get(domain);
          if (existing) {
            existing.duration += log.duration;
          } else {
            siteDurations.set(domain, { duration: log.duration, category: log.category });
          }
        } catch {
          // Invalid URL, skip
        }
      }

      const totalDuration = productiveDuration + neutralDuration + distractingDuration;
      const productivePercentage = totalDuration > 0 
        ? Math.round((productiveDuration / totalDuration) * 100) 
        : 0;

      // Get top sites by duration
      const topSites = Array.from(siteDurations.entries())
        .map(([domain, data]) => ({ domain, ...data }))
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 10);

      return {
        success: true,
        data: {
          totalDuration,
          productiveDuration,
          neutralDuration,
          distractingDuration,
          productivePercentage,
          topSites,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get activity summary',
        },
      };
    }
  },

  /**
   * Get today's activity summary
   */
  async getTodaySummary(userId: string): Promise<ServiceResult<ActivitySummary>> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.getSummary(userId, today, tomorrow);
  },

  /**
   * Delete old activity logs (for cleanup)
   */
  async deleteOldLogs(
    userId: string,
    olderThan: Date
  ): Promise<ServiceResult<{ count: number }>> {
    try {
      const result = await prisma.activityLog.deleteMany({
        where: {
          userId,
          timestamp: { lt: olderThan },
        },
      });

      return { success: true, data: { count: result.count } };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to delete old logs',
        },
      };
    }
  },
};

export default activityLogService;
