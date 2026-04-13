/**
 * Habits Screen
 *
 * Lists all active habits with card-based layout.
 * Supports swipe-to-delete with confirmation dialog.
 * Navigate to HabitFormScreen for create/edit.
 */

import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useHabitStore, useHabits, useHabitsLoading } from '@/store/habit.store';
import { useConnectionStatus } from '@/store/app.store';
import { useTheme } from '@/theme';
import type { HabitData } from '@/types';
import type { RootStackParamList } from '@/navigation';

// =============================================================================
// HELPERS
// =============================================================================

function formatFrequency(freqNum: number, freqDen: number): string {
  if (freqNum === 1 && freqDen === 1) return '每天';
  if (freqNum === 1 && freqDen === 2) return '隔天';
  if (freqDen === 7) return `每周 ${freqNum} 次`;
  return `每 ${freqDen} 天 ${freqNum} 次`;
}

function formatReminderTime(habit: HabitData): string | null {
  if (!habit.reminderEnabled || !habit.reminderTime) return null;
  return habit.reminderTime;
}

// =============================================================================
// HABIT CARD
// =============================================================================

interface HabitCardProps {
  habit: HabitData;
  onEdit: (habit: HabitData) => void;
  onDelete: (habit: HabitData) => void;
}

function HabitCard({ habit, onEdit, onDelete }: HabitCardProps): React.JSX.Element {
  const theme = useTheme();
  const reminderTime = formatReminderTime(habit);

  const handleLongPress = useCallback(() => {
    Alert.alert(habit.title, '选择操作', [
      { text: '编辑', onPress: () => onEdit(habit) },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          Alert.alert('确认删除', `确定要删除习惯「${habit.title}」吗？所有打卡记录将一并删除。`, [
            { text: '取消', style: 'cancel' },
            { text: '删除', style: 'destructive', onPress: () => onDelete(habit) },
          ]);
        },
      },
      { text: '取消', style: 'cancel' },
    ]);
  }, [habit, onEdit, onDelete]);

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
      onPress={() => onEdit(habit)}
      onLongPress={handleLongPress}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.iconCircle, { backgroundColor: (habit.color ?? theme.colors.primary) + '20' }]}>
          <Text style={[styles.iconText, { color: habit.color ?? theme.colors.primary }]}>
            {habit.icon ? habit.icon.slice(0, 2) : '✓'}
          </Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={[styles.cardTitle, { color: theme.colors.text }]} numberOfLines={1}>
            {habit.title}
          </Text>
          <View style={styles.cardMeta}>
            <Text style={[styles.cardFrequency, { color: theme.colors.textMuted }]}>
              {formatFrequency(habit.freqNum, habit.freqDen)}
            </Text>
            {reminderTime && (
              <Text style={[styles.cardReminder, { color: theme.colors.textMuted }]}>
                ⏰ {reminderTime}
              </Text>
            )}
          </View>
        </View>
      </View>
      {habit.description && (
        <Text style={[styles.cardDescription, { color: theme.colors.textSecondary }]} numberOfLines={2}>
          {habit.description}
        </Text>
      )}
    </TouchableOpacity>
  );
}

// =============================================================================
// HABITS SCREEN
// =============================================================================

export function HabitsScreen(): React.JSX.Element {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const habits = useHabits();
  const loading = useHabitsLoading();
  const connectionStatus = useConnectionStatus();
  const fetchHabits = useHabitStore((s) => s.fetchHabits);
  const deleteHabit = useHabitStore((s) => s.deleteHabit);

  useEffect(() => {
    if (connectionStatus === 'connected') {
      fetchHabits();
    }
  }, [connectionStatus, fetchHabits]);

  const handleCreate = useCallback(() => {
    navigation.navigate('HabitForm', {});
  }, [navigation]);

  const handleEdit = useCallback(
    (habit: HabitData) => {
      navigation.navigate('HabitForm', { habitId: habit.id, habit });
    },
    [navigation],
  );

  const handleDelete = useCallback(
    async (habit: HabitData) => {
      const result = await deleteHabit(habit.id);
      if (!result.success) {
        Alert.alert('删除失败', result.error?.message ?? '请稍后重试');
      }
    },
    [deleteHabit],
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>习惯</Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: theme.colors.primary }]}
          onPress={handleCreate}
          activeOpacity={0.7}
        >
          <Text style={styles.addButtonText}>+ 新建</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {loading && habits.length === 0 ? (
          <ActivityIndicator size="large" color={theme.colors.primary} style={styles.loader} />
        ) : habits.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyIcon]}>🌱</Text>
            <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>还没有习惯</Text>
            <Text style={[styles.emptySubtitle, { color: theme.colors.textMuted }]}>
              点击右上角「新建」创建你的第一个习惯
            </Text>
          </View>
        ) : (
          habits.map((habit) => (
            <HabitCard
              key={habit.id}
              habit={habit}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
  },
  addButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  loader: {
    paddingVertical: 48,
  },
  // Card
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 18,
    fontWeight: '600',
  },
  cardInfo: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  cardMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  cardFrequency: {
    fontSize: 13,
  },
  cardReminder: {
    fontSize: 13,
  },
  cardDescription: {
    fontSize: 13,
    marginTop: 8,
    marginLeft: 52,
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default HabitsScreen;
