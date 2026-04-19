/**
 * TodayHabits Component
 *
 * Displays today's due habits with check-in/undo buttons.
 * Used in the Dashboard (StatusScreen) above or below the task list.
 */

import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useHabitStore, useTodayHabits, useTodayHabitsLoading, useHabits } from '@/store/habit.store';
import { useTheme } from '@/theme';
import { useConnectionStatus } from '@/store/app.store';
import type { TodayHabitData, HabitData } from '@/types';

// =============================================================================
// HELPERS
// =============================================================================

/** Format today's date as YYYY-MM-DD (04:00 AM reset aligned with server) */
function getTodayDateString(): string {
  const now = new Date();
  // If before 04:00, treat as previous day
  if (now.getHours() < 4) {
    now.setDate(now.getDate() - 1);
  }
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Format frequency for display */
function formatFrequency(freqNum: number, freqDen: number): string {
  if (freqNum === 1 && freqDen === 1) return '每天';
  if (freqNum === 1 && freqDen === 2) return '隔天';
  if (freqDen === 7) return `每周 ${freqNum} 次`;
  return `每 ${freqDen} 天 ${freqNum} 次`;
}

// =============================================================================
// HABIT ROW
// =============================================================================

interface HabitRowProps {
  habit: TodayHabitData;
  onToggle: (habit: TodayHabitData) => void;
}

function HabitRow({ habit, onToggle }: HabitRowProps): React.JSX.Element {
  const theme = useTheme();
  const isCompleted = habit.todayEntry !== null && habit.todayEntry.entryType !== 'SKIP';

  return (
    <TouchableOpacity
      style={[
        styles.habitRow,
        {
          backgroundColor: theme.colors.card,
          borderColor: isCompleted ? theme.colors.success + '40' : theme.colors.border,
        },
      ]}
      onPress={() => onToggle(habit)}
      activeOpacity={0.7}
    >
      {/* Checkbox */}
      <View
        style={[
          styles.checkbox,
          isCompleted
            ? { backgroundColor: theme.colors.success, borderColor: theme.colors.success }
            : { borderColor: theme.colors.border, backgroundColor: 'transparent' },
        ]}
      >
        {isCompleted && <Text style={styles.checkmark}>✓</Text>}
      </View>

      {/* Title + frequency */}
      <View style={styles.habitInfo}>
        <Text
          style={[
            styles.habitTitle,
            { color: isCompleted ? theme.colors.textMuted : theme.colors.text },
            isCompleted && styles.habitTitleCompleted,
          ]}
          numberOfLines={1}
        >
          {habit.title}
        </Text>
        <Text style={[styles.habitFrequency, { color: theme.colors.textMuted }]}>
          {formatFrequency(habit.freqNum, habit.freqDen)}
        </Text>
      </View>

      {/* Streak badge */}
      {habit.streak.current > 0 && (
        <View style={[styles.streakBadge, { backgroundColor: theme.colors.warning + '20' }]}>
          <Text style={[styles.streakText, { color: theme.colors.warning }]}>
            🔥 {habit.streak.current}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// =============================================================================
// TODAY HABITS
// =============================================================================

export function TodayHabits(): React.JSX.Element | null {
  const theme = useTheme();
  const todayHabits = useTodayHabits();
  const allHabits = useHabits();
  const loading = useTodayHabitsLoading();
  const connectionStatus = useConnectionStatus();
  const fetchTodayHabits = useHabitStore((s) => s.fetchTodayHabits);
  const fetchHabits = useHabitStore((s) => s.fetchHabits);
  const recordEntry = useHabitStore((s) => s.recordEntry);
  const deleteEntry = useHabitStore((s) => s.deleteEntry);

  // Fetch on mount and when connection is established
  useEffect(() => {
    if (connectionStatus === 'connected') {
      fetchTodayHabits();
      fetchHabits();
    }
  }, [connectionStatus, fetchTodayHabits, fetchHabits]);

  const handleToggle = useCallback(
    (habit: TodayHabitData) => {
      const today = getTodayDateString();
      const isCompleted = habit.todayEntry !== null && habit.todayEntry.entryType !== 'SKIP';

      if (isCompleted) {
        deleteEntry(habit.id, today);
      } else {
        recordEntry(habit.id, today, 1);
      }
    },
    [recordEntry, deleteEntry],
  );

  // Use todayHabits (isDue filtered) if available, otherwise show all active habits
  // This ensures habits always show even if isDue filtering returns empty
  const displayHabits: TodayHabitData[] = todayHabits.length > 0
    ? todayHabits
    : allHabits
        .filter((h: HabitData) => h.status === 'ACTIVE')
        .map((h: HabitData): TodayHabitData => ({
          ...h,
          todayEntry: null,
          streak: { current: 0, best: 0 },
          isDue: false,
        }));

  // Don't render section if no habits at all (empty state is subtle)
  if (!loading && displayHabits.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
        今日习惯
      </Text>

      {loading && displayHabits.length === 0 ? (
        <ActivityIndicator size="small" color={theme.colors.primary} style={styles.loader} />
      ) : (
        displayHabits.map((habit) => (
          <HabitRow key={habit.id} habit={habit} onToggle={handleToggle} />
        ))
      )}
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  loader: {
    paddingVertical: 16,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  habitInfo: {
    flex: 1,
    gap: 2,
  },
  habitTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  habitTitleCompleted: {
    textDecorationLine: 'line-through',
  },
  habitFrequency: {
    fontSize: 12,
  },
  streakBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  streakText: {
    fontSize: 12,
    fontWeight: '600',
  },
});

export default TodayHabits;
