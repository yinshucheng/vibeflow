import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ===== Prisma mock =====

const mockPrisma = vi.hoisted(() => ({
  userSettings: {
    findUnique: vi.fn(),
  },
  habit: {
    findMany: vi.fn(),
  },
  habitEntry: {
    findMany: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
}));

// ===== Socket broadcast mock =====

const mockSendExecuteCommand = vi.hoisted(() => vi.fn());

vi.mock('@/services/socket-broadcast.service', () => ({
  sendExecuteCommand: mockSendExecuteCommand,
}));

// ===== Habit stats mock =====

const mockIsDueToday = vi.hoisted(() => vi.fn());
const mockCalculateStreak = vi.hoisted(() => vi.fn());

vi.mock('@/services/habit-stats.service', () => ({
  habitStatsService: {
    isDueToday: mockIsDueToday,
    calculateStreak: mockCalculateStreak,
  },
}));

// ===== Imports =====

import { habitReminderService } from './habit-reminder.service';

// ===== Constants =====

const UID = 'user-001';
const H1 = 'habit-001';
const H2 = 'habit-002';

// ===== Helpers =====

function d(dateStr: string): Date {
  const [y, m, day] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, day);
}

function fakeSettings(overrides: Record<string, unknown> = {}) {
  return {
    userId: UID,
    habitReminderEnabled: true,
    habitStreakProtectEnabled: true,
    habitStreakProtectBefore: 120,
    habitDailySummaryEnabled: true,
    habitDailySummaryTime: '20:00',
    ...overrides,
  };
}

function fakeHabit(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: UID,
    title: '冥想',
    question: '今天冥想了吗？',
    type: 'BOOLEAN',
    status: 'ACTIVE',
    freqNum: 1,
    freqDen: 1,
    reminderEnabled: true,
    reminderTime: '08:00',
    createdAt: d('2025-01-01'),
    ...overrides,
  };
}

function fakeEntry(habitId: string, dateStr: string, entryType = 'YES_MANUAL') {
  return {
    id: `entry-${habitId}-${dateStr}`,
    habitId,
    userId: UID,
    date: d(dateStr),
    value: 1,
    entryType,
    note: null,
    pomodoroIds: [],
    createdAt: d(dateStr),
    updatedAt: d(dateStr),
  };
}

// ===== Tests =====

