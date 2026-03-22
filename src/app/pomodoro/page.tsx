'use client';

/**
 * Pomodoro Page
 *
 * Notion-style Pomodoro timer functionality.
 * Uses centralized state machine for reliable state transitions.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 7.3, 7.4, 7.5, 7.6
 * Requirements: 6.7 - Real-time state updates via WebSocket
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MainLayout, PageHeader, Card, CardContent } from '@/components/layout';
import { PomodoroTimer } from '@/components/pomodoro';
import { PomodoroCompletionModal } from '@/components/pomodoro/completion-modal';
import { RestModeUI } from '@/components/pomodoro/rest-mode';
import { DailyCapModal } from '@/components/pomodoro/daily-cap-modal';
import { IdleAlert } from '@/components/pomodoro/idle-alert';
import { Icons } from '@/lib/icons';
import { trpc } from '@/lib/trpc';
import { usePomodoroMachine } from '@/hooks/use-pomodoro-machine';

export default function PomodoroPage() {
  const router = useRouter();

  // Use centralized state machine for all pomodoro state management
  const { phase, pomodoro, completedPomodoro, restStatus, systemState, isLoading, actions } =
    usePomodoroMachine();

  // Get daily state for progress display and cap checking
  const { data: dailyState } = trpc.dailyState.getToday.useQuery();

  // Redirect to airlock if locked
  useEffect(() => {
    if (!isLoading && systemState === 'locked' && !dailyState?.airlockCompleted) {
      router.push('/airlock');
    }
  }, [isLoading, systemState, dailyState?.airlockCompleted, router]);

  // Daily cap modal state (kept local as it's UI-only)
  const showCapModal = phase === 'idle' && dailyState?.progress?.isCapped;

  // Determine page description based on phase
  const getDescription = () => {
    switch (phase) {
      case 'focus':
      case 'completing':
        return 'Deep work in progress';
      case 'break_prompt':
        return 'Session complete!';
      case 'resting':
        return 'Take a break';
      default:
        return 'Ready to focus';
    }
  };

  const LoaderIcon = Icons.loader;
  const SunriseIcon = Icons.airlock;
  const TimerIcon = Icons.pomodoro;

  // Loading state
  if (isLoading || phase === 'loading') {
    return (
      <MainLayout title="Pomodoro">
        <div className="flex items-center justify-center h-64">
          <LoaderIcon className="w-5 h-5 animate-spin text-notion-text-tertiary" />
        </div>
      </MainLayout>
    );
  }

  // Show redirect message if locked
  if (systemState === 'locked' && !dailyState?.airlockCompleted) {
    return (
      <MainLayout title="Pomodoro">
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <SunriseIcon className="w-10 h-10 text-notion-accent-orange" />
          <p className="text-notion-text-secondary">Redirecting to Morning Airlock...</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Pomodoro">
      <PageHeader title="Focus Session" description={getDescription()} />

      <div className="max-w-2xl mx-auto">
        {/* Progress Stats */}
        {dailyState?.progress && (
          <Card className="mb-6">
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-notion-text-secondary">Today&apos;s Progress</div>
                  <div className="flex items-center gap-2 text-2xl font-bold text-notion-text">
                    <TimerIcon className="w-5 h-5 text-notion-text-tertiary" />
                    {dailyState.progress.pomodoroCount} / {dailyState.progress.dailyCap}
                  </div>
                </div>
                <div className="w-32">
                  <div className="h-2 bg-notion-bg-tertiary rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        dailyState.progress.isCapped
                          ? 'bg-notion-accent-orange'
                          : 'bg-notion-accent-green'
                      }`}
                      style={{ width: `${dailyState.progress.percentage}%` }}
                    />
                  </div>
                  <div className="text-xs text-notion-text-tertiary mt-1 text-right">
                    {dailyState.progress.percentage}%
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content based on phase */}
        <Card>
          <CardContent>
            {phase === 'resting' ? (
              <RestModeUI
                onStartPomodoro={() => {
                  const taskId = completedPomodoro?.taskId ?? pomodoro?.taskId ?? restStatus?.lastTaskId;
                  if (taskId) {
                    actions.startNextPomodoro(taskId);
                  } else {
                    actions.startTasklessPomodoro();
                  }
                }}
                nextTaskId={completedPomodoro?.taskId ?? pomodoro?.taskId ?? restStatus?.lastTaskId}
                nextTaskTitle={completedPomodoro?.task?.title ?? pomodoro?.task?.title ?? restStatus?.lastTaskTitle}
              />
            ) : (
              <PomodoroTimer onComplete={actions.triggerComplete} onAbort={actions.abortPomodoro} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Completion Modal - shown in break_prompt phase */}
      {phase === 'break_prompt' && completedPomodoro && (
        <PomodoroCompletionModal
          pomodoroId={completedPomodoro.id}
          taskTitle={completedPomodoro.task?.title ?? 'Unknown Task'}
          onConfirm={actions.confirmBreak}
          onStartBreak={actions.confirmBreak}
          alreadyCompleted={true}
        />
      )}

      {/* Daily Cap Modal */}
      {showCapModal && (
        <DailyCapModal
          onClose={() => {
            // Cap modal is informational, just dismiss
          }}
          onOverride={() => {
            // Override handled by daily state
          }}
        />
      )}

      {/* Idle Alert - shows when user is idle during work hours */}
      <IdleAlert
        enabled={phase === 'idle' && !pomodoro}
        onStartPomodoro={() => {
          // Focus on the timer when starting from idle alert
        }}
      />
    </MainLayout>
  );
}
