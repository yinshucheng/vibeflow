/**
 * Settings Modification Log Service
 * 
 * Provides audit trail for all settings modification attempts.
 * Logs both successful and failed modification attempts for user review.
 * 
 * Requirements: 8.7
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';
import type { SettingsModificationLog } from '@prisma/client';
import type { ServiceResult } from './user.service';

// ============================================================================
// Types and Schemas
// ============================================================================

/**
 * Input for creating a settings modification log entry
 */
export interface CreateLogInput {
  userId: string;
  settingKey: string;
  oldValue: unknown;
  newValue: unknown;
  success: boolean;
  reason?: string;
}

/**
 * Options for querying settings modification logs
 */
export interface GetLogsOptions {
  settingKey?: string;
  startDate?: Date;
  endDate?: Date;
  successOnly?: boolean;
  failedOnly?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Summary of settings modifications
 */
export interface ModificationSummary {
  totalModifications: number;
  successfulModifications: number;
  failedModifications: number;
  modificationsByKey: Record<string, number>;
  recentModifications: SettingsModificationLog[];
}

// Validation schema for log query options
export const GetLogsOptionsSchema = z.object({
  settingKey: z.string().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  successOnly: z.boolean().optional(),
  failedOnly: z.boolean().optional(),
  limit: z.number().min(1).max(1000).optional(),
  offset: z.number().min(0).optional(),
});

// ============================================================================
// Settings Modification Log Service
// ============================================================================

export const settingsModificationLogService = {
  /**
   * Create a settings modification log entry
   * Requirements: 8.7
   * 
   * @param input - Log entry data
   * @returns The created log entry
   */
  async create(input: CreateLogInput): Promise<ServiceResult<SettingsModificationLog>> {
    try {
      const log = await prisma.settingsModificationLog.create({
        data: {
          userId: input.userId,
          settingKey: input.settingKey,
          oldValue: input.oldValue !== undefined ? JSON.parse(JSON.stringify(input.oldValue)) : null,
          newValue: input.newValue !== undefined ? JSON.parse(JSON.stringify(input.newValue)) : null,
          success: input.success,
          reason: input.reason,
        },
      });

      return { success: true, data: log };
    } catch (error) {
      // Log errors should not fail the main operation
      console.error('[SettingsModificationLogService] Failed to create log:', error);
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create settings modification log',
        },
      };
    }
  },

  /**
   * Log a successful settings modification
   * Requirements: 8.7
   */
  async logSuccess(
    userId: string,
    settingKey: string,
    oldValue: unknown,
    newValue: unknown
  ): Promise<ServiceResult<SettingsModificationLog>> {
    return this.create({
      userId,
      settingKey,
      oldValue,
      newValue,
      success: true,
    });
  },

  /**
   * Log a failed settings modification attempt
   * Requirements: 8.7
   */
  async logFailure(
    userId: string,
    settingKey: string,
    oldValue: unknown,
    newValue: unknown,
    reason: string
  ): Promise<ServiceResult<SettingsModificationLog>> {
    return this.create({
      userId,
      settingKey,
      oldValue,
      newValue,
      success: false,
      reason,
    });
  },

  /**
   * Log multiple settings modifications at once (batch)
   * Requirements: 8.7
   */
  async logBatch(inputs: CreateLogInput[]): Promise<ServiceResult<number>> {
    try {
      const result = await prisma.settingsModificationLog.createMany({
        data: inputs.map(input => ({
          userId: input.userId,
          settingKey: input.settingKey,
          oldValue: input.oldValue !== undefined ? JSON.parse(JSON.stringify(input.oldValue)) : null,
          newValue: input.newValue !== undefined ? JSON.parse(JSON.stringify(input.newValue)) : null,
          success: input.success,
          reason: input.reason,
        })),
      });

      return { success: true, data: result.count };
    } catch (error) {
      console.error('[SettingsModificationLogService] Failed to create batch logs:', error);
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create batch settings modification logs',
        },
      };
    }
  },

  /**
   * Get settings modification logs for a user
   * Requirements: 8.7
   */
  async getLogs(
    userId: string,
    options?: GetLogsOptions
  ): Promise<ServiceResult<SettingsModificationLog[]>> {
    try {
      const where: {
        userId: string;
        settingKey?: string;
        timestamp?: { gte?: Date; lte?: Date };
        success?: boolean;
      } = { userId };

      if (options?.settingKey) {
        where.settingKey = options.settingKey;
      }

      if (options?.startDate || options?.endDate) {
        where.timestamp = {};
        if (options.startDate) {
          where.timestamp.gte = options.startDate;
        }
        if (options.endDate) {
          where.timestamp.lte = options.endDate;
        }
      }

      if (options?.successOnly) {
        where.success = true;
      } else if (options?.failedOnly) {
        where.success = false;
      }

      const logs = await prisma.settingsModificationLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: options?.limit ?? 100,
        skip: options?.offset ?? 0,
      });

      return { success: true, data: logs };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get settings modification logs',
        },
      };
    }
  },

  /**
   * Get a single log entry by ID
   */
  async getById(
    userId: string,
    logId: string
  ): Promise<ServiceResult<SettingsModificationLog | null>> {
    try {
      const log = await prisma.settingsModificationLog.findFirst({
        where: {
          id: logId,
          userId, // Ensure user can only access their own logs
        },
      });

      return { success: true, data: log };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get settings modification log',
        },
      };
    }
  },

  /**
   * Get modification summary for a user
   * Requirements: 8.7
   */
  async getSummary(
    userId: string,
    options?: { startDate?: Date; endDate?: Date }
  ): Promise<ServiceResult<ModificationSummary>> {
    try {
      const where: {
        userId: string;
        timestamp?: { gte?: Date; lte?: Date };
      } = { userId };

      if (options?.startDate || options?.endDate) {
        where.timestamp = {};
        if (options.startDate) {
          where.timestamp.gte = options.startDate;
        }
        if (options.endDate) {
          where.timestamp.lte = options.endDate;
        }
      }

      // Get all logs for aggregation
      const logs = await prisma.settingsModificationLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
      });

      // Calculate summary
      const totalModifications = logs.length;
      const successfulModifications = logs.filter(l => l.success).length;
      const failedModifications = logs.filter(l => !l.success).length;

      // Group by setting key
      const modificationsByKey: Record<string, number> = {};
      for (const log of logs) {
        modificationsByKey[log.settingKey] = (modificationsByKey[log.settingKey] || 0) + 1;
      }

      // Get recent modifications (last 10)
      const recentModifications = logs.slice(0, 10);

      return {
        success: true,
        data: {
          totalModifications,
          successfulModifications,
          failedModifications,
          modificationsByKey,
          recentModifications,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get modification summary',
        },
      };
    }
  },

  /**
   * Get logs for a specific setting key
   * Requirements: 8.7
   */
  async getLogsForSetting(
    userId: string,
    settingKey: string,
    limit?: number
  ): Promise<ServiceResult<SettingsModificationLog[]>> {
    return this.getLogs(userId, { settingKey, limit });
  },

  /**
   * Get failed modification attempts
   * Requirements: 8.7
   */
  async getFailedAttempts(
    userId: string,
    options?: { startDate?: Date; endDate?: Date; limit?: number }
  ): Promise<ServiceResult<SettingsModificationLog[]>> {
    return this.getLogs(userId, {
      ...options,
      failedOnly: true,
    });
  },

  /**
   * Count total logs for a user
   */
  async countLogs(
    userId: string,
    options?: { settingKey?: string; successOnly?: boolean; failedOnly?: boolean }
  ): Promise<ServiceResult<number>> {
    try {
      const where: {
        userId: string;
        settingKey?: string;
        success?: boolean;
      } = { userId };

      if (options?.settingKey) {
        where.settingKey = options.settingKey;
      }

      if (options?.successOnly) {
        where.success = true;
      } else if (options?.failedOnly) {
        where.success = false;
      }

      const count = await prisma.settingsModificationLog.count({ where });

      return { success: true, data: count };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to count settings modification logs',
        },
      };
    }
  },

  /**
   * Delete old logs (for cleanup/maintenance)
   * Keeps logs for the specified number of days
   */
  async cleanupOldLogs(
    userId: string,
    keepDays: number = 90
  ): Promise<ServiceResult<number>> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - keepDays);

      const result = await prisma.settingsModificationLog.deleteMany({
        where: {
          userId,
          timestamp: {
            lt: cutoffDate,
          },
        },
      });

      return { success: true, data: result.count };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to cleanup old logs',
        },
      };
    }
  },
};

export default settingsModificationLogService;
