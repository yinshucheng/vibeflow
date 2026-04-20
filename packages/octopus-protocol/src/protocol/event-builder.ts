/**
 * Event Builder — Unified event construction for all clients.
 *
 * Clients no longer manually assemble BaseEvent fields. Each client
 * provides its config once; `build()` stamps every event consistently.
 *
 * NOTE: `getUptime` is injectable so we don't depend on `process.uptime()`
 * (unavailable in browsers and Service Workers).
 */

import type { EventType, ClientType, OctopusEvent, HeartbeatEvent } from '../types';

export interface EventBuilderConfig {
  clientType: ClientType;
  clientId: string;
  userId: string;
  /** Platform-specific uptime provider (optional — defaults to 0) */
  getUptime?: () => number;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create an event builder. Stamps consistent BaseEvent fields on every event.
 */
export function createEventBuilder(config: EventBuilderConfig) {
  let sequenceNumber = 0;

  return {
    /** Build a typed event with all BaseEvent fields filled */
    build<T extends EventType>(eventType: T, payload: Record<string, unknown>): OctopusEvent {
      return {
        eventId: generateId(),
        eventType,
        userId: config.userId,
        clientId: config.clientId,
        clientType: config.clientType,
        timestamp: Date.now(),
        sequenceNumber: sequenceNumber++,
        payload,
      } as unknown as OctopusEvent;
    },

    /** Build a heartbeat event with optional platform metadata */
    buildHeartbeat(platformMeta?: Record<string, unknown>): HeartbeatEvent {
      return this.build('HEARTBEAT', {
        uptime: config.getUptime?.() ?? 0,
        ...platformMeta,
      }) as unknown as HeartbeatEvent;
    },

    /** Reset sequence number on reconnect */
    resetSequence(): void {
      sequenceNumber = 0;
    },
  };
}
