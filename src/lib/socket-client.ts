/**
 * Socket.io Client
 *
 * Client-side Socket.io connection manager for the VibeFlow web dashboard.
 * Uses the unified OCTOPUS_COMMAND protocol for all server→client events.
 *
 * Requirements: 6.7
 */

import { io, Socket } from 'socket.io-client';
import type {
  OctopusCommand,
  ExecuteActionPayload,
  ShowUIPayload,
} from '@vibeflow/octopus-protocol';

// Re-export types for backward compat
export type SystemState = 'idle' | 'focus' | 'over_rest';

export interface ExecuteCommand {
  action: 'INJECT_TOAST' | 'SHOW_OVERLAY' | 'REDIRECT' | 'POMODORO_COMPLETE' | 'IDLE_ALERT' | 'HABIT_REMINDER';
  params: Record<string, unknown>;
}

export interface ActivityLogEntry {
  url: string;
  title?: string;
  duration: number;
  category: 'productive' | 'neutral' | 'distracting';
  timestamp?: number;
}

// Server -> Client events (OCTOPUS protocol only)
interface ServerToClientEvents {
  OCTOPUS_COMMAND: (command: OctopusCommand) => void;
  error: (payload: { code: string; message: string }) => void;
}

// Client -> Server events
interface ClientToServerEvents {
  OCTOPUS_EVENT: (event: unknown) => void;
  ACTIVITY_LOG: (payload: ActivityLogEntry[]) => void;
  URL_CHECK: (payload: { url: string }, callback: (response: { allowed: boolean; action?: string }) => void) => void;
  USER_RESPONSE: (payload: { questionId: string; response: boolean }) => void;
  REQUEST_POLICY: () => void;
}

// Socket instance
let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

// Event listeners
type OctopusCommandListener = (command: OctopusCommand) => void;
type ExecuteListener = (command: ExecuteCommand) => void;
type ErrorListener = (error: { code: string; message: string }) => void;
type ConnectionListener = (connected: boolean) => void;

const octopusCommandListeners = new Set<OctopusCommandListener>();
const executeListeners = new Set<ExecuteListener>();
const errorListeners = new Set<ErrorListener>();
const connectionListeners = new Set<ConnectionListener>();

/**
 * Initialize Socket.io client connection
 */
export function initializeSocket(options?: {
  email?: string;
  token?: string;
}): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (socket?.connected) {
    return socket;
  }

  let email = options?.email;
  if (!email && typeof window !== 'undefined' && process.env.NEXT_PUBLIC_DEV_MODE === 'true') {
    email = localStorage.getItem('dev-user-email') || undefined;
  }

  const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || '';

  socket = io(socketUrl, {
    auth: {
      email,
      token: options?.token,
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  // Connection events
  socket.on('connect', () => {
    console.log('[Socket.io Client] Connected');
    connectionListeners.forEach((listener) => listener(true));
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket.io Client] Disconnected:', reason);
    connectionListeners.forEach((listener) => listener(false));
  });

  socket.on('connect_error', (error) => {
    console.error('[Socket.io Client] Connection error:', error.message);
    errorListeners.forEach((listener) => listener({
      code: 'CONNECTION_ERROR',
      message: error.message,
    }));
  });

  // Unified Octopus protocol handler
  socket.on('OCTOPUS_COMMAND', (command) => {
    console.log('[Socket.io Client] OCTOPUS_COMMAND:', command.commandType);
    octopusCommandListeners.forEach((listener) => listener(command));

    // Legacy execute listener compat (for tray-sync habit reminders)
    if (command.commandType === 'EXECUTE_ACTION') {
      const payload = command.payload as ExecuteActionPayload;
      const legacyCommand: ExecuteCommand = {
        action: payload.action as ExecuteCommand['action'],
        params: payload.parameters ?? {},
      };
      executeListeners.forEach((listener) => listener(legacyCommand));
    }
  });

  socket.on('error', (error) => {
    console.error('[Socket.io Client] Error:', error);
    errorListeners.forEach((listener) => listener(error));
  });

  return socket;
}

/**
 * Get the current socket instance
 */
export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> | null {
  return socket;
}

/**
 * Disconnect the socket
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Check if socket is connected
 */
export function isConnected(): boolean {
  return socket?.connected ?? false;
}

// ============================================================================
// Event Subscription
// ============================================================================

/**
 * Subscribe to OCTOPUS_COMMAND events (primary listener)
 */
export function onOctopusCommand(listener: OctopusCommandListener): () => void {
  octopusCommandListeners.add(listener);
  return () => octopusCommandListeners.delete(listener);
}

/**
 * Subscribe to execute commands (legacy compat for habit reminders)
 */
export function onExecuteCommand(listener: ExecuteListener): () => void {
  executeListeners.add(listener);
  return () => executeListeners.delete(listener);
}

/**
 * Subscribe to errors
 */
export function onError(listener: ErrorListener): () => void {
  errorListeners.add(listener);
  return () => errorListeners.delete(listener);
}

/**
 * Subscribe to connection status changes
 */
export function onConnectionChange(listener: ConnectionListener): () => void {
  connectionListeners.add(listener);
  return () => connectionListeners.delete(listener);
}

// ============================================================================
// Client Actions
// ============================================================================

/**
 * Send activity logs to server
 */
export function sendActivityLogs(logs: ActivityLogEntry[]): void {
  if (!socket?.connected) {
    console.warn('[Socket.io Client] Not connected, cannot send activity logs');
    return;
  }
  socket.emit('ACTIVITY_LOG', logs);
}

/**
 * Check if a URL is allowed
 */
export function checkUrl(url: string): Promise<{ allowed: boolean; action?: string }> {
  return new Promise((resolve) => {
    if (!socket?.connected) {
      resolve({ allowed: true });
      return;
    }
    socket.emit('URL_CHECK', { url }, resolve);
  });
}

/**
 * Send user response to soft intervention
 */
export function sendUserResponse(questionId: string, response: boolean): void {
  if (!socket?.connected) return;
  socket.emit('USER_RESPONSE', { questionId, response });
}

/**
 * Request policy sync from server
 */
export function requestPolicy(): void {
  if (!socket?.connected) return;
  socket.emit('REQUEST_POLICY');
}
