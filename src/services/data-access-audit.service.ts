/**
 * Data Access Audit Service
 * 
 * Provides audit logging for data access operations to ensure
 * user data isolation and security compliance.
 * Requirements: 13.3
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';
import type { DataAccessLog } from '@prisma/client';

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

// Data access action types
export const DataAccessActionSchema = z.enum(['read', 'write', 'delete']);
export type DataAccessAction = z.infer<typeof DataAccessActionSchema>;

// Resource types that can be accessed
export const DataResourceSchema = z.enum([
  'task',
  'project',
  'goal',
  'pomodoro',
  'settings',
  'daily_state',
  'activity_log',
  'timeline_event',
  'client_registry',
  'policy',
  'command_queue',
  'activity_aggregate',
]);
export type DataResource = z.infer<typeof DataResourceSchema>;

// Log entry input schema
export const LogAccessInputSchema = z.object({
  userId: z.string().uuid(),
  action: DataAccessActionSchema,
  resource: DataResourceSchema,
  resourceId: z.string().optional(),
  clientId: z.string().optional(),
  clientType: z.string().optional(),
  ipAddress: z.string().optional(),
  success: z.boolean().default(true),
  details: z.record(z.unknown()).optional(),
});

export type LogAccessInput = z.infer<typeof LogAccessInputSchema>;

// Query options for retrieving logs
export interface GetLogsOptions {
  action?: DataAccessAction;
  resource?: DataResource;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export const dataAccessAuditService = {
  /**
   * Log a data access event
   * Requirements: 13.3
   */
  async logAccess(input: LogAccessInput): Promise<ServiceResult<DataAccessLog>> {
    try {
      const validated = LogAccessInputSchema.parse(input);
      
      const log = await prisma.dataAccessLog.create({
        data: {
          userId: validated.userId,
          action: validated.action,
          resource: validated.resource,
          resourceId: validated.resourceId,
          clientId: validated.clientId,
          clientType: validated.clientType,
          ipAddress: validated.ipAddress,
          success: validated.success,
          details: validated.details ? JSON.parse(JSON.stringify(validated.details)) : undefined,
        },
      });
      
      return { success: true, data: log };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid log access input',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      // Don't fail the main operation if logging fails
      console.error('[DataAccessAudit] Failed to log access:', error);
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to log access',
        },
      };
    }
  },

  /**
   * Log a successful read operation
   */
  async logRead(
    userId: string,
    resource: DataResource,
    resourceId?: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.logAccess({
      userId,
      action: 'read',
      resource,
      resourceId,
      success: true,
      details,
    });
  },

  /**
   * Log a successful write operation
   */
  async logWrite(
    userId: string,
    resource: DataResource,
    resourceId?: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.logAccess({
      userId,
      action: 'write',
      resource,
      resourceId,
      success: true,
      details,
    });
  },

  /**
   * Log a successful delete operation
   */
  async logDelete(
    userId: string,
    resource: DataResource,
    resourceId?: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.logAccess({
      userId,
      action: 'delete',
      resource,
      resourceId,
      success: true,
      details,
    });
  },

  /**
   * Log a failed access attempt (potential security issue)
   */
  async logFailedAccess(
    userId: string,
    action: DataAccessAction,
    resource: DataResource,
    resourceId?: string,
    reason?: string
  ): Promise<void> {
    await this.logAccess({
      userId,
      action,
      resource,
      resourceId,
      success: false,
      details: reason ? { reason } : undefined,
    });
  },

  /**
   * Get access logs for a user
   * Requirements: 13.3
   */
  async getLogs(
    userId: string,
    options?: GetLogsOptions
  ): Promise<ServiceResult<DataAccessLog[]>> {
    try {
      const where: Record<string, unknown> = { userId };
      
      if (options?.action) {
        where.action = options.action;
      }
      
      if (options?.resource) {
        where.resource = options.resource;
      }
      
      if (options?.startDate || options?.endDate) {
        where.timestamp = {};
        if (options.startDate) {
          (where.timestamp as Record<string, Date>).gte = options.startDate;
        }
        if (options.endDate) {
          (where.timestamp as Record<string, Date>).lte = options.endDate;
        }
      }
      
      const logs = await prisma.dataAccessLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: options?.limit || 100,
        skip: options?.offset || 0,
      });
      
      return { success: true, data: logs };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get logs',
        },
      };
    }
  },

  /**
   * Get failed access attempts (potential security issues)
   */
  async getFailedAttempts(
    userId: string,
    options?: { startDate?: Date; endDate?: Date; limit?: number }
  ): Promise<ServiceResult<DataAccessLog[]>> {
    try {
      const where: Record<string, unknown> = {
        userId,
        success: false,
      };
      
      if (options?.startDate || options?.endDate) {
        where.timestamp = {};
        if (options.startDate) {
          (where.timestamp as Record<string, Date>).gte = options.startDate;
        }
        if (options.endDate) {
          (where.timestamp as Record<string, Date>).lte = options.endDate;
        }
      }
      
      const logs = await prisma.dataAccessLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: options?.limit || 100,
      });
      
      return { success: true, data: logs };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get failed attempts',
        },
      };
    }
  },

  /**
   * Clean up old audit logs (retention policy)
   */
  async cleanupOldLogs(retentionDays: number = 90): Promise<ServiceResult<{ count: number }>> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      
      const result = await prisma.dataAccessLog.deleteMany({
        where: {
          timestamp: { lt: cutoffDate },
        },
      });
      
      return { success: true, data: { count: result.count } };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to cleanup logs',
        },
      };
    }
  },
};

