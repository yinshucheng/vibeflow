/**
 * Status Screen
 *
 * Main screen displaying pomodoro status and task list.
 * All content is read-only - no action buttons.
 *
 * Requirements: 4.1, 9.1, 9.4
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PomodoroStatus } from '@/components/PomodoroStatus';
import { TaskList } from '@/components/TaskList';
import { TaskEditScreen } from '@/screens/TaskEditScreen';
import {
  useConnectionStatus,
  useDailyState,
  useLastSyncTime,
} from '@/store/app.store';
import { useTheme } from '@/theme';

// =============================================================================
// DAILY STATE INDICATOR
// =============================================================================

interface DailyStateIndicatorProps {
  state: 'LOCKED' | 'PLANNING' | 'FOCUS' | 'REST' | null;
}

function DailyStateIndicator({ state }: DailyStateIndicatorProps): React.JSX.Element {
  const theme = useTheme();

  const stateConfig: Record<string, { label: string; color: string }> = {
    LOCKED: { label: '已锁定', color: theme.colors.textMuted },
    PLANNING: { label: '计划中', color: theme.colors.primary },
    FOCUS: { label: '专注中', color: theme.colors.success },
    REST: { label: '休息中', color: theme.colors.warning },
  };

  const config = state ? stateConfig[state] ?? { label: '未知', color: theme.colors.textMuted } : { label: '未知', color: theme.colors.textMuted };

  return (
    <View style={[styles.stateIndicator, { backgroundColor: config.color + '20' }]}>
      <View style={[styles.stateDot, { backgroundColor: config.color }]} />
      <Text style={[styles.stateText, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

// =============================================================================
// CONNECTION STATUS INDICATOR
// =============================================================================

function ConnectionIndicator(): React.JSX.Element {
  const theme = useTheme();
  const connectionStatus = useConnectionStatus();

  const statusConfig = {
    connected: { label: '已连接', color: theme.colors.success },
    connecting: { label: '连接中...', color: theme.colors.warning },
    disconnected: { label: '离线', color: theme.colors.error },
  };

  const config = statusConfig[connectionStatus];

  return (
    <View style={styles.connectionIndicator}>
      <View style={[styles.connectionDot, { backgroundColor: config.color }]} />
      <Text style={[styles.connectionText, { color: theme.colors.textMuted }]}>
        {config.label}
      </Text>
    </View>
  );
}

// =============================================================================
// LAST SYNC TIME
// =============================================================================

function LastSyncTime(): React.JSX.Element | null {
  const theme = useTheme();
  const lastSyncTime = useLastSyncTime();

  if (!lastSyncTime) return null;

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Text style={[styles.lastSyncText, { color: theme.colors.textMuted }]}>
      最后同步: {formatTime(lastSyncTime)}
    </Text>
  );
}

// =============================================================================
// STATUS SCREEN
// =============================================================================

export function StatusScreen(): React.JSX.Element {
  const theme = useTheme();
  const dailyState = useDailyState();
  const connectionStatus = useConnectionStatus();
  const [refreshing, setRefreshing] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  // Pull to refresh handler (just visual feedback, actual sync is automatic)
  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    // Simulate refresh delay - actual sync happens via WebSocket
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.title, { color: theme.colors.text }]}>VibeFlow</Text>
          <DailyStateIndicator state={dailyState?.state ?? null} />
        </View>
        <View style={styles.headerRight}>
          <ConnectionIndicator />
        </View>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* Offline Banner */}
        {connectionStatus === 'disconnected' && (
          <View style={[styles.offlineBanner, { backgroundColor: theme.colors.warning + '20' }]}>
            <Text style={[styles.offlineBannerText, { color: theme.colors.warning }]}>
              离线模式 - 显示缓存数据
            </Text>
          </View>
        )}

        {/* Pomodoro Status */}
        <View style={styles.section}>
          <PomodoroStatus />
        </View>

        {/* Task List */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            今日任务
          </Text>
          <TaskList onEditTask={setEditingTaskId} />
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <LastSyncTime />
        </View>
      </ScrollView>

      {/* Task Edit Modal */}
      <Modal visible={!!editingTaskId} animationType="slide">
        {editingTaskId && (
          <TaskEditScreen taskId={editingTaskId} onClose={() => setEditingTaskId(null)} />
        )}
      </Modal>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  stateIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  stateDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stateText: {
    fontSize: 12,
    fontWeight: '600',
  },
  connectionIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connectionText: {
    fontSize: 12,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  offlineBanner: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  offlineBannerText: {
    fontSize: 14,
    fontWeight: '500',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  lastSyncText: {
    fontSize: 12,
  },
});

export default StatusScreen;
