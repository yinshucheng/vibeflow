/**
 * Heartbeat Manager Module
 * 
 * Manages heartbeat signals to the VibeFlow server for client health monitoring.
 * Implements 30-second heartbeat interval with connection status tracking and
 * automatic reconnection logic.
 * 
 * Requirements: 3.1, 1.4
 * - THE Desktop_App SHALL send heartbeat signals to the server every 30 seconds
 * - THE Desktop_App SHALL maintain connection to the server and auto-reconnect on disconnection
 */

import { v4 as uuidv4 } from 'uuid';
import { getConnectionManager, type ConnectionStatus } from './connection-manager';

// ============================================================================
// Constants
// ============================================================================

/** Heartbeat interval in milliseconds (30 seconds) - Requirements 3.1 */
export const HEARTBEAT_INTERVAL_MS = 30 * 1000;

/** Heartbeat timeout in milliseconds (10 seconds) */
export const HEARTBEAT_TIMEOUT_MS = 10 * 1000;

/** Maximum consecutive heartbeat failures before triggering reconnect */
export const MAX_HEARTBEAT_FAILURES = 3;

/** Reconnect delay after heartbeat failures (5 seconds) */
export const RECONNECT_DELAY_MS = 5 * 1000;

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface HeartbeatConfig {
  /** Heartbeat interval in milliseconds (default: 30000) */
  intervalMs: number;
  /** Heartbeat timeout in milliseconds (default: 10000) */
  timeoutMs: number;
  /** Maximum consecutive failures before reconnect (default: 3) */
  maxRetries: number;
  /** Reconnect delay in milliseconds (default: 5000) */
  reconnectDelayMs: number;
}

export interface HeartbeatPayload {
  clientId: string;
  userId: string;
  timestamp: number;
  appVersion: string;
  mode: 'development' | 'staging' | 'production';
  isInDemoMode: boolean;
  activePomodoroId: string | null;
  deviceName?: string;
}

export interface HeartbeatState {
  /** Whether heartbeat manager is running */
  isRunning: boolean;
  /** Last successful heartbeat timestamp */
  lastHeartbeat: number | null;
  /** Last heartbeat attempt timestamp */
  lastAttempt: number | null;
  /** Consecutive failure count */
  consecutiveFailures: number;
  /** Total heartbeats sent */
  totalSent: number;
  /** Total successful heartbeats */
  totalSuccessful: number;
  /** Current connection status */
  connectionStatus: ConnectionStatus;
}

export interface HeartbeatResult {
  success: boolean;
  timestamp: number;
  error?: string;
  latencyMs?: number;
}

/** Heartbeat event listener type */
export type HeartbeatEventListener = (event: HeartbeatEvent) => void;

export interface HeartbeatEvent {
  type: 'sent' | 'success' | 'failure' | 'reconnecting' | 'reconnected';
  timestamp: number;
  payload?: HeartbeatPayload;
  error?: string;
  latencyMs?: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: HeartbeatConfig = {
  intervalMs: HEARTBEAT_INTERVAL_MS,
  timeoutMs: HEARTBEAT_TIMEOUT_MS,
  maxRetries: MAX_HEARTBEAT_FAILURES,
  reconnectDelayMs: RECONNECT_DELAY_MS,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the desktop client version from package.json
 */
function getClientVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const packageJson = require('../../package.json');
    return packageJson.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

/**
 * Get the device name from the OS
 */
function getDeviceName(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const os = require('os');
    return os.hostname() || 'Desktop';
  } catch {
    return 'Desktop';
  }
}

/**
 * Detect the current app mode
 */
function detectAppMode(): 'development' | 'staging' | 'production' {
  const envMode = process.env.VIBEFLOW_MODE;
  if (envMode === 'development' || envMode === 'staging' || envMode === 'production') {
    return envMode;
  }
  
  if (process.env.NODE_ENV === 'development') {
    return 'development';
  }
  
  if (process.argv.includes('--dev')) {
    return 'development';
  }
  
  if (process.argv.includes('--staging')) {
    return 'staging';
  }
  
  // Check if running from packaged app
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron');
    if (app.isPackaged) {
      return 'production';
    }
  } catch {
    // Not in Electron context
  }
  
  return 'development';
}

// ============================================================================
// Heartbeat Manager Class
// ============================================================================

/**
 * Heartbeat Manager
 * 
 * Manages periodic heartbeat signals to the server with automatic
 * reconnection on failure.
 * 
 * Requirements: 3.1, 1.4
 */
