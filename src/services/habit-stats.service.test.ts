import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HabitEntryType, HabitStatus } from '@prisma/client';
import {
  habitStatsService,
  type HabitForDueCheck,
  type EntryForStats,
  type HabitFrequency,
} from './habit-stats.service';

// Helper to create a Date at midnight local time
function d(dateStr: string): Date {
  const [y, m, day] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, day);
}

// Helper to create an entry
function entry(
  dateStr: string,
  value = 1,
  entryType: HabitEntryType = 'YES_MANUAL',
): EntryForStats {
  return { date: d(dateStr), value, entryType };
}

// Helper to create a habit for isDueToday checks
function habit(overrides: Partial<HabitForDueCheck> = {}): HabitForDueCheck {
  return {
    status: 'ACTIVE',
    freqNum: 1,
    freqDen: 1,
    createdAt: d('2025-01-01'),
    ...overrides,
  };
}

describe('HabitStatsService', () => {
  // Mock getTodayDate to return a stable date for tests
  // We'll use 2025-03-10 (Monday) as "today" for most tests
  const MOCK_TODAY = d('2025-03-10');

  beforeEach(() => {
    vi.useFakeTimers();
    // Set system time to 2025-03-10 10:00 (well past 4 AM reset)
    vi.setSystemTime(new Date(2025, 2, 10, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isDueToday', () => {
    it('should return false for PAUSED habits', () => {
      const h = habit({ status: 'PAUSED' });
      expect(habitStatsService.isDueToday(h, [], MOCK_TODAY)).toBe(false);
    });

    it('should return false for ARCHIVED habits', () => {
      const h = habit({ status: 'ARCHIVED' });
      expect(habitStatsService.isDueToday(h, [], MOCK_TODAY)).toBe(false);
    });

    describe('daily (1/1)', () => {
      it('should return true for daily habits', () => {
        const h = habit({ freqNum: 1, freqDen: 1 });
        expect(habitStatsService.isDueToday(h, [], MOCK_TODAY)).toBe(true);
      });

      it('should return true even if already completed today (service layer handles filtering)', () => {
        const h = habit({ freqNum: 1, freqDen: 1 });
        expect(
          habitStatsService.isDueToday(h, [entry('2025-03-10')], MOCK_TODAY),
        ).toBe(true);
      });
    });

    describe('every other day (1/2)', () => {
      it('should be due on even days since creation', () => {
        // Created 2025-01-01, today is 2025-03-10 = 68 days later
        // 68 / 2 = period 34, period start = day 68 = today
        // completedInPeriod = 0 < 1 → due
        const h = habit({ freqNum: 1, freqDen: 2, createdAt: d('2025-01-01') });
        expect(habitStatsService.isDueToday(h, [], MOCK_TODAY)).toBe(true);
      });

      it('should not be due if already completed in current period', () => {
        const h = habit({ freqNum: 1, freqDen: 2, createdAt: d('2025-01-01') });
        // 2025-03-10 is day 68, period 34 starts day 68
        // Entry on 2025-03-10 → completed in this period
        expect(
          habitStatsService.isDueToday(h, [entry('2025-03-10')], MOCK_TODAY),
        ).toBe(false);
      });
    });

    describe('weekly N times (N/7)', () => {
      it('should return true when under quota for the week', () => {
        // 3 times per week, 0 completed this week
        const h = habit({ freqNum: 3, freqDen: 7 });
        expect(habitStatsService.isDueToday(h, [], MOCK_TODAY)).toBe(true);
      });

      it('should return true when partially completed', () => {
        // 3 times per week, 2 completed (Mon + Tue)
        const h = habit({ freqNum: 3, freqDen: 7 });
        const entries = [entry('2025-03-10'), entry('2025-03-11')];
        // MOCK_TODAY is 2025-03-10 (Monday), so the week is 03-10 to 03-16
        // But we have entry on 03-11 (Tuesday, same week) — 2 completions < 3
        expect(habitStatsService.isDueToday(h, entries, MOCK_TODAY)).toBe(true);
      });

      it('should return false when weekly quota met (3 completed this week)', () => {
        const h = habit({ freqNum: 3, freqDen: 7 });
        // 2025-03-10 is Monday. 03-10, 03-11, 03-12 are all in the same ISO week
        const entries = [
          entry('2025-03-10'),
          entry('2025-03-11'),
          entry('2025-03-12'),
        ];
        expect(habitStatsService.isDueToday(h, entries, MOCK_TODAY)).toBe(false);
      });

      it('should not count SKIP entries toward completion', () => {
        const h = habit({ freqNum: 3, freqDen: 7 });
        const entries = [
          entry('2025-03-10'),
          entry('2025-03-11'),
          entry('2025-03-12', 0, 'SKIP'),
        ];
        // Only 2 actual completions, 1 skip → still under quota
        expect(habitStatsService.isDueToday(h, entries, MOCK_TODAY)).toBe(true);
      });
    });
  });

  describe('calculateStreak', () => {
    describe('daily habit (1/1)', () => {
      it('should return 0 for empty entries', () => {
        const result = habitStatsService.calculateStreak(
          [],
          { num: 1, den: 1 },
        );
        expect(result).toEqual({ current: 0, best: 0 });
      });

      it('should calculate 5-day consecutive streak', () => {
        // Today=2025-03-10, entries for 03-06 through 03-10
        const entries = [
          entry('2025-03-06'),
          entry('2025-03-07'),
          entry('2025-03-08'),
          entry('2025-03-09'),
          entry('2025-03-10'),
        ];
        const result = habitStatsService.calculateStreak(entries, {
          num: 1,
          den: 1,
        });
        expect(result.current).toBe(5);
        expect(result.best).toBe(5);
      });

      it('should handle SKIP not breaking streak: 3 days + SKIP + 2 days = current 5', () => {
        // 03-05, 03-06, 03-07 (SKIP), 03-08, 03-09, 03-10
        const entries = [
          entry('2025-03-05'),
          entry('2025-03-06'),
          entry('2025-03-07', 0, 'SKIP'),
          entry('2025-03-08'),
          entry('2025-03-09'),
          entry('2025-03-10'),
        ];
        const result = habitStatsService.calculateStreak(entries, {
          num: 1,
          den: 1,
        });
        // SKIP on 03-07 doesn't break streak: 05,06 + skip + 08,09,10 = 5
        expect(result.current).toBe(5);
        expect(result.best).toBe(5);
      });

      it('should break streak on gap: 3 + gap + 2 → current=2, best=3', () => {
        // 03-04, 03-05, 03-06, gap on 03-07, 03-08 (NO entry), 03-09, 03-10
        const entries = [
          entry('2025-03-04'),
          entry('2025-03-05'),
          entry('2025-03-06'),
          // 03-07: no entry (gap)
          // 03-08: no entry (gap)
          entry('2025-03-09'),
          entry('2025-03-10'),
        ];
        const result = habitStatsService.calculateStreak(entries, {
          num: 1,
          den: 1,
        });
        expect(result.current).toBe(2);
        expect(result.best).toBe(3);
      });

      it('should return current=0 when today has no entry', () => {
        // Entries for 03-07, 03-08, 03-09 but NOT 03-10 (today)
        const entries = [
          entry('2025-03-07'),
          entry('2025-03-08'),
          entry('2025-03-09'),
        ];
        const result = habitStatsService.calculateStreak(entries, {
          num: 1,
          den: 1,
        });
        expect(result.current).toBe(0);
        expect(result.best).toBe(3);
      });

      it('should handle single entry today → current=1', () => {
        const entries = [entry('2025-03-10')];
        const result = habitStatsService.calculateStreak(entries, {
          num: 1,
          den: 1,
        });
        expect(result.current).toBe(1);
        expect(result.best).toBe(1);
      });

      it('should not count NO entries as completed', () => {
        const entries = [
          entry('2025-03-09', 0, 'NO'),
          entry('2025-03-10'),
        ];
        const result = habitStatsService.calculateStreak(entries, {
          num: 1,
          den: 1,
        });
        expect(result.current).toBe(1);
        expect(result.best).toBe(1);
      });
    });

    describe('weekly habit (N/7)', () => {
      it('should count consecutive weeks with quota met: 2 weeks', () => {
        // This week (03-10 Mon): 3 completions → met
        // Last week (03-03 Mon): 4 completions → met
        // Week before (02-24 Mon): 0 → not met
        const entries = [
          // This week (2025-03-10 to 03-16)
          entry('2025-03-10'),
          entry('2025-03-11'),
          entry('2025-03-12'),
          // Last week (2025-03-03 to 03-09)
          entry('2025-03-03'),
          entry('2025-03-04'),
          entry('2025-03-05'),
          entry('2025-03-06'),
        ];
        const result = habitStatsService.calculateStreak(entries, {
          num: 3,
          den: 7,
        });
        expect(result.current).toBe(2);
        expect(result.best).toBe(2);
      });

      it('should return current=0 if this week not yet met', () => {
        // This week: only 1 completion (need 3)
        // Last week: 3 completions
        const entries = [
          entry('2025-03-10'), // This week: 1 < 3
          entry('2025-03-03'),
          entry('2025-03-04'),
          entry('2025-03-05'), // Last week: 3 >= 3
        ];
        const result = habitStatsService.calculateStreak(entries, {
          num: 3,
          den: 7,
        });
        expect(result.current).toBe(0);
        expect(result.best).toBe(1);
      });
    });

    describe('every other day (1/2)', () => {
      it('should count consecutive 2-day periods', () => {
        // Working backwards from today (2025-03-10) in 2-day periods:
        // Period 0: 03-09 to 03-10 — need entry on 03-09 or 03-10
        // Period 1: 03-07 to 03-08 — need entry on 03-07 or 03-08
        // Period 2: 03-05 to 03-06 — need entry
        const entries = [
          entry('2025-03-10'), // period 0
          entry('2025-03-08'), // period 1
          entry('2025-03-06'), // period 2
        ];
        const result = habitStatsService.calculateStreak(entries, {
          num: 1,
          den: 2,
        });
        expect(result.current).toBe(3);
        expect(result.best).toBe(3);
      });
    });
  });

  describe('helper functions', () => {
    it('toDateString should format correctly', () => {
      expect(habitStatsService.toDateString(new Date(2025, 0, 5))).toBe(
        '2025-01-05',
      );
      expect(habitStatsService.toDateString(new Date(2025, 11, 25))).toBe(
        '2025-12-25',
      );
    });

    it('parseDate should parse correctly', () => {
      const result = habitStatsService.parseDate('2025-03-10');
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(2); // 0-indexed
      expect(result.getDate()).toBe(10);
    });

    it('getISOWeek should return correct week number', () => {
      // 2025-03-10 is a Monday, ISO week 11
      const { year, week } = habitStatsService.getISOWeek(d('2025-03-10'));
      expect(year).toBe(2025);
      expect(week).toBe(11);
    });

    it('getWeekMonday should return Monday of the week', () => {
      // 2025-03-12 (Wednesday) → Monday = 2025-03-10
      const monday = habitStatsService.getWeekMonday(d('2025-03-12'));
      expect(habitStatsService.toDateString(monday)).toBe('2025-03-10');

      // 2025-03-10 (Monday) → Monday = 2025-03-10
      const mon2 = habitStatsService.getWeekMonday(d('2025-03-10'));
      expect(habitStatsService.toDateString(mon2)).toBe('2025-03-10');

      // 2025-03-16 (Sunday) → Monday = 2025-03-10
      const mon3 = habitStatsService.getWeekMonday(d('2025-03-16'));
      expect(habitStatsService.toDateString(mon3)).toBe('2025-03-10');
    });

    it('isCompleted should identify correct entry types', () => {
      expect(habitStatsService.isCompleted('YES_MANUAL')).toBe(true);
      expect(habitStatsService.isCompleted('YES_AUTO')).toBe(true);
      expect(habitStatsService.isCompleted('NO')).toBe(false);
      expect(habitStatsService.isCompleted('SKIP')).toBe(false);
      expect(habitStatsService.isCompleted('UNKNOWN')).toBe(false);
    });
  });
});
