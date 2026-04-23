/**
 * Time Window Service Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock Prisma ────────────────────────────────────────────────────────

vi.mock('@/lib/prisma', () => ({
  default: {
    userSettings: {
      findFirst: vi.fn(),
    },
  },
}));

// ── Mock dependent services ────────────────────────────────────────────

const mockIsWithinWorkHours = vi.hoisted(() => vi.fn().mockReturnValue(false));

vi.mock('./idle.service', () => ({
  isWithinWorkHours: mockIsWithinWorkHours,
}));

const mockGetActiveSession = vi.hoisted(() => vi.fn().mockResolvedValue({ success: true, data: null }));
const mockIsInFocusSession = vi.hoisted(() => vi.fn().mockResolvedValue({ success: true, data: false }));

vi.mock('./focus-session.service', () => ({
  focusSessionService: {
    getActiveSession: mockGetActiveSession,
    isInFocusSession: mockIsInFocusSession,
  },
}));

// Mock isTimeInSleepWindow function used by timeWindowService
const mockIsTimeInSleepWindow = vi.hoisted(() => vi.fn().mockReturnValue(false));

vi.mock('./sleep-time.service', () => ({
  isTimeInSleepWindow: mockIsTimeInSleepWindow,
}));

// ── Import after mocks ─────────────────────────────────────────────────

import { timeWindowService, type TimePeriod, type ExpectedBehavior } from './time-window.service';
import prisma from '@/lib/prisma';

// ── Test helpers ───────────────────────────────────────────────────────

const TEST_USER_ID = 'test-user-123';

function mockUserSettings(overrides: Record<string, unknown> = {}) {
  (prisma.userSettings.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 'settings-1',
    userId: TEST_USER_ID,
    workTimeSlots: [],
    ...overrides,
  });
}

function mockFocusSession(session: {
  id: string;
  plannedEndTime: Date;
  startTime?: Date;
  overridesSleepTime?: boolean;
} | null) {
  mockGetActiveSession.mockResolvedValue({
    success: true,
    data: session
      ? {
          ...session,
          startTime: session.startTime ?? new Date(Date.now() - 30 * 60 * 1000), // default 30 min ago
        }
      : null,
  });
}

/**
 * Mock sleep time by setting sleepTimeEnabled in settings and mockIsTimeInSleepWindow return value.
 * This reflects the new implementation that reads sleep config directly from settings.
 */
