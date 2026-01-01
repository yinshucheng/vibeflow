'use client';

/**
 * Intervention Modal Component
 * 
 * Displays a full-screen modal when focus enforcement triggers an intervention.
 * Provides options to start a pomodoro, skip, or delay the intervention.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.5
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { trpc } from '@/lib/trpc';

interface InterventionModalProps {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Callback when user starts a pomodoro */
  onStartPomodoro?: () => void;
  /** Callback when user skips the intervention */
  onSkip?: (remaining: number) => void;
  /** Callback when user delays the intervention */
  onDelay?: (minutes: number, remaining: number) => void;
  /** Idle time in seconds that triggered the intervention */
  idleSeconds?: number;
  /** Source of the intervention */
  source?: 'idle' | 'distraction' | 'browser';
}

/**
 * Format seconds to human-readable duration
 */
function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) {
    return 'less than a minute';
  }
  if (minutes === 1) {
    return '1 minute';
  }
  if (minutes < 60) {
    return `${minutes} minutes`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 1) {
    return remainingMinutes > 0 
      ? `1 hour and ${remainingMinutes} minutes`
      : '1 hour';
  }
  return remainingMinutes > 0
    ? `${hours} hours and ${remainingMinutes} minutes`
    : `${hours} hours`;
}

export function InterventionModal({
  isOpen,
  onClose,
  onStartPomodoro,
  onSkip,
  onDelay,
  idleSeconds = 0,
  source = 'idle',
}: InterventionModalProps) {
  const router = useRouter();
  const [delayMinutes, setDelayMinutes] = useState(5);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Get skip token status
  const { data: tokenStatus, refetch: refetchStatus } = trpc.skipToken.getStatus.useQuery();
  
  // Consume skip token mutation
  const consumeMutation = trpc.skipToken.consume.useMutation({
    onSuccess: () => {
      refetchStatus();
    },
  });

  // Reset delay minutes when modal opens based on max delay
  useEffect(() => {
    if (isOpen && tokenStatus?.maxDelayMinutes) {
      setDelayMinutes(Math.min(5, tokenStatus.maxDelayMinutes));
    }
  }, [isOpen, tokenStatus?.maxDelayMinutes]);

  // Handle start pomodoro
  const handleStartPomodoro = useCallback(() => {
    onClose();
    if (onStartPomodoro) {
      onStartPomodoro();
    } else {
      router.push('/pomodoro');
    }
  }, [onClose, onStartPomodoro, router]);

  // Handle skip (Requirements 5.2)
  const handleSkip = useCallback(async () => {
    if (!tokenStatus || tokenStatus.remaining <= 0) return;
    
    setIsProcessing(true);
    try {
      const result = await consumeMutation.mutateAsync({ action: 'skip' });
      if (result?.success) {
        onClose();
        onSkip?.(result.remaining);
      }
    } catch (error) {
      console.error('Failed to skip intervention:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [tokenStatus, consumeMutation, onClose, onSkip]);

  // Handle delay (Requirements 5.3)
  const handleDelay = useCallback(async () => {
    if (!tokenStatus || tokenStatus.remaining <= 0) return;
    
    setIsProcessing(true);
    try {
      const result = await consumeMutation.mutateAsync({ 
        action: 'delay',
        delayMinutes,
      });
      if (result?.success) {
        onClose();
        onDelay?.(result.delayMinutes ?? delayMinutes, result.remaining);
      }
    } catch (error) {
      console.error('Failed to delay intervention:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [tokenStatus, consumeMutation, delayMinutes, onClose, onDelay]);

  if (!isOpen) {
    return null;
  }

  const canSkipOrDelay = tokenStatus && tokenStatus.remaining > 0;
  const maxDelay = tokenStatus?.maxDelayMinutes ?? 15;
  const isStrict = tokenStatus?.enforcementMode === 'strict';

  // Get title and message based on source
  const getContent = () => {
    switch (source) {
      case 'distraction':
        return {
          icon: '📱',
          title: 'Distraction Detected!',
          message: 'A distracting app was detected during work hours.',
        };
      case 'browser':
        return {
          icon: '🌐',
          title: 'Focus Reminder',
          message: 'You visited a blocked website during work hours.',
        };
      default:
        return {
          icon: '⏰',
          title: 'Time to Focus!',
          message: idleSeconds > 0 
            ? `You've been idle for ${formatDuration(idleSeconds)} during work hours.`
            : 'It\'s time to start a focus session.',
        };
    }
  };

  const content = getContent();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      {/* Pulsing background effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-red-500/10 animate-pulse" />
      
      {/* Modal Content */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 animate-scale-in">
        {/* Alert Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center animate-bounce">
            <span className="text-4xl">{content.icon}</span>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">
          {content.title}
        </h2>
        
        {/* Message */}
        <p className="text-center text-gray-600 mb-4">
          {content.message}
        </p>

        {/* Skip Token Status (Requirements 5.4) */}
        <div className="bg-gray-50 rounded-lg p-3 mb-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Skip tokens remaining:</span>
            <span className={`font-semibold ${
              tokenStatus?.remaining === 0 ? 'text-red-600' : 'text-orange-600'
            }`}>
              {tokenStatus?.remaining ?? 0} / {tokenStatus?.dailyLimit ?? 0}
            </span>
          </div>
          {isStrict && (
            <p className="text-xs text-gray-500 mt-1">
              Strict mode: Limited to {tokenStatus?.dailyLimit} skip per day
            </p>
          )}
        </div>

        {/* Primary Action - Start Pomodoro */}
        <Button
          variant="primary"
          size="lg"
          className="w-full bg-orange-600 hover:bg-orange-700 mb-3"
          onClick={handleStartPomodoro}
        >
          🍅 Start a Pomodoro
        </Button>

        {/* Skip Button (Requirements 5.2, 5.5) */}
        <Button
          variant="outline"
          size="md"
          className="w-full mb-3"
          onClick={handleSkip}
          disabled={!canSkipOrDelay || isProcessing}
          isLoading={isProcessing && consumeMutation.variables?.action === 'skip'}
        >
          {canSkipOrDelay ? '⏭️ Skip this reminder' : '❌ No skip tokens left'}
        </Button>

        {/* Delay Options (Requirements 5.3) */}
        <div className="flex items-center gap-2 mb-4">
          <Button
            variant="outline"
            size="md"
            className="flex-1"
            onClick={handleDelay}
            disabled={!canSkipOrDelay || isProcessing}
            isLoading={isProcessing && consumeMutation.variables?.action === 'delay'}
          >
            ⏱️ Delay {delayMinutes} min
          </Button>
          <select
            value={delayMinutes}
            onChange={(e) => setDelayMinutes(Number(e.target.value))}
            disabled={!canSkipOrDelay}
            className="px-2 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50"
          >
            {[5, 10, 15, 20, 30].filter(m => m <= maxDelay).map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} min
              </option>
            ))}
          </select>
        </div>

        {/* Token exhausted message (Requirements 5.5) */}
        {!canSkipOrDelay && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-red-700 text-center">
              You&apos;ve used all your skip tokens for today. 
              Start a pomodoro to stay focused!
            </p>
          </div>
        )}

        {/* Motivational message */}
        <div className="bg-orange-50 rounded-lg p-3">
          <p className="text-sm text-orange-800 text-center italic">
            &quot;The secret of getting ahead is getting started.&quot;
          </p>
        </div>

        {/* Work hours info */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400 text-center">
            This reminder appears during your configured work hours.
            <br />
            Tokens reset at midnight.
          </p>
        </div>
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

export default InterventionModal;