// ============================================================================
// User Data Isolation Helpers
// ============================================================================

/**
 * Verify that a resource belongs to a user
 * Returns true if the resource belongs to the user, false otherwise
 * Requirements: 13.3
 */
export async function verifyResourceOwnership(
  userId: string,
  resource: DataResource,
  resourceId: string
): Promise<boolean> {
  try {
    switch (resource) {
      case 'task': {
        const task = await prisma.task.findFirst({
          where: { id: resourceId, userId },
        });
        return !!task;
      }
      case 'project': {
        const project = await prisma.project.findFirst({
          where: { id: resourceId, userId },
        });
        return !!project;
      }
      case 'goal': {
        const goal = await prisma.goal.findFirst({
          where: { id: resourceId, userId },
        });
        return !!goal;
      }
      case 'pomodoro': {
        const pomodoro = await prisma.pomodoro.findFirst({
          where: { id: resourceId, userId },
        });
        return !!pomodoro;
      }
      case 'settings': {
        const settings = await prisma.userSettings.findFirst({
          where: { id: resourceId, userId },
        });
        return !!settings;
      }
      case 'daily_state': {
        const dailyState = await prisma.dailyState.findFirst({
          where: { id: resourceId, userId },
        });
        return !!dailyState;
      }
      case 'activity_log': {
        const activityLog = await prisma.activityLog.findFirst({
          where: { id: resourceId, userId },
        });
        return !!activityLog;
      }
      case 'timeline_event': {
        const timelineEvent = await prisma.timelineEvent.findFirst({
          where: { id: resourceId, userId },
        });
        return !!timelineEvent;
      }
      case 'client_registry': {
        const clientRegistry = await prisma.clientRegistry.findFirst({
          where: { id: resourceId, userId },
        });
        return !!clientRegistry;
      }
      case 'policy': {
        const policy = await prisma.policyVersion.findFirst({
          where: { id: resourceId, userId },
        });
        return !!policy;
      }
      case 'command_queue': {
        const command = await prisma.commandQueue.findFirst({
          where: { id: resourceId, userId },
        });
        return !!command;
      }
      case 'activity_aggregate': {
        const aggregate = await prisma.activityAggregate.findFirst({
          where: { id: resourceId, userId },
        });
        return !!aggregate;
      }
      default:
        return false;
    }
  } catch (error) {
    console.error('[DataAccessAudit] Error verifying ownership:', error);
    return false;
  }
}

/**
 * Middleware helper to ensure user data isolation
 * Logs failed access attempts and returns appropriate error
 * Requirements: 13.3
 */
export async function ensureUserOwnership(
  userId: string,
  resource: DataResource,
  resourceId: string,
  action: DataAccessAction = 'read'
): Promise<ServiceResult<void>> {
  const isOwner = await verifyResourceOwnership(userId, resource, resourceId);
  
  if (!isOwner) {
    // Log the failed access attempt
    await dataAccessAuditService.logFailedAccess(
      userId,
      action,
      resource,
      resourceId,
      'User does not own this resource'
    );
    
    return {
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'You do not have access to this resource',
      },
    };
  }
  
  return { success: true };
}

export default dataAccessAuditService;
