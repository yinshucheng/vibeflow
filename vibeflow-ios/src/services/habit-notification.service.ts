/**
 * Habit Notification Service
 *
 * Manages local scheduled notifications for habit reminders on iOS.
 * Uses a 3-day rolling window to stay within iOS's 64 scheduled notification limit.
 *
 * Key behaviors:
 * - scheduleReminders(): called on habit create/update, pre-schedules 3 days of reminders
 * - cancelTodayReminder(): called after check-in to prevent duplicate notification
 * - onRemotePushReceived(): called when WebSocket HABIT_REMINDER arrives, cancels local dupe
 * - refreshScheduledReminders(): called on app startup and login to restore lost notifications
 */

import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { HabitData } from '@/types';

// =============================================================================
// CONSTANTS
// =============================================================================

const STORAGE_PREFIX = '@vibeflow/habit_notif:';
const ROLLING_WINDOW_DAYS = 3;

// =============================================================================
// HELPERS
// =============================================================================

/** Get today's date as YYYY-MM-DD (04:00 AM reset aligned with server) */
function getTodayDateString(): string {
  const now = new Date();
  if (now.getHours() < 4) {
    now.setDate(now.getDate() - 1);
  }
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Generate future dates in YYYY-MM-DD format */
function getFutureDates(count: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  if (now.getHours() < 4) {
    now.setDate(now.getDate() - 1);
  }
  // Start from today
  for (let i = 0; i < count; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
  }
  return dates;
}

/** Parse "HH:mm" into hours and minutes */
function parseTime(timeStr: string): { hours: number; minutes: number } | null {
  const match = timeStr.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  return { hours: parseInt(match[1], 10), minutes: parseInt(match[2], 10) };
}

/** Build a Date object for a given date string + time string */
function buildTriggerDate(dateStr: string, timeStr: string): Date | null {
  const parsed = parseTime(timeStr);
  if (!parsed) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day, parsed.hours, parsed.minutes, 0, 0);
  return d;
}

// =============================================================================
// HABIT NOTIFICATION SERVICE
// =============================================================================

class HabitNotificationService {
  /**
   * Schedule local notifications for a habit for the next 3 days.
   * Cancels any previously scheduled notifications for this habit first.
   */
  async scheduleReminders(habit: HabitData): Promise<void> {
    if (!habit.reminderEnabled || !habit.reminderTime) {
      // No reminder configured — cancel any existing ones
      await this.cancelAllForHabit(habit.id);
      return;
    }

    try {
      // 1. Cancel old notifications for this habit
      await this.cancelAllForHabit(habit.id);

      // 2. Calculate future dates
      const futureDates = getFutureDates(ROLLING_WINDOW_DAYS);
      const now = new Date();
      const notificationIds: string[] = [];

      for (const dateStr of futureDates) {
        const triggerDate = buildTriggerDate(dateStr, habit.reminderTime);
        if (!triggerDate || triggerDate <= now) continue;

        try {
          const notifId = await Notifications.scheduleNotificationAsync({
            content: {
              title: `🌱 ${habit.title}`,
              body: habit.question ?? `该完成「${habit.title}」了`,
              sound: true,
              data: { type: 'habit_reminder', habitId: habit.id, date: dateStr },
            },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
          });
          notificationIds.push(notifId);
        } catch (err) {
          console.warn(`[HabitNotification] Failed to schedule for ${dateStr}:`, err);
        }
      }

      // 3. Persist notification IDs for this habit
      await AsyncStorage.setItem(
        `${STORAGE_PREFIX}${habit.id}`,
        JSON.stringify(notificationIds),
      );
    } catch (error) {
      console.error('[HabitNotification] scheduleReminders failed:', error);
    }
  }

  /**
   * Cancel today's reminder for a habit (called after check-in).
   * Prevents WebSocket push + local notification double-trigger.
   */
  async cancelTodayReminder(habitId: string): Promise<void> {
    try {
      const today = getTodayDateString();
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const notif of scheduled) {
        const data = notif.content.data as { habitId?: string; date?: string } | undefined;
        if (data?.habitId === habitId && data?.date === today) {
          await Notifications.cancelScheduledNotificationAsync(notif.identifier);
        }
      }
    } catch (error) {
      console.error('[HabitNotification] cancelTodayReminder failed:', error);
    }
  }

  /**
   * Called when a HABIT_REMINDER WebSocket push arrives.
   * Cancels the matching local scheduled notification to prevent duplicates.
   */
  async onRemotePushReceived(habitId: string): Promise<void> {
    await this.cancelTodayReminder(habitId);
  }

  /**
   * Refresh the 3-day rolling window of scheduled notifications.
   * Called on app startup and login success.
   * Cancels expired notifications and schedules new ones.
   */
  async refreshScheduledReminders(habits: HabitData[]): Promise<void> {
    try {
      // Cancel all habit-related scheduled notifications first
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const notif of scheduled) {
        const data = notif.content.data as { type?: string } | undefined;
        if (data?.type === 'habit_reminder') {
          await Notifications.cancelScheduledNotificationAsync(notif.identifier);
        }
      }

      // Re-schedule for all active habits with reminders
      for (const habit of habits) {
        if (habit.status === 'ACTIVE' && habit.reminderEnabled && habit.reminderTime) {
          await this.scheduleReminders(habit);
        }
      }

      console.log(`[HabitNotification] Refreshed reminders for ${habits.length} habits`);
    } catch (error) {
      console.error('[HabitNotification] refreshScheduledReminders failed:', error);
    }
  }

  /**
   * Cancel all scheduled notifications for a specific habit.
   */
  private async cancelAllForHabit(habitId: string): Promise<void> {
    try {
      // Try stored IDs first (faster)
      const storedJson = await AsyncStorage.getItem(`${STORAGE_PREFIX}${habitId}`);
      if (storedJson) {
        const ids = JSON.parse(storedJson) as string[];
        for (const id of ids) {
          try {
            await Notifications.cancelScheduledNotificationAsync(id);
          } catch {
            // Notification may already have fired
          }
        }
        await AsyncStorage.removeItem(`${STORAGE_PREFIX}${habitId}`);
      }

      // Also scan scheduled notifications in case stored IDs are stale
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const notif of scheduled) {
        const data = notif.content.data as { habitId?: string } | undefined;
        if (data?.habitId === habitId) {
          await Notifications.cancelScheduledNotificationAsync(notif.identifier);
        }
      }
    } catch (error) {
      console.error('[HabitNotification] cancelAllForHabit failed:', error);
    }
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const habitNotificationService = new HabitNotificationService();
