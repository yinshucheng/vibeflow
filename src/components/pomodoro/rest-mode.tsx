'use client';

/**
 * Rest Mode UI Component
 * 
 * Displays rest countdown and blocks starting new pomodoro until rest ends.
 * Supports auto-start next pomodoro after break completion.
 * Requirements: 4.7, 7.2, 7.4, 7.5, 7.6
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/components/ui';
import { trpc } from '@/lib/trpc';
import { AutoStartCountdown } from './auto-start-countdown';
import { NotificationSoundType, playSound } from '@/services/notification.service';

interface RestModeUIProps {
  onRestComplete: () => void;
  /** Task ID to start next pomodoro with (for auto-start) */
  nextTaskId?: string;
  /** Task title for display */
  nextTaskTitle?: string;
}

// Motivational quotes for rest time
const motivationalQuotes = [
  "Rest is not idleness. It's the key to productivity.",
  "Take a breath. You've earned this moment.",
  "Great minds need great rest.",
  "Recharge now, conquer later.",
  "A rested mind is a creative mind.",
  "Pause. Breathe. Reset.",
  "Your brain is consolidating what you just learned.",
  "Step away to come back stronger.",
];

export function RestModeUI({ onRestComplete, nextTaskId, nextTaskTitle }: RestModeUIProps) {
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [showAutoStartCountdown, setShowAutoStartCountdown] = useState(false);
  const [isWaitingForConfirmation, setIsWaitingForConfirmation] = useState(false);
  const [quote] = useState(() => 
    motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)]
  );
  const confirmationSoundIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasPlayedInitialSound = useRef(false);

  const utils = trpc.useUtils();

  // Get user settings for rest duration and auto-start config
  const { data: settings } = trpc.settings.get.useQuery();

  // Get daily state to check pomodoro count for long rest
  const { data: dailyState } = trpc.dailyState.getToday.useQuery();

  // Get rest status for recovery after page refresh
  const { data: restStatus, isLoading: restStatusLoading } = trpc.dailyState.getRestStatus.useQuery(undefined, {
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

  // Note: RestModeUI now delegates state transitions to the parent (PomodoroPage via usePomodoroMachine)
  // The onRestComplete callback handles the API calls, so we don't need local mutations here anymore.
  // We keep minimal mutation references only for loading states.

  // Get auto-start settings with type assertion
  const autoStartSettings = useMemo(() => {
    const s = settings as {
      autoStartNextPomodoro?: boolean;
      autoStartCountdown?: number;
      notificationSound?: string;
      pomodoroDuration?: number;
    } | undefined;
    return {
      autoStartNextPomodoro: s?.autoStartNextPomodoro ?? false,
      autoStartCountdown: s?.autoStartCountdown ?? 5,
      notificationSound: (s?.notificationSound as NotificationSoundType) ?? 'gentle',
      pomodoroDuration: s?.pomodoroDuration ?? 25,
    };
  }, [settings]);

  // Calculate rest duration based on pomodoro count
  const restDuration = useMemo(() => {
    if (!settings || !dailyState) return 5; // default 5 minutes
    
    const pomodoroCount = dailyState.progress?.pomodoroCount ?? 0;
    const longRestInterval = settings.longRestInterval ?? 4;
    
    // Long rest after every N pomodoros
    if (pomodoroCount > 0 && pomodoroCount % longRestInterval === 0) {
      return settings.longRestDuration ?? 15;
    }
    
    return settings.shortRestDuration ?? 5;
  }, [settings, dailyState]);

  // Initialize timer - recover from server if page was refreshed
  useEffect(() => {
    // Wait for rest status query to complete before initializing
    if (restStatusLoading) {
      return;
    }

    if (restStatus?.restStartTime) {
      // Recover from server: calculate elapsed time since rest started
      const restStartMs = new Date(restStatus.restStartTime).getTime();
      const elapsedSeconds = Math.floor((Date.now() - restStartMs) / 1000);
      const totalSeconds = restStatus.restDuration * 60;
      const remaining = Math.max(0, totalSeconds - elapsedSeconds);
      setTimeRemaining(remaining);

      // If rest already completed, trigger completion state
      if (remaining <= 0) {
        if (autoStartSettings.autoStartNextPomodoro && nextTaskId) {
          setShowAutoStartCountdown(true);
        } else {
          setIsWaitingForConfirmation(true);
        }
      }
    } else {
      // New rest session (no server data yet)
      setTimeRemaining(restDuration * 60);
    }
  }, [restStatusLoading, restStatus, restDuration, autoStartSettings.autoStartNextPomodoro, nextTaskId]);

  // Countdown timer - trigger auto-start countdown or waiting state when rest completes
  useEffect(() => {
    if (timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          // Rest complete - check if auto-start is enabled (Requirements 7.2, 7.5)
          if (autoStartSettings.autoStartNextPomodoro && nextTaskId) {
            setShowAutoStartCountdown(true);
          } else {
            // Auto-start disabled - show manual confirmation (Requirements 7.4, 7.6)
            setIsWaitingForConfirmation(true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timeRemaining, autoStartSettings.autoStartNextPomodoro, nextTaskId]);

  // Play sound periodically when waiting for manual confirmation (Requirements 7.6)
  useEffect(() => {
    if (!isWaitingForConfirmation) {
      if (confirmationSoundIntervalRef.current) {
        clearInterval(confirmationSoundIntervalRef.current);
        confirmationSoundIntervalRef.current = null;
      }
      hasPlayedInitialSound.current = false;
      return;
    }

    // Play sound immediately when entering waiting state
    if (!hasPlayedInitialSound.current && autoStartSettings.notificationSound !== 'none') {
      playSound(autoStartSettings.notificationSound);
      hasPlayedInitialSound.current = true;
    }

    // Play sound every 10 seconds while waiting for confirmation
    confirmationSoundIntervalRef.current = setInterval(() => {
      if (autoStartSettings.notificationSound !== 'none') {
        playSound(autoStartSettings.notificationSound);
      }
    }, 10000);

    return () => {
      if (confirmationSoundIntervalRef.current) {
        clearInterval(confirmationSoundIntervalRef.current);
        confirmationSoundIntervalRef.current = null;
      }
    };
  }, [isWaitingForConfirmation, autoStartSettings.notificationSound]);

  // Format time as MM:SS
  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Calculate progress percentage
  const progress = useMemo(() => {
    const totalSeconds = restDuration * 60;
    return ((totalSeconds - timeRemaining) / totalSeconds) * 100;
  }, [restDuration, timeRemaining]);

  // Handle end rest (manual) - goes back to planning state
  // Delegates to parent (usePomodoroMachine.endRest) which handles the API call
  const handleEndRest = async () => {
    // Stop confirmation sound
    if (confirmationSoundIntervalRef.current) {
      clearInterval(confirmationSoundIntervalRef.current);
      confirmationSoundIntervalRef.current = null;
    }
    setIsWaitingForConfirmation(false);

    // Delegate to parent - it handles the API call via usePomodoroMachine
    onRestComplete();
  };

  // Handle manual start pomodoro (Requirements 7.4)
  // For now, delegates to handleEndRest which notifies parent
  // TODO: Add onStartNextPomodoro callback for better control
  const handleManualStartPomodoro = async () => {
    // Stop confirmation sound
    if (confirmationSoundIntervalRef.current) {
      clearInterval(confirmationSoundIntervalRef.current);
      confirmationSoundIntervalRef.current = null;
    }
    setIsWaitingForConfirmation(false);

    // Delegate to parent - it can handle starting the next pomodoro
    // The parent (PomodoroPage) will transition to idle, and user can start new pomodoro
    onRestComplete();
  };

  // Handle auto-start pomodoro (Requirements 7.2, 7.5)
  // Delegates to parent which handles the state transition
  const handleAutoStartPomodoro = useCallback(async () => {
    if (confirmationSoundIntervalRef.current) {
      clearInterval(confirmationSoundIntervalRef.current);
      confirmationSoundIntervalRef.current = null;
    }
    setIsWaitingForConfirmation(false);

    // Delegate to parent - it handles the state transition
    onRestComplete();
  }, [onRestComplete]);

  // Handle cancel auto-start
  const handleCancelAutoStart = useCallback(() => {
    setShowAutoStartCountdown(false);
    // Show manual confirmation instead
    setIsWaitingForConfirmation(true);
  }, []);

  // Check if rest is complete
  const isRestComplete = timeRemaining === 0;

  // Determine if this is a long rest
  const isLongRest = restDuration > (settings?.shortRestDuration ?? 5);

  // Show auto-start countdown if enabled and rest is complete
  if (showAutoStartCountdown && isRestComplete && nextTaskId) {
    return (
      <AutoStartCountdown
        countdownSeconds={autoStartSettings.autoStartCountdown}
        nextPhase="pomodoro"
        soundType={autoStartSettings.notificationSound}
        onStart={handleAutoStartPomodoro}
        onCancel={handleCancelAutoStart}
        taskTitle={nextTaskTitle}
      />
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      {/* Rest Icon */}
      <div className={`text-6xl ${!isRestComplete ? 'animate-pulse' : ''}`}>
        {isLongRest ? '🧘' : '☕'}
      </div>

      {/* Title */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">
          {isLongRest ? 'Long Break' : 'Short Break'}
        </h2>
        <p className="text-gray-500 mt-1">
          {isRestComplete 
            ? isWaitingForConfirmation 
              ? 'Ready to continue?' 
              : 'Break complete!' 
            : 'Time to recharge'}
        </p>
      </div>

      {/* Timer Display */}
      <div className="relative w-48 h-48">
        {/* Progress Ring */}
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="6"
          />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke={isWaitingForConfirmation ? '#22c55e' : '#8b5cf6'}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 45}`}
            strokeDashoffset={`${2 * Math.PI * 45 * (1 - progress / 100)}`}
            className="transition-all duration-1000"
          />
        </svg>
        
        {/* Time Display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {isWaitingForConfirmation ? (
            <>
              <span className="text-4xl">🎯</span>
              <span className="text-sm text-gray-500 mt-1">
                Ready!
              </span>
            </>
          ) : (
            <>
              <span className="text-4xl font-bold text-gray-900">
                {formatTime(timeRemaining)}
              </span>
              <span className="text-sm text-gray-500 mt-1">
                {isLongRest ? 'Long rest' : 'Short rest'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Waiting for confirmation message (Requirements 7.4, 7.6) */}
      {isWaitingForConfirmation && (
        <div className="text-center animate-pulse">
          <p className="text-green-600 font-medium">
            🔔 Break complete! Click to start your next focus session
          </p>
          {nextTaskTitle && (
            <p className="text-sm text-gray-500 mt-1">
              Next task: {nextTaskTitle}
            </p>
          )}
        </div>
      )}

      {/* Motivational Quote */}
      {!isWaitingForConfirmation && (
        <div className="max-w-sm text-center">
          <p className="text-gray-600 italic">&quot;{quote}&quot;</p>
        </div>
      )}

      {/* Action Buttons (Requirements 7.4) */}
      {isRestComplete ? (
        <div className="flex flex-col gap-3 w-full max-w-xs">
          {/* Primary: Start Pomodoro button when waiting for confirmation */}
          {nextTaskId && (
            <Button
              variant="primary"
              size="lg"
              onClick={handleManualStartPomodoro}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              🎯 Start Focus Session
            </Button>
          )}

          {/* Secondary: Back to planning */}
          <Button
            variant={nextTaskId ? 'outline' : 'primary'}
            size={nextTaskId ? 'md' : 'lg'}
            onClick={handleEndRest}
            className={nextTaskId ? '' : 'bg-purple-600 hover:bg-purple-700'}
          >
            {nextTaskId ? 'Choose Different Task' : '🎯 Ready to Focus'}
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="md"
          onClick={handleEndRest}
        >
          Skip Rest
        </Button>
      )}

      {/* Rest Tips */}
      {!isWaitingForConfirmation && (
        <div className="mt-4 p-4 bg-purple-50 rounded-lg max-w-sm">
          <h3 className="font-medium text-purple-900 mb-2">💡 Rest Tips</h3>
          <ul className="text-sm text-purple-700 space-y-1">
            <li>• Stand up and stretch</li>
            <li>• Look away from the screen</li>
            <li>• Hydrate with water</li>
            <li>• Take a few deep breaths</li>
          </ul>
        </div>
      )}
    </div>
  );
}