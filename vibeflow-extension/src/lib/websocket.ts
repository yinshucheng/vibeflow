import type { 
  ServerMessage, 
  ClientMessage, 
  PolicyCache, 
  SystemState,
  OctopusEvent,
  OctopusCommand,
  OctopusBaseEvent,
  OctopusPolicy,
  BrowserActivityEvent,
  BrowserSessionEvent,
  TabSwitchEvent,
  BrowserFocusEvent,
  HeartbeatEvent,
  EntertainmentModeEvent,
  WorkStartEvent,
  SyncStateCommand,
  ExecuteActionCommand,
  UpdatePolicyCommand,
  ShowUICommand,
} from '../types/index.js';
import { EventQueue, EventReplayManager, getEventQueue } from './event-queue.js';

export type WebSocketEventHandler = {
  onPolicySync: (policy: PolicyCache) => void;
  onStateChange: (state: SystemState) => void;
  onExecute: (command: ServerMessage['payload']) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onError: (error: Error) => void;
  // New Octopus protocol handlers (Requirements 5.21, 5.23)
  onOctopusCommand?: (command: OctopusCommand) => void;
  onPolicyUpdate?: (policy: OctopusPolicy) => void;
  onSyncState?: (payload: SyncStateCommand['payload']) => void;
  onExecuteAction?: (payload: ExecuteActionCommand['payload']) => void;
  onShowUI?: (payload: ShowUICommand['payload']) => void;
  // Entertainment mode handler (Requirements 8.6, 10.3)
  onEntertainmentModeChange?: (payload: { isActive: boolean; sessionId: string | null; endTime: number | null }) => void;
  // Entertainment quota sync handler (Requirements 5.11, 8.7)
  onEntertainmentQuotaSync?: (payload: { quotaUsed: number; quotaTotal: number; quotaRemaining: number }) => void;
};

/**
 * VibeFlow WebSocket Client
 * 
 * Connects to the VibeFlow server using Socket.io protocol.
 * Uses Engine.IO v4 protocol over native WebSocket.
 * 
 * Socket.io auth is passed via the CONNECT packet (40) payload.
 * 
 * Supports both legacy and new Octopus protocol (Requirements 5.21, 5.23)
 */
export class VibeFlowWebSocket {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private userEmail: string;
  private handlers: WebSocketEventHandler;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private pingTimeout: number = 25000;
  private isAuthenticated = false;
  
  // Octopus protocol state
  private clientId: string;
  private sequenceNumber = 0;
  
  // Event queue for offline support (Requirements: 5.26, 5.27, 5.28, 5.29)
  private eventQueue: EventQueue;
  private replayManager: EventReplayManager | null = null;
  private queueEventsWhenOffline = true;

  constructor(serverUrl: string, userEmail: string, handlers: WebSocketEventHandler) {
    this.serverUrl = serverUrl;
    this.userEmail = userEmail;
    this.handlers = handlers;
    // Generate a unique client ID for this browser extension instance
    this.clientId = this.generateClientId();
    // Initialize event queue for offline support
    this.eventQueue = getEventQueue();
    this.initializeReplayManager();
  }

  /**
   * Initialize the replay manager for event queue
   */
  private initializeReplayManager(): void {
    this.replayManager = new EventReplayManager(
      this.eventQueue,
      async (events: OctopusEvent[]) => {
        if (!this.isConnected()) {
          return false;
        }
        try {
          this.sendEvent('OCTOPUS_EVENT_BATCH', events);
          return true;
        } catch {
          return false;
        }
      }
    );
  }

