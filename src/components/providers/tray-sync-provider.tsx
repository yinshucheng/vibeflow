'use client';

import { useEffect, useRef } from 'react';
import { useSocket } from '@/hooks/use-socket';
import { useRealtimeStore, onDataChange } from '@/stores/realtime.store';
import { trpc } from '@/lib/trpc';
import { trayIntegrationService } from '@/services/tray-integration.service';
import { showBrowserNotification } from '@/services/notification.service';

/**
 * Global provider that syncs app state to desktop tray.
 * All real-time state comes from the realtime Zustand store (WebSocket-driven).
 * No refetchInterval polling — sleep time, overRest, and health limit
 * are all derived from the policy state pushed via UPDATE_POLICY.
 *
 * Requirements: 6.7 - Real-time state updates via WebSocket
 * Requirements: 7.1 - Rest period tracking with countdown display
 */
export function TraySyncProvider({ children }: { children: React.ReactNode }) {
  // Ensure WebSocket is connected
  useSocket();

  // Refetch React Query cache when DATA_CHANGE arrives from server
  // Use refetch() instead of invalidate() to immediately update UI
  const utils = trpc.useUtils();
  useEffect(() => {
    return onDataChange((payload) => {
      console.log('[TraySyncProvider] DATA_CHANGE:', payload.entity, payload.action, payload.ids);
      switch (payload.entity) {
        case 'task':
          console.log('[TraySyncProvider] Refetching task queries...');
          // refetch() immediately re-fetches, invalidate() only marks as stale
          utils.task.getTodayTasks.refetch();
          utils.task.getTodayTasksAll.refetch();
          utils.task.getOverdue.refetch();
          utils.task.getBacklog.refetch();
          // For parameterized queries, invalidate with refetchType to trigger immediate refetch
          utils.task.getByProject.invalidate(undefined, { refetchType: 'all' });
          utils.task.getById.invalidate(undefined, { refetchType: 'all' });
          break;
        case 'project':
          // Router-level invalidate, then specific queries refetch
          utils.project.list.refetch();
          break;
        case 'goal':
          utils.goal.list.refetch();
          break;
        case 'settings':
          utils.settings.get.refetch();
          break;
        case 'dailyState':
          utils.dailyState.getToday.refetch();
          break;
        case 'habit':
          utils.habit.list.refetch();
          break;
      }
    });
  }, [utils]);

  // Real-time state from Zustand (driven by SDK state manager, no polling)
  const snapshot = useRealtimeStore((s) => s.snapshot);
  const systemState = useRealtimeStore((s) => s.systemState);
  const lastExecuteAction = useRealtimeStore((s) => s.lastExecuteAction);

  // Track if we've started the main process countdown for the current pomodoro
  const mainProcessCountdownStartedRef = useRef<string | null>(null);

  // Derive policy state values (pushed via UPDATE_POLICY, no polling needed)
  const policy = snapshot.policy;
  const isSleepTimeActive = policy?.state?.isSleepTimeActive ?? false;
  const isOverRest = policy?.state?.isOverRest ?? false;
  const overRestMinutes = policy?.state?.overRestMinutes ?? 0;

  // Derive daily progress from realtime store (pushed via SYNC_STATE)
  const completedPomodoros = snapshot.dailyState?.completedPomodoros ?? 0;
  const targetPomodoros = snapshot.settings?.dailyCap ?? 8;

  // Single unified effect to sync state to tray
  useEffect(() => {
    const activePomodoro = snapshot.activePomodoro;

    // Active pomodoro takes highest priority — user is working (even during sleep time / overtime)
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

    // Sleep time — only applies when no active pomodoro
    if (isSleepTimeActive) {
      trayIntegrationService.updateSystemState('idle', undefined, undefined, true);
      return;
    }

    const state = systemState;
    if (state) {
      const progress = `${completedPomodoros}/${targetPomodoros}`;

      let restData: { startTime: Date; duration: number; isOverRest: boolean } | undefined;
      if (state === 'over_rest' && isOverRest) {
        // Compute rest start time from overRestMinutes (pushed via UPDATE_POLICY)
        const restStartTime = new Date(Date.now() - overRestMinutes * 60 * 1000);
        restData = {
          startTime: restStartTime,
          duration: 0,
          isOverRest: true,
        };
      }

      trayIntegrationService.updateSystemState(state, restData, progress);
    }
  }, [snapshot.activePomodoro, systemState, completedPomodoros, targetPomodoros, isSleepTimeActive, isOverRest, overRestMinutes]);

  // Habit reminder notification — listen for EXECUTE_ACTION via realtime store
  const prevExecuteActionRef = useRef(lastExecuteAction);
  useEffect(() => {
    // Skip if it's the same action reference (no new action)
    if (lastExecuteAction === prevExecuteActionRef.current) return;
    prevExecuteActionRef.current = lastExecuteAction;

    if (!lastExecuteAction) return;
    if ((lastExecuteAction.action as string) !== 'HABIT_REMINDER') return;

    const params = lastExecuteAction.parameters as {
      title?: string;
      question?: string;
      streak?: number;
      reminderType?: string;
    };
    const title = (params.title as string) ?? '习惯提醒';
    const body =
      (params.question as string) ??
      (params.streak && (params.streak as number) > 1
        ? `「${title}」已连续 ${params.streak} 天，今天还没打卡！`
        : `该完成「${title}」了`);
    showBrowserNotification('🔄 ' + title, {
      body,
      tag: 'habit-reminder',
    });
  }, [lastExecuteAction]);

  // Health limit notification — derived from policy state (no polling)
  const healthLimit = policy?.state?.healthLimit;
  const healthLimitTypeRef = useRef<string | null>(null);
  const healthLimitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (healthLimit?.type) {
      const type = healthLimit.type;
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

        const intervalMs = healthLimit.intervalMinutes
          ? healthLimit.intervalMinutes * 60 * 1000
          : 10 * 60 * 1000;
        healthLimitTimerRef.current = setInterval(() => {
          showBrowserNotification('⏰ Health Reminder', {
            body: message,
            tag: 'health-limit',
          });
        }, intervalMs);
      }
    } else {
      healthLimitTypeRef.current = null;
      if (healthLimitTimerRef.current) {
        clearInterval(healthLimitTimerRef.current);
        healthLimitTimerRef.current = null;
      }
    }
  }, [healthLimit]);

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
