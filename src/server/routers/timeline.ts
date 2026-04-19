/**
 * Timeline tRPC Router
 * 
 * Exposes timeline event endpoints for activity tracking.
 * Requirements: 6.2, 8.1, 8.2, 8.4
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, readProcedure, writeProcedure } from '../trpc';
import { 
  timelineService, 
  TimelineEventType,
  CreateTimelineEventSchema,
} from '@/services/timeline.service';

export const timelineRouter = router({
  /**
   * Get timeline events for a specific date
   * Requirements: 6.2
   */
  getByDate: readProcedure
    .input(z.object({
      date: z.date(),
      types: z.array(TimelineEventType).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const result = await timelineService.getCombinedTimeline(
        ctx.user.userId,
        input.date,
        input.types
      );
      
      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get timeline events',
        });
      }
      
      return result.data;
    }),

  /**
   * Get timeline events for a date range
   * Requirements: 6.2
   */
  getByDateRange: readProcedure
    .input(z.object({
      startDate: z.date(),
      endDate: z.date(),
      types: z.array(TimelineEventType).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const result = await timelineService.getByDateRange(ctx.user.userId, {
        startDate: input.startDate,
        endDate: input.endDate,
        types: input.types,
      });
      
      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get timeline events',
        });
      }
      
      return result.data;
    }),

  /**
   * Get daily timeline summary with gap calculations
   * Requirements: 6.8
   */
  getDailySummary: readProcedure
    .input(z.object({
      date: z.date(),
    }))
    .query(async ({ ctx, input }) => {
      const result = await timelineService.getDailySummary(ctx.user.userId, input.date);
      
      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get daily summary',
        });
      }
      
      return result.data;
    }),

  /**
   * Get events with gap information
   * Requirements: 6.8
   */
  getEventsWithGaps: readProcedure
    .input(z.object({
      date: z.date(),
    }))
    .query(async ({ ctx, input }) => {
      const result = await timelineService.getEventsWithGaps(ctx.user.userId, input.date);
      
      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get events with gaps',
        });
      }
      
      return result.data;
    }),

  /**
   * Create a new timeline event (for Browser Sentinel)
   * Requirements: 8.4
   */
  createEvent: writeProcedure
    .input(CreateTimelineEventSchema)
    .mutation(async ({ ctx, input }) => {
      // Use deduplication to avoid duplicate events
      const result = await timelineService.createWithDedup(ctx.user.userId, input);
      
      if (!result.success) {
        const code = 
          result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' :
          'INTERNAL_SERVER_ERROR';
          
        throw new TRPCError({
          code,
          message: result.error?.message ?? 'Failed to create timeline event',
          cause: result.error?.details,
        });
      }
      
      return result.data;
    }),

  /**
   * Create multiple timeline events in batch
   * Requirements: 8.4
   */
  createEventBatch: writeProcedure
    .input(z.array(CreateTimelineEventSchema))
    .mutation(async ({ ctx, input }) => {
      const result = await timelineService.createBatch(ctx.user.userId, input);
      
      if (!result.success) {
        const code = 
          result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' :
          'INTERNAL_SERVER_ERROR';
          
        throw new TRPCError({
          code,
          message: result.error?.message ?? 'Failed to create timeline events',
          cause: result.error?.details,
        });
      }
      
      return result.data;
    }),

  /**
   * Delete a timeline event
   */
  deleteEvent: writeProcedure
    .input(z.object({
      id: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await timelineService.delete(input.id, ctx.user.userId);
      
      if (!result.success) {
        const code = 
          result.error?.code === 'NOT_FOUND' ? 'NOT_FOUND' :
          'INTERNAL_SERVER_ERROR';
          
        throw new TRPCError({
          code,
          message: result.error?.message ?? 'Failed to delete timeline event',
        });
      }
      
      return result.data;
    }),

  /**
   * Create a block event (for Browser Sentinel)
   * Requirements: 7.4, 8.4
   */
  createBlockEvent: writeProcedure
    .input(z.object({
      url: z.string(),
      timestamp: z.date(),
      blockType: z.enum(['hard_block', 'soft_block']),
      userAction: z.enum(['proceeded', 'returned']).optional(),
      pomodoroId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Extract domain from URL for title
      let domain = 'Unknown site';
      try {
        domain = new URL(input.url).hostname;
      } catch {
        domain = input.url;
      }

      const result = await timelineService.createWithDedup(ctx.user.userId, {
        type: 'block',
        startTime: input.timestamp,
        duration: 0, // Block events are instantaneous
        title: `Blocked: ${domain}`,
        metadata: {
          url: input.url,
          blockType: input.blockType,
          userAction: input.userAction,
          pomodoroId: input.pomodoroId,
        },
        source: 'browser_sentinel',
      });

      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to create block event',
        });
      }

      return result.data;
    }),

  /**
   * Create an interruption event (for Browser Sentinel)
   * Requirements: 7.4, 8.4
   */
  createInterruptionEvent: writeProcedure
    .input(z.object({
      timestamp: z.date(),
      duration: z.number().min(0),
      source: z.enum(['blocked_site', 'tab_switch', 'idle', 'manual']),
      pomodoroId: z.string(),
      details: z.object({
        url: z.string().optional(),
        idleSeconds: z.number().optional(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Create descriptive title based on source
      let title = 'Interruption';
      switch (input.source) {
        case 'blocked_site':
          title = `Blocked site access${input.details?.url ? `: ${new URL(input.details.url).hostname}` : ''}`;
          break;
        case 'tab_switch':
          title = 'Tab switch during focus';
          break;
        case 'idle':
          title = `Idle for ${input.details?.idleSeconds || input.duration} seconds`;
          break;
        case 'manual':
          title = 'Manual interruption';
          break;
      }

      const result = await timelineService.createWithDedup(ctx.user.userId, {
        type: 'interruption',
        startTime: input.timestamp,
        duration: input.duration,
        title,
        metadata: {
          source: input.source,
          pomodoroId: input.pomodoroId,
          details: input.details,
        },
        source: 'browser_sentinel',
      });

      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to create interruption event',
        });
      }

      return result.data;
    }),

  /**
   * Create a work start event (for recording Airlock completion)
   * Requirements: 14.3, 14.4
   */
  createWorkStartEvent: writeProcedure
    .input(z.object({
      timestamp: z.date(),
      configuredStartTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
      delayMinutes: z.number().int().min(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const title = input.delayMinutes === 0 
        ? '准时开始工作' 
        : `延迟 ${input.delayMinutes} 分钟开始工作`;

      const result = await timelineService.createWithDedup(ctx.user.userId, {
        type: 'work_start',
        startTime: input.timestamp,
        duration: 0, // Work start events are instantaneous
        title,
        metadata: {
          configuredStartTime: input.configuredStartTime,
          delayMinutes: input.delayMinutes,
        },
        source: 'vibeflow',
      });

      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to create work start event',
        });
      }

      return result.data;
    }),

  /**
   * Create an entertainment mode event
   * Requirements: 12.1, 12.2, 12.3, 12.4
   */
  createEntertainmentEvent: writeProcedure
    .input(z.object({
      startTime: z.date(),
      endTime: z.date().optional(),
      duration: z.number().int().min(0),
      sitesVisited: z.array(z.string()).optional(),
      quotaUsedBefore: z.number().int().min(0).optional(),
      quotaUsedAfter: z.number().int().min(0).optional(),
      reason: z.enum(['manual', 'quota_exhausted', 'work_time_start']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const durationMinutes = Math.round(input.duration / 60);
      const title = `娱乐时间 (${durationMinutes} 分钟)`;

      const result = await timelineService.createWithDedup(ctx.user.userId, {
        type: 'entertainment_mode',
        startTime: input.startTime,
        endTime: input.endTime,
        duration: input.duration,
        title,
        metadata: {
          sitesVisited: input.sitesVisited ?? [],
          quotaUsedBefore: input.quotaUsedBefore,
          quotaUsedAfter: input.quotaUsedAfter,
          reason: input.reason,
        },
        source: 'browser_sentinel',
      });

      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to create entertainment event',
        });
      }

      return result.data;
    }),
});
