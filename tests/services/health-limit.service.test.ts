import { describe, it, expect, beforeEach, vi } from 'vitest';
import { healthLimitService } from '../../src/services/health-limit.service';
import { prisma } from '../../src/lib/prisma';

describe('HealthLimitService', () => {
  const userId = 'test-user-id';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('check2HourLimit', () => {
    it('should return false when total minutes below limit', async () => {
      const now = new Date();
      vi.spyOn(prisma.pomodoro, 'findMany').mockResolvedValue([
        { duration: 25, completedAt: new Date(now.getTime() - 30 * 60 * 1000) },
        { duration: 25, completedAt: new Date(now.getTime() - 60 * 60 * 1000) },
      ] as any);
      vi.spyOn(prisma.userSettings, 'findUnique').mockResolvedValue({
        healthLimit2Hours: 110,
      } as any);

      const result = await healthLimitService.check2HourLimit(userId);
      expect(result).toBe(false);
    });

    it('should return true when total minutes exceeds limit', async () => {
      const now = new Date();
      vi.spyOn(prisma.pomodoro, 'findMany').mockResolvedValue([
        { duration: 50, completedAt: new Date(now.getTime() - 30 * 60 * 1000) },
        { duration: 50, completedAt: new Date(now.getTime() - 60 * 60 * 1000) },
        { duration: 25, completedAt: new Date(now.getTime() - 90 * 60 * 1000) },
      ] as any);
      vi.spyOn(prisma.userSettings, 'findUnique').mockResolvedValue({
        healthLimit2Hours: 110,
      } as any);

      const result = await healthLimitService.check2HourLimit(userId);
      expect(result).toBe(true);
    });
  });
});
