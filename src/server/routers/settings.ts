/**
 * Settings tRPC Router
 * 
 * Exposes timer configuration and blacklist/whitelist management endpoints.
 * Requirements: 14.1, 14.2, 14.3, 13.1, 5.1, 5.2, 5.3, 8.7
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, readProcedure, writeProcedure, adminProcedure } from '../trpc';
import { userService, UpdateSettingsSchema, WorkTimeSlotSchema, IdleAlertActionSchema, WeekdayExpectationSchema } from '@/services/user.service';
import { settingsLockService, canModifySetting, isLockableSetting, LOCKABLE_SETTINGS } from '@/services/settings-lock.service';
import { settingsModificationLogService } from '@/services/settings-modification-log.service';
import { socketServer } from '@/server/socket';
import type { OctopusCommand } from '@/types/octopus';
import type { WorkTimeSlot } from '@/components/settings/work-time-settings';

// Timer settings schema
const TimerSettingsSchema = z.object({
  pomodoroDuration: z.number().min(10).max(120).optional(),
  shortRestDuration: z.number().min(2).max(30).optional(),
  longRestDuration: z.number().min(5).max(60).optional(),
  longRestInterval: z.number().min(1).max(10).optional(),
  dailyCap: z.number().min(1).max(20).optional(),
});

// Work time settings schema (Requirements 5.1, 5.2, 5.3)
const WorkTimeSettingsSchema = z.object({
  slots: z.array(WorkTimeSlotSchema),
  maxIdleMinutes: z.number().min(1).max(60),
  idleAlertActions: z.array(IdleAlertActionSchema),
});

// URL pattern schema for blacklist/whitelist
const UrlPatternSchema = z.string().min(1).max(500);

function broadcastDataChange(userId: string, entity: string, action: string, ids: string[]) {
  socketServer.broadcastOctopusCommand(userId, {
    commandId: crypto.randomUUID(),
    commandType: 'DATA_CHANGE',
    targetClient: 'all',
    priority: 'normal',
    requiresAck: false,
    createdAt: Date.now(),
    payload: { entity, action, ids, timestamp: Date.now() },
  } as OctopusCommand);
}

/**
 * Helper function to check if settings can be modified and log blocked attempts
 * Requirements: 8.7
 */
async function checkAndLogSettingsLock(
  userId: string,
  settingKeys: string[],
  currentSettings: Record<string, unknown> | null,
  newValues: Record<string, unknown>
): Promise<{ allowed: boolean; blockedKeys: string[]; reason?: string }> {
  // Get work time slots from current settings
  const workTimeSlots = (currentSettings?.workTimeSlots as WorkTimeSlot[]) || [];
  const isDevelopmentMode = settingsLockService.isDevelopmentMode();
  
  const config = { isDevelopmentMode, workTimeSlots };
  const blockedKeys: string[] = [];
  let blockReason: string | undefined;
  
  for (const key of settingKeys) {
    if (isLockableSetting(key)) {
      const result = canModifySetting(key, config);
      if (!result.allowed) {
        blockedKeys.push(key);
        blockReason = result.reason;
        
        // Log the blocked attempt (Requirements 8.7)
        await settingsModificationLogService.logFailure(
          userId,
          key,
          currentSettings?.[key],
          newValues[key],
          result.reason || 'Setting is locked during work hours'
        );
      }
    }
  }
  
  return {
    allowed: blockedKeys.length === 0,
    blockedKeys,
    reason: blockReason,
  };
}

