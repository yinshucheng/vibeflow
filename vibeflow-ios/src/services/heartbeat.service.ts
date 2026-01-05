/**
 * Heartbeat Service
 *
 * Sends periodic heartbeat events to Vibe Brain to maintain connection
 * and report client status. Only sends heartbeat events - no other events.
 *
 * Requirements: 2.2, 2.6
 */

import { HEARTBEAT_INTERVAL_MS, APP_VERSION, PLATFORM, CLIENT_TYPE, CAPABILITIES } from '@/config';
import { getOrCreateClientId } from '@/utils/client-id';
import { websocketService } from './websocket.service';
import type { HeartbeatEvent, ConnectionQuality } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

export interface HeartbeatServiceConfig {
  intervalMs?: number;
  userId?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

let sequenceNumber = 0;

/**
 * Get the next sequence number for events.
 */
function getNextSequenceNumber(): number {
  return ++sequenceNumber;
}

/**
 * Generate a UUID v4 for event IDs.
 */
function generateEventId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get current connection quality based on WebSocket status.
 * For now, returns 'good' when connected, 'poor' otherwise.
 */
function getConnectionQuality(): ConnectionQuality {
  return websocketService.isConnected() ? 'good' : 'poor';
}

/**
 * Compute a simple hash of the local state for sync verification.
 * This is a placeholder - actual implementation would hash the store state.
 */
function computeStateHash(): string {
  return `hash_${Date.now()}`;
}

// =============================================================================
// HEARTBEAT EVENT CREATION
// =============================================================================

/**
 * Create a heartbeat event with all required fields.
 *
 * @param userId - The user ID
 * @param clientId - The unique client ID for this device
 * @param uptime - App uptime in milliseconds
 * @returns HeartbeatEvent ready to send
 */
export function createHeartbeatEvent(
  userId: string,
  clientId: string,
  uptime: number
): HeartbeatEvent {
  return {
    eventId: generateEventId(),
    eventType: 'HEARTBEAT',
    userId,
    clientId,
    clientType: CLIENT_TYPE,
    timestamp: Date.now(),
    sequenceNumber: getNextSequenceNumber(),
    payload: {
      clientVersion: APP_VERSION,
      platform: PLATFORM,
      connectionQuality: getConnectionQuality(),
      localStateHash: computeStateHash(),
      capabilities: [...CAPABILITIES],
      uptime,
    },
  };
}

// =============================================================================
// HEARTBEAT SERVICE
// =============================================================================

class HeartbeatService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private startTime: number = 0;
  private clientId: string | null = null;
  private userId: string | null = null;
  private intervalMs: number = HEARTBEAT_INTERVAL_MS;

  /**
   * Start sending heartbeat events at regular intervals.
   *
   * @param config - Configuration options
   */
  async start(config?: HeartbeatServiceConfig): Promise<void> {
    if (this.isRunning) {
      return;
    }

    if (config?.intervalMs) {
      this.intervalMs = config.intervalMs;
    }

    if (config?.userId) {
      this.userId = config.userId;
    }

    // Get or create client ID
    this.clientId = await getOrCreateClientId();
    this.startTime = Date.now();
    this.isRunning = true;

    // Send initial heartbeat immediately
    this.sendHeartbeat();

    // Schedule periodic heartbeats
    this.intervalId = setInterval(() => {
      this.sendHeartbeat();
    }, this.intervalMs);
  }

  /**
   * Stop sending heartbeat events.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
  }

  /**
   * Check if the service is currently running.
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Set the user ID for heartbeat events.
   */
  setUserId(userId: string): void {
    this.userId = userId;
  }

  /**
   * Get the current uptime in milliseconds.
   */
  getUptime(): number {
    if (!this.startTime) {
      return 0;
    }
    return Date.now() - this.startTime;
  }

  /**
   * Send a single heartbeat event.
   */
  private sendHeartbeat(): void {
    if (!websocketService.isConnected()) {
      return;
    }

    if (!this.clientId || !this.userId) {
      console.warn('Cannot send heartbeat: missing clientId or userId');
      return;
    }

    const event = createHeartbeatEvent(
      this.userId,
      this.clientId,
      this.getUptime()
    );

    websocketService.sendEvent(event);
  }

  /**
   * Force send a heartbeat immediately (useful after reconnection).
   */
  async forceSendHeartbeat(): Promise<void> {
    if (!this.clientId) {
      this.clientId = await getOrCreateClientId();
    }
    this.sendHeartbeat();
  }
}

// Export singleton instance
export const heartbeatService = new HeartbeatService();
