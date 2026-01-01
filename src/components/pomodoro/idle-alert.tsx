'use client';

/**
 * Idle Alert Component
 * 
 * Displays a full-screen overlay when the user has been idle too long
 * during work hours without an active pomodoro.
 * 
 * Requirements: 5.6
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { 
  getIdleService, 
  type IdleAlertEvent,
  type IdleConfig,
} from '@/services/idle.service';
import { notifyIdleAlert } from '@/services/notification.service';
import { trpc } from '@/lib/trpc';

interface IdleAlertProps {
  /** Whether the idle alert system is enabled */
  enabled?: boolean;
  /** Callback when user dismisses the alert */
  onDismiss?: () => void;
  /** Callback when user starts a pomodoro */
  onStartPomodoro?: () => void;
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

export function IdleAlert({ 
  enabled = true, 
  onDismiss, 
  onStartPomodoro 
}: IdleAlertProps) {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(false);
  const [alertEvent, setAlertEvent] = useState<IdleAlertEvent | null>(null);
  const [snoozeMinutes, setSnoozeMinutes] = useState(5);
  
  // Get user settings for idle configuration
  const { data: settings } = trpc.settings.get.useQuery();
  
  // Get current pomodoro state
  const { data: currentPomodoro } = trpc.pomodoro.getCurrent.useQuery();
  
  // Initialize idle service with settings
  useEffect(() => {
    if (!enabled || !settings) return;
    
    const s = settings as {
      workTimeSlots?: unknown;
      maxIdleMinutes?: number;
      idleAlertActions?: string[];
    };
    
    // Parse work time slots
    let workTimeSlots: IdleConfig['workTimeSlots'] = [];
    if (s.workTimeSlots) {
      if (typeof s.workTimeSlots === 'string') {
        try {
          workTimeSlots = JSON.parse(s.workTimeSlots);
        } catch {
          // Use empty array
        }
      } else if (Array.isArray(s.workTimeSlots)) {
        workTimeSlots = s.workTimeSlots;
      }
    }
    
    const idleService = getIdleService({
      workTimeSlots,
      maxIdleMinutes: s.maxIdleMinutes ?? 15,
      idleAlertActions: (s.idleAlertActions as IdleConfig['idleAlertActions']) ?? ['show_overlay'],
    });
    
    // Update pomodoro state
    idleService.setPomodoroActive(!!currentPomodoro);
    
    // Subscribe to idle alerts
    const unsubscribe = idleService.onIdleAlert((event) => {
      setAlertEvent(event);
      
      // Check which actions to perform
      if (event.actions.includes('show_overlay')) {
        setIsVisible(true);
      }
      
      if (event.actions.includes('browser_notification')) {
        notifyIdleAlert({
          enabled: true,
          soundEnabled: true,
          soundType: 'gentle',
          flashTab: true,
        });
      }
      
      if (event.actions.includes('open_pomodoro_page')) {
        router.push('/pomodoro');
      }
    });
    
    // Start idle detection
    idleService.start();
    
    return () => {
      unsubscribe();
      idleService.stop();
    };
  }, [enabled, settings, currentPomodoro, router]);
  
  // Update pomodoro state when it changes
  useEffect(() => {
    if (!enabled) return;
    
    const idleService = getIdleService();
    idleService.setPomodoroActive(!!currentPomodoro);
    
    // Hide alert if pomodoro becomes active
    if (currentPomodoro) {
      setIsVisible(false);
    }
  }, [enabled, currentPomodoro]);
  
  // Handle dismiss
  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    const idleService = getIdleService();
    idleService.recordActivity();
    onDismiss?.();
  }, [onDismiss]);
  
  // Handle snooze
  const handleSnooze = useCallback(() => {
    setIsVisible(false);
    const idleService = getIdleService();
    
    // Record activity to reset idle timer
    idleService.recordActivity();
    
    // Schedule re-alert after snooze period
    setTimeout(() => {
      idleService.resetAlert();
    }, snoozeMinutes * 60 * 1000);
    
    onDismiss?.();
  }, [snoozeMinutes, onDismiss]);
  
  // Handle start pomodoro
  const handleStartPomodoro = useCallback(() => {
    setIsVisible(false);
    const idleService = getIdleService();
    idleService.recordActivity();
    
    if (onStartPomodoro) {
      onStartPomodoro();
    } else {
      router.push('/pomodoro');
    }
  }, [onStartPomodoro, router]);
  
  if (!isVisible || !alertEvent) {
    return null;
  }
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      {/* Pulsing background effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-red-500/10 animate-pulse" />
      
      {/* Modal Content */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 animate-scale-in">
        {/* Alert Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center animate-bounce">
            <span className="text-4xl">⏰</span>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">
          Time to Focus!
        </h2>
        
        {/* Message */}
        <p className="text-center text-gray-600 mb-6">
          You&apos;ve been idle for{' '}
          <span className="font-semibold text-orange-600">
            {formatDuration(alertEvent.idleSeconds)}
          </span>{' '}
          during work hours.
        </p>
        
        {/* Motivational message */}
        <div className="bg-orange-50 rounded-lg p-4 mb-6">
          <p className="text-sm text-orange-800 text-center italic">
            &quot;The secret of getting ahead is getting started.&quot;
          </p>
        </div>

        {/* Primary Action */}
        <Button
          variant="primary"
          size="lg"
          className="w-full bg-orange-600 hover:bg-orange-700 mb-3"
          onClick={handleStartPomodoro}
        >
          🍅 Start a Pomodoro
        </Button>
        
        {/* Snooze Options */}
        <div className="flex items-center gap-2 mb-3">
          <Button
            variant="outline"
            size="md"
            className="flex-1"
            onClick={handleSnooze}
          >
            💤 Snooze for {snoozeMinutes} min
          </Button>
          <select
            value={snoozeMinutes}
            onChange={(e) => setSnoozeMinutes(Number(e.target.value))}
            className="px-2 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value={5}>5 min</option>
            <option value={10}>10 min</option>
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
          </select>
        </div>
        
        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          className="w-full text-sm text-gray-500 hover:text-gray-700 py-2"
        >
          Dismiss for now
        </button>
        
        {/* Work hours info */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400 text-center">
            This alert appears during your configured work hours when no pomodoro is active.
            <br />
            Adjust settings in <a href="/settings" className="text-orange-500 hover:underline">Settings</a>.
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

export default IdleAlert;
