/**
 * Guardian Client
 * 
 * Client module for the desktop app to communicate with the Process Guardian.
 * Implements IPC communication for health checks and status synchronization.
 * 
 * Requirements: 8.7, 8.8
 * - IF Process_Guardian is terminated, THE Desktop_App SHALL detect this and warn the user
 * - THE Process_Guardian SHALL communicate with Desktop_App via IPC to verify mutual health
 */

import * as net from 'net';
import type { GuardianState, GuardianIPCMessage } from './index';

// ============================================================================
// Constants
// ============================================================================

/** Default guardian port */
export const DEFAULT_GUARDIAN_PORT = 9999;

/** Connection timeout in milliseconds */
export const CONNECTION_TIMEOUT_MS = 5000;

/** Heartbeat interval in milliseconds */
export const HEARTBEAT_INTERVAL_MS = 10000;

/** Reconnect delay in milliseconds */
export const RECONNECT_DELAY_MS = 5000;

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface GuardianClientConfig {
  /** Guardian IPC port */
  port: number;
  /** Host address */
  host: string;
  /** Heartbeat interval in milliseconds */
  heartbeatIntervalMs: number;
  /** Reconnect delay in milliseconds */
  reconnectDelayMs: number;
  /** Whether to auto-reconnect */
  autoReconnect: boolean;
}

export interface GuardianClientState {
  /** Whether client is connected to guardian */
  isConnected: boolean;
  /** Last heartbeat sent timestamp */
  lastHeartbeatSent: Date | null;
  /** Last response received timestamp */
  lastResponseReceived: Date | null;
  /** Guardian state (if received) */
  guardianState: GuardianState | null;
  /** Connection attempts */
  connectionAttempts: number;
}

export type GuardianClientEventListener = (event: GuardianClientEvent) => void;

export interface GuardianClientEvent {
  type: 'connected' | 'disconnected' | 'guardian_status' | 'error' | 'guardian_missing';
  timestamp: Date;
  data?: GuardianState;
  error?: string;
}


// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: GuardianClientConfig = {
  port: DEFAULT_GUARDIAN_PORT,
  host: '127.0.0.1',
  heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
  reconnectDelayMs: RECONNECT_DELAY_MS,
  autoReconnect: true,
};

// ============================================================================
// Guardian Client Class
// ============================================================================

/**
 * GuardianClient - Communicates with the Process Guardian from the desktop app
 * 
 * Requirements: 8.7, 8.8
 */
export class GuardianClient {
  private config: GuardianClientConfig;
  private state: GuardianClientState;
  private socket: net.Socket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<GuardianClientEventListener> = new Set();
  private isDestroyed: boolean = false;

