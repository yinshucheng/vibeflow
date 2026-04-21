'use client';

import { useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { useSocket } from '@/hooks/use-socket';
import { useRealtimeStore } from '@/stores/realtime.store';
import { trayIntegrationService } from '@/services/tray-integration.service';
import { normalizeState } from '@/lib/state-utils';
import { showBrowserNotification } from '@/services/notification.service';
import { onExecuteCommand } from '@/lib/socket-client';

/**
 * Global provider that syncs app state to desktop tray.
 * Real-time state comes from the realtime Zustand store (WebSocket-driven).
 * React Query is only used for non-realtime data (healthLimit, sleepTime).
 *
 * Requirements: 6.7 - Real-time state updates via WebSocket
 * Requirements: 7.1 - Rest period tracking with countdown display
 */
export function TraySyncProvider({ children }: { children: React.ReactNode }) {
  // Ensure WebSocket is connected
  useSocket();

  // Real-time state from Zustand (driven by SDK state manager, no polling)
  const snapshot = useRealtimeStore((s) => s.snapshot);
  const systemState = useRealtimeStore((s) => s.systemState);

  // Track if we've started the main process countdown for the current pomodoro
  const mainProcessCountdownStartedRef = useRef<string | null>(null);

  // Non-realtime queries that need polling (not pushed via WebSocket)
  const { data: isInSleepTime } = trpc.sleepTime.isInSleepTime.useQuery(undefined, {
    refetchInterval: 60000,
  });

  const { data: overRestStatus } = trpc.overRest.checkStatus.useQuery(undefined, {
    refetchInterval: systemState === 'over_rest' ? 5000 : 30000,
  });

  const { data: dailyProgress } = trpc.dailyState.getDailyProgress.useQuery();

  // Single unified effect to sync state to tray
  useEffect(() => {
    // Sleep time takes highest priority
    if (isInSleepTime) {
      trayIntegrationService.updatePomodoroState(null);
      trayIntegrationService.updateSystemState('idle', undefined, undefined, true);
      if (mainProcessCountdownStartedRef.current && window.vibeflow?.pomodoro?.stopCountdown) {
        window.vibeflow.pomodoro.stopCountdown();
        mainProcessCountdownStartedRef.current = null;
      }
      return;
    }

    const activePomodoro = snapshot.activePomodoro;

    // Active pomodoro takes priority
    if (activePomodoro) {
      const pomodoroStartTime = typeof activePomodoro.startTime === 'number'
        ? new Date(activePomodoro.startTime)
        : new Date(activePomodoro.startTime);
      trayIntegrationService.updatePomodoroState({
        id: activePomodoro.id,
        taskId: activePomodoro.taskId,
        duration: activePomodoro.duration,
        startTime: pomodoroStartTime,
        task: activePomodoro.taskTitle ? { title: activePomodoro.taskTitle } : undefined,
      });

      if (mainProcessCountdownStartedRef.current !== activePomodoro.id && window.vibeflow?.pomodoro?.startCountdown) {
        const startTime = pomodoroStartTime.getTime();
        const durationMs = activePomodoro.duration * 60 * 1000;
        window.vibeflow.pomodoro.startCountdown({
          startTime,
          durationMs,
          taskTitle: activePomodoro.taskTitle ?? undefined,
        });
        mainProcessCountdownStartedRef.current = activePomodoro.id;
      }
      return;
    }

    // No active pomodoro — show system state
    trayIntegrationService.updatePomodoroState(null);
    if (mainProcessCountdownStartedRef.current && window.vibeflow?.pomodoro?.stopCountdown) {
      window.vibeflow.pomodoro.stopCountdown();
      mainProcessCountdownStartedRef.current = null;
    }

    const state = systemState;
    if (state) {
      const progress = dailyProgress
        ? `${dailyProgress.completedPomodoros}/${dailyProgress.targetPomodoros}`
        : undefined;

      let restData: { startTime: Date; duration: number; isOverRest: boolean } | undefined;
      if (state === 'over_rest' && overRestStatus?.isOverRest && overRestStatus?.lastPomodoroEndTime) {
        restData = {
          startTime: new Date(overRestStatus.lastPomodoroEndTime),
          duration: 0,
          isOverRest: true,
        };
      }

      trayIntegrationService.updateSystemState(state, restData, progress);
    }
  }, [snapshot.activePomodoro, systemState, dailyProgress, isInSleepTime, overRestStatus]);

  // Habit reminder notification — listen for HABIT_REMINDER execute command
  useEffect(() => {
    const unsub = onExecuteCommand((command) => {
      if (command.action !== 'HABIT_REMINDER') return;
      const params = command.params as {
        title?: string;
        question?: string;
        streak?: number;
        reminderType?: string;
      };
      const title = params.title ?? '习惯提醒';
      const body =
        params.question ??
        (params.streak && params.streak > 1
          ? `「${title}」已连续 ${params.streak} 天，今天还没打卡！`
          : `该完成「${title}」了`);
      showBrowserNotification('🔄 ' + title, {
        body,
        tag: 'habit-reminder',
      });
    });
    return unsub;
  }, []);

  // Health limit notification — still polled (not pushed via WebSocket)
  const { data: healthLimitData } = trpc.healthLimit.checkLimit.useQuery(undefined, {
    refetchInterval: 60000,
  });

  const healthLimitTypeRef = useRef<string | null>(null);
  const healthLimitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (healthLimitData?.exceeded && healthLimitData.type) {
      const type = healthLimitData.type;
      const message = type === '2hours'
        ? "You've been working for 2+ hours continuously. Consider a longer break."
        : "You've worked over 10 hours today. Please take care of yourself.";

      if (type !== healthLimitTypeRef.current) {
        showBrowserNotification('⏰ Health Reminder', {
          body: message,
          tag: 'health-limit',
        });
        healthLimitTypeRef.current = type;

        if (healthLimitTimerRef.current) {
          clearInterval(healthLimitTimerRef.current);
        }
        healthLimitTimerRef.current = setInterval(() => {
          showBrowserNotification('⏰ Health Reminder', {
            body: message,
            tag: 'health-limit',
          });
        }, 10 * 60 * 1000);
      }
    } else {
      healthLimitTypeRef.current = null;
      if (healthLimitTimerRef.current) {
        clearInterval(healthLimitTimerRef.current);
        healthLimitTimerRef.current = null;
      }
    }
  }, [healthLimitData]);

  useEffect(() => {
    return () => {
      if (healthLimitTimerRef.current) {
        clearInterval(healthLimitTimerRef.current);
        healthLimitTimerRef.current = null;
      }
    };
  }, []);

  return <>{children}</>;
}
