import { describe, it, expect, beforeEach, vi } from 'vitest';
import { policyDistributionService } from '../../src/services/policy-distribution.service';
import { prisma } from '../../src/lib/prisma';

// Mock all service dependencies
vi.mock('../../src/services/focus-session.service', () => ({
  focusSessionService: {
    getActiveSession: vi.fn().mockResolvedValue({ success: false }),
  },
}));

vi.mock('../../src/services/sleep-time.service', () => ({
  sleepTimeService: {
    getConfig: vi.fn().mockResolvedValue({ success: false }),
    isInSleepTime: vi.fn().mockResolvedValue({ success: false }),
    isInSnooze: vi.fn().mockResolvedValue({ success: false }),
  },
}));

vi.mock('../../src/services/over-rest.service', () => ({
  overRestService: {
    checkOverRestStatus: vi.fn().mockResolvedValue({ success: false }),
    getConfig: vi.fn().mockResolvedValue({ success: false }),
  },
}));

vi.mock('../../src/services/screen-time-exemption.service', () => ({
  screenTimeExemptionService: {
    getActiveExemption: vi.fn().mockResolvedValue({ success: false }),
  },
}));

vi.mock('../../src/services/rest-enforcement.service', () => ({
  restEnforcementService: {
    getActiveGrace: vi.fn(),
    getGraceInfo: vi.fn(),
  },
}));

vi.mock('../../src/services/daily-state.service', () => ({
  dailyStateService: {
    getCurrentState: vi.fn(),
  },
}));

vi.mock('../../src/services/health-limit.service', () => ({
  healthLimitService: {
    checkHealthLimit: vi.fn(),
  },
}));

import { restEnforcementService } from '../../src/services/rest-enforcement.service';
import { dailyStateService } from '../../src/services/daily-state.service';
import { healthLimitService } from '../../src/services/health-limit.service';

const baseSettings = {
  userId: 'user-1',
  blacklist: [],
  whitelist: [],
  enforcementMode: 'gentle',
  workTimeSlots: [],
  skipTokenDailyLimit: 3,
  skipTokenMaxDelay: 15,
  distractionApps: [],
  restEnforcementEnabled: false,
  restEnforcementActions: [] as string[],
  restGraceLimit: 2,
  restGraceDuration: 2,
  workApps: [],
};

