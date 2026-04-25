/**
 * Connection Manager Module
 * 
 * Manages WebSocket connection to the VibeFlow server with automatic
 * reconnection, status tracking, event notifications, and Octopus protocol support.
 * 
 * Requirements: 1.7 - Connection status indicator and automatic retry
 * Requirements: 4.11, 4.12, 4.13 - WebSocket connection with client registration
 * Requirements: 9.4, 9.5, 9.6 - Secure WebSocket connection (WSS) with certificate verification
 */

import { app, BrowserWindow } from 'electron';
import * as https from 'https';
import * as tls from 'tls';
import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { createCommandHandler, createStateManager, type StateSnapshot } from '@vibeflow/octopus-protocol';
import type {
  DesktopEvent,
  DesktopCommand,
  ClientRegistrationRequest,
  ClientRegistrationResponse,
  CommandAcknowledgment,
  DesktopPolicy,
  ConnectionQuality,
} from '../types';

// Connection status types
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

// Connection event types
export interface ConnectionEvent {
  status: ConnectionStatus;
  timestamp: number;
  error?: string;
  attemptNumber?: number;
  nextRetryIn?: number;
}

// Retry strategy configuration
export interface RetryStrategy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

// Security configuration (Requirements: 9.4, 9.5, 9.6)
export interface SecurityConfig {
  /** Use secure WebSocket (WSS) connection */
  useSecureConnection: boolean;
  /** Verify server certificate (disable only for development) */
  verifyCertificate: boolean;
  /** Custom CA certificates (PEM format) */
  customCACerts?: string[];
  /** Reject unauthorized certificates */
  rejectUnauthorized: boolean;
  /** Minimum TLS version */
  minTLSVersion: 'TLSv1.2' | 'TLSv1.3';
}

// Connection manager configuration
export interface ConnectionManagerConfig {
  serverUrl: string;
  retryStrategy: RetryStrategy;
  pingIntervalMs: number;
  pingTimeoutMs: number;
  security: SecurityConfig;
  /** Heartbeat interval in milliseconds */
  heartbeatIntervalMs: number;
}

// Default retry strategy
const DEFAULT_RETRY_STRATEGY: RetryStrategy = {
  maxAttempts: 10,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 1.5,
};

// Detect if running in development mode (consistent with main.ts logic)
const isDevelopment = process.env.NODE_ENV === 'development' || (!app.isPackaged && process.env.NODE_ENV !== 'production');

// Default security configuration (Requirements: 9.4, 9.5, 9.6)
// In development, disable secure connection to allow HTTP
const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  useSecureConnection: !isDevelopment,
  verifyCertificate: !isDevelopment,
  rejectUnauthorized: !isDevelopment,
  minTLSVersion: 'TLSv1.2',
};

// Default configuration
const DEFAULT_CONFIG: ConnectionManagerConfig = {
  serverUrl: 'http://localhost:3000',
  retryStrategy: DEFAULT_RETRY_STRATEGY,
  pingIntervalMs: 25000,
  pingTimeoutMs: 5000,
  security: DEFAULT_SECURITY_CONFIG,
  heartbeatIntervalMs: 30000,
};

// Connection state
interface ConnectionState {
  status: ConnectionStatus;
  lastConnectedAt: number | null;
  lastDisconnectedAt: number | null;
  reconnectAttempts: number;
  lastError: string | null;
  isManualDisconnect: boolean;
  isSecure: boolean;
  certificateInfo: CertificateInfo | null;
  /** Registered client ID from server */
  clientId: string | null;
  /** User ID for the current session */
  userId: string | null;
  /** Current policy version */
  policyVersion: number | null;
  /** Event sequence number */
  sequenceNumber: number;
  /** Session cookie header for cookie-based authentication */
  sessionCookie: string | null;
}

// Certificate information (Requirements: 9.5, 9.6)
interface CertificateInfo {
  issuer: string;
  subject: string;
  validFrom: string;
  validTo: string;
  fingerprint: string;
  isValid: boolean;
}

// Event listener type
type ConnectionEventListener = (event: ConnectionEvent) => void;

