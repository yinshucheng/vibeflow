/**
 * Entertainment Service
 * 
 * Manages entertainment mode, quota tracking, and cooldown enforcement.
 * Entertainment mode allows users to access entertainment sites during non-work hours
 * with a daily quota limit.
 * 
 * Requirements: 5.7, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';
import type { DailyEntertainmentState, UserSettings } from '@prisma/client';
import { isWithinWorkHours } from './idle.service';
import type { WorkTimeSlot } from './user.service';

// ============================================================================
// Constants
// ============================================================================

const DAILY_RESET_HOUR = 4; // 04:00 AM - Requirements: 5.7
const MIN_QUOTA_MINUTES = 30;
const MAX_QUOTA_MINUTES = 480;
const MIN_COOLDOWN_MINUTES = 15;
const MAX_COOLDOWN_MINUTES = 120;
const DEFAULT_QUOTA_MINUTES = 120;
const DEFAULT_COOLDOWN_MINUTES = 30;

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

export interface EntertainmentStatus {
  isActive: boolean;
  sessionId: string | null;
  startTime: number | null;
  endTime: number | null;
  quotaTotal: number;      // minutes
  quotaUsed: number;       // minutes
  quotaRemaining: number;  // minutes
  cooldownEndTime: number | null;
  lastSessionEndTime: number | null;
  isWithinWorkTime: boolean;
  canStart: boolean;
  cannotStartReason: string | null;
}

export interface EntertainmentStartResult {
  success: boolean;
  sessionId?: string;
  endTime?: number;  // Unix timestamp
  error?: string;
}

export type EntertainmentStopReason = 'manual' | 'quota_exhausted' | 'work_time_start';

// ============================================================================
// Validation Schemas
// ============================================================================

export const UpdateEntertainmentSettingsSchema = z.object({
  entertainmentQuotaMinutes: z.number()
    .int()
    .min(MIN_QUOTA_MINUTES, `Quota must be at least ${MIN_QUOTA_MINUTES} minutes`)
    .max(MAX_QUOTA_MINUTES, `Quota must be at most ${MAX_QUOTA_MINUTES} minutes`)
    .optional(),
  entertainmentCooldownMinutes: z.number()
    .int()
    .min(MIN_COOLDOWN_MINUTES, `Cooldown must be at least ${MIN_COOLDOWN_MINUTES} minutes`)
    .max(MAX_COOLDOWN_MINUTES, `Cooldown must be at most ${MAX_COOLDOWN_MINUTES} minutes`)
    .optional(),
  entertainmentBlacklist: z.array(z.object({
    domain: z.string(),
    isPreset: z.boolean(),
    enabled: z.boolean(),
    addedAt: z.number(),
  })).optional(),
  entertainmentWhitelist: z.array(z.object({
    pattern: z.string(),
    description: z.string().optional(),
    isPreset: z.boolean(),
    enabled: z.boolean(),
    addedAt: z.number(),
  })).optional(),
});

export type UpdateEntertainmentSettingsInput = z.infer<typeof UpdateEntertainmentSettingsSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get today's date normalized to midnight, accounting for 04:00 AM reset
 */
