/**
 * ActivityAggregationService
 *
 * Aggregates and analyzes activity data from all sources (browser, desktop, mobile).
 * Provides deduplication, categorization, and productivity scoring.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';
import type { ActivityAggregate, ActivityLog } from '@prisma/client';

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

// Validation schemas
export const ActivitySourceSchema = z.enum(['browser', 'desktop_app', 'mobile_app']);
export const ActivityCategorySchema = z.enum(['productive', 'neutral', 'distracting']);

export const IngestActivitySchema = z.object({
  source: ActivitySourceSchema,
  identifier: z.string().min(1), // URL or app bundle ID
  title: z.string(),
  duration: z.number().min(0), // seconds
  category: ActivityCategorySchema,
  timestamp: z.date().optional(),
  metadata: z
    .object({
      domain: z.string().optional(),
      appBundleId: z.string().optional(),
      windowTitle: z.string().optional(),
    })
    .optional(),
});

export const IngestBatchSchema = z.array(IngestActivitySchema);

export const GetAggregatedStatsSchema = z.object({
  period: z.enum(['day', 'week', 'month']),
  date: z.date().optional(), // Reference date, defaults to today
});

export type IngestActivityInput = z.infer<typeof IngestActivitySchema>;
export type IngestBatchInput = z.infer<typeof IngestBatchSchema>;
export type GetAggregatedStatsInput = z.infer<typeof GetAggregatedStatsSchema>;
export type ActivitySource = z.infer<typeof ActivitySourceSchema>;
export type ActivityCategory = z.infer<typeof ActivityCategorySchema>;

// Aggregated stats type
export interface AggregatedStats {
  totalDuration: number; // seconds
  productiveDuration: number;
  distractingDuration: number;
  neutralDuration: number;
  productivityScore: number; // 0-100
  topActivities: Array<{
    identifier: string;
    title: string;
    duration: number;
    category: string;
  }>;
  bySource: Record<
    string,
    {
      duration: number;
      count: number;
    }
  >;
}

// Activity export type
export interface ActivityExport {
  userId: string;
  period: { start: Date; end: Date };
  activities: ActivityLog[];
  summary: AggregatedStats;
}

// Top identifier type for storage
interface TopIdentifier {
  identifier: string;
  title: string;
  duration: number;
}

/**
 * Map legacy source names to new source names
 */
function mapSource(source: string): ActivitySource {
  switch (source) {
    case 'chrome_ext':
      return 'browser';
    case 'desktop_ghost':
      return 'desktop_app';
    case 'mcp_agent':
      return 'browser'; // MCP agent activities are browser-based
    default:
      return source as ActivitySource;
  }
}

/**
 * Get the start of day for a given date
 */
function getStartOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get date range for a period
 */
function getDateRange(
  period: 'day' | 'week' | 'month',
  referenceDate: Date
): { start: Date; end: Date } {
  const start = getStartOfDay(referenceDate);
  const end = new Date(start);

  switch (period) {
    case 'day':
      end.setDate(end.getDate() + 1);
      break;
    case 'week':
      // Go back to start of week (Sunday)
      start.setDate(start.getDate() - start.getDay());
      end.setDate(start.getDate() + 7);
      break;
    case 'month':
      start.setDate(1);
      end.setMonth(end.getMonth() + 1);
      end.setDate(1);
      break;
  }

  return { start, end };
}


