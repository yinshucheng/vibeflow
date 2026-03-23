/**
 * useSocket Hook
 * 
 * React hook for managing Socket.io connection and real-time updates.
 * 
 * Requirements: 6.7
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { normalizeState } from '@/lib/state-utils';
import {
  initializeSocket,
  disconnectSocket,
  isConnected,
  onPolicyUpdate,
  onStateChange,
  onExecuteCommand,
  onError,
  onConnectionChange,
  sendActivityLogs,
  checkUrl,
  sendUserResponse,
  requestPolicy,
  type PolicyCache,
  type SystemState,
  type ExecuteCommand,
  type ActivityLogEntry,
} from '@/lib/socket-client';

export interface UseSocketOptions {
  email?: string;
  token?: string;
  autoConnect?: boolean;
}

export interface UseSocketReturn {
  connected: boolean;
  policy: PolicyCache | null;
  systemState: SystemState | null;
  lastCommand: ExecuteCommand | null;
  error: { code: string; message: string } | null;
  connect: () => void;
  disconnect: () => void;
  sendActivityLogs: (logs: ActivityLogEntry[]) => void;
  checkUrl: (url: string) => Promise<{ allowed: boolean; action?: string }>;
  sendUserResponse: (questionId: string, response: boolean) => void;
  requestPolicy: () => void;
}

/**
 * Hook for managing Socket.io connection
 */
export function useSocket(options: UseSocketOptions = {}): UseSocketReturn {
  const { email, token, autoConnect = true } = options;
  
  const [connected, setConnected] = useState(false);
  const [policy, setPolicy] = useState<PolicyCache | null>(null);
  const [systemState, setSystemState] = useState<SystemState | null>(null);
  const [lastCommand, setLastCommand] = useState<ExecuteCommand | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  
  const initialized = useRef(false);

  const connect = useCallback(() => {
    initializeSocket({ email, token });
  }, [email, token]);

  const disconnect = useCallback(() => {
    disconnectSocket();
    setConnected(false);
    setPolicy(null);
    setSystemState(null);
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Subscribe to events
    const unsubPolicy = onPolicyUpdate((newPolicy) => {
      setPolicy(newPolicy);
      setSystemState(normalizeState(newPolicy.globalState));
    });

    const unsubState = onStateChange((state) => {
      setSystemState(normalizeState(state));
    });

    const unsubCommand = onExecuteCommand((command) => {
      setLastCommand(command);
    });

    const unsubError = onError((err) => {
      setError(err);
    });

    const unsubConnection = onConnectionChange((isConnected) => {
      setConnected(isConnected);
      if (isConnected) {
        setError(null);
      }
    });

    // Auto-connect if enabled
    if (autoConnect) {
      connect();
    }

    // Check initial connection status
    setConnected(isConnected());

    // Cleanup
    return () => {
      unsubPolicy();
      unsubState();
      unsubCommand();
      unsubError();
      unsubConnection();
    };
  }, [autoConnect, connect]);

  return {
    connected,
    policy,
    systemState,
    lastCommand,
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
