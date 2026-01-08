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

  const { data: dailyState } = trpc.dailyState.getToday.useQuery();
  const { data: dailyProgress } = trpc.dailyState.getDailyProgress.useQuery();

  // Sync pomodoro state to tray
  useEffect(() => {
    if (currentPomodoro) {
      trayIntegrationService.updatePomodoroState({
        id: currentPomodoro.id,
        taskId: currentPomodoro.taskId,
        duration: currentPomodoro.duration,
        startTime: currentPomodoro.startTime,
        task: currentPomodoro.task,
      });
    } else {
      trayIntegrationService.updatePomodoroState(null);
    }
  }, [currentPomodoro]);

  // Sync system state to tray (only when no active pomodoro)
  useEffect(() => {
    if (currentPomodoro) return;

    if (dailyState?.systemState) {
      const state = dailyState.systemState.toLowerCase() as 'locked' | 'planning' | 'focus' | 'rest' | 'over_rest';
      const progress = dailyProgress
        ? `${dailyProgress.completedPomodoros}/${dailyProgress.targetPomodoros}`
        : undefined;
      trayIntegrationService.updateSystemState(state, undefined, progress);
    }
  }, [dailyState?.systemState, dailyProgress, currentPomodoro]);

  return <>{children}</>;
}
