/**
 * Demo Mode Service
 * 
 * Manages demo mode activation, token allocation, and enforcement suspension
 * for product presentations and demonstrations.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.7, 6.9, 6.10
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';

// ============================================================================
// Constants
// ============================================================================

/** Default demo tokens per month - Requirements 6.3 */
export const DEFAULT_DEMO_TOKENS_PER_MONTH = 3;

/** Minimum demo tokens per month */
export const MIN_DEMO_TOKENS_PER_MONTH = 1;

/** Maximum demo tokens per month */
export const MAX_DEMO_TOKENS_PER_MONTH = 10;

/** Default demo mode max duration in minutes - Requirements 6.4 */
export const DEFAULT_DEMO_MAX_DURATION_MINUTES = 90;

/** Minimum demo mode duration in minutes */
export const MIN_DEMO_DURATION_MINUTES = 30;

/** Maximum demo mode duration in minutes */
export const MAX_DEMO_DURATION_MINUTES = 180;

/** Default confirmation phrase - Requirements 7.1 */
export const DEFAULT_CONFIRMATION_PHRASE = 'I am presenting';

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

export interface DemoModeConfig {
  tokensPerMonth: number;
  maxDurationMinutes: number;
  confirmationPhrase: string;
}

export interface DemoToken {
  id: string;
  userId: string;
  allocatedAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  endedAt: Date | null;
  durationMinutes: number | null;
  confirmPhrase: string | null;
}

export interface DemoModeState {
  isActive: boolean;
  startedAt: Date | null;
  expiresAt: Date | null;
  remainingMinutes: number | null;
  remainingTokensThisMonth: number;
  activeTokenId: string | null;
}

export interface DemoModeHistory {
  tokens: DemoToken[];
  totalUsedThisMonth: number;
  totalDurationMinutesThisMonth: number;
}

export interface ActivateDemoModeInput {
  userId: string;
  confirmPhrase: string;
  durationMinutes?: number;
}

// ============================================================================
// Validation Schemas
// ============================================================================

export const ActivateDemoModeSchema = z.object({
  userId: z.string().min(1),
  confirmPhrase: z.string().min(1),
  durationMinutes: z.number().int()
    .min(MIN_DEMO_DURATION_MINUTES)
    .max(MAX_DEMO_DURATION_MINUTES)
    .optional(),
});

export const DemoModeConfigSchema = z.object({
  demoTokensPerMonth: z.number().int()
    .min(MIN_DEMO_TOKENS_PER_MONTH)
    .max(MAX_DEMO_TOKENS_PER_MONTH),
  demoMaxDurationMinutes: z.number().int()
    .min(MIN_DEMO_DURATION_MINUTES)
    .max(MAX_DEMO_DURATION_MINUTES),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the start of the current month
 */
function getMonthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

/**
 * Get the end of the current month (start of next month)
 */
function getMonthEnd(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
}

/**
 * Check if user has an active pomodoro
 * Requirements: 7.5 - Demo mode cannot be activated during active pomodoro
 */
async function hasActivePomodoro(userId: string): Promise<boolean> {
  const activePomodoro = await prisma.pomodoro.findFirst({
    where: {
      userId,
      status: 'IN_PROGRESS',
    },
  });
  return activePomodoro !== null;
}

/**
 * Get user's demo mode configuration
 */
async function getUserDemoConfig(userId: string): Promise<{
  tokensPerMonth: number;
  maxDurationMinutes: number;
}> {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
  });
  
  return {
    tokensPerMonth: settings?.demoTokensPerMonth ?? DEFAULT_DEMO_TOKENS_PER_MONTH,
    maxDurationMinutes: settings?.demoMaxDurationMinutes ?? DEFAULT_DEMO_MAX_DURATION_MINUTES,
  };
}

/**
 * Allocate demo tokens for the current month if not already allocated
 * Requirements: 6.3
 */
async function ensureMonthlyTokensAllocated(userId: string): Promise<void> {
  const config = await getUserDemoConfig(userId);
  const monthStart = getMonthStart();
  const monthEnd = getMonthEnd();
  
  // Count existing tokens for this month
  const existingTokens = await prisma.demoToken.count({
    where: {
      userId,
      allocatedAt: {
        gte: monthStart,
        lt: monthEnd,
      },
    },
  });
  
  // Allocate missing tokens
  const tokensToAllocate = config.tokensPerMonth - existingTokens;
  
  if (tokensToAllocate > 0) {
    const tokenData = Array.from({ length: tokensToAllocate }, () => ({
      userId,
      allocatedAt: new Date(),
      expiresAt: monthEnd,
    }));
    
    await prisma.demoToken.createMany({
      data: tokenData,
    });
  }
}

