'use client';

/**
 * Rest Mode UI Component
 *
 * Displays rest elapsed time (count-up) and allows starting next pomodoro.
 * Supports auto-start next pomodoro after configured rest duration.
 * Requirements: 4.7, 7.2, 7.4, 7.5, 7.6
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/components/ui';
import { trpc } from '@/lib/trpc';
import { AutoStartCountdown } from './auto-start-countdown';
import { NotificationSoundType, playSound } from '@/services/notification.service';

interface RestModeUIProps {
  onStartPomodoro: () => void;
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

export function RestModeUI({ onStartPomodoro, nextTaskId, nextTaskTitle }: RestModeUIProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [showAutoStartCountdown, setShowAutoStartCountdown] = useState(false);
  const [isRestDurationExceeded, setIsRestDurationExceeded] = useState(false);
  const [quote] = useState(() =>
    motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)]
  );
  const confirmationSoundIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasPlayedRestEndSound = useRef(false);

  // Get user settings for rest duration and auto-start config
  const { data: settings } = trpc.settings.get.useQuery();

  // Get daily state to check pomodoro count for long rest
  const { data: dailyState } = trpc.dailyState.getToday.useQuery();

  // Get rest status for recovery after page refresh
  const { data: restStatus, isLoading: restStatusLoading } = trpc.dailyState.getRestStatus.useQuery(undefined, {
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

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
    if (restStatusLoading) return;

    if (restStatus?.restStartTime) {
      // Recover from server: calculate elapsed time since rest started
      const restStartMs = new Date(restStatus.restStartTime).getTime();
      const elapsed = Math.floor((Date.now() - restStartMs) / 1000);
      setElapsedSeconds(Math.max(0, elapsed));

      // Check if rest duration already exceeded
      const totalSeconds = restStatus.restDuration * 60;
      if (elapsed >= totalSeconds) {
        setIsRestDurationExceeded(true);
        if (autoStartSettings.autoStartNextPomodoro && nextTaskId) {
          setShowAutoStartCountdown(true);
        }
      }
    }
  }, [restStatusLoading, restStatus, autoStartSettings.autoStartNextPomodoro, nextTaskId]);

  // Count-up timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + 1;
        const totalSeconds = restDuration * 60;

        // Check if rest duration just exceeded
        if (next >= totalSeconds && !isRestDurationExceeded) {
          setIsRestDurationExceeded(true);
          if (autoStartSettings.autoStartNextPomodoro && nextTaskId) {
            setShowAutoStartCountdown(true);
          }
        }

        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [restDuration, isRestDurationExceeded, autoStartSettings.autoStartNextPomodoro, nextTaskId]);

  // Play sound when rest duration is exceeded (Requirements 7.6)
  useEffect(() => {
    if (!isRestDurationExceeded) {
      hasPlayedRestEndSound.current = false;
      if (confirmationSoundIntervalRef.current) {
        clearInterval(confirmationSoundIntervalRef.current);
        confirmationSoundIntervalRef.current = null;
      }
      return;
    }

    // Play sound immediately when rest duration is exceeded
    if (!hasPlayedRestEndSound.current && autoStartSettings.notificationSound !== 'none') {
      playSound(autoStartSettings.notificationSound);
      hasPlayedRestEndSound.current = true;
    }

    // Play sound every 30 seconds as a gentle reminder
    confirmationSoundIntervalRef.current = setInterval(() => {
      if (autoStartSettings.notificationSound !== 'none') {
        playSound(autoStartSettings.notificationSound);
      }
    }, 30000);

    return () => {
      if (confirmationSoundIntervalRef.current) {
        clearInterval(confirmationSoundIntervalRef.current);
        confirmationSoundIntervalRef.current = null;
      }
    };
  }, [isRestDurationExceeded, autoStartSettings.notificationSound]);

  // Format elapsed time as +M:SS
  const formatElapsed = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `+${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Calculate progress percentage (fills up, then stays full when exceeded)
  const progress = useMemo(() => {
    const totalSeconds = restDuration * 60;
    return Math.min(100, (elapsedSeconds / totalSeconds) * 100);
  }, [restDuration, elapsedSeconds]);

  // Handle start pomodoro
  const handleStartPomodoro = async () => {
    if (confirmationSoundIntervalRef.current) {
      clearInterval(confirmationSoundIntervalRef.current);
      confirmationSoundIntervalRef.current = null;
    }
    onStartPomodoro();
  };

  // Handle auto-start pomodoro (Requirements 7.2, 7.5)
  const handleAutoStartPomodoro = useCallback(async () => {
    if (confirmationSoundIntervalRef.current) {
      clearInterval(confirmationSoundIntervalRef.current);
      confirmationSoundIntervalRef.current = null;
    }
    onStartPomodoro();
  }, [onStartPomodoro]);

  // Handle cancel auto-start
  const handleCancelAutoStart = useCallback(() => {
    setShowAutoStartCountdown(false);
  }, []);

  // Determine if this is a long rest
  const isLongRest = restDuration > (settings?.shortRestDuration ?? 5);

  // Show auto-start countdown if enabled and rest duration exceeded
  if (showAutoStartCountdown && isRestDurationExceeded && nextTaskId) {
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
      <div className={`text-6xl ${!isRestDurationExceeded ? 'animate-pulse' : ''}`}>
        {isRestDurationExceeded ? '⚠️' : isLongRest ? '🧘' : '☕'}
      </div>

      {/* Title */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">
          {isRestDurationExceeded
            ? 'Time to focus!'
            : isLongRest ? 'Long Break' : 'Short Break'}
        </h2>
        <p className="text-gray-500 mt-1">
          {isRestDurationExceeded
            ? 'Your rest time is up — start your next session'
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
            stroke={isRestDurationExceeded ? '#f59e0b' : '#8b5cf6'}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 45}`}
            strokeDashoffset={`${2 * Math.PI * 45 * (1 - progress / 100)}`}
            className="transition-all duration-1000"
          />
        </svg>

        {/* Time Display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-4xl font-bold ${isRestDurationExceeded ? 'text-amber-600' : 'text-gray-900'}`}>
            {formatElapsed(elapsedSeconds)}
          </span>
          <span className="text-sm text-gray-500 mt-1">
            {isLongRest ? 'Long rest' : 'Short rest'}
          </span>
        </div>
      </div>

      {/* Over-rest reminder */}
      {isRestDurationExceeded && (
        <div className="text-center animate-pulse">
          <p className="text-amber-600 font-medium">
            🔔 Break time exceeded! Ready to focus?
          </p>
          {nextTaskTitle && (
            <p className="text-sm text-gray-500 mt-1">
              Next task: {nextTaskTitle}
            </p>
          )}
        </div>
      )}

      {/* Motivational Quote */}
      {!isRestDurationExceeded && (
        <div className="max-w-sm text-center">
          <p className="text-gray-600 italic">&quot;{quote}&quot;</p>
        </div>
      )}

      {/* Action Button — always "Start Next Pomodoro", no skip rest */}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Button
          variant="primary"
          size="lg"
          onClick={handleStartPomodoro}
          className={isRestDurationExceeded ? 'bg-green-600 hover:bg-green-700' : 'bg-purple-600 hover:bg-purple-700'}
        >
          🎯 {isRestDurationExceeded ? 'Start Focus Session' : 'Start Next Session'}
        </Button>
      </div>

      {/* Rest Tips */}
      {!isRestDurationExceeded && (
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
