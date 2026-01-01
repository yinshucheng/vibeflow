'use client';

/**
 * FocusSessionControl Component
 * 
 * Controls for starting, ending, and extending ad-hoc focus sessions.
 * Displays remaining time when a session is active.
 * Handles sleep time override confirmation.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 7.1, 7.2, 7.3, 13.1, 13.2
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui';
import { trpc } from '@/lib/trpc';

// Preset durations in minutes (Requirements: 7.1)
const PRESET_DURATIONS = [
  { label: '30 min', value: 30 },
  { label: '1 hr', value: 60 },
  { label: '2 hr', value: 120 },
];

// Extension presets in minutes
const EXTENSION_PRESETS = [
  { label: '+15 min', value: 15 },
  { label: '+30 min', value: 30 },
  { label: '+1 hr', value: 60 },
];

interface FocusSessionControlProps {
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
  compact?: boolean;
}

export function FocusSessionControl({ 
  onSessionStart, 
  onSessionEnd,
  compact = false 
}: FocusSessionControlProps) {
  const [customDuration, setCustomDuration] = useState<number>(45);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [showExtendOptions, setShowExtendOptions] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  
  // Sleep time override confirmation state (Requirements: 13.1, 13.2)
  const [showSleepOverrideConfirm, setShowSleepOverrideConfirm] = useState(false);
  const [pendingDuration, setPendingDuration] = useState<number | null>(null);

  const utils = trpc.useUtils();

  // Get active session (Requirements: 5.1)
  const { data: activeSession, isLoading } = trpc.focusSession.getActiveSession.useQuery(
    undefined,
    { refetchInterval: 10000 } // Refetch every 10 seconds to stay in sync
  );

  // Get duration config
  const { data: durationConfig } = trpc.focusSession.getDurationConfig.useQuery();

  // Mutations
  const startMutation = trpc.focusSession.startSession.useMutation({
    onSuccess: () => {
      utils.focusSession.getActiveSession.invalidate();
      setShowCustomInput(false);
      setShowSleepOverrideConfirm(false);
      setPendingDuration(null);
      onSessionStart?.();
    },
    onError: (error) => {
      // Check if error is due to sleep time being active (Requirements: 13.1)
      if (error.message.includes('sleep time') || error.data?.code === 'PRECONDITION_FAILED') {
        setShowSleepOverrideConfirm(true);
      }
    },
  });

  const endMutation = trpc.focusSession.endSession.useMutation({
    onSuccess: () => {
      utils.focusSession.getActiveSession.invalidate();
      setTimeRemaining(0);
      setShowExtendOptions(false);
      onSessionEnd?.();
    },
  });

  const extendMutation = trpc.focusSession.extendSession.useMutation({
    onSuccess: () => {
      utils.focusSession.getActiveSession.invalidate();
      setShowExtendOptions(false);
    },
  });

  // Calculate remaining time from active session (Requirements: 5.1, 5.4)
  useEffect(() => {
    if (!activeSession) {
      setTimeRemaining(0);
      return;
    }

    const calculateRemaining = () => {
      const endTime = new Date(activeSession.plannedEndTime).getTime();
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
      setTimeRemaining(remaining);

      // Auto-refresh when session expires
      if (remaining === 0) {
        utils.focusSession.getActiveSession.invalidate();
      }
    };

    calculateRemaining();
    const interval = setInterval(calculateRemaining, 1000);

    return () => clearInterval(interval);
  }, [activeSession, utils.focusSession.getActiveSession]);

  // Format time as HH:MM:SS or MM:SS (Requirements: 5.1)
  const formatTime = useCallback((seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Calculate progress percentage
  const progress = useMemo(() => {
    if (!activeSession) return 0;
    const totalSeconds = activeSession.duration * 60;
    const elapsed = totalSeconds - timeRemaining;
    return Math.min(100, (elapsed / totalSeconds) * 100);
  }, [activeSession, timeRemaining]);

  // Handle start session (Requirements: 7.2)
  const handleStart = async (duration: number, overrideSleepTime = false) => {
    try {
      setPendingDuration(duration);
      await startMutation.mutateAsync({ duration, overrideSleepTime });
    } catch (error) {
      // Error handling is done in onError callback
      console.error('Failed to start focus session:', error);
    }
  };

  // Handle confirming sleep time override (Requirements: 13.2)
  const handleConfirmSleepOverride = async () => {
    if (pendingDuration !== null) {
      try {
        await startMutation.mutateAsync({ duration: pendingDuration, overrideSleepTime: true });
      } catch (error) {
        console.error('Failed to start focus session with sleep override:', error);
      }
    }
  };

  // Handle canceling sleep time override
  const handleCancelSleepOverride = () => {
    setShowSleepOverrideConfirm(false);
    setPendingDuration(null);
  };

  // Handle end session
  const handleEnd = async () => {
    try {
      await endMutation.mutateAsync();
    } catch (error) {
      console.error('Failed to end focus session:', error);
    }
  };

  // Handle extend session
  const handleExtend = async (additionalMinutes: number) => {
    try {
      await extendMutation.mutateAsync({ additionalMinutes });
    } catch (error) {
      console.error('Failed to extend focus session:', error);
    }
  };

  // Validate custom duration
  const isValidCustomDuration = useMemo(() => {
    if (!durationConfig) return false;
    return customDuration >= durationConfig.minSessionDuration && 
           customDuration <= durationConfig.maxSessionDuration;
  }, [customDuration, durationConfig]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-pulse text-gray-500">Loading...</div>
      </div>
    );
  }

  // Sleep time override confirmation dialog (Requirements: 13.1, 13.2)
  if (showSleepOverrideConfirm) {
    return (
      <div className={`flex flex-col items-center gap-4 ${compact ? 'py-4' : 'py-6'}`}>
        <div className="text-center">
          <span className="text-4xl">🌙</span>
          <h3 className="mt-2 font-medium text-gray-900">Sleep Time Active</h3>
          <p className="text-sm text-gray-500 mt-2 max-w-xs">
            You are currently in your configured sleep time. Starting a focus session will 
            temporarily override sleep enforcement.
          </p>
          <p className="text-xs text-amber-600 mt-2">
            This will be recorded in your exemption history.
          </p>
        </div>

        <div className="flex gap-3 mt-2">
          <Button
            variant="outline"
            size={compact ? 'sm' : 'md'}
            onClick={handleCancelSleepOverride}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size={compact ? 'sm' : 'md'}
            onClick={handleConfirmSleepOverride}
            disabled={startMutation.isPending}
            isLoading={startMutation.isPending}
          >
            Start Anyway ({pendingDuration} min)
          </Button>
        </div>
      </div>
    );
  }

  // Active session view (Requirements: 5.1, 5.2)
  if (activeSession) {
    return (
      <div className={`flex flex-col items-center gap-4 ${compact ? 'py-4' : 'py-6'}`}>
        {/* Session Active Indicator */}
        <div className="flex items-center gap-2 text-green-600">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
          <span className="text-sm font-medium">Focus Session Active</span>
          {activeSession.overridesSleepTime && (
            <span className="text-xs text-amber-600 ml-1">(overriding sleep time)</span>
          )}
        </div>

        {/* Timer Display */}
        <div className={`relative ${compact ? 'w-32 h-32' : 'w-48 h-48'}`}>
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
              stroke="#22c55e"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 45}`}
              strokeDashoffset={`${2 * Math.PI * 45 * (1 - progress / 100)}`}
              className="transition-all duration-1000"
            />
          </svg>

          {/* Time Display */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`font-bold text-gray-900 ${compact ? 'text-2xl' : 'text-4xl'}`}>
              {formatTime(timeRemaining)}
            </span>
            <span className="text-xs text-gray-500 mt-1">remaining</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col items-center gap-3">
          {/* Extend Options */}
          {showExtendOptions ? (
            <div className="flex flex-wrap justify-center gap-2">
              {EXTENSION_PRESETS.map((preset) => (
                <Button
                  key={preset.value}
                  variant="outline"
                  size="sm"
                  onClick={() => handleExtend(preset.value)}
                  disabled={extendMutation.isPending}
                >
                  {preset.label}
                </Button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowExtendOptions(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size={compact ? 'sm' : 'md'}
                onClick={() => setShowExtendOptions(true)}
              >
                ⏱️ Extend
              </Button>
              <Button
                variant="danger"
                size={compact ? 'sm' : 'md'}
                onClick={handleEnd}
                disabled={endMutation.isPending}
                isLoading={endMutation.isPending}
              >
                ⏹️ End Session
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Start session view (Requirements: 5.3, 7.1, 7.2, 7.3)
  return (
    <div className={`flex flex-col items-center gap-4 ${compact ? 'py-4' : 'py-6'}`}>
      {/* Icon and Title */}
      <div className="text-center">
        <span className="text-4xl">🎯</span>
        <h3 className="mt-2 font-medium text-gray-900">Start Focus Session</h3>
        <p className="text-sm text-gray-500">Block distractions and stay focused</p>
      </div>

      {/* Preset Duration Buttons (Requirements: 7.1, 7.2) */}
      <div className="flex flex-wrap justify-center gap-2">
        {PRESET_DURATIONS.map((preset) => (
          <Button
            key={preset.value}
            variant="outline"
            size={compact ? 'sm' : 'md'}
            onClick={() => handleStart(preset.value)}
            disabled={startMutation.isPending}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      {/* Custom Duration Input (Requirements: 7.3) */}
      {showCustomInput ? (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={durationConfig?.minSessionDuration ?? 15}
            max={durationConfig?.maxSessionDuration ?? 240}
            value={customDuration}
            onChange={(e) => setCustomDuration(parseInt(e.target.value) || 0)}
            className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="min"
          />
          <span className="text-sm text-gray-500">minutes</span>
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleStart(customDuration)}
            disabled={!isValidCustomDuration || startMutation.isPending}
            isLoading={startMutation.isPending}
          >
            Start
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCustomInput(false)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <button
          onClick={() => setShowCustomInput(true)}
          className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
        >
          Custom duration...
        </button>
      )}

      {/* Duration hint */}
      {durationConfig && (
        <p className="text-xs text-gray-400">
          {durationConfig.minSessionDuration}-{durationConfig.maxSessionDuration} minutes
        </p>
      )}

      {/* Error display */}
      {startMutation.error && !showSleepOverrideConfirm && (
        <p className="text-sm text-red-600">
          {startMutation.error.message}
        </p>
      )}
    </div>
  );
}
