/**
 * Command Queue Service
 * 
 * Manages command queuing for offline clients with acknowledgment tracking.
 * Implements FIFO ordering and automatic expiration cleanup.
 * 
 * Requirements: 2.6, 2.7
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';
import type { CommandQueue } from '@prisma/client';
import type {
  BaseCommand,
  OctopusCommand,
  CommandType,
  CommandPriority,
  QueueStats,
  CommandQueueStatus,
} from '@/types/octopus';
import { OctopusCommandSchema } from '@/types/octopus';

// =============================================================================
// TYPES
// =============================================================================

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Queued command with database metadata
 */
export interface QueuedCommand {
  id: string;
  commandId: string;
  clientId: string;
  userId: string;
  command: OctopusCommand;
  status: CommandQueueStatus;
  createdAt: number;
  deliveredAt: number | null;
  acknowledgedAt: number | null;
  expiryTime: number | null;
}

// =============================================================================
// SCHEMAS
// =============================================================================

/**
 * Schema for enqueue input
 */
export const EnqueueInputSchema = z.object({
  clientId: z.string().min(1),
  userId: z.string().min(1),
  command: OctopusCommandSchema,
});

// =============================================================================
// CONSTANTS
// =============================================================================

// Default expiry time for commands (1 hour)
const DEFAULT_EXPIRY_MS = 60 * 60 * 1000;

// Maximum retry attempts for critical commands
const MAX_RETRY_ATTEMPTS = 3;

// =============================================================================
// SERVICE
// =============================================================================