// ============================================================================
// Demo Mode Service
// ============================================================================

export const demoModeService = {
  /**
   * Get remaining demo tokens for the current month
   * Requirements: 6.3
   */
  async getRemainingTokens(userId: string): Promise<ServiceResult<number>> {
    try {
      // Ensure tokens are allocated for this month
      await ensureMonthlyTokensAllocated(userId);
      
      const monthStart = getMonthStart();
      const monthEnd = getMonthEnd();
      
      // Count unused tokens for this month
      const unusedTokens = await prisma.demoToken.count({
        where: {
          userId,
          allocatedAt: {
            gte: monthStart,
            lt: monthEnd,
          },
          usedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
      });
      
      return { success: true, data: unusedTokens };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get remaining tokens',
        },
      };
    }
  },

  /**
   * Activate demo mode
   * Requirements: 6.1, 6.2, 6.4, 7.1, 7.5
   */
  async activateDemoMode(input: ActivateDemoModeInput): Promise<ServiceResult<DemoModeState>> {
    try {
      const validated = ActivateDemoModeSchema.parse(input);
      const { userId, confirmPhrase } = validated;
      
      // Check if demo mode is already active
      const currentState = await this.getDemoModeState(userId);
      if (currentState.success && currentState.data?.isActive) {
        return {
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'Demo mode is already active',
          },
        };
      }
      
      // Check for active pomodoro - Requirements 7.5
      const hasPomodoro = await hasActivePomodoro(userId);
      if (hasPomodoro) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Cannot activate demo mode during an active pomodoro session',
          },
        };
      }
      
      // Verify confirmation phrase - Requirements 7.1
      if (confirmPhrase.toLowerCase() !== DEFAULT_CONFIRMATION_PHRASE.toLowerCase()) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid confirmation phrase',
          },
        };
      }
      
      // Ensure tokens are allocated
      await ensureMonthlyTokensAllocated(userId);
      
      // Get an available token
      const monthStart = getMonthStart();
      const monthEnd = getMonthEnd();
      
      const availableToken = await prisma.demoToken.findFirst({
        where: {
          userId,
          allocatedAt: {
            gte: monthStart,
            lt: monthEnd,
          },
          usedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
        orderBy: {
          allocatedAt: 'asc',
        },
      });
      
      if (!availableToken) {
        // Get next month reset date for error message
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `No demo tokens available. Tokens reset on ${monthEnd.toLocaleDateString()}`,
            details: { resetDate: monthEnd.toISOString() },
          },
        };
      }
      
      // Get user's max duration config
      const config = await getUserDemoConfig(userId);
      const durationMinutes = validated.durationMinutes ?? config.maxDurationMinutes;
      
      // Ensure duration doesn't exceed max
      const actualDuration = Math.min(durationMinutes, config.maxDurationMinutes);
      
      const now = new Date();
      const expiresAt = new Date(now.getTime() + actualDuration * 60 * 1000);
      
      // Mark token as used
      await prisma.demoToken.update({
        where: { id: availableToken.id },
        data: {
          usedAt: now,
          confirmPhrase,
        },
      });
      
      // Create demo mode started event - Requirements 6.10
      await prisma.demoModeEvent.create({
        data: {
          userId,
          tokenId: availableToken.id,
          eventType: 'started',
          timestamp: now,
        },
      });
      
      // Get remaining tokens after activation
      const remainingResult = await this.getRemainingTokens(userId);
      const remainingTokens = remainingResult.success ? remainingResult.data! : 0;
      
      return {
        success: true,
        data: {
          isActive: true,
          startedAt: now,
          expiresAt,
          remainingMinutes: actualDuration,
          remainingTokensThisMonth: remainingTokens,
          activeTokenId: availableToken.id,
        },
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid demo mode activation input',
            details: { issues: error.issues },
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to activate demo mode',
        },
      };
    }
  },

  /**
   * Deactivate demo mode
   * Requirements: 6.7
   */
  async deactivateDemoMode(userId: string): Promise<ServiceResult<void>> {
    try {
      // Find the active token (used but not ended)
      const activeToken = await prisma.demoToken.findFirst({
        where: {
          userId,
          usedAt: { not: null },
          endedAt: null,
        },
        orderBy: {
          usedAt: 'desc',
        },
      });
      
      if (!activeToken || !activeToken.usedAt) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'No active demo mode session found',
          },
        };
      }
      
      const now = new Date();
      const durationMinutes = Math.floor(
        (now.getTime() - activeToken.usedAt.getTime()) / (60 * 1000)
      );
      
      // Update token with end time and duration
      await prisma.demoToken.update({
        where: { id: activeToken.id },
        data: {
          endedAt: now,
          durationMinutes,
        },
      });
      
      // Create demo mode ended event - Requirements 6.10
      await prisma.demoModeEvent.create({
        data: {
          userId,
          tokenId: activeToken.id,
          eventType: 'ended',
          timestamp: now,
          durationMinutes,
          reason: 'manual_exit',
        },
      });
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to deactivate demo mode',
        },
      };
    }
  },

  /**
   * Get current demo mode state
   * Requirements: 6.5, 6.6
   */
  async getDemoModeState(userId: string): Promise<ServiceResult<DemoModeState>> {
    try {
      // Ensure tokens are allocated
      await ensureMonthlyTokensAllocated(userId);
      
      // Find active token (used but not ended)
      const activeToken = await prisma.demoToken.findFirst({
        where: {
          userId,
          usedAt: { not: null },
          endedAt: null,
        },
        orderBy: {
          usedAt: 'desc',
        },
      });
      
      // Get remaining tokens
      const remainingResult = await this.getRemainingTokens(userId);
      const remainingTokens = remainingResult.success ? remainingResult.data! : 0;
      
      if (!activeToken || !activeToken.usedAt) {
        return {
          success: true,
          data: {
            isActive: false,
            startedAt: null,
            expiresAt: null,
            remainingMinutes: null,
            remainingTokensThisMonth: remainingTokens,
            activeTokenId: null,
          },
        };
      }
      
      // Get user's max duration config
      const config = await getUserDemoConfig(userId);
      
      // Calculate expiry time
      const expiresAt = new Date(
        activeToken.usedAt.getTime() + config.maxDurationMinutes * 60 * 1000
      );
      
      const now = new Date();
      
      // Check if demo mode has expired - Requirements 6.6
      if (now >= expiresAt) {
        // Auto-expire the demo mode
        await this.expireDemoMode(userId, activeToken.id);
        
        return {
          success: true,
          data: {
            isActive: false,
            startedAt: null,
            expiresAt: null,
            remainingMinutes: null,
            remainingTokensThisMonth: remainingTokens,
            activeTokenId: null,
          },
        };
      }
      
      const remainingMinutes = Math.max(
        0,
        Math.floor((expiresAt.getTime() - now.getTime()) / (60 * 1000))
      );
      
      return {
        success: true,
        data: {
          isActive: true,
          startedAt: activeToken.usedAt,
          expiresAt,
          remainingMinutes,
          remainingTokensThisMonth: remainingTokens,
          activeTokenId: activeToken.id,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get demo mode state',
        },
      };
    }
  },

  /**
   * Expire demo mode (called when duration limit is reached)
   * Requirements: 6.6
   */
  async expireDemoMode(userId: string, tokenId: string): Promise<ServiceResult<void>> {
    try {
      const token = await prisma.demoToken.findUnique({
        where: { id: tokenId },
      });
      
      if (!token || token.endedAt || !token.usedAt) {
        return { success: true }; // Already ended or not started
      }
      
      // Get user's max duration config
      const config = await getUserDemoConfig(userId);
      
      const now = new Date();
      const durationMinutes = Math.min(
        config.maxDurationMinutes,
        Math.floor((now.getTime() - token.usedAt.getTime()) / (60 * 1000))
      );
      
      // Update token with end time
      await prisma.demoToken.update({
        where: { id: tokenId },
        data: {
          endedAt: now,
          durationMinutes,
        },
      });
      
      // Create demo mode expired event
      await prisma.demoModeEvent.create({
        data: {
          userId,
          tokenId,
          eventType: 'expired',
          timestamp: now,
          durationMinutes,
          reason: 'duration_expired',
        },
      });
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to expire demo mode',
        },
      };
    }
  },

  /**
   * Get demo mode history for a user
   * Requirements: 6.8
   */
  async getDemoModeHistory(userId: string, months: number = 3): Promise<ServiceResult<DemoModeHistory>> {
    try {
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);
      
      const tokens = await prisma.demoToken.findMany({
        where: {
          userId,
          allocatedAt: {
            gte: startDate,
          },
        },
        orderBy: {
          allocatedAt: 'desc',
        },
      });
      
      // Calculate this month's usage
      const monthStart = getMonthStart();
      const monthEnd = getMonthEnd();
      
      const thisMonthTokens = tokens.filter(
        t => t.allocatedAt >= monthStart && t.allocatedAt < monthEnd
      );
      
      const totalUsedThisMonth = thisMonthTokens.filter(t => t.usedAt !== null).length;
      const totalDurationMinutesThisMonth = thisMonthTokens
        .filter(t => t.durationMinutes !== null)
        .reduce((sum, t) => sum + (t.durationMinutes ?? 0), 0);
      
      return {
        success: true,
        data: {
          tokens: tokens.map(t => ({
            id: t.id,
            userId: t.userId,
            allocatedAt: t.allocatedAt,
            expiresAt: t.expiresAt,
            usedAt: t.usedAt,
            endedAt: t.endedAt,
            durationMinutes: t.durationMinutes,
            confirmPhrase: t.confirmPhrase,
          })),
          totalUsedThisMonth,
          totalDurationMinutesThisMonth,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get demo mode history',
        },
      };
    }
  },

  /**
   * Check if demo mode is currently active for a user
   * Requirements: 6.9 - Used to suspend enforcement during demo mode
   */
  async isInDemoMode(userId: string): Promise<boolean> {
    const stateResult = await this.getDemoModeState(userId);
    return stateResult.success && stateResult.data?.isActive === true;
  },

  /**
   * Process expired demo modes (called periodically)
   * Requirements: 6.6
   */
  async processExpiredDemoModes(): Promise<ServiceResult<{ processed: number }>> {
    try {
      // Find all active tokens that should have expired
      const activeTokens = await prisma.demoToken.findMany({
        where: {
          usedAt: { not: null },
          endedAt: null,
        },
        include: {
          user: {
            include: {
              settings: true,
            },
          },
        },
      });
      
      let processed = 0;
      const now = new Date();
      
      for (const token of activeTokens) {
        if (!token.usedAt) continue;
        
        const maxDuration = token.user.settings?.demoMaxDurationMinutes ?? DEFAULT_DEMO_MAX_DURATION_MINUTES;
        const expiresAt = new Date(token.usedAt.getTime() + maxDuration * 60 * 1000);
        
        if (now >= expiresAt) {
          await this.expireDemoMode(token.userId, token.id);
          processed++;
        }
      }
      
      return { success: true, data: { processed } };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to process expired demo modes',
        },
      };
    }
  },

  /**
   * Get the default configuration
   */
  getDefaultConfig(): DemoModeConfig {
    return {
      tokensPerMonth: DEFAULT_DEMO_TOKENS_PER_MONTH,
      maxDurationMinutes: DEFAULT_DEMO_MAX_DURATION_MINUTES,
      confirmationPhrase: DEFAULT_CONFIRMATION_PHRASE,
    };
  },

  /**
   * Get next token reset date
   */
  getNextTokenResetDate(): Date {
    return getMonthEnd();
  },

  /**
   * Check if user can activate demo mode
   * Returns detailed information about why activation may be blocked
   */
  async canActivateDemoMode(userId: string): Promise<ServiceResult<{
    canActivate: boolean;
    reason?: string;
    remainingTokens: number;
    hasActivePomodoro: boolean;
    isAlreadyActive: boolean;
    nextResetDate: Date;
  }>> {
    try {
      const [stateResult, remainingResult, hasPomodoro] = await Promise.all([
        this.getDemoModeState(userId),
        this.getRemainingTokens(userId),
        hasActivePomodoro(userId),
      ]);
      
      const isAlreadyActive = stateResult.success && stateResult.data?.isActive === true;
      const remainingTokens = remainingResult.success ? remainingResult.data! : 0;
      const nextResetDate = getMonthEnd();
      
      let canActivate = true;
      let reason: string | undefined;
      
      if (isAlreadyActive) {
        canActivate = false;
        reason = 'Demo mode is already active';
      } else if (hasPomodoro) {
        canActivate = false;
        reason = 'Cannot activate during an active pomodoro session';
      } else if (remainingTokens === 0) {
        canActivate = false;
        reason = `No demo tokens available. Tokens reset on ${nextResetDate.toLocaleDateString()}`;
      }
      
      return {
        success: true,
        data: {
          canActivate,
          reason,
          remainingTokens,
          hasActivePomodoro: hasPomodoro,
          isAlreadyActive,
          nextResetDate,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to check demo mode activation',
        },
      };
    }
  },
};

export default demoModeService;
