/**
 * Octopus Architecture - Client Registry Types
 *
 * Types for managing connected clients.
 */
import type { ClientType, ClientStatus } from './enums';
/**
 * Client connection information
 */
export interface ClientConnection {
    socketId: string;
    userId: string;
    clientType: ClientType;
    clientVersion: string;
    platform: string;
    capabilities: string[];
}
/**
 * Client metadata
 */
export interface ClientMetadata {
    clientVersion: string;
    platform: string;
    capabilities: string[];
    deviceName?: string;
    localStateHash?: string;
}
/**
 * Registered client information
 */
export interface RegisteredClient {
    clientId: string;
    userId: string;
    clientType: ClientType;
    metadata: ClientMetadata;
    status: ClientStatus;
    lastSeenAt: number;
    registeredAt: number;
}
/**
 * Command queue statistics
 */
export interface QueueStats {
    pendingCount: number;
    deliveredCount: number;
    acknowledgedCount: number;
    expiredCount: number;
}
//# sourceMappingURL=client-registry.d.ts.map