'use client';

/**
 * Pomodoro Timer Component
 * 
 * Displays countdown timer with start/stop controls and task selector.
 * Supports state persistence across page refreshes.
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/components/ui';
import { trpc } from '@/lib/trpc';
import { TaskSelector } from '@/components/pomodoro/task-selector';
import { 
  cachePomodoroState, 
  clearPomodoroCache, 
  calculateRemainingSeconds,
  restorePomodoroState,
  isSessionExpired,
  type PomodoroData
} from '@/lib/pomodoro-cache';
import {
  notifyPomodoroComplete,
  requestNotificationPermission,
  preloadSounds,
  stopTabFlash,
  type NotificationConfig,
} from '@/services/notification.service';
import { useSocket } from '@/hooks/use-socket';
import { trayIntegrationService } from '@/services/tray-integration.service';

// Quick Add to Inbox component
function QuickAddInput({ onAdd }: { onAdd: () => void }) {
  const [title, setTitle] = useState('');
  const mutation = trpc.task.quickCreateInbox.useMutation({
    onSuccess: () => {
      setTitle('');
      onAdd();
    },
  });

  return (
    <div className="flex gap-2 mt-4">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Quick add task..."
        className="flex-1 px-3 py-2 border rounded-md text-sm"
        onKeyDown={(e) => e.key === 'Enter' && title.trim() && mutation.mutate({ title: title.trim() })}
      />
      <Button
        variant="secondary"
        size="sm"
        onClick={() => title.trim() && mutation.mutate({ title: title.trim() })}
        disabled={!title.trim() || mutation.isPending}
      >
        + Add
      </Button>
    </div>
  );
}

interface PomodoroTimerProps {
  taskId?: string;           // Pre-selected task ID (when starting from tasks page)
  onComplete?: () => void;
  onAbort?: () => void;
  onTaskSwitch?: (taskId: string | null) => void;  // Multi-task: callback when task is switched
  compact?: boolean;         // Compact mode (for embedding in tasks page)
}

export function PomodoroTimer({ taskId: preSelectedTaskId, onComplete, onAbort, onTaskSwitch, compact }: PomodoroTimerProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(preSelectedTaskId ?? null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isRecovering, setIsRecovering] = useState(true);
  const [showTaskSwitcher, setShowTaskSwitcher] = useState(false);
  const hasHandledExpiredSession = useRef(false);
  const hasRequestedPermission = useRef(false);

  const utils = trpc.useUtils();
  
  // Socket connection for WebSocket events (Requirement 4.6)
  const { connected: socketConnected } = useSocket();
  
  // Get current pomodoro if any
  const { data: currentPomodoro, isLoading: pomodoroLoading, refetch: refetchCurrent } = trpc.pomodoro.getCurrent.useQuery();

  // Get time slices for current pomodoro (Multi-task Req 4)
  const { data: timeSlices } = trpc.timeSlice.getByPomodoro.useQuery(
    { pomodoroId: currentPomodoro?.id ?? '' },
    { enabled: !!currentPomodoro?.id }
  );
  
  // Get user settings for default duration and notification config
  const { data: settings } = trpc.settings.get.useQuery();
  
  // Get today's tasks for selection (including overdue tasks)
  const { data: todayTasks } = trpc.task.getTodayTasks.useQuery();
  const { data: overdueTasks } = trpc.task.getOverdue.useQuery();
  
  // Combine today's tasks and overdue tasks for selection
  const availableTasks = [...(todayTasks ?? []), ...(overdueTasks ?? [])];
  
  // Check if can start pomodoro
  const { data: canStart } = trpc.dailyState.canStartPomodoro.useQuery();

  // Get last task for "Continue Last" feature
  const { data: lastTask } = trpc.pomodoro.getLastTask.useQuery();

  // Build notification config from settings (Requirements 4.3, 4.4)
  // Note: Using type assertion as Prisma types may not be fully synced
  const notificationConfig: NotificationConfig = useMemo(() => {
    const s = settings as {
      notificationEnabled?: boolean;
      notificationSound?: string;
      flashTabEnabled?: boolean;
    } | undefined;
    return {
      enabled: s?.notificationEnabled ?? true,
      soundEnabled: s?.notificationSound !== 'none',
      soundType: (s?.notificationSound as 'bell' | 'chime' | 'gentle' | 'none') ?? 'bell',
      flashTab: s?.flashTabEnabled ?? true,
    };
  }, [settings]);

  // Request notification permission and preload sounds on mount (Requirement 4.1)
  useEffect(() => {
    if (!hasRequestedPermission.current) {
      hasRequestedPermission.current = true;
      requestNotificationPermission();
      preloadSounds();
    }
  }, []);

  // Stop tab flash when component unmounts or tab becomes visible
  // Also sync timer state when tab becomes visible again
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (!document.hidden) {
        stopTabFlash();
        
        // When tab becomes visible, sync with server state
        if (currentPomodoro && isRunning) {
          const serverRemaining = calculateRemainingSeconds(
            currentPomodoro.startTime,
            currentPomodoro.duration
          );
          
          if (serverRemaining <= 0) {
            // Pomodoro should be completed - refetch to get updated state
            await refetchCurrent();
          } else {
            // Update local timer to match server
            setTimeRemaining(serverRemaining);
          }
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopTabFlash();
    };
  }, [currentPomodoro, isRunning, refetchCurrent]);

  // Mutations
  const startMutation = trpc.pomodoro.start.useMutation({
    onSuccess: (data) => {
      utils.pomodoro.getCurrent.invalidate();
      utils.dailyState.getToday.invalidate();
    },
  });

  // Multi-task: Start taskless pomodoro (Req 3)
  const startTasklessMutation = trpc.pomodoro.startTaskless.useMutation({
    onSuccess: () => {
      utils.pomodoro.getCurrent.invalidate();
      utils.dailyState.getToday.invalidate();
    },
  });

  const completeMutation = trpc.pomodoro.complete.useMutation({
    onSuccess: (data) => {
      utils.pomodoro.getCurrent.invalidate();
      utils.dailyState.getToday.invalidate();
      // Clear cache on completion (Requirement 1.5)
      clearPomodoroCache();
      setIsRunning(false);
      setTimeRemaining(0);
      
      // Update tray to show no active pomodoro
      trayIntegrationService.updatePomodoroState(null);
      
      // Trigger notifications on completion (Requirements 4.1, 4.2, 4.5)
      // Use type assertion as the mutation returns PomodoroWithTask
      const pomodoroData = data as { task?: { title: string } } | undefined;
      if (pomodoroData?.task?.title) {
        notifyPomodoroComplete(pomodoroData.task.title, notificationConfig);
      }
      
      onComplete?.();
    },
  });

  const abortMutation = trpc.pomodoro.abort.useMutation({
    onSuccess: () => {
      utils.pomodoro.getCurrent.invalidate();
      utils.dailyState.getToday.invalidate();
      // Clear cache on abort (Requirement 1.5)
      clearPomodoroCache();
      setIsRunning(false);
      setTimeRemaining(0);

      // Update tray to show no active pomodoro
      trayIntegrationService.updatePomodoroState(null);

      onAbort?.();
    },
  });

  // Multi-task: Switch task mutation
  const switchTaskMutation = trpc.timeSlice.switch.useMutation({
    onSuccess: (data) => {
      if (data) {
        setSelectedTaskId(data.taskId);
        onTaskSwitch?.(data.taskId);
      }
      setShowTaskSwitcher(false);
    },
  });

  // Multi-task: Complete current task mutation (Req 2)
  const completeTaskMutation = trpc.pomodoro.completeTask.useMutation({
    onSuccess: () => {
      utils.pomodoro.getCurrent.invalidate();
      utils.task.getTodayTasks.invalidate();
      setShowTaskSwitcher(true); // Show switcher to pick next task
    },
  });

  // State recovery on mount (Requirements 1.2, 1.3, 1.4)
  useEffect(() => {
    const recoverState = async () => {
      setIsRecovering(true);
      
      // First, check server for current session (Requirement 1.2, 1.3)
      // The server will automatically complete any expired sessions
      if (currentPomodoro) {
        const remaining = calculateRemainingSeconds(
          currentPomodoro.startTime,
          currentPomodoro.duration
        );
        
        if (remaining > 0) {
          // Session is still active - restore it
          setTimeRemaining(remaining);
          setIsRunning(true);
          setSelectedTaskId(currentPomodoro.taskId);
          // Update cache with server state (only if task data is available)
          if (currentPomodoro.task) {
            cachePomodoroState({
              id: currentPomodoro.id,
              taskId: currentPomodoro.taskId,
              duration: currentPomodoro.duration,
              startTime: currentPomodoro.startTime,
              task: currentPomodoro.task,
            });
          }
        } else {
          // Session should have been completed by server already
          // Clear any stale cache and reset state
          clearPomodoroCache();
          setIsRunning(false);
          setTimeRemaining(0);
        }
      } else {
        // No server session - check local cache for recovery hints
        const cachedState = restorePomodoroState();
        if (cachedState && !isSessionExpired(cachedState)) {
          // Cache exists but server doesn't have it - might be a sync issue
          // Refetch to ensure we have latest server state
          await refetchCurrent();
        } else if (cachedState) {
          // Cached session expired - clear it
          clearPomodoroCache();
        }
        setIsRunning(false);
      }
      
      setIsRecovering(false);
    };
    
    if (!pomodoroLoading) {
      recoverState();
    }
  }, [currentPomodoro, pomodoroLoading, refetchCurrent]);

  // Calculate remaining time from current pomodoro (Requirement 1.2)
  useEffect(() => {
    if (currentPomodoro && !isRecovering) {
      const remaining = calculateRemainingSeconds(
        currentPomodoro.startTime,
        currentPomodoro.duration
      );
      
      setTimeRemaining(remaining);
      setIsRunning(remaining > 0);
      setSelectedTaskId(currentPomodoro.taskId);
      
      // Update tray with current pomodoro state
      if (remaining > 0) {
        trayIntegrationService.updatePomodoroState({
          id: currentPomodoro.id,
          taskId: currentPomodoro.taskId,
          duration: currentPomodoro.duration,
          startTime: currentPomodoro.startTime,
          task: currentPomodoro.task,
        });
      }
      
      // Keep cache in sync (only if task data is available)
      if (remaining > 0 && currentPomodoro.task) {
        cachePomodoroState({
          id: currentPomodoro.id,
          taskId: currentPomodoro.taskId,
          duration: currentPomodoro.duration,
          startTime: currentPomodoro.startTime,
          task: currentPomodoro.task,
        });
      }
    } else if (!currentPomodoro && !isRecovering) {
      setIsRunning(false);
      // Update tray to show no active pomodoro
      trayIntegrationService.updatePomodoroState(null);
    }
  }, [currentPomodoro, isRecovering]);

  // Countdown timer with auto-completion and periodic server sync
  useEffect(() => {
    if (!isRunning || timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          // Auto-complete the pomodoro when timer reaches 0 (Requirement 1.4)
          if (currentPomodoro) {
            completeMutation.mutate({ id: currentPomodoro.id });
          }
          return 0;
        }
        
        // Update tray with new countdown time every second
        if (currentPomodoro && prev > 1) {
          trayIntegrationService.updatePomodoroState({
            id: currentPomodoro.id,
            taskId: currentPomodoro.taskId,
            duration: currentPomodoro.duration,
            startTime: currentPomodoro.startTime,
            task: currentPomodoro.task,
          });
        }
        
        return prev - 1;
      });
    }, 1000);

    // Periodic server sync to handle cases where tab was inactive
    // Check every 10 seconds to ensure we're still in sync and handle auto-completion
    const syncInterval = setInterval(async () => {
      if (currentPomodoro) {
        const serverRemaining = calculateRemainingSeconds(
          currentPomodoro.startTime,
          currentPomodoro.duration
        );
        
        // If server says the pomodoro should be completed, complete it immediately
        if (serverRemaining <= 0) {
          setIsRunning(false);
          setTimeRemaining(0);
          // Auto-complete if not already completed
          if (currentPomodoro.status === 'IN_PROGRESS') {
            completeMutation.mutate({ id: currentPomodoro.id });
          } else {
            // Already completed on server, just refetch to sync state
            await refetchCurrent();
          }
        } else {
          // Sync local timer with server calculation
          setTimeRemaining(serverRemaining);
          // Update tray with synced time
          trayIntegrationService.updatePomodoroState({
            id: currentPomodoro.id,
            taskId: currentPomodoro.taskId,
            duration: currentPomodoro.duration,
            startTime: currentPomodoro.startTime,
            task: currentPomodoro.task,
          });
        }
      }
    }, 10000); // Check every 10 seconds for more responsive auto-completion

    return () => {
      clearInterval(interval);
      clearInterval(syncInterval);
    };
  }, [isRunning, timeRemaining, currentPomodoro, refetchCurrent, completeMutation]);

  // Format time as MM:SS
  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Calculate progress percentage
  const progress = useMemo(() => {
    if (!currentPomodoro) return 0;
    const totalSeconds = currentPomodoro.duration * 60;
    return ((totalSeconds - timeRemaining) / totalSeconds) * 100;
  }, [currentPomodoro, timeRemaining]);

  // Handle start pomodoro
  const handleStart = async () => {
    if (!selectedTaskId) return;

    try {
      await startMutation.mutateAsync({
        taskId: selectedTaskId,
        duration: settings?.pomodoroDuration ?? 25,
      });
    } catch (error) {
      console.error('Failed to start pomodoro:', error);
    }
  };

  // Handle start taskless pomodoro (Multi-task Req 3)
  const handleStartTaskless = async () => {
    try {
      await startTasklessMutation.mutateAsync({});
    } catch (error) {
      console.error('Failed to start taskless pomodoro:', error);
    }
  };

  // Handle continue last task
  const handleContinueLast = async () => {
    if (!lastTask) return;
    try {
      await startMutation.mutateAsync({ taskId: lastTask.id });
    } catch (error) {
      console.error('Failed to continue last task:', error);
    }
  };

  // Handle abort pomodoro
  const handleAbort = async () => {
    if (!currentPomodoro) return;

    try {
      await abortMutation.mutateAsync({ id: currentPomodoro.id });
    } catch (error) {
      console.error('Failed to abort pomodoro:', error);
    }
  };

  // Handle switch task (Multi-task Req 1)
  const handleSwitchTask = async (newTaskId: string | null) => {
    if (!currentPomodoro) return;

    try {
      await switchTaskMutation.mutateAsync({
        pomodoroId: currentPomodoro.id,
        currentSliceId: null, // Service will find current slice
        newTaskId,
      });
    } catch (error) {
      console.error('Failed to switch task:', error);
    }
  };

  // Handle complete current task (Multi-task Req 2)
  const handleCompleteTask = async () => {
    if (!currentPomodoro || !currentPomodoro.taskId) return;

    try {
      await completeTaskMutation.mutateAsync({
        pomodoroId: currentPomodoro.id,
      });
    } catch (error) {
      console.error('Failed to complete task:', error);
    }
  };

  // Get current task title
  const currentTaskTitle = useMemo(() => {
    if (!currentPomodoro?.task) return null;
    return currentPomodoro.task.title;
  }, [currentPomodoro]);

  if (pomodoroLoading || isRecovering) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-gray-500">
          {isRecovering ? 'Restoring session...' : 'Loading...'}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      {/* Timer Display */}
      <div className="relative w-64 h-64">
        {/* Progress Ring */}
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="8"
          />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke={isRunning ? '#22c55e' : '#3b82f6'}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 45}`}
            strokeDashoffset={`${2 * Math.PI * 45 * (1 - progress / 100)}`}
            className="transition-all duration-1000"
          />
        </svg>
        
        {/* Time Display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-bold text-gray-900">
            {formatTime(timeRemaining || (settings?.pomodoroDuration ?? 25) * 60)}
          </span>
          {isRunning && currentTaskTitle && (
            <span className="text-sm text-gray-500 mt-2 max-w-[180px] truncate text-center">
              {currentTaskTitle}
            </span>
          )}
        </div>
      </div>

      {/* Task Selector (only when not running) */}
      {!isRunning && (
        <div className="w-full max-w-md">
          <TaskSelector
            tasks={availableTasks}
            selectedTaskId={selectedTaskId}
            onSelect={setSelectedTaskId}
            disabled={isRunning}
          />
        </div>
      )}

      {/* Task Stack Display (Multi-task Req 4) */}
      {isRunning && timeSlices && timeSlices.length > 0 && (
        <div className="w-full max-w-md bg-gray-50 rounded-lg p-3">
          <h4 className="text-xs font-medium text-gray-500 mb-2">Task Stack</h4>
          <div className="space-y-1">
            {timeSlices.map((slice, idx) => {
              const task = availableTasks.find(t => t.id === slice.taskId);
              const isActive = idx === timeSlices.length - 1 && !slice.endTime;
              return (
                <div
                  key={slice.id}
                  className={`flex justify-between items-center text-sm px-2 py-1 rounded ${
                    isActive ? 'bg-green-100 text-green-800' : 'text-gray-600'
                  }`}
                >
                  <span className="truncate flex-1">
                    {task?.title ?? (slice.taskId ? 'Unknown' : 'Taskless')}
                  </span>
                  <span className="text-xs ml-2">
                    {Math.floor((slice.durationSeconds ?? 0) / 60)}m
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-4">
        {!isRunning ? (
          <>
            <Button
              variant="primary"
              size="lg"
              onClick={handleStart}
              disabled={!selectedTaskId || !canStart || startMutation.isPending}
              isLoading={startMutation.isPending}
            >
              🎯 Start Focus
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={handleStartTaskless}
              disabled={!canStart || startTasklessMutation.isPending}
              isLoading={startTasklessMutation.isPending}
            >
              ⏱️ Focus Time
            </Button>
            {lastTask && (
              <Button
                variant="ghost"
                size="lg"
                onClick={handleContinueLast}
                disabled={!canStart || startMutation.isPending}
              >
                ↩️ Last
              </Button>
            )}
          </>
        ) : (
          <>
            {currentPomodoro?.taskId && (
              <Button
                variant="primary"
                size="lg"
                onClick={handleCompleteTask}
                disabled={completeTaskMutation.isPending}
                isLoading={completeTaskMutation.isPending}
              >
                ✅ Done
              </Button>
            )}
            <Button
              variant="secondary"
              size="lg"
              onClick={() => setShowTaskSwitcher(true)}
              disabled={switchTaskMutation.isPending}
            >
              🔄 Switch
            </Button>
            <Button
              variant="danger"
              size="lg"
              onClick={handleAbort}
              disabled={abortMutation.isPending}
              isLoading={abortMutation.isPending}
            >
              ⏹️ Stop
            </Button>
          </>
        )}
      </div>

      {/* Task Switcher Modal (Multi-task Req 1) */}
      {showTaskSwitcher && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Switch Task</h3>
            <TaskSelector
              tasks={availableTasks}
              selectedTaskId={selectedTaskId}
              onSelect={(taskId) => handleSwitchTask(taskId)}
              disabled={switchTaskMutation.isPending}
            />
            {/* Quick Add to Inbox */}
            <QuickAddInput onAdd={() => utils.task.getTodayTasks.invalidate()} />
            <div className="flex gap-2 mt-4">
              <Button
                variant="secondary"
                onClick={() => handleSwitchTask(null)}
                disabled={switchTaskMutation.isPending}
              >
                Continue Taskless
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowTaskSwitcher(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Status Messages */}
      {!canStart && !isRunning && (
        <p className="text-amber-600 text-sm">
          Daily cap reached. Override required to start new pomodoro.
        </p>
      )}
      
      {!selectedTaskId && !isRunning && (
        <p className="text-gray-500 text-sm">
          Select a task to start a focus session
        </p>
      )}
    </div>
  );
}