// Command handler type
type CommandHandler = (command: DesktopCommand) => void;

// Policy update handler type
type PolicyUpdateHandler = (policy: DesktopPolicy) => void;

// State change handler type
type StateChangeHandler = (state: string) => void;

// Execute command from server (pomodoro complete, idle alert, etc.)
export interface ExecuteCommand {
  action: string;
  params: Record<string, unknown>;
}

// Execute command handler type
type ExecuteCommandHandler = (command: ExecuteCommand) => void;

/**
 * Desktop client capabilities
 * Requirements: 4.1-4.5
 */
const DESKTOP_CAPABILITIES = [
  'sensor:app_usage',      // Track running applications
  'sensor:idle_detection', // Detect user idle time
  'sensor:window_change',  // Detect active window changes
  'action:close_app',      // Force quit applications
  'action:hide_app',       // Hide application windows
  'action:bring_to_front', // Bring window to foreground
  'action:notification',   // Show system notifications
];

/**
 * Get the desktop client version
 */
function getClientVersion(): string {
  // In a real app, this would come from package.json
  return '1.0.0';
}

/**
 * Get the device name
 */
function getDeviceName(): string {
  const os = require('os');
  return os.hostname() || 'Desktop';
}

/**
 * Connection Manager
 * 
 * Handles WebSocket connection lifecycle with automatic reconnection.
 * Supports secure WebSocket (WSS) connections with certificate verification.
 * Implements Octopus protocol for client registration and event/command streaming.
 * 
 * Requirements: 1.7, 4.11, 4.12, 4.13, 9.4, 9.5, 9.6
 */
class ConnectionManager {
  private config: ConnectionManagerConfig;
  private state: ConnectionState;
  private mainWindow: BrowserWindow | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private slowRetryTimer: ReturnType<typeof setInterval> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<ConnectionEventListener> = new Set();
  private commandHandlers: Set<CommandHandler> = new Set();
  private policyUpdateHandlers: Set<PolicyUpdateHandler> = new Set();
  private stateChangeHandlers: Set<StateChangeHandler> = new Set();
  private executeCommandHandlers: Set<ExecuteCommandHandler> = new Set();
  private socket: Socket | null = null;
  private startTime: number = Date.now();
  private cookieProvider: (() => Promise<string | null>) | null = null;

  // SDK state manager — tracks local state snapshot for main process consumers
  private stateManager = createStateManager({
    onStateChange: (snapshot: StateSnapshot, changedKeys: (keyof StateSnapshot)[]) => {
      // Forward full snapshot to renderer
      this.sendToRenderer('octopus:stateSync', {
        commandType: 'SYNC_STATE',
        payload: { syncType: 'full' as const, version: 0, state: snapshot },
      });
      // Notify state change handlers if systemState changed
      if (changedKeys.includes('systemState') && snapshot.systemState?.state) {
        this.notifyStateChange(snapshot.systemState.state);
        this.sendToRenderer('system:stateChange', { state: snapshot.systemState.state });
      }
      // Notify policy update handlers if policy changed
      if (changedKeys.includes('policy') && snapshot.policy) {
        this.state.policyVersion = snapshot.policy.config.version;
        this.notifyPolicyUpdate(snapshot.policy as DesktopPolicy);
      }
    },
  });

  // SDK command handler — shared switch/case for OCTOPUS_COMMAND routing
  private handleOctopusCommand = createCommandHandler({
    onStateSync: (payload) => {
      this.stateManager.handleSync(payload);
    },
    onPolicyUpdate: (payload) => {
      this.stateManager.handlePolicyUpdate(payload);
    },
    onExecuteAction: (payload) => {
      const legacyCommand: ExecuteCommand = {
        action: payload.action as string,
        params: payload.parameters ?? {},
      };
      this.notifyExecuteCommand(legacyCommand);
      this.sendToRenderer('execute:command', legacyCommand);
    },
    onShowUI: (payload) => {
      this.sendToRenderer('octopus:showUI', payload);
    },
    onActionResult: (payload) => {
      this.sendToRenderer('octopus:actionResult', payload);
    },
  });

