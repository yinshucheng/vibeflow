import fc from 'fast-check';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clientRegistryService } from '@/services/client-registry.service';
import prisma from '@/lib/prisma';
import type { ClientType, ClientConnection } from '@/types/octopus';

/**
 * Feature: octopus-architecture
 * Property 7: Client Registration Uniqueness
 * Property 8: Multiple Client Support
 * Validates: Requirements 9.1, 9.6
 */

// =============================================================================
// TEST SETUP
// =============================================================================

// Test user for isolation
let testUserId: string;
let testUserEmail: string;

beforeEach(async () => {
  // Clear socket map first
  clientRegistryService._clearSocketMap();
  
  // Create a unique test user for each test
  testUserEmail = `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
  const user = await prisma.user.create({
    data: {
      email: testUserEmail,
      password: 'hashed-password',
    },
  });
  testUserId = user.id;
});

afterEach(async () => {
  // Clean up test data
  if (testUserId) {
    // Delete client registries first (foreign key constraint)
    await prisma.clientRegistry.deleteMany({
      where: { userId: testUserId },
    }).catch(() => {
      // Ignore errors
    });
    
    // Then delete the user
    await prisma.user.delete({
      where: { id: testUserId },
    }).catch(() => {
      // Ignore if already deleted
    });
  }
  
  // Clear socket map
  clientRegistryService._clearSocketMap();
});

// =============================================================================
// GENERATORS
// =============================================================================

const clientTypeArb = fc.constantFrom<ClientType>('web', 'desktop', 'browser_ext', 'mobile');

const platformArb = fc.constantFrom('macos', 'windows', 'linux', 'ios', 'android', 'chrome');

const capabilitiesArb = fc.array(
  fc.constantFrom(
    'sensor:app',
    'sensor:browser',
    'sensor:idle',
    'action:close_app',
    'action:hide_app',
    'action:close_tab',
    'action:redirect_tab',
    'action:notification'
  ),
  { minLength: 0, maxLength: 5 }
);

const clientVersionArb = fc.tuple(
  fc.integer({ min: 1, max: 10 }),
  fc.integer({ min: 0, max: 99 }),
  fc.integer({ min: 0, max: 99 })
).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

/**
 * Generator for valid client connections
 */
const clientConnectionArb = (userId: string) =>
  fc.record({
    socketId: fc.uuid(),
    userId: fc.constant(userId),
    clientType: clientTypeArb,
    clientVersion: clientVersionArb,
    platform: platformArb,
    capabilities: capabilitiesArb,
  });

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Property 7: Client Registration Uniqueness', () => {
  /**
   * Feature: octopus-architecture, Property 7: Client Registration Uniqueness
   * Validates: Requirements 9.1
   *
   * For any Tentacle connection, the Vibe Brain SHALL assign a unique clientId
   * that does not conflict with any existing registered client.
   */

  it('should assign unique clientIds for each registration', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(clientConnectionArb(testUserId), { minLength: 2, maxLength: 10 }),
        async (connections) => {
          const registeredClientIds = new Set<string>();

          for (const connection of connections) {
            const result = await clientRegistryService.register(connection);
            
            expect(result.success).toBe(true);
            if (result.success && result.data) {
              // Verify clientId is unique
              expect(registeredClientIds.has(result.data.clientId)).toBe(false);
              registeredClientIds.add(result.data.clientId);
            }
          }

          // All clientIds should be unique
          expect(registeredClientIds.size).toBe(connections.length);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should generate valid UUID format for clientIds', async () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    await fc.assert(
      fc.asyncProperty(clientConnectionArb(testUserId), async (connection) => {
        const result = await clientRegistryService.register(connection);
        
        expect(result.success).toBe(true);
        if (result.success && result.data) {
          expect(result.data.clientId).toMatch(uuidRegex);
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should not reuse clientIds even after client disconnection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(clientConnectionArb(testUserId), { minLength: 2, maxLength: 5 }),
        async (connections) => {
          const allClientIds = new Set<string>();

          // Register, disconnect, and re-register
          for (const connection of connections) {
            // First registration
            const result1 = await clientRegistryService.register(connection);
            expect(result1.success).toBe(true);
            if (result1.success && result1.data) {
              allClientIds.add(result1.data.clientId);
              
              // Disconnect
              await clientRegistryService.markDisconnected(result1.data.clientId);
            }

            // Second registration with same socket (simulating reconnect)
            const result2 = await clientRegistryService.register({
              ...connection,
              socketId: `reconnect-${connection.socketId}`,
            });
            expect(result2.success).toBe(true);
            if (result2.success && result2.data) {
              // New clientId should be different
              expect(allClientIds.has(result2.data.clientId)).toBe(false);
              allClientIds.add(result2.data.clientId);
            }
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 8: Multiple Client Support', () => {
  /**
   * Feature: octopus-architecture, Property 8: Multiple Client Support
   * Validates: Requirements 9.6
   *
   * For any user, the system SHALL support multiple simultaneous connections
   * of the same client type, each with a distinct clientId.
   */

  it('should support multiple instances of the same client type', async () => {
    await fc.assert(
      fc.asyncProperty(
        clientTypeArb,
        fc.integer({ min: 2, max: 5 }),
        async (clientType, instanceCount) => {
          const registeredClients: string[] = [];

          // Register multiple instances of the same client type
          for (let i = 0; i < instanceCount; i++) {
            const connection: ClientConnection = {
              socketId: `socket-${clientType}-${i}-${Date.now()}-${Math.random()}`,
              userId: testUserId,
              clientType,
              clientVersion: '1.0.0',
              platform: 'macos',
              capabilities: ['sensor:app'],
            };

            const result = await clientRegistryService.register(connection);
            expect(result.success).toBe(true);
            if (result.success && result.data) {
              registeredClients.push(result.data.clientId);
            }
          }

          // Verify all instances are registered
          expect(registeredClients.length).toBe(instanceCount);

          // Verify all clientIds are unique
          const uniqueIds = new Set(registeredClients);
          expect(uniqueIds.size).toBe(instanceCount);

          // Verify we can retrieve all clients of this type
          const clientsResult = await clientRegistryService.getClientsByType(testUserId, clientType);
          expect(clientsResult.success).toBe(true);
          if (clientsResult.success && clientsResult.data) {
            // Filter to only online clients registered in this test iteration
            const onlineClients = clientsResult.data.filter(c => 
              c.status === 'online' && registeredClients.includes(c.clientId)
            );
            expect(onlineClients.length).toBe(instanceCount);
            
            // All should have the same client type
            for (const client of onlineClients) {
              expect(client.clientType).toBe(clientType);
            }
          }

          // Cleanup: mark all registered clients as disconnected for next iteration
          for (const clientId of registeredClients) {
            await clientRegistryService.markDisconnected(clientId);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should support different client types simultaneously for the same user', async () => {
    const allClientTypes: ClientType[] = ['web', 'desktop', 'browser_ext', 'mobile'];

    await fc.assert(
      fc.asyncProperty(
        fc.shuffledSubarray(allClientTypes, { minLength: 2, maxLength: 4 }),
        async (clientTypes) => {
          const registeredClients: Array<{ clientId: string; clientType: ClientType }> = [];

          // Register one instance of each client type
          for (const clientType of clientTypes) {
            const connection: ClientConnection = {
              socketId: `socket-${clientType}-${Date.now()}-${Math.random()}`,
              userId: testUserId,
              clientType,
              clientVersion: '1.0.0',
              platform: 'macos',
              capabilities: [],
            };

            const result = await clientRegistryService.register(connection);
            expect(result.success).toBe(true);
            if (result.success && result.data) {
              registeredClients.push({
                clientId: result.data.clientId,
                clientType: result.data.clientType,
              });
            }
          }

          // Verify all types are registered
          expect(registeredClients.length).toBe(clientTypes.length);

          // Verify we can retrieve all clients for the user
          const allClientsResult = await clientRegistryService.getClientsByUser(testUserId);
          expect(allClientsResult.success).toBe(true);
          if (allClientsResult.success && allClientsResult.data) {
            // Filter to only online clients registered in this test iteration
            const registeredClientIds = registeredClients.map(c => c.clientId);
            const onlineClients = allClientsResult.data.filter(c => 
              c.status === 'online' && registeredClientIds.includes(c.clientId)
            );
            expect(onlineClients.length).toBe(clientTypes.length);

            // Verify each client type is represented
            const registeredTypes = new Set(onlineClients.map(c => c.clientType));
            for (const expectedType of clientTypes) {
              expect(registeredTypes.has(expectedType)).toBe(true);
            }
          }

          // Cleanup: mark all registered clients as disconnected for next iteration
          for (const client of registeredClients) {
            await clientRegistryService.markDisconnected(client.clientId);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain separate state for each client instance', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(clientConnectionArb(testUserId), { minLength: 2, maxLength: 5 }),
        async (connections) => {
          const registeredClients: Array<{ clientId: string; metadata: { clientVersion: string; platform: string } }> = [];

          // Register all clients
          for (const connection of connections) {
            const result = await clientRegistryService.register(connection);
            expect(result.success).toBe(true);
            if (result.success && result.data) {
              registeredClients.push({
                clientId: result.data.clientId,
                metadata: {
                  clientVersion: result.data.metadata.clientVersion,
                  platform: result.data.metadata.platform,
                },
              });
            }
          }

          // Update metadata for first client only
          if (registeredClients.length > 0) {
            const firstClient = registeredClients[0];
            const newVersion = '99.99.99';
            
            await clientRegistryService.updateMetadata(firstClient.clientId, {
              clientVersion: newVersion,
            });

            // Verify first client has updated version
            const updatedResult = await clientRegistryService.getClientById(firstClient.clientId);
            expect(updatedResult.success).toBe(true);
            if (updatedResult.success && updatedResult.data) {
              expect(updatedResult.data.metadata.clientVersion).toBe(newVersion);
            }

            // Verify other clients are unchanged
            for (let i = 1; i < registeredClients.length; i++) {
              const otherClient = registeredClients[i];
              const otherResult = await clientRegistryService.getClientById(otherClient.clientId);
              expect(otherResult.success).toBe(true);
              if (otherResult.success && otherResult.data) {
                expect(otherResult.data.metadata.clientVersion).toBe(otherClient.metadata.clientVersion);
              }
            }
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should allow disconnecting one client without affecting others', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(clientConnectionArb(testUserId), { minLength: 3, maxLength: 5 }),
        async (connections) => {
          const registeredClientIds: string[] = [];

          // Register all clients
          for (const connection of connections) {
            const result = await clientRegistryService.register(connection);
            expect(result.success).toBe(true);
            if (result.success && result.data) {
              registeredClientIds.push(result.data.clientId);
            }
          }

          // Disconnect the first client
          if (registeredClientIds.length > 0) {
            const disconnectedId = registeredClientIds[0];
            await clientRegistryService.markDisconnected(disconnectedId);

            // Verify first client is offline
            const disconnectedResult = await clientRegistryService.getClientById(disconnectedId);
            expect(disconnectedResult.success).toBe(true);
            if (disconnectedResult.success && disconnectedResult.data) {
              expect(disconnectedResult.data.status).toBe('offline');
            }

            // Verify other clients are still online
            for (let i = 1; i < registeredClientIds.length; i++) {
              const otherResult = await clientRegistryService.getClientById(registeredClientIds[i]);
              expect(otherResult.success).toBe(true);
              if (otherResult.success && otherResult.data) {
                expect(otherResult.data.status).toBe('online');
              }
            }
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