  constructor(config: Partial<GuardianClientConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      isConnected: false,
      lastHeartbeatSent: null,
      lastResponseReceived: null,
      guardianState: null,
      connectionAttempts: 0,
    };
  }

  /**
   * Connect to the guardian
   */
  async connect(): Promise<boolean> {
    if (this.isDestroyed) {
      return false;
    }

    if (this.state.isConnected) {
      return true;
    }

    this.state.connectionAttempts++;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.handleConnectionFailure('Connection timeout');
        resolve(false);
      }, CONNECTION_TIMEOUT_MS);

      this.socket = new net.Socket();

      this.socket.on('connect', () => {
        clearTimeout(timeout);
        this.handleConnected();
        resolve(true);
      });

      this.socket.on('data', (data) => {
        this.handleData(data);
      });

      this.socket.on('close', () => {
        this.handleDisconnected();
      });

      this.socket.on('error', (error) => {
        clearTimeout(timeout);
        this.handleConnectionFailure(error.message);
        resolve(false);
      });

      this.socket.connect(this.config.port, this.config.host);
    });
  }

  /**
   * Disconnect from the guardian
   */
  disconnect(): void {
    this.stopHeartbeat();
    this.stopReconnect();

    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    this.state.isConnected = false;
  }

  /**
   * Get current state
   */
  getState(): GuardianClientState {
    return { ...this.state };
  }

  /**
   * Check if connected to guardian
   */
  isConnected(): boolean {
    return this.state.isConnected;
  }

  /**
   * Subscribe to events
   */
  onEvent(listener: GuardianClientEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Request guardian status
   */
  requestStatus(): void {
    this.sendMessage({ type: 'status_request' });
  }

  /**
   * Send heartbeat to guardian
   */
  sendHeartbeat(): void {
    this.sendMessage({ type: 'heartbeat', timestamp: Date.now() });
    this.state.lastHeartbeatSent = new Date();
  }

  /**
   * Request guardian shutdown
   */
  requestShutdown(): void {
    this.sendMessage({ type: 'shutdown' });
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<GuardianClientConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Handle successful connection
   */
  private handleConnected(): void {
    this.state.isConnected = true;
    this.state.connectionAttempts = 0;
    this.startHeartbeat();
    this.notifyListeners({
      type: 'connected',
      timestamp: new Date(),
    });
  }

  /**
   * Handle disconnection
   */
  private handleDisconnected(): void {
    this.state.isConnected = false;
    this.stopHeartbeat();
    this.notifyListeners({
      type: 'disconnected',
      timestamp: new Date(),
    });

    if (this.config.autoReconnect && !this.isDestroyed) {
      this.scheduleReconnect();
    }
  }

  /**
   * Handle connection failure
   */
  private handleConnectionFailure(error: string): void {
    this.state.isConnected = false;
    this.notifyListeners({
      type: 'guardian_missing',
      timestamp: new Date(),
      error,
    });

    if (this.config.autoReconnect && !this.isDestroyed) {
      this.scheduleReconnect();
    }
  }

  /**
   * Handle incoming data
   */
  private handleData(data: Buffer): void {
    try {
      const message: GuardianIPCMessage = JSON.parse(data.toString());
      this.state.lastResponseReceived = new Date();

      switch (message.type) {
        case 'status_response':
          this.state.guardianState = message.state;
          this.notifyListeners({
            type: 'guardian_status',
            timestamp: new Date(),
            data: message.state,
          });
          break;

        case 'health_response':
          // Guardian is healthy
          break;
      }
    } catch (error) {
      console.error('[GuardianClient] Failed to parse message:', error);
    }
  }

  /**
   * Send message to guardian
   */
  private sendMessage(message: GuardianIPCMessage): void {
    if (!this.socket || !this.state.isConnected) {
      return;
    }

    try {
      this.socket.write(JSON.stringify(message));
    } catch (error) {
      console.error('[GuardianClient] Failed to send message:', error);
    }
  }

  /**
   * Start heartbeat timer
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.config.heartbeatIntervalMs);
    // Send initial heartbeat
    this.sendHeartbeat();
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    this.stopReconnect();
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.config.reconnectDelayMs);
  }

  /**
   * Stop reconnection timer
   */
  private stopReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(event: GuardianClientEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('[GuardianClient] Listener error:', error);
      }
    });
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.isDestroyed = true;
    this.disconnect();
    this.listeners.clear();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let guardianClientInstance: GuardianClient | null = null;

/**
 * Get the guardian client singleton
 */
export function getGuardianClient(config?: Partial<GuardianClientConfig>): GuardianClient {
  if (!guardianClientInstance) {
    guardianClientInstance = new GuardianClient(config);
  } else if (config) {
    guardianClientInstance.updateConfig(config);
  }
  return guardianClientInstance;
}

/**
 * Reset guardian client (for testing)
 */
export function resetGuardianClient(): void {
  if (guardianClientInstance) {
    guardianClientInstance.destroy();
    guardianClientInstance = null;
  }
}

export const guardianClientService = {
  getGuardianClient,
  resetGuardianClient,
  DEFAULT_GUARDIAN_PORT,
  CONNECTION_TIMEOUT_MS,
  HEARTBEAT_INTERVAL_MS,
  RECONNECT_DELAY_MS,
};

export default guardianClientService;
