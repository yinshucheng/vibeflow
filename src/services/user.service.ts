import { z } from 'zod';
import prisma from '@/lib/prisma';
import type { User, UserSettings, SkipTokenUsage, SettingsModificationLog } from '@prisma/client';
import { broadcastPolicyUpdate } from '@/services/socket-broadcast.service';
import { settingsModificationLogService } from '@/services/settings-modification-log.service';

// Work time slot schema
export const WorkTimeSlotSchema = z.object({
  id: z.string(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:mm)'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:mm)'),
  enabled: z.boolean(),
});

export type WorkTimeSlot = z.infer<typeof WorkTimeSlotSchema>;

// Distraction app schema (Requirements 3.1, 3.2, 3.3, 3.4)
export const DistractionAppSchema = z.object({
  bundleId: z.string().min(1),
  name: z.string().min(1),
  action: z.enum(['force_quit', 'hide_window']),
  isPreset: z.boolean(),
});

export type DistractionApp = z.infer<typeof DistractionAppSchema>;

// Enforcement mode schema (Requirements 4.1)
export const EnforcementModeSchema = z.enum(['strict', 'gentle']);
export type EnforcementMode = z.infer<typeof EnforcementModeSchema>;

// Idle alert action types
export const IdleAlertActionSchema = z.enum([
  'show_overlay',
  'close_distracting_apps',
  'open_pomodoro_page',
  'browser_notification',
]);

export type IdleAlertAction = z.infer<typeof IdleAlertActionSchema>;

// Weekday expectation schema (Requirements 10.10)
export const WeekdayExpectationSchema = z.object({
  workMinutes: z.number().min(0).max(1440), // 0-24 hours
  pomodoroCount: z.number().min(0).max(50),
});

export type WeekdayExpectation = z.infer<typeof WeekdayExpectationSchema>;

// Weekday expectations map (0-6 for Sunday-Saturday)
export const WeekdayExpectationsSchema = z.record(
  z.string().regex(/^[0-6]$/),
  WeekdayExpectationSchema
);

export type WeekdayExpectations = z.infer<typeof WeekdayExpectationsSchema>;

// Validation schemas
export const UpdateSettingsSchema = z.object({
  pomodoroDuration: z.number().min(10).max(120).optional(),
  shortRestDuration: z.number().min(2).max(30).optional(),
  longRestDuration: z.number().min(5).max(60).optional(),
  longRestInterval: z.number().min(1).max(10).optional(),
  dailyCap: z.number().min(1).max(20).optional(),
  blacklist: z.array(z.string()).optional(),
  whitelist: z.array(z.string()).optional(),
  codingStandards: z.array(z.string()).optional(),
  preferences: z.record(z.string(), z.unknown()).optional(),
  // Notification settings (Requirements 4.3, 4.4)
  notificationEnabled: z.boolean().optional(),
  notificationSound: z.enum(['bell', 'chime', 'gentle', 'none']).optional(),
  flashTabEnabled: z.boolean().optional(),
  // Work time settings (Requirements 5.1, 5.2, 5.3)
  workTimeSlots: z.array(WorkTimeSlotSchema).optional(),
  maxIdleMinutes: z.number().min(1).max(60).optional(),
  idleAlertActions: z.array(IdleAlertActionSchema).optional(),
  // Expected time settings (Requirements 10.1, 10.2, 10.10)
  expectedWorkMinutes: z.number().min(0).max(1440).optional(),
  expectedPomodoroCount: z.number().min(0).max(50).optional(),
  weekdayExpectations: WeekdayExpectationsSchema.optional(),
  // Desktop Focus Enforcement settings (Requirements 3.1, 4.1, 5.4)
  enforcementMode: EnforcementModeSchema.optional(),
  distractionApps: z.array(DistractionAppSchema).optional(),
  skipTokenDailyLimit: z.number().min(1).max(10).optional(),
  skipTokenMaxDelay: z.number().min(1).max(30).optional(),
  // Pomodoro auto-start settings (Requirements 7.1, 7.2)
  autoStartBreak: z.boolean().optional(),
  autoStartNextPomodoro: z.boolean().optional(),
  autoStartCountdown: z.number().min(3).max(30).optional(),
  // Browser redirect settings (Requirements 6.6)
  browserRedirectReplace: z.boolean().optional(),
  // Early warning settings (Requirements 26.1.1, 26.1.2, 26.1.3, 26.1.4, 26.1.5, 26.1.6)
  earlyWarningEnabled: z.boolean().optional(),
  earlyWarningInterval: z.number().refine(val => [30, 60, 120].includes(val), {
    message: 'Interval must be 30, 60, or 120 minutes',
  }).optional(),
  earlyWarningThreshold: z.number().refine(val => [50, 60, 70, 80].includes(val), {
    message: 'Threshold must be 50, 60, 70, or 80 percent',
  }).optional(),
  earlyWarningMethod: z.array(z.enum(['browser_notification', 'desktop_notification'])).optional(),
  earlyWarningQuietStart: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format').nullable().optional(),
  earlyWarningQuietEnd: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format').nullable().optional(),
  // Demo mode settings (Requirements 6.13, 6.14)
  demoTokensPerMonth: z.number().min(1).max(10).optional(),
  demoMaxDurationMinutes: z.number().min(30).max(180).optional(),
  // Work apps settings
  workApps: z.array(z.object({
    bundleId: z.string(),
    name: z.string(),
  })).optional(),
  // REST enforcement settings
  restEnforcementEnabled: z.boolean().optional(),
  restEnforcementActions: z.array(z.string()).optional(),
  restGraceLimit: z.number().min(1).max(5).optional(),
  restGraceDuration: z.number().min(1).max(10).optional(),
});

