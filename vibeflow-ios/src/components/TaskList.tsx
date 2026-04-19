/**
 * TaskList Component
 *
 * Display of today's tasks with interactive completion.
 * Shows overdue tasks, Top 3 tasks, and all scheduled tasks for today.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActionSheetIOS } from 'react-native';
import { useAppStore } from '@/store/app.store';
import { actionService } from '@/services/action.service';
import {
  getTop3Tasks,
  getNonTop3TodayTasks,
  sortTasksForDisplay,
} from '@/utils/task-filter';
import { useTheme } from '@/theme';
import type { TaskData } from '@/types';

// =============================================================================
// COMPONENT
// =============================================================================

interface TaskListProps {
  onEditTask?: (taskId: string) => void;
}

export function TaskList({ onEditTask }: TaskListProps): React.JSX.Element {
  const theme = useTheme();
  const todayTasks = useAppStore((state) => state.todayTasks);
  const top3Tasks = useAppStore((state) => state.top3Tasks);
  const overdueTasks = useAppStore((state) => state.overdueTasks);

  // Sort tasks for display
  const sortedTop3 = sortTasksForDisplay(top3Tasks);
  const otherTasks = sortTasksForDisplay(
    getNonTop3TodayTasks(todayTasks)
  );
  const sortedOverdue = sortTasksForDisplay(overdueTasks);

  const hasTop3 = sortedTop3.length > 0;
  const hasOtherTasks = otherTasks.length > 0;
  const hasOverdue = sortedOverdue.length > 0;

  return (
    <View style={styles.container}>
      {/* Overdue Section */}
      {hasOverdue && (
        <View style={styles.section}>
          <View style={styles.overdueTitleRow}>
            <Text style={[styles.sectionTitle, { color: theme.colors.error }]}>
              逾期 ({sortedOverdue.length})
            </Text>
          </View>
          {sortedOverdue.map((task) => (
            <TaskItem key={task.id} task={task} isOverdue onEdit={onEditTask} />
          ))}
        </View>
      )}

      {/* Top 3 Section */}
      {hasTop3 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>今日 Top 3</Text>
          {sortedTop3.map((task) => (
            <TaskItem key={task.id} task={task} isTop3 onEdit={onEditTask} />
          ))}
        </View>
      )}

      {/* Other Tasks Section */}
      {hasOtherTasks && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>其他任务</Text>
          {otherTasks.map((task) => (
            <TaskItem key={task.id} task={task} onEdit={onEditTask} />
          ))}
        </View>
      )}

      {/* Empty State */}
      {!hasTop3 && !hasOtherTasks && !hasOverdue && (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>今日暂无任务</Text>
          <Text style={[styles.emptySubtext, { color: theme.colors.textMuted }]}>
            请在 Web 或桌面端添加任务
          </Text>
        </View>
      )}
    </View>
  );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

interface TaskItemProps {
  task: TaskData;
  isTop3?: boolean;
  isOverdue?: boolean;
  onEdit?: (taskId: string) => void;
}

