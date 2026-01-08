'use client';

import { useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { trayIntegrationService } from '@/services/tray-integration.service';

/**
 * Global provider that syncs app state to desktop tray
 * Must be rendered within TRPCProvider
 */
export function TraySyncProvider({ children }: { children: React.ReactNode }) {
  // Get current pomodoro state
  const { data: currentPomodoro } = trpc.pomodoro.getCurrent.useQuery(undefined, {
    refetchInterval: 1000, // Refresh every second for countdown
  });

  // Get daily state for system state
  const { data: dailyState } = trpc.dailyState.getToday.useQuery();

  // Get daily progress for tray display
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

  // Sync system state and progress to tray
  useEffect(() => {
    if (dailyState?.systemState) {
      const state = dailyState.systemState.toLowerCase() as 'locked' | 'planning' | 'focus' | 'rest' | 'over_rest';
      const progress = dailyProgress
        ? `${dailyProgress.completedPomodoros}/${dailyProgress.dailyGoal}`
        : undefined;
      trayIntegrationService.updateSystemState(state, undefined, progress);
    }
  }, [dailyState?.systemState, dailyProgress]);

  return <>{children}</>;
}
