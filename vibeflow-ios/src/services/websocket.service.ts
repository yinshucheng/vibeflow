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
  WEBSOCKET_URL,
  RECONNECT_INITIAL_DELAY_MS,
  RECONNECT_MAX_DELAY_MS,
} from '@/config';
import { getSocketAuthPayload } from '@/config/auth';
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
    url: WEBSOCKET_URL,
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

    this.socket = io(this.config.url, {
      transports: ['websocket'],
      auth: getSocketAuthPayload(),
      reconnection: false, // We handle reconnection manually
      timeout: 10000,
    });

    this.setupEventListeners();
  }

  /**
   * Disconnect from the WebSocket server.
   */
  disconnect(): void {
    this.isManualDisconnect = true;
    this.clearReconnectTimer();

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
      const wasReconnect = this.reconnectAttempt > 0;
      this.reconnectAttempt = 0;
      this.setStatus('connected');

      // Notify reconnect handlers if this was a reconnection
      if (wasReconnect) {
        this.reconnectHandlers.forEach((handler) => handler());
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[WebSocket] Disconnected, reason:', reason);
      this.setStatus('disconnected');
      this.disconnectHandlers.forEach((handler) => handler());

      // Auto-reconnect unless manually disconnected
      if (!this.isManualDisconnect) {
        this.scheduleReconnect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.log('[WebSocket] Connection error:', error.message);
      this.setStatus('disconnected');

      if (!this.isManualDisconnect) {
        this.scheduleReconnect();
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

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempt++;
      this.setStatus('connecting');
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();
