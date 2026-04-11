'use client';

import { useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { useSocket } from '@/hooks/use-socket';
import { trayIntegrationService } from '@/services/tray-integration.service';
import { normalizeState } from '@/lib/state-utils';
import { showBrowserNotification } from '@/services/notification.service';

/**
 * Global provider that syncs app state to desktop tray
 * Must be rendered within TRPCProvider
 * Requirements: 6.7 - Real-time state updates via WebSocket
 * Requirements: 7.1 - Rest period tracking with countdown display
 */
export function TraySyncProvider({ children }: { children: React.ReactNode }) {
  // Use WebSocket for real-time state updates
  const { systemState: socketState } = useSocket();

  // Track if we've started the main process countdown for the current pomodoro
  const mainProcessCountdownStartedRef = useRef<string | null>(null);

  const { data: currentPomodoro } = trpc.pomodoro.getCurrent.useQuery(undefined, {
    refetchInterval: 10000, // WebSocket handles real-time updates, polling is fallback
  });

  // tRPC as fallback for initial load
  const { data: dailyState } = trpc.dailyState.getToday.useQuery(undefined, {
    refetchInterval: 5000, // Reduced frequency since we have WebSocket
  });
  const { data: dailyProgress } = trpc.dailyState.getDailyProgress.useQuery();
  const { data: isInSleepTime } = trpc.sleepTime.isInSleepTime.useQuery(undefined, {
    refetchInterval: 60000,
  });

  // Get rest status for tray display (when in over_rest state)
  const currentState = socketState || dailyState?.systemState?.toLowerCase();
  const isInRestState = currentState === 'over_rest';

  const { data: overRestStatus } = trpc.overRest.checkStatus.useQuery(undefined, {
    refetchInterval: isInRestState ? 5000 : 30000, // Higher frequency only when in over_rest
  });
  const { data: restStatus } = trpc.dailyState.getRestStatus.useQuery(undefined, {
    refetchInterval: 5000,
    enabled: !currentPomodoro && isInRestState,
  });

  // Single unified effect to sync state to tray
  useEffect(() => {
    // Sleep time takes highest priority
    if (isInSleepTime) {
      trayIntegrationService.updatePomodoroState(null);
      trayIntegrationService.updateSystemState('idle', undefined, undefined, true);
      // Stop main process countdown if any
      if (mainProcessCountdownStartedRef.current && window.vibeflow?.pomodoro?.stopCountdown) {
        window.vibeflow.pomodoro.stopCountdown();
        mainProcessCountdownStartedRef.current = null;
      }
      return;
    }

    // Active pomodoro takes priority
    if (currentPomodoro) {
      // Update tray state via renderer
      trayIntegrationService.updatePomodoroState({
        id: currentPomodoro.id,
        taskId: currentPomodoro.taskId,
        duration: currentPomodoro.duration,
        startTime: currentPomodoro.startTime,
        task: currentPomodoro.task,
      });

      // Start main process countdown if not already started for this pomodoro
      // This ensures tray updates continue when app is in background
      if (mainProcessCountdownStartedRef.current !== currentPomodoro.id && window.vibeflow?.pomodoro?.startCountdown) {
        const startTime = new Date(currentPomodoro.startTime).getTime();
        const durationMs = currentPomodoro.duration * 60 * 1000;
        window.vibeflow.pomodoro.startCountdown({
          startTime,
          durationMs,
          taskTitle: currentPomodoro.task?.title,
        });
        mainProcessCountdownStartedRef.current = currentPomodoro.id;
      }
      return;
    }

    // No active pomodoro - show system state
    trayIntegrationService.updatePomodoroState(null);

    // Stop main process countdown if it was running
    if (mainProcessCountdownStartedRef.current && window.vibeflow?.pomodoro?.stopCountdown) {
      window.vibeflow.pomodoro.stopCountdown();
      mainProcessCountdownStartedRef.current = null;
    }

    // Prefer WebSocket state (real-time) over tRPC state (polled)
    const rawState = socketState || dailyState?.systemState?.toLowerCase();

    if (rawState) {
      const state = normalizeState(rawState);
      const progress = dailyProgress
        ? `${dailyProgress.completedPomodoros}/${dailyProgress.targetPomodoros}`
        : undefined;

      // Build restData for over_rest state (REST no longer exists as separate state)
      let restData: { startTime: Date; duration: number; isOverRest: boolean } | undefined;
      if (state === 'over_rest' && overRestStatus?.isOverRest && overRestStatus?.lastPomodoroEndTime) {
        // Over rest
        restData = {
          startTime: new Date(overRestStatus.lastPomodoroEndTime),
          duration: 0,
          isOverRest: true,
        };
      }

      trayIntegrationService.updateSystemState(state, restData, progress);
    }
  }, [currentPomodoro, socketState, dailyState?.systemState, dailyProgress, isInSleepTime, overRestStatus, restStatus]);

  // Health limit notification — poll health limit status and show browser notifications
  const { data: healthLimitData } = trpc.healthLimit.checkLimit.useQuery(undefined, {
    refetchInterval: 60000, // Check every minute
  });

  const healthLimitTypeRef = useRef<string | null>(null);
  const healthLimitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (healthLimitData?.exceeded && healthLimitData.type) {
      const type = healthLimitData.type;
      const message = type === '2hours'
        ? "You've been working for 2+ hours continuously. Consider a longer break."
        : "You've worked over 10 hours today. Please take care of yourself.";

      // Show notification on first trigger or type change
      if (type !== healthLimitTypeRef.current) {
        showBrowserNotification('⏰ Health Reminder', {
          body: message,
          tag: 'health-limit',
        });
        healthLimitTypeRef.current = type;

        // Set up repeating notifications (every 10 minutes)
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
    // NOTE: No cleanup here — timer is managed by refs and cleared in the else branch
    // or by the unmount-only effect below. Returning cleanup would kill the repeating
    // timer every time healthLimitData re-fetches (every 60s).
  }, [healthLimitData]);

  // Cleanup repeating timer only on component unmount
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
