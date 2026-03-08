/**
 * Client Registry Service
 * 
 * Manages connected client instances for the Octopus Architecture.
 * Tracks web, desktop, browser extension, and mobile clients.
 * 
 * Requirements: 9.1, 9.2, 9.4, 9.5, 9.6
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';
import type { ClientRegistry } from '@prisma/client';
import type {
  ClientType,
  ClientConnection,
  ClientMetadata,
  ClientStatus,
  RegisteredClient,
} from '@/types/octopus';

/**
 * Generate a UUID v4
 * Uses crypto.randomUUID() which is available in Node.js 14.17+ and modern browsers
 */
function generateUUID(): string {
  return crypto.randomUUID();
}

// =============================================================================
// SCHEMAS
// =============================================================================

/**
 * Schema for client connection input
 */
export const ClientConnectionSchema = z.object({
  socketId: z.string().min(1),
  userId: z.string().min(1),
  clientType: z.enum(['web', 'desktop', 'browser_ext', 'mobile']),
  clientVersion: z.string().min(1),
  platform: z.string().min(1),
  capabilities: z.array(z.string()),
});

/**
 * Schema for client metadata update
 */
export const ClientMetadataUpdateSchema = z.object({
  clientVersion: z.string().min(1).optional(),
  platform: z.string().min(1).optional(),
  capabilities: z.array(z.string()).optional(),
  deviceName: z.string().optional(),
  localStateHash: z.string().optional(),
});

// =============================================================================
// TYPES
// =============================================================================

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// Default timeout for marking clients as offline (30 seconds)
const DEFAULT_OFFLINE_TIMEOUT_MS = 30 * 1000;

// In-memory map of socketId -> clientId for quick lookups
const socketToClientMap = new Map<string, string>();

// =============================================================================
// SERVICE
// =============================================================================

