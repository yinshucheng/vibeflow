/**
 * useSocket Hook
 *
 * React hook for managing Socket.io connection and real-time updates.
 * Routes all OCTOPUS_COMMAND events through the SDK command handler
 * into the realtime Zustand store.
 *
 * Requirements: 6.7
 */

'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import {
  initializeSocket,
  disconnectSocket,
  isConnected as checkIsConnected,
  onOctopusCommand,
  onError,
  onConnectionChange,
  sendActivityLogs,
  checkUrl,
  sendUserResponse,
  requestPolicy,
  type ActivityLogEntry,
} from '@/lib/socket-client';
import {
  useRealtimeStore,
  commandHandler,
  stateManager,
  type SystemState,
} from '@/stores/realtime.store';

export interface UseSocketOptions {
  email?: string;
  token?: string;
  autoConnect?: boolean;
}

export interface UseSocketReturn {
  connected: boolean;
  systemState: SystemState | null;
  error: { code: string; message: string } | null;
  connect: () => void;
  disconnect: () => void;
  sendActivityLogs: (logs: ActivityLogEntry[]) => void;
  checkUrl: (url: string) => Promise<{ allowed: boolean; action?: string }>;
  sendUserResponse: (questionId: string, response: boolean) => void;
  requestPolicy: () => void;
}

/**
 * Hook for managing Socket.io connection.
 * All real-time state is available via useRealtimeStore selectors.
 */
export function useSocket(options: UseSocketOptions = {}): UseSocketReturn {
  const { email: emailOption, token, autoConnect = true } = options;
  const { data: session } = useSession();
  // Prefer explicitly passed email, then fall back to NextAuth session email
  const email = emailOption ?? session?.user?.email ?? undefined;

  const connected = useRealtimeStore((s) => s.connected);
  const systemState = useRealtimeStore((s) => s.systemState);
  const error = useRealtimeStore((s) => s.error);

  const initialized = useRef(false);

  const connect = useCallback(() => {
    initializeSocket({ email, token });
  }, [email, token]);

  const disconnect = useCallback(() => {
    disconnectSocket();
    useRealtimeStore.getState()._setConnected(false);
  }, []);

  // One-time setup for event listeners
  useEffect(() => {
    console.log('[useSocket] Event listener setup effect, initialized:', initialized.current);
    if (initialized.current) return;
    initialized.current = true;

    console.log('[useSocket] Registering OCTOPUS_COMMAND handler');
    // Route OCTOPUS_COMMAND events through SDK command handler → realtime store
    const unsubCommand = onOctopusCommand((command) => {
      console.log('[useSocket] OCTOPUS_COMMAND received in handler:', command.commandType);
      commandHandler(command);
    });

    const unsubError = onError((err) => {
      useRealtimeStore.getState()._setError(err);
    });

    const unsubConnection = onConnectionChange((isConn) => {
      useRealtimeStore.getState()._setConnected(isConn);
      if (!isConn) {
        stateManager.onReconnecting();
      }
    });

    return () => {
      unsubCommand();
      unsubError();
      unsubConnection();
    };
  }, []);

  // Track previous session state to detect login/logout transitions
  const prevSessionRef = useRef<string | null | undefined>(undefined);

  // Reconnect socket when session changes (login/logout)
  useEffect(() => {
    const currentEmail = session?.user?.email;
    const prevEmail = prevSessionRef.current;

    // Skip initial render (prevEmail is undefined)
    if (prevEmail === undefined) {
      prevSessionRef.current = currentEmail ?? null;
      if (autoConnect && currentEmail) {
        connect();
      }
      useRealtimeStore.getState()._setConnected(checkIsConnected());
      return;
    }

    // Session changed
    if (currentEmail !== prevEmail) {
      prevSessionRef.current = currentEmail ?? null;

      if (!currentEmail) {
        // Logged out — disconnect socket
        console.log('[useSocket] Session ended, disconnecting socket');
        disconnect();
      } else {
        // Logged in (or switched user) — reconnect socket
        console.log('[useSocket] Session changed, reconnecting socket');
        disconnect();
        setTimeout(() => connect(), 100); // Small delay to ensure clean disconnect
      }
    }
  }, [session?.user?.email, autoConnect, connect, disconnect]);

  return {
    connected,
    systemState,
    error,
    connect,
    disconnect,
    sendActivityLogs,
    checkUrl,
    sendUserResponse,
    requestPolicy,
  };
}

export default useSocket;
