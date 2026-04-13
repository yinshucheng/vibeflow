/**
 * Habit Form Screen
 *
 * Create or edit a habit.
 * Phase 1: type fixed to BOOLEAN, supports title, frequency, and reminder time.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useHabitStore } from '@/store/habit.store';
import { useTheme } from '@/theme';
import type { HabitData } from '@/types';
import type { RootStackParamList } from '@/navigation';
import { habitNotificationService } from '@/services/habit-notification.service';

interface FrequencyOption {
  label: string;
  freqNum: number;
  freqDen: number;
}

const FREQUENCY_OPTIONS: FrequencyOption[] = [
  { label: '每天', freqNum: 1, freqDen: 1 },
  { label: '隔天', freqNum: 1, freqDen: 2 },
  { label: '每周 3 次', freqNum: 3, freqDen: 7 },
  { label: '每周 5 次', freqNum: 5, freqDen: 7 },
  { label: '每周 1 次', freqNum: 1, freqDen: 7 },
];

const REMINDER_TIME_OPTIONS = [
  null,
  '06:00',
  '07:00',
  '08:00',
  '09:00',
  '12:00',
  '18:00',
  '20:00',
  '21:00',
  '22:00',
];

// =============================================================================
// HABIT FORM SCREEN
// =============================================================================

export function HabitFormScreen(): React.JSX.Element {
  const theme = useTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'HabitForm'>>();

  const existingHabit = route.params?.habit ?? null;
  const isEditing = !!existingHabit;

  const createHabit = useHabitStore((s) => s.createHabit);
  const updateHabit = useHabitStore((s) => s.updateHabit);

  // Form state
  const [title, setTitle] = useState(existingHabit?.title ?? '');
  const [description, setDescription] = useState(existingHabit?.description ?? '');
  const [selectedFreqIndex, setSelectedFreqIndex] = useState(() => {
    if (!existingHabit) return 0; // Default to 每天
    return FREQUENCY_OPTIONS.findIndex(
      (opt) => opt.freqNum === existingHabit.freqNum && opt.freqDen === existingHabit.freqDen,
    );
  });
  const [reminderTime, setReminderTime] = useState<string | null>(
    existingHabit?.reminderTime ?? null,
  );
  const [submitting, setSubmitting] = useState(false);

  const freq = FREQUENCY_OPTIONS[selectedFreqIndex >= 0 ? selectedFreqIndex : 0];

  const handleSave = useCallback(async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert('请输入标题', '习惯标题不能为空');
      return;
    }
    if (trimmedTitle.length > 100) {
      Alert.alert('标题过长', '标题最多 100 个字符');
      return;
    }

    setSubmitting(true);
    try {
      if (isEditing && existingHabit) {
        const result = await updateHabit(existingHabit.id, {
          title: trimmedTitle,
          description: description.trim() || undefined,
          freqNum: freq.freqNum,
          freqDen: freq.freqDen,
          reminderEnabled: !!reminderTime,
          reminderTime: reminderTime ?? undefined,
        });
        if (result.success) {
          // Update local notifications for this habit
          await habitNotificationService.scheduleReminders({
            ...existingHabit,
            title: trimmedTitle,
            freqNum: freq.freqNum,
            freqDen: freq.freqDen,
            reminderEnabled: !!reminderTime,
            reminderTime: reminderTime ?? null,
          });
          navigation.goBack();
        } else {
          Alert.alert('更新失败', result.error?.message ?? '请稍后重试');
        }
      } else {
        const result = await createHabit({
          title: trimmedTitle,
          type: 'BOOLEAN',
          freqNum: freq.freqNum,
          freqDen: freq.freqDen,
          description: description.trim() || undefined,
          reminderEnabled: !!reminderTime,
          reminderTime: reminderTime ?? undefined,
        });
        if (result.success && result.data?.habit) {
          // Schedule local notifications for the new habit
          await habitNotificationService.scheduleReminders({
            id: result.data.habit.id,
            title: trimmedTitle,
            freqNum: freq.freqNum,
            freqDen: freq.freqDen,
            reminderEnabled: !!reminderTime,
            reminderTime: reminderTime ?? null,
          } as HabitData);
          navigation.goBack();
        } else {
          Alert.alert('创建失败', result.error?.message ?? '请稍后重试');
        }
      }
    } catch {
      Alert.alert('操作失败', '网络错误，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }, [title, description, freq, reminderTime, isEditing, existingHabit, createHabit, updateHabit, navigation]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={[styles.headerButton, { color: theme.colors.primary }]}>取消</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
          {isEditing ? '编辑习惯' : '新建习惯'}
        </Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={submitting || !title.trim()}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.headerButton,
              styles.headerButtonBold,
              { color: submitting || !title.trim() ? theme.colors.textMuted : theme.colors.primary },
            ]}
          >
            {submitting ? '保存中...' : '保存'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} keyboardShouldPersistTaps="handled">
        {/* Title */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>标题</Text>
          <TextInput
            style={[
              styles.textInput,
              {
                color: theme.colors.text,
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
              },
            ]}
            value={title}
            onChangeText={setTitle}
            placeholder="例如：每天冥想 10 分钟"
            placeholderTextColor={theme.colors.textMuted}
            maxLength={100}
            autoFocus={!isEditing}
          />
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>描述（可选）</Text>
          <TextInput
            style={[
              styles.textInput,
              styles.textArea,
              {
                color: theme.colors.text,
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
              },
            ]}
            value={description}
            onChangeText={setDescription}
            placeholder="补充说明..."
            placeholderTextColor={theme.colors.textMuted}
            maxLength={500}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Frequency */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>频率</Text>
          <View style={styles.chipContainer}>
            {FREQUENCY_OPTIONS.map((option, index) => {
              const isSelected = index === (selectedFreqIndex >= 0 ? selectedFreqIndex : 0);
              return (
                <TouchableOpacity
                  key={option.label}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: isSelected ? theme.colors.primary : theme.colors.card,
                      borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                    },
                  ]}
                  onPress={() => setSelectedFreqIndex(index)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: isSelected ? '#FFFFFF' : theme.colors.text },
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Reminder Time */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>提醒时间（可选）</Text>
          <View style={styles.chipContainer}>
            <TouchableOpacity
              style={[
                styles.chip,
                {
                  backgroundColor: reminderTime === null ? theme.colors.primary : theme.colors.card,
                  borderColor: reminderTime === null ? theme.colors.primary : theme.colors.border,
                },
              ]}
              onPress={() => setReminderTime(null)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: reminderTime === null ? '#FFFFFF' : theme.colors.text },
                ]}
              >
                不提醒
              </Text>
            </TouchableOpacity>
            {REMINDER_TIME_OPTIONS.filter((t): t is string => t !== null).map((time) => {
              const isSelected = reminderTime === time;
              return (
                <TouchableOpacity
                  key={time}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: isSelected ? theme.colors.primary : theme.colors.card,
                      borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                    },
                  ]}
                  onPress={() => setReminderTime(time)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: isSelected ? '#FFFFFF' : theme.colors.text },
                    ]}
                  >
                    {time}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={{ height: 48 }} />
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
    fontSize: 17,
    fontWeight: '600',
  },
  headerButton: {
    fontSize: 16,
  },
  headerButtonBold: {
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  textInput: {
    fontSize: 16,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
  },
  textArea: {
    minHeight: 80,
    paddingTop: 12,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
  },
});

export default HabitFormScreen;
