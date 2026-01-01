'use client';

/**
 * ConnectionIndicator Component
 * 
 * Displays the connection status to the VibeFlow server with visual indicators.
 * Shows reconnection progress, security status, and allows manual reconnection.
 * 
 * Requirements: 1.7 - Display connection status indicator and retry automatically
 * Requirements: 9.4, 9.5, 9.6 - Display secure connection status
 */

import { useState, useEffect, useCallback } from 'react';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

interface ConnectionIndicatorProps {
  status?: ConnectionStatus;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onReconnect?: () => void;
  reconnectAttempt?: number;
  maxReconnectAttempts?: number;
  nextRetryIn?: number | null;
  error?: string | null;
  isSecure?: boolean;
}

const statusConfig: Record<ConnectionStatus, {
  icon: string;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  pulse: boolean;
}> = {
  disconnected: {
    icon: '🔌',
    label: 'Disconnected',
    color: 'text-gray-500',
    bgColor: 'bg-gray-100',
    borderColor: 'border-gray-300',
    pulse: false,
  },
  connecting: {
    icon: '🔄',
    label: 'Connecting...',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-300',
    pulse: true,
  },
  connected: {
    icon: '✓',
    label: 'Connected',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-300',
    pulse: false,
  },
  reconnecting: {
    icon: '🔄',
    label: 'Reconnecting...',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-300',
    pulse: true,
  },
  error: {
    icon: '⚠️',
    label: 'Connection Error',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-300',
    pulse: false,
  },
};

const sizeClasses = {
  sm: 'text-xs px-2 py-0.5 gap-1',
  md: 'text-sm px-3 py-1 gap-1.5',
  lg: 'text-base px-4 py-2 gap-2',
};

export function ConnectionIndicator({
  status = 'disconnected',
  showLabel = true,
  size = 'md',
  onReconnect,
  reconnectAttempt,
  maxReconnectAttempts,
  nextRetryIn,
  error,
  isSecure,
}: ConnectionIndicatorProps) {
  const config = statusConfig[status];
  const [countdown, setCountdown] = useState<number | null>(null);

  // Handle countdown for reconnection
  useEffect(() => {
    if (status === 'reconnecting' && nextRetryIn && nextRetryIn > 0) {
      setCountdown(Math.ceil(nextRetryIn / 1000));
      
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            return null;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    } else {
      setCountdown(null);
    }
  }, [status, nextRetryIn]);

  // Build label text
  const getLabelText = useCallback(() => {
    if (status === 'reconnecting' && reconnectAttempt && maxReconnectAttempts) {
      const countdownText = countdown ? ` (${countdown}s)` : '';
      return `Reconnecting ${reconnectAttempt}/${maxReconnectAttempts}${countdownText}`;
    }
    return config.label;
  }, [status, reconnectAttempt, maxReconnectAttempts, countdown, config.label]);

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-2">
        <div
          className={`
            inline-flex items-center rounded-full border font-medium
            ${sizeClasses[size]}
            ${config.bgColor}
            ${config.color}
            ${config.borderColor}
            ${config.pulse ? 'animate-pulse' : ''}
          `}
          title={error || config.label}
        >
          <span className="flex-shrink-0">{config.icon}</span>
          {showLabel && <span>{getLabelText()}</span>}
        </div>

        {/* Security indicator (Requirements: 9.4, 9.5, 9.6) */}
        {status === 'connected' && isSecure !== undefined && (
          <div
            className={`
              inline-flex items-center gap-1 text-xs
              ${isSecure ? 'text-green-600' : 'text-yellow-600'}
            `}
            title={isSecure ? 'Secure connection (WSS)' : 'Insecure connection (WS)'}
          >
            <span>{isSecure ? '🔒' : '🔓'}</span>
            <span className="hidden sm:inline">{isSecure ? 'Secure' : 'Insecure'}</span>
          </div>
        )}
      </div>

      {/* Error message and reconnect button */}
      {status === 'error' && (
        <div className="flex flex-col gap-1 text-xs">
          {error && (
            <span className="text-red-500 max-w-[200px] truncate" title={error}>
              {error}
            </span>
          )}
          {onReconnect && (
            <button
              onClick={onReconnect}
              className="text-blue-600 hover:text-blue-800 hover:underline"
            >
              Try reconnecting
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * ConnectionIndicatorWithSocket - Auto-updates based on socket connection
 * Uses the useSocket hook to track connection status
 */
export function ConnectionIndicatorWithSocket() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [nextRetryIn, setNextRetryIn] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSecure, setIsSecure] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    // Check if running in Electron
    if (typeof window !== 'undefined' && window.vibeflow) {
      // Listen for connection status changes from Electron
      const handleStatusChange = (event: CustomEvent<{
        status: ConnectionStatus;
        error?: string;
        attemptNumber?: number;
        nextRetryIn?: number;
      }>) => {
        const { status: newStatus, error: newError, attemptNumber, nextRetryIn: retry } = event.detail;
        setStatus(newStatus);
        setError(newError ?? null);
        setReconnectAttempt(attemptNumber ?? 0);
        setNextRetryIn(retry ?? null);
      };

      window.addEventListener('vibeflow:connectionChange', handleStatusChange as EventListener);

      // Get initial security status
      window.vibeflow.connection.isSecure().then(setIsSecure).catch(() => setIsSecure(undefined));

      return () => {
        window.removeEventListener('vibeflow:connectionChange', handleStatusChange as EventListener);
      };
    }

    // For web app, use socket connection status
    // This will be connected to the actual socket status
    setStatus('connected'); // Default to connected for web app
  }, []);

  const handleReconnect = useCallback(() => {
    if (typeof window !== 'undefined' && window.vibeflow) {
      // Trigger reconnection via Electron IPC
      window.vibeflow.connection.reconnect();
    }
  }, []);

  return (
    <ConnectionIndicator
      status={status}
      reconnectAttempt={reconnectAttempt}
      maxReconnectAttempts={10}
      nextRetryIn={nextRetryIn}
      error={error}
      isSecure={isSecure}
      onReconnect={status === 'error' ? handleReconnect : undefined}
    />
  );
}

/**
 * Compact connection dot indicator for header/toolbar
 */
export function ConnectionDot({ status = 'disconnected' }: { status?: ConnectionStatus }) {
  const dotColors: Record<ConnectionStatus, string> = {
    disconnected: 'bg-gray-400',
    connecting: 'bg-yellow-400 animate-pulse',
    connected: 'bg-green-500',
    reconnecting: 'bg-orange-400 animate-pulse',
    error: 'bg-red-500',
  };

  const tooltips: Record<ConnectionStatus, string> = {
    disconnected: 'Disconnected from server',
    connecting: 'Connecting to server...',
    connected: 'Connected to server',
    reconnecting: 'Reconnecting to server...',
    error: 'Connection error',
  };

  return (
    <div
      className={`w-2 h-2 rounded-full ${dotColors[status]}`}
      title={tooltips[status]}
    />
  );
}

export default ConnectionIndicator;