  constructor(config: Partial<ConnectionManagerConfig> = {}) {
    this.config = { 
      ...DEFAULT_CONFIG, 
      ...config,
      security: { ...DEFAULT_SECURITY_CONFIG, ...config.security },
    };
    this.state = {
      status: 'disconnected',
      lastConnectedAt: null,
      lastDisconnectedAt: null,
      reconnectAttempts: 0,
      lastError: null,
      isManualDisconnect: false,
      isSecure: false,
      certificateInfo: null,
      clientId: null,
      userId: null,
      policyVersion: null,
      sequenceNumber: 0,
      sessionCookie: null,
    };
  }

  /**
   * Set the main window reference for IPC communication
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Update server URL
   */
  setServerUrl(url: string): void {
    this.config.serverUrl = url;
  }

  /**
   * Update security configuration (Requirements: 9.4, 9.5, 9.6)
   */
  updateSecurityConfig(security: Partial<SecurityConfig>): void {
    this.config.security = { ...this.config.security, ...security };
  }

  /**
   * Get current connection status
   */
  getStatus(): ConnectionStatus {
    return this.state.status;
  }

  /**
   * Get full connection state
   */
  getState(): ConnectionState {
    return { ...this.state };
  }

  /**
   * Get protocol state snapshot (from SDK state manager)
   */
  getStateSnapshot(): StateSnapshot {
    return this.stateManager.getState();
  }

  /**
   * Check if full sync has been received since last reconnect
   */
  isFullSyncReceived(): boolean {
    return this.stateManager.isFullSyncReceived();
  }

  /**
   * Get connection info for UI display
   */
  getConnectionInfo(): {
    status: ConnectionStatus;
    serverUrl: string;
    lastConnectedAt: number | null;
    reconnectAttempts: number;
    nextRetryIn: number | null;
    error: string | null;
    isSecure: boolean;
    certificateInfo: CertificateInfo | null;
  } {
    return {
      status: this.state.status,
      serverUrl: this.config.serverUrl,
      lastConnectedAt: this.state.lastConnectedAt,
      reconnectAttempts: this.state.reconnectAttempts,
      nextRetryIn: this.calculateNextRetryDelay(),
      error: this.state.lastError,
      isSecure: this.state.isSecure,
      certificateInfo: this.state.certificateInfo,
    };
  }

  /**
   * Get security configuration
   */
  getSecurityConfig(): SecurityConfig {
    return { ...this.config.security };
  }

  /**
   * Check if connection is secure (using WSS)
   */
  isSecureConnection(): boolean {
    return this.state.isSecure;
  }

