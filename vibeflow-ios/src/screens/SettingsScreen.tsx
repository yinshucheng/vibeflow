/**
 * Settings Screen
 *
 * Displays user info, Screen Time authorization, distraction/work app selection,
 * blocking status, and app info. Allows interactive app selection via FamilyActivityPicker.
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
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useConnectionStatus,
  useUserInfo,
  useBlockingState,
  usePolicy,
  useAppStore,
} from '@/store/app.store';
import { blockingService } from '@/services/blocking.service';
import { screenTimeService } from '@/services/screen-time.service';
import { useTheme } from '@/theme';
import type { AuthorizationStatus, BlockingReason, SelectionSummary } from '@/types';

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
// TAPPABLE ROW COMPONENT
// =============================================================================

interface TappableRowProps {
  label: string;
  value: string;
  onPress: () => void;
  disabled?: boolean;
  disabledHint?: string;
  isLast?: boolean;
  loading?: boolean;
}

function TappableRow({
  label,
  value,
  onPress,
  disabled = false,
  disabledHint,
  isLast = false,
  loading = false,
}: TappableRowProps): React.JSX.Element {
  const theme = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.row,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.6}
    >
      <View style={styles.tappableRowLeft}>
        <Text style={[styles.rowLabel, { color: disabled ? theme.colors.textMuted : theme.colors.text }]}>
          {label}
        </Text>
        {disabled && disabledHint && (
          <Text style={[styles.disabledHint, { color: theme.colors.textMuted }]}>
            {disabledHint}
          </Text>
        )}
      </View>
      <View style={styles.tappableRowRight}>
        {loading ? (
          <ActivityIndicator size="small" color={theme.colors.textMuted} />
        ) : (
          <Text style={[styles.rowValue, { color: disabled ? theme.colors.textMuted : theme.colors.textSecondary }]}>
            {value}
          </Text>
        )}
        {!disabled && <Text style={[styles.chevron, { color: theme.colors.textMuted }]}>›</Text>}
      </View>
    </TouchableOpacity>
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
// ONBOARDING CARD
// =============================================================================

interface OnboardingCardProps {
  onRequestAuth: () => void;
  loading: boolean;
}

function OnboardingCard({ onRequestAuth, loading }: OnboardingCardProps): React.JSX.Element {
  const theme = useTheme();

  return (
    <View style={styles.section}>
      <View style={[styles.onboardingCard, { backgroundColor: theme.colors.primary + '10', borderColor: theme.colors.primary + '30' }]}>
        <Text style={[styles.onboardingTitle, { color: theme.colors.text }]}>
          开始使用屏幕时间管理
        </Text>
        <Text style={[styles.onboardingDescription, { color: theme.colors.textSecondary }]}>
          授权后，VibeFlow 可以在专注时段自动阻断分心应用，帮助你保持专注。
        </Text>
        <TouchableOpacity
          style={[styles.onboardingButton, { backgroundColor: theme.colors.primary }]}
          onPress={onRequestAuth}
          disabled={loading}
          activeOpacity={0.7}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.onboardingButtonText}>授权屏幕使用时间</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// =============================================================================
// HELPERS
// =============================================================================

function formatSelectionSummary(summary: SelectionSummary | null): string {
  if (!summary || !summary.hasSelection) return '未配置';
  const parts: string[] = [];
  if (summary.appCount > 0) parts.push(`${summary.appCount} 个应用`);
  if (summary.categoryCount > 0) parts.push(`${summary.categoryCount} 个品类`);
  return parts.length > 0 ? parts.join(', ') : '未配置';
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
  const setSelectionSummary = useAppStore((state) => state.setSelectionSummary);
  const [authStatus, setAuthStatus] = useState<AuthorizationStatus>('notDetermined');
  const [authLoading, setAuthLoading] = useState(false);
  const [workSummary, setWorkSummary] = useState<SelectionSummary | null>(null);
  const [pickerLoading, setPickerLoading] = useState<'distraction' | 'work' | null>(null);

  // Load authorization status and work summary on mount
  useEffect(() => {
    const loadInitialData = async (): Promise<void> => {
      const status = await blockingService.getAuthorizationStatus();
      setAuthStatus(status);

      if (status === 'authorized') {
        const work = await screenTimeService.getSelectionSummary('work');
        setWorkSummary(work);
      }
    };
    loadInitialData();
  }, []);

  const handleRequestAuthorization = useCallback(async () => {
    setAuthLoading(true);
    try {
      const status = await blockingService.requestAuthorization();
      setAuthStatus(status);
      if (status === 'denied') {
        Alert.alert(
          '授权被拒绝',
          '请在系统设置 > 屏幕使用时间中手动授权本应用。',
        );
      } else if (status === 'authorized') {
        // Load summaries after authorization
        const [distraction, work] = await Promise.all([
          screenTimeService.getSelectionSummary('distraction'),
          screenTimeService.getSelectionSummary('work'),
        ]);
        setSelectionSummary(distraction);
        setWorkSummary(work);
      }
    } catch {
      Alert.alert('授权失败', '请稍后重试或在系统设置中授权。');
    } finally {
      setAuthLoading(false);
    }
  }, [setSelectionSummary]);

  const handleSelectDistractionApps = useCallback(async () => {
    setPickerLoading('distraction');
    try {
      // presentActivityPicker is on the native module, call through the module
      const { presentActivityPicker } = await import('../../modules/screen-time');
      const result = await presentActivityPicker('distraction');
      setSelectionSummary(result);
    } catch {
      // User may have cancelled the picker — just reload current state
      try {
        const current = await screenTimeService.getSelectionSummary('distraction');
        setSelectionSummary(current);
      } catch {
        // Ignore secondary error
      }
    } finally {
      setPickerLoading(null);
    }
  }, [setSelectionSummary]);

  const handleSelectWorkApps = useCallback(async () => {
    setPickerLoading('work');
    try {
      const { presentActivityPicker } = await import('../../modules/screen-time');
      const result = await presentActivityPicker('work');
      setWorkSummary(result);
    } catch {
      // User may have cancelled — reload current state
      try {
        const current = await screenTimeService.getSelectionSummary('work');
        setWorkSummary(current);
      } catch {
        // Ignore secondary error
      }
    } finally {
      setPickerLoading(null);
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

  const isAuthorized = authStatus === 'authorized';
  const appSelectionDisabled = !isAuthorized || isBlockingActive;
  const appSelectionHint = isBlockingActive ? '阻断期间不可修改' : !isAuthorized ? '请先授权' : undefined;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView style={styles.scrollView}>
        {/* Onboarding Card — shown only when authorization is not determined */}
        {authStatus === 'notDetermined' && (
          <OnboardingCard onRequestAuth={handleRequestAuthorization} loading={authLoading} />
        )}

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
          {authStatus !== 'authorized' && authStatus !== 'notDetermined' && (
            <TouchableOpacity
              style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }]}
              onPress={handleRequestAuthorization}
              disabled={authLoading}
            >
              <Text style={[styles.rowLabel, { color: theme.colors.primary }]}>请求屏幕时间授权</Text>
              {authLoading && <ActivityIndicator size="small" color={theme.colors.primary} />}
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

        {/* App Selection Section */}
        <Section title="应用选择">
          <TappableRow
            label="分心应用"
            value={formatSelectionSummary(selectionSummary)}
            onPress={handleSelectDistractionApps}
            disabled={appSelectionDisabled}
            disabledHint={appSelectionHint}
            loading={pickerLoading === 'distraction'}
          />
          <TappableRow
            label="工作应用（始终允许）"
            value={formatSelectionSummary(workSummary)}
            onPress={handleSelectWorkApps}
            disabled={appSelectionDisabled}
            disabledHint={appSelectionHint}
            isLast
            loading={pickerLoading === 'work'}
          />
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

        {/* App Info Section */}
        <Section title="应用信息">
          <Row label="版本" value={APP_VERSION} />
          <Row label="连接状态" value={connectionStatusText[connectionStatus]} isLast />
        </Section>

        {/* Bottom spacing */}
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
  tappableRowLeft: {
    flex: 1,
    marginRight: 8,
  },
  tappableRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  disabledHint: {
    fontSize: 12,
    marginTop: 2,
  },
  chevron: {
    fontSize: 20,
    fontWeight: '300',
    marginLeft: 6,
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
  // Onboarding card
  onboardingCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
  },
  onboardingTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  onboardingDescription: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 16,
  },
  onboardingButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 200,
    alignItems: 'center',
  },
  onboardingButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default SettingsScreen;
