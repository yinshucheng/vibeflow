/**
 * Bypass Detection Service
 * 
 * Monitors client behavior and detects bypass attempts when users try to
 * circumvent focus enforcement by closing the desktop client.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';
import { isWithinWorkHours } from './idle.service';
import type { WorkTimeSlot } from './user.service';

// ============================================================================
// Prisma Type for BypassAttempt
// ============================================================================

/** Type for BypassAttempt from Prisma */
interface BypassAttemptRecord {
  id: string;
  userId: string;
  clientId: string;
  eventType: string;
  timestamp: Date;
  durationSeconds: number | null;
  wasInWorkHours: boolean;
  wasInPomodoro: boolean;
  warningLevel: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Default bypass warning threshold score (0-100) */
export const DEFAULT_BYPASS_WARNING_THRESHOLD = 50;

/** Score weights for bypass calculation */
export const BYPASS_SCORE_WEIGHTS = {
  /** Weight for frequency of bypass attempts */
  frequency: 0.4,
  /** Weight for total duration of offline periods */
  duration: 0.3,
  /** Weight for pomodoro interruptions */
  pomodoroInterrupt: 0.3,
};

/** Warning level thresholds */
export const WARNING_LEVEL_THRESHOLDS = {
  low: 20,
  medium: 50,
  high: 75,
};

/** Maximum score for each factor (for normalization) */
export const MAX_FACTOR_SCORES = {
  /** Max bypass attempts per day for max frequency score */
  maxDailyAttempts: 5,
  /** Max offline duration in minutes for max duration score */
  maxOfflineDurationMinutes: 60,
  /** Max pomodoro interruptions per day for max interrupt score */
  maxPomodoroInterrupts: 3,
};

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

export type BypassEventType = 'force_quit' | 'offline_timeout' | 'guardian_killed';
export type WarningLevel = 'none' | 'low' | 'medium' | 'high';

export interface BypassEvent {
  id: string;
  userId: string;
  clientId: string;
  eventType: BypassEventType;
  timestamp: Date;
  durationSeconds: number | null;
  wasInWorkHours: boolean;
  wasInPomodoro: boolean;
  warningLevel: WarningLevel;
}

export interface BypassScoreFactors {
  frequencyScore: number;
  durationScore: number;
  pomodoroInterruptScore: number;
}

export interface BypassScore {
  userId: string;
  score: number;
  warningLevel: WarningLevel;
  lastCalculated: Date;
  factors: BypassScoreFactors;
}

export interface RecordBypassEventInput {
  userId: string;
  clientId: string;
  eventType: BypassEventType;
  durationSeconds?: number | null;
  wasInWorkHours?: boolean;
  wasInPomodoro?: boolean;
}

export interface GetBypassHistoryInput {
  userId: string;
  days?: number;
}

// ============================================================================
// Validation Schemas
// ============================================================================

export const BypassEventTypeSchema = z.enum(['force_quit', 'offline_timeout', 'guardian_killed']);

export const RecordBypassEventSchema = z.object({
  userId: z.string().min(1),
  clientId: z.string().min(1),
  eventType: BypassEventTypeSchema,
  durationSeconds: z.number().int().nullable().optional(),
  wasInWorkHours: z.boolean().optional(),
  wasInPomodoro: z.boolean().optional(),
});

export const GetBypassHistorySchema = z.object({
  userId: z.string().min(1),
  days: z.number().int().min(1).max(365).optional().default(30),
});

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
 * Get user's bypass warning threshold from settings
 */
async function getUserBypassThreshold(userId: string): Promise<number> {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
  });
  
  const settingsAny = settings as Record<string, unknown> | null;
  return (settingsAny?.bypassWarningThreshold as number) ?? DEFAULT_BYPASS_WARNING_THRESHOLD;
}

/**
 * Calculate warning level based on score
 * Requirements: 4.2
 */
export function calculateWarningLevel(score: number): WarningLevel {
  if (score >= WARNING_LEVEL_THRESHOLDS.high) {
    return 'high';
  }
  if (score >= WARNING_LEVEL_THRESHOLDS.medium) {
    return 'medium';
  }
  if (score >= WARNING_LEVEL_THRESHOLDS.low) {
    return 'low';
  }
  return 'none';
}

/**
 * Normalize a value to a 0-100 scale
 */
function normalizeScore(value: number, maxValue: number): number {
  return Math.min(100, Math.round((value / maxValue) * 100));
}

// ============================================================================
// Bypass Detection Service
// ============================================================================