  /**
   * Subscribe to connection events
   */
  onConnectionChange(listener: ConnectionEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Subscribe to command events
   * Requirements: 2.4
   */
  onCommand(handler: CommandHandler): () => void {
    this.commandHandlers.add(handler);
    return () => this.commandHandlers.delete(handler);
  }

  /**
   * Subscribe to policy update events
   * Requirements: 10.2, 10.3
   */
  onPolicyUpdate(handler: PolicyUpdateHandler): () => void {
    this.policyUpdateHandlers.add(handler);
    return () => this.policyUpdateHandlers.delete(handler);
  }

  /**
   * Subscribe to state change events
   * Receives real-time state changes (LOCKED, PLANNING, FOCUS, REST, OVER_REST)
   */
  onStateChange(handler: StateChangeHandler): () => void {
    this.stateChangeHandlers.add(handler);
    return () => this.stateChangeHandlers.delete(handler);
  }

  /**
   * Subscribe to execute command events from server
   * Receives commands like POMODORO_COMPLETE, IDLE_ALERT, etc.
   */
  onExecuteCommand(handler: ExecuteCommandHandler): () => void {
    this.executeCommandHandlers.add(handler);
    return () => this.executeCommandHandlers.delete(handler);
  }

  /**
   * Set user ID for the session
   * Requirements: 4.11
   */
  setUserId(userId: string): void {
    this.state.userId = userId;
  }

  /**
   * Set a cookie provider that returns the latest session cookie header.
   * Called before each socket connection to get fresh cookies.
   */
  setCookieProvider(provider: () => Promise<string | null>): void {
    this.cookieProvider = provider;
  }

  /**
   * Get current client ID
   */
  getClientId(): string | null {
    return this.state.clientId;
  }

  /**
   * Get the secure URL for the server
   * Converts HTTP to HTTPS if secure connection is enabled
   */
  private getSecureUrl(url: string): string {
    const { useSecureConnection } = this.config.security;
    
    if (useSecureConnection) {
      return url.replace(/^http:/, 'https:').replace(/^ws:/, 'wss:');
    }
    return url;
  }

  /**
   * Get HTTPS agent options for secure connections (Requirements: 9.5, 9.6)
   */
  private getHttpsAgentOptions(): https.AgentOptions {
    const { verifyCertificate, rejectUnauthorized, customCACerts, minTLSVersion } = this.config.security;
    
    const options: https.AgentOptions = {
      rejectUnauthorized: verifyCertificate && rejectUnauthorized,
      minVersion: minTLSVersion,
    };

    if (customCACerts && customCACerts.length > 0) {
      options.ca = customCACerts;
    }

    return options;
  }

  /**
   * Verify server certificate (Requirements: 9.5, 9.6)
   */
  async verifyCertificate(): Promise<{ valid: boolean; info: CertificateInfo | null; error?: string }> {
    const url = new URL(this.getSecureUrl(this.config.serverUrl));
    
    // Only verify for HTTPS connections
    if (url.protocol !== 'https:') {
      return { valid: true, info: null };
    }

    return new Promise((resolve) => {
      const options: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 443,
        path: '/',
        method: 'HEAD',
        ...this.getHttpsAgentOptions(),
      };

      const req = https.request(options, (res) => {
        const socket = res.socket as tls.TLSSocket;
        const cert = socket.getPeerCertificate();
        
        if (cert && Object.keys(cert).length > 0) {
          const certInfo: CertificateInfo = {
            issuer: typeof cert.issuer === 'object' ? cert.issuer.O || cert.issuer.CN || 'Unknown' : 'Unknown',
            subject: typeof cert.subject === 'object' ? cert.subject.CN || cert.subject.O || 'Unknown' : 'Unknown',
            validFrom: cert.valid_from || 'Unknown',
            validTo: cert.valid_to || 'Unknown',
            fingerprint: cert.fingerprint || 'Unknown',
            isValid: socket.authorized,
          };

          this.state.certificateInfo = certInfo;
          this.state.isSecure = true;

          resolve({
            valid: socket.authorized,
            info: certInfo,
            error: socket.authorized ? undefined : (socket.authorizationError?.message || 'Certificate authorization failed'),
          });
        } else {
          resolve({
            valid: false,
            info: null,
            error: 'No certificate received from server',
          });
        }
      });

      req.on('error', (error) => {
        resolve({
          valid: false,
          info: null,
          error: error.message,
        });
      });

      req.setTimeout(5000, () => {
        req.destroy();
        resolve({
          valid: false,
          info: null,
          error: 'Certificate verification timeout',
        });
      });

      req.end();
    });
  }

