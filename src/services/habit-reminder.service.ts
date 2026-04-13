/**
 * Habit Reminder Service
 *
 * Checks connected users every 60s and sends habit reminders
 * (fixed-time, daily summary, streak protection) via EXECUTE commands.
 *
 * Called from socket.ts startPeriodicTasks.
 */

import prisma from '@/lib/prisma';
import { getTodayDate } from '@/services/daily-state.service';
import { habitStatsService } from '@/services/habit-stats.service';
import { sendExecuteCommand } from '@/services/socket-broadcast.service';
import type { HabitReminderPayload } from '@/server/socket';

// ===== Helpers =====

/** Format a Date to "HH:mm" in local time */
function formatHHmm(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** Format a Date to "YYYY-MM-DD" */
function formatDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse "YYYY-MM-DD" to a Date at midnight local time */
function parseDateString(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Check whether an entry type counts as "completed" */
function isCompleted(entryType: string): boolean {
  return entryType === 'YES_MANUAL' || entryType === 'YES_AUTO';
}

// ===== Service =====

export const habitReminderService = {
  /**
   * Called every 60s from socket.ts startPeriodicTasks.
   * Iterates connected users and checks whether reminders should fire.
   */
  async tick(connectedUserIds: string[]): Promise<void> {
    if (connectedUserIds.length === 0) return;

    const currentTime = formatHHmm(new Date());

    for (const userId of connectedUserIds) {
      try {
        await this.checkAndSendReminders(userId, currentTime);
      } catch (error) {
        // Individual user errors don't stop the loop
        console.error(`[HabitReminder] Error for user ${userId}:`, error);
      }
    }
  },

  /**
   * Check fixed-time reminders for a single user.
   *
   * 1. Check global switch habitReminderEnabled
   * 2. Find ACTIVE habits with reminderEnabled=true and reminderTime=currentTime
   * 3. Filter out habits that are not due today (isDueToday)
   * 4. Filter out habits already completed today
   * 5. Send HABIT_REMINDER execute command for each remaining habit
   */
  async checkAndSendReminders(userId: string, currentTimeHHmm: string): Promise<void> {
    // 1. Check global switch
    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    if (!settings?.habitReminderEnabled) return;

    // 2. Find ACTIVE habits whose reminder matches current time
    const habits = await prisma.habit.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        reminderEnabled: true,
        reminderTime: currentTimeHHmm,
      },
    });
    if (habits.length === 0) return;

    // 3. Determine "today" and fetch entries for due-check + completion-check
    const today = getTodayDate();
    const todayStr = formatDateString(today);
    const habitIds = habits.map((h) => h.id);

    // Fetch today's entries for these habits
    const todayEntries = await prisma.habitEntry.findMany({
      where: {
        habitId: { in: habitIds },
        userId,
        date: parseDateString(todayStr),
      },
    });
    const todayEntryMap = new Map(todayEntries.map((e) => [e.habitId, e]));

    // Fetch recent entries (this week) for isDueToday weekly-frequency check
    const weekStart = getWeekMonday(today);
    const recentEntries = await prisma.habitEntry.findMany({
      where: {
        habitId: { in: habitIds },
        userId,
        date: { gte: weekStart },
      },
    });
    const recentByHabit = new Map<string, typeof recentEntries>();
    for (const e of recentEntries) {
      const list = recentByHabit.get(e.habitId) ?? [];
      list.push(e);
      recentByHabit.set(e.habitId, list);
    }

    // Fetch all entries (past 365 days) for streak calculation
    const yearAgo = new Date(today);
    yearAgo.setDate(yearAgo.getDate() - 365);
    const allEntries = await prisma.habitEntry.findMany({
      where: {
        habitId: { in: habitIds },
        userId,
        date: { gte: yearAgo },
      },
      orderBy: { date: 'desc' },
    });
    const allByHabit = new Map<string, typeof allEntries>();
    for (const e of allEntries) {
      const list = allByHabit.get(e.habitId) ?? [];
      list.push(e);
      allByHabit.set(e.habitId, list);
    }

    // 4–5. Filter and send
    for (const habit of habits) {
      // Check isDueToday
      const weekEntries = (recentByHabit.get(habit.id) ?? []).map((e) => ({
        date: e.date,
        value: e.value,
        entryType: e.entryType,
      }));
      const due = habitStatsService.isDueToday(habit, weekEntries, today);
      if (!due) continue;

      // Check already completed today
      const todayEntry = todayEntryMap.get(habit.id);
      if (todayEntry && isCompleted(todayEntry.entryType)) continue;

      // Calculate streak for the notification payload
      const habitEntries = (allByHabit.get(habit.id) ?? []).map((e) => ({
        date: e.date,
        value: e.value,
        entryType: e.entryType,
      }));
      const freq = { num: habit.freqNum, den: habit.freqDen };
      const streak = habitStatsService.calculateStreak(habitEntries, freq);

      const payload: HabitReminderPayload = {
        habitId: habit.id,
        title: habit.title,
        question: habit.question ?? undefined,
        streak: streak.current,
        reminderType: 'fixed_time',
      };

      sendExecuteCommand(userId, {
        action: 'HABIT_REMINDER',
        params: payload as unknown as Record<string, unknown>,
      });
    }
  },
};

// ===== Local helper (duplicated from habit-stats to avoid coupling) =====

function getWeekMonday(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? 6 : day - 1; // Monday = 0 offset
  d.setDate(d.getDate() - diff);
  return d;
}

export default habitReminderService;