export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;

// Dev mode configuration
export interface DevModeConfig {
  enabled: boolean;
  defaultUserEmail: string;
  skipAuth: boolean;
}

// User context interface
export interface UserContext {
  userId: string;
  email: string;
  isDevMode: boolean;
  tokenScopes?: string[];
}

// Service result types
export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

// Default dev mode config
const devModeConfig: DevModeConfig = {
  enabled: process.env.DEV_MODE === 'true',
  defaultUserEmail: process.env.DEV_USER_EMAIL || '',
  skipAuth: true,
};

export const userService = {
  /**
   * Get or create a development user by email
   * Used in dev mode to bypass authentication
   */
  async getOrCreateDevUser(email: string): Promise<ServiceResult<User>> {
    try {
      let user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            email,
            password: 'dev_mode_no_password',
          },
        });
      }

      return { success: true, data: user };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get or create dev user',
        },
      };
    }
  },

  /**
   * Get current user from context
   *
   * Auth chain (4 paths):
   * 1. DEV_MODE header (only when DEV_MODE=true)
   * 2. NextAuth session (JWT cookie)
   * 3. Bearer vf_ API token
   * 4. DEV_MODE fallback (only when DEV_MODE=true, no auth info at all)
   *
   * In dev mode, paths 1 and 4 are active. Dev mode still tries formal auth paths
   * (2 and 3) so production flows can be tested locally.
   */
  async getCurrentUser(ctx: {
    headers?: Record<string, string | undefined>;
    session?: { user: { id: string; email: string } } | null;
  }): Promise<ServiceResult<UserContext>> {
    try {
      // Path 1: DEV_MODE header (only when dev mode enabled)
      if (devModeConfig.enabled) {
        const devEmail = ctx.headers?.['x-dev-user-email'];
        if (devEmail) {
          const result = await this.getOrCreateDevUser(devEmail);
          if (result.success && result.data) {
            return {
              success: true,
              data: {
                userId: result.data.id,
                email: result.data.email,
                isDevMode: true,
              },
            };
          }
        }
        // Dev mode still continues to try formal auth paths below
      }

      // Path 2: NextAuth session (from JWT cookie)
      if (ctx.session?.user) {
        return {
          success: true,
          data: {
            userId: ctx.session.user.id,
            email: ctx.session.user.email,
            isDevMode: false,
          },
        };
      }

      // Path 3: Bearer vf_ API token (iOS/Desktop/MCP/Skill)
      const authHeader = ctx.headers?.['authorization'];
      if (authHeader?.startsWith('Bearer vf_')) {
        const token = authHeader.slice(7); // "Bearer ".length = 7
        const { authService } = await import('@/services/auth.service');
        const result = await authService.validateToken(token);
        if (result.success && result.data?.valid && result.data.userId) {
          const user = await prisma.user.findUnique({
            where: { id: result.data.userId },
            select: { id: true, email: true },
          });
          if (user) {
            return {
              success: true,
              data: {
                userId: user.id,
                email: user.email,
                isDevMode: false,
                tokenScopes: result.data.scopes,
              },
            };
          }
        }
      }

      // Path 4: DEV_MODE fallback (only when dev mode enabled + DEV_USER_EMAIL configured)
      if (devModeConfig.enabled && devModeConfig.defaultUserEmail) {
        const result = await this.getOrCreateDevUser(devModeConfig.defaultUserEmail);
        if (result.success && result.data) {
          return {
            success: true,
            data: {
              userId: result.data.id,
              email: result.data.email,
              isDevMode: true,
            },
          };
        }
      }

      return {
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Authentication required',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get current user',
        },
      };
    }
  },

  /**
   * Get user settings by userId
   * Creates default settings if none exist
   */
  async getSettings(userId: string): Promise<ServiceResult<UserSettings>> {
    try {
      let settings = await prisma.userSettings.findUnique({
        where: { userId },
      });

      if (!settings) {
        settings = await prisma.userSettings.create({
          data: { userId },
        });
      }

      return { success: true, data: settings };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get settings',
        },
      };
    }
  },

  /**
   * Update user settings
   * Requirements: 6.7, 8.7
   */
  async updateSettings(userId: string, data: UpdateSettingsInput): Promise<ServiceResult<UserSettings>> {
    try {
      const validated = UpdateSettingsSchema.parse(data);

      // Ensure settings exist
      const existing = await prisma.userSettings.findUnique({
        where: { userId },
      });

      // Prepare update data
      const updateData: Record<string, unknown> = { ...validated };
      
      // Handle preferences as JSON
      if (validated.preferences !== undefined) {
        updateData.preferences = JSON.parse(JSON.stringify(validated.preferences));
      }
      
      // Handle workTimeSlots as JSON (Requirements 5.1, 5.2)
      if (validated.workTimeSlots !== undefined) {
        updateData.workTimeSlots = JSON.parse(JSON.stringify(validated.workTimeSlots));
      }
      
      // Handle weekdayExpectations as JSON (Requirements 10.10)
      if (validated.weekdayExpectations !== undefined) {
        updateData.weekdayExpectations = JSON.parse(JSON.stringify(validated.weekdayExpectations));
      }
      
      // Handle distractionApps as JSON (Requirements 3.1)
      if (validated.distractionApps !== undefined) {
        updateData.distractionApps = JSON.parse(JSON.stringify(validated.distractionApps));
      }

      // Log settings modification (Requirements 8.7)
      const settingKeys = Object.keys(validated);
      for (const key of settingKeys) {
        const oldValue = existing ? (existing as Record<string, unknown>)[key] : null;
        const newValue = (validated as Record<string, unknown>)[key];
        await this.logSettingsModification(userId, key, oldValue, newValue, true);
      }

      let settings: UserSettings;
      
      if (!existing) {
        settings = await prisma.userSettings.create({
          data: {
            userId,
            ...updateData,
          } as Parameters<typeof prisma.userSettings.create>[0]['data'],
        });
      } else {
        settings = await prisma.userSettings.update({
          where: { userId },
          data: updateData,
        });
      }

      // Broadcast policy update if blacklist or whitelist changed
      if (validated.blacklist !== undefined || validated.whitelist !== undefined) {
        broadcastPolicyUpdate(userId).catch((err) => {
          console.error('[UserService] Failed to broadcast policy update:', err);
        });
      }

      return { success: true, data: settings };
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
          message: error instanceof Error ? error.message : 'Failed to update settings',
        },
      };
    }
  },

  /**
   * Check if dev mode is enabled
   */
  isDevModeEnabled(): boolean {
    return devModeConfig.enabled;
  },

  /**
   * Get dev mode configuration
   */
  getDevModeConfig(): DevModeConfig {
    return { ...devModeConfig };
  },

  // ============================================
  // Distraction App Management (Requirements 3.2, 3.3, 3.4)
  // ============================================

  /**
   * Get distraction apps list for a user
   * Requirements: 3.1
   */
  async getDistractionApps(userId: string): Promise<ServiceResult<DistractionApp[]>> {
    try {
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
        select: { distractionApps: true },
      });

      if (!settings) {
        return { success: true, data: [] };
      }

      const apps = settings.distractionApps as unknown as DistractionApp[];
      return { success: true, data: apps || [] };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get distraction apps',
        },
      };
    }
  },

  /**
   * Add a distraction app to the list
   * Requirements: 3.2
   */
  async addDistractionApp(userId: string, app: DistractionApp): Promise<ServiceResult<DistractionApp[]>> {
    try {
      const validated = DistractionAppSchema.parse(app);
      
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
        select: { distractionApps: true },
      });

      const currentApps = (settings?.distractionApps as unknown as DistractionApp[]) || [];
      
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
      
      await prisma.userSettings.upsert({
        where: { userId },
        update: { distractionApps: JSON.parse(JSON.stringify(newApps)) },
        create: { userId, distractionApps: JSON.parse(JSON.stringify(newApps)) },
      });

      // Log the modification
      await this.logSettingsModification(userId, 'distractionApps', currentApps, newApps, true);

      return { success: true, data: newApps };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid distraction app data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to add distraction app',
        },
      };
    }
  },

  /**
   * Remove a distraction app from the list
   * Requirements: 3.3
   */
  async removeDistractionApp(userId: string, bundleId: string): Promise<ServiceResult<DistractionApp[]>> {
    try {
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
        select: { distractionApps: true },
      });

      const currentApps = (settings?.distractionApps as unknown as DistractionApp[]) || [];
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

      await prisma.userSettings.update({
        where: { userId },
        data: { distractionApps: JSON.parse(JSON.stringify(newApps)) },
      });

      // Log the modification
      await this.logSettingsModification(userId, 'distractionApps', currentApps, newApps, true);

      return { success: true, data: newApps };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to remove distraction app',
        },
      };
    }
  },

  /**
   * Update a distraction app's action
   * Requirements: 3.4
   */
  async updateDistractionAppAction(
    userId: string,
    bundleId: string,
    action: 'force_quit' | 'hide_window'
  ): Promise<ServiceResult<DistractionApp[]>> {
    try {
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
        select: { distractionApps: true },
      });

      const currentApps = (settings?.distractionApps as unknown as DistractionApp[]) || [];
      const appIndex = currentApps.findIndex(a => a.bundleId === bundleId);

      if (appIndex === -1) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `App with bundleId ${bundleId} not found`,
          },
        };
      }

      const newApps = [...currentApps];
      newApps[appIndex] = { ...newApps[appIndex], action };

      await prisma.userSettings.update({
        where: { userId },
        data: { distractionApps: JSON.parse(JSON.stringify(newApps)) },
      });

      // Log the modification
      await this.logSettingsModification(userId, 'distractionApps', currentApps, newApps, true);

      return { success: true, data: newApps };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update distraction app action',
        },
      };
    }
  },

  // ============================================
  // Skip Token Management (Requirements 5.2, 5.3, 5.4, 5.5, 5.6)
  // ============================================

  /**
   * Get skip token usage for a specific date
   * Requirements: 5.4
   */
  async getSkipTokenUsage(userId: string, date: Date): Promise<ServiceResult<SkipTokenUsage | null>> {
    try {
      // Normalize date to start of day
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
          message: error instanceof Error ? error.message : 'Failed to get skip token usage',
        },
      };
    }
  },

  /**
   * Get remaining skip tokens for today
   * Requirements: 5.4, 5.5
   */
  async getRemainingSkipTokens(userId: string): Promise<ServiceResult<{ remaining: number; dailyLimit: number; usedToday: number }>> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get user's daily limit from settings
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
        select: { skipTokenDailyLimit: true },
      });

      const dailyLimit = settings?.skipTokenDailyLimit ?? 3;

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
        data: { remaining, dailyLimit, usedToday },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get remaining skip tokens',
        },
      };
    }
  },

  /**
   * Consume a skip token (for skip or delay action)
   * Requirements: 5.2, 5.3, 5.5
   */
  async consumeSkipToken(userId: string): Promise<ServiceResult<{ success: boolean; remaining: number }>> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get user's daily limit
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
        select: { skipTokenDailyLimit: true },
      });

      const dailyLimit = settings?.skipTokenDailyLimit ?? 3;

      // Get or create today's usage record
      const usage = await prisma.skipTokenUsage.upsert({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
        update: {},
        create: {
          userId,
          date: today,
          usedCount: 0,
        },
      });

      // Check if tokens are exhausted
      if (usage.usedCount >= dailyLimit) {
        return {
          success: true,
          data: { success: false, remaining: 0 },
        };
      }

      // Consume a token
      const updated = await prisma.skipTokenUsage.update({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
        data: {
          usedCount: { increment: 1 },
        },
      });

      const remaining = Math.max(0, dailyLimit - updated.usedCount);

      return {
        success: true,
        data: { success: true, remaining },
      };
    } catch (error) {
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
   * Get skip token usage history for a date range
   * Requirements: 5.7
   */
  async getSkipTokenHistory(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ServiceResult<SkipTokenUsage[]>> {
    try {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const history = await prisma.skipTokenUsage.findMany({
        where: {
          userId,
          date: {
            gte: start,
            lte: end,
          },
        },
        orderBy: { date: 'desc' },
      });

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

  // ============================================
  // Settings Modification Logging (Requirements 8.7)
  // ============================================

  /**
   * Log a settings modification attempt
   * Requirements: 8.7
   * 
   * Delegates to settingsModificationLogService for actual logging.
   */
  async logSettingsModification(
    userId: string,
    settingKey: string,
    oldValue: unknown,
    newValue: unknown,
    success: boolean,
    reason?: string
  ): Promise<ServiceResult<SettingsModificationLog>> {
    // Delegate to the dedicated service
    if (success) {
      return settingsModificationLogService.logSuccess(userId, settingKey, oldValue, newValue);
    } else {
      return settingsModificationLogService.logFailure(userId, settingKey, oldValue, newValue, reason || 'Unknown reason');
    }
  },

  /**
   * Get settings modification logs for a user
   * Requirements: 8.7
   * 
   * Delegates to settingsModificationLogService for actual querying.
   */
  async getSettingsModificationLogs(
    userId: string,
    options?: {
      settingKey?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    }
  ): Promise<ServiceResult<SettingsModificationLog[]>> {
    return settingsModificationLogService.getLogs(userId, options);
  },
};

export default userService;