export const settingsRouter = router({
  /**
   * Get current user settings
   */
  get: readProcedure.query(async ({ ctx }) => {
    const result = await userService.getSettings(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get settings',
      });
    }
    
    return result.data;
  }),

  /**
   * Update all settings at once
   * Requirements: 8.7 - Log all modification attempts
   */
  update: adminProcedure
    .input(UpdateSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      // Get current settings for lock check and logging
      const currentSettingsResult = await userService.getSettings(ctx.user.userId);
      const currentSettings = currentSettingsResult.data as Record<string, unknown> | null;
      
      // Check for locked settings (Requirements 8.7)
      const settingKeys = Object.keys(input);
      const lockCheck = await checkAndLogSettingsLock(
        ctx.user.userId,
        settingKeys,
        currentSettings,
        input as Record<string, unknown>
      );
      
      if (!lockCheck.allowed) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `Cannot modify locked settings during work hours: ${lockCheck.blockedKeys.join(', ')}. ${lockCheck.reason || ''}`,
        });
      }
      
      const result = await userService.updateSettings(ctx.user.userId, input);

      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to update settings',
          cause: result.error?.details,
        });
      }

      broadcastDataChange(ctx.user.userId, 'settings', 'update', ['settings']);
      return result.data;
    }),

  /**
   * Update timer settings only
   * Requirements: 14.1, 14.2, 14.3
   */
  updateTimer: writeProcedure
    .input(TimerSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await userService.updateSettings(ctx.user.userId, input);

      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to update timer settings',
          cause: result.error?.details,
        });
      }

      broadcastDataChange(ctx.user.userId, 'settings', 'update', ['settings']);
      return result.data;
    }),

  /**
   * Update work time settings
   * Requirements: 5.1, 5.2, 5.3, 8.7
   */
  updateWorkTime: adminProcedure
    .input(WorkTimeSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      // Get current settings for lock check
      const currentSettingsResult = await userService.getSettings(ctx.user.userId);
      const currentSettings = currentSettingsResult.data as Record<string, unknown> | null;
      
      // Check for locked settings (workTimeSlots is lockable)
      const lockCheck = await checkAndLogSettingsLock(
        ctx.user.userId,
        ['workTimeSlots'],
        currentSettings,
        { workTimeSlots: input.slots }
      );
      
      if (!lockCheck.allowed) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `Cannot modify work time settings during work hours. ${lockCheck.reason || ''}`,
        });
      }
      
      // Validate that time slots don't overlap
      const enabledSlots = input.slots.filter(s => s.enabled);
      const sortedSlots = [...enabledSlots].sort((a, b) => 
        a.startTime.localeCompare(b.startTime)
      );
      
      // Check for overlaps
      for (let i = 0; i < sortedSlots.length - 1; i++) {
        if (sortedSlots[i].endTime > sortedSlots[i + 1].startTime) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Time slots overlap: ${sortedSlots[i].startTime}-${sortedSlots[i].endTime} and ${sortedSlots[i + 1].startTime}-${sortedSlots[i + 1].endTime}`,
          });
        }
      }
      
      // Check that start time is before end time for each slot
      for (const slot of input.slots) {
        if (slot.startTime >= slot.endTime) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Start time must be before end time: ${slot.startTime} - ${slot.endTime}`,
          });
        }
      }
      
      const result = await userService.updateSettings(ctx.user.userId, {
        workTimeSlots: input.slots,
        maxIdleMinutes: input.maxIdleMinutes,
        idleAlertActions: input.idleAlertActions,
      });

      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to update work time settings',
          cause: result.error?.details,
        });
      }

      broadcastDataChange(ctx.user.userId, 'settings', 'update', ['settings']);
      return result.data;
    }),

  /**
   * Get blacklist patterns
   * Requirements: 13.1
   */
  getBlacklist: readProcedure.query(async ({ ctx }) => {
    const result = await userService.getSettings(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get blacklist',
      });
    }
    
    return result.data?.blacklist ?? [];
  }),

  /**
   * Update blacklist patterns
   * Requirements: 13.1
   */
  updateBlacklist: adminProcedure
    .input(z.object({ patterns: z.array(UrlPatternSchema) }))
    .mutation(async ({ ctx, input }) => {
      const result = await userService.updateSettings(ctx.user.userId, {
        blacklist: input.patterns,
      });

      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to update blacklist',
        });
      }

      broadcastDataChange(ctx.user.userId, 'settings', 'update', ['settings']);
      return result.data?.blacklist ?? [];
    }),

  /**
   * Add a pattern to blacklist
   */
  addToBlacklist: adminProcedure
    .input(z.object({ pattern: UrlPatternSchema }))
    .mutation(async ({ ctx, input }) => {
      // Get current settings
      const settingsResult = await userService.getSettings(ctx.user.userId);
      if (!settingsResult.success || !settingsResult.data) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get current settings',
        });
      }

      const currentBlacklist = settingsResult.data.blacklist ?? [];
      
      // Check if pattern already exists
      if (currentBlacklist.includes(input.pattern)) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Pattern already exists in blacklist',
        });
      }

      const result = await userService.updateSettings(ctx.user.userId, {
        blacklist: [...currentBlacklist, input.pattern],
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to add to blacklist',
        });
      }

      broadcastDataChange(ctx.user.userId, 'settings', 'update', ['settings']);
      return result.data?.blacklist ?? [];
    }),

  /**
   * Remove a pattern from blacklist
   */
  removeFromBlacklist: adminProcedure
    .input(z.object({ pattern: UrlPatternSchema }))
    .mutation(async ({ ctx, input }) => {
      // Get current settings
      const settingsResult = await userService.getSettings(ctx.user.userId);
      if (!settingsResult.success || !settingsResult.data) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get current settings',
        });
      }

      const currentBlacklist = settingsResult.data.blacklist ?? [];
      const newBlacklist = currentBlacklist.filter(p => p !== input.pattern);

      const result = await userService.updateSettings(ctx.user.userId, {
        blacklist: newBlacklist,
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to remove from blacklist',
        });
      }

      broadcastDataChange(ctx.user.userId, 'settings', 'update', ['settings']);
      return result.data?.blacklist ?? [];
    }),

  /**
   * Get whitelist patterns
   * Requirements: 13.1
   */
  getWhitelist: readProcedure.query(async ({ ctx }) => {
    const result = await userService.getSettings(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get whitelist',
      });
    }
    
    return result.data?.whitelist ?? [];
  }),

  /**
   * Update whitelist patterns
   * Requirements: 13.1
   */
  updateWhitelist: adminProcedure
    .input(z.object({ patterns: z.array(UrlPatternSchema) }))
    .mutation(async ({ ctx, input }) => {
      const result = await userService.updateSettings(ctx.user.userId, {
        whitelist: input.patterns,
      });

      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to update whitelist',
        });
      }

      broadcastDataChange(ctx.user.userId, 'settings', 'update', ['settings']);
      return result.data?.whitelist ?? [];
    }),

  /**
   * Add a pattern to whitelist
   */
  addToWhitelist: adminProcedure
    .input(z.object({ pattern: UrlPatternSchema }))
    .mutation(async ({ ctx, input }) => {
      // Get current settings
      const settingsResult = await userService.getSettings(ctx.user.userId);
      if (!settingsResult.success || !settingsResult.data) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get current settings',
        });
      }

      const currentWhitelist = settingsResult.data.whitelist ?? [];
      
      // Check if pattern already exists
      if (currentWhitelist.includes(input.pattern)) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Pattern already exists in whitelist',
        });
      }

      const result = await userService.updateSettings(ctx.user.userId, {
        whitelist: [...currentWhitelist, input.pattern],
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to add to whitelist',
        });
      }

      broadcastDataChange(ctx.user.userId, 'settings', 'update', ['settings']);
      return result.data?.whitelist ?? [];
    }),

  /**
   * Remove a pattern from whitelist
   */
  removeFromWhitelist: adminProcedure
    .input(z.object({ pattern: UrlPatternSchema }))
    .mutation(async ({ ctx, input }) => {
      // Get current settings
      const settingsResult = await userService.getSettings(ctx.user.userId);
      if (!settingsResult.success || !settingsResult.data) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get current settings',
        });
      }

      const currentWhitelist = settingsResult.data.whitelist ?? [];
      const newWhitelist = currentWhitelist.filter(p => p !== input.pattern);

      const result = await userService.updateSettings(ctx.user.userId, {
        whitelist: newWhitelist,
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to remove from whitelist',
        });
      }

      broadcastDataChange(ctx.user.userId, 'settings', 'update', ['settings']);
      return result.data?.whitelist ?? [];
    }),

  /**
   * Get coding standards
   */
  getCodingStandards: readProcedure.query(async ({ ctx }) => {
    const result = await userService.getSettings(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get coding standards',
      });
    }
    
    return result.data?.codingStandards ?? [];
  }),

  /**
   * Update coding standards
   */
  updateCodingStandards: writeProcedure
    .input(z.object({ standards: z.array(z.string().min(1).max(1000)) }))
    .mutation(async ({ ctx, input }) => {
      const result = await userService.updateSettings(ctx.user.userId, {
        codingStandards: input.standards,
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to update coding standards',
        });
      }

      broadcastDataChange(ctx.user.userId, 'settings', 'update', ['settings']);
      return result.data?.codingStandards ?? [];
    }),

  /**
   * Get preferences
   */
  getPreferences: readProcedure.query(async ({ ctx }) => {
    const result = await userService.getSettings(ctx.user.userId);
    
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to get preferences',
      });
    }
    
    return result.data?.preferences ?? {};
  }),

  /**
   * Update preferences
   */
  updatePreferences: writeProcedure
    .input(z.object({ preferences: z.record(z.string(), z.unknown()) }))
    .mutation(async ({ ctx, input }) => {
      const result = await userService.updateSettings(ctx.user.userId, {
        preferences: input.preferences,
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to update preferences',
        });
      }

      broadcastDataChange(ctx.user.userId, 'settings', 'update', ['settings']);
      return result.data?.preferences ?? {};
    }),

  /**
   * Update expectation settings
   * Requirements: 10.1, 10.2, 10.10
   */
  updateExpectations: writeProcedure
    .input(z.object({
      expectedWorkMinutes: z.number().min(0).max(1440),
      expectedPomodoroCount: z.number().min(0).max(50),
      weekdayExpectations: z.record(
        z.string().regex(/^[0-6]$/),
        WeekdayExpectationSchema
      ).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await userService.updateSettings(ctx.user.userId, {
        expectedWorkMinutes: input.expectedWorkMinutes,
        expectedPomodoroCount: input.expectedPomodoroCount,
        weekdayExpectations: input.weekdayExpectations,
      });

      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to update expectation settings',
          cause: result.error?.details,
        });
      }

      broadcastDataChange(ctx.user.userId, 'settings', 'update', ['settings']);
      return {
        expectedWorkMinutes: result.data?.expectedWorkMinutes ?? 360,
        expectedPomodoroCount: result.data?.expectedPomodoroCount ?? 10,
        weekdayExpectations: result.data?.weekdayExpectations ?? {},
      };
    }),

  /**
   * Update auto-start settings
   * Requirements: 7.1, 7.2
   */
  updateAutoStart: writeProcedure
    .input(z.object({
      autoStartBreak: z.boolean(),
      autoStartNextPomodoro: z.boolean(),
      autoStartCountdown: z.number().min(3).max(30),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await userService.updateSettings(ctx.user.userId, {
        autoStartBreak: input.autoStartBreak,
        autoStartNextPomodoro: input.autoStartNextPomodoro,
        autoStartCountdown: input.autoStartCountdown,
      });

      if (!result.success) {
        throw new TRPCError({
          code: result.error?.code === 'VALIDATION_ERROR' ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to update auto-start settings',
          cause: result.error?.details,
        });
      }

      broadcastDataChange(ctx.user.userId, 'settings', 'update', ['settings']);
      // Type assertion needed as Prisma types may not be fully synced
      const data = result.data as {
        autoStartBreak?: boolean;
        autoStartNextPomodoro?: boolean;
        autoStartCountdown?: number;
      } | undefined;
      
      return {
        autoStartBreak: data?.autoStartBreak ?? false,
        autoStartNextPomodoro: data?.autoStartNextPomodoro ?? false,
        autoStartCountdown: data?.autoStartCountdown ?? 5,
      };
    }),
});
