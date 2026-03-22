import { RestExemption } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { healthLimitService } from './health-limit.service';
import { broadcastPolicyUpdate } from './socket-broadcast.service';

export interface GraceRequestResult {
  granted: boolean;
  remaining: number;
}

export interface GraceInfo {
  activeGrace: boolean;
  remaining: number;
  durationMinutes: number;
}

export interface SkipRestResult {
  allowed: boolean;
  exemption?: RestExemption;
  reason?: string;
  tokenRemaining?: number;
}

class RestEnforcementService {
  private graceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  async requestGrace(
    userId: string,
    pomodoroId: string
  ): Promise<GraceRequestResult> {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    const graceLimit = settings?.restGraceLimit ?? 2;

    // Count grace requests for this pomodoro
    const graceCount = await prisma.restExemption.count({
      where: {
        userId,
        pomodoroId,
        type: 'grace',
      },
    });

    if (graceCount >= graceLimit) {
      return {
        granted: false,
        remaining: 0,
      };
    }

    const graceDuration = settings?.restGraceDuration ?? 2;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + graceDuration * 60 * 1000);
    const exemption = await prisma.restExemption.create({
      data: {
        userId,
        pomodoroId,
        type: 'grace',
        grantedAt: now,
        expiresAt,
      },
    });

    // Schedule policy rebroadcast when grace expires
    this._scheduleGraceExpiryTimer(userId, exemption.id, expiresAt);

    return {
      granted: true,
      remaining: graceLimit - graceCount - 1,
    };
  }

  /** @deprecated Skip rest is no longer supported. Users stay in rest until starting next pomodoro. */
  async requestSkipRest(userId: string): Promise<SkipRestResult> {
    console.warn('[RestEnforcement] requestSkipRest is deprecated. Users should start a pomodoro from rest state.');
    const healthLimit = await healthLimitService.checkHealthLimit(userId);

    if (!healthLimit.exceeded) {
      const exemption = await prisma.restExemption.create({
        data: {
          userId,
          type: 'skip',
          grantedAt: new Date(),
          expiresAt: null,
        },
      });

      return {
        allowed: true,
        exemption,
      };
    }

    const tokenStatus = await healthLimitService.canUseSkipToken(userId);

    if (!tokenStatus.available) {
      return {
        allowed: false,
        reason: `Health limit exceeded, no skip tokens remaining`,
        tokenRemaining: 0,
      };
    }

    const consumeResult = await healthLimitService.consumeSkipToken(userId);

    if (!consumeResult.success) {
      return {
        allowed: false,
        reason: 'Failed to consume skip token',
        tokenRemaining: tokenStatus.remaining,
      };
    }

    const exemption = await prisma.restExemption.create({
      data: {
        userId,
        type: 'skip',
        grantedAt: new Date(),
        expiresAt: null,
      },
    });

    return {
      allowed: true,
      exemption,
      tokenRemaining: consumeResult.remaining,
    };
  }

  async shouldEnforceRest(userId: string, pomodoroId: string): Promise<boolean> {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    });
    return settings?.restEnforcementEnabled ?? false;
  }

  async enforceWorkAppBlock(userId: string, actions: string[]): Promise<void> {
    console.log(`[RestEnforcement] Placeholder: enforceWorkAppBlock for user ${userId}, actions:`, actions);
  }

  async getActiveGrace(userId: string): Promise<RestExemption | null> {
    return prisma.restExemption.findFirst({
      where: {
        userId,
        type: 'grace',
        expiresAt: { gt: new Date() },
      },
      orderBy: { grantedAt: 'desc' },
    });
  }

  async getGraceInfo(
    userId: string,
    pomodoroId?: string
  ): Promise<GraceInfo> {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    });
    const graceLimit = settings?.restGraceLimit ?? 2;
    const graceDuration = settings?.restGraceDuration ?? 2;

    const activeGrace = await this.getActiveGrace(userId);

    // Count grace requests for current pomodoro cycle
    const graceCount = pomodoroId
      ? await prisma.restExemption.count({
          where: { userId, pomodoroId, type: 'grace' },
        })
      : 0;

    return {
      activeGrace: !!activeGrace,
      remaining: Math.max(0, graceLimit - graceCount),
      durationMinutes: graceDuration,
    };
  }

  _scheduleGraceExpiryTimer(
    userId: string,
    exemptionId: string,
    expiresAt: Date
  ): void {
    // Clear any existing timer for this exemption
    const existing = this.graceTimers.get(exemptionId);
    if (existing) {
      clearTimeout(existing);
    }

    const delay = Math.max(0, expiresAt.getTime() - Date.now());
    const timer = setTimeout(() => {
      this.graceTimers.delete(exemptionId);
      console.log(
        `[RestEnforcement] Grace ${exemptionId} expired for user ${userId}, re-broadcasting policy`
      );
      broadcastPolicyUpdate(userId).catch((err) => {
        console.error(
          '[RestEnforcement] Failed to broadcast policy update on grace expiry:',
          err
        );
      });
    }, delay);

    this.graceTimers.set(exemptionId, timer);
  }
}

export const restEnforcementService = new RestEnforcementService();
