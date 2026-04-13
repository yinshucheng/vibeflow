/**
 * Habit Statistics Service — Pure functions for habit tracking calculations
 *
 * All functions are pure (no side effects, no DB access).
 * Used by habitService and habit router for streak, score, and calendar data.
 */

import { HabitEntryType, HabitStatus } from '@prisma/client';
import { getTodayDate } from '@/services/daily-state.service';

// ===== Types =====

export type HabitFrequency = { num: number; den: number };

export type StreakResult = { current: number; best: number };

export type CalendarDay = {
  date: string; // YYYY-MM-DD
  value: number;
  entryType: HabitEntryType;
  completed: boolean;
};

/** Minimal habit shape needed by isDueToday */
export type HabitForDueCheck = {
  status: HabitStatus;
  freqNum: number;
  freqDen: number;
  createdAt: Date;
};

/** Minimal entry shape used by stats functions */
export type EntryForStats = {
  date: Date;
  value: number;
  entryType: HabitEntryType;
};

// ===== Helpers =====

/** Format a Date to YYYY-MM-DD string */
function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parse YYYY-MM-DD string to Date at midnight UTC-local */
function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Get the ISO week number and year for a date (Monday = start of week) */
function getISOWeek(d: Date): { year: number; week: number } {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  // Set to nearest Thursday: current date + 4 - current day number (Mon=1, Sun=7)
  const dayNum = date.getDay() || 7; // Convert Sun=0 to 7
  date.setDate(date.getDate() + 4 - dayNum);
  const yearStart = new Date(date.getFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: date.getFullYear(), week };
}

/** Get Monday of the ISO week containing the given date */
function getWeekMonday(d: Date): Date {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  const dayNum = date.getDay() || 7; // Mon=1 ... Sun=7
  date.setDate(date.getDate() - (dayNum - 1));
  return date;
}

/** Check if an entry counts as completed */
function isCompleted(entryType: HabitEntryType): boolean {
  return entryType === 'YES_MANUAL' || entryType === 'YES_AUTO';
}

/** Build a map from date string to entry for fast lookup */
function buildEntryMap(entries: EntryForStats[]): Map<string, EntryForStats> {
  const map = new Map<string, EntryForStats>();
  for (const entry of entries) {
    map.set(toDateString(entry.date), entry);
  }
  return map;
}

/** Count days between two dates (inclusive of start, exclusive of end) */
function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

// ===== Core Functions =====

/**
 * Determine if a habit is due today based on its frequency.
 *
 * - 1/1 (daily): always due (unless today already completed)
 * - 1/2 (every other day): based on odd/even days since createdAt
 * - N/7 (N times per week): check ISO week completions < freqNum
 * - General N/D: check current period completions < freqNum
 */
function isDueToday(
  habit: HabitForDueCheck,
  thisWeekEntries: EntryForStats[],
  today?: Date,
): boolean {
  // Paused or archived habits are never due
  if (habit.status !== 'ACTIVE') return false;

  const todayDate = today ?? getTodayDate();
  const { freqNum, freqDen } = habit;

  if (freqDen === 1) {
    // Daily: every day is due
    return true;
  }

  if (freqDen === 7) {
    // Weekly: count completed entries in the current ISO week
    const weekMonday = getWeekMonday(todayDate);
    const weekSunday = new Date(weekMonday);
    weekSunday.setDate(weekSunday.getDate() + 6);

    const completedThisWeek = thisWeekEntries.filter((e) => {
      const ed = new Date(e.date);
      ed.setHours(0, 0, 0, 0);
      return ed >= weekMonday && ed <= weekSunday && isCompleted(e.entryType);
    }).length;

    return completedThisWeek < freqNum;
  }

  // General case (e.g., 1/2 = every other day): period-based
  // Calculate which period we're in since habit creation
  const createdDate = new Date(habit.createdAt);
  createdDate.setHours(0, 0, 0, 0);
  const daysSinceCreation = daysBetween(createdDate, todayDate);
  const currentPeriod = Math.floor(daysSinceCreation / freqDen);
  const periodStart = new Date(createdDate);
  periodStart.setDate(periodStart.getDate() + currentPeriod * freqDen);
  const periodEnd = new Date(periodStart);
  periodEnd.setDate(periodEnd.getDate() + freqDen - 1);

  const completedInPeriod = thisWeekEntries.filter((e) => {
    const ed = new Date(e.date);
    ed.setHours(0, 0, 0, 0);
    return ed >= periodStart && ed <= periodEnd && isCompleted(e.entryType);
  }).length;

  return completedInPeriod < freqNum;
}

/**
 * Calculate current and best streaks.
 *
 * For daily habits (den=1): each day is a period.
 * For weekly habits (den=7): each ISO week is a period, needs freqNum completions.
 * For other frequencies: each freqDen-day block is a period.
 *
 * SKIP entries don't break the streak but don't count as completions.
 * The current period (today/this week) counts toward streak if already met.
 */
function calculateStreak(entries: EntryForStats[], freq: HabitFrequency): StreakResult {
  if (entries.length === 0) return { current: 0, best: 0 };

  const today = getTodayDate();
  const entryMap = buildEntryMap(entries);

  if (freq.den === 1) {
    // Daily habit: scan day by day backwards from today
    return calculateDailyStreak(entryMap, today);
  }

  if (freq.den === 7) {
    // Weekly habit: scan week by week backwards from current week
    return calculateWeeklyStreak(entries, freq.num, today);
  }

  // General period-based streak
  return calculatePeriodStreak(entries, freq, today);
}

