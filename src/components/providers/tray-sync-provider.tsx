'use client';

import { useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { useSocket } from '@/hooks/use-socket';
import { trayIntegrationService } from '@/services/tray-integration.service';

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
    refetchInterval: 1000,
  });

  // tRPC as fallback for initial load
  const { data: dailyState } = trpc.dailyState.getToday.useQuery(undefined, {
    refetchInterval: 5000, // Reduced frequency since we have WebSocket
  });
  const { data: dailyProgress } = trpc.dailyState.getDailyProgress.useQuery();
  const { data: isInSleepTime } = trpc.sleepTime.isInSleepTime.useQuery(undefined, {
    refetchInterval: 60000,
  });
  const { data: overRestStatus } = trpc.overRest.checkStatus.useQuery(undefined, {
    refetchInterval: 1000,
  });

  // Get rest status for tray display (when in rest or over_rest state)
  const currentState = socketState || dailyState?.systemState?.toLowerCase();
  const isInRestState = currentState === 'rest' || currentState === 'over_rest';
  const { data: restStatus } = trpc.dailyState.getRestStatus.useQuery(undefined, {
    refetchInterval: 1000,
    enabled: !currentPomodoro && isInRestState,
  });

  // Single unified effect to sync state to tray
  useEffect(() => {
    // Sleep time takes highest priority
    if (isInSleepTime) {
      trayIntegrationService.updatePomodoroState(null);
      trayIntegrationService.updateSystemState('locked', undefined, undefined, true);
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
    const effectiveState = socketState || dailyState?.systemState?.toLowerCase();

    if (effectiveState) {
      const state = effectiveState as 'locked' | 'planning' | 'focus' | 'rest' | 'over_rest';
      const progress = dailyProgress
        ? `${dailyProgress.completedPomodoros}/${dailyProgress.targetPomodoros}`
        : undefined;

      // Build restData for rest and over_rest states
      let restData: { startTime: Date; duration: number; isOverRest: boolean } | undefined;
      if (state === 'rest' && restStatus?.restStartTime) {
        // Normal rest - use rest status from server
        restData = {
          startTime: new Date(restStatus.restStartTime),
          duration: restStatus.restDuration,
          isOverRest: false,
        };
      } else if (state === 'over_rest' && overRestStatus?.isOverRest && overRestStatus?.lastPomodoroEndTime) {
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

  return <>{children}</>;
}
