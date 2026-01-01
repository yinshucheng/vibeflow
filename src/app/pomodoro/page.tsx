'use client';

/**
 * Pomodoro Page
 * 
 * Main page for the Pomodoro timer functionality.
 * Supports auto-start transitions between pomodoros and breaks.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 7.3, 7.4, 7.5, 7.6
 */

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { MainLayout, PageHeader, Card, CardContent } from '@/components/layout';
import { PomodoroTimer } from '@/components/pomodoro';
import { PomodoroCompletionModal } from '@/components/pomodoro/completion-modal';
import { RestModeUI } from '@/components/pomodoro/rest-mode';
import { DailyCapModal } from '@/components/pomodoro/daily-cap-modal';
import { IdleAlert } from '@/components/pomodoro/idle-alert';
import { trpc } from '@/lib/trpc';
import type { SystemState } from '@/machines/vibeflow.machine';

export default function PomodoroPage() {
  const router = useRouter();
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showCapModal, setShowCapModal] = useState(false);
  // Track the last completed pomodoro's task for auto-start next pomodoro
  const [lastTaskId, setLastTaskId] = useState<string | null>(null);
  const [lastTaskTitle, setLastTaskTitle] = useState<string | null>(null);

  const utils = trpc.useUtils();
  
  // Get daily state
  const { data: dailyState, isLoading: stateLoading } = trpc.dailyState.getToday.useQuery();
  
  // Get current pomodoro
  const { data: currentPomodoro } = trpc.pomodoro.getCurrent.useQuery();

  // Update state mutation for transitioning to rest
  const updateStateMutation = trpc.dailyState.updateSystemState.useMutation({
    onSuccess: () => {
      utils.dailyState.getToday.invalidate();
    },
  });

  const systemState = dailyState?.systemState?.toLowerCase() as SystemState | undefined;
  const isLocked = systemState === 'locked';
  const isRest = systemState === 'rest';
  const isFocus = systemState === 'focus';

  // Track the current pomodoro's task for auto-start (Requirements 7.2, 7.4)
  useEffect(() => {
    if (currentPomodoro?.taskId && currentPomodoro?.task?.title) {
      setLastTaskId(currentPomodoro.taskId);
      setLastTaskTitle(currentPomodoro.task.title);
    }
  }, [currentPomodoro?.taskId, currentPomodoro?.task?.title]);

  // Redirect to airlock if locked
  useEffect(() => {
    if (!stateLoading && isLocked && !dailyState?.airlockCompleted) {
      router.push('/airlock');
    }
  }, [stateLoading, isLocked, dailyState?.airlockCompleted, router]);

  // Handle pomodoro completion
  const handlePomodoroComplete = () => {
    setShowCompletionModal(true);
  };

  // Handle starting break mode (Requirements 7.1, 7.5)
  const handleStartBreak = async () => {
    try {
      await updateStateMutation.mutateAsync('rest');
    } catch (error) {
      console.error('Failed to start break:', error);
    }
  };

  // Handle completion confirmed
  const handleCompletionConfirmed = () => {
    setShowCompletionModal(false);
    utils.pomodoro.getCurrent.invalidate();
    utils.dailyState.getToday.invalidate();
    
    // Check if daily cap reached
    if (dailyState?.progress?.isCapped) {
      setShowCapModal(true);
    }
  };

  // Handle rest complete
  const handleRestComplete = () => {
    utils.dailyState.getToday.invalidate();
    utils.pomodoro.getCurrent.invalidate();
  };

  // Handle cap override
  const handleCapOverride = () => {
    setShowCapModal(false);
    utils.dailyState.getToday.invalidate();
  };

  if (stateLoading) {
    return (
      <MainLayout title="Pomodoro">
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse text-gray-500">Loading...</div>
        </div>
      </MainLayout>
    );
  }

  // Show redirect message if locked
  if (isLocked && !dailyState?.airlockCompleted) {
    return (
      <MainLayout title="Pomodoro">
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <span className="text-4xl">🌅</span>
          <p className="text-gray-600">Redirecting to Morning Airlock...</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Pomodoro">
      <PageHeader 
        title="Focus Session" 
        description={isFocus ? "Deep work in progress" : isRest ? "Take a break" : "Ready to focus"}
      />

      <div className="max-w-2xl mx-auto">
        {/* Progress Stats */}
        {dailyState?.progress && (
          <Card className="mb-6">
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-500">Today&apos;s Progress</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {dailyState.progress.pomodoroCount} / {dailyState.progress.dailyCap}
                  </div>
                </div>
                <div className="w-32">
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-300 ${
                        dailyState.progress.isCapped ? 'bg-amber-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${dailyState.progress.percentage}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-500 mt-1 text-right">
                    {dailyState.progress.percentage}%
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content based on state */}
        <Card>
          <CardContent>
            {isRest ? (
              <RestModeUI 
                onRestComplete={handleRestComplete}
                nextTaskId={lastTaskId ?? undefined}
                nextTaskTitle={lastTaskTitle ?? undefined}
              />
            ) : (
              <PomodoroTimer 
                onComplete={handlePomodoroComplete}
                onAbort={() => utils.dailyState.getToday.invalidate()}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Completion Modal */}
      {showCompletionModal && currentPomodoro && (
        <PomodoroCompletionModal
          pomodoroId={currentPomodoro.id}
          taskTitle={currentPomodoro.task?.title ?? 'Unknown Task'}
          onConfirm={handleCompletionConfirmed}
          onStartBreak={handleStartBreak}
        />
      )}

      {/* Daily Cap Modal */}
      {showCapModal && (
        <DailyCapModal
          onClose={() => setShowCapModal(false)}
          onOverride={handleCapOverride}
        />
      )}

      {/* Idle Alert - shows when user is idle during work hours */}
      <IdleAlert 
        enabled={!isRest && !currentPomodoro}
        onStartPomodoro={() => {
          // Focus on the timer when starting from idle alert
          utils.pomodoro.getCurrent.invalidate();
        }}
      />
    </MainLayout>
  );
}