function TaskItem({ task, isTop3 = false, isOverdue = false, onEdit }: TaskItemProps): React.JSX.Element {
  const theme = useTheme();
  const isCompleted = task.status === 'completed';
  const isInProgress = task.status === 'in_progress';
  const isCurrent = task.isCurrentTask;

  const activePomodoro = useAppStore((s) => s.activePomodoro);
  const optimisticCompleteTask = useAppStore((s) => s.optimisticCompleteTask);
  const optimisticUpdateTaskStatus = useAppStore((s) => s.optimisticUpdateTaskStatus);
  const confirmOptimisticUpdate = useAppStore((s) => s.confirmOptimisticUpdate);
  const rollbackOptimisticUpdate = useAppStore((s) => s.rollbackOptimisticUpdate);

  const handleComplete = async () => {
    if (isCompleted) return;

    // Apply optimistic update
    const optimisticId = optimisticCompleteTask(task.id);

    // Send to server
    const result = await actionService.completeTask(task.id);

    if (result.success) {
      confirmOptimisticUpdate(optimisticId);
    } else {
      rollbackOptimisticUpdate(optimisticId);
      Alert.alert('操作失败', result.error?.message || '无法完成任务');
    }
  };

  const handleStatusChange = async (newStatus: 'pending' | 'in_progress' | 'completed') => {
    if (task.status === newStatus) return;

    const optimisticId = optimisticUpdateTaskStatus(task.id, newStatus);
    const serverStatus = newStatus === 'pending' ? 'TODO' : newStatus === 'in_progress' ? 'IN_PROGRESS' : 'DONE';

    const result = await actionService.updateTaskStatus(task.id, serverStatus as 'TODO' | 'IN_PROGRESS' | 'DONE');

    if (result.success) {
      confirmOptimisticUpdate(optimisticId);
    } else {
      rollbackOptimisticUpdate(optimisticId);
      Alert.alert('操作失败', result.error?.message || '无法更新状态');
    }
  };

  const handleDeferToToday = async () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const result = await actionService.updateTask(task.id, { planDate: dateStr });
    if (!result.success) {
      Alert.alert('操作失败', result.error?.message || '无法移到今天');
    }
  };

  const handleLongPress = () => {
    const hasActivePomodoro = !!activePomodoro;
    const pomodoroLabel = hasActivePomodoro ? '切换到此任务' : '开始番茄钟';

    const options = isOverdue
      ? ['取消', '编辑', '移到今天', '标记为已完成', pomodoroLabel]
      : ['取消', '编辑', '标记为待办', '标记为进行中', '标记为已完成', pomodoroLabel];

    ActionSheetIOS.showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex: 0,
      },
      async (buttonIndex) => {
        if (isOverdue) {
          switch (buttonIndex) {
            case 1:
              onEdit?.(task.id);
              break;
            case 2:
              handleDeferToToday();
              break;
            case 3:
              handleStatusChange('completed');
              break;
            case 4:
              if (hasActivePomodoro) {
                const result = await actionService.switchTask(activePomodoro.id, task.id);
                if (!result.success) {
                  Alert.alert('切换失败', result.error?.message || '无法切换任务');
                }
              } else {
                const result = await actionService.startPomodoro(task.id);
                if (!result.success) {
                  Alert.alert('启动失败', result.error?.message || '无法启动番茄钟');
                }
              }
              break;
          }
        } else {
          switch (buttonIndex) {
            case 1:
              onEdit?.(task.id);
              break;
            case 2:
              handleStatusChange('pending');
              break;
            case 3:
              handleStatusChange('in_progress');
              break;
            case 4:
              handleStatusChange('completed');
              break;
            case 5:
              if (hasActivePomodoro) {
                const result = await actionService.switchTask(activePomodoro.id, task.id);
                if (!result.success) {
                  Alert.alert('切换失败', result.error?.message || '无法切换任务');
                }
              } else {
                const result = await actionService.startPomodoro(task.id);
                if (!result.success) {
                  Alert.alert('启动失败', result.error?.message || '无法启动番茄钟');
                }
              }
              break;
          }
        }
      }
    );
  };

  return (
    <TouchableOpacity
      style={[
        styles.taskItem,
        { backgroundColor: theme.colors.card },
        isCompleted && styles.taskItemCompleted,
        isCurrent && { borderLeftWidth: 4, borderLeftColor: theme.colors.error },
        isOverdue && { borderLeftWidth: 3, borderLeftColor: theme.colors.error },
      ]}
      onLongPress={handleLongPress}
      activeOpacity={0.9}
    >
      {/* Checkbox - Tappable */}
      <TouchableOpacity
        style={styles.statusIndicator}
        onPress={handleComplete}
        disabled={isCompleted}
        activeOpacity={0.6}
      >
        {isCompleted ? (
          <View style={[styles.checkmark, { backgroundColor: theme.colors.success }]}>
            <Text style={styles.checkmarkText}>✓</Text>
          </View>
        ) : isInProgress ? (
          <View style={[styles.inProgressDot, { backgroundColor: theme.colors.error }]} />
        ) : (
          <View style={[styles.pendingDot, { borderColor: theme.colors.border }]} />
        )}
      </TouchableOpacity>

      {/* Task Content */}
      <View style={styles.taskContent}>
        <Text
          style={[
            styles.taskTitle,
            { color: theme.colors.text },
            isCompleted && { textDecorationLine: 'line-through', color: theme.colors.textMuted },
          ]}
          numberOfLines={2}
        >
          {task.title}
        </Text>
        <View style={styles.taskMeta}>
          <PriorityBadge priority={task.priority} />
          {isOverdue && task.planDate && (
            <View style={[styles.badge, { backgroundColor: '#FEE2E2' }]}>
              <Text style={[styles.badgeText, { color: '#DC2626' }]}>
                {task.planDate}
              </Text>
            </View>
          )}
          {!isOverdue && <StatusBadge status={task.status} />}
          {isCurrent && <CurrentBadge />}
        </View>
      </View>

      {/* Top 3 Indicator */}
      {isTop3 && (
        <View style={styles.top3Badge}>
          <Text style={styles.top3Text}>★</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

interface PriorityBadgeProps {
  priority: TaskData['priority'];
}

function PriorityBadge({ priority }: PriorityBadgeProps): React.JSX.Element {
  const colors: Record<TaskData['priority'], { bg: string; text: string }> = {
    P1: { bg: '#FEE2E2', text: '#DC2626' },
    P2: { bg: '#FEF3C7', text: '#D97706' },
    P3: { bg: '#DBEAFE', text: '#2563EB' },
  };

  return (
    <View style={[styles.badge, { backgroundColor: colors[priority].bg }]}>
      <Text style={[styles.badgeText, { color: colors[priority].text }]}>
        {priority}
      </Text>
    </View>
  );
}

interface StatusBadgeProps {
  status: TaskData['status'];
}

function StatusBadge({ status }: StatusBadgeProps): React.JSX.Element {
  const labels: Record<TaskData['status'], string> = {
    pending: '待办',
    in_progress: '进行中',
    completed: '已完成',
  };

  const colors: Record<TaskData['status'], { bg: string; text: string }> = {
    pending: { bg: '#F3F4F6', text: '#6B7280' },
    in_progress: { bg: '#DCFCE7', text: '#16A34A' },
    completed: { bg: '#E5E7EB', text: '#9CA3AF' },
  };

  return (
    <View style={[styles.badge, { backgroundColor: colors[status].bg }]}>
      <Text style={[styles.badgeText, { color: colors[status].text }]}>
        {labels[status]}
      </Text>
    </View>
  );
}

function CurrentBadge(): React.JSX.Element {
  return (
    <View style={[styles.badge, styles.currentBadge]}>
      <Text style={styles.currentBadgeText}>当前</Text>
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    marginBottom: 20,
  },
  overdueTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  taskItemCompleted: {
    opacity: 0.7,
  },
  statusIndicator: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkmark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  inProgressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  pendingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  taskMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  currentBadge: {
    backgroundColor: '#FEE2E2',
  },
  currentBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#DC2626',
  },
  top3Badge: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  top3Text: {
    fontSize: 16,
    color: '#F59E0B',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
  },
});

export default TaskList;
