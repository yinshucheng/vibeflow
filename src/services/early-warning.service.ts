/**
 * Early Warning Service
 * 
 * Monitors daily progress and sends notifications when the user is falling behind
 * their expected pace to meet their daily pomodoro goal.
 * 
 * Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 26.1.1-26.1.6
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';
import { progressCalculationService } from './progress-calculation.service';
import type { PressureLevel } from './progress-calculation.service';

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

// Early warning configuration (Requirements: 26.1.1-26.1.6)
export interface EarlyWarningConfig {
  enabled: boolean;
  interval: number; // check interval in minutes (30, 60, 120)
  threshold: number; // warning threshold percentage (50, 60, 70, 80)
  method: string[]; // notification methods: browser_notification, desktop_notification
  quietStart: string | null; // quiet hours start "HH:mm" format
  quietEnd: string | null; // quiet hours end "HH:mm" format
}

// Early warning check result (Requirements: 26.1, 26.2, 26.3)
export interface EarlyWarningCheckResult {
  shouldWarn: boolean;
  isBehind: boolean;
  currentProgress: number; // percentage
  expectedProgress: number; // percentage
  gap: number; // pomodoros behind
  pressureLevel: PressureLevel;
  message: string;
  isInQuietHours: boolean;
}

// Early warning notification data (Requirements: 26.3, 26.4)
export interface EarlyWarningNotification {
  title: string;
  body: string;
  gap: number;
  actions: EarlyWarningAction[];
}

// Quick actions for early warning (Requirements: 26.4)
export interface EarlyWarningAction {
  id: string;
  label: string;
  action: 'start_pomodoro' | 'view_suggestions';
}

// Update config input schema (Requirements: 26.1.1-26.1.6)
export const UpdateEarlyWarningConfigSchema = z.object({
  enabled: z.boolean().optional(),
  interval: z.number().refine(val => [30, 60, 120].includes(val), {
    message: 'Interval must be 30, 60, or 120 minutes',
  }).optional(),
  threshold: z.number().refine(val => [50, 60, 70, 80].includes(val), {
    message: 'Threshold must be 50, 60, 70, or 80 percent',
  }).optional(),
  method: z.array(z.enum(['browser_notification', 'desktop_notification'])).optional(),
  quietStart: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format').nullable().optional(),
  quietEnd: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format').nullable().optional(),
});

export type UpdateEarlyWarningConfigInput = z.infer<typeof UpdateEarlyWarningConfigSchema>;

// Default configuration (Requirements: 26.1.6)
const DEFAULT_CONFIG: EarlyWarningConfig = {
  enabled: true,
  interval: 60,
  threshold: 70,
  method: ['browser_notification'],
  quietStart: null,
  quietEnd: null,
};

// Daily reset hour (same as other services)
const DAILY_RESET_HOUR = 4;

/**
 * Parse time string "HH:mm" to minutes since midnight
 */
function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Get current time in minutes since midnight
 */
function getCurrentTimeMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Check if current time is within quiet hours
 * Requirements: 26.1.5
 */
