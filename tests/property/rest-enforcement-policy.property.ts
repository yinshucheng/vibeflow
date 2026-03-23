import fc from 'fast-check';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { policyDistributionService } from '../../src/services/policy-distribution.service';
import { prisma } from '../../src/lib/prisma';

/**
 * Feature: desktop-rest-enforcement
 * Task 16: Property tests for REST enforcement policy
 *
 * Properties tested:
 * 1. compilePolicy always includes restEnforcement when state=IDLE + enabled + no grace
 * 2. compilePolicy never includes restEnforcement when state != IDLE
 * 3. Grace count never exceeds restGraceLimit
 * 4. getActiveGrace returns null after exemption expires
 */

// =============================================================================
// MODULE MOCKS (must be before imports that use them)
// =============================================================================

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

// =============================================================================
// BASE SETTINGS
// =============================================================================

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

// =============================================================================
// GENERATORS
// =============================================================================

/**
 * Generator for work app entries
 */
const workAppArb = fc.record({
  bundleId: fc.stringMatching(/^com\.[a-z]{3,10}\.[a-z]{3,10}$/),
  name: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
});

/**
 * Generator for work app arrays (0-10 apps)
 */
const workAppsArb = fc.array(workAppArb, { minLength: 0, maxLength: 10 });

/**
 * Generator for REST enforcement actions
 */
const restActionsArb = fc.subarray(['close', 'hide'], { minLength: 0 });

/**
 * Generator for grace limit (1-5 as per settings UI)
 */
const graceLimitArb = fc.integer({ min: 1, max: 5 });

/**
 * Generator for grace duration (1-10 minutes as per settings UI)
 */
const graceDurationArb = fc.integer({ min: 1, max: 10 });

/**
 * Generator for all daily states that are NOT 'idle'
 * (idle is the state that triggers rest enforcement)
 */
const nonIdleStateArb = fc.constantFrom(
  'focus' as const,
  'over_rest' as const
);

