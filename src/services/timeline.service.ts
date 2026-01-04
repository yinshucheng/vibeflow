/**
 * Timeline Service
 * 
 * Manages timeline events storage and retrieval for activity tracking.
 * Requirements: 6.2, 8.1, 8.2
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';
import type { TimelineEvent, Prisma } from '@prisma/client';

// Event types supported by the timeline
export const TimelineEventType = z.enum([
  'pomodoro',
  'distraction',
  'break',
  'scheduled_task',
  'activity_log',
  'block',
  'state_change',
  'interruption',
  'idle',
  'entertainment_mode',
  'work_start',
  'demo_mode',
  'offline',
]);

export type TimelineEventTypeValue = z.infer<typeof TimelineEventType>;

// Validation schemas
export const CreateTimelineEventSchema = z.object({
  type: TimelineEventType,
  startTime: z.date(),
  endTime: z.date().optional(),
  duration: z.number().min(0), // seconds
  title: z.string().min(1).max(500),
  metadata: z.record(z.unknown()).optional(),
  source: z.string().default('browser_sentinel'),
});

export const GetTimelineEventsSchema = z.object({
  date: z.date(),
  types: z.array(TimelineEventType).optional(),
});

export const GetTimelineEventsRangeSchema = z.object({
  startDate: z.date(),
  endDate: z.date(),
  types: z.array(TimelineEventType).optional(),
});

export type CreateTimelineEventInput = z.infer<typeof CreateTimelineEventSchema>;
export type GetTimelineEventsInput = z.infer<typeof GetTimelineEventsSchema>;
export type GetTimelineEventsRangeInput = z.infer<typeof GetTimelineEventsRangeSchema>;

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

// Timeline event with computed fields
export interface TimelineEventWithGap extends TimelineEvent {
  gapBefore?: number; // seconds gap before this event
}

// Daily timeline summary
export interface DailyTimelineSummary {
  date: string;
  events: TimelineEvent[];
  totalTrackedTime: number; // seconds
  totalGapTime: number; // seconds
  eventCounts: Record<string, number>;
}


// Helper function to get start and end of a day
function getDayBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// Helper function to format date as YYYY-MM-DD
function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Helper function to check if two dates are on the same day
function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

export const timelineService = {
  /**
   * Create a new timeline event
   * Requirements: 8.1, 8.2
   */
  async create(
    userId: string,
    data: CreateTimelineEventInput
  ): Promise<ServiceResult<TimelineEvent>> {
    try {
      const validated = CreateTimelineEventSchema.parse(data);

      const event = await prisma.timelineEvent.create({
        data: {
          userId,
          type: validated.type,
          startTime: validated.startTime,
          endTime: validated.endTime,
          duration: validated.duration,
          title: validated.title,
          metadata: (validated.metadata ?? {}) as Prisma.InputJsonValue,
          source: validated.source,
        },
      });

      return { success: true, data: event };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid timeline event data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create timeline event',
        },
      };
    }
  },

  /**
   * Create multiple timeline events in batch
   * Requirements: 8.1, 8.2
   */
  async createBatch(
    userId: string,
    events: CreateTimelineEventInput[]
  ): Promise<ServiceResult<{ count: number }>> {
    try {
      const validatedEvents = events.map((e) => CreateTimelineEventSchema.parse(e));

      const result = await prisma.timelineEvent.createMany({
        data: validatedEvents.map((event) => ({
          userId,
          type: event.type,
          startTime: event.startTime,
          endTime: event.endTime,
          duration: event.duration,
          title: event.title,
          metadata: (event.metadata ?? {}) as Prisma.InputJsonValue,
          source: event.source,
        })),
      });

      return { success: true, data: { count: result.count } };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid timeline event data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create timeline events',
        },
      };
    }
  },

  /**
   * Get timeline events for a specific date
   * Requirements: 6.2
   */
  async getByDate(
    userId: string,
    input: GetTimelineEventsInput
  ): Promise<ServiceResult<TimelineEvent[]>> {
    try {
      const validated = GetTimelineEventsSchema.parse(input);
      const { start, end } = getDayBounds(validated.date);

      const whereClause: {
        userId: string;
        startTime: { gte: Date; lte: Date };
        type?: { in: string[] };
      } = {
        userId,
        startTime: {
          gte: start,
          lte: end,
        },
      };

      // Add type filter if specified
      if (validated.types && validated.types.length > 0) {
        whereClause.type = { in: validated.types };
      }

      const events = await prisma.timelineEvent.findMany({
        where: whereClause,
        orderBy: { startTime: 'asc' },
      });

      return { success: true, data: events };
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
          message: error instanceof Error ? error.message : 'Failed to get timeline events',
        },
      };
    }
  },

  /**
   * Get timeline events for a date range
   * Requirements: 6.2
   */
  async getByDateRange(
    userId: string,
    input: GetTimelineEventsRangeInput
  ): Promise<ServiceResult<TimelineEvent[]>> {
    try {
      const validated = GetTimelineEventsRangeSchema.parse(input);
      const start = new Date(validated.startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(validated.endDate);
      end.setHours(23, 59, 59, 999);

      const whereClause: {
        userId: string;
        startTime: { gte: Date; lte: Date };
        type?: { in: string[] };
      } = {
        userId,
        startTime: {
          gte: start,
          lte: end,
        },
      };

      // Add type filter if specified
      if (validated.types && validated.types.length > 0) {
        whereClause.type = { in: validated.types };
      }

      const events = await prisma.timelineEvent.findMany({
        where: whereClause,
        orderBy: { startTime: 'asc' },
      });

      return { success: true, data: events };
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
          message: error instanceof Error ? error.message : 'Failed to get timeline events',
        },
      };
    }
  },

  /**
   * Get daily timeline summary with gap calculations
   * Requirements: 6.8
   */
  async getDailySummary(
    userId: string,
    date: Date
  ): Promise<ServiceResult<DailyTimelineSummary>> {
    try {
      const eventsResult = await this.getByDate(userId, { date });
      
      if (!eventsResult.success) {
        return { success: false, error: eventsResult.error };
      }

      const events = eventsResult.data ?? [];
      
      // Calculate total tracked time
      const totalTrackedTime = events.reduce((sum, event) => sum + event.duration, 0);

      // Calculate gaps between events
      let totalGapTime = 0;
      for (let i = 1; i < events.length; i++) {
        const prevEvent = events[i - 1];
        const currEvent = events[i];
        const prevEndTime = prevEvent.endTime ?? new Date(prevEvent.startTime.getTime() + prevEvent.duration * 1000);
        const gap = (currEvent.startTime.getTime() - prevEndTime.getTime()) / 1000;
        if (gap > 0) {
          totalGapTime += gap;
        }
      }

      // Count events by type
      const eventCounts: Record<string, number> = {};
      for (const event of events) {
        eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
      }

      return {
        success: true,
        data: {
          date: formatDateKey(date),
          events,
          totalTrackedTime,
          totalGapTime,
          eventCounts,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get daily summary',
        },
      };
    }
  },

  /**
   * Get events with gap information
   * Requirements: 6.8
   */
  async getEventsWithGaps(
    userId: string,
    date: Date
  ): Promise<ServiceResult<TimelineEventWithGap[]>> {
    try {
      const eventsResult = await this.getByDate(userId, { date });
      
      if (!eventsResult.success) {
        return { success: false, error: eventsResult.error };
      }

      const events = eventsResult.data ?? [];
      const eventsWithGaps: TimelineEventWithGap[] = [];

      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        let gapBefore: number | undefined;

        if (i > 0) {
          const prevEvent = events[i - 1];
          const prevEndTime = prevEvent.endTime ?? new Date(prevEvent.startTime.getTime() + prevEvent.duration * 1000);
          const gap = (event.startTime.getTime() - prevEndTime.getTime()) / 1000;
          if (gap > 0) {
            gapBefore = gap;
          }
        }

        eventsWithGaps.push({
          ...event,
          gapBefore,
        });
      }

      return { success: true, data: eventsWithGaps };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get events with gaps',
        },
      };
    }
  },

  /**
   * Delete a timeline event
   */
  async delete(
    id: string,
    userId: string
  ): Promise<ServiceResult<TimelineEvent>> {
    try {
      // Verify event exists and belongs to user
      const existing = await prisma.timelineEvent.findFirst({
        where: { id, userId },
      });

      if (!existing) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Timeline event not found',
          },
        };
      }

      const deleted = await prisma.timelineEvent.delete({
        where: { id },
      });

      return { success: true, data: deleted };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to delete timeline event',
        },
      };
    }
  },

  /**
   * Check for duplicate events (for deduplication)
   * Requirements: 8.5
   */
  async findDuplicate(
    userId: string,
    type: string,
    timestamp: Date
  ): Promise<ServiceResult<TimelineEvent | null>> {
    try {
      // Look for events within 1 second of the timestamp
      const start = new Date(timestamp.getTime() - 1000);
      const end = new Date(timestamp.getTime() + 1000);

      const existing = await prisma.timelineEvent.findFirst({
        where: {
          userId,
          type,
          startTime: {
            gte: start,
            lte: end,
          },
        },
      });

      return { success: true, data: existing };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to check for duplicate',
        },
      };
    }
  },

  /**
   * Create event with deduplication
   * Requirements: 8.5
   */
  async createWithDedup(
    userId: string,
    data: CreateTimelineEventInput
  ): Promise<ServiceResult<TimelineEvent>> {
    try {
      const validated = CreateTimelineEventSchema.parse(data);

      // Check for duplicate
      const duplicateResult = await this.findDuplicate(
        userId,
        validated.type,
        validated.startTime
      );

      if (duplicateResult.success && duplicateResult.data) {
        // Return existing event instead of creating duplicate
        return { success: true, data: duplicateResult.data };
      }

      // Create new event
      return this.create(userId, validated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid timeline event data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create timeline event',
        },
      };
    }
  },

  /**
   * Get pomodoro events from the Pomodoro table and convert to timeline format
   * This syncs pomodoro sessions to the timeline view
   */
  async syncPomodoroEvents(
    userId: string,
    date: Date
  ): Promise<ServiceResult<TimelineEvent[]>> {
    try {
      const { start, end } = getDayBounds(date);

      // Get pomodoros for the day
      const pomodoros = await prisma.pomodoro.findMany({
        where: {
          userId,
          startTime: {
            gte: start,
            lte: end,
          },
          status: { not: 'IN_PROGRESS' },
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
        orderBy: { startTime: 'asc' },
      });

      // Convert to timeline events
      const events: TimelineEvent[] = pomodoros.map((p) => ({
        id: p.id,
        userId: p.userId,
        type: 'pomodoro',
        startTime: p.startTime,
        endTime: p.endTime,
        duration: p.endTime 
          ? Math.floor((p.endTime.getTime() - p.startTime.getTime()) / 1000)
          : p.duration * 60,
        title: p.task.title,
        metadata: {
          taskId: p.taskId,
          projectId: p.task.projectId,
          status: p.status,
          summary: p.summary,
        },
        source: 'vibeflow',
        createdAt: p.createdAt,
      }));

      return { success: true, data: events };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to sync pomodoro events',
        },
      };
    }
  },

  /**
   * Get combined timeline (pomodoros + other events)
   * Requirements: 6.3, 6.4, 6.5
   */
  async getCombinedTimeline(
    userId: string,
    date: Date,
    types?: TimelineEventTypeValue[]
  ): Promise<ServiceResult<TimelineEvent[]>> {
    try {
      // Get timeline events
      const eventsResult = await this.getByDate(userId, { date, types });
      if (!eventsResult.success) {
        return { success: false, error: eventsResult.error };
      }

      // Get pomodoro events if 'pomodoro' type is included or no filter
      let pomodoroEvents: TimelineEvent[] = [];
      if (!types || types.includes('pomodoro')) {
        const pomodoroResult = await this.syncPomodoroEvents(userId, date);
        if (pomodoroResult.success && pomodoroResult.data) {
          pomodoroEvents = pomodoroResult.data;
        }
      }

      // Get demo mode events if 'demo_mode' type is included or no filter
      let demoModeEvents: TimelineEvent[] = [];
      if (!types || types.includes('demo_mode')) {
        const demoModeResult = await this.syncDemoModeEvents(userId, date);
        if (demoModeResult.success && demoModeResult.data) {
          demoModeEvents = demoModeResult.data;
        }
      }

      // Get offline events if 'offline' type is included or no filter
      let offlineEvents: TimelineEvent[] = [];
      if (!types || types.includes('offline')) {
        const offlineResult = await this.syncOfflineEvents(userId, date);
        if (offlineResult.success && offlineResult.data) {
          offlineEvents = offlineResult.data;
        }
      }

      // Filter out synced types from timeline events (to avoid duplicates)
      const otherEvents = (eventsResult.data ?? []).filter(
        e => e.type !== 'pomodoro' && e.type !== 'demo_mode' && e.type !== 'offline'
      );

      // Combine and sort by start time
      const allEvents = [...pomodoroEvents, ...demoModeEvents, ...offlineEvents, ...otherEvents].sort(
        (a, b) => a.startTime.getTime() - b.startTime.getTime()
      );

      return { success: true, data: allEvents };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get combined timeline',
        },
      };
    }
  },

  /**
   * Get demo mode events from DemoModeEvent table and convert to timeline format
   * Requirements: 6.11
   */
  async syncDemoModeEvents(
    userId: string,
    date: Date
  ): Promise<ServiceResult<TimelineEvent[]>> {
    try {
      const { start, end } = getDayBounds(date);

      // Get demo mode events for the day
      const demoModeEvents = await prisma.demoModeEvent.findMany({
        where: {
          userId,
          timestamp: {
            gte: start,
            lte: end,
          },
        },
        include: {
          token: true,
        },
        orderBy: { timestamp: 'asc' },
      });

      // Convert to timeline events
      const events: TimelineEvent[] = demoModeEvents.map((e) => {
        const durationMinutes = e.durationMinutes ?? 0;
        const durationSeconds = durationMinutes * 60;
        
        // Calculate end time based on event type
        let endTime: Date | null = null;
        if (e.eventType === 'started' && e.token.endedAt) {
          endTime = e.token.endedAt;
        } else if (e.eventType !== 'started') {
          endTime = e.timestamp;
        }

        // Get title based on event type
        let title = '演示模式';
        switch (e.eventType) {
          case 'started':
            title = '演示模式开始';
            break;
          case 'ended':
            title = '演示模式结束';
            break;
          case 'expired':
            title = '演示模式过期';
            break;
        }

        return {
          id: e.id,
          userId: e.userId,
          type: 'demo_mode',
          startTime: e.timestamp,
          endTime,
          duration: durationSeconds,
          title,
          metadata: {
            eventType: e.eventType,
            tokenId: e.tokenId,
            durationMinutes: e.durationMinutes,
            reason: e.reason,
          },
          source: 'vibeflow',
          createdAt: e.timestamp,
        };
      });

      return { success: true, data: events };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to sync demo mode events',
        },
      };
    }
  },

  /**
   * Get offline events from ClientOfflineEvent table and convert to timeline format
   * Requirements: 6.11
   */
  async syncOfflineEvents(
    userId: string,
    date: Date
  ): Promise<ServiceResult<TimelineEvent[]>> {
    try {
      const { start, end } = getDayBounds(date);

      // Get offline events for the day
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const offlineEvents = await (prisma as any).clientOfflineEvent.findMany({
        where: {
          userId,
          startedAt: {
            gte: start,
            lte: end,
          },
        },
        orderBy: { startedAt: 'asc' },
      });

      // Convert to timeline events
      const events: TimelineEvent[] = offlineEvents.map((e: {
        id: string;
        userId: string;
        clientId: string;
        startedAt: Date;
        endedAt: Date | null;
        durationSeconds: number | null;
        wasInWorkHours: boolean;
        wasInPomodoro: boolean;
        gracePeriodUsed: boolean;
        isBypassAttempt: boolean;
      }) => {
        const durationSeconds = e.durationSeconds ?? 0;
        
        // Build title based on context
        let title = '客户端离线';
        if (e.wasInPomodoro) {
          title = '番茄期间离线';
        } else if (e.wasInWorkHours) {
          title = '工作时间离线';
        }
        if (e.isBypassAttempt) {
          title += ' (绕过尝试)';
        }

        return {
          id: e.id,
          userId: e.userId,
          type: 'offline',
          startTime: e.startedAt,
          endTime: e.endedAt,
          duration: durationSeconds,
          title,
          metadata: {
            clientId: e.clientId,
            wasInWorkHours: e.wasInWorkHours,
            wasInPomodoro: e.wasInPomodoro,
            gracePeriodUsed: e.gracePeriodUsed,
            isBypassAttempt: e.isBypassAttempt,
          },
          source: 'vibeflow',
          createdAt: e.startedAt,
        };
      });

      return { success: true, data: events };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to sync offline events',
        },
      };
    }
  },
};

export default timelineService;