function isInQuietHours(quietStart: string | null, quietEnd: string | null): boolean {
  if (!quietStart || !quietEnd) {
    return false;
  }

  const currentMinutes = getCurrentTimeMinutes();
  const startMinutes = parseTimeToMinutes(quietStart);
  const endMinutes = parseTimeToMinutes(quietEnd);

  // Handle overnight quiet hours (e.g., 22:00 - 06:00)
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  // Normal quiet hours (e.g., 12:00 - 13:00)
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

/**
 * Get today's date normalized to midnight
 * Accounts for the 04:00 AM reset time
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
 * Calculate expected progress percentage based on elapsed work time
 * Requirements: 26.1
 */
function calculateExpectedProgress(
  elapsedWorkMinutes: number,
  totalWorkMinutes: number
): number {
  if (totalWorkMinutes <= 0) return 100;
  return Math.min(100, Math.round((elapsedWorkMinutes / totalWorkMinutes) * 100));
}

/**
 * Generate warning message based on gap
 * Requirements: 26.3
 */
function generateWarningMessage(gap: number, pressureLevel: PressureLevel): string {
  if (gap <= 0) {
    return 'You\'re on track! Keep up the good work.';
  }

  const pomodoroText = gap === 1 ? 'pomodoro' : 'pomodoros';

  switch (pressureLevel) {
    case 'moderate':
      return `You're ${gap} ${pomodoroText} behind schedule. Stay focused!`;
    case 'high':
      return `You're ${gap} ${pomodoroText} behind. Pick up the pace to meet your goal!`;
    case 'critical':
      return `You're ${gap} ${pomodoroText} behind. Your daily goal is at risk!`;
    default:
      return `You're ${gap} ${pomodoroText} behind schedule.`;
  }
}

export const earlyWarningService = {
  /**
   * Get early warning configuration for a user
   * Requirements: 26.1.1-26.1.6
   */
  async getConfig(userId: string): Promise<ServiceResult<EarlyWarningConfig>> {
    try {
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
      });

      if (!settings) {
        return { success: true, data: DEFAULT_CONFIG };
      }

      // Access fields using bracket notation to avoid TypeScript caching issues
      const settingsAny = settings as Record<string, unknown>;

      return {
        success: true,
        data: {
          enabled: (settingsAny['earlyWarningEnabled'] as boolean) ?? DEFAULT_CONFIG.enabled,
          interval: (settingsAny['earlyWarningInterval'] as number) ?? DEFAULT_CONFIG.interval,
          threshold: (settingsAny['earlyWarningThreshold'] as number) ?? DEFAULT_CONFIG.threshold,
          method: (settingsAny['earlyWarningMethod'] as string[]) ?? DEFAULT_CONFIG.method,
          quietStart: (settingsAny['earlyWarningQuietStart'] as string | null) ?? DEFAULT_CONFIG.quietStart,
          quietEnd: (settingsAny['earlyWarningQuietEnd'] as string | null) ?? DEFAULT_CONFIG.quietEnd,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get early warning config',
        },
      };
    }
  },

  /**
   * Update early warning configuration
   * Requirements: 26.1.1-26.1.6
   */
  async updateConfig(
    userId: string,
    input: UpdateEarlyWarningConfigInput
  ): Promise<ServiceResult<EarlyWarningConfig>> {
    try {
      const validated = UpdateEarlyWarningConfigSchema.parse(input);

      const updateData: Record<string, unknown> = {};
      
      if (validated.enabled !== undefined) {
        updateData.earlyWarningEnabled = validated.enabled;
      }
      if (validated.interval !== undefined) {
        updateData.earlyWarningInterval = validated.interval;
      }
      if (validated.threshold !== undefined) {
        updateData.earlyWarningThreshold = validated.threshold;
      }
      if (validated.method !== undefined) {
        updateData.earlyWarningMethod = validated.method;
      }
      if (validated.quietStart !== undefined) {
        updateData.earlyWarningQuietStart = validated.quietStart;
      }
      if (validated.quietEnd !== undefined) {
        updateData.earlyWarningQuietEnd = validated.quietEnd;
      }

      const settings = await prisma.userSettings.upsert({
        where: { userId },
        update: updateData,
        create: {
          userId,
          ...updateData,
        },
      });

      // Access fields using bracket notation to avoid TypeScript caching issues
      const settingsAny = settings as Record<string, unknown>;

      return {
        success: true,
        data: {
          enabled: (settingsAny['earlyWarningEnabled'] as boolean) ?? DEFAULT_CONFIG.enabled,
          interval: (settingsAny['earlyWarningInterval'] as number) ?? DEFAULT_CONFIG.interval,
          threshold: (settingsAny['earlyWarningThreshold'] as number) ?? DEFAULT_CONFIG.threshold,
          method: (settingsAny['earlyWarningMethod'] as string[]) ?? DEFAULT_CONFIG.method,
          quietStart: (settingsAny['earlyWarningQuietStart'] as string | null) ?? DEFAULT_CONFIG.quietStart,
          quietEnd: (settingsAny['earlyWarningQuietEnd'] as string | null) ?? DEFAULT_CONFIG.quietEnd,
        },
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid early warning configuration',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update early warning config',
        },
      };
    }
  },

  /**
   * Check if user is falling behind and should receive a warning
   * Requirements: 26.1, 26.2, 26.3, 26.4, 26.5
   */
  async checkProgress(userId: string): Promise<ServiceResult<EarlyWarningCheckResult>> {
    try {
      // Get early warning config
      const configResult = await this.getConfig(userId);
      if (!configResult.success || !configResult.data) {
        return {
          success: false,
          error: configResult.error,
        };
      }
      const config = configResult.data;

      // Check if early warning is enabled
      if (!config.enabled) {
        return {
          success: true,
          data: {
            shouldWarn: false,
            isBehind: false,
            currentProgress: 0,
            expectedProgress: 0,
            gap: 0,
            pressureLevel: 'on_track',
            message: 'Early warning is disabled',
            isInQuietHours: false,
          },
        };
      }

      // Check if in quiet hours (Requirements: 26.1.5)
      const inQuietHours = isInQuietHours(config.quietStart, config.quietEnd);

      // Get daily progress
      const progressResult = await progressCalculationService.getDailyProgress(userId);
      if (!progressResult.success || !progressResult.data) {
        return {
          success: false,
          error: progressResult.error,
        };
      }
      const progress = progressResult.data;

      // Calculate current progress percentage
      const currentProgress = progress.completionPercentage;

      // Calculate expected progress based on elapsed work time
      // We use the ratio of (total work time - remaining work time) / total work time
      const totalWorkMinutes = progress.remainingWorkMinutes + 
        (progress.completedPomodoros * 25); // Approximate elapsed time
      const elapsedWorkMinutes = totalWorkMinutes - progress.remainingWorkMinutes;
      const expectedProgress = calculateExpectedProgress(elapsedWorkMinutes, totalWorkMinutes);

      // Calculate gap in pomodoros (Requirements: 26.3)
      const expectedPomodoros = Math.round((expectedProgress / 100) * progress.targetPomodoros);
      const gap = Math.max(0, expectedPomodoros - progress.completedPomodoros);

      // Determine if user is behind (Requirements: 26.2)
      const isBehind = currentProgress < (expectedProgress * config.threshold / 100);

      // Generate message
      const message = generateWarningMessage(gap, progress.pressureLevel);

      // Determine if we should warn (Requirements: 26.5)
      // Don't warn if in quiet hours or if not behind threshold
      const shouldWarn = isBehind && !inQuietHours && gap > 0;

      return {
        success: true,
        data: {
          shouldWarn,
          isBehind,
          currentProgress,
          expectedProgress,
          gap,
          pressureLevel: progress.pressureLevel,
          message,
          isInQuietHours: inQuietHours,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to check progress',
        },
      };
    }
  },

  /**
   * Generate notification data for early warning
   * Requirements: 26.3, 26.4
   */
  async generateNotification(userId: string): Promise<ServiceResult<EarlyWarningNotification | null>> {
    try {
      const checkResult = await this.checkProgress(userId);
      if (!checkResult.success || !checkResult.data) {
        return {
          success: false,
          error: checkResult.error,
        };
      }

      const check = checkResult.data;

      // Don't generate notification if no warning needed
      if (!check.shouldWarn) {
        return { success: true, data: null };
      }

      // Generate notification (Requirements: 26.3, 26.4)
      const notification: EarlyWarningNotification = {
        title: '⏰ Falling Behind',
        body: check.message,
        gap: check.gap,
        actions: [
          {
            id: 'start_pomodoro',
            label: 'Start Pomodoro Now',
            action: 'start_pomodoro',
          },
          {
            id: 'view_suggestions',
            label: 'View Suggestions',
            action: 'view_suggestions',
          },
        ],
      };

      return { success: true, data: notification };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to generate notification',
        },
      };
    }
  },

  /**
   * Get the next check time based on interval
   * Requirements: 26.1.2
   */
  async getNextCheckTime(userId: string): Promise<ServiceResult<Date>> {
    try {
      const configResult = await this.getConfig(userId);
      if (!configResult.success || !configResult.data) {
        return {
          success: false,
          error: configResult.error,
        };
      }

      const config = configResult.data;
      const now = new Date();
      const nextCheck = new Date(now.getTime() + config.interval * 60 * 1000);

      return { success: true, data: nextCheck };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get next check time',
        },
      };
    }
  },

  /**
   * Check if it's time to perform a progress check
   * Based on the configured interval
   * Requirements: 26.1.2
   */
  shouldCheckNow(lastCheckTime: Date | null, intervalMinutes: number): boolean {
    if (!lastCheckTime) {
      return true;
    }

    const now = new Date();
    const elapsedMinutes = (now.getTime() - lastCheckTime.getTime()) / (1000 * 60);
    return elapsedMinutes >= intervalMinutes;
  },

  // Export helper functions for testing
  isInQuietHours,
  calculateExpectedProgress,
  generateWarningMessage,
};

export default earlyWarningService;
