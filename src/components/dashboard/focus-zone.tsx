'use client';

/**
 * FocusZone Component
 *
 * Compact pomodoro control embedded in the Dashboard.
 * Reuses usePomodoroMachine for state management, with a new streamlined UI.
 *
 * Phases:
 * - idle: Task selector + Start button + pomodoro progress dots
 * - focus: Current task name + compact timer (MM:SS + progress bar) + abort button
 * - completing: Loading state
 * - break_prompt: Triggers PomodoroCompletionModal (reused)
 * - resting: Rest countdown + end rest button
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/layout';
import { Button } from '@/components/ui';
import { TaskSelector } from '@/components/pomodoro/task-selector';
import { PomodoroCompletionModal } from '@/components/pomodoro/completion-modal';
import { RestModeUI } from '@/components/pomodoro/rest-mode';
import { DailyCapModal } from '@/components/pomodoro/daily-cap-modal';
import { Icons } from '@/lib/icons';
import { trpc } from '@/lib/trpc';
import { usePomodoroMachine } from '@/hooks/use-pomodoro-machine';
import { calculateRemainingSeconds } from '@/lib/pomodoro-cache';

// ---------------------------------------------------------------------------
// PomodoroProgressDots — ●●●○○○○○ 3/8
// ---------------------------------------------------------------------------

function PomodoroProgressDots({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-1" role="img" aria-label={`${completed} of ${total} pomodoros completed`}>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`inline-block w-2 h-2 rounded-full transition-colors ${
              i < completed
                ? 'bg-notion-accent-blue'
                : 'bg-notion-bg-tertiary'
            }`}
          />
        ))}
      </div>
      <span className="text-xs text-notion-text-tertiary ml-1">
        {completed}/{total}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FocusTimer — compact inline timer with progress bar
// ---------------------------------------------------------------------------

function FocusTimer({
  startTime,
  duration,
}: {
  startTime: Date;
  duration: number; // minutes
}) {
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    calculateRemainingSeconds(startTime, duration)
  );

  useEffect(() => {
    // Sync immediately
    setRemainingSeconds(calculateRemainingSeconds(startTime, duration));

    const interval = setInterval(() => {
      const remaining = calculateRemainingSeconds(startTime, duration);
      setRemainingSeconds(Math.max(0, remaining));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime, duration]);

  const totalSeconds = duration * 60;
  const elapsedSeconds = totalSeconds - remainingSeconds;
  const progress = totalSeconds > 0 ? (elapsedSeconds / totalSeconds) * 100 : 0;

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-3xl font-mono text-notion-text tabular-nums">
        {timeStr}
      </span>
      <div className="h-1.5 bg-notion-bg-tertiary rounded-full overflow-hidden w-full">
        <div
          className="h-full bg-notion-accent-blue rounded-full transition-all duration-1000 ease-linear"
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FocusZone — main component
// ---------------------------------------------------------------------------

export function FocusZone() {
  const {
    phase,
    pomodoro,
    completedPomodoro,
    restStatus,
    isLoading,
    actions,
  } = usePomodoroMachine();

  // Task selection for idle state
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Daily state for progress dots and cap checking
  const { data: dailyState } = trpc.dailyState.getToday.useQuery();

  // Tasks for the selector (today + overdue)
  const { data: todayTasks } = trpc.task.getTodayTasks.useQuery();
  const { data: overdueTasks } = trpc.task.getOverdue.useQuery();
  const availableTasks = useMemo(
    () => [...(todayTasks ?? []), ...(overdueTasks ?? [])],
    [todayTasks, overdueTasks],
  );

  // Can start check
  const { data: canStart } = trpc.dailyState.canStartPomodoro.useQuery();

  // Progress data
  const pomodoroCount = dailyState?.progress?.pomodoroCount ?? 0;
  const dailyCap = dailyState?.progress?.dailyCap ?? 8;
  const isCapped = dailyState?.progress?.isCapped ?? false;

  // Daily cap modal
  const showCapModal = phase === 'idle' && isCapped;

  // Start pomodoro handler
  const handleStart = useCallback(async () => {
    if (!selectedTaskId) return;
    try {
      await actions.startPomodoro(selectedTaskId);
    } catch {
      // Error is handled by the machine
    }
  }, [selectedTaskId, actions]);

  // Sync selected task from active pomodoro's task (when coming back to idle)
  useEffect(() => {
    if (phase === 'idle' && pomodoro?.taskId) {
      setSelectedTaskId(pomodoro.taskId);
    }
  }, [phase, pomodoro?.taskId]);

  const PlayIcon = Icons.play;
  const StopIcon = Icons.stop;
  const LoaderIcon = Icons.loader;

  const isFocusing = phase === 'focus' || phase === 'completing';
  const taskTitle = pomodoro?.task?.title ?? pomodoro?.label ?? 'Focus Session';

  // ---- Loading ----
  if (isLoading || phase === 'loading') {
    return (
      <Card className="border-notion-border">
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <LoaderIcon className="w-5 h-5 animate-spin text-notion-text-tertiary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* ---- Resting ---- */}
      {phase === 'resting' && (
        <Card className="border-notion-accent-green/30 bg-notion-accent-green-bg/30">
          <CardContent>
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
          </CardContent>
        </Card>
      )}

      {/* ---- Focus / Completing ---- */}
      {isFocusing && (
        <Card className="border-notion-accent-blue/30">
          <CardContent>
            <div className="flex items-center justify-between gap-4">
              {/* Left: status + task name */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-3 h-3 rounded-full bg-notion-accent-red animate-pulse shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-notion-text-secondary">Focusing on</p>
                  <p className="font-medium text-notion-text truncate">{taskTitle}</p>
                </div>
              </div>

              {/* Center: timer */}
              <div className="flex-shrink-0 w-40">
                {pomodoro && (
                  <FocusTimer
                    startTime={new Date(pomodoro.startTime)}
                    duration={pomodoro.duration}
                  />
                )}
                {phase === 'completing' && (
                  <div className="flex items-center gap-2 text-notion-text-secondary">
                    <LoaderIcon className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Completing...</span>
                  </div>
                )}
              </div>

              {/* Right: abort button */}
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={actions.abortPomodoro}
                  disabled={phase === 'completing'}
                  className="text-notion-text-tertiary hover:text-notion-accent-red"
                >
                  <StopIcon className="w-4 h-4" />
                  <span className="ml-1 hidden sm:inline">Abort</span>
                </Button>
              </div>
            </div>

            {/* Progress dots */}
            <div className="mt-3 pt-3 border-t border-notion-border">
              <PomodoroProgressDots completed={pomodoroCount} total={dailyCap} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---- Idle / Break Prompt ---- */}
      {(phase === 'idle' || phase === 'break_prompt') && (
        <Card className="border-notion-border">
          <CardContent>
            <div className="flex flex-col gap-4">
              {/* Task selector + start button row */}
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <TaskSelector
                    tasks={availableTasks}
                    selectedTaskId={selectedTaskId}
                    onSelect={setSelectedTaskId}
                    disabled={!canStart}
                  />
                </div>
                <Button
                  variant="primary"
                  onClick={handleStart}
                  disabled={!selectedTaskId || !canStart}
                  className="shrink-0"
                >
                  <PlayIcon className="w-4 h-4" />
                  <span className="ml-1.5">Start Focus</span>
                </Button>
              </div>

              {/* Progress dots */}
              <PomodoroProgressDots completed={pomodoroCount} total={dailyCap} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Completion modal overlay — always rendered at top level for any phase transition */}
      {phase === 'break_prompt' && completedPomodoro && (
        <PomodoroCompletionModal
          pomodoroId={completedPomodoro.id}
          taskTitle={completedPomodoro.task?.title ?? 'Unknown Task'}
          onConfirm={actions.confirmBreak}
          onStartBreak={actions.confirmBreak}
          alreadyCompleted={true}
        />
      )}

      {/* Daily cap modal */}
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
    </>
  );
}
