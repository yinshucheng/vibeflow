/**
 * Grace Period Service
 * 
 * Manages grace periods for client disconnections to prevent false bypass
 * detection during legitimate restarts and brief network issues.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';
import { isWithinWorkHours } from './idle.service';
import type { WorkTimeSlot } from './user.service';

// ============================================================================
// Constants
// ============================================================================

/** Default grace period in minutes - Requirements 5.1 */
export const DEFAULT_GRACE_PERIOD_MINUTES = 5;

/** Grace period during pomodoro in minutes - Requirements 5.5 */
export const POMODORO_GRACE_PERIOD_MINUTES = 2;

/** Minimum configurable grace period in minutes */
export const MIN_GRACE_PERIOD_MINUTES = 1;

/** Maximum configurable grace period in minutes */
export const MAX_GRACE_PERIOD_MINUTES = 15;

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface GracePeriodConfig {
  defaultMinutes: number;
  pomodoroMinutes: number;
  minMinutes: number;
  maxMinutes: number;
}

export interface GracePeriodState {
  clientId: string;
  userId: string;
  startedAt: Date;
  expiresAt: Date;
  isInPomodoro: boolean;
  durationMinutes: number;
  hasExpired: boolean;
}

export interface StartGracePeriodInput {
  clientId: string;
  userId: string;
  isInPomodoro?: boolean;
}

// ============================================================================
// Validation Schemas
// ============================================================================

export const StartGracePeriodSchema = z.object({
  clientId: z.string().min(1),
  userId: z.string().min(1),
  isInPomodoro: z.boolean().optional().default(false),
});

export const GracePeriodConfigSchema = z.object({
  gracePeriodMinutes: z.number().int().min(MIN_GRACE_PERIOD_MINUTES).max(MAX_GRACE_PERIOD_MINUTES),
  gracePeriodPomodoroMinutes: z.number().int().min(MIN_GRACE_PERIOD_MINUTES).max(MAX_GRACE_PERIOD_MINUTES),
});

// ============================================================================
// In-memory state for active grace periods
// ============================================================================

interface ActiveGracePeriod {
  clientId: string;
  userId: string;
  startedAt: Date;
  expiresAt: Date;
  isInPomodoro: boolean;
  durationMinutes: number;
  offlineEventId?: string;
}

const activeGracePeriods = new Map<string, ActiveGracePeriod>();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if user is currently within work hours
 */
async function checkIsInWorkHours(userId: string): Promise<boolean> {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
  });
  
  if (!settings) {
    return false;
  }
  
  const workTimeSlots = (settings.workTimeSlots as unknown as WorkTimeSlot[]) || [];
  return isWithinWorkHours(workTimeSlots);
}

/**
 * Check if user has an active pomodoro
 */
async function checkHasActivePomodoro(userId: string): Promise<boolean> {
  const activePomodoro = await prisma.pomodoro.findFirst({
    where: {
      userId,
      status: 'IN_PROGRESS',
    },
  });
  
  return activePomodoro !== null;
}

/**
 * Get user's grace period configuration
 */
async function getUserGracePeriodConfig(userId: string): Promise<{
  defaultMinutes: number;
  pomodoroMinutes: number;
}> {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
  });
  
  // Access grace period settings from the settings object
  // These fields are defined in the Prisma schema
  const settingsAny = settings as Record<string, unknown> | null;
  
  return {
    defaultMinutes: (settingsAny?.gracePeriodMinutes as number) ?? DEFAULT_GRACE_PERIOD_MINUTES,
    pomodoroMinutes: (settingsAny?.gracePeriodPomodoroMinutes as number) ?? POMODORO_GRACE_PERIOD_MINUTES,
  };
}

/**
 * Calculate grace period duration based on context
 * Requirements: 5.1, 5.5
 */
export function calculateGracePeriodDuration(
  isInPomodoro: boolean,
  config: { defaultMinutes: number; pomodoroMinutes: number }
): number {
  return isInPomodoro ? config.pomodoroMinutes : config.defaultMinutes;
}

// ============================================================================
// Grace Period Service
// ============================================================================

