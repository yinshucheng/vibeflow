'use client';

/**
 * Demo Mode Banner Component
 * 
 * Displays a prominent banner when demo mode is active.
 * Shows "DEMO MODE" indicator, remaining time countdown, and exit button.
 * Requirements: 6.5, 6.6
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui';
import { trpc } from '@/lib/trpc';

interface DemoModeBannerProps {
  /** Callback when demo mode is exited */
  onExit?: () => void;
}

export function DemoModeBanner({ onExit }: DemoModeBannerProps) {
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  const utils = trpc.useUtils();

  // Get demo mode state - Requirements 6.5
  const { data: demoState, isLoading } = trpc.demoMode.getDemoModeState.useQuery(
    undefined,
    { refetchInterval: 30000 } // Refetch every 30 seconds
  );

  // Deactivate mutation - Requirements 6.6
  const deactivateMutation = trpc.demoMode.deactivateDemoMode.useMutation({
    onSuccess: () => {
      utils.demoMode.getDemoModeState.invalidate();
      utils.demoMode.getRemainingTokens.invalidate();
      setShowExitConfirm(false);
      onExit?.();
    },
  });

  // Calculate remaining seconds from state
  useEffect(() => {
    if (!demoState?.isActive || !demoState.expiresAt) {
      setRemainingSeconds(null);
      return;
    }

    const updateRemaining = () => {
      const now = new Date();
      const expiresAt = new Date(demoState.expiresAt!);
      const remaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
      setRemainingSeconds(remaining);

      // Auto-refresh state when expired
      if (remaining === 0) {
        utils.demoMode.getDemoModeState.invalidate();
      }
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);

    return () => clearInterval(interval);
  }, [demoState?.isActive, demoState?.expiresAt, utils.demoMode.getDemoModeState]);

  const handleExitClick = useCallback(() => {
    setShowExitConfirm(true);
  }, []);

  const handleConfirmExit = useCallback(async () => {
    try {
      await deactivateMutation.mutateAsync();
    } catch (error) {
      console.error('Failed to exit demo mode:', error);
    }
  }, [deactivateMutation]);

  const handleCancelExit = useCallback(() => {
    setShowExitConfirm(false);
  }, []);

  // Format remaining time
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Don't render if not in demo mode or loading
  if (isLoading || !demoState?.isActive) {
    return null;
  }

  // Exit confirmation dialog
  if (showExitConfirm) {
    return (
      <>
        {/* Banner still visible behind dialog */}
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-4 py-3">
          <div className="flex items-center justify-center gap-4">
            <span className="text-2xl">🎭</span>
            <span className="font-bold text-lg">DEMO MODE</span>
          </div>
        </div>

        {/* Exit confirmation dialog */}
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full mx-4 p-6">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                <span className="text-2xl">🎭</span>
              </div>
            </div>

            <h3 className="text-lg font-bold text-center text-gray-900 mb-2">
              Exit Demo Mode?
            </h3>

            <p className="text-center text-gray-600 text-sm mb-6">
              All enforcement features will be re-enabled immediately.
            </p>

            <div className="flex gap-3">
              <Button
                variant="outline"
                size="md"
                className="flex-1"
                onClick={handleCancelExit}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                className="flex-1 bg-purple-600 hover:bg-purple-700"
                onClick={handleConfirmExit}
                isLoading={deactivateMutation.isPending}
              >
                Exit Demo
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Determine urgency level based on remaining time
  const isUrgent = remainingSeconds !== null && remainingSeconds < 300; // Less than 5 minutes
  const isCritical = remainingSeconds !== null && remainingSeconds < 60; // Less than 1 minute

  return (
    <div 
      className={`
        text-white px-4 py-3 transition-colors duration-300
        ${isCritical 
          ? 'bg-gradient-to-r from-red-600 to-red-700 animate-pulse' 
          : isUrgent 
            ? 'bg-gradient-to-r from-amber-600 to-amber-700' 
            : 'bg-gradient-to-r from-purple-600 to-purple-700'
        }
      `}
    >
      <div className="flex items-center justify-between max-w-4xl mx-auto">
        {/* Left: Demo Mode Indicator - Requirements 6.5 */}
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎭</span>
          <div>
            <span className="font-bold text-lg">DEMO MODE</span>
            <span className="text-white/80 text-sm ml-2">
              Enforcement disabled
            </span>
          </div>
        </div>

        {/* Center: Countdown Timer - Requirements 6.6 */}
        <div className="flex items-center gap-2">
          <span className="text-white/80 text-sm">Remaining:</span>
          <span className={`font-mono font-bold text-lg ${isCritical ? 'animate-pulse' : ''}`}>
            {remainingSeconds !== null ? formatTime(remainingSeconds) : '--:--'}
          </span>
        </div>

        {/* Right: Exit Button */}
        <Button
          variant="outline"
          size="sm"
          className="border-white/50 text-white hover:bg-white/20 hover:border-white"
          onClick={handleExitClick}
        >
          Exit Demo
        </Button>
      </div>

      {/* Warning when time is running low */}
      {isUrgent && !isCritical && (
        <div className="text-center mt-2 text-white/90 text-sm">
          ⚠️ Demo mode will end soon. Save your presentation progress.
        </div>
      )}

      {isCritical && (
        <div className="text-center mt-2 text-white font-medium text-sm animate-pulse">
          ⚠️ Demo mode ending in less than 1 minute!
        </div>
      )}
    </div>
  );
}
