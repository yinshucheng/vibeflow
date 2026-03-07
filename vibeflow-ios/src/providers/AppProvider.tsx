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
import { syncService, heartbeatService, websocketService, chatService } from '@/services';
import { blockingService } from '@/services/blocking.service';
import { screenTimeService } from '@/services/screen-time.service';
import { useAppStore } from '@/store';
import { DEV_USER_EMAIL } from '@/config/auth';

interface AppProviderProps {
  children: React.ReactNode;
}

export function AppProvider({ children }: AppProviderProps): React.JSX.Element {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const setUserInfo = useAppStore((state) => state.setUserInfo);
  const setSelectionSummary = useAppStore((state) => state.setSelectionSummary);

  useEffect(() => {
    // Set default user info for MVP
    setUserInfo('dev-user', DEV_USER_EMAIL);

    // Initialize sync service (connects WebSocket events to store)
    syncService.initialize({ autoConnect: true });

    // Start heartbeat service with userId
    heartbeatService.start({ userId: 'dev-user' });

    // Initialize blocking service (restores persisted state, starts listening)
    blockingService.initialize();
    const cleanupBlocking = blockingService.startListening();

    // Initialize chat service (listens for AI chat commands)
    chatService.initialize();

    // Initialize selection summary from native module (App Group)
    const loadSelectionSummary = async () => {
      try {
        const status = await screenTimeService.getAuthorizationStatus();
        if (status === 'authorized') {
          const summary = await screenTimeService.getSelectionSummary('distraction');
          setSelectionSummary(summary);
        }
      } catch (error) {
        console.warn('[AppProvider] Failed to load selection summary:', error);
      }
    };
    loadSelectionSummary();

    // Handle app state changes (background/foreground)
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Cleanup on unmount
    return () => {
      subscription.remove();
      chatService.cleanup();
      cleanupBlocking();
      heartbeatService.stop();
      syncService.cleanup();
    };
  }, [setUserInfo, setSelectionSummary]);

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