function mockSleepTime(inSleepTime: boolean, config?: { startTime?: string; endTime?: string }) {
  mockIsTimeInSleepWindow.mockReturnValue(inSleepTime);
  // Update settings with sleep time config
  (prisma.userSettings.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 'settings-1',
    userId: TEST_USER_ID,
    workTimeSlots: [],
    sleepTimeEnabled: inSleepTime || config !== undefined,
    sleepTimeStart: config?.startTime ?? '23:00',
    sleepTimeEnd: config?.endTime ?? '07:00',
  });
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('TimeWindowService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockUserSettings();
    mockFocusSession(null);
    mockIsWithinWorkHours.mockReturnValue(false);
    mockIsTimeInSleepWindow.mockReturnValue(false);
  });

  describe('getCurrentContext', () => {
    describe('Time Period Priority', () => {
      it('should return free_time when no conditions match', async () => {
        const result = await timeWindowService.getCurrentContext(TEST_USER_ID);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.period).toBe('free_time');
          expect(result.data.expectedBehavior).toBe('free');
          expect(result.data.overRestAllowed).toBe(false);
        }
      });

      it('should return work_time when within work hours', async () => {
        mockIsWithinWorkHours.mockReturnValue(true);

        const result = await timeWindowService.getCurrentContext(TEST_USER_ID);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.period).toBe('work_time');
          expect(result.data.expectedBehavior).toBe('pomodoro_cycle');
          expect(result.data.overRestAllowed).toBe(true);
        }
      });

      it('should return sleep_time when in sleep window', async () => {
        mockSleepTime(true);

        const result = await timeWindowService.getCurrentContext(TEST_USER_ID);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.period).toBe('sleep_time');
          expect(result.data.expectedBehavior).toBe('sleep');
          expect(result.data.overRestAllowed).toBe(false);
        }
      });

      it('should return focus_session when in ad-hoc focus session', async () => {
        mockFocusSession({
          id: 'session-1',
          plannedEndTime: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
        });

        const result = await timeWindowService.getCurrentContext(TEST_USER_ID);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.period).toBe('focus_session');
          expect(result.data.expectedBehavior).toBe('pomodoro_cycle');
          expect(result.data.overRestAllowed).toBe(true);
        }
      });

      it('should prioritize focus_session over sleep_time', async () => {
        mockSleepTime(true);
        mockFocusSession({
          id: 'session-1',
          plannedEndTime: new Date(Date.now() + 60 * 60 * 1000),
        });

        const result = await timeWindowService.getCurrentContext(TEST_USER_ID);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.period).toBe('focus_session');
          // focus_session overrides sleep_time
          expect(result.data.checks.inSleepTime).toBe(true);
          expect(result.data.checks.inFocusSession).toBe(true);
        }
      });

      it('should prioritize sleep_time over work_time', async () => {
        mockIsWithinWorkHours.mockReturnValue(true);
        mockSleepTime(true);

        const result = await timeWindowService.getCurrentContext(TEST_USER_ID);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.period).toBe('sleep_time');
          // Note: in practice, sleep_time and work_time shouldn't overlap in config
          // but the priority ensures correct behavior if they do
          expect(result.data.checks.inWorkTime).toBe(true);
          expect(result.data.checks.inSleepTime).toBe(true);
        }
      });
    });

    describe('OVER_REST Allowed Logic', () => {
      it('should allow OVER_REST in focus_session', async () => {
        mockFocusSession({
          id: 'session-1',
          plannedEndTime: new Date(Date.now() + 60 * 60 * 1000),
        });

        const result = await timeWindowService.getCurrentContext(TEST_USER_ID);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.overRestAllowed).toBe(true);
        }
      });

      it('should allow OVER_REST in work_time', async () => {
        mockIsWithinWorkHours.mockReturnValue(true);

        const result = await timeWindowService.getCurrentContext(TEST_USER_ID);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.overRestAllowed).toBe(true);
        }
      });

      it('should NOT allow OVER_REST in sleep_time (without focus_session)', async () => {
        mockSleepTime(true);

        const result = await timeWindowService.getCurrentContext(TEST_USER_ID);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.overRestAllowed).toBe(false);
        }
      });

      it('should NOT allow OVER_REST in free_time', async () => {
        const result = await timeWindowService.getCurrentContext(TEST_USER_ID);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.overRestAllowed).toBe(false);
        }
      });

      it('should allow OVER_REST in focus_session even during sleep_time', async () => {
        // User started a focus session during sleep time (加班)
        mockSleepTime(true);
        mockFocusSession({
          id: 'session-1',
          plannedEndTime: new Date(Date.now() + 60 * 60 * 1000),
          overridesSleepTime: true,
        });

        const result = await timeWindowService.getCurrentContext(TEST_USER_ID);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.period).toBe('focus_session');
          expect(result.data.overRestAllowed).toBe(true);
          expect(result.data.checks.inSleepTime).toBe(true);
        }
      });
    });

    describe('Context Details', () => {
      it('should include focus session details when active', async () => {
        const startTime = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago
        const endTime = new Date(Date.now() + 30 * 60 * 1000); // 30 min from now
        mockFocusSession({
          id: 'session-abc',
          startTime,
          plannedEndTime: endTime,
          overridesSleepTime: true,
        });

        const result = await timeWindowService.getCurrentContext(TEST_USER_ID);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.focusSession).toBeDefined();
          expect(result.data.focusSession?.id).toBe('session-abc');
          expect(result.data.focusSession?.startTime).toEqual(startTime);
          expect(result.data.focusSession?.remainingMinutes).toBeGreaterThan(25);
          expect(result.data.focusSession?.remainingMinutes).toBeLessThanOrEqual(30);
          expect(result.data.focusSession?.overridesSleepTime).toBe(true);
        }
      });

      it('should include sleep time details when in sleep window', async () => {
        mockSleepTime(true, { startTime: '23:00', endTime: '07:00' });

        const result = await timeWindowService.getCurrentContext(TEST_USER_ID);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.sleepTime).toBeDefined();
          expect(result.data.sleepTime?.endTime).toBe('07:00');
        }
      });
    });
  });

  describe('isOverRestAllowed', () => {
    it('should return true for work_time', async () => {
      mockIsWithinWorkHours.mockReturnValue(true);

      const result = await timeWindowService.isOverRestAllowed(TEST_USER_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it('should return false for free_time', async () => {
      const result = await timeWindowService.isOverRestAllowed(TEST_USER_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });
  });

  describe('getCurrentPeriod', () => {
    it('should return the current period', async () => {
      mockIsWithinWorkHours.mockReturnValue(true);

      const result = await timeWindowService.getCurrentPeriod(TEST_USER_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('work_time');
      }
    });
  });

  describe('getExpectedBehavior', () => {
    const cases: Array<{ period: TimePeriod; expected: ExpectedBehavior }> = [
      { period: 'focus_session', expected: 'pomodoro_cycle' },
      { period: 'work_time', expected: 'pomodoro_cycle' },
      { period: 'sleep_time', expected: 'sleep' },
      { period: 'free_time', expected: 'free' },
    ];

    for (const { period, expected } of cases) {
      it(`should return ${expected} for ${period}`, async () => {
        // Set up mocks for each period
        if (period === 'focus_session') {
          mockFocusSession({
            id: 'session-1',
            plannedEndTime: new Date(Date.now() + 60 * 60 * 1000),
          });
        } else if (period === 'sleep_time') {
          mockSleepTime(true);
        } else if (period === 'work_time') {
          mockIsWithinWorkHours.mockReturnValue(true);
        }
        // free_time is the default

        const result = await timeWindowService.getExpectedBehavior(TEST_USER_ID);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(expected);
        }

        // Reset mocks for next iteration
        mockFocusSession(null);
        mockUserSettings(); // Reset to default (no sleep time)
        mockIsTimeInSleepWindow.mockReturnValue(false);
        mockIsWithinWorkHours.mockReturnValue(false);
      });
    }
  });

  describe('isInProductiveWindow', () => {
    it('should return true for work_time', async () => {
      mockIsWithinWorkHours.mockReturnValue(true);

      const result = await timeWindowService.isInProductiveWindow(TEST_USER_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it('should return true for focus_session', async () => {
      mockFocusSession({
        id: 'session-1',
        plannedEndTime: new Date(Date.now() + 60 * 60 * 1000),
      });

      const result = await timeWindowService.isInProductiveWindow(TEST_USER_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it('should return false for sleep_time', async () => {
      mockSleepTime(true);

      const result = await timeWindowService.isInProductiveWindow(TEST_USER_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });

    it('should return false for free_time', async () => {
      const result = await timeWindowService.isInProductiveWindow(TEST_USER_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });
  });
});
