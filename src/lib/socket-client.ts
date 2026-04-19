/**
 * Socket.io Client
 * 
 * Client-side Socket.io connection manager for the VibeFlow web dashboard.
 * Provides hooks and utilities for real-time communication.
 * 
 * Requirements: 6.7
 */

import { io, Socket } from 'socket.io-client';

// Re-export types locally (avoid importing from server in client code)
// 3-state model: idle (was locked/planning/rest), focus, over_rest
export type SystemState = 'idle' | 'focus' | 'over_rest';

export interface PolicyCache {
  globalState: SystemState;
  blacklist: string[];
  whitelist: string[];
  sessionWhitelist: string[];
  lastSync: number;
}

export interface ActivityLogEntry {
  url: string;
  title?: string;
  duration: number;
  category: 'productive' | 'neutral' | 'distracting';
  timestamp?: number;
}

export interface ExecuteCommand {
  action: 'INJECT_TOAST' | 'SHOW_OVERLAY' | 'REDIRECT' | 'POMODORO_COMPLETE' | 'IDLE_ALERT' | 'HABIT_REMINDER';
  params: Record<string, unknown>;
}

// Server -> Client message types
interface ServerToClientEvents {
  SYNC_POLICY: (payload: PolicyCache) => void;
  STATE_CHANGE: (payload: { state: SystemState }) => void;
  EXECUTE: (payload: ExecuteCommand) => void;
  error: (payload: { code: string; message: string }) => void;
}

// Client -> Server message types
interface ClientToServerEvents {
  ACTIVITY_LOG: (payload: ActivityLogEntry[]) => void;
  URL_CHECK: (payload: { url: string }, callback: (response: { allowed: boolean; action?: string }) => void) => void;
  USER_RESPONSE: (payload: { questionId: string; response: boolean }) => void;
  REQUEST_POLICY: () => void;
}

// Socket instance
let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

// Event listeners
type PolicyListener = (policy: PolicyCache) => void;
type StateChangeListener = (state: SystemState) => void;
type ExecuteListener = (command: ExecuteCommand) => void;
type ErrorListener = (error: { code: string; message: string }) => void;
type ConnectionListener = (connected: boolean) => void;

const policyListeners = new Set<PolicyListener>();
const stateChangeListeners = new Set<StateChangeListener>();
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

  // In dev mode, read email from localStorage if not explicitly provided
  let email = options?.email;
  if (!email && typeof window !== 'undefined' && process.env.NEXT_PUBLIC_DEV_MODE === 'true') {
    email = localStorage.getItem('dev-user-email') || undefined;
  }
  // In production mode (no dev mode), Web socket relies on same-origin
  // NextAuth session cookies for authentication (sent automatically)

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
      message: error.message 
    }));
  });

  // Server events
  socket.on('SYNC_POLICY', (policy) => {
    console.log('[Socket.io Client] Policy sync received');
    policyListeners.forEach((listener) => listener(policy));
  });

  socket.on('STATE_CHANGE', ({ state }) => {
    console.log('[Socket.io Client] State change:', state);
    stateChangeListeners.forEach((listener) => listener(state));
  });

  socket.on('EXECUTE', (command) => {
    console.log('[Socket.io Client] Execute command:', command.action);
    executeListeners.forEach((listener) => listener(command));
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
 * Subscribe to policy updates
 */
export function onPolicyUpdate(listener: PolicyListener): () => void {
  policyListeners.add(listener);
  return () => policyListeners.delete(listener);
}

/**
 * Subscribe to state changes
 */
export function onStateChange(listener: StateChangeListener): () => void {
  stateChangeListeners.add(listener);
  return () => stateChangeListeners.delete(listener);
}

/**
 * Subscribe to execute commands
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
      console.warn('[Socket.io Client] Not connected, allowing URL by default');
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
  if (!socket?.connected) {
    console.warn('[Socket.io Client] Not connected, cannot send user response');
    return;
  }
  socket.emit('USER_RESPONSE', { questionId, response });
}

/**
 * Request policy sync from server
 */
export function requestPolicy(): void {
  if (!socket?.connected) {
    console.warn('[Socket.io Client] Not connected, cannot request policy');
    return;
  }
  socket.emit('REQUEST_POLICY');
}
