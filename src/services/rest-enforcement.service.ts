import { RestExemption } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { healthLimitService } from './health-limit.service';

export interface GraceRequestResult {
  granted: boolean;
  exemption?: RestExemption;
  remaining?: number;
}

export interface SkipRestResult {
  allowed: boolean;
  exemption?: RestExemption;
  reason?: string;
  tokenRemaining?: number;
}

class RestEnforcementService {
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
        type: 'GRACE',
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
    const exemption = await prisma.restExemption.create({
      data: {
        userId,
        pomodoroId,
        type: 'GRACE',
        grantedAt: now,
        expiresAt: new Date(now.getTime() + graceDuration * 60 * 1000),
      },
    });

    return {
      granted: true,
      exemption,
      remaining: graceLimit - graceCount - 1,
    };
  }

  async requestSkipRest(userId: string): Promise<SkipRestResult> {
    const healthLimit = await healthLimitService.checkHealthLimit(userId);

    if (!healthLimit.exceeded) {
      const exemption = await prisma.restExemption.create({
        data: {
          userId,
          type: 'SKIP_REST',
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
        type: 'SKIP_REST',
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
}

export const restEnforcementService = new RestEnforcementService();
