/**
 * PomodoroStatus Component
 *
 * Display of current pomodoro status with start control.
 * Shows countdown timer, task title, and daily progress.
 *
 * Requirements: 4.2, 4.3, 4.4, 4.5, 4.7
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useAppStore } from '@/store/app.store';
import { actionService } from '@/services/action.service';
import {
  calculateRemainingTime,
  calculateProgress,
  formatRemainingTime,
  formatPomodoroCount,
  formatFocusMinutes,
} from '@/utils/pomodoro-calculator';

// =============================================================================
// COMPONENT
// =============================================================================

export function PomodoroStatus(): React.JSX.Element {
  const activePomodoro = useAppStore((state) => state.activePomodoro);
  const dailyState = useAppStore((state) => state.dailyState);
  const optimisticStartPomodoro = useAppStore((s) => s.optimisticStartPomodoro);
  const confirmOptimisticUpdate = useAppStore((s) => s.confirmOptimisticUpdate);
  const rollbackOptimisticUpdate = useAppStore((s) => s.rollbackOptimisticUpdate);

  // Local state for countdown (updates every second)
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isStarting, setIsStarting] = useState(false);

  // Update countdown every second when pomodoro is active
  useEffect(() => {
    if (!activePomodoro) {
      setRemainingSeconds(0);
      setProgress(0);
      return;
    }

    // Initial calculation
    setRemainingSeconds(calculateRemainingTime(activePomodoro));
    setProgress(calculateProgress(activePomodoro));

    // Update every second
    const interval = setInterval(() => {
      const remaining = calculateRemainingTime(activePomodoro);
      setRemainingSeconds(remaining);
      setProgress(calculateProgress(activePomodoro));
    }, 1000);

    return () => clearInterval(interval);
  }, [activePomodoro]);

  const handleStartPomodoro = async () => {
    if (isStarting || activePomodoro) return;

    setIsStarting(true);

    // Apply optimistic update
    const optimisticId = optimisticStartPomodoro();

    // Send to server
    const result = await actionService.startPomodoro();

    if (result.success) {
      confirmOptimisticUpdate(optimisticId);
    } else {
      rollbackOptimisticUpdate(optimisticId);
      Alert.alert('启动失败', result.error?.message || '无法启动番茄钟');
    }

    setIsStarting(false);
  };

  return (
    <View style={styles.container}>
      {/* Timer Display */}
      <View style={styles.timerContainer}>
        {activePomodoro ? (
          <>
            <TimerCircle progress={progress} />
            <Text style={styles.timerText}>
              {formatRemainingTime(remainingSeconds)}
            </Text>
            <Text style={styles.taskTitle} numberOfLines={2}>
              {activePomodoro.taskTitle || '未关联任务'}
            </Text>
            {!activePomodoro.taskId && (
              <Text style={styles.switchHint}>长按任务可切换</Text>
            )}
            {activePomodoro.status === 'paused' && (
              <Text style={styles.pausedLabel}>已暂停</Text>
            )}
          </>
        ) : (
          <View style={styles.noPomodoro}>
            <TouchableOpacity
              style={styles.startButton}
              onPress={handleStartPomodoro}
              disabled={isStarting}
              activeOpacity={0.7}
            >
              <Text style={styles.startButtonText}>
                {isStarting ? '启动中...' : '开始番茄钟'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Daily Stats */}
      {dailyState && (
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {formatPomodoroCount(
                dailyState.completedPomodoros,
                dailyState.dailyCap
              )}
            </Text>
            <Text style={styles.statLabel}>今日番茄</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {formatFocusMinutes(dailyState.totalFocusMinutes)}
            </Text>
            <Text style={styles.statLabel}>专注时长</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

interface TimerCircleProps {
  progress: number;
}

function TimerCircle({ progress }: TimerCircleProps): React.JSX.Element {
  // Simple progress indicator using a border
  // In a real app, you'd use react-native-svg for a proper circular progress
  const circumference = 2 * Math.PI * 80; // radius = 80
  const strokeDashoffset = circumference * (1 - progress / 100);

  return (
    <View style={styles.circleContainer}>
      {/* Background circle */}
      <View style={styles.circleBackground} />
      {/* Progress indicator (simplified - just shows percentage) */}
      <View style={[styles.progressIndicator, { opacity: progress / 100 }]} />
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 20,
  },
  timerContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  circleContainer: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  circleBackground: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 8,
    borderColor: '#E5E7EB',
  },
  progressIndicator: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 8,
    borderColor: '#EF4444',
  },
  timerText: {
    fontSize: 48,
    fontWeight: '700',
    color: '#1F2937',
    fontVariant: ['tabular-nums'],
  },
  taskTitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
  },
  switchHint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  pausedLabel: {
    fontSize: 14,
    color: '#F59E0B',
    fontWeight: '600',
    marginTop: 8,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  noPomodoro: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 100,
  },
  startButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 25,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  noPomodoroText: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    width: '100%',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 16,
  },
});

export default PomodoroStatus;
