/**
 * Over Rest Service
 * 
 * Handles detection and management of over rest states during work hours.
 * Triggers configurable actions when rest duration exceeds the configured limit.
 * 
 * Requirements: 15.2, 15.3, 16.1, 16.2, 16.3, 16.4, 16.5
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';
import { focusSessionService } from './focus-session.service';
import { isWithinWorkHours, parseTimeToMinutes } from './idle.service';
import type { WorkTimeSlot } from './user.service';

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

// Over rest action types (Requirements: 16.2)
export const OverRestActionSchema = z.enum([
  'show_notification',
  'close_browser',
  'close_apps',
]);

export type OverRestAction = z.infer<typeof OverRestActionSchema>;

// Over rest app schema (Requirements: 16.3)
export const OverRestAppSchema = z.object({
  bundleId: z.string().min(1),
  name: z.string().min(1),
});

export type OverRestApp = z.infer<typeof OverRestAppSchema>;

// Over rest status interface (Requirements: 15.2, 15.3)
export interface OverRestStatus {
  isOverRest: boolean;
  restDurationMinutes: number;
  overRestMinutes: number;
  gracePeriodMinutes: number;
  gracePeriodRemaining: number;
  shouldTriggerActions: boolean;
  lastPomodoroEndTime: Date | null;
}

// Over rest config interface (Requirements: 16.2, 16.3, 16.5)
export interface OverRestConfig {
  gracePeriod: number; // minutes (1-10)
  actions: OverRestAction[];
  apps: OverRestApp[];
}

// Default over rest config
const DEFAULT_OVER_REST_CONFIG: OverRestConfig = {
  gracePeriod: 5,
  actions: ['show_notification'],
  apps: [],
};

// Preset apps for over rest (common apps to close)
export const PRESET_OVER_REST_APPS: OverRestApp[] = [
  { bundleId: 'com.google.Chrome', name: 'Google Chrome' },
  { bundleId: 'com.apple.Safari', name: 'Safari' },
  { bundleId: 'company.thebrowser.Browser', name: 'Arc' },
  { bundleId: 'com.tencent.xinWeChat', name: 'WeChat' },
  { bundleId: 'com.apple.Music', name: 'Music' },
  { bundleId: 'com.spotify.client', name: 'Spotify' },
];

/**
 * Get current time in minutes since midnight
 */
function getCurrentTimeMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export const overRestService = {
  /**
   * Get over rest configuration for a user
   * Requirements: 16.2, 16.3, 16.5
   */
  async getConfig(userId: string): Promise<ServiceResult<OverRestConfig>> {
    try {
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
      });

      if (!settings) {
        return { success: true, data: DEFAULT_OVER_REST_CONFIG };
      }

      // Access fields using type assertion since Prisma types may not be synced
      const settingsAny = settings as Record<string, unknown>;

      return {
        success: true,
        data: {
          gracePeriod: (settingsAny.overRestGracePeriod as number) ?? DEFAULT_OVER_REST_CONFIG.gracePeriod,
          actions: (settingsAny.overRestActions as OverRestAction[]) ?? DEFAULT_OVER_REST_CONFIG.actions,
          apps: (settingsAny.overRestApps as unknown as OverRestApp[]) ?? DEFAULT_OVER_REST_CONFIG.apps,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get over rest config',
        },
      };
    }
  },

  /**
   * Update over rest configuration
   * Requirements: 16.2, 16.3, 16.5
   */
  async updateConfig(
    userId: string,
    config: Partial<OverRestConfig>
  ): Promise<ServiceResult<OverRestConfig>> {
    try {
      // Validate grace period (Requirements: 16.5)
      if (config.gracePeriod !== undefined) {
        if (config.gracePeriod < 1 || config.gracePeriod > 10) {
          return {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Grace period must be between 1 and 10 minutes',
            },
          };
        }
      }

      // Validate actions
      if (config.actions !== undefined) {
        for (const action of config.actions) {
          const result = OverRestActionSchema.safeParse(action);
          if (!result.success) {
            return {
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: `Invalid action: ${action}`,
              },
            };
          }
        }
      }

      // Validate apps
      if (config.apps !== undefined) {
        for (const app of config.apps) {
          const result = OverRestAppSchema.safeParse(app);
          if (!result.success) {
            return {
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: `Invalid app configuration: ${JSON.stringify(app)}`,
              },
            };
          }
        }
      }

      const updateData: Record<string, unknown> = {};
      if (config.gracePeriod !== undefined) {
        updateData.overRestGracePeriod = config.gracePeriod;
      }
      if (config.actions !== undefined) {
        updateData.overRestActions = config.actions;
      }
      if (config.apps !== undefined) {
        updateData.overRestApps = JSON.parse(JSON.stringify(config.apps));
      }

      // Use type assertion for Prisma operation
      await prisma.userSettings.upsert({
        where: { userId },
        update: updateData as Parameters<typeof prisma.userSettings.upsert>[0]['update'],
        create: {
          userId,
          ...updateData,
        } as Parameters<typeof prisma.userSettings.upsert>[0]['create'],
      });

      // Return updated config
      return this.getConfig(userId);
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update over rest config',
        },
      };
    }
  },

  /**
   * Check if user is currently in over rest state
   * Requirements: 15.2, 15.3
   */
  async checkOverRestStatus(userId: string): Promise<ServiceResult<OverRestStatus>> {
    try {
      // Get user settings
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
      });

      // Access fields using type assertion since Prisma types may not be synced
      const settingsAny = settings as Record<string, unknown> | null;

      const shortRestDuration = (settingsAny?.shortRestDuration as number) ?? 5;
      const gracePeriod = (settingsAny?.overRestGracePeriod as number) ?? 5;
      const workTimeSlots = (settingsAny?.workTimeSlots as unknown as WorkTimeSlot[]) || [];

      // Check if within work hours
      const withinWorkHours = isWithinWorkHours(workTimeSlots);

      // Check if in ad-hoc focus session
      const focusSessionResult = await focusSessionService.getActiveSession(userId);
      const inFocusSession = focusSessionResult.success && focusSessionResult.data !== null;

      console.log(`[OverRestService] checkOverRestStatus inputs: userId=${userId}, shortRestDuration=${shortRestDuration}min, gracePeriod=${gracePeriod}min, withinWorkHours=${withinWorkHours}, inFocusSession=${inFocusSession}, now=${new Date().toISOString()}`);

      // If not in work hours and not in focus session, not over rest
      if (!withinWorkHours && !inFocusSession) {
        console.log(`[OverRestService] checkOverRestStatus → not over rest (outside work hours and no focus session)`);
        return {
          success: true,
          data: {
            isOverRest: false,
            restDurationMinutes: 0,
            overRestMinutes: 0,
            gracePeriodMinutes: gracePeriod,
            gracePeriodRemaining: gracePeriod,
            shouldTriggerActions: false,
            lastPomodoroEndTime: null,
          },
        };
      }

      // Check if there's an active pomodoro
      const activePomodoro = await prisma.pomodoro.findFirst({
        where: {
          userId,
          status: 'IN_PROGRESS',
        },
      });

      // If in pomodoro, not over rest
      if (activePomodoro) {
        console.log(`[OverRestService] checkOverRestStatus → not over rest (active pomodoro: ${activePomodoro.id})`);
        return {
          success: true,
          data: {
            isOverRest: false,
            restDurationMinutes: 0,
            overRestMinutes: 0,
            gracePeriodMinutes: gracePeriod,
            gracePeriodRemaining: gracePeriod,
            shouldTriggerActions: false,
            lastPomodoroEndTime: null,
          },
        };
      }

      // Get last completed pomodoro
      const lastPomodoro = await prisma.pomodoro.findFirst({
        where: {
          userId,
          status: 'COMPLETED',
        },
        orderBy: {
          endTime: 'desc',
        },
      });

      // Calculate rest duration
      let restDurationMinutes: number;
      let lastPomodoroEndTime: Date | null = null;
      
      if (lastPomodoro?.endTime) {
        // Has completed pomodoro - calculate rest since then
        const restDurationMs = Date.now() - lastPomodoro.endTime.getTime();
        restDurationMinutes = Math.floor(restDurationMs / 1000 / 60);
        lastPomodoroEndTime = lastPomodoro.endTime;
      } else {
        // No completed pomodoro - calculate time since work started
        const currentMinutes = getCurrentTimeMinutes();
        let workStartMinutes: number | null = null;
        
        // Find the current active work slot
        for (const slot of workTimeSlots) {
          if (!slot.enabled) continue;
          const startMinutes = parseTimeToMinutes(slot.startTime);
          const endMinutes = parseTimeToMinutes(slot.endTime);
          
          if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
            workStartMinutes = startMinutes;
            break;
          }
        }
        
        // For ad-hoc focus session, use session start time
        if (inFocusSession && focusSessionResult.data) {
          const sessionStartMs = focusSessionResult.data.startTime.getTime();
          const sessionStartDate = new Date(sessionStartMs);
          workStartMinutes = sessionStartDate.getHours() * 60 + sessionStartDate.getMinutes();
        }
        
        if (workStartMinutes !== null) {
          restDurationMinutes = currentMinutes - workStartMinutes;
        } else {
          // Shouldn't happen if we're in work hours, but default to 0
          restDurationMinutes = 0;
        }
      }

      // Calculate over rest time
      const overRestMinutes = Math.max(0, restDurationMinutes - shortRestDuration);

      // Check if over rest (exceeds normal rest duration)
      const isOverRest = restDurationMinutes > shortRestDuration;

      // Calculate grace period remaining
      const gracePeriodRemaining = Math.max(0, gracePeriod - overRestMinutes);

      // Should trigger actions if over rest and grace period has passed
      const shouldTriggerActions = isOverRest && overRestMinutes >= gracePeriod;

      console.log(`[OverRestService] checkOverRestStatus → isOverRest=${isOverRest}, shouldTriggerActions=${shouldTriggerActions}, restDuration=${restDurationMinutes}min, overRestMinutes=${overRestMinutes}min, gracePeriodRemaining=${gracePeriodRemaining}min, lastPomodoroEndTime=${lastPomodoroEndTime?.toISOString() ?? 'null'}`);

      return {
        success: true,
        data: {
          isOverRest,
          restDurationMinutes,
          overRestMinutes,
          gracePeriodMinutes: gracePeriod,
          gracePeriodRemaining,
          shouldTriggerActions,
          lastPomodoroEndTime,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to check over rest status',
        },
      };
    }
  },

  /**
   * Get actions to execute when over rest is triggered
   * Requirements: 16.1, 16.4
   */
  async getOverRestActions(userId: string): Promise<ServiceResult<{
    actions: OverRestAction[];
    apps: OverRestApp[];
  }>> {
    try {
      const configResult = await this.getConfig(userId);
      if (!configResult.success || !configResult.data) {
        return {
          success: false,
          error: configResult.error,
        };
      }

      return {
        success: true,
        data: {
          actions: configResult.data.actions,
          apps: configResult.data.apps,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get over rest actions',
        },
      };
    }
  },

  /**
   * Add an app to the over rest apps list
   * Requirements: 16.3
   */
  async addOverRestApp(userId: string, app: OverRestApp): Promise<ServiceResult<OverRestApp[]>> {
    try {
      const validated = OverRestAppSchema.parse(app);

      const configResult = await this.getConfig(userId);
      if (!configResult.success || !configResult.data) {
        return {
          success: false,
          error: configResult.error,
        };
      }

      const currentApps = configResult.data.apps;

      // Check if app already exists
      if (currentApps.some(a => a.bundleId === validated.bundleId)) {
        return {
          success: false,
          error: {
            code: 'CONFLICT',
            message: `App with bundleId ${validated.bundleId} already exists`,
          },
        };
      }

      const newApps = [...currentApps, validated];
      const appsJson = JSON.parse(JSON.stringify(newApps));

      // Use type assertion for Prisma operation
      await prisma.userSettings.upsert({
        where: { userId },
        update: { overRestApps: appsJson } as Parameters<typeof prisma.userSettings.upsert>[0]['update'],
        create: { userId, overRestApps: appsJson } as Parameters<typeof prisma.userSettings.upsert>[0]['create'],
      });

      return { success: true, data: newApps };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid app data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to add over rest app',
        },
      };
    }
  },

  /**
   * Remove an app from the over rest apps list
   * Requirements: 16.3
   */
  async removeOverRestApp(userId: string, bundleId: string): Promise<ServiceResult<OverRestApp[]>> {
    try {
      const configResult = await this.getConfig(userId);
      if (!configResult.success || !configResult.data) {
        return {
          success: false,
          error: configResult.error,
        };
      }

      const currentApps = configResult.data.apps;
      const newApps = currentApps.filter(a => a.bundleId !== bundleId);

      if (newApps.length === currentApps.length) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `App with bundleId ${bundleId} not found`,
          },
        };
      }

      const appsJson = JSON.parse(JSON.stringify(newApps));

      // Use type assertion for Prisma operation
      await prisma.userSettings.update({
        where: { userId },
        data: { overRestApps: appsJson } as Parameters<typeof prisma.userSettings.update>[0]['data'],
      });

      return { success: true, data: newApps };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to remove over rest app',
        },
      };
    }
  },

  /**
   * Get preset apps for over rest
   */
  getPresetApps(): OverRestApp[] {
    return [...PRESET_OVER_REST_APPS];
  },
};

export default overRestService;
