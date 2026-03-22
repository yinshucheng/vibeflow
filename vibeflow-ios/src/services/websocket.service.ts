/**
 * WebSocket Client Service
 *
 * Manages WebSocket connection to Vibe Brain using Socket.io.
 * Implements automatic reconnection with exponential backoff.
 * Only receives events - does not send state changes (read-only client).
 *
 * Requirements: 2.1, 2.4
 */

import { io, Socket } from 'socket.io-client';
import {
  RECONNECT_INITIAL_DELAY_MS,
  RECONNECT_MAX_DELAY_MS,
  KEEPALIVE_INTERVAL_MS,
  KEEPALIVE_TIMEOUT_MS,
  CONNECT_WATCHDOG_TIMEOUT_MS,
} from '@/config';
import { getSocketAuthPayload, getCachedEmail } from '@/config/auth';
import { serverConfigService } from './server-config.service';
import { useAppStore } from '@/store';
import type {
  SyncStateCommand,
  UpdatePolicyCommand,
  ActionResultCommand,
  OctopusEvent,
  OctopusCommand,
  UserActionEvent,
  UserActionType,
  CommandType,
} from '@/types';

// =============================================================================
// TYPES
// =============================================================================

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

export interface WebSocketServiceConfig {
  url?: string;
  initialDelay?: number;
  maxDelay?: number;
}

type SyncStateHandler = (command: SyncStateCommand) => void;
type PolicyUpdateHandler = (command: UpdatePolicyCommand) => void;
type ActionResultHandler = (command: ActionResultCommand) => void;
type ConnectionHandler = () => void;
type StatusChangeHandler = (status: ConnectionStatus) => void;

type GenericCommandHandler = (payload: unknown) => void;

// =============================================================================
// RECONNECTION LOGIC
// =============================================================================

/**
 * Calculate reconnection delay using exponential backoff.
 * Formula: min(initialDelay * 2^attempt, maxDelay)
 *
 * @param attempt - Current attempt number (0-indexed)
 * @param initialDelay - Initial delay in milliseconds (default: 1000)
 * @param maxDelay - Maximum delay in milliseconds (default: 30000)
 * @returns Delay in milliseconds
 */
export function calculateReconnectDelay(
  attempt: number,
  initialDelay: number = RECONNECT_INITIAL_DELAY_MS,
  maxDelay: number = RECONNECT_MAX_DELAY_MS
): number {
  const delay = initialDelay * Math.pow(2, attempt);
  return Math.min(delay, maxDelay);
}

// =============================================================================
// WEBSOCKET SERVICE
// =============================================================================

class WebSocketService {
  private socket: Socket | null = null;
  private connectionStatus: ConnectionStatus = 'disconnected';
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isManualDisconnect = false;

  // Connect watchdog — forces reconnect if WS handshake stalls
  private connectWatchdog: ReturnType<typeof setTimeout> | null = null;

  // Application-layer keepalive — detects dead connections faster than Socket.io ping
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private keepalivePending = false;
  private keepaliveTimeout: ReturnType<typeof setTimeout> | null = null;

  // Event handlers
  private syncStateHandlers: SyncStateHandler[] = [];
  private policyUpdateHandlers: PolicyUpdateHandler[] = [];
  private actionResultHandlers: ActionResultHandler[] = [];
  private disconnectHandlers: ConnectionHandler[] = [];
  private reconnectHandlers: ConnectionHandler[] = [];
  private statusChangeHandlers: StatusChangeHandler[] = [];
  private commandHandlers: Map<string, GenericCommandHandler[]> = new Map();

  // Configuration
  private config: Required<WebSocketServiceConfig> = {
    url: serverConfigService.getServerUrlSync(),
    initialDelay: RECONNECT_INITIAL_DELAY_MS,
    maxDelay: RECONNECT_MAX_DELAY_MS,
  };

  /**
   * Connect to the WebSocket server.
   */
  connect(config?: WebSocketServiceConfig): void {
    if (this.socket?.connected) {
      return;
    }

    // Clear any pending reconnect timer to prevent old timers racing with this connect
    this.clearReconnectTimer();

    // Always refresh URL from serverConfigService
    this.config.url = serverConfigService.getServerUrlSync();

    if (config) {
      this.config = { ...this.config, ...config };
    }

    // Clean up existing socket before creating a new one
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.isManualDisconnect = false;
    this.setStatus('connecting');

    console.log('[WebSocket] Connecting to:', this.config.url);

    // Include x-dev-user-email in extraHeaders so DEV_MODE server
    // resolves the correct user identity (not the default dev@vibeflow.local).
    const email = getCachedEmail();
    const extraHeaders: Record<string, string> = {};
    if (email) {
      extraHeaders['x-dev-user-email'] = email;
    }

    this.socket = io(this.config.url, {
      transports: ['websocket'],
      auth: getSocketAuthPayload(),
      extraHeaders,
      reconnection: false, // We handle reconnection manually
      timeout: 10000,
    });

    this.setupEventListeners();

    // Start watchdog: if WS handshake doesn't complete within timeout, force reconnect
    this.startConnectWatchdog();
  }

