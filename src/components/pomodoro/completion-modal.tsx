'use client';

/**
 * Pomodoro Completion Modal
 * 
 * Full-screen modal requiring manual confirmation when pomodoro completes.
 * Supports auto-start break after completion.
 * Requirements: 4.5, 4.6, 7.1, 7.3, 7.5, 7.6
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/components/ui';
import { trpc } from '@/lib/trpc';
import { AutoStartCountdown } from './auto-start-countdown';
import { NotificationSoundType, playSound } from '@/services/notification.service';

interface PomodoroCompletionModalProps {
  pomodoroId: string;
  taskTitle: string;
  onConfirm: () => void;
  /** Callback to start break mode */
  onStartBreak?: () => void;
}

// Time slice summary bar component
function TimeDistributionBar({ breakdown }: { breakdown: Array<{ taskName: string | null; percentage: number }> }) {
  const colors = ['bg-green-500', 'bg-blue-500', 'bg-amber-500', 'bg-purple-500', 'bg-pink-500'];
  return (
    <div className="w-full">
      <div className="flex h-3 rounded-full overflow-hidden bg-gray-200">
        {breakdown.map((item, idx) => (
          <div
            key={idx}
            className={`${colors[idx % colors.length]}`}
            style={{ width: `${item.percentage}%` }}
            title={`${item.taskName ?? 'Taskless'}: ${item.percentage}%`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mt-2 text-xs">
        {breakdown.map((item, idx) => (
          <div key={idx} className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${colors[idx % colors.length]}`} />
            <span className="text-gray-600">{item.taskName ?? 'Taskless'} ({item.percentage}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PomodoroCompletionModal({
  pomodoroId,
  taskTitle,
  onConfirm,
  onStartBreak,
}: PomodoroCompletionModalProps) {
  const [summary, setSummary] = useState('');
  const [showConfetti, setShowConfetti] = useState(true);
  const [showAutoStartCountdown, setShowAutoStartCountdown] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isWaitingForConfirmation, setIsWaitingForConfirmation] = useState(false);
  const confirmationSoundIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasPlayedInitialSound = useRef(false);

  // Get user settings for auto-start config
  const { data: settings } = trpc.settings.get.useQuery();

  // Get time slice summary for multi-task display (Req 4)
  const { data: sliceSummary } = trpc.pomodoro.getSummary.useQuery(
    { id: pomodoroId },
    { enabled: !!pomodoroId }
  );

  // Get auto-start settings with type assertion
  const autoStartSettings = useMemo(() => {
    const s = settings as {
      autoStartBreak?: boolean;
      autoStartCountdown?: number;
      notificationSound?: string;
    } | undefined;
    return {
      autoStartBreak: s?.autoStartBreak ?? false,
      autoStartCountdown: s?.autoStartCountdown ?? 5,
      notificationSound: (s?.notificationSound as NotificationSoundType) ?? 'gentle',
    };
  }, [settings]);

  const completeMutation = trpc.pomodoro.complete.useMutation({
    onSuccess: () => {
      setIsCompleted(true);
      // Check if auto-start break is enabled (Requirements 7.1, 7.5)
      if (autoStartSettings.autoStartBreak && onStartBreak) {
        setShowAutoStartCountdown(true);
      } else {
        // Auto-start disabled - show manual confirmation (Requirements 7.3, 7.6)
        setIsWaitingForConfirmation(true);
      }
    },
  });

  // Play completion sound and show confetti effect
  useEffect(() => {
    // Hide confetti after animation
    const timer = setTimeout(() => setShowConfetti(false), 3000);
    return () => clearTimeout(timer);
  }, []);

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

  // Cleanup sound interval on unmount
  useEffect(() => {
    return () => {
      if (confirmationSoundIntervalRef.current) {
        clearInterval(confirmationSoundIntervalRef.current);
      }
    };
  }, []);

  const handleConfirm = async () => {
    try {
      await completeMutation.mutateAsync({
        id: pomodoroId,
        summary: summary.trim() || undefined,
      });
    } catch (error) {
      console.error('Failed to complete pomodoro:', error);
    }
  };

  // Handle manual start break (Requirements 7.3)
  const handleManualStartBreak = useCallback(() => {
    // Stop confirmation sound
    if (confirmationSoundIntervalRef.current) {
      clearInterval(confirmationSoundIntervalRef.current);
      confirmationSoundIntervalRef.current = null;
    }
    setIsWaitingForConfirmation(false);
    onStartBreak?.();
    onConfirm();
  }, [onStartBreak, onConfirm]);

  // Handle skip break (go back to planning)
  const handleSkipBreak = useCallback(() => {
    // Stop confirmation sound
    if (confirmationSoundIntervalRef.current) {
      clearInterval(confirmationSoundIntervalRef.current);
      confirmationSoundIntervalRef.current = null;
    }
    setIsWaitingForConfirmation(false);
    onConfirm();
  }, [onConfirm]);

  // Handle auto-start break (Requirements 7.1, 7.5)
  const handleAutoStartBreak = useCallback(() => {
    setShowAutoStartCountdown(false);
    onStartBreak?.();
    onConfirm();
  }, [onStartBreak, onConfirm]);

  // Handle cancel auto-start - show manual confirmation instead
  const handleCancelAutoStart = useCallback(() => {
    setShowAutoStartCountdown(false);
    setIsWaitingForConfirmation(true);
  }, []);

  // Show auto-start countdown if enabled and pomodoro is completed
  if (showAutoStartCountdown && isCompleted) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <AutoStartCountdown
          countdownSeconds={autoStartSettings.autoStartCountdown}
          nextPhase="break"
          soundType={autoStartSettings.notificationSound}
          onStart={handleAutoStartBreak}
          onCancel={handleCancelAutoStart}
        />
      </div>
    );
  }

  // Show manual confirmation for break (Requirements 7.3, 7.6)
  if (isWaitingForConfirmation && isCompleted) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 animate-scale-in">
          {/* Success Icon with pulse animation */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center animate-pulse">
              <span className="text-4xl">☕</span>
            </div>
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">
            Time for a Break!
          </h2>
          
          {/* Task Info */}
          <p className="text-center text-gray-600 mb-6">
            Great work on <span className="font-medium text-gray-900">{taskTitle}</span>
          </p>

          {/* Notification indicator */}
          <div className="text-center mb-6 animate-pulse">
            <p className="text-purple-600 font-medium">
              🔔 Click to start your break
            </p>
          </div>

          {/* Action Buttons (Requirements 7.3) */}
          <div className="flex flex-col gap-3">
            {/* Primary: Start Break button */}
            <Button
              variant="primary"
              size="lg"
              className="w-full bg-purple-600 hover:bg-purple-700"
              onClick={handleManualStartBreak}
            >
              ☕ Start Break
            </Button>

            {/* Secondary: Skip break */}
            <Button
              variant="outline"
              size="md"
              className="w-full"
              onClick={handleSkipBreak}
            >
              Skip Break
            </Button>
          </div>

          {/* Info text */}
          <p className="text-center text-sm text-gray-500 mt-4">
            Taking regular breaks helps maintain focus and prevents burnout.
          </p>
        </div>

        {/* CSS for animations */}
        <style jsx global>{`
          @keyframes scale-in {
            0% {
              transform: scale(0.9);
              opacity: 0;
            }
            100% {
              transform: scale(1);
              opacity: 1;
            }
          }
          
          .animate-scale-in {
            animation: scale-in 0.3s ease-out forwards;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      {/* Confetti Animation */}
      {showConfetti && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute animate-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                top: '-10%',
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${2 + Math.random() * 2}s`,
              }}
            >
              <div
                className="w-3 h-3 rounded-sm"
                style={{
                  backgroundColor: ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'][
                    Math.floor(Math.random() * 5)
                  ],
                  transform: `rotate(${Math.random() * 360}deg)`,
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Modal Content */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 animate-scale-in">
        {/* Success Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
            <span className="text-4xl">🎉</span>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">
          Focus Session Complete!
        </h2>
        
        {/* Task Info */}
        <p className="text-center text-gray-600 mb-6">
          Great work on <span className="font-medium text-gray-900">{taskTitle}</span>
        </p>

        {/* Time Distribution (multi-task only) */}
        {sliceSummary && sliceSummary.taskBreakdown && sliceSummary.taskBreakdown.length > 1 && (
          <div className="mb-6">
            <p className="text-sm font-medium text-gray-700 mb-2">Time Distribution</p>
            <TimeDistributionBar breakdown={sliceSummary.taskBreakdown} />
            {sliceSummary.switchCount > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                {sliceSummary.switchCount} task switch{sliceSummary.switchCount > 1 ? 'es' : ''}
              </p>
            )}
          </div>
        )}

        {/* Summary Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            What did you accomplish? (optional)
          </label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Brief summary of your progress..."
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
            rows={3}
            maxLength={1000}
          />
          <div className="text-xs text-gray-400 text-right mt-1">
            {summary.length}/1000
          </div>
        </div>

        {/* Confirm Button */}
        <Button
          variant="primary"
          size="lg"
          className="w-full bg-green-600 hover:bg-green-700"
          onClick={handleConfirm}
          isLoading={completeMutation.isPending}
          disabled={completeMutation.isPending}
        >
          ✓ Confirm & Take a Break
        </Button>

        {/* Motivational Quote */}
        <p className="text-center text-sm text-gray-500 mt-4 italic">
          &quot;Small steps lead to big achievements.&quot;
        </p>
      </div>

      {/* CSS for animations */}
      <style jsx global>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
        
        @keyframes scale-in {
          0% {
            transform: scale(0.9);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        
        .animate-confetti {
          animation: confetti-fall linear forwards;
        }
        
        .animate-scale-in {
          animation: scale-in 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
