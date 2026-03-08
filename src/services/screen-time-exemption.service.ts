/**
 * Screen Time Exemption Service
 *
 * Manages temporary unblock exemptions for iOS Screen Time blocking.
 * Users can request temporary unblocks via AI chat (up to 3/day, max 15min each).
 *
 * Pattern: follows sleep-time.service.ts requestSnooze / isInSnooze / getRemainingSnoozes
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';
import { broadcastPolicyUpdate } from './socket-broadcast.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export const RequestTemporaryUnblockSchema = z.object({
  reasonText: z.string().min(1).max(500),
  duration: z.number().int().min(1).max(30),
  blockingReason: z.enum(['focus', 'over_rest', 'sleep']),
});

export type RequestTemporaryUnblockInput = z.infer<typeof RequestTemporaryUnblockSchema>;

export interface ActiveExemption {
  active: boolean;
  expiresAt: Date;
  blockingReason: string;
  duration: number;
}

// ---------------------------------------------------------------------------
// Timer management for auto-expiry
// ---------------------------------------------------------------------------

const activeTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const screenTimeExemptionService = {
  /**
   * Get active (unexpired, unrevoked) exemption for a user
   */
  async getActiveExemption(userId: string): Promise<ServiceResult<ActiveExemption | null>> {
    try {
      const now = new Date();
      const exemption = await prisma.screenTimeExemption.findFirst({
        where: {
          userId,
          expiresAt: { gt: now },
          revokedAt: null,
        },
        orderBy: { grantedAt: 'desc' },
      });

      if (!exemption) {
        return { success: true, data: null };
      }

      return {
        success: true,
        data: {
          active: true,
          expiresAt: exemption.expiresAt,
          blockingReason: exemption.blockingReason,
          duration: exemption.duration,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get active exemption',
        },
      };
    }
  },

  /**
   * Get remaining unblock attempts for today
   */
  async getRemainingUnblocks(userId: string): Promise<ServiceResult<{ remaining: number; limit: number }>> {
    try {
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
        select: { tempUnblockDailyLimit: true },
      });

      const dailyLimit = settings?.tempUnblockDailyLimit ?? 3;

      // Count today's exemptions (since midnight)
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const usedCount = await prisma.screenTimeExemption.count({
        where: {
          userId,
          grantedAt: { gte: today },
        },
      });

      const remaining = Math.max(0, dailyLimit - usedCount);
      return { success: true, data: { remaining, limit: dailyLimit } };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get remaining unblocks',
        },
      };
    }
  },

  /**
   * Request a temporary unblock
   */
  async requestTemporaryUnblock(
    userId: string,
    input: RequestTemporaryUnblockInput
  ): Promise<ServiceResult<{ id: string; expiresAt: Date; duration: number; blockingReason: string }>> {
    try {
      const validated = RequestTemporaryUnblockSchema.parse(input);

      // Get user settings for limits
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
        select: { tempUnblockDailyLimit: true, tempUnblockMaxDuration: true },
      });

      const dailyLimit = settings?.tempUnblockDailyLimit ?? 3;
      const maxDuration = settings?.tempUnblockMaxDuration ?? 15;

      // Check remaining count
      const remainingResult = await this.getRemainingUnblocks(userId);
      if (!remainingResult.success || !remainingResult.data) {
        return {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to check remaining unblocks' },
        };
      }

      if (remainingResult.data.remaining <= 0) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `已达到每日临时解锁上限 (${dailyLimit} 次)`,
          },
        };
      }

      // Check for already active exemption
      const activeResult = await this.getActiveExemption(userId);
      if (activeResult.success && activeResult.data?.active) {
        return {
          success: false,
          error: {
            code: 'CONFLICT',
            message: `已有一个活跃的临时解锁（到期时间: ${activeResult.data.expiresAt.toLocaleTimeString()}）`,
          },
        };
      }

      // Clamp duration
      const clampedDuration = Math.min(validated.duration, maxDuration);

      // Create exemption record
      const now = new Date();
      const expiresAt = new Date(now.getTime() + clampedDuration * 60 * 1000);

      const exemption = await prisma.screenTimeExemption.create({
        data: {
          userId,
          blockingReason: validated.blockingReason,
          reasonText: validated.reasonText,
          duration: clampedDuration,
          grantedAt: now,
          expiresAt,
        },
      });

      // Schedule timer for expiry → re-push policy
      this._scheduleExpiryTimer(userId, exemption.id, expiresAt);

      // Immediately broadcast policy update so iOS sees the unblock
      broadcastPolicyUpdate(userId).catch((err) => {
        console.error('[ScreenTimeExemption] Failed to broadcast policy update:', err);
      });

      return {
        success: true,
        data: {
          id: exemption.id,
          expiresAt: exemption.expiresAt,
          duration: clampedDuration,
          blockingReason: validated.blockingReason,
        },
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid request parameters' },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to request temporary unblock',
        },
      };
    }
  },

  /**
   * Revoke an active temporary unblock early
   */
  async revokeTemporaryUnblock(userId: string): Promise<ServiceResult<{ revoked: boolean }>> {
    try {
      const now = new Date();
      const active = await prisma.screenTimeExemption.findFirst({
        where: {
          userId,
          expiresAt: { gt: now },
          revokedAt: null,
        },
        orderBy: { grantedAt: 'desc' },
      });

      if (!active) {
        return { success: true, data: { revoked: false } };
      }

      // Mark as revoked
      await prisma.screenTimeExemption.update({
        where: { id: active.id },
        data: { revokedAt: now },
      });

      // Clear scheduled timer
      const existingTimer = activeTimers.get(active.id);
      if (existingTimer) {
        clearTimeout(existingTimer);
        activeTimers.delete(active.id);
      }

      // Re-push policy
      broadcastPolicyUpdate(userId).catch((err) => {
        console.error('[ScreenTimeExemption] Failed to broadcast policy update on revoke:', err);
      });

      return { success: true, data: { revoked: true } };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to revoke temporary unblock',
        },
      };
    }
  },

  /**
   * Get exemption history for analytics
   */
  async getExemptionHistory(
    userId: string,
    days: number = 7
  ): Promise<ServiceResult<Array<{
    id: string;
    blockingReason: string;
    reasonText: string;
    duration: number;
    grantedAt: Date;
    expiresAt: Date;
    revokedAt: Date | null;
  }>>> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      const exemptions = await prisma.screenTimeExemption.findMany({
        where: {
          userId,
          grantedAt: { gte: startDate },
        },
        orderBy: { grantedAt: 'desc' },
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
   * Restore active timers on server restart.
   * Scans for unexpired, unrevoked exemptions and re-schedules their expiry.
   */
  async restoreActiveTimers(): Promise<void> {
    try {
      const now = new Date();
      const activeExemptions = await prisma.screenTimeExemption.findMany({
        where: {
          expiresAt: { gt: now },
          revokedAt: null,
        },
      });

      for (const exemption of activeExemptions) {
        this._scheduleExpiryTimer(exemption.userId, exemption.id, exemption.expiresAt);
      }

      if (activeExemptions.length > 0) {
        console.log(`[ScreenTimeExemption] Restored ${activeExemptions.length} active timer(s)`);
      }
    } catch (error) {
      console.error('[ScreenTimeExemption] Failed to restore active timers:', error);
    }
  },

  /**
   * Internal: schedule a timer that re-pushes policy when exemption expires
   */
  _scheduleExpiryTimer(userId: string, exemptionId: string, expiresAt: Date): void {
    // Clear any existing timer for this exemption
    const existing = activeTimers.get(exemptionId);
    if (existing) {
      clearTimeout(existing);
    }

    const delay = Math.max(0, expiresAt.getTime() - Date.now());
    const timer = setTimeout(() => {
      activeTimers.delete(exemptionId);
      console.log(`[ScreenTimeExemption] Exemption ${exemptionId} expired for user ${userId}, re-broadcasting policy`);
      broadcastPolicyUpdate(userId).catch((err) => {
        console.error('[ScreenTimeExemption] Failed to broadcast policy update on expiry:', err);
      });
    }, delay);

    activeTimers.set(exemptionId, timer);
  },
};

export default screenTimeExemptionService;
