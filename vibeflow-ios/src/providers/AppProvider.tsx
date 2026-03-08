/**
 * App Provider
 *
 * Initializes core services and provides app-wide context.
 * - Checks auth state on startup (SecureStore token → verify)
 * - Shows LoginScreen if not authenticated
 * - Initializes WebSocket, heartbeat, sync, blocking, chat services after auth
 *
 * Requirements: 2.1, 2.2, 2.3
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AppState, AppStateStatus, ActivityIndicator, View } from 'react-native';
import { syncService, heartbeatService, websocketService, chatService } from '@/services';
import { serverConfigService } from '@/services/server-config.service';
import { blockingService } from '@/services/blocking.service';
import { screenTimeService } from '@/services/screen-time.service';
import { useAppStore } from '@/store';
import { getToken, verifyToken, logout, refreshCachedToken } from '@/config/auth';
import { LoginScreen } from '@/screens/LoginScreen';

interface AppProviderProps {
  children: React.ReactNode;
}

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';

export function AppProvider({ children }: AppProviderProps): React.JSX.Element {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const setUserInfo = useAppStore((state) => state.setUserInfo);
  const clearState = useAppStore((state) => state.clearState);
  const setSelectionSummary = useAppStore((state) => state.setSelectionSummary);
  const [serverReady, setServerReady] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking');
  const [authUser, setAuthUser] = useState<{ id: string; email: string } | null>(null);

  // Pre-load server URL from AsyncStorage
  useEffect(() => {
    serverConfigService.getServerUrl().then(() => setServerReady(true));
  }, []);

  // Check auth state once server URL is ready
  useEffect(() => {
    if (!serverReady) return;

    const checkAuth = async () => {
      const token = await getToken();
      if (!token) {
        setAuthStatus('unauthenticated');
        return;
      }

      // Refresh cached token for sync use
      await refreshCachedToken();

      const result = await verifyToken(token);
      if (result.success && result.user) {
        setAuthUser(result.user);
        setAuthStatus('authenticated');
      } else {
        setAuthStatus('unauthenticated');
      }
    };

    checkAuth();
  }, [serverReady]);

  // Initialize services once authenticated
  useEffect(() => {
    if (authStatus !== 'authenticated' || !authUser) return;

    // Set user info in store
    setUserInfo(authUser.id, authUser.email);

    // Initialize sync service (connects WebSocket events to store)
    syncService.initialize({ autoConnect: true });

    // Start heartbeat service with userId
    heartbeatService.start({ userId: authUser.id });

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
  }, [authStatus, authUser, setUserInfo, setSelectionSummary]);

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
    }

    appStateRef.current = nextAppState;
  };

  /**
   * Handle successful login/register from LoginScreen.
   */
  const handleAuthSuccess = useCallback(async (user: { id: string; email: string }) => {
    await refreshCachedToken();
    setAuthUser(user);
    setAuthStatus('authenticated');
  }, []);

  /**
   * Handle logout (called from SettingsScreen or elsewhere).
   */
  const handleLogout = useCallback(async () => {
    // Disconnect services
    websocketService.disconnect();
    heartbeatService.stop();

    // Clear auth
    await logout();
    await refreshCachedToken();

    // Clear store
    clearState();

    // Reset auth state
    setAuthUser(null);
    setAuthStatus('unauthenticated');
  }, [clearState]);

  // Loading state
  if (!serverReady || authStatus === 'checking') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Not authenticated — show login
  if (authStatus === 'unauthenticated') {
    return <LoginScreen onAuthSuccess={handleAuthSuccess} />;
  }

  return <>{children}</>;
}

