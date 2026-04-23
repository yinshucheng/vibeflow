/**
 * OVER_REST Time Window Integration Tests
 *
 * Tests the time window rules for OVER_REST:
 *   1. Non-work time: completing pomodoro should NOT trigger OVER_REST
 *   2. Work time ending: timer should NOT fire if work time has ended
 *   3. Sleep time: should exit OVER_REST (unless in focus session)
 *   4. Focus session: should allow OVER_REST even during sleep time
 *
 * These tests use direct service calls with mocked time conditions.
 */

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

// ── Test Database Setup ────────────────────────────────────────────────

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

const TEST_USER_EMAIL = 'over-rest-time-window-test@vibeflow.local';
let testUserId: string;

// ── Hoisted Mocks ──────────────────────────────────────────────────────

const mockCurrentTimeMinutes = vi.hoisted(() => vi.fn().mockReturnValue(600));
const mockIsTimeInSleepWindow = vi.hoisted(() => vi.fn().mockReturnValue(false));
const mockGetActiveSession = vi.hoisted(() => vi.fn().mockResolvedValue({ success: true, data: null }));

// ── Mock Setup ─────────────────────────────────────────────────────────

vi.mock('@/services/idle.service', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/idle.service')>();
  return {
    ...original,
    getCurrentTimeMinutes: () => mockCurrentTimeMinutes(),
    isWithinWorkHours: (slots: Array<{ startTime: string; endTime: string; enabled: boolean }>) => {
      const currentMinutes = mockCurrentTimeMinutes();
      return slots.some((slot) => {
        if (!slot.enabled) return false;
        const [startH, startM] = slot.startTime.split(':').map(Number);
        const [endH, endM] = slot.endTime.split(':').map(Number);
        const start = startH * 60 + startM;
        const end = endH * 60 + endM;
        return currentMinutes >= start && currentMinutes < end;
      });
    },
  };
});

// Mock isTimeInSleepWindow function used directly by timeWindowService
vi.mock('@/services/sleep-time.service', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/sleep-time.service')>();
  return {
    ...original,
    isTimeInSleepWindow: mockIsTimeInSleepWindow,
  };
});

vi.mock('@/services/focus-session.service', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/focus-session.service')>();
  return {
    ...original,
    focusSessionService: {
      ...original.focusSessionService,
      isInFocusSession: vi.fn().mockImplementation(async () => {
        const result = await mockGetActiveSession();
        return { success: true, data: result.data !== null };
      }),
      getActiveSession: mockGetActiveSession,
    },
  };
});

// Import after mocks
import { timeWindowService } from '@/services/time-window.service';

// ── Test Helpers ───────────────────────────────────────────────────────

function setCurrentTime(hours: number, minutes: number) {
  mockCurrentTimeMinutes.mockReturnValue(hours * 60 + minutes);
}

function setInSleepTime(value: boolean) {
  mockIsTimeInSleepWindow.mockReturnValue(value);
}

function setInFocusSession(value: boolean, sessionData?: { id: string; plannedEndTime: Date }) {
  if (value && sessionData) {
    mockGetActiveSession.mockResolvedValue({
      success: true,
      data: {
        id: sessionData.id,
        userId: testUserId,
        status: 'ACTIVE',
        duration: 60,
        startTime: new Date(Date.now() - 30 * 60 * 1000),
        plannedEndTime: sessionData.plannedEndTime,
        actualEndTime: null,
        overridesSleepTime: true,
        overridesWorkHours: true,
        createdAt: new Date(),
      },
    });
  } else {
    mockGetActiveSession.mockResolvedValue({ success: true, data: null });
  }
}

// ── Test Suite ─────────────────────────────────────────────────────────

