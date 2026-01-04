'use client';

/**
 * Offline Mode Indicator Component
 * 
 * Displays "Offline Mode" status when the desktop app is disconnected from the server.
 * Shows a warning when offline for extended periods (>30 minutes).
 * 
 * Requirements: 9.4 - Display an "Offline Mode" indicator when disconnected
 * Requirements: 9.5 - Show a warning about limited functionality when offline for extended periods (>30 minutes)
 */

import { useState, useEffect, useCallback } from 'react';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

interface OfflineModeIndicatorProps {
  /** Current connection status */
  status?: ConnectionStatus;
  /** Timestamp when offline started (ms) */
  offlineSince?: number | null;
  /** Whether to show as a banner (full width) or compact indicator */
  variant?: 'banner' | 'compact';
  /** Callback when user clicks reconnect */
  onReconnect?: () => void;
  /** Number of pending events in offline queue */
  pendingEventsCount?: number;
}

// Extended offline threshold: 30 minutes in milliseconds
const EXTENDED_OFFLINE_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

/**
 * Compact offline indicator for header/toolbar
 * Requirements: 9.4
 */
export function OfflineModeCompact({
  status = 'disconnected',
  offlineSince,
  onReconnect,
}: OfflineModeIndicatorProps) {
  const [offlineDuration, setOfflineDuration] = useState<number>(0);

  // Update offline duration every second
  useEffect(() => {
    if (!offlineSince || status === 'connected') {
      setOfflineDuration(0);
      return;
    }

    const updateDuration = () => {
      setOfflineDuration(Date.now() - offlineSince);
    };

    updateDuration();
    const interval = setInterval(updateDuration, 1000);

    return () => clearInterval(interval);
  }, [offlineSince, status]);

  // Don't show if connected
  if (status === 'connected') {
    return null;
  }

  const isExtendedOffline = offlineDuration >= EXTENDED_OFFLINE_THRESHOLD_MS;
  const isReconnecting = status === 'reconnecting' || status === 'connecting';

  return (
    <div
      className={`
        inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium
        ${isExtendedOffline 
          ? 'bg-amber-100 text-amber-800 border border-amber-300' 
          : 'bg-gray-100 text-gray-700 border border-gray-300'
        }
        ${isReconnecting ? 'animate-pulse' : ''}
      `}
      title={isExtendedOffline 
        ? 'Extended offline - some features may be limited' 
        : 'Offline - using cached policy'
      }
    >
      <span className="flex-shrink-0">
        {isReconnecting ? '🔄' : isExtendedOffline ? '⚠️' : '📴'}
      </span>
      <span>
        {isReconnecting 
          ? 'Reconnecting...' 
          : `Offline${offlineDuration > 0 ? ` (${formatDuration(offlineDuration)})` : ''}`
        }
      </span>
      {!isReconnecting && onReconnect && (
        <button
          onClick={onReconnect}
          className="ml-1 text-blue-600 hover:text-blue-800 hover:underline text-xs"
        >
          Retry
        </button>
      )}
    </div>
  );
}

/**
 * Full-width offline mode banner
 * Requirements: 9.4, 9.5
 */