export const bypassDetectionService = {
  /**
   * Record a bypass event
   * Requirements: 4.1
   * 
   * Records when a user attempts to bypass focus enforcement by
   * force-quitting the app, going offline, or killing the guardian.
   */
  async recordBypassEvent(input: RecordBypassEventInput): Promise<ServiceResult<BypassEvent>> {
    try {
      const validated = RecordBypassEventSchema.parse(input);
      const { userId, clientId, eventType, durationSeconds } = validated;
      
      // Determine context if not provided
      const wasInWorkHours = validated.wasInWorkHours ?? await checkIsInWorkHours(userId);
      const wasInPomodoro = validated.wasInPomodoro ?? await checkHasActivePomodoro(userId);
      
      // Calculate current bypass score to determine warning level
      const scoreResult = await this.calculateBypassScore(userId);
      const currentScore = scoreResult.success && scoreResult.data ? scoreResult.data.score : 0;
      
      // Determine warning level based on context and current score
      let warningLevel: WarningLevel = 'none';
      if (wasInWorkHours) {
        if (wasInPomodoro) {
          // Interrupting a pomodoro is more severe
          warningLevel = currentScore >= WARNING_LEVEL_THRESHOLDS.medium ? 'high' : 'medium';
        } else {
          warningLevel = calculateWarningLevel(currentScore + 10); // Add 10 for the new event
        }
      }
      
      // Create the bypass attempt record
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bypassAttempt = await (prisma as any).bypassAttempt.create({
        data: {
          userId,
          clientId,
          eventType,
          durationSeconds: durationSeconds ?? null,
          wasInWorkHours,
          wasInPomodoro,
          warningLevel,
        },
      }) as BypassAttemptRecord;
      
      return {
        success: true,
        data: {
          id: bypassAttempt.id,
          userId: bypassAttempt.userId,
          clientId: bypassAttempt.clientId,
          eventType: bypassAttempt.eventType as BypassEventType,
          timestamp: bypassAttempt.timestamp,
          durationSeconds: bypassAttempt.durationSeconds,
          wasInWorkHours: bypassAttempt.wasInWorkHours,
          wasInPomodoro: bypassAttempt.wasInPomodoro,
          warningLevel: bypassAttempt.warningLevel as WarningLevel,
        },
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid bypass event input',
            details: { issues: error.issues },
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to record bypass event',
        },
      };
    }
  },

  /**
   * Calculate bypass score for a user
   * Requirements: 4.3
   * 
   * Calculates a score (0-100) based on:
   * - Frequency of bypass attempts
   * - Total duration of offline periods during work hours
   * - Number of pomodoro interruptions
   */
  async calculateBypassScore(userId: string, days: number = 7): Promise<ServiceResult<BypassScore>> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);
      
      // Get bypass attempts in the time period
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bypassAttempts = await (prisma as any).bypassAttempt.findMany({
        where: {
          userId,
          timestamp: { gte: startDate },
          wasInWorkHours: true, // Only count work hours attempts
        },
        orderBy: { timestamp: 'desc' },
      }) as BypassAttemptRecord[];
      
      // Calculate frequency score
      // More attempts = higher score
      const attemptCount = bypassAttempts.length;
      const frequencyScore = normalizeScore(attemptCount, MAX_FACTOR_SCORES.maxDailyAttempts * days);
      
      // Calculate duration score
      // Longer offline periods = higher score
      const totalDurationSeconds = bypassAttempts.reduce((sum: number, attempt: BypassAttemptRecord) => {
        return sum + (attempt.durationSeconds ?? 0);
      }, 0);
      const totalDurationMinutes = totalDurationSeconds / 60;
      const durationScore = normalizeScore(totalDurationMinutes, MAX_FACTOR_SCORES.maxOfflineDurationMinutes * days);
      
      // Calculate pomodoro interrupt score
      // More pomodoro interruptions = higher score
      const pomodoroInterrupts = bypassAttempts.filter((a: BypassAttemptRecord) => a.wasInPomodoro).length;
      const pomodoroInterruptScore = normalizeScore(pomodoroInterrupts, MAX_FACTOR_SCORES.maxPomodoroInterrupts * days);
      
      // Calculate weighted total score
      const score = Math.round(
        frequencyScore * BYPASS_SCORE_WEIGHTS.frequency +
        durationScore * BYPASS_SCORE_WEIGHTS.duration +
        pomodoroInterruptScore * BYPASS_SCORE_WEIGHTS.pomodoroInterrupt
      );
      
      const warningLevel = calculateWarningLevel(score);
      
      return {
        success: true,
        data: {
          userId,
          score,
          warningLevel,
          lastCalculated: new Date(),
          factors: {
            frequencyScore,
            durationScore,
            pomodoroInterruptScore,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to calculate bypass score',
        },
      };
    }
  },

  /**
   * Get bypass attempt history for a user
   * Requirements: 4.5
   */
  async getBypassHistory(input: GetBypassHistoryInput): Promise<ServiceResult<BypassEvent[]>> {
    try {
      const validated = GetBypassHistorySchema.parse(input);
      const { userId, days } = validated;
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bypassAttempts = await (prisma as any).bypassAttempt.findMany({
        where: {
          userId,
          timestamp: { gte: startDate },
        },
        orderBy: { timestamp: 'desc' },
      }) as BypassAttemptRecord[];
      
      const events: BypassEvent[] = bypassAttempts.map((attempt: BypassAttemptRecord) => ({
        id: attempt.id,
        userId: attempt.userId,
        clientId: attempt.clientId,
        eventType: attempt.eventType as BypassEventType,
        timestamp: attempt.timestamp,
        durationSeconds: attempt.durationSeconds,
        wasInWorkHours: attempt.wasInWorkHours,
        wasInPomodoro: attempt.wasInPomodoro,
        warningLevel: attempt.warningLevel as WarningLevel,
      }));
      
      return { success: true, data: events };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
            details: { issues: error.issues },
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get bypass history',
        },
      };
    }
  },

  /**
   * Check if a warning should be shown to the user
   * Requirements: 4.4
   * 
   * Returns true if the user's bypass score exceeds their configured threshold.
   */
  async shouldShowWarning(userId: string): Promise<ServiceResult<{
    shouldShow: boolean;
    score: number;
    threshold: number;
    warningLevel: WarningLevel;
  }>> {
    try {
      const [scoreResult, threshold] = await Promise.all([
        this.calculateBypassScore(userId),
        getUserBypassThreshold(userId),
      ]);
      
      if (!scoreResult.success || !scoreResult.data) {
        return {
          success: false,
          error: scoreResult.error,
        };
      }
      
      const { score, warningLevel } = scoreResult.data;
      const shouldShow = score >= threshold;
      
      return {
        success: true,
        data: {
          shouldShow,
          score,
          threshold,
          warningLevel,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to check warning status',
        },
      };
    }
  },

  /**
   * Get bypass statistics for a user
   * Requirements: 4.5
   */
  async getBypassStats(userId: string, days: number = 30): Promise<ServiceResult<{
    totalAttempts: number;
    workHoursAttempts: number;
    pomodoroInterrupts: number;
    totalOfflineSeconds: number;
    averageOfflineSeconds: number;
    byEventType: Record<BypassEventType, number>;
    byWarningLevel: Record<WarningLevel, number>;
  }>> {
    try {
      const historyResult = await this.getBypassHistory({ userId, days });
      
      if (!historyResult.success || !historyResult.data) {
        return {
          success: false,
          error: historyResult.error,
        };
      }
      
      const events = historyResult.data;
      
      const totalAttempts = events.length;
      const workHoursAttempts = events.filter(e => e.wasInWorkHours).length;
      const pomodoroInterrupts = events.filter(e => e.wasInPomodoro).length;
      
      const totalOfflineSeconds = events.reduce((sum, e) => sum + (e.durationSeconds ?? 0), 0);
      const averageOfflineSeconds = totalAttempts > 0 ? Math.round(totalOfflineSeconds / totalAttempts) : 0;
      
      const byEventType: Record<BypassEventType, number> = {
        force_quit: 0,
        offline_timeout: 0,
        guardian_killed: 0,
      };
      
      const byWarningLevel: Record<WarningLevel, number> = {
        none: 0,
        low: 0,
        medium: 0,
        high: 0,
      };
      
      for (const event of events) {
        byEventType[event.eventType]++;
        byWarningLevel[event.warningLevel]++;
      }
      
      return {
        success: true,
        data: {
          totalAttempts,
          workHoursAttempts,
          pomodoroInterrupts,
          totalOfflineSeconds,
          averageOfflineSeconds,
          byEventType,
          byWarningLevel,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get bypass stats',
        },
      };
    }
  },

  /**
   * Get the most recent bypass event for a user
   */
  async getLastBypassEvent(userId: string): Promise<ServiceResult<BypassEvent | null>> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bypassAttempt = await (prisma as any).bypassAttempt.findFirst({
        where: { userId },
        orderBy: { timestamp: 'desc' },
      }) as BypassAttemptRecord | null;
      
      if (!bypassAttempt) {
        return { success: true, data: null };
      }
      
      return {
        success: true,
        data: {
          id: bypassAttempt.id,
          userId: bypassAttempt.userId,
          clientId: bypassAttempt.clientId,
          eventType: bypassAttempt.eventType as BypassEventType,
          timestamp: bypassAttempt.timestamp,
          durationSeconds: bypassAttempt.durationSeconds,
          wasInWorkHours: bypassAttempt.wasInWorkHours,
          wasInPomodoro: bypassAttempt.wasInPomodoro,
          warningLevel: bypassAttempt.warningLevel as WarningLevel,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get last bypass event',
        },
      };
    }
  },

  /**
   * Clear bypass history for a user (for testing or admin purposes)
   */
  async clearBypassHistory(userId: string): Promise<ServiceResult<{ deleted: number }>> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (prisma as any).bypassAttempt.deleteMany({
        where: { userId },
      });
      
      return {
        success: true,
        data: { deleted: result.count },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to clear bypass history',
        },
      };
    }
  },

  /**
   * Get configuration constants
   */
  getConfig() {
    return {
      defaultWarningThreshold: DEFAULT_BYPASS_WARNING_THRESHOLD,
      scoreWeights: BYPASS_SCORE_WEIGHTS,
      warningLevelThresholds: WARNING_LEVEL_THRESHOLDS,
      maxFactorScores: MAX_FACTOR_SCORES,
    };
  },
};

export default bypassDetectionService;