// =============================================================================
// TEST SETUP
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();

  // Default: no skip token usage, no policy versions
  vi.spyOn(prisma.skipTokenUsage, 'findUnique').mockResolvedValue(null);
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

  // Default: state is idle (not rest)
  vi.mocked(dailyStateService.getCurrentState).mockResolvedValue({
    success: true,
    data: 'idle',
  });
});

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Property: REST enforcement policy compilation', () => {
  it('compilePolicy always includes restEnforcement when state=IDLE + enabled + no grace', async () => {
    await fc.assert(
      fc.asyncProperty(
        workAppsArb,
        restActionsArb,
        graceLimitArb,
        graceDurationArb,
        async (workApps, actions, graceLimit, graceDuration) => {
          vi.clearAllMocks();

          // Setup: REST enforcement enabled, state=IDLE, no active grace
          vi.spyOn(prisma.userSettings, 'findUnique').mockResolvedValue({
            ...baseSettings,
            restEnforcementEnabled: true,
            restEnforcementActions: actions,
            restGraceLimit: graceLimit,
            restGraceDuration: graceDuration,
            workApps,
          } as any);
          vi.spyOn(prisma.skipTokenUsage, 'findUnique').mockResolvedValue(null);
          const policyVersionMock = { findFirst: vi.fn().mockResolvedValue(null) };
          Object.defineProperty(prisma, 'policyVersion', {
            value: policyVersionMock,
            configurable: true,
          });

          vi.mocked(dailyStateService.getCurrentState).mockResolvedValue({
            success: true,
            data: 'idle',
          });

          vi.spyOn(prisma.pomodoro, 'findFirst').mockResolvedValue({
            id: 'pomodoro-gen',
            endTime: new Date(),
          } as any);

          vi.mocked(restEnforcementService.getGraceInfo).mockResolvedValue({
            activeGrace: false,
            remaining: graceLimit,
            durationMinutes: graceDuration,
          });

          vi.mocked(healthLimitService.checkHealthLimit).mockResolvedValue({
            exceeded: false,
            type: null,
          });

          const result = await policyDistributionService.compilePolicy('user-1');

          // Property: restEnforcement MUST be present
          expect(result.success).toBe(true);
          expect(result.data?.restEnforcement).toBeDefined();
          expect(result.data!.restEnforcement!.isActive).toBe(true);

          // Work apps should match input
          expect(result.data!.restEnforcement!.workApps).toHaveLength(workApps.length);
          for (let i = 0; i < workApps.length; i++) {
            expect(result.data!.restEnforcement!.workApps[i].bundleId).toBe(workApps[i].bundleId);
            expect(result.data!.restEnforcement!.workApps[i].name).toBe(workApps[i].name);
          }

          // Actions: should use input or default to ['close'] when empty
          const expectedActions = actions.length > 0 ? actions : ['close'];
          expect(result.data!.restEnforcement!.actions).toEqual(expectedActions);

          // Grace info should be passed through
          expect(result.data!.restEnforcement!.grace).toEqual({
            available: graceLimit > 0,
            remaining: graceLimit,
            durationMinutes: graceDuration,
          });

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('compilePolicy never includes restEnforcement when state != IDLE', async () => {
    await fc.assert(
      fc.asyncProperty(
        nonIdleStateArb,
        workAppsArb,
        fc.boolean(),
        async (state, workApps, enabled) => {
          vi.clearAllMocks();

          vi.spyOn(prisma.userSettings, 'findUnique').mockResolvedValue({
            ...baseSettings,
            restEnforcementEnabled: enabled,
            restEnforcementActions: ['close'],
            workApps,
          } as any);
          vi.spyOn(prisma.skipTokenUsage, 'findUnique').mockResolvedValue(null);
          const policyVersionMock = { findFirst: vi.fn().mockResolvedValue(null) };
          Object.defineProperty(prisma, 'policyVersion', {
            value: policyVersionMock,
            configurable: true,
          });

          vi.mocked(dailyStateService.getCurrentState).mockResolvedValue({
            success: true,
            data: state,
          });

          vi.mocked(healthLimitService.checkHealthLimit).mockResolvedValue({
            exceeded: false,
            type: null,
          });

          const result = await policyDistributionService.compilePolicy('user-1');

          // Property: restEnforcement MUST NOT be present when state != IDLE
          expect(result.success).toBe(true);
          expect(result.data?.restEnforcement).toBeUndefined();

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property: Grace count never exceeds restGraceLimit', () => {
  it('getGraceInfo.remaining is always in [0, graceLimit]', async () => {
    await fc.assert(
      fc.asyncProperty(
        graceLimitArb,
        graceDurationArb,
        fc.integer({ min: 0, max: 20 }), // graceCount: can be anything DB returns
        fc.boolean(), // hasActiveGrace
        fc.option(fc.uuid(), { nil: undefined }), // pomodoroId
        async (graceLimit, graceDuration, graceCount, hasActiveGrace, pomodoroId) => {
          vi.clearAllMocks();

          // Import the real service (not mocked) for this test
          // We mock Prisma directly instead
          const { restEnforcementService: realService } =
            await vi.importActual<typeof import('../../src/services/rest-enforcement.service')>(
              '../../src/services/rest-enforcement.service'
            );

          vi.spyOn(prisma.userSettings, 'findUnique').mockResolvedValue({
            restGraceLimit: graceLimit,
            restGraceDuration: graceDuration,
          } as any);

          vi.spyOn(prisma.restExemption, 'findFirst').mockResolvedValue(
            hasActiveGrace
              ? ({
                  id: 'exemption-1',
                  userId: 'user-1',
                  pomodoroId: pomodoroId ?? null,
                  type: 'grace',
                  grantedAt: new Date(),
                  expiresAt: new Date(Date.now() + 60 * 1000),
                } as any)
              : null
          );

          vi.spyOn(prisma.restExemption, 'count').mockResolvedValue(graceCount);

          const result = await realService.getGraceInfo('user-1', pomodoroId);

          // Property: remaining is always in [0, graceLimit]
          expect(result.remaining).toBeGreaterThanOrEqual(0);
          expect(result.remaining).toBeLessThanOrEqual(graceLimit);

          // Property: remaining = max(0, graceLimit - graceCount) when pomodoroId given
          if (pomodoroId) {
            expect(result.remaining).toBe(Math.max(0, graceLimit - graceCount));
          } else {
            // No pomodoroId → graceCount is 0, so remaining = graceLimit
            expect(result.remaining).toBe(graceLimit);
          }

          // Property: activeGrace matches input
          expect(result.activeGrace).toBe(hasActiveGrace);

          // Property: durationMinutes matches setting
          expect(result.durationMinutes).toBe(graceDuration);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('requestGrace never grants more than graceLimit times per pomodoro', async () => {
    await fc.assert(
      fc.asyncProperty(
        graceLimitArb,
        graceDurationArb,
        fc.integer({ min: 0, max: 10 }), // currentCount: existing grace exemptions
        async (graceLimit, graceDuration, currentCount) => {
          vi.clearAllMocks();

          const { restEnforcementService: realService } =
            await vi.importActual<typeof import('../../src/services/rest-enforcement.service')>(
              '../../src/services/rest-enforcement.service'
            );

          vi.spyOn(prisma.userSettings, 'findUnique').mockResolvedValue({
            restGraceLimit: graceLimit,
            restGraceDuration: graceDuration,
          } as any);

          vi.spyOn(prisma.restExemption, 'count').mockResolvedValue(currentCount);
          vi.spyOn(prisma.restExemption, 'create').mockResolvedValue({
            id: 'new-exemption',
            userId: 'user-1',
            pomodoroId: 'pomodoro-1',
            type: 'grace',
            grantedAt: new Date(),
            expiresAt: new Date(Date.now() + graceDuration * 60 * 1000),
          } as any);

          const result = await realService.requestGrace('user-1', 'pomodoro-1');

          if (currentCount >= graceLimit) {
            // Property: when at or over limit, grace MUST be denied
            expect(result.granted).toBe(false);
            expect(result.remaining).toBe(0);
          } else {
            // Property: when under limit, grace is granted
            expect(result.granted).toBe(true);
            // remaining = graceLimit - currentCount - 1 (the one just granted)
            expect(result.remaining).toBe(graceLimit - currentCount - 1);
            expect(result.remaining).toBeGreaterThanOrEqual(0);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property: getActiveGrace returns null after exemption expires', () => {
  it('getActiveGrace queries only for non-expired exemptions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.boolean(), // whether there is a non-expired exemption
        async (userId, hasNonExpired) => {
          vi.clearAllMocks();

          const { restEnforcementService: realService } =
            await vi.importActual<typeof import('../../src/services/rest-enforcement.service')>(
              '../../src/services/rest-enforcement.service'
            );

          const mockExemption = hasNonExpired
            ? {
                id: 'exemption-1',
                userId,
                pomodoroId: 'pomodoro-1',
                type: 'grace',
                grantedAt: new Date(Date.now() - 60 * 1000),
                expiresAt: new Date(Date.now() + 60 * 1000), // future
              }
            : null;

          vi.spyOn(prisma.restExemption, 'findFirst').mockResolvedValue(
            mockExemption as any
          );

          const result = await realService.getActiveGrace(userId);

          if (hasNonExpired) {
            // Property: returns the exemption when one exists
            expect(result).not.toBeNull();
            expect(result!.userId).toBe(userId);
          } else {
            // Property: returns null when no non-expired exemption exists
            expect(result).toBeNull();
          }

          // Property: always queries with expiresAt > now
          expect(prisma.restExemption.findFirst).toHaveBeenCalledWith({
            where: {
              userId,
              type: 'grace',
              expiresAt: { gt: expect.any(Date) },
            },
            orderBy: { grantedAt: 'desc' },
          });

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('expired exemptions are never returned by getActiveGrace', async () => {
    /**
     * This property verifies the contract: the query filters by expiresAt > now,
     * so if Prisma returns null (no matching record), getActiveGrace returns null.
     * We simulate various time scenarios to ensure the contract holds.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({ min: -120, max: 120 }), // offset in minutes from now
        async (userId, offsetMinutes) => {
          vi.clearAllMocks();

          const { restEnforcementService: realService } =
            await vi.importActual<typeof import('../../src/services/rest-enforcement.service')>(
              '../../src/services/rest-enforcement.service'
            );

          const expiresAt = new Date(Date.now() + offsetMinutes * 60 * 1000);
          const isExpired = offsetMinutes <= 0;

          // Prisma would filter correctly: only return if expiresAt > now
          vi.spyOn(prisma.restExemption, 'findFirst').mockResolvedValue(
            isExpired
              ? null
              : ({
                  id: 'exemption-1',
                  userId,
                  pomodoroId: 'pomodoro-1',
                  type: 'grace',
                  grantedAt: new Date(Date.now() - 10 * 60 * 1000),
                  expiresAt,
                } as any)
          );

          const result = await realService.getActiveGrace(userId);

          if (isExpired) {
            // Property: expired exemptions → null
            expect(result).toBeNull();
          } else {
            // Property: non-expired exemptions → returned
            expect(result).not.toBeNull();
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
