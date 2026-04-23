"use strict";
/**
 * Event Builder — Unified event construction for all clients.
 *
 * Clients no longer manually assemble BaseEvent fields. Each client
 * provides its config once; `build()` stamps every event consistently.
 *
 * NOTE: `getUptime` is injectable so we don't depend on `process.uptime()`
 * (unavailable in browsers and Service Workers).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEventBuilder = createEventBuilder;
function generateId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
/**
 * Create an event builder. Stamps consistent BaseEvent fields on every event.
 */
function createEventBuilder(config) {
    let sequenceNumber = 0;
    return {
        /** Build a typed event with all BaseEvent fields filled */
        build(eventType, payload) {
            return {
                eventId: generateId(),
                eventType,
                userId: config.userId,
                clientId: config.clientId,
                clientType: config.clientType,
                timestamp: Date.now(),
                sequenceNumber: sequenceNumber++,
                payload,
            };
        },
        /** Build a heartbeat event with optional platform metadata */
        buildHeartbeat(platformMeta) {
            return this.build('HEARTBEAT', {
                uptime: config.getUptime?.() ?? 0,
                ...platformMeta,
            });
        },
        /** Reset sequence number on reconnect */
        resetSequence() {
            sequenceNumber = 0;
        },
    };
}
//# sourceMappingURL=event-builder.js.map