export const activityAggregationService = {
  /**
   * Ingest a single activity event and update aggregates
   * Requirements: 11.1
   */
  async ingestActivity(
    userId: string,
    data: IngestActivityInput
  ): Promise<ServiceResult<ActivityAggregate>> {
    try {
      const validated = IngestActivitySchema.parse(data);
      const date = getStartOfDay(validated.timestamp || new Date());

      // Upsert the aggregate record
      const aggregate = await prisma.activityAggregate.upsert({
        where: {
          userId_date_source_category: {
            userId,
            date,
            source: validated.source,
            category: validated.category,
          },
        },
        create: {
          userId,
          date,
          source: validated.source,
          category: validated.category,
          totalDuration: validated.duration,
          activityCount: 1,
          topIdentifiers: [
            {
              identifier: validated.identifier,
              title: validated.title,
              duration: validated.duration,
            },
          ],
        },
        update: {
          totalDuration: { increment: validated.duration },
          activityCount: { increment: 1 },
          // Note: topIdentifiers will be updated separately
        },
      });

      // Update top identifiers
      await this.updateTopIdentifiers(
        aggregate.id,
        validated.identifier,
        validated.title,
        validated.duration
      );

      // Fetch updated aggregate
      const updated = await prisma.activityAggregate.findUnique({
        where: { id: aggregate.id },
      });

      return { success: true, data: updated! };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid activity data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to ingest activity',
        },
      };
    }
  },

  /**
   * Ingest a batch of activity events
   * Requirements: 11.1
   */
  async ingestBatch(
    userId: string,
    data: IngestBatchInput
  ): Promise<ServiceResult<{ count: number }>> {
    try {
      const validated = IngestBatchSchema.parse(data);

      // Group activities by date, source, and category
      const groups = new Map<
        string,
        {
          date: Date;
          source: ActivitySource;
          category: ActivityCategory;
          totalDuration: number;
          count: number;
          identifiers: Map<string, { title: string; duration: number }>;
        }
      >();

      for (const activity of validated) {
        const date = getStartOfDay(activity.timestamp || new Date());
        const key = `${date.toISOString()}_${activity.source}_${activity.category}`;

        if (!groups.has(key)) {
          groups.set(key, {
            date,
            source: activity.source,
            category: activity.category,
            totalDuration: 0,
            count: 0,
            identifiers: new Map(),
          });
        }

        const group = groups.get(key)!;
        group.totalDuration += activity.duration;
        group.count += 1;

        const existing = group.identifiers.get(activity.identifier);
        if (existing) {
          existing.duration += activity.duration;
        } else {
          group.identifiers.set(activity.identifier, {
            title: activity.title,
            duration: activity.duration,
          });
        }
      }

      // Upsert each group
      let totalCount = 0;
      for (const group of Array.from(groups.values())) {
        const topIdentifiers: TopIdentifier[] = Array.from(group.identifiers.entries())
          .map(([identifier, identifierData]) => ({
            identifier,
            title: identifierData.title,
            duration: identifierData.duration,
          }))
          .sort((a, b) => b.duration - a.duration)
          .slice(0, 10);

        await prisma.activityAggregate.upsert({
          where: {
            userId_date_source_category: {
              userId,
              date: group.date,
              source: group.source,
              category: group.category,
            },
          },
          create: {
            userId,
            date: group.date,
            source: group.source,
            category: group.category,
            totalDuration: group.totalDuration,
            activityCount: group.count,
            topIdentifiers: topIdentifiers as unknown as object,
          },
          update: {
            totalDuration: { increment: group.totalDuration },
            activityCount: { increment: group.count },
            // For batch, we merge top identifiers
          },
        });

        totalCount += group.count;
      }

      return { success: true, data: { count: totalCount } };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid activity batch data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to ingest activity batch',
        },
      };
    }
  },

  /**
   * Deduplicate overlapping activities for a user on a specific date
   * Requirements: 11.2
   */
  async deduplicateActivities(
    userId: string,
    date: Date
  ): Promise<ServiceResult<{ deduplicatedCount: number }>> {
    try {
      const startOfDay = getStartOfDay(date);
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      // Get all activity logs for the day
      const logs = await prisma.activityLog.findMany({
        where: {
          userId,
          timestamp: {
            gte: startOfDay,
            lt: endOfDay,
          },
        },
        orderBy: { timestamp: 'asc' },
      });

      if (logs.length === 0) {
        return { success: true, data: { deduplicatedCount: 0 } };
      }

      // Group by source and category, then aggregate
      const aggregates = new Map<
        string,
        {
          source: ActivitySource;
          category: ActivityCategory;
          totalDuration: number;
          count: number;
          identifiers: Map<string, { title: string; duration: number }>;
        }
      >();

      // Track seen time ranges to detect overlaps
      const seenRanges: Array<{ start: number; end: number; identifier: string }> = [];
      let deduplicatedCount = 0;

      for (const log of logs) {
        const source = mapSource(log.source);
        const category = log.category as ActivityCategory;
        const key = `${source}_${category}`;

        // Check for overlapping time ranges with same identifier
        const logStart = log.timestamp.getTime();
        const logEnd = logStart + log.duration * 1000;

        let isDuplicate = false;
        for (const range of seenRanges) {
          if (
            range.identifier === log.url &&
            logStart < range.end &&
            logEnd > range.start
          ) {
            // Overlapping range with same identifier - skip
            isDuplicate = true;
            deduplicatedCount++;
            break;
          }
        }

        if (isDuplicate) continue;

        seenRanges.push({ start: logStart, end: logEnd, identifier: log.url });

        if (!aggregates.has(key)) {
          aggregates.set(key, {
            source,
            category,
            totalDuration: 0,
            count: 0,
            identifiers: new Map(),
          });
        }

        const agg = aggregates.get(key)!;
        agg.totalDuration += log.duration;
        agg.count += 1;

        const existing = agg.identifiers.get(log.url);
        if (existing) {
          existing.duration += log.duration;
        } else {
          agg.identifiers.set(log.url, {
            title: log.title || log.url,
            duration: log.duration,
          });
        }
      }

      // Update aggregates in database
      for (const agg of Array.from(aggregates.values())) {
        const topIdentifiers: TopIdentifier[] = Array.from(agg.identifiers.entries())
          .map(([identifier, identifierData]) => ({
            identifier,
            title: identifierData.title,
            duration: identifierData.duration,
          }))
          .sort((a, b) => b.duration - a.duration)
          .slice(0, 10);

        await prisma.activityAggregate.upsert({
          where: {
            userId_date_source_category: {
              userId,
              date: startOfDay,
              source: agg.source,
              category: agg.category,
            },
          },
          create: {
            userId,
            date: startOfDay,
            source: agg.source,
            category: agg.category,
            totalDuration: agg.totalDuration,
            activityCount: agg.count,
            topIdentifiers: topIdentifiers as unknown as object,
          },
          update: {
            totalDuration: agg.totalDuration,
            activityCount: agg.count,
            topIdentifiers: topIdentifiers as unknown as object,
          },
        });
      }

      return { success: true, data: { deduplicatedCount } };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to deduplicate activities',
        },
      };
    }
  },


  /**
   * Get aggregated stats for a period
   * Requirements: 11.4
   */
  async getAggregatedStats(
    userId: string,
    period: 'day' | 'week' | 'month',
    referenceDate?: Date
  ): Promise<ServiceResult<AggregatedStats>> {
    try {
      const { start, end } = getDateRange(period, referenceDate || new Date());

      // Get all aggregates for the period
      const aggregates = await prisma.activityAggregate.findMany({
        where: {
          userId,
          date: {
            gte: start,
            lt: end,
          },
        },
      });

      // Calculate totals
      let totalDuration = 0;
      let productiveDuration = 0;
      let distractingDuration = 0;
      let neutralDuration = 0;

      const bySource: Record<string, { duration: number; count: number }> = {};
      const allIdentifiers = new Map<
        string,
        { title: string; duration: number; category: string }
      >();

      for (const agg of aggregates) {
        totalDuration += agg.totalDuration;

        switch (agg.category) {
          case 'productive':
            productiveDuration += agg.totalDuration;
            break;
          case 'distracting':
            distractingDuration += agg.totalDuration;
            break;
          case 'neutral':
            neutralDuration += agg.totalDuration;
            break;
        }

        // Aggregate by source
        if (!bySource[agg.source]) {
          bySource[agg.source] = { duration: 0, count: 0 };
        }
        bySource[agg.source].duration += agg.totalDuration;
        bySource[agg.source].count += agg.activityCount;

        // Merge top identifiers
        const topIds = (agg.topIdentifiers as unknown as TopIdentifier[]) || [];
        for (const id of topIds) {
          const existing = allIdentifiers.get(id.identifier);
          if (existing) {
            existing.duration += id.duration;
          } else {
            allIdentifiers.set(id.identifier, {
              title: id.title,
              duration: id.duration,
              category: agg.category,
            });
          }
        }
      }

      // Calculate productivity score (0-100)
      // Score = (productive - distracting) / total * 50 + 50
      // This gives 100 for all productive, 50 for balanced, 0 for all distracting
      let productivityScore = 50;
      if (totalDuration > 0) {
        const ratio = (productiveDuration - distractingDuration) / totalDuration;
        productivityScore = Math.round(ratio * 50 + 50);
        productivityScore = Math.max(0, Math.min(100, productivityScore));
      }

      // Get top activities
      const topActivities = Array.from(allIdentifiers.entries())
        .map(([identifier, data]) => ({
          identifier,
          title: data.title,
          duration: data.duration,
          category: data.category,
        }))
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 10);

      return {
        success: true,
        data: {
          totalDuration,
          productiveDuration,
          distractingDuration,
          neutralDuration,
          productivityScore,
          topActivities,
          bySource,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get aggregated stats',
        },
      };
    }
  },

  /**
   * Calculate productivity score for a specific date
   * Requirements: 11.4
   */
  async calculateProductivityScore(
    userId: string,
    date: Date
  ): Promise<ServiceResult<number>> {
    const result = await this.getAggregatedStats(userId, 'day', date);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    return {
      success: true,
      data: result.data!.productivityScore,
    };
  },

  /**
   * Export activity data for a date range
   * Requirements: 11.4
   */
  async exportActivities(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ServiceResult<ActivityExport>> {
    try {
      // Get raw activity logs
      const activities = await prisma.activityLog.findMany({
        where: {
          userId,
          timestamp: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { timestamp: 'asc' },
      });

      // Get aggregated stats for the period
      // Calculate days in range
      const daysDiff = Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      let period: 'day' | 'week' | 'month' = 'day';
      if (daysDiff > 7) period = 'week';
      if (daysDiff > 30) period = 'month';

      const statsResult = await this.getAggregatedStats(userId, period, startDate);

      if (!statsResult.success) {
        return {
          success: false,
          error: statsResult.error,
        };
      }

      return {
        success: true,
        data: {
          userId,
          period: { start: startDate, end: endDate },
          activities,
          summary: statsResult.data!,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to export activities',
        },
      };
    }
  },

  /**
   * Update top identifiers for an aggregate
   * Internal helper method
   */
  async updateTopIdentifiers(
    aggregateId: string,
    identifier: string,
    title: string,
    duration: number
  ): Promise<void> {
    const aggregate = await prisma.activityAggregate.findUnique({
      where: { id: aggregateId },
    });

    if (!aggregate) return;

    const topIds = ((aggregate.topIdentifiers as unknown as TopIdentifier[]) || []);

    // Find existing identifier
    const existingIndex = topIds.findIndex((t) => t.identifier === identifier);

    if (existingIndex >= 0) {
      topIds[existingIndex].duration += duration;
    } else {
      topIds.push({ identifier, title, duration });
    }

    // Sort by duration and keep top 10
    topIds.sort((a, b) => b.duration - a.duration);
    const updatedTopIds = topIds.slice(0, 10);

    await prisma.activityAggregate.update({
      where: { id: aggregateId },
      data: { topIdentifiers: updatedTopIds as unknown as object },
    });
  },

  /**
   * Get aggregates for a specific date
   */
  async getByDate(
    userId: string,
    date: Date
  ): Promise<ServiceResult<ActivityAggregate[]>> {
    try {
      const startOfDay = getStartOfDay(date);

      const aggregates = await prisma.activityAggregate.findMany({
        where: {
          userId,
          date: startOfDay,
        },
      });

      return { success: true, data: aggregates };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get aggregates',
        },
      };
    }
  },

  /**
   * Delete aggregates older than a specified date
   */
  async deleteOldAggregates(
    userId: string,
    olderThan: Date
  ): Promise<ServiceResult<{ count: number }>> {
    try {
      const result = await prisma.activityAggregate.deleteMany({
        where: {
          userId,
          date: { lt: olderThan },
        },
      });

      return { success: true, data: { count: result.count } };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to delete old aggregates',
        },
      };
    }
  },
};

export default activityAggregationService;
