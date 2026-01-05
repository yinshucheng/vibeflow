/**
 * App Provider
 *
 * Initializes core services and provides app-wide context.
 * - Initializes WebSocket connection
 * - Starts heartbeat service
 * - Connects sync service to store
 *
 * Requirements: 2.1, 2.2, 2.3
 */

import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { syncService, heartbeatService, websocketService } from '@/services';
import { useAppStore } from '@/store';
import { DEV_USER_EMAIL } from '@/config/auth';

interface AppProviderProps {
  children: React.ReactNode;
}

export function AppProvider({ children }: AppProviderProps): React.JSX.Element {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const setUserInfo = useAppStore((state) => state.setUserInfo);

  useEffect(() => {
    // Set default user info for MVP
    setUserInfo('dev-user', DEV_USER_EMAIL);

    // Initialize sync service (connects WebSocket events to store)
    syncService.initialize({ autoConnect: true });

    // Start heartbeat service
    heartbeatService.start();

    // Handle app state changes (background/foreground)
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Cleanup on unmount
    return () => {
      subscription.remove();
      heartbeatService.stop();
      syncService.cleanup();
    };
  }, [setUserInfo]);

  /**
   * Handle app state changes.
   * Maintains connection for up to 3 minutes in background.
   */
  const handleAppStateChange = (nextAppState: AppStateStatus): void => {
    if (
      appStateRef.current.match(/inactive|background/) &&
      nextAppState === 'active'
    ) {
      // App came to foreground
      console.log('App came to foreground');
      
      // Reconnect if disconnected
      if (!websocketService.isConnected()) {
        websocketService.connect();
      }
      
      // Resume heartbeat
      heartbeatService.start();
    } else if (
      appStateRef.current === 'active' &&
      nextAppState.match(/inactive|background/)
    ) {
      // App went to background
      console.log('App went to background');
      
      // Keep connection alive for background updates
      // WebSocket will maintain connection for up to 3 minutes
      // Heartbeat continues to keep connection alive
    }

    appStateRef.current = nextAppState;
  };

  return <>{children}</>;
}