  /**
   * Disconnect from the WebSocket server.
   */
  disconnect(): void {
    this.isManualDisconnect = true;
    this.clearReconnectTimer();
    this.clearConnectWatchdog();
    this.stopKeepalive();

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.setStatus('disconnected');
  }

  /**
   * Check if currently connected.
   */
  isConnected(): boolean {
    return this.connectionStatus === 'connected';
  }

  /**
   * Get current connection status.
   */
  getStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * Send an event to the server.
   * Note: iOS client only sends heartbeat events.
   */
  sendEvent(event: OctopusEvent): void {
    if (!this.socket?.connected) {
      console.warn('Cannot send event: not connected');
      return;
    }

    this.socket.emit('OCTOPUS_EVENT', event);
  }

  /**
   * Send a user action event to the server.
   */
  sendUserAction(
    actionType: UserActionType,
    data: Record<string, unknown>,
    optimisticId: string
  ): void {
    if (!this.socket?.connected) {
      console.warn('[WebSocket] Cannot send action: not connected');
      return;
    }

    // Generate a UUID v4 for eventId (Zod schema requires UUID format)
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });

    const event: UserActionEvent = {
      eventId: uuid,
      eventType: 'USER_ACTION',
      userId: useAppStore.getState().userId || 'dev-user',
      clientId: 'ios-app',
      clientType: 'mobile',
      timestamp: Date.now(),
      sequenceNumber: 0,
      payload: { actionType, optimisticId, data },
    };

    console.log('[WebSocket] Sending USER_ACTION:', actionType);
    this.socket.emit('OCTOPUS_EVENT', event);
  }

  // ===========================================================================
  // EVENT SUBSCRIPTION
  // ===========================================================================

  /**
   * Subscribe to SYNC_STATE commands.
   */
  onSyncState(handler: SyncStateHandler): () => void {
    this.syncStateHandlers.push(handler);
    return () => {
      this.syncStateHandlers = this.syncStateHandlers.filter(
        (h) => h !== handler
      );
    };
  }

  /**
   * Subscribe to UPDATE_POLICY commands.
   */
  onPolicyUpdate(handler: PolicyUpdateHandler): () => void {
    this.policyUpdateHandlers.push(handler);
    return () => {
      this.policyUpdateHandlers = this.policyUpdateHandlers.filter(
        (h) => h !== handler
      );
    };
  }

  /**
   * Subscribe to ACTION_RESULT commands.
   */
  onActionResult(handler: ActionResultHandler): () => void {
    this.actionResultHandlers.push(handler);
    return () => {
      this.actionResultHandlers = this.actionResultHandlers.filter(
        (h) => h !== handler
      );
    };
  }

  /**
   * Subscribe to disconnect events.
   */
  onDisconnect(handler: ConnectionHandler): () => void {
    this.disconnectHandlers.push(handler);
    return () => {
      this.disconnectHandlers = this.disconnectHandlers.filter(
        (h) => h !== handler
      );
    };
  }

  /**
   * Subscribe to reconnect events.
   */
  onReconnect(handler: ConnectionHandler): () => void {
    this.reconnectHandlers.push(handler);
    return () => {
      this.reconnectHandlers = this.reconnectHandlers.filter(
        (h) => h !== handler
      );
    };
  }

  /**
   * Subscribe to connection status changes.
   */
  onStatusChange(handler: StatusChangeHandler): () => void {
    this.statusChangeHandlers.push(handler);
    return () => {
      this.statusChangeHandlers = this.statusChangeHandlers.filter(
        (h) => h !== handler
      );
    };
  }

  /**
   * Subscribe to a specific command type by name.
   * Used for chat commands (CHAT_RESPONSE, CHAT_TOOL_CALL, etc.)
   */
  onCommand<T>(commandType: string, handler: (payload: T) => void): () => void {
    const handlers = this.commandHandlers.get(commandType) || [];
    handlers.push(handler as GenericCommandHandler);
    this.commandHandlers.set(commandType, handlers);

    return () => {
      const current = this.commandHandlers.get(commandType) || [];
      this.commandHandlers.set(
        commandType,
        current.filter((h) => h !== (handler as GenericCommandHandler))
      );
    };
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('[WebSocket] Connected successfully!');
      this.clearConnectWatchdog();
      const wasReconnect = this.reconnectAttempt > 0;
      this.reconnectAttempt = 0;
      this.setStatus('connected');

      // Start application-layer keepalive to detect dead connections
      this.startKeepalive();

      // Notify reconnect handlers if this was a reconnection
      if (wasReconnect) {
        this.reconnectHandlers.forEach((handler) => handler());
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[WebSocket] Disconnected, reason:', reason);
      this.stopKeepalive();
      this.disconnectHandlers.forEach((handler) => handler());

      // Auto-reconnect unless manually disconnected
      if (!this.isManualDisconnect) {
        this.setStatus('connecting'); // Will reconnect shortly — show "connecting" not "disconnected"
        this.scheduleReconnect();
      } else {
        this.setStatus('disconnected');
      }
    });

    this.socket.on('connect_error', (error) => {
      console.log('[WebSocket] Connection error:', error.message);

      if (!this.isManualDisconnect) {
        this.setStatus('connecting'); // Will reconnect shortly
        this.scheduleReconnect();
      } else {
        this.setStatus('disconnected');
      }
    });

    // Application-layer keepalive response
    this.socket.on('pong_custom' as never, () => {
      this.keepalivePending = false;
      if (this.keepaliveTimeout) {
        clearTimeout(this.keepaliveTimeout);
        this.keepaliveTimeout = null;
      }
    });

    // Listen for Octopus commands
    this.socket.on('OCTOPUS_COMMAND', (command: OctopusCommand) => {
      console.log('[WebSocket] Received OCTOPUS_COMMAND:', command.commandType);
      this.handleCommand(command);
    });

    // Also listen for specific command types (legacy)
    this.socket.on('sync:state', (command: SyncStateCommand) => {
      console.log('[WebSocket] Received sync:state');
      this.syncStateHandlers.forEach((handler) => handler(command));
    });

    this.socket.on('update:policy', (command: UpdatePolicyCommand) => {
      console.log('[WebSocket] Received update:policy');
      this.policyUpdateHandlers.forEach((handler) => handler(command));
    });
  }

  private handleCommand(command: OctopusCommand): void {
    switch (command.commandType) {
      case 'SYNC_STATE':
        this.syncStateHandlers.forEach((handler) =>
          handler(command as SyncStateCommand)
        );
        break;
      case 'UPDATE_POLICY':
        this.policyUpdateHandlers.forEach((handler) =>
          handler(command as UpdatePolicyCommand)
        );
        break;
      case 'ACTION_RESULT':
        console.log('[WebSocket] Received ACTION_RESULT:', (command as ActionResultCommand).payload.optimisticId);
        this.actionResultHandlers.forEach((handler) =>
          handler(command as ActionResultCommand)
        );
        break;
      default: {
        // Dispatch to generic command handlers (used by chat service etc.)
        const handlers = this.commandHandlers.get(command.commandType);
        if (handlers && handlers.length > 0) {
          const payload = (command as OctopusCommand & { payload: unknown }).payload;
          handlers.forEach((handler) => handler(payload));
        }
        break;
      }
    }
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.connectionStatus !== status) {
      this.connectionStatus = status;
      this.statusChangeHandlers.forEach((handler) => handler(status));
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();

    const delay = calculateReconnectDelay(
      this.reconnectAttempt,
      this.config.initialDelay,
      this.config.maxDelay
    );

    console.log(`[WebSocket] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempt})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempt++;
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ===========================================================================
  // CONNECT WATCHDOG
  // ===========================================================================

  /**
   * Start a watchdog timer that fires if the WS handshake doesn't complete.
   * This catches the case where TCP connects but the WS upgrade stalls
   * (common with frp TCP tunnels / NAT).
   */
  private startConnectWatchdog(): void {
    this.clearConnectWatchdog();
    this.connectWatchdog = setTimeout(() => {
      if (this.connectionStatus === 'connecting') {
        console.log('[WebSocket] Connect watchdog timeout — forcing reconnect');
        if (this.socket) {
          this.socket.removeAllListeners();
          this.socket.disconnect();
          this.socket = null;
        }
        this.setStatus('disconnected');
        if (!this.isManualDisconnect) {
          this.setStatus('connecting');
          this.scheduleReconnect();
        }
      }
    }, CONNECT_WATCHDOG_TIMEOUT_MS);
  }

  private clearConnectWatchdog(): void {
    if (this.connectWatchdog) {
      clearTimeout(this.connectWatchdog);
      this.connectWatchdog = null;
    }
  }

  // ===========================================================================
  // APPLICATION-LAYER KEEPALIVE
  // ===========================================================================

  /**
   * Send periodic pings at the application layer to keep the connection alive
   * through NAT gateways and detect dead connections faster than Socket.io's
   * built-in ping (which has up to 85s detection latency).
   *
   * Interval (15s) is chosen to be well under typical NAT idle timeouts (30-60s).
   */
  private startKeepalive(): void {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => {
      if (!this.socket?.connected) return;

      this.keepalivePending = true;
      this.socket.volatile.emit('ping_custom');

      this.keepaliveTimeout = setTimeout(() => {
        if (this.keepalivePending) {
          console.log('[WebSocket] Keepalive timeout — connection dead');
          this.socket?.disconnect();
        }
      }, KEEPALIVE_TIMEOUT_MS);
    }, KEEPALIVE_INTERVAL_MS);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    if (this.keepaliveTimeout) {
      clearTimeout(this.keepaliveTimeout);
      this.keepaliveTimeout = null;
    }
    this.keepalivePending = false;
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();