  /**
   * Check if server is reachable via HTTP/HTTPS
   * Uses secure connection if configured (Requirements: 9.4)
   */
  async checkServerHealth(): Promise<boolean> {
    try {
      const serverUrl = this.getSecureUrl(this.config.serverUrl);
      const url = new URL(`${serverUrl}/api/health`);
      const isHttps = url.protocol === 'https:';

      console.log('[ConnectionManager] Health check URL:', url.toString());
      console.log('[ConnectionManager] Security config:', {
        useSecureConnection: this.config.security.useSecureConnection,
        verifyCertificate: this.config.security.verifyCertificate,
        rejectUnauthorized: this.config.security.rejectUnauthorized,
      });

      // For HTTPS, verify certificate first if enabled
      if (isHttps && this.config.security.verifyCertificate) {
        const certResult = await this.verifyCertificate();
        if (!certResult.valid) {
          console.warn('[ConnectionManager] Certificate verification failed:', certResult.error);
          if (this.config.security.rejectUnauthorized) {
            this.state.lastError = `Certificate error: ${certResult.error}`;
            return false;
          }
        }
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      // Create fetch options with proper agent for HTTPS
      const fetchOptions: RequestInit = {
        method: 'GET',
        signal: controller.signal,
      };

      console.log('[ConnectionManager] Fetching health endpoint...');
      const response = await fetch(url.toString(), fetchOptions);
      console.log('[ConnectionManager] Health check response:', response.status, response.ok);

      clearTimeout(timeoutId);
      this.state.isSecure = isHttps;
      return response.ok;
    } catch (error) {
      this.state.isSecure = false;
      console.error('[ConnectionManager] Health check failed:', error);
      return false;
    }
  }

  /**
   * Start connection monitoring and establish WebSocket connection
   * Requirements: 4.11, 4.12
   */
  async connect(): Promise<void> {
    console.log('[ConnectionManager] connect() called, current status:', this.state.status);
    if (this.state.status === 'connected' || this.state.status === 'connecting') {
      console.log('[ConnectionManager] Already connected or connecting, skipping');
      return;
    }

    this.state.isManualDisconnect = false;
    this.updateStatus('connecting');

    // Check server health first (includes certificate verification for HTTPS)
    console.log('[ConnectionManager] Checking server health...');
    const isHealthy = await this.checkServerHealth();
    console.log('[ConnectionManager] Server health check result:', isHealthy);

    if (isHealthy) {
      await this.establishSocketConnection();
    } else {
      console.error('[ConnectionManager] Server not healthy, error:', this.state.lastError);
      this.handleConnectionError(this.state.lastError || 'Server is not reachable');
    }
  }

  /**
   * Establish Socket.io connection
   * Requirements: 4.11, 4.12, 4.13
   */
  private async establishSocketConnection(): Promise<void> {
    try {
      const serverUrl = this.getSecureUrl(this.config.serverUrl);

      // Re-read cookie from provider on each connection attempt (may have been refreshed)
      if (this.cookieProvider) {
        this.state.sessionCookie = await this.cookieProvider();
      }

      const auth: Record<string, string | undefined> = {
        clientType: 'desktop',
        userId: this.state.userId ?? undefined,
      };

      // Build socket options — pass session cookie via extraHeaders
      // so the server authenticates via the same cookie path as Web clients
      const socketOptions: Parameters<typeof io>[1] = {
        transports: ['websocket', 'polling'],
        reconnection: false,
        timeout: 10000,
        autoConnect: false,
        auth,
      };

      if (this.state.sessionCookie) {
        socketOptions.extraHeaders = { Cookie: this.state.sessionCookie };
      } else {
        console.warn('[ConnectionManager] No session cookie — connection may fail');
      }

      this.socket = io(serverUrl, socketOptions);

      // Set up socket event handlers BEFORE connecting
      this.setupSocketHandlers();

      // Now connect
      this.socket.connect();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.handleConnectionError(`Socket connection failed: ${errorMessage}`);
    }
  }

  /**
   * Set up Socket.io event handlers
   * Requirements: 4.11, 4.12, 4.13
   */
  private setupSocketHandlers(): void {
    if (!this.socket) return;

    // Connection established
    this.socket.on('connect', () => {
      console.log('[ConnectionManager] Socket connected');
      this.registerClient();
    });

    // Connection error
    this.socket.on('connect_error', (error) => {
      console.error('[ConnectionManager] Socket connection error:', error);
      this.handleConnectionError(error.message);
    });

    // Disconnection
    this.socket.on('disconnect', (reason) => {
      console.log('[ConnectionManager] Socket disconnected:', reason);
      this.state.lastDisconnectedAt = Date.now();
      this.stopHeartbeat();
      this.stateManager.onReconnecting();

      if (!this.state.isManualDisconnect) {
        this.handleConnectionError(`Disconnected: ${reason}`);
      } else {
        this.updateStatus('disconnected');
      }
    });

    // Client registration response
    this.socket.on('client:registered', (response: ClientRegistrationResponse) => {
      console.log('[ConnectionManager] client:registered received:', JSON.stringify(response));
      if (response.success && response.clientId) {
        this.state.clientId = response.clientId;
        console.log('[ConnectionManager] Client registered with ID:', response.clientId);
        this.handleConnected();
      } else {
        console.log('[ConnectionManager] Registration failed:', response.error);
        this.handleConnectionError(response.error || 'Client registration failed');
      }
    });

    // Command received from server (Octopus protocol — unified handler)
    this.socket.on('command', (command: DesktopCommand) => {
      console.log('[ConnectionManager] Command received:', command.commandType);
      this.handleCommand(command);
    });

    // Octopus protocol commands from server — routed via SDK createCommandHandler
    this.socket.on('OCTOPUS_COMMAND', (command: { commandType: string; payload: unknown }) => {
      console.log('[ConnectionManager] OCTOPUS_COMMAND received:', command.commandType);
      this.handleOctopusCommand(command as import('@vibeflow/octopus-protocol').OctopusCommand);
    });

    // Error from server
    this.socket.on('error', (error: { code: string; message: string }) => {
      console.error('[ConnectionManager] Server error:', error);
      this.state.lastError = error.message;
    });
  }

  /**
   * Register client with the server
   * Requirements: 9.1, 9.2
   */
  private registerClient(): void {
    if (!this.socket) return;

    const registration: ClientRegistrationRequest = {
      clientType: 'desktop',
      clientVersion: getClientVersion(),
      platform: 'macos', // TODO: Detect platform dynamically
      capabilities: DESKTOP_CAPABILITIES,
      deviceName: getDeviceName(),
    };

    console.log('[ConnectionManager] Registering client:', registration);
    this.socket.emit('client:register', registration);
  }

  /**
   * Send an event to the server
   * Requirements: 2.3, 4.1-4.5
   */
  sendEvent(event: Omit<DesktopEvent, 'eventId' | 'clientId' | 'clientType' | 'timestamp' | 'sequenceNumber'>): boolean {
    if (!this.socket || this.state.status !== 'connected' || !this.state.clientId) {
      console.warn('[ConnectionManager] Cannot send event: not connected');
      return false;
    }

    const fullEvent: DesktopEvent = {
      ...event,
      eventId: uuidv4(),
      clientId: this.state.clientId,
      clientType: 'desktop',
      timestamp: Date.now(),
      sequenceNumber: this.state.sequenceNumber++,
    } as DesktopEvent;

    this.socket.emit('event', fullEvent);
    console.log('[ConnectionManager] Event sent:', fullEvent.eventType);
    return true;
  }

  /**
   * Send command acknowledgment
   * Requirements: 2.6
   */
  private sendCommandAck(commandId: string, success: boolean, error?: string): void {
    if (!this.socket) return;

    const ack: CommandAcknowledgment = {
      commandId,
      success,
      error,
      timestamp: Date.now(),
    };

    this.socket.emit('command:ack', ack);
  }

  /**
   * Handle incoming command
   * Requirements: 2.4
   */
  private handleCommand(command: DesktopCommand): void {
    // Notify all command handlers
    this.commandHandlers.forEach((handler) => {
      try {
        handler(command);
      } catch (error) {
        console.error('[ConnectionManager] Command handler error:', error);
      }
    });

    // Send to renderer process
    this.sendToRenderer('octopus:commandReceived', command);

    // Send acknowledgment if required
    if (command.requiresAck) {
      this.sendCommandAck(command.commandId, true);
    }
  }

  /**
   * Notify policy update handlers
   */
  private notifyPolicyUpdate(policy: DesktopPolicy): void {
    this.policyUpdateHandlers.forEach((handler) => {
      try {
        handler(policy);
      } catch (error) {
        console.error('[ConnectionManager] Policy update handler error:', error);
      }
    });

    // Send to renderer process
    this.sendToRenderer('octopus:policyUpdated', policy);
  }

  /**
   * Notify state change handlers
   */
  private notifyStateChange(state: string): void {
    this.stateChangeHandlers.forEach((handler) => {
      try {
        handler(state);
      } catch (error) {
        console.error('[ConnectionManager] State change handler error:', error);
      }
    });
  }

  /**
   * Notify execute command handlers
   */
  private notifyExecuteCommand(command: ExecuteCommand): void {
    this.executeCommandHandlers.forEach((handler) => {
      try {
        handler(command);
      } catch (error) {
        console.error('[ConnectionManager] Execute command handler error:', error);
      }
    });
  }

  /**
   * Start heartbeat timer
   * Requirements: 7.5
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
   * Send heartbeat event
   * Requirements: 7.5
   */
  private sendHeartbeat(): void {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    
    this.sendEvent({
      eventType: 'HEARTBEAT',
      userId: this.state.userId || '',
      payload: {
        clientVersion: getClientVersion(),
        platform: 'macos',
        connectionQuality: this.getConnectionQuality(),
        localStateHash: '', // TODO: Calculate state hash
        capabilities: DESKTOP_CAPABILITIES,
        uptime,
      },
    });
  }

  /**
   * Get current connection quality
   */
  private getConnectionQuality(): ConnectionQuality {
    // Simple heuristic based on reconnect attempts
    if (this.state.reconnectAttempts === 0) {
      return 'good';
    } else if (this.state.reconnectAttempts < 3) {
      return 'degraded';
    }
    return 'poor';
  }

  /**
   * Disconnect and stop reconnection attempts
   */
  disconnect(): void {
    this.state.isManualDisconnect = true;
    this.stopReconnectTimer();
    this.stopSlowRetry();
    this.stopPingTimer();
    this.stopHeartbeat();

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.updateStatus('disconnected');
    this.state.lastDisconnectedAt = Date.now();
    this.state.isSecure = false;
    this.state.certificateInfo = null;
    this.state.clientId = null;
  }

  /**
   * Force reconnection
   */
  async reconnect(): Promise<void> {
    this.state.reconnectAttempts = 0;
    this.state.isManualDisconnect = false;
    this.stopSlowRetry();

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    await this.connect();
  }

  /**
   * Handle successful connection
   */
  private handleConnected(): void {
    this.state.reconnectAttempts = 0;
    this.state.lastConnectedAt = Date.now();
    this.state.lastError = null;
    this.stopSlowRetry();
    this.updateStatus('connected');
    this.startPingTimer();
    this.startHeartbeat();
  }

  /**
   * Handle connection error
   */
  private handleConnectionError(error: string): void {
    this.state.lastError = error;
    this.state.lastDisconnectedAt = Date.now();
    this.stopPingTimer();
    this.stopHeartbeat();

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    if (this.state.isManualDisconnect) {
      this.updateStatus('disconnected');
      return;
    }

    // Check if we should retry
    if (this.state.reconnectAttempts < this.config.retryStrategy.maxAttempts) {
      this.scheduleReconnect();
    } else {
      // Max fast retries exhausted — switch to slow periodic retry (every 60s)
      // to avoid the dead state where neither heartbeat nor reconnect runs.
      this.updateStatus('error', error);
      this.notifyListeners({
        status: 'error',
        timestamp: Date.now(),
        error: `Max reconnection attempts (${this.config.retryStrategy.maxAttempts}) reached. ${error}`,
      });
      this.scheduleSlowRetry();
    }
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    const delay = this.calculateNextRetryDelay();
    
    if (delay === null) {
      return;
    }

    this.updateStatus('reconnecting');
    this.state.reconnectAttempts++;

    console.log(
      `[ConnectionManager] Scheduling reconnect attempt ${this.state.reconnectAttempts}/${this.config.retryStrategy.maxAttempts} in ${Math.round(delay / 1000)}s`
    );

    this.notifyListeners({
      status: 'reconnecting',
      timestamp: Date.now(),
      attemptNumber: this.state.reconnectAttempts,
      nextRetryIn: delay,
    });

    this.reconnectTimer = setTimeout(async () => {
      await this.connect();
    }, delay);
  }

  /**
   * Schedule a slow periodic retry after fast retries are exhausted.
   * Tries once every 60 seconds to recover from transient outages
   * without giving up entirely.
   */
  private scheduleSlowRetry(): void {
    this.stopSlowRetry();
    const SLOW_RETRY_INTERVAL_MS = 60_000;
    console.log('[ConnectionManager] Starting slow retry (every 60s)');

    this.slowRetryTimer = setInterval(async () => {
      if (this.state.status === 'connected' || this.state.status === 'connecting') {
        this.stopSlowRetry();
        return;
      }
      console.log('[ConnectionManager] Slow retry: attempting reconnect…');
      this.state.reconnectAttempts = 0;
      await this.connect();
    }, SLOW_RETRY_INTERVAL_MS);
  }

  private stopSlowRetry(): void {
    if (this.slowRetryTimer) {
      clearInterval(this.slowRetryTimer);
      this.slowRetryTimer = null;
    }
  }

  /**
   * Calculate delay for next retry using exponential backoff
   */
  private calculateNextRetryDelay(): number | null {
    const { maxAttempts, initialDelayMs, maxDelayMs, backoffMultiplier } = this.config.retryStrategy;

    if (this.state.reconnectAttempts >= maxAttempts) {
      return null;
    }

    const delay = Math.min(
      initialDelayMs * Math.pow(backoffMultiplier, this.state.reconnectAttempts),
      maxDelayMs
    );

    return delay;
  }

  /**
   * Start ping timer to check connection health
   */
  private startPingTimer(): void {
    this.stopPingTimer();

    this.pingTimer = setInterval(async () => {
      const isHealthy = await this.checkServerHealth();
      
      if (!isHealthy && this.state.status === 'connected') {
        console.log('[ConnectionManager] Server health check failed');
        this.handleConnectionError('Server health check failed');
      }
    }, this.config.pingIntervalMs);
  }

  /**
   * Stop ping timer
   */
  private stopPingTimer(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * Stop reconnect timer
   */
  private stopReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Update connection status and notify
   */
  private updateStatus(status: ConnectionStatus, error?: string): void {
    const previousStatus = this.state.status;
    this.state.status = status;
    console.log('[ConnectionManager] Status changed:', previousStatus, '->', status, error ? `(error: ${error})` : '');

    if (error) {
      this.state.lastError = error;
    }

    // Notify renderer process via IPC
    console.log('[ConnectionManager] Sending status to renderer, mainWindow exists:', !!this.mainWindow);
    this.sendToRenderer('connection:statusChange', {
      status,
      previousStatus,
      error: this.state.lastError,
      timestamp: Date.now(),
    });

    // Notify listeners
    this.notifyListeners({
      status,
      timestamp: Date.now(),
      error: this.state.lastError ?? undefined,
    });
  }

  /**
   * Notify all listeners of connection event
   */
  private notifyListeners(event: ConnectionEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('[ConnectionManager] Listener error:', err);
      }
    });
  }

  /**
   * Send message to renderer process
   */
  private sendToRenderer(channel: string, data: unknown): void {
    console.log('[ConnectionManager] sendToRenderer:', channel, 'mainWindow:', !!this.mainWindow);
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  /**
   * Reset reconnection attempts (call after manual successful reconnect)
   */
  resetReconnectAttempts(): void {
    this.state.reconnectAttempts = 0;
  }

  /**
   * Update retry strategy
   */
  updateRetryStrategy(strategy: Partial<RetryStrategy>): void {
    this.config.retryStrategy = { ...this.config.retryStrategy, ...strategy };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopReconnectTimer();
    this.stopSlowRetry();
    this.stopPingTimer();
    this.stopHeartbeat();

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.listeners.clear();
    this.commandHandlers.clear();
    this.policyUpdateHandlers.clear();
    this.stateChangeHandlers.clear();
    this.mainWindow = null;
  }
}

// Singleton instance
let connectionManager: ConnectionManager | null = null;

/**
 * Get the connection manager singleton
 */
export function getConnectionManager(): ConnectionManager {
  if (!connectionManager) {
    connectionManager = new ConnectionManager();
  }
  return connectionManager;
}

/**
 * Initialize connection manager with config
 */
export function initializeConnectionManager(config: Partial<ConnectionManagerConfig>): ConnectionManager {
  if (connectionManager) {
    connectionManager.destroy();
  }
  connectionManager = new ConnectionManager(config);
  return connectionManager;
}

export { ConnectionManager };
export type { CertificateInfo };
