import { z } from 'zod';
import prisma from '@/lib/prisma';
import type { SleepExemption } from '@prisma/client';

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

// Sleep enforcement app type (Requirements: 10.1, 10.2, 10.3, 10.4)
export interface SleepEnforcementApp {
  bundleId: string;
  name: string;
  isPreset: boolean;
}

// Sleep time configuration type (Requirements: 9.1, 9.2, 9.3)
export interface SleepTimeConfig {
  enabled: boolean;
  startTime: string; // "HH:mm" format, e.g., "23:00"
  endTime: string;   // "HH:mm" format, e.g., "07:00"
  enforcementApps: SleepEnforcementApp[];
  snoozeLimit: number; // max snoozes per night, default 2
  snoozeDuration: number; // minutes, default 30
}

// Sleep exemption type (Requirements: 14.1, 14.2)
export type SleepExemptionType = 'snooze' | 'focus_override';

// Validation schemas
export const SleepEnforcementAppSchema = z.object({
  bundleId: z.string().min(1, 'Bundle ID is required'),
  name: z.string().min(1, 'App name is required'),
  isPreset: z.boolean(),
});

export const UpdateSleepTimeConfigSchema = z.object({
  enabled: z.boolean().optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format. Use HH:mm').optional(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format. Use HH:mm').optional(),
  enforcementApps: z.array(SleepEnforcementAppSchema).optional(),
  snoozeLimit: z.number().int().min(0).max(10).optional(),
  snoozeDuration: z.number().int().min(5).max(120).optional(),
});

export const RecordExemptionSchema = z.object({
  type: z.enum(['snooze', 'focus_override']),
  duration: z.number().int().min(1),
  focusSessionId: z.string().uuid().optional(),
});

export type UpdateSleepTimeConfigInput = z.infer<typeof UpdateSleepTimeConfigSchema>;
export type RecordExemptionInput = z.infer<typeof RecordExemptionSchema>;

// Preset sleep enforcement apps (Requirements: 10.2)
export const PRESET_SLEEP_ENFORCEMENT_APPS: SleepEnforcementApp[] = [
  { bundleId: 'com.tencent.xinWeChat', name: 'WeChat', isPreset: true },
  { bundleId: 'company.thebrowser.Browser', name: 'Arc Browser', isPreset: true },
  { bundleId: 'com.tinyspeck.slackmacgap', name: 'Slack', isPreset: true },
  { bundleId: 'com.hnc.Discord', name: 'Discord', isPreset: true },
];

/**
 * Parse time string "HH:mm" to minutes since midnight
 */
export function parseTimeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Get current time as minutes since midnight
 */
export function getCurrentTimeMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Check if current time is within sleep time window
 * Handles overnight windows (e.g., 23:00 - 07:00)
 */
