/**
 * MCP Audit Service
 * 
 * Tracks all MCP tool calls for audit and learning purposes.
 * 
 * Requirements: 4.5
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';
import type { MCPAuditLog } from '@prisma/client';

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
export const LogToolCallSchema = z.object({
  agentId: z.string().min(1, 'Agent ID is required'),
  toolName: z.string().min(1, 'Tool name is required'),
  input: z.record(z.unknown()),
  output: z.record(z.unknown()),
  success: z.boolean(),
  duration: z.number().int().min(0),
});

export const GetAuditLogsSchema = z.object({
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  toolName: z.string().optional(),
  agentId: z.string().optional(),
  success: z.boolean().optional(),
  limit: z.number().int().min(1).max(1000).default(100),
});

export type LogToolCallInput = z.infer<typeof LogToolCallSchema>;
export type GetAuditLogsInput = z.infer<typeof GetAuditLogsSchema>;

// Audit log with summary type
export interface AuditLogSummary {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  averageDuration: number;
  byTool: Record<string, { count: number; successRate: number; avgDuration: number }>;
  byAgent: Record<string, { count: number; successRate: number }>;
}

export const mcpAuditService = {
  /**
   * Log a tool call for audit purposes
   * Requirement 4.5: Log all MCP tool calls
   */
  async logToolCall(
    userId: string,
    input: LogToolCallInput
  ): Promise<ServiceResult<MCPAuditLog>> {
    try {
      const validated = LogToolCallSchema.parse(input);

      const auditLog = await prisma.mCPAuditLog.create({
        data: {
          userId,
          agentId: validated.agentId,
          toolName: validated.toolName,
          input: validated.input as object,
          output: validated.output as object,
          success: validated.success,
          duration: validated.duration,
        },
      });

      return { success: true, data: auditLog };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid audit log data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to log tool call',
        },
      };
    }
  },

  /**
   * Get audit logs with filtering options
   * Requirement 4.5: Retrieve audit logs for analysis
   */
  async getAuditLogs(
    userId: string,
    options?: GetAuditLogsInput
  ): Promise<ServiceResult<MCPAuditLog[]>> {
    try {
      const validated = options ? GetAuditLogsSchema.parse(options) : { limit: 100 };

      const where: {
        userId: string;
        timestamp?: { gte?: Date; lte?: Date };
        toolName?: string;
        agentId?: string;
        success?: boolean;
      } = { userId };

      if (validated.startDate || validated.endDate) {
        where.timestamp = {};
        if (validated.startDate) {
          where.timestamp.gte = validated.startDate;
        }
        if (validated.endDate) {
          where.timestamp.lte = validated.endDate;
        }
      }

      if (validated.toolName) {
        where.toolName = validated.toolName;
      }

      if (validated.agentId) {
        where.agentId = validated.agentId;
      }

      if (validated.success !== undefined) {
        where.success = validated.success;
      }

      const logs = await prisma.mCPAuditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: validated.limit,
      });

      return { success: true, data: logs };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid filter options',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get audit logs',
        },
      };
    }
  },

  /**
   * Get audit log summary statistics
   * Useful for analyzing tool usage patterns
   */
  async getAuditSummary(
    userId: string,
    days: number = 30
  ): Promise<ServiceResult<AuditLogSummary>> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const logs = await prisma.mCPAuditLog.findMany({
        where: {
          userId,
          timestamp: { gte: startDate },
        },
      });

      if (logs.length === 0) {
        return {
          success: true,
          data: {
            totalCalls: 0,
            successfulCalls: 0,
            failedCalls: 0,
            averageDuration: 0,
            byTool: {},
            byAgent: {},
          },
        };
      }

      // Calculate overall stats
      const totalCalls = logs.length;
      const successfulCalls = logs.filter(l => l.success).length;
      const failedCalls = totalCalls - successfulCalls;
      const totalDuration = logs.reduce((sum, l) => sum + l.duration, 0);
      const averageDuration = totalDuration / totalCalls;

      // Group by tool
      const byTool: Record<string, { count: number; successCount: number; totalDuration: number }> = {};
      for (const log of logs) {
        if (!byTool[log.toolName]) {
          byTool[log.toolName] = { count: 0, successCount: 0, totalDuration: 0 };
        }
        byTool[log.toolName].count++;
        if (log.success) {
          byTool[log.toolName].successCount++;
        }
        byTool[log.toolName].totalDuration += log.duration;
      }

      const byToolSummary: Record<string, { count: number; successRate: number; avgDuration: number }> = {};
      for (const [tool, stats] of Object.entries(byTool)) {
        byToolSummary[tool] = {
          count: stats.count,
          successRate: (stats.successCount / stats.count) * 100,
          avgDuration: stats.totalDuration / stats.count,
        };
      }

      // Group by agent
      const byAgent: Record<string, { count: number; successCount: number }> = {};
      for (const log of logs) {
        if (!byAgent[log.agentId]) {
          byAgent[log.agentId] = { count: 0, successCount: 0 };
        }
        byAgent[log.agentId].count++;
        if (log.success) {
          byAgent[log.agentId].successCount++;
        }
      }

      const byAgentSummary: Record<string, { count: number; successRate: number }> = {};
      for (const [agent, stats] of Object.entries(byAgent)) {
        byAgentSummary[agent] = {
          count: stats.count,
          successRate: (stats.successCount / stats.count) * 100,
        };
      }

      return {
        success: true,
        data: {
          totalCalls,
          successfulCalls,
          failedCalls,
          averageDuration: Math.round(averageDuration * 100) / 100,
          byTool: byToolSummary,
          byAgent: byAgentSummary,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get audit summary',
        },
      };
    }
  },

  /**
   * Clean up old audit logs (older than specified days)
   * Useful for maintenance and storage management
   */
  async cleanupOldLogs(
    days: number = 90
  ): Promise<ServiceResult<{ deletedCount: number }>> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const result = await prisma.mCPAuditLog.deleteMany({
        where: {
          timestamp: { lt: cutoffDate },
        },
      });

      return {
        success: true,
        data: { deletedCount: result.count },
      };
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

export default mcpAuditService;