describe('PolicyDistributionService', () => {
  const userId = 'user-1';

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: no skip token usage, no policy versions
    vi.spyOn(prisma.skipTokenUsage, 'findUnique').mockResolvedValue(null);
    vi.spyOn(prisma as any, 'policyVersion' as any).mockReturnValue(undefined);
    // Mock policyVersion.findFirst to return null (no existing versions)
    const policyVersionMock = {
      findFirst: vi.fn().mockResolvedValue(null),
    };
    Object.defineProperty(prisma, 'policyVersion', {
      value: policyVersionMock,
      configurable: true,
    });

    // Default: health limit not exceeded
    vi.mocked(healthLimitService.checkHealthLimit).mockResolvedValue({
      exceeded: false,
      type: null,
    });

    // Default: state is planning (not rest)
    vi.mocked(dailyStateService.getCurrentState).mockResolvedValue({
      success: true,
      data: 'planning',
    });
  });

  describe('REST enforcement in compilePolicy', () => {
    it('should include restEnforcement when state=REST and enabled, no active grace', async () => {
      const workApps = [
        { bundleId: 'com.apple.Xcode', name: 'Xcode' },
        { bundleId: 'com.jetbrains.intellij', name: 'IntelliJ' },
      ];

      vi.spyOn(prisma.userSettings, 'findUnique').mockResolvedValue({
        ...baseSettings,
        restEnforcementEnabled: true,
        restEnforcementActions: ['close'],
        workApps,
      } as any);

      vi.mocked(dailyStateService.getCurrentState).mockResolvedValue({
        success: true,
        data: 'rest',
      });

      vi.spyOn(prisma.pomodoro, 'findFirst').mockResolvedValue({
        id: 'pomodoro-1',
        endTime: new Date(),
      } as any);

      vi.mocked(restEnforcementService.getGraceInfo).mockResolvedValue({
        activeGrace: false,
        remaining: 2,
        durationMinutes: 2,
      });

      const result = await policyDistributionService.compilePolicy(userId);

      expect(result.success).toBe(true);
      expect(result.data?.restEnforcement).toBeDefined();
      expect(result.data!.restEnforcement!.isActive).toBe(true);
      expect(result.data!.restEnforcement!.workApps).toHaveLength(2);
      expect(result.data!.restEnforcement!.workApps[0].bundleId).toBe('com.apple.Xcode');
      expect(result.data!.restEnforcement!.actions).toEqual(['close']);
      expect(result.data!.restEnforcement!.grace).toEqual({
        available: true,
        remaining: 2,
        durationMinutes: 2,
      });
    });

    it('should omit restEnforcement when grace is active', async () => {
      vi.spyOn(prisma.userSettings, 'findUnique').mockResolvedValue({
        ...baseSettings,
        restEnforcementEnabled: true,
        restEnforcementActions: ['close'],
        workApps: [{ bundleId: 'com.apple.Xcode', name: 'Xcode' }],
      } as any);

      vi.mocked(dailyStateService.getCurrentState).mockResolvedValue({
        success: true,
        data: 'rest',
      });

      vi.spyOn(prisma.pomodoro, 'findFirst').mockResolvedValue({
        id: 'pomodoro-1',
        endTime: new Date(),
      } as any);

      vi.mocked(restEnforcementService.getGraceInfo).mockResolvedValue({
        activeGrace: true,
        remaining: 1,
        durationMinutes: 2,
      });

      const result = await policyDistributionService.compilePolicy(userId);

      expect(result.success).toBe(true);
      expect(result.data?.restEnforcement).toBeUndefined();
    });

    it('should omit restEnforcement when state is not REST', async () => {
      vi.spyOn(prisma.userSettings, 'findUnique').mockResolvedValue({
        ...baseSettings,
        restEnforcementEnabled: true,
        restEnforcementActions: ['close'],
        workApps: [{ bundleId: 'com.apple.Xcode', name: 'Xcode' }],
      } as any);

      vi.mocked(dailyStateService.getCurrentState).mockResolvedValue({
        success: true,
        data: 'focus',
      });

      const result = await policyDistributionService.compilePolicy(userId);

      expect(result.success).toBe(true);
      expect(result.data?.restEnforcement).toBeUndefined();
      // Should not even call getGraceInfo when not in REST state
      expect(restEnforcementService.getGraceInfo).not.toHaveBeenCalled();
    });

    it('should omit restEnforcement when restEnforcementEnabled is false', async () => {
      vi.spyOn(prisma.userSettings, 'findUnique').mockResolvedValue({
        ...baseSettings,
        restEnforcementEnabled: false,
      } as any);

      vi.mocked(dailyStateService.getCurrentState).mockResolvedValue({
        success: true,
        data: 'rest',
      });

      const result = await policyDistributionService.compilePolicy(userId);

      expect(result.success).toBe(true);
      expect(result.data?.restEnforcement).toBeUndefined();
      // Should not check state when disabled
      expect(dailyStateService.getCurrentState).not.toHaveBeenCalled();
    });

    it('should use default action "close" when restEnforcementActions is empty', async () => {
      vi.spyOn(prisma.userSettings, 'findUnique').mockResolvedValue({
        ...baseSettings,
        restEnforcementEnabled: true,
        restEnforcementActions: [],
        workApps: [{ bundleId: 'com.app.test', name: 'Test' }],
      } as any);

      vi.mocked(dailyStateService.getCurrentState).mockResolvedValue({
        success: true,
        data: 'rest',
      });

      vi.spyOn(prisma.pomodoro, 'findFirst').mockResolvedValue({
        id: 'pomodoro-1',
        endTime: new Date(),
      } as any);

      vi.mocked(restEnforcementService.getGraceInfo).mockResolvedValue({
        activeGrace: false,
        remaining: 2,
        durationMinutes: 2,
      });

      const result = await policyDistributionService.compilePolicy(userId);

      expect(result.success).toBe(true);
      expect(result.data!.restEnforcement!.actions).toEqual(['close']);
    });
  });

  describe('healthLimit in compilePolicy', () => {
    it('should include healthLimit when 2-hour limit exceeded', async () => {
      vi.spyOn(prisma.userSettings, 'findUnique').mockResolvedValue({
        ...baseSettings,
      } as any);

      vi.mocked(healthLimitService.checkHealthLimit).mockResolvedValue({
        exceeded: true,
        type: '2hours',
      });

      const result = await policyDistributionService.compilePolicy(userId);

      expect(result.success).toBe(true);
      expect(result.data?.healthLimit).toBeDefined();
      expect(result.data!.healthLimit!.type).toBe('2hours');
      expect(result.data!.healthLimit!.message).toContain('2+ hours');
    });

    it('should include healthLimit when daily limit exceeded', async () => {
      vi.spyOn(prisma.userSettings, 'findUnique').mockResolvedValue({
        ...baseSettings,
      } as any);

      vi.mocked(healthLimitService.checkHealthLimit).mockResolvedValue({
        exceeded: true,
        type: 'daily',
      });

      const result = await policyDistributionService.compilePolicy(userId);

      expect(result.success).toBe(true);
      expect(result.data?.healthLimit).toBeDefined();
      expect(result.data!.healthLimit!.type).toBe('daily');
      expect(result.data!.healthLimit!.message).toContain('10 hours');
    });

    it('should omit healthLimit when not exceeded', async () => {
      vi.spyOn(prisma.userSettings, 'findUnique').mockResolvedValue({
        ...baseSettings,
      } as any);

      vi.mocked(healthLimitService.checkHealthLimit).mockResolvedValue({
        exceeded: false,
        type: null,
      });

      const result = await policyDistributionService.compilePolicy(userId);

      expect(result.success).toBe(true);
      expect(result.data?.healthLimit).toBeUndefined();
    });
  });
});