describe('HabitReminderService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Set to 2025-03-10 08:00 (Monday, matches default reminderTime "08:00")
    vi.setSystemTime(new Date(2025, 2, 10, 8, 0, 0));
    vi.clearAllMocks();

    // Default happy path mocks
    mockIsDueToday.mockReturnValue(true);
    mockCalculateStreak.mockReturnValue({ current: 5, best: 10 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('tick()', () => {
    it('should skip if no connected users', async () => {
      await habitReminderService.tick([]);
      expect(mockPrisma.userSettings.findUnique).not.toHaveBeenCalled();
    });

    it('should call checkAndSendReminders for each connected user', async () => {
      // Mock to avoid actual DB calls — settings disabled so it short-circuits
      mockPrisma.userSettings.findUnique.mockResolvedValue(fakeSettings({ habitReminderEnabled: false }));

      await habitReminderService.tick(['user-a', 'user-b']);
      expect(mockPrisma.userSettings.findUnique).toHaveBeenCalledTimes(2);
    });

    it('should not throw if a single user errors', async () => {
      mockPrisma.userSettings.findUnique
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce(fakeSettings({ habitReminderEnabled: false }));

      await expect(habitReminderService.tick(['user-a', 'user-b'])).resolves.not.toThrow();
      // Second user still processed
      expect(mockPrisma.userSettings.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('checkAndSendReminders()', () => {
    it('should NOT send when global switch is OFF', async () => {
      mockPrisma.userSettings.findUnique.mockResolvedValue(
        fakeSettings({ habitReminderEnabled: false }),
      );

      await habitReminderService.checkAndSendReminders(UID, '08:00');
      expect(mockPrisma.habit.findMany).not.toHaveBeenCalled();
      expect(mockSendExecuteCommand).not.toHaveBeenCalled();
    });

    it('should NOT send when no settings found', async () => {
      mockPrisma.userSettings.findUnique.mockResolvedValue(null);

      await habitReminderService.checkAndSendReminders(UID, '08:00');
      expect(mockPrisma.habit.findMany).not.toHaveBeenCalled();
      expect(mockSendExecuteCommand).not.toHaveBeenCalled();
    });

    it('should NOT send when reminderTime does not match', async () => {
      mockPrisma.userSettings.findUnique.mockResolvedValue(fakeSettings());
      mockPrisma.habit.findMany.mockResolvedValue([]); // No habits at "09:00"

      await habitReminderService.checkAndSendReminders(UID, '09:00');
      // Habits queried with time="09:00", returns empty → no further action
      expect(mockSendExecuteCommand).not.toHaveBeenCalled();
    });

    it('should NOT send when habit is paused', async () => {
      mockPrisma.userSettings.findUnique.mockResolvedValue(fakeSettings());
      // Query filters status='ACTIVE', so paused habits never returned
      mockPrisma.habit.findMany.mockResolvedValue([]);

      await habitReminderService.checkAndSendReminders(UID, '08:00');
      expect(mockSendExecuteCommand).not.toHaveBeenCalled();
    });

    it('should NOT send when today is completed', async () => {
      mockPrisma.userSettings.findUnique.mockResolvedValue(fakeSettings());
      mockPrisma.habit.findMany.mockResolvedValue([fakeHabit(H1)]);

      // Today's entry exists with YES_MANUAL
      mockPrisma.habitEntry.findMany
        .mockResolvedValueOnce([fakeEntry(H1, '2025-03-10', 'YES_MANUAL')]) // today entries
        .mockResolvedValueOnce([fakeEntry(H1, '2025-03-10', 'YES_MANUAL')]) // recent entries
        .mockResolvedValueOnce([fakeEntry(H1, '2025-03-10', 'YES_MANUAL')]); // all entries

      await habitReminderService.checkAndSendReminders(UID, '08:00');
      expect(mockSendExecuteCommand).not.toHaveBeenCalled();
    });

    it('should NOT send when habit is not due today', async () => {
      mockPrisma.userSettings.findUnique.mockResolvedValue(fakeSettings());
      mockPrisma.habit.findMany.mockResolvedValue([fakeHabit(H1)]);
      mockPrisma.habitEntry.findMany.mockResolvedValue([]); // no entries

      mockIsDueToday.mockReturnValue(false); // not due

      await habitReminderService.checkAndSendReminders(UID, '08:00');
      expect(mockSendExecuteCommand).not.toHaveBeenCalled();
    });

    it('should send HABIT_REMINDER for due + incomplete habit', async () => {
      mockPrisma.userSettings.findUnique.mockResolvedValue(fakeSettings());
      mockPrisma.habit.findMany.mockResolvedValue([fakeHabit(H1)]);
      mockPrisma.habitEntry.findMany.mockResolvedValue([]); // no entries at all

      mockIsDueToday.mockReturnValue(true);
      mockCalculateStreak.mockReturnValue({ current: 5, best: 10 });

      await habitReminderService.checkAndSendReminders(UID, '08:00');

      expect(mockSendExecuteCommand).toHaveBeenCalledTimes(1);
      expect(mockSendExecuteCommand).toHaveBeenCalledWith(UID, {
        action: 'HABIT_REMINDER',
        params: {
          habitId: H1,
          title: '冥想',
          question: '今天冥想了吗？',
          streak: 5,
          reminderType: 'fixed_time',
        },
      });
    });

    it('should send for multiple habits that are due and incomplete', async () => {
      mockPrisma.userSettings.findUnique.mockResolvedValue(fakeSettings());
      mockPrisma.habit.findMany.mockResolvedValue([
        fakeHabit(H1, { title: '冥想' }),
        fakeHabit(H2, { title: '运动', question: null }),
      ]);
      mockPrisma.habitEntry.findMany.mockResolvedValue([]);

      mockIsDueToday.mockReturnValue(true);
      mockCalculateStreak.mockReturnValue({ current: 0, best: 0 });

      await habitReminderService.checkAndSendReminders(UID, '08:00');

      expect(mockSendExecuteCommand).toHaveBeenCalledTimes(2);
      // Check second call uses undefined for null question
      expect(mockSendExecuteCommand).toHaveBeenCalledWith(UID, {
        action: 'HABIT_REMINDER',
        params: expect.objectContaining({
          habitId: H2,
          title: '运动',
          question: undefined,
          reminderType: 'fixed_time',
        }),
      });
    });

    it('should skip completed habits but send for incomplete ones', async () => {
      mockPrisma.userSettings.findUnique.mockResolvedValue(fakeSettings());
      mockPrisma.habit.findMany.mockResolvedValue([
        fakeHabit(H1, { title: '冥想' }),
        fakeHabit(H2, { title: '运动' }),
      ]);

      // H1 completed today, H2 not
      const completedEntry = fakeEntry(H1, '2025-03-10', 'YES_MANUAL');
      mockPrisma.habitEntry.findMany
        .mockResolvedValueOnce([completedEntry]) // today entries
        .mockResolvedValueOnce([completedEntry]) // recent entries
        .mockResolvedValueOnce([completedEntry]); // all entries

      mockIsDueToday.mockReturnValue(true);
      mockCalculateStreak.mockReturnValue({ current: 0, best: 0 });

      await habitReminderService.checkAndSendReminders(UID, '08:00');

      // Only H2 should get reminder (H1 is completed)
      expect(mockSendExecuteCommand).toHaveBeenCalledTimes(1);
      expect(mockSendExecuteCommand).toHaveBeenCalledWith(UID, {
        action: 'HABIT_REMINDER',
        params: expect.objectContaining({ habitId: H2 }),
      });
    });

    it('should NOT send for YES_AUTO completed habits', async () => {
      mockPrisma.userSettings.findUnique.mockResolvedValue(fakeSettings());
      mockPrisma.habit.findMany.mockResolvedValue([fakeHabit(H1)]);

      const autoEntry = fakeEntry(H1, '2025-03-10', 'YES_AUTO');
      mockPrisma.habitEntry.findMany
        .mockResolvedValueOnce([autoEntry])
        .mockResolvedValueOnce([autoEntry])
        .mockResolvedValueOnce([autoEntry]);

      mockIsDueToday.mockReturnValue(true);

      await habitReminderService.checkAndSendReminders(UID, '08:00');
      expect(mockSendExecuteCommand).not.toHaveBeenCalled();
    });
  });
});