export function isTimeInSleepWindow(
  currentMinutes: number,
  startMinutes: number,
  endMinutes: number
): boolean {
  if (startMinutes <= endMinutes) {
    // Same day window (e.g., 01:00 - 06:00)
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Overnight window (e.g., 23:00 - 07:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

/**
 * Get the start of the current "night" for snooze counting
 * A "night" starts at the sleep start time and ends at the sleep end time
 */
export function getNightStartTime(sleepStartTime: string, sleepEndTime: string): Date {
  const now = new Date();
  const currentMinutes = getCurrentTimeMinutes();
  const startMinutes = parseTimeToMinutes(sleepStartTime);
  const endMinutes = parseTimeToMinutes(sleepEndTime);
  
  const nightStart = new Date(now);
  nightStart.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
  
  if (startMinutes > endMinutes) {
    // Overnight window (e.g., 23:00 - 07:00)
    if (currentMinutes < endMinutes) {
      // We're in the early morning part, night started yesterday
      nightStart.setDate(nightStart.getDate() - 1);
    }
  } else {
    // Same day window (e.g., 01:00 - 06:00)
    if (currentMinutes < startMinutes) {
      // We're before the window, use yesterday's night
      nightStart.setDate(nightStart.getDate() - 1);
    }
  }
  
  return nightStart;
}

export const sleepTimeService = {
  /**
   * Get sleep time configuration for a user
   * Requirements: 9.1, 9.2, 9.3
   */
  async getConfig(userId: string): Promise<ServiceResult<SleepTimeConfig>> {
    try {
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
      });

      if (!settings) {
        // Return default config if no settings exist
        return {
          success: true,
          data: {
            enabled: false,
            startTime: '23:00',
            endTime: '07:00',
            enforcementApps: [],
            snoozeLimit: 2,
            snoozeDuration: 30,
          },
        };
      }

      const config: SleepTimeConfig = {
        enabled: settings.sleepTimeEnabled ?? false,
        startTime: settings.sleepTimeStart ?? '23:00',
        endTime: settings.sleepTimeEnd ?? '07:00',
        enforcementApps: (settings.sleepEnforcementApps as unknown as SleepEnforcementApp[]) ?? [],
        snoozeLimit: settings.sleepSnoozeLimit ?? 2,
        snoozeDuration: settings.sleepSnoozeDuration ?? 30,
      };

      return { success: true, data: config };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get sleep time config',
        },
      };
    }
  },

  /**
   * Update sleep time configuration
   * Requirements: 9.1, 9.2, 9.3, 9.4
   */
  async updateConfig(
    userId: string,
    input: UpdateSleepTimeConfigInput
  ): Promise<ServiceResult<SleepTimeConfig>> {
    try {
      const validated = UpdateSleepTimeConfigSchema.parse(input);

      // Build update data dynamically using Prisma's expected types
      const updateData: Parameters<typeof prisma.userSettings.update>[0]['data'] = {};
      
      if (validated.enabled !== undefined) {
        updateData.sleepTimeEnabled = validated.enabled;
      }
      if (validated.startTime !== undefined) {
        updateData.sleepTimeStart = validated.startTime;
      }
      if (validated.endTime !== undefined) {
        updateData.sleepTimeEnd = validated.endTime;
      }
      if (validated.enforcementApps !== undefined) {
        updateData.sleepEnforcementApps = validated.enforcementApps as unknown as Parameters<typeof prisma.userSettings.update>[0]['data']['sleepEnforcementApps'];
      }
      if (validated.snoozeLimit !== undefined) {
        updateData.sleepSnoozeLimit = validated.snoozeLimit;
      }
      if (validated.snoozeDuration !== undefined) {
        updateData.sleepSnoozeDuration = validated.snoozeDuration;
      }

      // Upsert settings
      const settings = await prisma.userSettings.upsert({
        where: { userId },
        update: updateData,
        create: {
          userId,
          sleepTimeEnabled: validated.enabled ?? false,
          sleepTimeStart: validated.startTime ?? '23:00',
          sleepTimeEnd: validated.endTime ?? '07:00',
          sleepEnforcementApps: (validated.enforcementApps ?? []) as unknown as Parameters<typeof prisma.userSettings.create>[0]['data']['sleepEnforcementApps'],
          sleepSnoozeLimit: validated.snoozeLimit ?? 2,
          sleepSnoozeDuration: validated.snoozeDuration ?? 30,
        },
      });

      const config: SleepTimeConfig = {
        enabled: settings.sleepTimeEnabled,
        startTime: settings.sleepTimeStart,
        endTime: settings.sleepTimeEnd,
        enforcementApps: settings.sleepEnforcementApps as unknown as SleepEnforcementApp[],
        snoozeLimit: settings.sleepSnoozeLimit,
        snoozeDuration: settings.sleepSnoozeDuration,
      };

      return { success: true, data: config };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid sleep time configuration',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update sleep time config',
        },
      };
    }
  },

  /**
   * Check if currently in sleep time window
   * Requirements: 9.4
   */
  async isInSleepTime(userId: string): Promise<ServiceResult<boolean>> {
    try {
      const configResult = await this.getConfig(userId);
      if (!configResult.success || !configResult.data) {
        return { success: true, data: false };
      }

      const config = configResult.data;
      
      // If sleep time is disabled, return false
      if (!config.enabled) {
        return { success: true, data: false };
      }

      const currentMinutes = getCurrentTimeMinutes();
      const startMinutes = parseTimeToMinutes(config.startTime);
      const endMinutes = parseTimeToMinutes(config.endTime);

      const isInWindow = isTimeInSleepWindow(currentMinutes, startMinutes, endMinutes);

      return { success: true, data: isInWindow };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to check sleep time status',
        },
      };
    }
  },

  /**
   * Request snooze for sleep enforcement
   * Requirements: 12.1, 12.2, 12.3, 12.4
   */
  async requestSnooze(userId: string): Promise<ServiceResult<SleepExemption>> {
    try {
      // Get config to check snooze limit and duration
      const configResult = await this.getConfig(userId);
      if (!configResult.success || !configResult.data) {
        return {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to get sleep time configuration',
          },
        };
      }

      const config = configResult.data;

      // Check remaining snoozes
      const remainingResult = await this.getRemainingSnoozes(userId);
      if (!remainingResult.success) {
        return {
          success: false,
          error: remainingResult.error,
        };
      }

      if (remainingResult.data === 0) {
        return {
          success: false,
          error: {
            code: 'SNOOZE_LIMIT_REACHED',
            message: 'No more snoozes available tonight',
          },
        };
      }

      // Record the snooze exemption
      const exemption = await prisma.sleepExemption.create({
        data: {
          userId,
          type: 'snooze',
          duration: config.snoozeDuration,
          timestamp: new Date(),
        },
      });

      return { success: true, data: exemption };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to request snooze',
        },
      };
    }
  },

  /**
   * Get remaining snoozes for tonight
   * Requirements: 12.3, 12.4
   */
  async getRemainingSnoozes(userId: string): Promise<ServiceResult<number>> {
    try {
      // Get config to check snooze limit
      const configResult = await this.getConfig(userId);
      if (!configResult.success || !configResult.data) {
        return { success: true, data: 0 };
      }

      const config = configResult.data;
      const nightStart = getNightStartTime(config.startTime, config.endTime);

      // Count snoozes since night start
      const snoozeCount = await prisma.sleepExemption.count({
        where: {
          userId,
          type: 'snooze',
          timestamp: {
            gte: nightStart,
          },
        },
      });

      const remaining = Math.max(0, config.snoozeLimit - snoozeCount);
      return { success: true, data: remaining };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get remaining snoozes',
        },
      };
    }
  },

  /**
   * Record an exemption event
   * Requirements: 14.1, 14.2
   */
  async recordExemption(
    userId: string,
    input: RecordExemptionInput
  ): Promise<ServiceResult<SleepExemption>> {
    try {
      const validated = RecordExemptionSchema.parse(input);

      const exemption = await prisma.sleepExemption.create({
        data: {
          userId,
          type: validated.type,
          duration: validated.duration,
          focusSessionId: validated.focusSessionId,
          timestamp: new Date(),
        },
      });

      return { success: true, data: exemption };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid exemption data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to record exemption',
        },
      };
    }
  },

  /**
   * Get exemption history
   * Requirements: 14.3, 14.4, 14.5
   */
  async getExemptionHistory(
    userId: string,
    days: number = 7
  ): Promise<ServiceResult<SleepExemption[]>> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      const exemptions = await prisma.sleepExemption.findMany({
        where: {
          userId,
          timestamp: {
            gte: startDate,
          },
        },
        orderBy: {
          timestamp: 'desc',
        },
        include: {
          focusSession: true,
        },
      });

      return { success: true, data: exemptions };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get exemption history',
        },
      };
    }
  },

  /**
   * Get exemption statistics for a time period
   * Requirements: 14.4, 14.5
   */
  async getExemptionStats(
    userId: string,
    days: number = 7
  ): Promise<ServiceResult<{
    totalSnoozes: number;
    totalFocusOverrides: number;
    totalOverrideMinutes: number;
  }>> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      const exemptions = await prisma.sleepExemption.findMany({
        where: {
          userId,
          timestamp: {
            gte: startDate,
          },
        },
      });

      const totalSnoozes = exemptions.filter((e) => e.type === 'snooze').length;
      const focusOverrides = exemptions.filter((e) => e.type === 'focus_override');
      const totalFocusOverrides = focusOverrides.length;
      const totalOverrideMinutes = focusOverrides.reduce((sum, e) => sum + e.duration, 0);

      return {
        success: true,
        data: {
          totalSnoozes,
          totalFocusOverrides,
          totalOverrideMinutes,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get exemption stats',
        },
      };
    }
  },

  /**
   * Check if currently in an active snooze period
   */
  async isInSnooze(userId: string): Promise<ServiceResult<{ inSnooze: boolean; snoozeEndTime?: Date }>> {
    try {
      const configResult = await this.getConfig(userId);
      if (!configResult.success || !configResult.data) {
        return { success: true, data: { inSnooze: false } };
      }

      const config = configResult.data;
      const nightStart = getNightStartTime(config.startTime, config.endTime);

      // Get the most recent snooze for tonight
      const latestSnooze = await prisma.sleepExemption.findFirst({
        where: {
          userId,
          type: 'snooze',
          timestamp: {
            gte: nightStart,
          },
        },
        orderBy: {
          timestamp: 'desc',
        },
      });

      if (!latestSnooze) {
        return { success: true, data: { inSnooze: false } };
      }

      // Check if snooze is still active
      const snoozeEndTime = new Date(latestSnooze.timestamp.getTime() + latestSnooze.duration * 60 * 1000);
      const now = new Date();

      if (now < snoozeEndTime) {
        return { success: true, data: { inSnooze: true, snoozeEndTime } };
      }

      return { success: true, data: { inSnooze: false } };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to check snooze status',
        },
      };
    }
  },

  /**
   * Get preset sleep enforcement apps
   * Requirements: 10.2
   */
  getPresetApps(): SleepEnforcementApp[] {
    return PRESET_SLEEP_ENFORCEMENT_APPS;
  },
};

export default sleepTimeService;
