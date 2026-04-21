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
  const { email, token, autoConnect = true } = options;

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

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Route OCTOPUS_COMMAND events through SDK command handler → realtime store
    const unsubCommand = onOctopusCommand((command) => {
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

    if (autoConnect) {
      connect();
    }

    useRealtimeStore.getState()._setConnected(checkIsConnected());

    return () => {
      unsubCommand();
      unsubError();
      unsubConnection();
    };
  }, [autoConnect, connect]);

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
