'use client';

/**
 * Auto-Start Countdown Component
 * 
 * Displays a countdown before automatically starting the next phase (break or pomodoro).
 * Allows manual confirmation to skip the countdown.
 * Requirements: 7.3, 7.4, 7.5, 7.6
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui';
import { playSound, NotificationSoundType } from '@/services/notification.service';

interface AutoStartCountdownProps {
  /** Duration of countdown in seconds */
  countdownSeconds: number;
  /** Type of next phase: 'break' or 'pomodoro' */
  nextPhase: 'break' | 'pomodoro';
  /** Sound type to play during countdown */
  soundType?: NotificationSoundType;
  /** Callback when countdown completes or user confirms */
  onStart: () => void;
  /** Callback when user cancels (optional) */
  onCancel?: () => void;
  /** Task title for display (when starting pomodoro) */
  taskTitle?: string;
}

export function AutoStartCountdown({
  countdownSeconds,
  nextPhase,
  soundType = 'gentle',
  onStart,
  onCancel,
  taskTitle,
}: AutoStartCountdownProps) {
  const [timeRemaining, setTimeRemaining] = useState(countdownSeconds);
  const [isPaused, setIsPaused] = useState(false);
  const hasPlayedSound = useRef(false);
  const soundIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Play sound periodically during countdown (Requirements 7.6)
  useEffect(() => {
    if (isPaused || timeRemaining <= 0) {
      if (soundIntervalRef.current) {
        clearInterval(soundIntervalRef.current);
        soundIntervalRef.current = null;
      }
      return;
    }

    // Play sound immediately on mount
    if (!hasPlayedSound.current && soundType !== 'none') {
      playSound(soundType);
      hasPlayedSound.current = true;
    }

    // Play sound every 5 seconds during countdown
    soundIntervalRef.current = setInterval(() => {
      if (soundType !== 'none') {
        playSound(soundType);
      }
    }, 5000);

    return () => {
      if (soundIntervalRef.current) {
        clearInterval(soundIntervalRef.current);
        soundIntervalRef.current = null;
      }
    };
  }, [isPaused, soundType, timeRemaining]);

  // Countdown timer (Requirements 7.5)
  useEffect(() => {
    if (isPaused || timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          // Auto-start when countdown reaches 0
          onStart();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPaused, timeRemaining, onStart]);

  // Handle manual start (skip countdown)
  const handleStartNow = useCallback(() => {
    if (soundIntervalRef.current) {
      clearInterval(soundIntervalRef.current);
    }
    onStart();
  }, [onStart]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    if (soundIntervalRef.current) {
      clearInterval(soundIntervalRef.current);
    }
    onCancel?.();
  }, [onCancel]);

  // Toggle pause
  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  // Calculate progress percentage
  const progress = ((countdownSeconds - timeRemaining) / countdownSeconds) * 100;

  const isBreak = nextPhase === 'break';
  const icon = isBreak ? '☕' : '🍅';
  const title = isBreak ? 'Break Starting Soon' : 'Focus Session Starting Soon';
  const description = isBreak 
    ? 'Time to rest and recharge!' 
    : taskTitle 
      ? `Ready to focus on "${taskTitle}"` 
      : 'Ready to start your next focus session';

  return (
    <div className="flex flex-col items-center gap-6 p-8 bg-gradient-to-b from-gray-50 to-white rounded-2xl shadow-lg max-w-md mx-auto">
      {/* Icon with pulse animation */}
      <div className={`text-6xl ${!isPaused ? 'animate-pulse' : ''}`}>
        {icon}
      </div>

      {/* Title */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
        <p className="text-gray-500 mt-1 max-w-xs">{description}</p>
      </div>

      {/* Countdown Display */}
      <div className="relative w-32 h-32">
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
            stroke={isBreak ? '#8b5cf6' : '#22c55e'}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 45}`}
            strokeDashoffset={`${2 * Math.PI * 45 * (1 - progress / 100)}`}
            className="transition-all duration-1000"
          />
        </svg>
        
        {/* Time Display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-gray-900">
            {timeRemaining}
          </span>
          <span className="text-xs text-gray-500">seconds</span>
        </div>
      </div>

      {/* Status Message */}
      <p className="text-sm text-gray-600">
        {isPaused ? (
          <span className="text-amber-600">⏸️ Countdown paused</span>
        ) : (
          <span>Auto-starting in {timeRemaining} seconds...</span>
        )}
      </p>

      {/* Action Buttons */}
      <div className="flex flex-col gap-3 w-full">
        {/* Primary: Start Now */}
        <Button
          variant="primary"
          size="lg"
          onClick={handleStartNow}
          className={`w-full ${isBreak ? 'bg-purple-600 hover:bg-purple-700' : 'bg-green-600 hover:bg-green-700'}`}
        >
          {isBreak ? '☕ Start Break Now' : '🎯 Start Focus Now'}
        </Button>

        {/* Secondary Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="md"
            onClick={togglePause}
            className="flex-1"
          >
            {isPaused ? '▶️ Resume' : '⏸️ Pause'}
          </Button>
          
          {onCancel && (
            <Button
              variant="outline"
              size="md"
              onClick={handleCancel}
              className="flex-1"
            >
              ✕ Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Info Text */}
      <p className="text-xs text-gray-400 text-center">
        {isBreak 
          ? 'Taking regular breaks helps maintain focus and prevents burnout.'
          : 'Consistent focus sessions build momentum and productivity.'}
      </p>
    </div>
  );
}