describe('OVER_REST Time Window Rules', () => {
  beforeAll(async () => {
    // Create test user
    const user = await prisma.user.upsert({
      where: { email: TEST_USER_EMAIL },
      update: {},
      create: { email: TEST_USER_EMAIL, password: 'test-password-hash' },
    });
    testUserId = user.id;

    // Create user settings with work time 09:00-18:00 and sleep time enabled
    await prisma.userSettings.upsert({
      where: { userId: testUserId },
      update: {
        workTimeSlots: [{ id: '1', startTime: '09:00', endTime: '18:00', enabled: true }],
        shortRestDuration: 5,
        overRestGracePeriod: 5,
        sleepTimeEnabled: true,
        sleepTimeStart: '23:00',
        sleepTimeEnd: '07:00',
      },
      create: {
        userId: testUserId,
        workTimeSlots: [{ id: '1', startTime: '09:00', endTime: '18:00', enabled: true }],
        shortRestDuration: 5,
        overRestGracePeriod: 5,
        sleepTimeEnabled: true,
        sleepTimeStart: '23:00',
        sleepTimeEnd: '07:00',
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    if (testUserId) {
      await prisma.dailyState.deleteMany({ where: { userId: testUserId } });
      await prisma.userSettings.deleteMany({ where: { userId: testUserId } });
      await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: 10:00 AM (within work hours), not in sleep window, no focus session
    setCurrentTime(10, 0);
    setInSleepTime(false);
    setInFocusSession(false);
  });

  describe('TimeWindowService.isOverRestAllowed()', () => {
    it('should allow OVER_REST during work hours', async () => {
      setCurrentTime(10, 0); // 10:00 AM - within work hours

      const result = await timeWindowService.isOverRestAllowed(testUserId);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it('should NOT allow OVER_REST outside work hours (no focus session)', async () => {
      setCurrentTime(20, 0); // 8:00 PM - outside work hours

      const result = await timeWindowService.isOverRestAllowed(testUserId);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });

    it('should NOT allow OVER_REST during sleep time (no focus session)', async () => {
      setCurrentTime(23, 30); // 11:30 PM - outside work hours
      setInSleepTime(true);

      const result = await timeWindowService.isOverRestAllowed(testUserId);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });

    it('should allow OVER_REST in focus session (outside work hours)', async () => {
      setCurrentTime(20, 0); // 8:00 PM - outside work hours
      setInFocusSession(true, {
        id: 'focus-1',
        plannedEndTime: new Date(Date.now() + 60 * 60 * 1000),
      });

      const result = await timeWindowService.isOverRestAllowed(testUserId);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it('should allow OVER_REST in focus session even during sleep time', async () => {
      setCurrentTime(23, 30); // 11:30 PM
      setInSleepTime(true);
      setInFocusSession(true, {
        id: 'focus-1',
        plannedEndTime: new Date(Date.now() + 60 * 60 * 1000),
      });

      const result = await timeWindowService.isOverRestAllowed(testUserId);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });
  });

  describe('TimeWindowService.getCurrentContext()', () => {
    it('should return work_time period during work hours', async () => {
      setCurrentTime(10, 0);

      const result = await timeWindowService.getCurrentContext(testUserId);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.period).toBe('work_time');
        expect(result.data.expectedBehavior).toBe('pomodoro_cycle');
        expect(result.data.overRestAllowed).toBe(true);
      }
    });

    it('should return free_time period outside work hours', async () => {
      setCurrentTime(20, 0);

      const result = await timeWindowService.getCurrentContext(testUserId);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.period).toBe('free_time');
        expect(result.data.expectedBehavior).toBe('free');
        expect(result.data.overRestAllowed).toBe(false);
      }
    });

    it('should return sleep_time period during sleep time', async () => {
      setCurrentTime(23, 30);
      setInSleepTime(true);

      const result = await timeWindowService.getCurrentContext(testUserId);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.period).toBe('sleep_time');
        expect(result.data.expectedBehavior).toBe('sleep');
        expect(result.data.overRestAllowed).toBe(false);
      }
    });

    it('should return focus_session period when in focus session (highest priority)', async () => {
      setCurrentTime(23, 30);
      setInSleepTime(true);
      setInFocusSession(true, {
        id: 'focus-1',
        plannedEndTime: new Date(Date.now() + 60 * 60 * 1000),
      });

      const result = await timeWindowService.getCurrentContext(testUserId);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.period).toBe('focus_session');
        expect(result.data.expectedBehavior).toBe('pomodoro_cycle');
        expect(result.data.overRestAllowed).toBe(true);
        // Check that sleep time is still detected (just overridden by focus session)
        expect(result.data.checks.inSleepTime).toBe(true);
        expect(result.data.checks.inFocusSession).toBe(true);
      }
    });

    it('should include focus session details when active', async () => {
      const endTime = new Date(Date.now() + 45 * 60 * 1000); // 45 min from now
      setInFocusSession(true, { id: 'focus-abc', plannedEndTime: endTime });

      const result = await timeWindowService.getCurrentContext(testUserId);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.focusSession).toBeDefined();
        expect(result.data.focusSession?.id).toBe('focus-abc');
        expect(result.data.focusSession?.remainingMinutes).toBeGreaterThan(40);
        expect(result.data.focusSession?.remainingMinutes).toBeLessThanOrEqual(45);
      }
    });
  });

  describe('Time Period Priority', () => {
    it('focus_session > sleep_time > work_time > free_time', async () => {
      // Test 1: free_time (nothing active)
      setCurrentTime(20, 0);
      setInSleepTime(false);
      setInFocusSession(false);
      let result = await timeWindowService.getCurrentContext(testUserId);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.period).toBe('free_time');

      // Test 2: work_time overrides free_time
      setCurrentTime(10, 0);
      result = await timeWindowService.getCurrentContext(testUserId);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.period).toBe('work_time');

      // Test 3: sleep_time overrides work_time (edge case, shouldn't happen in practice)
      setInSleepTime(true);
      result = await timeWindowService.getCurrentContext(testUserId);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.period).toBe('sleep_time');

      // Test 4: focus_session overrides everything
      setInFocusSession(true, {
        id: 'focus-1',
        plannedEndTime: new Date(Date.now() + 60 * 60 * 1000),
      });
      result = await timeWindowService.getCurrentContext(testUserId);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.period).toBe('focus_session');
    });
  });

  describe('OVER_REST Allowed Rules (comprehensive)', () => {
    const testCases = [
      { inWorkTime: true, inSleepTime: false, inFocusSession: false, expected: true, desc: 'work time only' },
      { inWorkTime: false, inSleepTime: false, inFocusSession: false, expected: false, desc: 'free time' },
      { inWorkTime: false, inSleepTime: true, inFocusSession: false, expected: false, desc: 'sleep time only' },
      { inWorkTime: true, inSleepTime: true, inFocusSession: false, expected: false, desc: 'work+sleep (sleep wins)' },
      { inWorkTime: false, inSleepTime: false, inFocusSession: true, expected: true, desc: 'focus session only' },
      { inWorkTime: false, inSleepTime: true, inFocusSession: true, expected: true, desc: 'focus+sleep (focus wins)' },
      { inWorkTime: true, inSleepTime: true, inFocusSession: true, expected: true, desc: 'all active (focus wins)' },
    ];

    for (const tc of testCases) {
      it(`overRestAllowed=${tc.expected} for: ${tc.desc}`, async () => {
        setCurrentTime(tc.inWorkTime ? 10 : 20, 0);
        setInSleepTime(tc.inSleepTime);
        if (tc.inFocusSession) {
          setInFocusSession(true, {
            id: 'focus-1',
            plannedEndTime: new Date(Date.now() + 60 * 60 * 1000),
          });
        } else {
          setInFocusSession(false);
        }

        const result = await timeWindowService.isOverRestAllowed(testUserId);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(tc.expected);
        }
      });
    }
  });
});