function calculateDailyStreak(
  entryMap: Map<string, EntryForStats>,
  today: Date,
): StreakResult {
  let current = 0;
  let best = 0;
  let currentRun = 0;
  let foundCurrentStreak = false;

  // Scan backwards from today, up to 365 days
  const d = new Date(today);
  for (let i = 0; i < 365; i++) {
    const key = toDateString(d);
    const entry = entryMap.get(key);

    if (entry && entry.entryType === 'SKIP') {
      // SKIP: doesn't break streak, doesn't count
      d.setDate(d.getDate() - 1);
      continue;
    }

    if (entry && isCompleted(entry.entryType)) {
      currentRun++;
    } else {
      // Gap found
      if (!foundCurrentStreak) {
        // For current streak: if today (i=0) has no entry, current=0
        // If we had a run going, that's the current streak
        current = currentRun;
        foundCurrentStreak = true;
      }
      best = Math.max(best, currentRun);
      currentRun = 0;
    }

    d.setDate(d.getDate() - 1);
  }

  // Handle the case where we never hit a gap
  if (!foundCurrentStreak) {
    current = currentRun;
  }
  best = Math.max(best, currentRun);

  return { current, best };
}

function calculateWeeklyStreak(
  entries: EntryForStats[],
  freqNum: number,
  today: Date,
): StreakResult {
  // Group entries by ISO week
  const weekCompletions = new Map<string, number>();
  const weekHasSkip = new Map<string, boolean>();

  for (const entry of entries) {
    const { year, week } = getISOWeek(entry.date);
    const key = `${year}-W${week}`;
    if (isCompleted(entry.entryType)) {
      weekCompletions.set(key, (weekCompletions.get(key) ?? 0) + 1);
    }
    if (entry.entryType === 'SKIP') {
      weekHasSkip.set(key, true);
    }
  }

  let current = 0;
  let best = 0;
  let currentRun = 0;
  let foundCurrentStreak = false;

  // Scan backwards week by week from current week, up to 52 weeks
  const d = new Date(today);
  for (let i = 0; i < 52; i++) {
    const { year, week } = getISOWeek(d);
    const key = `${year}-W${week}`;
    const completions = weekCompletions.get(key) ?? 0;

    if (completions >= freqNum) {
      currentRun++;
    } else if (weekHasSkip.get(key) && completions === 0) {
      // Week with only SKIPs: treat like SKIP — don't break, don't count
      // (Skip this week in streak calculation)
    } else {
      if (!foundCurrentStreak) {
        current = currentRun;
        foundCurrentStreak = true;
      }
      best = Math.max(best, currentRun);
      currentRun = 0;
    }

    // Move to previous week
    d.setDate(d.getDate() - 7);
  }

  if (!foundCurrentStreak) {
    current = currentRun;
  }
  best = Math.max(best, currentRun);

  return { current, best };
}

function calculatePeriodStreak(
  entries: EntryForStats[],
  freq: HabitFrequency,
  today: Date,
): StreakResult {
  // Group entries by period
  // Find the earliest entry to determine period boundaries
  const sorted = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime());
  if (sorted.length === 0) return { current: 0, best: 0 };

  const entryMap = buildEntryMap(entries);

  let current = 0;
  let best = 0;
  let currentRun = 0;
  let foundCurrentStreak = false;

  // Scan backwards from today in periods of freq.den days
  const maxPeriods = Math.min(52, Math.ceil(365 / freq.den));
  const d = new Date(today);

  for (let i = 0; i < maxPeriods; i++) {
    // Count completions in this period [d - freq.den + 1, d]
    const periodEnd = new Date(d);
    const periodStart = new Date(d);
    periodStart.setDate(periodStart.getDate() - freq.den + 1);

    let completions = 0;
    let hasSkipOnly = true;
    let hasAnyEntry = false;
    const pd = new Date(periodStart);
    for (let j = 0; j < freq.den; j++) {
      const key = toDateString(pd);
      const entry = entryMap.get(key);
      if (entry) {
        hasAnyEntry = true;
        if (isCompleted(entry.entryType)) {
          completions++;
          hasSkipOnly = false;
        } else if (entry.entryType !== 'SKIP') {
          hasSkipOnly = false;
        }
      }
      pd.setDate(pd.getDate() + 1);
    }

    if (completions >= freq.num) {
      currentRun++;
    } else if (hasAnyEntry && hasSkipOnly) {
      // Period with only SKIPs: don't break, don't count
    } else {
      if (!foundCurrentStreak) {
        current = currentRun;
        foundCurrentStreak = true;
      }
      best = Math.max(best, currentRun);
      currentRun = 0;
    }

    // Move to previous period
    d.setDate(d.getDate() - freq.den);
  }

  if (!foundCurrentStreak) {
    current = currentRun;
  }
  best = Math.max(best, currentRun);

  return { current, best };
}

// ===== Exported Service =====

export const habitStatsService = {
  isDueToday,
  calculateStreak,

  // Exported helpers for testing / reuse
  toDateString,
  parseDate,
  getISOWeek,
  getWeekMonday,
  isCompleted,
};