class HeartbeatManager {
  private config: HeartbeatConfig;
  private state: HeartbeatState;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<HeartbeatEventListener> = new Set();
  private userId: string | null = null;
  private isInDemoMode: boolean = false;
  private activePomodoroId: string | null = null;
  private clientId: string;

  constructor(config: Partial<HeartbeatConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.clientId = uuidv4();
    this.state = {
      isRunning: false,
      lastHeartbeat: null,
      lastAttempt: null,
      consecutiveFailures: 0,
      totalSent: 0,
      totalSuccessful: 0,
      connectionStatus: 'disconnected',
    };
  }

  /**
   * Set the user ID for heartbeat payloads
   */
  setUserId(userId: string): void {
    this.userId = userId;
  }

  /**
   * Set demo mode status
   */
  setDemoMode(isInDemoMode: boolean): void {
    this.isInDemoMode = isInDemoMode;
  }

  /**
   * Set active pomodoro ID
   */
  setActivePomodoroId(pomodoroId: string | null): void {
    this.activePomodoroId = pomodoroId;
  }

  /**
   * Get the client ID
   */
  getClientId(): string {
    return this.clientId;
  }

  /**
   * Get current heartbeat state
   */
  getState(): HeartbeatState {
    const connectionManager = getConnectionManager();
    return {
      ...this.state,
      connectionStatus: connectionManager.getStatus(),
    };
  }

  /**
   * Get last successful heartbeat timestamp
   */
  getLastHeartbeat(): number | null {
    return this.state.lastHeartbeat;
  }

  /**
   * Check if heartbeat manager is running
   */
  isRunning(): boolean {
    return this.state.isRunning;
  }

  /**
   * Check if connected to server
   */
  isConnected(): boolean {
    const connectionManager = getConnectionManager();
    return connectionManager.getStatus() === 'connected';
  }

