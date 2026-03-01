/**
 * Settings Screen (Read-Only)
 *
 * Displays user info, blocked apps, and app status.
 * Includes Screen Time authorization and blocking reason display.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useConnectionStatus,
  useUserInfo,
  useBlockingState,
  usePolicy,
} from '@/store/app.store';
import { blockingService } from '@/services/blocking.service';
import { useTheme } from '@/theme';
import type { AuthorizationStatus, BlockingReason } from '@/types';

// =============================================================================
// CONSTANTS
// =============================================================================

const APP_VERSION = '1.0.0';

const BLOCKING_REASON_LABELS: Record<BlockingReason, string> = {
  focus: '专注模式',
  over_rest: '超时休息',
  sleep: '睡眠时段',
};

// =============================================================================
// SECTION COMPONENT
// =============================================================================

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps): React.JSX.Element {
  const theme = useTheme();

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>
        {title}
      </Text>
      <View style={[styles.sectionContent, { backgroundColor: theme.colors.card }]}>
        {children}
      </View>
    </View>
  );
}

// =============================================================================
// ROW COMPONENT
// =============================================================================

interface RowProps {
  label: string;
  value: string;
  isLast?: boolean;
}

function Row({ label, value, isLast = false }: RowProps): React.JSX.Element {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.row,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
      ]}
    >
      <Text style={[styles.rowLabel, { color: theme.colors.text }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: theme.colors.textSecondary }]}>{value}</Text>
    </View>
  );
}

// =============================================================================
// AUTHORIZATION STATUS BADGE
// =============================================================================

interface AuthStatusBadgeProps {
  status: AuthorizationStatus;
}

function AuthStatusBadge({ status }: AuthStatusBadgeProps): React.JSX.Element {
  const theme = useTheme();

  const statusConfig: Record<AuthorizationStatus, { label: string; color: string }> = {
    authorized: { label: '已授权', color: theme.colors.success },
    denied: { label: '已拒绝', color: theme.colors.error },
    notDetermined: { label: '未请求', color: theme.colors.warning },
    restricted: { label: '受限', color: theme.colors.textMuted },
  };

  const config = statusConfig[status];

  return (
    <View style={[styles.badge, { backgroundColor: config.color + '20' }]}>
      <Text style={[styles.badgeText, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

// =============================================================================
// SETTINGS SCREEN
// =============================================================================

export function SettingsScreen(): React.JSX.Element {
  const theme = useTheme();
  const connectionStatus = useConnectionStatus();
  const { userEmail } = useUserInfo();
  const { selectionSummary, isBlockingActive, blockingReason } = useBlockingState();
  const policy = usePolicy();
  const [authStatus, setAuthStatus] = useState<AuthorizationStatus>('notDetermined');

  // Load authorization status on mount
  useEffect(() => {
    const loadAuthStatus = async (): Promise<void> => {
      const status = await blockingService.getAuthorizationStatus();
      setAuthStatus(status);
    };
    loadAuthStatus();
  }, []);

  const handleRequestAuthorization = useCallback(async () => {
    try {
      const status = await blockingService.requestAuthorization();
      setAuthStatus(status);
      if (status === 'denied') {
        Alert.alert(
          '授权被拒绝',
          '请在系统设置 > 屏幕使用时间中手动授权本应用。',
        );
      }
    } catch {
      Alert.alert('授权失败', '请稍后重试或在系统设置中授权。');
    }
  }, []);

  const connectionStatusText = {
    connected: '已连接',
    connecting: '连接中...',
    disconnected: '离线',
  };

  const blockingStatusText = (): string => {
    if (!isBlockingActive) return '未启用';
    if (blockingReason) return BLOCKING_REASON_LABELS[blockingReason];
    return '已启用';
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView style={styles.scrollView}>
        {/* User Info Section */}
        <Section title="用户信息">
          <Row label="邮箱" value={userEmail ?? 'test@example.com'} isLast />
        </Section>

        {/* Screen Time Section */}
        <Section title="屏幕使用时间">
          <View style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }]}>
            <Text style={[styles.rowLabel, { color: theme.colors.text }]}>授权状态</Text>
            <AuthStatusBadge status={authStatus} />
          </View>
          {authStatus !== 'authorized' && (
            <TouchableOpacity
              style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }]}
              onPress={handleRequestAuthorization}
            >
              <Text style={[styles.rowLabel, { color: theme.colors.primary }]}>请求屏幕时间授权</Text>
            </TouchableOpacity>
          )}
          <Row label="阻断状态" value={blockingStatusText()} />
          {blockingReason && (
            <Row label="阻断原因" value={BLOCKING_REASON_LABELS[blockingReason]} isLast />
          )}
          {!blockingReason && (
            <View style={{ height: 0 }} />
          )}
        </Section>

        {/* Sleep Time Section */}
        {policy?.sleepTime && (
          <Section title="睡眠时间">
            <Row label="状态" value={policy.sleepTime.enabled ? '已启用' : '未启用'} />
            <Row label="开始时间" value={policy.sleepTime.startTime} />
            <Row label="结束时间" value={policy.sleepTime.endTime} />
            <Row
              label="当前状态"
              value={
                policy.sleepTime.isCurrentlyActive
                  ? policy.sleepTime.isSnoozed
                    ? '已贪睡'
                    : '睡眠时段中'
                  : '非睡眠时段'
              }
              isLast
            />
          </Section>
        )}

        {/* Over Rest Section */}
        {policy?.overRest?.isOverRest && (
          <Section title="超时休息">
            <Row
              label="超时"
              value={`${policy.overRest.overRestMinutes} 分钟`}
              isLast
            />
          </Section>
        )}

        {/* Blocking Selection Section */}
        <Section title="分心应用选择">
          {selectionSummary && selectionSummary.hasSelection ? (
            <>
              <Row label="应用数量" value={`${selectionSummary.appCount} 个`} />
              <Row label="品类数量" value={`${selectionSummary.categoryCount} 个`} isLast />
            </>
          ) : (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                未配置分心应用（阻断时将屏蔽所有应用）
              </Text>
            </View>
          )}
        </Section>

        {/* App Info Section */}
        <Section title="应用信息">
          <Row label="版本" value={APP_VERSION} />
          <Row label="连接状态" value={connectionStatusText[connectionStatus]} isLast />
        </Section>

        {/* Read-Only Notice */}
        <View style={styles.notice}>
          <Text style={[styles.noticeText, { color: theme.colors.textMuted }]}>
            所有设置均为只读，请在 Web 端修改设置
          </Text>
        </View>
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
  scrollView: {
    flex: 1,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionContent: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLabel: {
    fontSize: 16,
  },
  rowValue: {
    fontSize: 16,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
  },
  notice: {
    padding: 24,
    alignItems: 'center',
  },
  noticeText: {
    fontSize: 13,
    textAlign: 'center',
  },
});

export default SettingsScreen;
