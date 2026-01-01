'use client';

/**
 * TaskPomodoroButton Component
 * 
 * Displays a button to start a pomodoro for a specific task.
 * Shows running timer when the task has an active pomodoro.
 * Disables when another task has an active pomodoro.
 * 
 * Requirements: 2.1, 2.4, 2.5
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { calculateRemainingSeconds } from '@/lib/pomodoro-cache';

interface TaskPomodoroButtonProps {
  taskId: string;
  taskTitle: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

export function TaskPomodoroButton({ 
  taskId, 
  taskTitle, 
  disabled = false,
  size = 'sm' 
}: TaskPomodoroButtonProps) {
  const router = useRouter();
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  
  const utils = trpc.useUtils();
  
  // Get current pomodoro if any
  const { data: currentPomodoro, isLoading } = trpc.pomodoro.getCurrent.useQuery();
  
  // Get user settings for default duration
  const { data: settings } = trpc.settings.get.useQuery();
  
  // Check if can start pomodoro
  const { data: canStart } = trpc.dailyState.canStartPomodoro.useQuery();

  // Start pomodoro mutation
  const startMutation = trpc.pomodoro.start.useMutation({
    onSuccess: () => {
      utils.pomodoro.getCurrent.invalidate();
      utils.dailyState.getToday.invalidate();
      // Navigate to pomodoro page after starting (Requirement 2.3)
      router.push('/pomodoro');
    },
  });

  // Determine button state
  const isThisTaskActive = currentPomodoro?.taskId === taskId;
  const isOtherTaskActive = currentPomodoro && currentPomodoro.taskId !== taskId;
  const isButtonDisabled = disabled || isOtherTaskActive || !canStart || startMutation.isPending;

  // Calculate remaining time for active pomodoro
  useEffect(() => {
    if (isThisTaskActive && currentPomodoro) {
      const remaining = calculateRemainingSeconds(
        currentPomodoro.startTime,
        currentPomodoro.duration
      );
      setTimeRemaining(remaining);
    } else {
      setTimeRemaining(0);
    }
  }, [isThisTaskActive, currentPomodoro]);

  // Countdown timer for active pomodoro
  useEffect(() => {
    if (!isThisTaskActive || timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          // Refetch to get updated state
          utils.pomodoro.getCurrent.invalidate();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isThisTaskActive, timeRemaining, utils]);

  // Format time as MM:SS
  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Handle start pomodoro
  const handleStart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isButtonDisabled) return;
    
    try {
      await startMutation.mutateAsync({
        taskId,
        duration: settings?.pomodoroDuration ?? 25,
      });
    } catch (error) {
      console.error('Failed to start pomodoro:', error);
    }
  };

  // Handle click on running timer (navigate to pomodoro page)
  const handleTimerClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push('/pomodoro');
  };

  // Size classes
  const sizeClasses = size === 'sm' 
    ? 'px-2 py-1 text-xs' 
    : 'px-3 py-1.5 text-sm';

  if (isLoading) {
    return (
      <span className={`inline-flex items-center ${sizeClasses} text-gray-400`}>
        ...
      </span>
    );
  }

  // Show running timer for this task (Requirement 2.5)
  if (isThisTaskActive) {
    return (
      <button
        onClick={handleTimerClick}
        className={`
          inline-flex items-center gap-1 ${sizeClasses}
          bg-green-100 text-green-700 rounded-md font-medium
          hover:bg-green-200 transition-colors
        `}
        title="Click to view timer"
      >
        <span className="animate-pulse">🍅</span>
        <span>{formatTime(timeRemaining)}</span>
      </button>
    );
  }

  // Show disabled state when another task has active pomodoro (Requirement 2.4)
  if (isOtherTaskActive) {
    return (
      <span 
        className={`
          inline-flex items-center gap-1 ${sizeClasses}
          bg-gray-100 text-gray-400 rounded-md cursor-not-allowed
        `}
        title="Another pomodoro is in progress"
      >
        🍅
      </span>
    );
  }

  // Show start button (Requirement 2.1)
  return (
    <button
      onClick={handleStart}
      disabled={isButtonDisabled}
      className={`
        inline-flex items-center gap-1 ${sizeClasses}
        rounded-md font-medium transition-colors
        ${isButtonDisabled 
          ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
          : 'bg-red-50 text-red-600 hover:bg-red-100'
        }
      `}
      title={!canStart ? 'Daily cap reached' : `Start pomodoro for "${taskTitle}"`}
    >
      {startMutation.isPending ? (
        <>
          <span className="animate-spin">⏳</span>
        </>
      ) : (
        <>
          <span>🍅</span>
          <span>Start</span>
        </>
      )}
    </button>
  );
}