export function OfflineModeBanner({
  status = 'disconnected',
  offlineSince,
  onReconnect,
  pendingEventsCount = 0,
}: OfflineModeIndicatorProps) {
  const [offlineDuration, setOfflineDuration] = useState<number>(0);

  // Update offline duration every second
  useEffect(() => {
    if (!offlineSince || status === 'connected') {
      setOfflineDuration(0);
      return;
    }

    const updateDuration = () => {
      setOfflineDuration(Date.now() - offlineSince);
    };

    updateDuration();
    const interval = setInterval(updateDuration, 1000);

    return () => clearInterval(interval);
  }, [offlineSince, status]);

  // Don't show if connected
  if (status === 'connected') {
    return null;
  }

  const isExtendedOffline = offlineDuration >= EXTENDED_OFFLINE_THRESHOLD_MS;
  const isReconnecting = status === 'reconnecting' || status === 'connecting';

  return (
    <div
      className={`
        px-4 py-3 transition-colors duration-300
        ${isExtendedOffline 
          ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white' 
          : 'bg-gradient-to-r from-gray-600 to-gray-700 text-white'
        }
        ${isReconnecting ? 'animate-pulse' : ''}
      `}
    >
      <div className="flex items-center justify-between max-w-4xl mx-auto">
        {/* Left: Offline Mode Indicator - Requirements 9.4 */}
        <div className="flex items-center gap-3">
          <span className="text-2xl">
            {isReconnecting ? '🔄' : isExtendedOffline ? '⚠️' : '📴'}
          </span>
          <div>
            <span className="font-bold text-lg">OFFLINE MODE</span>
            <span className="text-white/80 text-sm ml-2">
              {isReconnecting 
                ? 'Attempting to reconnect...' 
                : 'Using cached policy'
              }
            </span>
          </div>
        </div>

        {/* Center: Duration and pending events */}
        <div className="flex items-center gap-4">
          {offlineDuration > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-white/80 text-sm">Duration:</span>
              <span className="font-mono font-bold">
                {formatDuration(offlineDuration)}
              </span>
            </div>
          )}
          {pendingEventsCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-white/80 text-sm">Pending:</span>
              <span className="font-mono font-bold">
                {pendingEventsCount} event{pendingEventsCount !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Right: Reconnect Button */}
        {!isReconnecting && onReconnect && (
          <button
            onClick={onReconnect}
            className="px-4 py-1.5 rounded-md border border-white/50 text-white hover:bg-white/20 hover:border-white text-sm font-medium transition-colors"
          >
            Reconnect
          </button>
        )}
      </div>

      {/* Extended offline warning - Requirements 9.5 */}
      {isExtendedOffline && !isReconnecting && (
        <div className="text-center mt-2 text-white/90 text-sm">
          ⚠️ You&apos;ve been offline for over 30 minutes. Some features may be limited.
          Events will sync when connection is restored.
        </div>
      )}
    </div>
  );
}

/**
 * Main offline mode indicator component
 * Automatically chooses between banner and compact based on variant prop
 */
export function OfflineModeIndicator(props: OfflineModeIndicatorProps) {
  const { variant = 'compact' } = props;

  if (variant === 'banner') {
    return <OfflineModeBanner {...props} />;
  }

  return <OfflineModeCompact {...props} />;
}

/**
 * Offline mode indicator with automatic status detection
 * Uses Electron IPC to get connection status
 */
export function OfflineModeIndicatorWithStatus({
  variant = 'compact',
}: {
  variant?: 'banner' | 'compact';
}) {
  const [status, setStatus] = useState<ConnectionStatus>('connected');
  const [offlineSince, setOfflineSince] = useState<number | null>(null);
  const [pendingEventsCount, setPendingEventsCount] = useState(0);

  useEffect(() => {
    // Check if running in Electron
    if (typeof window === 'undefined' || !window.vibeflow) {
      return;
    }

    // Get initial connection status
    const getInitialStatus = async () => {
      try {
        const connectionStatus = await window.vibeflow!.connection.getStatus();
        setStatus(connectionStatus);
        
        if (connectionStatus !== 'connected') {
          const info = await window.vibeflow!.connection.getInfo();
          if (info.lastConnectedAt) {
            setOfflineSince(info.lastConnectedAt);
          } else {
            setOfflineSince(Date.now());
          }
        }

        // Get pending events count
        const queueState = await window.vibeflow!.offlineQueue.getState();
        setPendingEventsCount(queueState.pendingCount);
      } catch (error) {
        console.error('[OfflineModeIndicator] Failed to get initial status:', error);
      }
    };

    getInitialStatus();

    // Listen for connection status changes
    const unsubscribe = window.vibeflow!.on.connectionStatusChange((event) => {
      setStatus(event.status);
      
      if (event.status !== 'connected' && !offlineSince) {
        setOfflineSince(event.timestamp);
      } else if (event.status === 'connected') {
        setOfflineSince(null);
      }
    });

    // Poll for pending events count
    const pollInterval = setInterval(async () => {
      try {
        const queueState = await window.vibeflow!.offlineQueue.getState();
        setPendingEventsCount(queueState.pendingCount);
      } catch {
        // Ignore errors during polling
      }
    }, 5000);

    return () => {
      unsubscribe();
      clearInterval(pollInterval);
    };
  }, [offlineSince]);

  const handleReconnect = useCallback(() => {
    if (typeof window !== 'undefined' && window.vibeflow) {
      window.vibeflow.connection.reconnect();
    }
  }, []);

  return (
    <OfflineModeIndicator
      variant={variant}
      status={status}
      offlineSince={offlineSince}
      onReconnect={handleReconnect}
      pendingEventsCount={pendingEventsCount}
    />
  );
}

export default OfflineModeIndicator;