export const clientRegistryService = {
  /**
   * Register a new client connection
   * Requirements: 9.1, 9.2, 9.6
   * 
   * Creates a new client registry entry or updates an existing one.
   * Generates a unique clientId for each connection.
   * Supports multiple instances of the same client type.
   */
  async register(connection: ClientConnection): Promise<ServiceResult<RegisteredClient>> {
    try {
      const validated = ClientConnectionSchema.parse(connection);
      
      // Generate a unique clientId
      const clientId = generateUUID();
      const now = new Date();

      // Create the client registry entry
      const client = await prisma.clientRegistry.create({
        data: {
          clientId,
          userId: validated.userId,
          clientType: validated.clientType,
          clientVersion: validated.clientVersion,
          platform: validated.platform,
          capabilities: validated.capabilities,
          status: 'online',
          lastSeenAt: now,
          registeredAt: now,
        },
      });

      // Store socket -> client mapping
      socketToClientMap.set(validated.socketId, clientId);

      const registeredClient = this.toRegisteredClient(client);
      return { success: true, data: registeredClient };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid client connection data',
            details: { issues: error.issues },
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to register client',
        },
      };
    }
  },

  /**
   * Update client metadata
   * Requirements: 9.2
   * 
   * Updates metadata for an existing client (version, capabilities, etc.)
   */
  async updateMetadata(
    clientId: string,
    metadata: Partial<ClientMetadata>,
    userId?: string
  ): Promise<ServiceResult<RegisteredClient>> {
    try {
      const validated = ClientMetadataUpdateSchema.parse(metadata);

      const client = await prisma.clientRegistry.findUnique({
        where: { clientId },
      });

      if (!client) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Client with id ${clientId} not found`,
          },
        };
      }

      // Verify ownership if userId provided
      if (userId && client.userId !== userId) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Client with id ${clientId} not found`,
          },
        };
      }

      if (client.revokedAt) {
        return {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Cannot update metadata for a revoked client',
          },
        };
      }

      const updateData: Record<string, unknown> = {
        lastSeenAt: new Date(),
      };

      if (validated.clientVersion !== undefined) {
        updateData.clientVersion = validated.clientVersion;
      }
      if (validated.platform !== undefined) {
        updateData.platform = validated.platform;
      }
      if (validated.capabilities !== undefined) {
        updateData.capabilities = validated.capabilities;
      }
      if (validated.deviceName !== undefined) {
        updateData.deviceName = validated.deviceName;
      }

      const updated = await prisma.clientRegistry.update({
        where: { clientId },
        data: updateData,
      });

      const registeredClient = this.toRegisteredClient(updated);
      return { success: true, data: registeredClient };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid metadata',
            details: { issues: error.issues },
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update metadata',
        },
      };
    }
  },

  /**
   * Mark a client as disconnected (offline)
   * Requirements: 9.4
   * 
   * Updates the client status to offline and records the last seen time.
   */
  async markDisconnected(clientId: string, userId?: string): Promise<ServiceResult<void>> {
    try {
      const client = await prisma.clientRegistry.findUnique({
        where: { clientId },
      });

      if (!client) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Client with id ${clientId} not found`,
          },
        };
      }

      // Verify ownership if userId provided
      if (userId && client.userId !== userId) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Client with id ${clientId} not found`,
          },
        };
      }

      await prisma.clientRegistry.update({
        where: { clientId },
        data: {
          status: 'offline',
          lastSeenAt: new Date(),
        },
      });

      // Remove from socket map
      const disconnectEntries = Array.from(socketToClientMap.entries());
      for (const [socketId, cId] of disconnectEntries) {
        if (cId === clientId) {
          socketToClientMap.delete(socketId);
          break;
        }
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to mark client as disconnected',
        },
      };
    }
  },

  /**
   * Mark a client as disconnected by socket ID
   * Convenience method for WebSocket disconnect handlers
   */
  async markDisconnectedBySocketId(socketId: string): Promise<ServiceResult<void>> {
    const clientId = socketToClientMap.get(socketId);
    if (!clientId) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `No client found for socket ${socketId}`,
        },
      };
    }
    return this.markDisconnected(clientId);
  },

  /**
   * Get all clients for a user
   * Requirements: 9.3
   * 
   * Returns all registered clients (both online and offline) for a user.
   * Excludes revoked clients.
   */
  async getClientsByUser(userId: string): Promise<ServiceResult<RegisteredClient[]>> {
    try {
      const clients = await prisma.clientRegistry.findMany({
        where: {
          userId,
          revokedAt: null,
        },
        orderBy: { lastSeenAt: 'desc' },
      });

      const registeredClients = clients.map(c => this.toRegisteredClient(c));
      return { success: true, data: registeredClients };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get clients',
        },
      };
    }
  },

  /**
   * Get online clients for a user
   * 
   * Returns only currently online clients for a user.
   */
  async getOnlineClients(userId: string): Promise<ServiceResult<RegisteredClient[]>> {
    try {
      const clients = await prisma.clientRegistry.findMany({
        where: {
          userId,
          status: 'online',
          revokedAt: null,
        },
        orderBy: { lastSeenAt: 'desc' },
      });

      const registeredClients = clients.map(c => this.toRegisteredClient(c));
      return { success: true, data: registeredClients };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get online clients',
        },
      };
    }
  },

  /**
   * Revoke a client
   * Requirements: 9.5
   * 
   * Marks a client as revoked, preventing future connections.
   * The user must own the client to revoke it.
   */
  async revokeClient(userId: string, clientId: string): Promise<ServiceResult<void>> {
    try {
      const client = await prisma.clientRegistry.findUnique({
        where: { clientId },
      });

      if (!client) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Client with id ${clientId} not found`,
          },
        };
      }

      // Verify ownership
      if (client.userId !== userId) {
        return {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have permission to revoke this client',
          },
        };
      }

      if (client.revokedAt) {
        return {
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'Client is already revoked',
          },
        };
      }

      await prisma.clientRegistry.update({
        where: { clientId },
        data: {
          status: 'offline',
          revokedAt: new Date(),
        },
      });

      // Remove from socket map
      const revokeEntries = Array.from(socketToClientMap.entries());
      for (const [socketId, cId] of revokeEntries) {
        if (cId === clientId) {
          socketToClientMap.delete(socketId);
          break;
        }
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to revoke client',
        },
      };
    }
  },

  /**
   * Check if a client is online
   * 
   * Returns true if the client exists and is currently online.
   */
  isOnline(clientId: string): boolean {
    // Check in-memory map first for performance
    const values = Array.from(socketToClientMap.values());
    for (const cId of values) {
      if (cId === clientId) {
        return true;
      }
    }
    return false;
  },

  /**
   * Get client by ID
   */
  async getClientById(clientId: string, userId?: string): Promise<ServiceResult<RegisteredClient | null>> {
    try {
      const client = await prisma.clientRegistry.findUnique({
        where: { clientId },
      });

      if (!client) {
        return { success: true, data: null };
      }

      // Verify ownership if userId provided
      if (userId && client.userId !== userId) {
        return { success: true, data: null };
      }

      const registeredClient = this.toRegisteredClient(client);
      return { success: true, data: registeredClient };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get client',
        },
      };
    }
  },

  /**
   * Get client ID by socket ID
   */
  getClientIdBySocketId(socketId: string): string | undefined {
    return socketToClientMap.get(socketId);
  },

  /**
   * Update last seen timestamp (heartbeat)
   * 
   * Updates the lastSeenAt timestamp for a client.
   * Called when receiving heartbeat events.
   */
  async updateLastSeen(clientId: string, userId?: string): Promise<ServiceResult<void>> {
    try {
      // Verify ownership if userId provided
      if (userId) {
        const client = await prisma.clientRegistry.findUnique({ where: { clientId } });
        if (!client || client.userId !== userId) {
          return { success: false, error: { code: 'NOT_FOUND', message: 'Client not found' } };
        }
      }

      await prisma.clientRegistry.update({
        where: { clientId },
        data: {
          lastSeenAt: new Date(),
          status: 'online',
        },
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update last seen',
        },
      };
    }
  },

  /**
   * Mark stale clients as offline
   * Requirements: 9.4
   * 
   * Marks clients that haven't sent a heartbeat within the timeout as offline.
   * Should be called periodically (e.g., every 30 seconds).
   */
  async markStaleClientsOffline(
    timeoutMs: number = DEFAULT_OFFLINE_TIMEOUT_MS
  ): Promise<ServiceResult<{ count: number }>> {
    try {
      const cutoffTime = new Date(Date.now() - timeoutMs);

      const result = await prisma.clientRegistry.updateMany({
        where: {
          status: 'online',
          lastSeenAt: {
            lt: cutoffTime,
          },
          revokedAt: null,
        },
        data: {
          status: 'offline',
        },
      });

      return { success: true, data: { count: result.count } };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to mark stale clients offline',
        },
      };
    }
  },

  /**
   * Get clients by type for a user
   * Requirements: 9.6
   * 
   * Returns all clients of a specific type for a user.
   * Supports multiple instances of the same client type.
   */
  async getClientsByType(
    userId: string,
    clientType: ClientType
  ): Promise<ServiceResult<RegisteredClient[]>> {
    try {
      const clients = await prisma.clientRegistry.findMany({
        where: {
          userId,
          clientType,
          revokedAt: null,
        },
        orderBy: { lastSeenAt: 'desc' },
      });

      const registeredClients = clients.map(c => this.toRegisteredClient(c));
      return { success: true, data: registeredClients };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get clients by type',
        },
      };
    }
  },

  /**
   * Convert Prisma ClientRegistry to RegisteredClient
   */
  toRegisteredClient(client: ClientRegistry): RegisteredClient {
    return {
      clientId: client.clientId,
      userId: client.userId,
      clientType: client.clientType as ClientType,
      metadata: {
        clientVersion: client.clientVersion,
        platform: client.platform,
        capabilities: client.capabilities,
        deviceName: client.deviceName ?? undefined,
      },
      status: client.status as ClientStatus,
      lastSeenAt: client.lastSeenAt.getTime(),
      registeredAt: client.registeredAt.getTime(),
    };
  },

  /**
   * Clear socket to client mapping (for testing)
   */
  _clearSocketMap(): void {
    socketToClientMap.clear();
  },

  /**
   * Get socket map size (for testing)
   */
  _getSocketMapSize(): number {
    return socketToClientMap.size;
  },
};

export default clientRegistryService;
