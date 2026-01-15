import { describe, it, expect, beforeEach, vi } from 'vitest';
import { restEnforcementService } from '../../src/services/rest-enforcement.service';
import { healthLimitService } from '../../src/services/health-limit.service';
import { prisma } from '../../src/lib/prisma';

vi.mock('../../src/services/health-limit.service', () => ({
  healthLimitService: {
    checkHealthLimit: vi.fn(),
    canUseSkipToken: vi.fn(),
    consumeSkipToken: vi.fn(),
  },
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