function getTodayDate(): Date {
  const now = new Date();
  const today = new Date(now);
  
  if (now.getHours() < DAILY_RESET_HOUR) {
    today.setDate(today.getDate() - 1);
  }
  
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * Check if cooldown period has passed
 */
function isCooldownComplete(
  lastSessionEndTime: Date | null,
  cooldownMinutes: number
): boolean {
  if (!lastSessionEndTime) return true;
  
  const cooldownEndTime = new Date(lastSessionEndTime.getTime() + cooldownMinutes * 60 * 1000);
  return new Date() >= cooldownEndTime;
}

/**
 * Calculate cooldown end time
 */
function getCooldownEndTime(
  lastSessionEndTime: Date | null,
  cooldownMinutes: number
): number | null {
  if (!lastSessionEndTime) return null;
  
  const cooldownEnd = new Date(lastSessionEndTime.getTime() + cooldownMinutes * 60 * 1000);
  const now = new Date();
  
  if (now >= cooldownEnd) return null;
  
  return cooldownEnd.getTime();
}

// ============================================================================
// Entertainment Service
// ============================================================================

export const entertainmentService = {
  /**
   * Get entertainment status for a user
   * Requirements: 8.2
   */
  async getStatus(userId: string): Promise<ServiceResult<EntertainmentStatus>> {
    try {
      const today = getTodayDate();
      
      // Get user settings
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
      });
      
      const quotaTotal = settings?.entertainmentQuotaMinutes ?? DEFAULT_QUOTA_MINUTES;
      const cooldownMinutes = settings?.entertainmentCooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES;
      
      // Safely parse work time slots with validation
      let workTimeSlots: WorkTimeSlot[] = [];
      try {
        const rawSlots = settings?.workTimeSlots;
        if (Array.isArray(rawSlots)) {
          workTimeSlots = rawSlots as WorkTimeSlot[];
        } else if (rawSlots && typeof rawSlots === 'object') {
          // Handle case where it's stored as JSON
          workTimeSlots = JSON.parse(JSON.stringify(rawSlots)) as WorkTimeSlot[];
        }
      } catch (error) {
        console.warn('[EntertainmentService] Failed to parse workTimeSlots:', error);
        workTimeSlots = [];
      }
      
      // Get or create today's entertainment state
      let dailyState = await prisma.dailyEntertainmentState.findUnique({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
      });
      
      if (!dailyState) {
        dailyState = await prisma.dailyEntertainmentState.create({
          data: {
            userId,
            date: today,
            quotaUsedMinutes: 0,
            sessionCount: 0,
            sitesVisited: [],
          },
        });
      }
      
      const isActive = dailyState.activeSessionId !== null;
      const quotaUsed = dailyState.quotaUsedMinutes;
      const quotaRemaining = Math.max(0, quotaTotal - quotaUsed);
      
      // Safely check work hours with error handling
      let withinWorkTime = false;
      try {
        withinWorkTime = isWithinWorkHours(workTimeSlots);
      } catch (error) {
        console.warn('[EntertainmentService] Failed to check work hours:', error);
        withinWorkTime = false; // Default to false for safety
      }
      
      const cooldownEndTime = getCooldownEndTime(dailyState.lastSessionEndTime, cooldownMinutes);
      const cooldownComplete = isCooldownComplete(dailyState.lastSessionEndTime, cooldownMinutes);
      
      // Determine if can start and why not
      let canStart = true;
      let cannotStartReason: string | null = null;
      
      if (isActive) {
        canStart = false;
        cannotStartReason = 'session_already_active';
      } else if (withinWorkTime) {
        canStart = false;
        cannotStartReason = 'within_work_time';
      } else if (quotaRemaining <= 0) {
        canStart = false;
        cannotStartReason = 'quota_exhausted';
      } else if (!cooldownComplete) {
        canStart = false;
        cannotStartReason = 'cooldown_active';
      }
      
      // Calculate end time if session is active
      let endTime: number | null = null;
      if (isActive && dailyState.sessionStartTime) {
        const sessionStart = dailyState.sessionStartTime.getTime();
        const remainingMs = quotaRemaining * 60 * 1000;
        endTime = sessionStart + remainingMs;
      }
      
      return {
        success: true,
        data: {
          isActive,
          sessionId: dailyState.activeSessionId,
          startTime: dailyState.sessionStartTime?.getTime() ?? null,
          endTime,
          quotaTotal,
          quotaUsed,
          quotaRemaining,
          cooldownEndTime,
          lastSessionEndTime: dailyState.lastSessionEndTime?.getTime() ?? null,
          isWithinWorkTime: withinWorkTime,
          canStart,
          cannotStartReason,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get entertainment status',
        },
      };
    }
  },

  /**
   * Start entertainment mode
   * Requirements: 8.3, 5.2, 5.3
   */
  async startEntertainment(userId: string): Promise<ServiceResult<EntertainmentStartResult>> {
    try {
      const statusResult = await this.getStatus(userId);
      if (!statusResult.success || !statusResult.data) {
        return {
          success: false,
          error: statusResult.error,
        };
      }
      
      const status = statusResult.data;
      
      // Check if can start
      if (!status.canStart) {
        const errorMessages: Record<string, string> = {
          session_already_active: 'Entertainment mode is already active',
          within_work_time: '仅在非工作时间可用',
          quota_exhausted: '今日配额已用完',
          cooldown_active: `冷却中，还需等待 ${Math.ceil((status.cooldownEndTime! - Date.now()) / 60000)} 分钟`,
        };
        
        return {
          success: false,
          error: {
            code: status.cannotStartReason === 'within_work_time' ? 'ENT_WORK_TIME' :
                  status.cannotStartReason === 'quota_exhausted' ? 'ENT_QUOTA_EXHAUSTED' :
                  status.cannotStartReason === 'cooldown_active' ? 'ENT_COOLDOWN' :
                  'ENT_SESSION_ACTIVE',
            message: errorMessages[status.cannotStartReason!] || 'Cannot start entertainment mode',
          },
        };
      }
      
      const today = getTodayDate();
      const sessionId = crypto.randomUUID();
      const startTime = new Date();
      const endTime = startTime.getTime() + status.quotaRemaining * 60 * 1000;
      
      // Update daily state
      await prisma.dailyEntertainmentState.upsert({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
        update: {
          activeSessionId: sessionId,
          sessionStartTime: startTime,
          sessionCount: { increment: 1 },
        },
        create: {
          userId,
          date: today,
          activeSessionId: sessionId,
          sessionStartTime: startTime,
          quotaUsedMinutes: 0,
          sessionCount: 1,
          sitesVisited: [],
        },
      });
      
      return {
        success: true,
        data: {
          success: true,
          sessionId,
          endTime,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to start entertainment mode',
        },
      };
    }
  },

  /**
   * Stop entertainment mode
   * Requirements: 8.4, 5.9, 5.14
   */
  async stopEntertainment(
    userId: string,
    reason: EntertainmentStopReason = 'manual'
  ): Promise<ServiceResult<{ duration: number; quotaUsed: number }>> {
    try {
      const today = getTodayDate();
      
      const dailyState = await prisma.dailyEntertainmentState.findUnique({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
      });
      
      if (!dailyState || !dailyState.activeSessionId || !dailyState.sessionStartTime) {
        return {
          success: false,
          error: {
            code: 'SESSION_NOT_FOUND',
            message: 'No active entertainment session found',
          },
        };
      }
      
      const endTime = new Date();
      const durationMs = endTime.getTime() - dailyState.sessionStartTime.getTime();
      const durationMinutes = Math.ceil(durationMs / 60000);
      const newQuotaUsed = dailyState.quotaUsedMinutes + durationMinutes;
      
      // Update daily state
      await prisma.dailyEntertainmentState.update({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
        data: {
          activeSessionId: null,
          sessionStartTime: null,
          quotaUsedMinutes: newQuotaUsed,
          lastSessionEndTime: endTime,
        },
      });
      
      return {
        success: true,
        data: {
          duration: durationMinutes,
          quotaUsed: newQuotaUsed,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to stop entertainment mode',
        },
      };
    }
  },

  /**
   * Update quota usage (for syncing from clients)
   * Requirements: 8.5, 8.7
   */
  async updateQuotaUsage(
    userId: string,
    usedMinutes: number
  ): Promise<ServiceResult<{ quotaUsed: number; quotaRemaining: number }>> {
    try {
      const today = getTodayDate();
      
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
      });
      const quotaTotal = settings?.entertainmentQuotaMinutes ?? DEFAULT_QUOTA_MINUTES;
      
      const dailyState = await prisma.dailyEntertainmentState.upsert({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
        update: {
          quotaUsedMinutes: usedMinutes,
        },
        create: {
          userId,
          date: today,
          quotaUsedMinutes: usedMinutes,
          sessionCount: 0,
          sitesVisited: [],
        },
      });
      
      return {
        success: true,
        data: {
          quotaUsed: dailyState.quotaUsedMinutes,
          quotaRemaining: Math.max(0, quotaTotal - dailyState.quotaUsedMinutes),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update quota usage',
        },
      };
    }
  },

  /**
   * Reset daily quotas for all users (called at 04:00 AM)
   * Requirements: 5.7
   * 
   * This method:
   * 1. Ends any active sessions from yesterday
   * 2. Clears cooldown status for the new day
   * 3. Creates fresh daily states for today
   */
  async resetDailyQuotas(): Promise<ServiceResult<{ endedSessions: number; resetUsers: number }>> {
    try {
      const today = getTodayDate();
      
      // End any active sessions from yesterday
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const activeSessionsYesterday = await prisma.dailyEntertainmentState.findMany({
        where: {
          date: yesterday,
          activeSessionId: { not: null },
        },
      });
      
      let endedSessions = 0;
      for (const state of activeSessionsYesterday) {
        if (state.sessionStartTime) {
          const durationMs = today.getTime() - state.sessionStartTime.getTime();
          const durationMinutes = Math.ceil(durationMs / 60000);
          
          await prisma.dailyEntertainmentState.update({
            where: { id: state.id },
            data: {
              activeSessionId: null,
              sessionStartTime: null,
              quotaUsedMinutes: state.quotaUsedMinutes + durationMinutes,
              lastSessionEndTime: today,
            },
          });
          endedSessions++;
        }
      }
      
      // Get all users who had entertainment states yesterday
      // Their cooldown status should be cleared for the new day
      const usersWithYesterdayState = await prisma.dailyEntertainmentState.findMany({
        where: {
          date: yesterday,
        },
        select: {
          userId: true,
        },
        distinct: ['userId'],
      });
      
      // Create fresh daily states for today (quota = 0, no cooldown)
      // This ensures users start fresh each day
      let resetUsers = 0;
      for (const { userId } of usersWithYesterdayState) {
        await prisma.dailyEntertainmentState.upsert({
          where: {
            userId_date: {
              userId,
              date: today,
            },
          },
          update: {
            // If state already exists for today, don't modify it
          },
          create: {
            userId,
            date: today,
            quotaUsedMinutes: 0,
            sessionCount: 0,
            sitesVisited: [],
            // No lastSessionEndTime - cooldown is cleared for new day
          },
        });
        resetUsers++;
      }
      
      console.log(`[EntertainmentService] Daily reset complete: ended ${endedSessions} sessions, reset ${resetUsers} users`);
      
      return {
        success: true,
        data: { endedSessions, resetUsers },
      };
    } catch (error) {
      console.error('[EntertainmentService] Failed to reset daily quotas:', error);
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to reset daily quotas',
        },
      };
    }
  },

  /**
   * Reset daily quota for a specific user
   * Requirements: 5.7
   * 
   * This is useful for:
   * - Manual reset by admin
   * - Testing purposes
   * - When a user's quota needs to be reset mid-day
   */
  async resetUserDailyQuota(userId: string): Promise<ServiceResult<DailyEntertainmentState>> {
    try {
      const today = getTodayDate();
      
      // First, end any active session
      const existingState = await prisma.dailyEntertainmentState.findUnique({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
      });
      
      if (existingState?.activeSessionId) {
        // End the active session first
        await this.stopEntertainment(userId, 'manual');
      }
      
      // Reset the daily state
      const resetState = await prisma.dailyEntertainmentState.upsert({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
        update: {
          quotaUsedMinutes: 0,
          activeSessionId: null,
          sessionStartTime: null,
          lastSessionEndTime: null, // Clear cooldown
          sessionCount: 0,
          sitesVisited: [],
        },
        create: {
          userId,
          date: today,
          quotaUsedMinutes: 0,
          sessionCount: 0,
          sitesVisited: [],
        },
      });
      
      console.log(`[EntertainmentService] Reset daily quota for user ${userId}`);
      
      return {
        success: true,
        data: resetState,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to reset user daily quota',
        },
      };
    }
  },

  /**
   * Get the next reset time (04:00 AM)
   * Requirements: 5.7
   */
  getNextResetTime(): Date {
    const now = new Date();
    const nextReset = new Date(now);
    
    // Set to today's reset time
    nextReset.setHours(DAILY_RESET_HOUR, 0, 0, 0);
    
    // If we've already passed today's reset time, move to tomorrow
    if (now >= nextReset) {
      nextReset.setDate(nextReset.getDate() + 1);
    }
    
    return nextReset;
  },

  /**
   * Get milliseconds until next reset
   * Requirements: 5.7
   */
  getMillisecondsUntilReset(): number {
    const nextReset = this.getNextResetTime();
    return nextReset.getTime() - Date.now();
  },

  /**
   * Check if it's time for daily reset
   * Requirements: 5.7
   */
  isResetTime(): boolean {
    const now = new Date();
    return now.getHours() === DAILY_RESET_HOUR && now.getMinutes() === 0;
  },

  /**
   * Check and auto-end expired entertainment sessions
   * Requirements: 8.8
   */
  async checkAndEndExpiredSessions(): Promise<ServiceResult<number>> {
    try {
      const today = getTodayDate();
      
      // Find all active sessions
      const activeSessions = await prisma.dailyEntertainmentState.findMany({
        where: {
          date: today,
          activeSessionId: { not: null },
        },
        include: {
          user: {
            include: {
              settings: true,
            },
          },
        },
      });
      
      let endedCount = 0;
      
      for (const state of activeSessions) {
        if (!state.sessionStartTime) continue;
        
        const quotaTotal = state.user.settings?.entertainmentQuotaMinutes ?? DEFAULT_QUOTA_MINUTES;
        const quotaRemaining = Math.max(0, quotaTotal - state.quotaUsedMinutes);
        
        const now = new Date();
        const sessionDurationMs = now.getTime() - state.sessionStartTime.getTime();
        const sessionDurationMinutes = sessionDurationMs / 60000;
        
        // Check if quota would be exhausted
        if (sessionDurationMinutes >= quotaRemaining) {
          await this.stopEntertainment(state.userId, 'quota_exhausted');
          endedCount++;
        }
      }
      
      return {
        success: true,
        data: endedCount,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to check expired sessions',
        },
      };
    }
  },

  /**
   * Add visited site to today's entertainment state
   */
  async addVisitedSite(userId: string, domain: string): Promise<ServiceResult<void>> {
    try {
      const today = getTodayDate();
      
      const dailyState = await prisma.dailyEntertainmentState.findUnique({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
      });
      
      if (!dailyState) {
        return { success: true };
      }
      
      // Add domain if not already in list
      if (!dailyState.sitesVisited.includes(domain)) {
        await prisma.dailyEntertainmentState.update({
          where: { id: dailyState.id },
          data: {
            sitesVisited: {
              push: domain,
            },
          },
        });
      }
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to add visited site',
        },
      };
    }
  },

  /**
   * Update entertainment settings
   * Requirements: 9.5, 7.11, 7.12
   */
  async updateSettings(
    userId: string,
    input: UpdateEntertainmentSettingsInput
  ): Promise<ServiceResult<UserSettings>> {
    try {
      const validated = UpdateEntertainmentSettingsSchema.parse(input);
      
      // Check if within work time (settings can only be modified outside work time)
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
      });
      
      // Safely parse work time slots with validation
      let workTimeSlots: WorkTimeSlot[] = [];
      try {
        const rawSlots = settings?.workTimeSlots;
        if (Array.isArray(rawSlots)) {
          workTimeSlots = rawSlots as WorkTimeSlot[];
        } else if (rawSlots && typeof rawSlots === 'object') {
          workTimeSlots = JSON.parse(JSON.stringify(rawSlots)) as WorkTimeSlot[];
        }
      } catch (error) {
        console.warn('[EntertainmentService] Failed to parse workTimeSlots in updateSettings:', error);
        workTimeSlots = [];
      }
      
      // Safely check work hours with error handling
      let withinWorkTime = false;
      try {
        withinWorkTime = isWithinWorkHours(workTimeSlots);
      } catch (error) {
        console.warn('[EntertainmentService] Failed to check work hours in updateSettings:', error);
        withinWorkTime = false; // Default to false for safety
      }
      
      if (withinWorkTime) {
        return {
          success: false,
          error: {
            code: 'WORK_TIME_RESTRICTION',
            message: '工作时间内无法修改娱乐网站设置',
          },
        };
      }
      
      const updateData: Record<string, unknown> = {};
      
      if (validated.entertainmentQuotaMinutes !== undefined) {
        updateData.entertainmentQuotaMinutes = validated.entertainmentQuotaMinutes;
      }
      if (validated.entertainmentCooldownMinutes !== undefined) {
        updateData.entertainmentCooldownMinutes = validated.entertainmentCooldownMinutes;
      }
      if (validated.entertainmentBlacklist !== undefined) {
        updateData.entertainmentBlacklist = JSON.parse(JSON.stringify(validated.entertainmentBlacklist));
      }
      if (validated.entertainmentWhitelist !== undefined) {
        updateData.entertainmentWhitelist = JSON.parse(JSON.stringify(validated.entertainmentWhitelist));
      }
      
      const updatedSettings = await prisma.userSettings.update({
        where: { userId },
        data: updateData,
      });
      
      return {
        success: true,
        data: updatedSettings,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid settings data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update entertainment settings',
        },
      };
    }
  },

  /**
   * Get entertainment history for stats
   */
  async getHistory(
    userId: string,
    days: number = 7
  ): Promise<ServiceResult<DailyEntertainmentState[]>> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);
      
      const history = await prisma.dailyEntertainmentState.findMany({
        where: {
          userId,
          date: { gte: startDate },
        },
        orderBy: {
          date: 'desc',
        },
      });
      
      return {
        success: true,
        data: history,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get entertainment history',
        },
      };
    }
  },

  /**
   * Get configuration constants
   */
  getConfig() {
    return {
      dailyResetHour: DAILY_RESET_HOUR,
      minQuotaMinutes: MIN_QUOTA_MINUTES,
      maxQuotaMinutes: MAX_QUOTA_MINUTES,
      minCooldownMinutes: MIN_COOLDOWN_MINUTES,
      maxCooldownMinutes: MAX_COOLDOWN_MINUTES,
      defaultQuotaMinutes: DEFAULT_QUOTA_MINUTES,
      defaultCooldownMinutes: DEFAULT_COOLDOWN_MINUTES,
    };
  },
};

export default entertainmentService;
