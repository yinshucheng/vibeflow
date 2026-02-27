/**
 * MCP Event Service
 * 
 * Implements event subscription and publishing for AI agents via MCP.
 * Supports real-time event delivery through Socket.io and event history retrieval.
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';

// ============================================================================
// Types and Schemas
// ============================================================================

/**
 * MCP Event Types
 * Requirements: 10.1, 10.2, 10.3
 */
export const MCPEventTypeSchema = z.enum([
  // Task events (Requirement 10.1)
  'task.status_changed',
  'task.created',
  'task.updated',
  'task.deleted',
  // Pomodoro events (Requirement 10.2)
  'pomodoro.started',
  'pomodoro.paused',
  'pomodoro.completed',
  'pomodoro.aborted',
  // Daily state events (Requirement 10.3)
  'daily_state.changed',
  'daily_state.over_rest_entered',
  'daily_state.daily_reset',
  // Entertainment events (S4.2)
  'entertainment.started',
  'entertainment.stopped',
  // Early warning events (S4.2)
  'early_warning.triggered',
  // Blocker events
  'blocker.reported',
  'blocker.resolved',
]);

export type MCPEventType = z.infer<typeof MCPEventTypeSchema>;

/**
 * MCP Event structure
 */
export interface MCPEvent {
  id: string;
  type: MCPEventType;
  userId: string;
  timestamp: Date;
  payload: Record<string, unknown>;
}

/**
 * Event Subscription structure
 */
export interface EventSubscription {
  id: string;
  agentId: string;
  userId: string;
  eventTypes: MCPEventType[];
  createdAt: Date;
}

/**
 * Service Result type
 */
export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: Record<string, string[]> } };

// ============================================================================
// Input Schemas
// ============================================================================

export const SubscribeInputSchema = z.object({
  agentId: z.string().min(1, 'Agent ID is required'),
  userId: z.string().uuid('Invalid user ID'),
  eventTypes: z.array(MCPEventTypeSchema).min(1, 'At least one event type is required'),
});

export type SubscribeInput = z.infer<typeof SubscribeInputSchema>;

export const UnsubscribeInputSchema = z.object({
  subscriptionId: z.string().uuid('Invalid subscription ID'),
});

export type UnsubscribeInput = z.infer<typeof UnsubscribeInputSchema>;

export const PublishEventInputSchema = z.object({
  type: MCPEventTypeSchema,
  userId: z.string().uuid('Invalid user ID'),
  payload: z.record(z.unknown()),
});

export type PublishEventInput = z.infer<typeof PublishEventInputSchema>;

export const GetEventHistoryInputSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  eventTypes: z.array(MCPEventTypeSchema).optional(),
  since: z.date().optional(),
  limit: z.number().min(1).max(1000).default(100),
});

export type GetEventHistoryInput = z.infer<typeof GetEventHistoryInputSchema>;

export const GetSubscriptionsInputSchema = z.object({
  agentId: z.string().min(1, 'Agent ID is required'),
});

export type GetSubscriptionsInput = z.infer<typeof GetSubscriptionsInputSchema>;

// ============================================================================
// Event Broadcaster Type
// ============================================================================

type MCPEventBroadcaster = (userId: string, event: MCPEvent) => void;

// Registered broadcaster (set by socket-init when server starts)
let mcpEventBroadcaster: MCPEventBroadcaster | null = null;

/**
 * Register the MCP event broadcaster
 * Called by socket-init when the server starts
 */
export function registerMCPEventBroadcaster(broadcaster: MCPEventBroadcaster): void {
  mcpEventBroadcaster = broadcaster;
  console.log('[MCPEventService] Event broadcaster registered');
}

// ============================================================================
// Service Implementation
// ============================================================================

