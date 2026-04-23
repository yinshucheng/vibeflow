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
/**
 * Create an event builder. Stamps consistent BaseEvent fields on every event.
 */
export declare function createEventBuilder(config: EventBuilderConfig): {
    /** Build a typed event with all BaseEvent fields filled */
    build<T extends EventType>(eventType: T, payload: Record<string, unknown>): OctopusEvent;
    /** Build a heartbeat event with optional platform metadata */
    buildHeartbeat(platformMeta?: Record<string, unknown>): HeartbeatEvent;
    /** Reset sequence number on reconnect */
    resetSequence(): void;
};
//# sourceMappingURL=event-builder.d.ts.map