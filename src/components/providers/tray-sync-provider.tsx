'use client';

import { useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { trayIntegrationService } from '@/services/tray-integration.service';

/**
 * Global provider that syncs app state to desktop tray
 * Must be rendered within TRPCProvider
 */
export function TraySyncProvider({ children }: { children: React.ReactNode }) {
  const { data: currentPomodoro } = trpc.pomodoro.getCurrent.useQuery(undefined, {
    refetchInterval: 1000,
  });

  const { data: dailyState } = trpc.dailyState.getToday.useQuery(undefined, {
    refetchInterval: 1000,
  });
  const { data: dailyProgress } = trpc.dailyState.getDailyProgress.useQuery();
  const { data: isInSleepTime } = trpc.sleepTime.isInSleepTime.useQuery(undefined, {
    refetchInterval: 60000,
  });
  const { data: overRestStatus } = trpc.overRest.checkStatus.useQuery(undefined, {
    refetchInterval: 1000,
  });

  // Single unified effect to sync state to tray
  useEffect(() => {
    // Sleep time takes highest priority
    if (isInSleepTime) {
      trayIntegrationService.updatePomodoroState(null);
      trayIntegrationService.updateSystemState('locked', undefined, undefined, true);
      return;
    }

    // Active pomodoro takes priority
    if (currentPomodoro) {
      trayIntegrationService.updatePomodoroState({
        id: currentPomodoro.id,
        taskId: currentPomodoro.taskId,
        duration: currentPomodoro.duration,
        startTime: currentPomodoro.startTime,
        task: currentPomodoro.task,
      });
      return;
    }

    // No active pomodoro - show system state
    trayIntegrationService.updatePomodoroState(null);

    if (dailyState?.systemState) {
      const state = dailyState.systemState.toLowerCase() as 'locked' | 'planning' | 'focus' | 'rest' | 'over_rest';
      const progress = dailyProgress
        ? `${dailyProgress.completedPomodoros}/${dailyProgress.targetPomodoros}`
        : undefined;

      // Build restData for over_rest state
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
  }, [currentPomodoro, dailyState?.systemState, dailyProgress, isInSleepTime, overRestStatus]);

  return <>{children}</>;
}
