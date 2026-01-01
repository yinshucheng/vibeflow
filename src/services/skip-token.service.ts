/**
 * Skip Token Service
 * 
 * Manages skip/delay tokens for focus enforcement interventions.
 * Users have a limited number of tokens per day to skip or delay
 * focus reminders.
 * 
 * Requirements: 4.4, 4.7, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';
import type { SkipTokenUsage } from '@prisma/client';
import type { ServiceResult } from './user.service';

// ============================================================================
// Types and Schemas
// ============================================================================

/**
 * Skip token action type
 */
export type SkipTokenAction = 'skip' | 'delay';

/**
 * Skip token consumption result
 */
export interface SkipTokenConsumeResult {
  success: boolean;
  remaining: number;
  action: SkipTokenAction;
  delayMinutes?: number;
}

/**
 * Skip token status for current day
 */
export interface SkipTokenStatus {
  remaining: number;
  dailyLimit: number;
  usedToday: number;
  maxDelayMinutes: number;
  enforcementMode: 'strict' | 'gentle';
}

/**
 * Skip token history entry with date info
 */
export interface SkipTokenHistoryEntry {
  date: Date;
  usedCount: number;
  dailyLimit: number;
}

/**
 * Mode-specific token limits
 * Requirements: 4.4, 4.7
 */
export const MODE_TOKEN_LIMITS = {
  strict: {
    dailyLimit: 1,
    maxDelayMinutes: 5,
  },
  gentle: {
    dailyLimit: 3, // Can be 3-5, default 3
    maxDelayMinutes: 15,
  },
} as const;

// Validation schemas
export const ConsumeSkipTokenSchema = z.object({
  action: z.enum(['skip', 'delay']),
  delayMinutes: z.number().min(1).max(30).optional(),
});

export type ConsumeSkipTokenInput = z.infer<typeof ConsumeSkipTokenSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the start of today in local time
 */
function getStartOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * Check if a date is today
 */
function isToday(date: Date): boolean {
  const today = getStartOfToday();
  const compareDate = new Date(date);
  compareDate.setHours(0, 0, 0, 0);
  return today.getTime() === compareDate.getTime();
}

/**
 * Get effective daily limit based on enforcement mode
 * Requirements: 4.4, 4.7
 */
function getEffectiveDailyLimit(
  enforcementMode: 'strict' | 'gentle',
  userConfiguredLimit: number
): number {
  const modeLimit = MODE_TOKEN_LIMITS[enforcementMode].dailyLimit;
  
  // In strict mode, always use the strict limit (1)
  if (enforcementMode === 'strict') {
    return modeLimit;
  }
  
  // In gentle mode, use user configured limit but cap at mode max
  return Math.min(userConfiguredLimit, 5); // Gentle mode allows 3-5
}

/**
 * Get effective max delay based on enforcement mode
 * Requirements: 4.4, 4.7
 */
function getEffectiveMaxDelay(
  enforcementMode: 'strict' | 'gentle',
  userConfiguredDelay: number
): number {
  const modeMaxDelay = MODE_TOKEN_LIMITS[enforcementMode].maxDelayMinutes;
  
  // Cap at mode-specific maximum
  return Math.min(userConfiguredDelay, modeMaxDelay);
}

// ============================================================================
// Skip Token Service
// ============================================================================