export const gracePeriodService = {
  /**
   * Start a grace period for a client
   * Requirements: 5.2
   * 
   * When a client disconnects, start a grace period timer.
   * The duration depends on whether a pomodoro is active.
   */
  async startGracePeriod(input: StartGracePeriodInput): Promise<ServiceResult<GracePeriodState>> {
    try {
      const validated = StartGracePeriodSchema.parse(input);
      const { clientId, userId } = validated;
      
      // Check if there's already an active grace period for this client
      const existing = activeGracePeriods.get(clientId);
      if (existing && !this.hasGracePeriodExpired(existing)) {
        // Return existing grace period state
        return {
          success: true,
          data: {
            clientId: existing.clientId,
            userId: existing.userId,
            startedAt: existing.startedAt,
            expiresAt: existing.expiresAt,
            isInPomodoro: existing.isInPomodoro,
            durationMinutes: existing.durationMinutes,
            hasExpired: false,
          },
        };
      }
      
      // Determine if user is in pomodoro (use provided value or check)
      const isInPomodoro = validated.isInPomodoro ?? await checkHasActivePomodoro(userId);
      
      // Get user's grace period configuration
      const config = await getUserGracePeriodConfig(userId);
      
      // Calculate duration based on context
      const durationMinutes = calculateGracePeriodDuration(isInPomodoro, config);
      
      const now = new Date();
      const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);
      
      // Store the grace period
      const gracePeriod: ActiveGracePeriod = {
        clientId,
        userId,
        startedAt: now,
        expiresAt,
        isInPomodoro,
        durationMinutes,
      };
      
      activeGracePeriods.set(clientId, gracePeriod);
      
      return {
        success: true,
        data: {
          clientId,
          userId,
          startedAt: now,
          expiresAt,
          isInPomodoro,
          durationMinutes,
          hasExpired: false,
        },
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid grace period input',
            details: { issues: error.issues },
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to start grace period',
        },
      };
    }
  },

  /**
   * Cancel a grace period for a client
   * Requirements: 5.3
   * 
   * Called when a client reconnects within the grace period.
   * Returns whether the grace period was still active (not expired).
   */
  async cancelGracePeriod(clientId: string): Promise<ServiceResult<{
    wasActive: boolean;
    wasExpired: boolean;
    gracePeriodUsed: boolean;
  }>> {
    try {
      const gracePeriod = activeGracePeriods.get(clientId);
      
      if (!gracePeriod) {
        return {
          success: true,
          data: {
            wasActive: false,
            wasExpired: false,
            gracePeriodUsed: false,
          },
        };
      }
      
      const wasExpired = this.hasGracePeriodExpired(gracePeriod);
      
      // Remove the grace period
      activeGracePeriods.delete(clientId);
      
      // If client reconnected within grace period, mark the offline event
      if (!wasExpired && gracePeriod.offlineEventId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma as any).clientOfflineEvent.update({
          where: { id: gracePeriod.offlineEventId },
          data: { gracePeriodUsed: true },
        });
      }
      
      return {
        success: true,
        data: {
          wasActive: true,
          wasExpired,
          gracePeriodUsed: !wasExpired,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to cancel grace period',
        },
      };
    }
  },

  /**
   * Check if a client is currently in a grace period
   * Requirements: 5.3
   */
  isInGracePeriod(clientId: string): boolean {
    const gracePeriod = activeGracePeriods.get(clientId);
    if (!gracePeriod) {
      return false;
    }
    return !this.hasGracePeriodExpired(gracePeriod);
  },

  /**
   * Get the current grace period state for a client
   */
  getGracePeriodState(clientId: string): GracePeriodState | null {
    const gracePeriod = activeGracePeriods.get(clientId);
    if (!gracePeriod) {
      return null;
    }
    
    return {
      clientId: gracePeriod.clientId,
      userId: gracePeriod.userId,
      startedAt: gracePeriod.startedAt,
      expiresAt: gracePeriod.expiresAt,
      isInPomodoro: gracePeriod.isInPomodoro,
      durationMinutes: gracePeriod.durationMinutes,
      hasExpired: this.hasGracePeriodExpired(gracePeriod),
    };
  },

  /**
   * Check if a grace period has expired
   */
  hasGracePeriodExpired(gracePeriod: ActiveGracePeriod): boolean {
    return new Date() > gracePeriod.expiresAt;
  },

  /**
   * Process expired grace periods and record bypass attempts
   * Requirements: 5.4
   * 
   * Called periodically to check for expired grace periods and
   * record bypass attempts for clients that didn't reconnect.
   */
  async processExpiredGracePeriods(): Promise<ServiceResult<{
    processed: number;
    bypassAttemptsRecorded: number;
  }>> {
    try {
      let processed = 0;
      let bypassAttemptsRecorded = 0;
      
      const now = new Date();
      const expiredClientIds: string[] = [];
      
      // Find all expired grace periods
      activeGracePeriods.forEach((gracePeriod, clientId) => {
        if (now > gracePeriod.expiresAt) {
          expiredClientIds.push(clientId);
        }
      });
      
      // Process each expired grace period
      for (const clientId of expiredClientIds) {
        const gracePeriod = activeGracePeriods.get(clientId);
        if (!gracePeriod) continue;
        
        processed++;
        
        // Check if this should be recorded as a bypass attempt
        const wasInWorkHours = await checkIsInWorkHours(gracePeriod.userId);
        
        if (wasInWorkHours) {
          // Record bypass attempt
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (prisma as any).bypassAttempt.create({
            data: {
              userId: gracePeriod.userId,
              clientId: gracePeriod.clientId,
              eventType: 'offline_timeout',
              wasInWorkHours: true,
              wasInPomodoro: gracePeriod.isInPomodoro,
              warningLevel: gracePeriod.isInPomodoro ? 'medium' : 'low',
              durationSeconds: Math.floor(
                (now.getTime() - gracePeriod.startedAt.getTime()) / 1000
              ),
            },
          });
          
          bypassAttemptsRecorded++;
          
          // Update the offline event if it exists
          if (gracePeriod.offlineEventId) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (prisma as any).clientOfflineEvent.update({
              where: { id: gracePeriod.offlineEventId },
              data: { isBypassAttempt: true },
            });
          }
        }
        
        // Remove the expired grace period
        activeGracePeriods.delete(clientId);
      }
      
      return {
        success: true,
        data: {
          processed,
          bypassAttemptsRecorded,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to process expired grace periods',
        },
      };
    }
  },

  /**
   * Associate an offline event with a grace period
   * Used to track which offline events used grace period
   */
  setOfflineEventId(clientId: string, offlineEventId: string): void {
    const gracePeriod = activeGracePeriods.get(clientId);
    if (gracePeriod) {
      gracePeriod.offlineEventId = offlineEventId;
    }
  },

  /**
   * Get all active grace periods (for debugging/monitoring)
   */
  getAllActiveGracePeriods(): GracePeriodState[] {
    const states: GracePeriodState[] = [];
    
    activeGracePeriods.forEach((gracePeriod) => {
      states.push({
        clientId: gracePeriod.clientId,
        userId: gracePeriod.userId,
        startedAt: gracePeriod.startedAt,
        expiresAt: gracePeriod.expiresAt,
        isInPomodoro: gracePeriod.isInPomodoro,
        durationMinutes: gracePeriod.durationMinutes,
        hasExpired: this.hasGracePeriodExpired(gracePeriod),
      });
    });
    
    return states;
  },

  /**
   * Clear all grace periods (for testing)
   */
  clearAllGracePeriods(): void {
    activeGracePeriods.clear();
  },

  /**
   * Get the default configuration
   */
  getDefaultConfig(): GracePeriodConfig {
    return {
      defaultMinutes: DEFAULT_GRACE_PERIOD_MINUTES,
      pomodoroMinutes: POMODORO_GRACE_PERIOD_MINUTES,
      minMinutes: MIN_GRACE_PERIOD_MINUTES,
      maxMinutes: MAX_GRACE_PERIOD_MINUTES,
    };
  },

  /**
   * Get user's configured grace period settings
   */
  async getUserConfig(userId: string): Promise<ServiceResult<{
    defaultMinutes: number;
    pomodoroMinutes: number;
  }>> {
    try {
      const config = await getUserGracePeriodConfig(userId);
      return { success: true, data: config };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get user config',
        },
      };
    }
  },

  /**
   * Check if reconnection should be considered within grace period
   * Requirements: 5.3
   * 
   * Returns true if the client reconnected within the grace period,
   * meaning no bypass attempt should be recorded.
   */
  async shouldRecordBypassAttempt(
    clientId: string,
    offlineDurationSeconds: number
  ): Promise<ServiceResult<{
    shouldRecord: boolean;
    reason: string;
  }>> {
    try {
      const gracePeriod = activeGracePeriods.get(clientId);
      
      // If no grace period exists, check based on duration
      if (!gracePeriod) {
        // Get the client to find the user
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client = await (prisma as any).clientConnection.findUnique({
          where: { clientId },
        });
        
        if (!client) {
          return {
            success: true,
            data: {
              shouldRecord: false,
              reason: 'Client not found',
            },
          };
        }
        
        const config = await getUserGracePeriodConfig(client.userId);
        const wasInPomodoro = await checkHasActivePomodoro(client.userId);
        const gracePeriodSeconds = calculateGracePeriodDuration(wasInPomodoro, config) * 60;
        
        if (offlineDurationSeconds <= gracePeriodSeconds) {
          return {
            success: true,
            data: {
              shouldRecord: false,
              reason: 'Reconnected within grace period',
            },
          };
        }
        
        // Check if in work hours
        const wasInWorkHours = await checkIsInWorkHours(client.userId);
        if (!wasInWorkHours) {
          return {
            success: true,
            data: {
              shouldRecord: false,
              reason: 'Not within work hours',
            },
          };
        }
        
        return {
          success: true,
          data: {
            shouldRecord: true,
            reason: 'Grace period expired during work hours',
          },
        };
      }
      
      // Grace period exists - check if expired
      if (!this.hasGracePeriodExpired(gracePeriod)) {
        return {
          success: true,
          data: {
            shouldRecord: false,
            reason: 'Grace period still active',
          },
        };
      }
      
      // Grace period expired - check work hours
      const wasInWorkHours = await checkIsInWorkHours(gracePeriod.userId);
      if (!wasInWorkHours) {
        return {
          success: true,
          data: {
            shouldRecord: false,
            reason: 'Not within work hours',
          },
        };
      }
      
      return {
        success: true,
        data: {
          shouldRecord: true,
          reason: 'Grace period expired during work hours',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to check bypass attempt',
        },
      };
    }
  },
};

export default gracePeriodService;
