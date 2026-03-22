import { describe, it, expect, beforeEach, vi } from 'vitest';
import { restEnforcementService } from '../../src/services/rest-enforcement.service';
import { healthLimitService } from '../../src/services/health-limit.service';
import { broadcastPolicyUpdate } from '../../src/services/socket-broadcast.service';
import { prisma } from '../../src/lib/prisma';

vi.mock('../../src/services/health-limit.service', () => ({
  healthLimitService: {
    checkHealthLimit: vi.fn(),
    canUseSkipToken: vi.fn(),
    consumeSkipToken: vi.fn(),
  },
}));

vi.mock('../../src/services/socket-broadcast.service', () => ({
  broadcastPolicyUpdate: vi.fn().mockResolvedValue(undefined),
}));

describe('RestEnforcementService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requestGrace', () => {
    it('should grant grace when under limit', async () => {
      const userId = 'user-1';
      const pomodoroId = 'pomodoro-1';

      vi.spyOn(prisma.userSettings, 'findUnique').mockResolvedValue({
        restGraceLimit: 3,
        restGraceDuration: 2,
      } as any);

      vi.spyOn(prisma.restExemption, 'count').mockResolvedValue(0);

      vi.spyOn(prisma.restExemption, 'create').mockResolvedValue({
        id: 'exemption-1',
        userId,
        pomodoroId,
        type: 'GRACE',
        grantedAt: new Date(),
        expiresAt: new Date(Date.now() + 2 * 60 * 1000),
      } as any);

      const result = await restEnforcementService.requestGrace(
        userId,
        pomodoroId
      );

      expect(result.granted).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it('should deny grace when limit exceeded', async () => {
      const userId = 'user-1';
      const pomodoroId = 'pomodoro-1';

      vi.spyOn(prisma.userSettings, 'findUnique').mockResolvedValue({
        restGraceLimit: 2,
        restGraceDuration: 2,
      } as any);

      vi.spyOn(prisma.restExemption, 'count').mockResolvedValue(2);

      const result = await restEnforcementService.requestGrace(
        userId,
        pomodoroId
      );

      expect(result.granted).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });

  describe('getActiveGrace', () => {
    it('should return null when no active grace exists', async () => {
      const userId = 'user-1';

      vi.spyOn(prisma.restExemption, 'findFirst').mockResolvedValue(null);

      const result = await restEnforcementService.getActiveGrace(userId);

      expect(result).toBeNull();
      expect(prisma.restExemption.findFirst).toHaveBeenCalledWith({
        where: {
          userId,
          type: 'grace',
          expiresAt: { gt: expect.any(Date) },
        },
        orderBy: { grantedAt: 'desc' },
      });
    });

    it('should return exemption when active grace exists', async () => {
      const userId = 'user-1';
      const exemption = {
        id: 'exemption-1',
        userId,
        pomodoroId: 'pomodoro-1',
        type: 'grace',
        grantedAt: new Date(),
        expiresAt: new Date(Date.now() + 2 * 60 * 1000),
      };

      vi.spyOn(prisma.restExemption, 'findFirst').mockResolvedValue(
        exemption as any
      );

      const result = await restEnforcementService.getActiveGrace(userId);

      expect(result).toEqual(exemption);
    });
  });

  describe('getGraceInfo', () => {
    it('should return correct info with no active grace and no pomodoro', async () => {
      const userId = 'user-1';

      vi.spyOn(prisma.userSettings, 'findUnique').mockResolvedValue({
        restGraceLimit: 3,
        restGraceDuration: 5,
      } as any);

      vi.spyOn(prisma.restExemption, 'findFirst').mockResolvedValue(null);

      const result = await restEnforcementService.getGraceInfo(userId);

      expect(result).toEqual({
        activeGrace: false,
        remaining: 3,
        durationMinutes: 5,
      });
    });

    it('should correctly count remaining grace requests for a pomodoro', async () => {
      const userId = 'user-1';
      const pomodoroId = 'pomodoro-1';

      vi.spyOn(prisma.userSettings, 'findUnique').mockResolvedValue({
        restGraceLimit: 3,
        restGraceDuration: 2,
      } as any);

      vi.spyOn(prisma.restExemption, 'findFirst').mockResolvedValue(null);
      vi.spyOn(prisma.restExemption, 'count').mockResolvedValue(2);

      const result = await restEnforcementService.getGraceInfo(
        userId,
        pomodoroId
      );

      expect(result).toEqual({
        activeGrace: false,
        remaining: 1,
        durationMinutes: 2,
      });
    });

    it('should return activeGrace true when grace exemption is active', async () => {
      const userId = 'user-1';
      const pomodoroId = 'pomodoro-1';

      vi.spyOn(prisma.userSettings, 'findUnique').mockResolvedValue({
        restGraceLimit: 2,
        restGraceDuration: 2,
      } as any);

      vi.spyOn(prisma.restExemption, 'findFirst').mockResolvedValue({
        id: 'exemption-1',
        userId,
        pomodoroId,
        type: 'grace',
        grantedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 1000),
      } as any);

      vi.spyOn(prisma.restExemption, 'count').mockResolvedValue(1);

      const result = await restEnforcementService.getGraceInfo(
        userId,
        pomodoroId
      );

      expect(result).toEqual({
        activeGrace: true,
        remaining: 1,
        durationMinutes: 2,
      });
    });

    it('should use default values when settings are null', async () => {
      const userId = 'user-1';

      vi.spyOn(prisma.userSettings, 'findUnique').mockResolvedValue(null);
      vi.spyOn(prisma.restExemption, 'findFirst').mockResolvedValue(null);

      const result = await restEnforcementService.getGraceInfo(userId);

      expect(result).toEqual({
        activeGrace: false,
        remaining: 2,
        durationMinutes: 2,
      });
    });

    it('should clamp remaining to zero when grace count exceeds limit', async () => {
      const userId = 'user-1';
      const pomodoroId = 'pomodoro-1';

      vi.spyOn(prisma.userSettings, 'findUnique').mockResolvedValue({
        restGraceLimit: 2,
        restGraceDuration: 2,
      } as any);

      vi.spyOn(prisma.restExemption, 'findFirst').mockResolvedValue(null);
      vi.spyOn(prisma.restExemption, 'count').mockResolvedValue(5);

      const result = await restEnforcementService.getGraceInfo(
        userId,
        pomodoroId
      );

      expect(result.remaining).toBe(0);
    });
  });

  describe('grace expiry rebroadcast', () => {
    it('should schedule policy rebroadcast when grace is granted', async () => {
      vi.useFakeTimers();
      const userId = 'user-1';
      const pomodoroId = 'pomodoro-1';

      vi.spyOn(prisma.userSettings, 'findUnique').mockResolvedValue({
        restGraceLimit: 3,
        restGraceDuration: 2,
      } as any);

      vi.spyOn(prisma.restExemption, 'count').mockResolvedValue(0);
      vi.spyOn(prisma.restExemption, 'create').mockResolvedValue({
        id: 'exemption-1',
        userId,
        pomodoroId,
        type: 'grace',
        grantedAt: new Date(),
        expiresAt: new Date(Date.now() + 2 * 60 * 1000),
      } as any);

      await restEnforcementService.requestGrace(userId, pomodoroId);

      // Should not have called broadcast yet
      expect(broadcastPolicyUpdate).not.toHaveBeenCalled();

      // Advance time by 2 minutes
      await vi.advanceTimersByTimeAsync(2 * 60 * 1000);

      expect(broadcastPolicyUpdate).toHaveBeenCalledWith(userId);

      vi.useRealTimers();
    });
  });

  describe('requestSkipRest', () => {
    it('should allow skip when health limit not exceeded', async () => {
      const userId = 'user-1';

      vi.mocked(healthLimitService.checkHealthLimit).mockResolvedValue({
        exceeded: false,
        type: null,
      });

      vi.spyOn(prisma.restExemption, 'create').mockResolvedValue({
        id: 'exemption-1',
        userId,
        type: 'SKIP_REST',
        grantedAt: new Date(),
        expiresAt: null,
      } as any);

      const result = await restEnforcementService.requestSkipRest(userId);

      expect(result.allowed).toBe(true);
      expect(result.exemption).toBeDefined();
    });

    it('should deny skip when health limit exceeded and no tokens', async () => {
      const userId = 'user-1';

      vi.mocked(healthLimitService.checkHealthLimit).mockResolvedValue({
        exceeded: true,
        type: '2hours',
      });

      vi.mocked(healthLimitService.canUseSkipToken).mockResolvedValue({
        available: false,
        remaining: 0,
      });

      const result = await restEnforcementService.requestSkipRest(userId);

      expect(result.allowed).toBe(false);
      expect(result.tokenRemaining).toBe(0);
    });

    it('should allow skip when health limit exceeded but token available', async () => {
      const userId = 'user-1';

      vi.mocked(healthLimitService.checkHealthLimit).mockResolvedValue({
        exceeded: true,
        type: 'daily',
      });

      vi.mocked(healthLimitService.canUseSkipToken).mockResolvedValue({
        available: true,
        remaining: 3,
      });

      vi.mocked(healthLimitService.consumeSkipToken).mockResolvedValue({
        success: true,
        remaining: 2,
      });

      vi.spyOn(prisma.restExemption, 'create').mockResolvedValue({
        id: 'exemption-1',
        userId,
        type: 'SKIP_REST',
        grantedAt: new Date(),
        expiresAt: null,
      } as any);

      const result = await restEnforcementService.requestSkipRest(userId);

      expect(result.allowed).toBe(true);
      expect(result.exemption).toBeDefined();
      expect(result.tokenRemaining).toBe(2);
    });
  });
});