export const skipTokenService = {
  /**
   * Get current skip token status for a user
   * Requirements: 5.4, 5.5
   */
  async getStatus(userId: string): Promise<ServiceResult<SkipTokenStatus>> {
    try {
      const today = getStartOfToday();

      // Get user settings for limits and mode
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
        select: {
          skipTokenDailyLimit: true,
          skipTokenMaxDelay: true,
          enforcementMode: true,
        },
      });

      const enforcementMode = (settings?.enforcementMode as 'strict' | 'gentle') ?? 'gentle';
      const userDailyLimit = settings?.skipTokenDailyLimit ?? 3;
      const userMaxDelay = settings?.skipTokenMaxDelay ?? 15;

      // Apply mode-specific limits
      const dailyLimit = getEffectiveDailyLimit(enforcementMode, userDailyLimit);
      const maxDelayMinutes = getEffectiveMaxDelay(enforcementMode, userMaxDelay);

      // Get today's usage
      const usage = await prisma.skipTokenUsage.findUnique({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
      });

      const usedToday = usage?.usedCount ?? 0;
      const remaining = Math.max(0, dailyLimit - usedToday);

      return {
        success: true,
        data: {
          remaining,
          dailyLimit,
          usedToday,
          maxDelayMinutes,
          enforcementMode,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get skip token status',
        },
      };
    }
  },

  /**
   * Consume a skip token for skip or delay action
   * Requirements: 5.2, 5.3, 5.5
   */
  async consume(
    userId: string,
    input: ConsumeSkipTokenInput
  ): Promise<ServiceResult<SkipTokenConsumeResult>> {
    try {
      const validated = ConsumeSkipTokenSchema.parse(input);
      const today = getStartOfToday();

      // Get current status to check limits
      const statusResult = await this.getStatus(userId);
      if (!statusResult.success || !statusResult.data) {
        return {
          success: false,
          error: statusResult.error ?? {
            code: 'INTERNAL_ERROR',
            message: 'Failed to get token status',
          },
        };
      }

      const { remaining, maxDelayMinutes, enforcementMode } = statusResult.data;

      // Check if tokens are exhausted (Requirements 5.5)
      if (remaining <= 0) {
        return {
          success: true,
          data: {
            success: false,
            remaining: 0,
            action: validated.action,
          },
        };
      }

      // Validate delay minutes if action is delay
      let effectiveDelayMinutes: number | undefined;
      if (validated.action === 'delay') {
        effectiveDelayMinutes = Math.min(
          validated.delayMinutes ?? maxDelayMinutes,
          maxDelayMinutes
        );
      }

      // Consume the token - upsert to handle first usage of the day
      const updated = await prisma.skipTokenUsage.upsert({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
        update: {
          usedCount: { increment: 1 },
        },
        create: {
          userId,
          date: today,
          usedCount: 1,
        },
      });

      // Calculate new remaining count
      const dailyLimit = getEffectiveDailyLimit(
        enforcementMode,
        statusResult.data.dailyLimit
      );
      const newRemaining = Math.max(0, dailyLimit - updated.usedCount);

      return {
        success: true,
        data: {
          success: true,
          remaining: newRemaining,
          action: validated.action,
          delayMinutes: effectiveDelayMinutes,
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
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to consume skip token',
        },
      };
    }
  },

  /**
   * Check if user can skip (has remaining tokens)
   * Requirements: 5.5
   */
  async canSkip(userId: string): Promise<ServiceResult<boolean>> {
    try {
      const statusResult = await this.getStatus(userId);
      if (!statusResult.success || !statusResult.data) {
        return {
          success: false,
          error: statusResult.error ?? {
            code: 'INTERNAL_ERROR',
            message: 'Failed to check skip availability',
          },
        };
      }

      return {
        success: true,
        data: statusResult.data.remaining > 0,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to check skip availability',
        },
      };
    }
  },

  /**
   * Get skip token usage history for a date range
   * Requirements: 5.7
   */
  async getHistory(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ServiceResult<SkipTokenHistoryEntry[]>> {
    try {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);

      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      // Get user settings for daily limit context
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
        select: {
          skipTokenDailyLimit: true,
          enforcementMode: true,
        },
      });

      const enforcementMode = (settings?.enforcementMode as 'strict' | 'gentle') ?? 'gentle';
      const userDailyLimit = settings?.skipTokenDailyLimit ?? 3;
      const dailyLimit = getEffectiveDailyLimit(enforcementMode, userDailyLimit);

      // Get usage records
      const usageRecords = await prisma.skipTokenUsage.findMany({
        where: {
          userId,
          date: {
            gte: start,
            lte: end,
          },
        },
        orderBy: { date: 'desc' },
      });

      // Convert to history entries
      const history: SkipTokenHistoryEntry[] = usageRecords.map((record) => ({
        date: record.date,
        usedCount: record.usedCount,
        dailyLimit,
      }));

      return { success: true, data: history };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get skip token history',
        },
      };
    }
  },

  /**
   * Reset tokens for a specific date (for testing or admin purposes)
   * Requirements: 5.6 (midnight reset is automatic via date-based records)
   */
  async resetForDate(userId: string, date: Date): Promise<ServiceResult<void>> {
    try {
      const normalizedDate = new Date(date);
      normalizedDate.setHours(0, 0, 0, 0);

      await prisma.skipTokenUsage.deleteMany({
        where: {
          userId,
          date: normalizedDate,
        },
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to reset skip tokens',
        },
      };
    }
  },

  /**
   * Get usage for a specific date
   */
  async getUsageForDate(
    userId: string,
    date: Date
  ): Promise<ServiceResult<SkipTokenUsage | null>> {
    try {
      const normalizedDate = new Date(date);
      normalizedDate.setHours(0, 0, 0, 0);

      const usage = await prisma.skipTokenUsage.findUnique({
        where: {
          userId_date: {
            userId,
            date: normalizedDate,
          },
        },
      });

      return { success: true, data: usage };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get usage for date',
        },
      };
    }
  },
};

export default skipTokenService;