export const commandQueueService = {
  /**
   * Queue a command for a client
   * Requirements: 2.6, 2.7
   * 
   * Adds a command to the queue for delivery to an offline client.
   * Commands are stored with FIFO ordering based on createdAt.
   */
  async enqueue(
    clientId: string,
    userId: string,
    command: OctopusCommand
  ): Promise<ServiceResult<QueuedCommand>> {
    try {
      // Validate command
      const validationResult = OctopusCommandSchema.safeParse(command);
      if (!validationResult.success) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid command format',
            details: { issues: validationResult.error.issues },
          },
        };
      }

      const now = new Date();
      
      // Calculate expiry time
      const expiryTime = command.expiryTime 
        ? new Date(command.expiryTime)
        : new Date(now.getTime() + DEFAULT_EXPIRY_MS);

      // Create the queue entry
      const queueEntry = await prisma.commandQueue.create({
        data: {
          commandId: command.commandId,
          clientId,
          userId,
          commandType: command.commandType,
          payload: JSON.parse(JSON.stringify(command)),
          priority: command.priority,
          requiresAck: command.requiresAck,
          status: 'pending',
          expiryTime,
          createdAt: now,
        },
      });

      const queuedCommand = this.toQueuedCommand(queueEntry);
      return { success: true, data: queuedCommand };
    } catch (error) {
      // Handle unique constraint violation (duplicate commandId)
      if (error instanceof Error && error.message.includes('Unique constraint')) {
        return {
          success: false,
          error: {
            code: 'CONFLICT',
            message: `Command with id ${command.commandId} already exists in queue`,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to enqueue command',
        },
      };
    }
  },

  /**
   * Get pending commands for a client
   * Requirements: 2.7
   * 
   * Returns all pending commands for a client in FIFO order.
   * Excludes expired commands.
   */
  async getPendingCommands(clientId: string): Promise<ServiceResult<QueuedCommand[]>> {
    try {
      const now = new Date();

      const commands = await prisma.commandQueue.findMany({
        where: {
          clientId,
          status: 'pending',
          OR: [
            { expiryTime: null },
            { expiryTime: { gt: now } },
          ],
        },
        orderBy: [
          // Higher priority first
          { priority: 'desc' },
          // Then by creation time (FIFO)
          { createdAt: 'asc' },
        ],
      });

      const queuedCommands = commands.map(c => this.toQueuedCommand(c));
      return { success: true, data: queuedCommands };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get pending commands',
        },
      };
    }
  },

  /**
   * Get pending commands for a user (across all clients)
   */
  async getPendingCommandsByUser(userId: string): Promise<ServiceResult<QueuedCommand[]>> {
    try {
      const now = new Date();

      const commands = await prisma.commandQueue.findMany({
        where: {
          userId,
          status: 'pending',
          OR: [
            { expiryTime: null },
            { expiryTime: { gt: now } },
          ],
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'asc' },
        ],
      });

      const queuedCommands = commands.map(c => this.toQueuedCommand(c));
      return { success: true, data: queuedCommands };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get pending commands',
        },
      };
    }
  },

  /**
   * Mark command as delivered
   * Requirements: 2.6
   * 
   * Updates the command status to 'delivered' and records the delivery time.
   */
  async markDelivered(commandId: string, userId?: string): Promise<ServiceResult<void>> {
    try {
      const command = await prisma.commandQueue.findUnique({
        where: { commandId },
      });

      if (!command || (userId && command.userId !== userId)) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Command with id ${commandId} not found`,
          },
        };
      }

      if (command.status !== 'pending') {
        return {
          success: false,
          error: {
            code: 'CONFLICT',
            message: `Command is already ${command.status}`,
          },
        };
      }

      await prisma.commandQueue.update({
        where: { commandId },
        data: {
          status: 'delivered',
          deliveredAt: new Date(),
        },
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to mark command as delivered',
        },
      };
    }
  },

  /**
   * Mark command as acknowledged
   * Requirements: 2.6
   * 
   * Updates the command status to 'acknowledged' and records the acknowledgment time.
   */
  async markAcknowledged(commandId: string, userId?: string): Promise<ServiceResult<void>> {
    try {
      const command = await prisma.commandQueue.findUnique({
        where: { commandId },
      });

      if (!command || (userId && command.userId !== userId)) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Command with id ${commandId} not found`,
          },
        };
      }

      if (command.status === 'acknowledged') {
        // Idempotent - already acknowledged
        return { success: true };
      }

      if (command.status === 'expired') {
        return {
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'Cannot acknowledge an expired command',
          },
        };
      }

      await prisma.commandQueue.update({
        where: { commandId },
        data: {
          status: 'acknowledged',
          acknowledgedAt: new Date(),
        },
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to mark command as acknowledged',
        },
      };
    }
  },

  /**
   * Remove expired commands
   * Requirements: 2.6
   * 
   * Marks all expired commands as 'expired' and returns the count.
   * Should be called periodically (e.g., every minute).
   */
  async cleanupExpired(): Promise<ServiceResult<{ count: number }>> {
    try {
      const now = new Date();

      const result = await prisma.commandQueue.updateMany({
        where: {
          status: { in: ['pending', 'delivered'] },
          expiryTime: {
            lte: now,
          },
        },
        data: {
          status: 'expired',
        },
      });

      return { success: true, data: { count: result.count } };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to cleanup expired commands',
        },
      };
    }
  },

  /**
   * Get queue statistics for a user
   * 
   * Returns counts of commands in each status.
   */
  async getQueueStats(userId: string): Promise<ServiceResult<QueueStats>> {
    try {
      const [pending, delivered, acknowledged, expired] = await Promise.all([
        prisma.commandQueue.count({
          where: { userId, status: 'pending' },
        }),
        prisma.commandQueue.count({
          where: { userId, status: 'delivered' },
        }),
        prisma.commandQueue.count({
          where: { userId, status: 'acknowledged' },
        }),
        prisma.commandQueue.count({
          where: { userId, status: 'expired' },
        }),
      ]);

      const stats: QueueStats = {
        pendingCount: pending,
        deliveredCount: delivered,
        acknowledgedCount: acknowledged,
        expiredCount: expired,
      };

      return { success: true, data: stats };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get queue stats',
        },
      };
    }
  },

  /**
   * Get queue statistics for a specific client
   */
  async getClientQueueStats(clientId: string): Promise<ServiceResult<QueueStats>> {
    try {
      const [pending, delivered, acknowledged, expired] = await Promise.all([
        prisma.commandQueue.count({
          where: { clientId, status: 'pending' },
        }),
        prisma.commandQueue.count({
          where: { clientId, status: 'delivered' },
        }),
        prisma.commandQueue.count({
          where: { clientId, status: 'acknowledged' },
        }),
        prisma.commandQueue.count({
          where: { clientId, status: 'expired' },
        }),
      ]);

      const stats: QueueStats = {
        pendingCount: pending,
        deliveredCount: delivered,
        acknowledgedCount: acknowledged,
        expiredCount: expired,
      };

      return { success: true, data: stats };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get client queue stats',
        },
      };
    }
  },

  /**
   * Get command by ID
   */
  async getCommandById(commandId: string, userId?: string): Promise<ServiceResult<QueuedCommand | null>> {
    try {
      const command = await prisma.commandQueue.findUnique({
        where: { commandId },
      });

      if (!command || (userId && command.userId !== userId)) {
        return { success: true, data: null };
      }

      const queuedCommand = this.toQueuedCommand(command);
      return { success: true, data: queuedCommand };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get command',
        },
      };
    }
  },

  /**
   * Delete acknowledged commands older than a specified age
   * 
   * Cleanup utility to remove old acknowledged commands.
   */
  async deleteOldAcknowledged(maxAgeMs: number): Promise<ServiceResult<{ count: number }>> {
    try {
      const cutoffTime = new Date(Date.now() - maxAgeMs);

      const result = await prisma.commandQueue.deleteMany({
        where: {
          status: 'acknowledged',
          acknowledgedAt: {
            lt: cutoffTime,
          },
        },
      });

      return { success: true, data: { count: result.count } };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to delete old commands',
        },
      };
    }
  },

  /**
   * Delete expired commands older than a specified age
   * 
   * Cleanup utility to remove old expired commands.
   */
  async deleteOldExpired(maxAgeMs: number): Promise<ServiceResult<{ count: number }>> {
    try {
      const cutoffTime = new Date(Date.now() - maxAgeMs);

      const result = await prisma.commandQueue.deleteMany({
        where: {
          status: 'expired',
          expiryTime: {
            lt: cutoffTime,
          },
        },
      });

      return { success: true, data: { count: result.count } };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to delete old expired commands',
        },
      };
    }
  },

  /**
   * Requeue a delivered but unacknowledged command
   * Requirements: 2.6
   * 
   * Moves a delivered command back to pending status for retry.
   */
  async requeueCommand(commandId: string, userId?: string): Promise<ServiceResult<void>> {
    try {
      const command = await prisma.commandQueue.findUnique({
        where: { commandId },
      });

      if (!command || (userId && command.userId !== userId)) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Command with id ${commandId} not found`,
          },
        };
      }

      if (command.status !== 'delivered') {
        return {
          success: false,
          error: {
            code: 'CONFLICT',
            message: `Can only requeue delivered commands, current status: ${command.status}`,
          },
        };
      }

      await prisma.commandQueue.update({
        where: { commandId },
        data: {
          status: 'pending',
          deliveredAt: null,
        },
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to requeue command',
        },
      };
    }
  },

  /**
   * Get unacknowledged delivered commands for retry
   * Requirements: 2.6
   * 
   * Returns commands that were delivered but not acknowledged within timeout.
   */
  async getUnacknowledgedCommands(
    timeoutMs: number
  ): Promise<ServiceResult<QueuedCommand[]>> {
    try {
      const cutoffTime = new Date(Date.now() - timeoutMs);

      const commands = await prisma.commandQueue.findMany({
        where: {
          status: 'delivered',
          requiresAck: true,
          deliveredAt: {
            lt: cutoffTime,
          },
          OR: [
            { expiryTime: null },
            { expiryTime: { gt: new Date() } },
          ],
        },
        orderBy: { deliveredAt: 'asc' },
      });

      const queuedCommands = commands.map(c => this.toQueuedCommand(c));
      return { success: true, data: queuedCommands };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get unacknowledged commands',
        },
      };
    }
  },

  /**
   * Convert Prisma CommandQueue to QueuedCommand
   */
  toQueuedCommand(entry: CommandQueue): QueuedCommand {
    return {
      id: entry.id,
      commandId: entry.commandId,
      clientId: entry.clientId,
      userId: entry.userId,
      command: entry.payload as unknown as OctopusCommand,
      status: entry.status as CommandQueueStatus,
      createdAt: entry.createdAt.getTime(),
      deliveredAt: entry.deliveredAt?.getTime() ?? null,
      acknowledgedAt: entry.acknowledgedAt?.getTime() ?? null,
      expiryTime: entry.expiryTime?.getTime() ?? null,
    };
  },
};

export default commandQueueService;