  /**
   * Subscribe to heartbeat events
   */
  onHeartbeatEvent(listener: HeartbeatEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Start the heartbeat manager
   * Requirements: 3.1
   */
  start(): void {
    if (this.state.isRunning) {
      console.log('[HeartbeatManager] Already running');
      return;
    }

    console.log('[HeartbeatManager] Starting heartbeat manager');
    this.state.isRunning = true;

    // Subscribe to connection status changes
    const connectionManager = getConnectionManager();
    connectionManager.onConnectionChange((event) => {
      this.state.connectionStatus = event.status;
      
      if (event.status === 'connected') {
        // Reset failure count on successful connection
        this.state.consecutiveFailures = 0;
        this.notifyListeners({
          type: 'reconnected',
          timestamp: Date.now(),
        });
      }
    });

    // Start heartbeat timer
    this.startHeartbeatTimer();

    // Send initial heartbeat
    this.sendHeartbeat();
  }

  /**
   * Stop the heartbeat manager
   */
  stop(): void {
    if (!this.state.isRunning) {
      return;
    }

    console.log('[HeartbeatManager] Stopping heartbeat manager');
    this.state.isRunning = false;
    this.stopHeartbeatTimer();
    this.stopReconnectTimer();
  }

  /**
   * Send a heartbeat to the server
   * Requirements: 3.1
   */
  async sendHeartbeat(): Promise<HeartbeatResult> {
    const startTime = Date.now();
    this.state.lastAttempt = startTime;
    this.state.totalSent++;

    const payload = this.buildHeartbeatPayload();

    // Notify listeners of heartbeat attempt
    this.notifyListeners({
      type: 'sent',
      timestamp: startTime,
      payload,
    });

    try {
      const connectionManager = getConnectionManager();
      
      // Check if connected
      if (connectionManager.getStatus() !== 'connected') {
        throw new Error('Not connected to server');
      }

      // Send heartbeat via connection manager
      const success = connectionManager.sendEvent({
        eventType: 'HEARTBEAT',
        userId: this.userId || '',
        payload: {
          clientVersion: getClientVersion(),
          platform: 'macos',
          connectionQuality: this.getConnectionQuality(),
          localStateHash: '',
          capabilities: this.getCapabilities(),
          uptime: this.getUptime(),
          focusEnforcerState: {
            isMonitoring: true,
            isWithinWorkHours: true,
            isPomodoroActive: this.activePomodoroId !== null,
            idleSeconds: 0,
          },
        },
      });

      if (!success) {
        throw new Error('Failed to send heartbeat event');
      }

      const latencyMs = Date.now() - startTime;
      this.state.lastHeartbeat = Date.now();
      this.state.consecutiveFailures = 0;
      this.state.totalSuccessful++;

      // Notify listeners of success
      this.notifyListeners({
        type: 'success',
        timestamp: Date.now(),
        payload,
        latencyMs,
      });

      return {
        success: true,
        timestamp: Date.now(),
        latencyMs,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.state.consecutiveFailures++;

      console.error('[HeartbeatManager] Heartbeat failed:', errorMessage);

      // Notify listeners of failure
      this.notifyListeners({
        type: 'failure',
        timestamp: Date.now(),
        payload,
        error: errorMessage,
      });

      // Check if we need to trigger reconnection
      if (this.state.consecutiveFailures >= this.config.maxRetries) {
        this.handleReconnection();
      }

      return {
        success: false,
        timestamp: Date.now(),
        error: errorMessage,
      };
    }
  }

  /**
   * Build heartbeat payload
   */
  private buildHeartbeatPayload(): HeartbeatPayload {
    return {
      clientId: this.clientId,
      userId: this.userId || '',
      timestamp: Date.now(),
      appVersion: getClientVersion(),
      mode: detectAppMode(),
      isInDemoMode: this.isInDemoMode,
      activePomodoroId: this.activePomodoroId,
      deviceName: getDeviceName(),
    };
  }

  /**
   * Get connection quality based on failure count
   */
  private getConnectionQuality(): 'good' | 'degraded' | 'poor' {
    if (this.state.consecutiveFailures === 0) {
      return 'good';
    } else if (this.state.consecutiveFailures < this.config.maxRetries) {
      return 'degraded';
    }
    return 'poor';
  }

  /**
   * Get desktop client capabilities
   */
  private getCapabilities(): string[] {
    return [
      'sensor:app_usage',
      'sensor:idle_detection',
      'sensor:window_change',
      'action:close_app',
      'action:hide_app',
      'action:bring_to_front',
      'action:notification',
    ];
  }

  /**
   * Get uptime in seconds
   */
  private getUptime(): number {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const os = require('os');
      return Math.floor(os.uptime());
    } catch {
      return 0;
    }
  }

  /**
   * Start the heartbeat timer
   */
  private startHeartbeatTimer(): void {
    this.stopHeartbeatTimer();

    this.heartbeatTimer = setInterval(() => {
      if (this.state.isRunning) {
        this.sendHeartbeat();
      }
    }, this.config.intervalMs);
  }

  /**
   * Stop the heartbeat timer
   */
  private stopHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Handle reconnection after consecutive failures
   * Requirements: 1.4
   */
  private handleReconnection(): void {
    console.log('[HeartbeatManager] Triggering reconnection after consecutive failures');

    // Notify listeners
    this.notifyListeners({
      type: 'reconnecting',
      timestamp: Date.now(),
    });

    // Stop current heartbeat timer
    this.stopHeartbeatTimer();

    // Schedule reconnection attempt
    this.stopReconnectTimer();
    this.reconnectTimer = setTimeout(async () => {
      try {
        const connectionManager = getConnectionManager();
        await connectionManager.reconnect();
        
        // Reset failure count and restart heartbeat timer
        this.state.consecutiveFailures = 0;
        this.startHeartbeatTimer();
      } catch (error) {
        console.error('[HeartbeatManager] Reconnection failed:', error);
        // Will retry on next heartbeat cycle
        this.startHeartbeatTimer();
      }
    }, this.config.reconnectDelayMs);
  }

  /**
   * Stop the reconnect timer
   */
  private stopReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Notify all listeners of a heartbeat event
   */
  private notifyListeners(event: HeartbeatEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('[HeartbeatManager] Listener error:', error);
      }
    });
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HeartbeatConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Restart timer if running with new interval
    if (this.state.isRunning && config.intervalMs) {
      this.startHeartbeatTimer();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): HeartbeatConfig {
    return { ...this.config };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stop();
    this.listeners.clear();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let heartbeatManager: HeartbeatManager | null = null;

/**
 * Get the heartbeat manager singleton
 */
export function getHeartbeatManager(): HeartbeatManager {
  if (!heartbeatManager) {
    heartbeatManager = new HeartbeatManager();
  }
  return heartbeatManager;
}

/**
 * Initialize heartbeat manager with config
 */
export function initializeHeartbeatManager(config: Partial<HeartbeatConfig>): HeartbeatManager {
  if (heartbeatManager) {
    heartbeatManager.destroy();
  }
  heartbeatManager = new HeartbeatManager(config);
  return heartbeatManager;
}

/**
 * Reset heartbeat manager (for testing)
 */
export function resetHeartbeatManager(): void {
  if (heartbeatManager) {
    heartbeatManager.destroy();
    heartbeatManager = null;
  }
}

export { HeartbeatManager };