export const mcpEventService = {
  /**
   * Subscribe to events (Requirements 10.1, 10.2, 10.3)
   * Creates or updates a subscription for an agent
   */
  async subscribe(input: SubscribeInput): Promise<ServiceResult<EventSubscription>> {
    try {
      const validated = SubscribeInputSchema.parse(input);
      const { agentId, userId, eventTypes } = validated;

      // Verify user exists
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        };
      }

      // Upsert subscription (update if exists, create if not)
      const subscription = await prisma.mCPSubscription.upsert({
        where: {
          agentId_userId: { agentId, userId },
        },
        update: {
          eventTypes,
        },
        create: {
          agentId,
          userId,
          eventTypes,
        },
      });

      console.log(`[MCPEventService] Subscription created/updated: ${subscription.id} for agent ${agentId}`);

      return {
        success: true,
        data: {
          id: subscription.id,
          agentId: subscription.agentId,
          userId: subscription.userId,
          eventTypes: subscription.eventTypes as MCPEventType[],
          createdAt: subscription.createdAt,
        },
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      console.error('[MCPEventService] Subscribe error:', error);
      return {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to create subscription' },
      };
    }
  },

  /**
   * Unsubscribe from events
   */
  async unsubscribe(subscriptionId: string): Promise<ServiceResult<void>> {
    try {
      await prisma.mCPSubscription.delete({
        where: { id: subscriptionId },
      });

      console.log(`[MCPEventService] Subscription deleted: ${subscriptionId}`);

      return { success: true, data: undefined };
    } catch (error) {
      console.error('[MCPEventService] Unsubscribe error:', error);
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Subscription not found' },
      };
    }
  },

  /**
   * Publish an event (Requirement 10.4)
   * Stores event in history and notifies all subscribed agents
   * Target: notify within 100ms
   */
  async publish(input: PublishEventInput): Promise<ServiceResult<MCPEvent>> {
    try {
      const validated = PublishEventInputSchema.parse(input);
      const { type, userId, payload } = validated;

      const startTime = Date.now();

      // Store event in database for history (Requirement 10.5)
      const storedEvent = await prisma.mCPEvent.create({
        data: {
          userId,
          type,
          payload: payload as object,
        },
      });

      const event: MCPEvent = {
        id: storedEvent.id,
        type: type as MCPEventType,
        userId: storedEvent.userId,
        timestamp: storedEvent.timestamp,
        payload: storedEvent.payload as Record<string, unknown>,
      };

      // Find matching subscriptions
      const subscriptions = await prisma.mCPSubscription.findMany({
        where: {
          userId,
          eventTypes: { has: type },
        },
      });

      // Notify all subscribed agents via Socket.io (Requirement 10.4)
      if (mcpEventBroadcaster && subscriptions.length > 0) {
        mcpEventBroadcaster(userId, event);
      }

      const duration = Date.now() - startTime;
      if (duration > 100) {
        console.warn(`[MCPEventService] Event notification took ${duration}ms, exceeding 100ms target`);
      }

      console.log(`[MCPEventService] Event published: ${type} for user ${userId} (${subscriptions.length} subscribers, ${duration}ms)`);

      return { success: true, data: event };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      console.error('[MCPEventService] Publish error:', error);
      return {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to publish event' },
      };
    }
  },

  /**
   * Get event history (Requirement 10.5)
   * Returns events from the last 24 hours
   */
  async getEventHistory(input: GetEventHistoryInput): Promise<ServiceResult<MCPEvent[]>> {
    try {
      const validated = GetEventHistoryInputSchema.parse(input);
      const { userId, eventTypes, since, limit } = validated;

      // Default to last 24 hours if no since date provided
      const cutoffTime = since || new Date(Date.now() - 24 * 60 * 60 * 1000);

      const events = await prisma.mCPEvent.findMany({
        where: {
          userId,
          timestamp: { gte: cutoffTime },
          ...(eventTypes && eventTypes.length > 0 ? { type: { in: eventTypes } } : {}),
        },
        orderBy: { timestamp: 'desc' },
        take: limit,
      });

      return {
        success: true,
        data: events.map((e) => ({
          id: e.id,
          type: e.type as MCPEventType,
          userId: e.userId,
          timestamp: e.timestamp,
          payload: e.payload as Record<string, unknown>,
        })),
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      console.error('[MCPEventService] GetEventHistory error:', error);
      return {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get event history' },
      };
    }
  },

  /**
   * Get subscriptions for an agent
   */
  async getSubscriptions(agentId: string): Promise<ServiceResult<EventSubscription[]>> {
    try {
      const subscriptions = await prisma.mCPSubscription.findMany({
        where: { agentId },
      });

      return {
        success: true,
        data: subscriptions.map((s) => ({
          id: s.id,
          agentId: s.agentId,
          userId: s.userId,
          eventTypes: s.eventTypes as MCPEventType[],
          createdAt: s.createdAt,
        })),
      };
    } catch (error) {
      console.error('[MCPEventService] GetSubscriptions error:', error);
      return {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get subscriptions' },
      };
    }
  },

  /**
   * Get subscriptions for a user
   */
  async getSubscriptionsByUser(userId: string): Promise<ServiceResult<EventSubscription[]>> {
    try {
      const subscriptions = await prisma.mCPSubscription.findMany({
        where: { userId },
      });

      return {
        success: true,
        data: subscriptions.map((s) => ({
          id: s.id,
          agentId: s.agentId,
          userId: s.userId,
          eventTypes: s.eventTypes as MCPEventType[],
          createdAt: s.createdAt,
        })),
      };
    } catch (error) {
      console.error('[MCPEventService] GetSubscriptionsByUser error:', error);
      return {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get subscriptions' },
      };
    }
  },

  /**
   * Cleanup old events (Requirement 10.5)
   * Removes events older than 24 hours
   */
  async cleanupOldEvents(): Promise<ServiceResult<{ count: number }>> {
    try {
      const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const result = await prisma.mCPEvent.deleteMany({
        where: {
          timestamp: { lt: cutoffTime },
        },
      });

      if (result.count > 0) {
        console.log(`[MCPEventService] Cleaned up ${result.count} old events`);
      }

      return { success: true, data: { count: result.count } };
    } catch (error) {
      console.error('[MCPEventService] CleanupOldEvents error:', error);
      return {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to cleanup old events' },
      };
    }
  },
};

export default mcpEventService;
