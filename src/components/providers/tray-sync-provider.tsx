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

  // Debug: log electron API availability
  useEffect(() => {
    console.log('[TraySyncProvider] Electron API check:', {
      hasVibeflow: typeof window !== 'undefined' && 'vibeflow' in window,
      isElectron: (window as any).vibeflow?.platform?.isElectron,
      hasTrayAPI: !!(window as any).vibeflow?.tray?.updateMenu,
    });
  }, []);

  // Sync pomodoro state to tray
  useEffect(() => {
    console.log('[TraySyncProvider] currentPomodoro:', currentPomodoro ? {
      id: currentPomodoro.id,
      taskTitle: currentPomodoro.task?.title,
      duration: currentPomodoro.duration,
    } : null);

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

  // Sync system state and progress to tray (only when no active pomodoro)
  useEffect(() => {
    // Skip if there's an active pomodoro - pomodoro state takes priority
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