  /**
   * Generate a unique client ID for this browser extension instance
   */
  private generateClientId(): string {
    // Use crypto.randomUUID if available, otherwise fallback
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return `browser_ext_${crypto.randomUUID()}`;
    }
    // Fallback for older environments
    return `browser_ext_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Get the next sequence number for events
   */
  private getNextSequenceNumber(): number {
    return this.sequenceNumber++;
  }

  /**
   * Get the current client ID
   */
  getClientId(): string {
    return this.clientId;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      // Convert HTTP URL to WebSocket URL
      let wsUrl = this.serverUrl
        .replace(/^http:/, 'ws:')
        .replace(/^https:/, 'wss:')
        .replace(/\/$/, ''); // Remove trailing slash
      
      // Socket.io v4 uses EIO=4 (Engine.IO protocol version 4)
      const socketUrl = `${wsUrl}/socket.io/?EIO=4&transport=websocket`;
      
      console.log('[WebSocket] Connecting to:', socketUrl);
      this.ws = new WebSocket(socketUrl);
      this.setupEventListeners();
    } catch (error) {
      console.error('[WebSocket] Connection error:', error);
      this.handlers.onError(error as Error);
      this.scheduleReconnect();
    }
  }

  private setupEventListeners(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      console.log('[WebSocket] Transport connected, waiting for handshake...');
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    this.ws.onclose = (event) => {
      console.log('[WebSocket] Disconnected:', event.code, event.reason || '(no reason)');
      this.cleanup();
      this.isAuthenticated = false;
      this.handlers.onDisconnect();
      // Reconnect is handled by service-worker, not here
    };

    this.ws.onerror = () => {
      // WebSocket error events don't contain useful info
      // The actual error details come through onclose
      console.error('[WebSocket] Transport error');
    };
  }

  private handleMessage(data: string): void {
    // Engine.IO protocol: first char is packet type
    // 0 = open, 1 = close, 2 = ping, 3 = pong, 4 = message, 5 = upgrade, 6 = noop
    const packetType = data.charAt(0);
    const payload = data.substring(1);

    switch (packetType) {
      case '0': // Engine.IO OPEN - handshake from server
        this.handleEngineOpen(payload);
        break;
      case '2': // Engine.IO PING
        this.sendRaw('3'); // Respond with PONG
        break;
      case '3': // Engine.IO PONG
        // Server responded to our ping
        break;
      case '4': // Engine.IO MESSAGE - contains Socket.io packet
        this.handleSocketIOPacket(payload);
        break;
      default:
        console.log('[WebSocket] Unknown Engine.IO packet:', packetType);
    }
  }

  private handleEngineOpen(payload: string): void {
    try {
      const handshake = JSON.parse(payload);
      console.log('[WebSocket] Engine.IO handshake:', {
        sid: handshake.sid,
        pingInterval: handshake.pingInterval,
        pingTimeout: handshake.pingTimeout,
      });
      
      // Use server's ping interval
      this.pingTimeout = handshake.pingInterval || 25000;
      this.startPing();
      
      // Now send Socket.io CONNECT packet with auth
      this.sendSocketIOConnect();
    } catch (error) {
      console.error('[WebSocket] Failed to parse handshake:', error);
    }
  }

  private sendSocketIOConnect(): void {
    // Socket.io CONNECT packet format: 40{auth}
    // The auth object is passed to socket.handshake.auth on server
    const auth = {
      email: this.userEmail,
    };
    
    // Engine.IO MESSAGE (4) + Socket.io CONNECT (0) + auth JSON
    const packet = `40${JSON.stringify(auth)}`;
    console.log('[WebSocket] Sending CONNECT with auth:', auth);
    this.sendRaw(packet);
  }

  private handleSocketIOPacket(payload: string): void {
    // Socket.io packet types: 0=CONNECT, 1=DISCONNECT, 2=EVENT, 3=ACK, 4=CONNECT_ERROR
    const socketIOType = payload.charAt(0);
    const socketIOPayload = payload.substring(1);

    switch (socketIOType) {
      case '0': // CONNECT - successful connection
        this.handleSocketIOConnect(socketIOPayload);
        break;
      case '1': // DISCONNECT
        console.log('[WebSocket] Server sent DISCONNECT');
        this.handlers.onDisconnect();
        break;
      case '2': // EVENT
        this.handleSocketIOEvent(socketIOPayload);
        break;
      case '4': // CONNECT_ERROR
        this.handleSocketIOError(socketIOPayload);
        break;
      default:
        console.log('[WebSocket] Unknown Socket.io packet:', socketIOType);
    }
  }

  private handleSocketIOConnect(payload: string): void {
    console.log('[WebSocket] Successfully connected to Socket.io namespace');
    this.isAuthenticated = true;
    this.handlers.onConnect();
    
    // Request initial policy sync
    this.sendEvent('REQUEST_POLICY');
    
    // Replay queued events on reconnect (Requirements: 5.28)
    this.replayQueuedEvents();
  }

  /**
   * Replay queued events after reconnection
   * Requirements: 5.28
   */
  private async replayQueuedEvents(): Promise<void> {
    if (!this.replayManager) return;
    
    try {
      const replayedCount = await this.replayManager.replayAll();
      if (replayedCount > 0) {
        console.log(`[WebSocket] Replayed ${replayedCount} queued events`);
      }
    } catch (error) {
      console.error('[WebSocket] Failed to replay queued events:', error);
    }
  }

  private handleSocketIOError(payload: string): void {
    try {
      const error = JSON.parse(payload);
      console.error('[WebSocket] Socket.io CONNECT_ERROR:', error);
      this.handlers.onError(new Error(error.message || 'Authentication failed'));
    } catch {
      console.error('[WebSocket] Socket.io CONNECT_ERROR:', payload);
      this.handlers.onError(new Error('Connection rejected by server'));
    }
  }

  private handleSocketIOEvent(payload: string): void {
    try {
      const parsed = JSON.parse(payload);
      const eventName = parsed[0];
      const eventData = parsed[1];
      
      console.log('[WebSocket] Event received:', eventName);

      switch (eventName) {
        case 'SYNC_POLICY':
          this.handlers.onPolicySync(eventData as PolicyCache);
          break;
        case 'STATE_CHANGE':
          this.handlers.onStateChange((eventData as { state: SystemState }).state);
          break;
        case 'EXECUTE':
          this.handlers.onExecute(eventData as ServerMessage['payload']);
          break;
        // New Octopus protocol commands (Requirements 5.21, 5.23)
        case 'OCTOPUS_COMMAND':
          this.handleOctopusCommand(eventData as OctopusCommand);
          break;
        case 'SYNC_STATE':
          if (this.handlers.onSyncState) {
            this.handlers.onSyncState((eventData as SyncStateCommand).payload);
          }
          break;
        case 'EXECUTE_ACTION':
          if (this.handlers.onExecuteAction) {
            this.handlers.onExecuteAction((eventData as ExecuteActionCommand).payload);
          }
          break;
        case 'UPDATE_POLICY':
          if (this.handlers.onPolicyUpdate) {
            this.handlers.onPolicyUpdate((eventData as UpdatePolicyCommand).payload.policy);
          }
          break;
        case 'SHOW_UI':
          if (this.handlers.onShowUI) {
            this.handlers.onShowUI((eventData as ShowUICommand).payload);
          }
          break;
        // Entertainment mode state change (Requirements 8.6, 10.3)
        case 'ENTERTAINMENT_MODE_CHANGE':
          if (this.handlers.onEntertainmentModeChange) {
            this.handlers.onEntertainmentModeChange(eventData as { isActive: boolean; sessionId: string | null; endTime: number | null });
          }
          break;
        // Entertainment quota sync (Requirements 5.11, 8.7)
        case 'ENTERTAINMENT_QUOTA_SYNC':
          if (this.handlers.onEntertainmentQuotaSync) {
            this.handlers.onEntertainmentQuotaSync(eventData as { quotaUsed: number; quotaTotal: number; quotaRemaining: number });
          }
          break;
        case 'error':
          console.error('[WebSocket] Server error:', eventData);
          break;
        default:
          console.log('[WebSocket] Unhandled event:', eventName, eventData);
      }
    } catch (error) {
      console.error('[WebSocket] Failed to parse event:', error, payload);
    }
  }

  /**
   * Handle Octopus protocol commands
   * Requirements: 5.21, 5.23
   */
  private handleOctopusCommand(command: OctopusCommand): void {
    console.log('[WebSocket] Octopus command received:', command.commandType);
    
    // Call the generic handler if provided
    if (this.handlers.onOctopusCommand) {
      this.handlers.onOctopusCommand(command);
    }

    // Route to specific handlers based on command type
    switch (command.commandType) {
      case 'SYNC_STATE':
        if (this.handlers.onSyncState) {
          this.handlers.onSyncState((command as SyncStateCommand).payload);
        }
        break;
      case 'EXECUTE_ACTION':
        if (this.handlers.onExecuteAction) {
          this.handlers.onExecuteAction((command as ExecuteActionCommand).payload);
        }
        break;
      case 'UPDATE_POLICY':
        if (this.handlers.onPolicyUpdate) {
          this.handlers.onPolicyUpdate((command as UpdatePolicyCommand).payload.policy);
        }
        break;
      case 'SHOW_UI':
        if (this.handlers.onShowUI) {
          this.handlers.onShowUI((command as ShowUICommand).payload);
        }
        break;
    }

    // Send acknowledgment if required
    if (command.requiresAck) {
      this.sendCommandAck(command.commandId);
    }
  }

  /**
   * Send command acknowledgment
   */
  private sendCommandAck(commandId: string): void {
    this.sendEvent('COMMAND_ACK', { commandId, timestamp: Date.now() });
  }

  /**
   * Send a Socket.io event
   */
  sendEvent(eventName: string, data?: unknown): void {
    if (!this.isConnected()) {
      console.warn('[WebSocket] Cannot send event, not connected');
      return;
    }

    // Engine.IO MESSAGE (4) + Socket.io EVENT (2) + JSON array
    const eventArray = data !== undefined ? [eventName, data] : [eventName];
    const packet = `42${JSON.stringify(eventArray)}`;
    this.sendRaw(packet);
  }

  /**
   * Send a client message (for compatibility)
   */
  send(message: ClientMessage): void {
    this.sendEvent(message.type, message.payload);
  }

  private sendRaw(data: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  private startPing(): void {
    // Note: In Socket.io/Engine.IO protocol, the SERVER sends pings and CLIENT responds with pongs.
    // We handle server pings in handleMessage() case '2' by responding with '3' (pong).
    // We don't need to send our own pings - just respond to server's pings.
    // Removing client-initiated pings to avoid protocol confusion.
  }

  private cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[WebSocket] Max reconnect attempts reached');
      this.handlers.onError(new Error('Unable to connect to server. Please check if the server is running.'));
      return;
    }

    const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts);
    console.log(`[WebSocket] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})...`);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  disconnect(): void {
    this.cleanup();
    this.isAuthenticated = false;
    
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        // Send Socket.io DISCONNECT: Engine.IO MESSAGE (4) + Socket.io DISCONNECT (1)
        this.sendRaw('41');
      }
      this.ws.close(1000, 'User disconnect');
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.isAuthenticated;
  }

  /**
   * Reset reconnect counter (call after successful manual reconnect)
   */
  resetReconnectAttempts(): void {
    this.reconnectAttempts = 0;
  }

  // =============================================================================
  // OCTOPUS PROTOCOL METHODS (Requirements 5.21, 5.23)
  // =============================================================================

  /**
   * Create base event fields for Octopus events
   */
  private createBaseEventFields(eventType: OctopusBaseEvent['eventType']): Omit<OctopusBaseEvent, 'payload'> {
    return {
      eventId: this.generateEventId(),
      eventType,
      userId: this.userEmail, // Using email as userId for now
      clientId: this.clientId,
      clientType: 'browser_ext',
      timestamp: Date.now(),
      sequenceNumber: this.getNextSequenceNumber(),
    };
  }

  /**
   * Generate a unique event ID
   */
  private generateEventId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Send an Octopus protocol event
   * Requirements: 5.21, 5.26, 5.27
   * 
   * If offline and queueEventsWhenOffline is true, events will be queued
   * for replay when connection is restored.
   */
  sendOctopusEvent(event: OctopusEvent): void {
    if (!this.isConnected()) {
      if (this.queueEventsWhenOffline) {
        // Queue event for later replay (Requirements: 5.26, 5.27)
        this.eventQueue.enqueue(event).then(queued => {
          if (queued) {
            console.log('[WebSocket] Event queued for offline replay:', event.eventType);
          }
        }).catch(error => {
          console.error('[WebSocket] Failed to queue event:', error);
        });
      } else {
        console.warn('[WebSocket] Cannot send Octopus event, not connected');
      }
      return;
    }
    this.sendEvent('OCTOPUS_EVENT', event);
  }

  /**
   * Send a browser activity event
   * Requirements: 5.18
   */
  sendBrowserActivity(payload: BrowserActivityEvent['payload']): void {
    const event: BrowserActivityEvent = {
      ...this.createBaseEventFields('BROWSER_ACTIVITY'),
      eventType: 'BROWSER_ACTIVITY',
      payload,
    };
    this.sendOctopusEvent(event);
  }

  /**
   * Send a browser session event
   * Requirements: 5.19
   */
  sendBrowserSession(payload: BrowserSessionEvent['payload']): void {
    const event: BrowserSessionEvent = {
      ...this.createBaseEventFields('BROWSER_SESSION'),
      eventType: 'BROWSER_SESSION',
      payload,
    };
    this.sendOctopusEvent(event);
  }

  /**
   * Send a tab switch event
   * Requirements: 5.3, 5.17
   */
  sendTabSwitch(payload: TabSwitchEvent['payload']): void {
    const event: TabSwitchEvent = {
      ...this.createBaseEventFields('TAB_SWITCH'),
      eventType: 'TAB_SWITCH',
      payload,
    };
    this.sendOctopusEvent(event);
  }

  /**
   * Send a browser focus event
   * Requirements: 5.9, 5.16
   */
  sendBrowserFocus(payload: BrowserFocusEvent['payload']): void {
    const event: BrowserFocusEvent = {
      ...this.createBaseEventFields('BROWSER_FOCUS'),
      eventType: 'BROWSER_FOCUS',
      payload,
    };
    this.sendOctopusEvent(event);
  }

  /**
   * Send a heartbeat event
   */
  sendHeartbeat(payload: HeartbeatEvent['payload']): void {
    const event: HeartbeatEvent = {
      ...this.createBaseEventFields('HEARTBEAT'),
      eventType: 'HEARTBEAT',
      payload,
    };
    this.sendOctopusEvent(event);
  }

  /**
   * Send an entertainment mode event
   * Requirements: 8.6, 10.3
   */
  sendEntertainmentMode(payload: EntertainmentModeEvent['payload']): void {
    const event: EntertainmentModeEvent = {
      ...this.createBaseEventFields('ENTERTAINMENT_MODE'),
      eventType: 'ENTERTAINMENT_MODE',
      payload,
    };
    this.sendOctopusEvent(event);
  }

  /**
   * Send a work start event
   * Requirements: 14.1, 14.2, 14.9, 14.10
   */
  sendWorkStart(payload: WorkStartEvent['payload']): void {
    const event: WorkStartEvent = {
      ...this.createBaseEventFields('WORK_START'),
      eventType: 'WORK_START',
      payload,
    };
    this.sendOctopusEvent(event);
  }

  /**
   * Send multiple Octopus events in a batch
   * Requirements: 5.20
   */
  sendOctopusEventBatch(events: OctopusEvent[]): void {
    if (!this.isConnected()) {
      console.warn('[WebSocket] Cannot send Octopus event batch, not connected');
      return;
    }
    // Limit batch size to 50 events as per requirements
    const batchSize = 50;
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      this.sendEvent('OCTOPUS_EVENT_BATCH', batch);
    }
  }

  /**
   * Get the current sequence number (for debugging/testing)
   */
  getCurrentSequenceNumber(): number {
    return this.sequenceNumber;
  }

  /**
   * Reset sequence number (call on reconnect if needed)
   */
  resetSequenceNumber(): void {
    this.sequenceNumber = 0;
  }

  // =============================================================================
  // OFFLINE QUEUE MANAGEMENT (Requirements 5.26, 5.27, 5.28, 5.29)
  // =============================================================================

  /**
   * Enable or disable offline event queueing
   */
  setQueueEventsWhenOffline(enabled: boolean): void {
    this.queueEventsWhenOffline = enabled;
  }

  /**
   * Check if offline event queueing is enabled
   */
  isQueueEventsWhenOfflineEnabled(): boolean {
    return this.queueEventsWhenOffline;
  }

  /**
   * Get the event queue instance
   */
  getEventQueue(): EventQueue {
    return this.eventQueue;
  }

  /**
   * Get the number of pending events in the queue
   */
  async getPendingEventCount(): Promise<number> {
    return this.eventQueue.size();
  }

  /**
   * Manually trigger replay of queued events
   * Requirements: 5.28
   */
  async manualReplayQueuedEvents(): Promise<number> {
    if (!this.replayManager) {
      console.warn('[WebSocket] Replay manager not initialized');
      return 0;
    }
    
    if (!this.isConnected()) {
      console.warn('[WebSocket] Cannot replay events, not connected');
      return 0;
    }
    
    return this.replayManager.replayAll();
  }

  /**
   * Clear all queued events
   */
  async clearEventQueue(): Promise<void> {
    await this.eventQueue.clear();
  }
}
