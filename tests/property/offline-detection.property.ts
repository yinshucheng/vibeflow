import fc from 'fast-check';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  heartbeatService, 
  OFFLINE_THRESHOLD_MS,
  OFFLINE_CHECK_INTERVAL_MS,
} from '@/services/heartbeat.service';
import prisma from '@/lib/prisma';

/**
 * Feature: desktop-production-resilience
 * Property 3: Offline Detection Timing
 * Validates: Requirements 3.3
 * 
 * For any client that stops sending heartbeats, the server SHALL mark it
 * as offline within 2 minutes (120 seconds) of the last heartbeat.
 */

// =============================================================================
// TEST SETUP
// =============================================================================

let testUserId: string;
let testUserEmail: string;

beforeEach(async () => {
  // Create a unique test user for each test
  testUserEmail = `test-offline-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
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
    // Delete client offline events first (foreign key constraint)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).clientOfflineEvent.deleteMany({
      where: { userId: testUserId },
    }).catch(() => {
      // Ignore errors
    });
    
    // Delete client connections
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).clientConnection.deleteMany({
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
});

// =============================================================================
// GENERATORS
// =============================================================================

const modeArb = fc.constantFrom<'development' | 'staging' | 'production'>('development', 'staging', 'production');

const appVersionArb = fc.tuple(
  fc.integer({ min: 1, max: 10 }),
  fc.integer({ min: 0, max: 99 }),
  fc.integer({ min: 0, max: 99 })
).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

/**
 * Generator for valid heartbeat payloads
 */
const heartbeatPayloadArb = (userId: string) =>
  fc.record({
    clientId: fc.uuid(),
    userId: fc.constant(userId),
    appVersion: appVersionArb,
    mode: modeArb,
    isInDemoMode: fc.boolean(),
    activePomodoroId: fc.option(fc.uuid(), { nil: null }),
    deviceName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  });

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Property 3: Offline Detection Timing', () => {
  /**
   * Feature: desktop-production-resilience, Property 3: Offline Detection Timing
   * Validates: Requirements 3.3
   *
   * For any client that stops sending heartbeats, the server SHALL mark it
   * as offline within 2 minutes (120 seconds) of the last heartbeat.
   */

  it('should have offline threshold configured to 2 minutes (120 seconds)', () => {
    // Verify the constant is set correctly
    expect(OFFLINE_THRESHOLD_MS).toBe(2 * 60 * 1000);
    
    const config = heartbeatService.getConfig();
    expect(config.offlineThresholdMs).toBe(2 * 60 * 1000);
  });

  it('should have offline check interval configured to 30 seconds', () => {
    expect(OFFLINE_CHECK_INTERVAL_MS).toBe(30 * 1000);
    
    const config = heartbeatService.getConfig();
    expect(config.offlineCheckIntervalMs).toBe(30 * 1000);
  });

  it('should mark client as offline when explicitly requested', async () => {
    await fc.assert(
      fc.asyncProperty(heartbeatPayloadArb(testUserId), async (payload) => {
        // Register client with heartbeat
        const heartbeatResult = await heartbeatService.trackHeartbeat(payload);
        expect(heartbeatResult.success).toBe(true);
        
        // Verify client is online
        const onlineStatus = await heartbeatService.getClientStatus(payload.clientId);
        expect(onlineStatus.success).toBe(true);
        if (onlineStatus.success && onlineStatus.data) {
          expect(onlineStatus.data.isOnline).toBe(true);
        }
        
        // Mark client as offline
        const offlineResult = await heartbeatService.markClientOffline(payload.clientId);
        expect(offlineResult.success).toBe(true);
        
        // Verify client is now offline
        const offlineStatus = await heartbeatService.getClientStatus(payload.clientId);
        expect(offlineStatus.success).toBe(true);
        if (offlineStatus.success && offlineStatus.data) {
          expect(offlineStatus.data.isOnline).toBe(false);
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should create offline event when marking client offline', async () => {
    await fc.assert(
      fc.asyncProperty(heartbeatPayloadArb(testUserId), async (payload) => {
        // Register client with heartbeat
        await heartbeatService.trackHeartbeat(payload);
        
        // Mark client as offline
        const offlineResult = await heartbeatService.markClientOffline(payload.clientId);
        expect(offlineResult.success).toBe(true);
        if (offlineResult.success && offlineResult.data) {
          // Verify offline event was created
          expect(offlineResult.data.clientId).toBe(payload.clientId);
          expect(offlineResult.data.userId).toBe(payload.userId);
          expect(offlineResult.data.startedAt).toBeInstanceOf(Date);
          expect(offlineResult.data.endedAt).toBeNull(); // Still offline
          expect(offlineResult.data.durationSeconds).toBeNull(); // Not yet calculated
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should detect stale clients based on threshold', { timeout: 15000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(heartbeatPayloadArb(testUserId), { minLength: 1, maxLength: 3 }),
        async (payloads) => {
          // Ensure unique clientIds
          const uniquePayloads = payloads.map((p, i) => ({
            ...p,
            clientId: `${p.clientId}-stale-${i}`,
          }));
          
          // Register all clients
          for (const payload of uniquePayloads) {
            await heartbeatService.trackHeartbeat(payload);
          }
          
          // Manually update lastHeartbeat to be older than threshold
          const staleTime = new Date(Date.now() - OFFLINE_THRESHOLD_MS - 1000);
          for (const payload of uniquePayloads) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (prisma as any).clientConnection.update({
              where: { clientId: payload.clientId },
              data: { lastHeartbeat: staleTime },
            });
          }
          
          // Run offline detection
          const detectResult = await heartbeatService.detectOfflineClients();
          expect(detectResult.success).toBe(true);
          if (detectResult.success && detectResult.data) {
            expect(detectResult.data.markedOffline).toBe(uniquePayloads.length);
          }
          
          // Verify all clients are now offline
          for (const payload of uniquePayloads) {
            const status = await heartbeatService.getClientStatus(payload.clientId);
            expect(status.success).toBe(true);
            if (status.success && status.data) {
              expect(status.data.isOnline).toBe(false);
            }
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not mark clients as offline if heartbeat is within threshold', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(heartbeatPayloadArb(testUserId), { minLength: 1, maxLength: 3 }),
        async (payloads) => {
          // Ensure unique clientIds
          const uniquePayloads = payloads.map((p, i) => ({
            ...p,
            clientId: `${p.clientId}-fresh-${i}`,
          }));
          
          // Register all clients with fresh heartbeats
          for (const payload of uniquePayloads) {
            await heartbeatService.trackHeartbeat(payload);
          }
          
          // Run offline detection immediately (clients should still be online)
          const detectResult = await heartbeatService.detectOfflineClients();
          expect(detectResult.success).toBe(true);
          if (detectResult.success && detectResult.data) {
            expect(detectResult.data.markedOffline).toBe(0);
          }
          
          // Verify all clients are still online
          for (const payload of uniquePayloads) {
            const status = await heartbeatService.getClientStatus(payload.clientId);
            expect(status.success).toBe(true);
            if (status.success && status.data) {
              expect(status.data.isOnline).toBe(true);
            }
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should record offline event with correct context', async () => {
    await fc.assert(
      fc.asyncProperty(
        heartbeatPayloadArb(testUserId),
        fc.boolean(),
        fc.boolean(),
        async (payload, wasInWorkHours, wasInPomodoro) => {
          // Register client
          await heartbeatService.trackHeartbeat(payload);
          
          // Mark offline with specific context
          const offlineResult = await heartbeatService.markClientOffline(payload.clientId, {
            wasInWorkHours,
            wasInPomodoro,
          });
          
          expect(offlineResult.success).toBe(true);
          if (offlineResult.success && offlineResult.data) {
            expect(offlineResult.data.wasInWorkHours).toBe(wasInWorkHours);
            expect(offlineResult.data.wasInPomodoro).toBe(wasInPomodoro);
            expect(offlineResult.data.gracePeriodUsed).toBe(false);
            expect(offlineResult.data.isBypassAttempt).toBe(false);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return existing offline event if client is already offline', async () => {
    await fc.assert(
      fc.asyncProperty(heartbeatPayloadArb(testUserId), async (payload) => {
        // Register client
        await heartbeatService.trackHeartbeat(payload);
        
        // Mark offline first time
        const firstOffline = await heartbeatService.markClientOffline(payload.clientId);
        expect(firstOffline.success).toBe(true);
        
        // Mark offline second time (should return existing event)
        const secondOffline = await heartbeatService.markClientOffline(payload.clientId);
        expect(secondOffline.success).toBe(true);
        
        if (firstOffline.success && firstOffline.data && secondOffline.success && secondOffline.data) {
          // Should return the same event
          expect(secondOffline.data.id).toBe(firstOffline.data.id);
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should track offline history correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        heartbeatPayloadArb(testUserId),
        fc.integer({ min: 1, max: 3 }),
        async (payload, cycleCount) => {
          // Perform multiple online/offline cycles
          for (let i = 0; i < cycleCount; i++) {
            // Go online
            await heartbeatService.trackHeartbeat(payload);
            
            // Go offline
            await heartbeatService.markClientOffline(payload.clientId);
          }
          
          // Final heartbeat to close the last offline event
          await heartbeatService.trackHeartbeat(payload);
          
          // Check offline history
          const historyResult = await heartbeatService.getOfflineHistory(testUserId, 1);
          expect(historyResult.success).toBe(true);
          if (historyResult.success && historyResult.data) {
            const clientEvents = historyResult.data.filter(e => e.clientId === payload.clientId);
            expect(clientEvents.length).toBe(cycleCount);
            
            // All events should be closed (have endedAt)
            for (const event of clientEvents) {
              expect(event.endedAt).not.toBeNull();
              expect(event.durationSeconds).not.toBeNull();
              expect(event.durationSeconds).toBeGreaterThanOrEqual(0);
            }
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should calculate uptime statistics correctly', async () => {
    await fc.assert(
      fc.asyncProperty(heartbeatPayloadArb(testUserId), async (payload) => {
        // Register client
        await heartbeatService.trackHeartbeat(payload);
        
        // Get initial offline history count for this client
        const initialHistory = await heartbeatService.getOfflineHistory(testUserId, 1);
        const initialCount = initialHistory.success && initialHistory.data 
          ? initialHistory.data.filter(e => e.clientId === payload.clientId).length 
          : 0;
        
        // Mark offline and back online
        await heartbeatService.markClientOffline(payload.clientId);
        await heartbeatService.trackHeartbeat(payload);
        
        // Get updated history
        const updatedHistory = await heartbeatService.getOfflineHistory(testUserId, 1);
        expect(updatedHistory.success).toBe(true);
        if (updatedHistory.success && updatedHistory.data) {
          const clientEvents = updatedHistory.data.filter(e => e.clientId === payload.clientId);
          // Should have one more offline event than before
          expect(clientEvents.length).toBe(initialCount + 1);
        }
        
        // Get uptime stats
        const statsResult = await heartbeatService.getUptimeStats(testUserId, 1);
        expect(statsResult.success).toBe(true);
        if (statsResult.success && statsResult.data) {
          // Should have at least one offline event
          expect(statsResult.data.offlineEventCount).toBeGreaterThanOrEqual(1);
          // Uptime should be less than or equal to 100%
          expect(statsResult.data.uptimePercentage).toBeLessThanOrEqual(100);
          expect(statsResult.data.totalOfflineSeconds).toBeGreaterThanOrEqual(0);
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should handle non-existent client gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (nonExistentClientId) => {
        // Try to mark non-existent client as offline
        const result = await heartbeatService.markClientOffline(nonExistentClientId);
        
        expect(result.success).toBe(false);
        if (!result.success && result.error) {
          expect(result.error.code).toBe('NOT_FOUND');
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should return null for non-existent client status', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (nonExistentClientId) => {
        const result = await heartbeatService.getClientStatus(nonExistentClientId);
        
        expect(result.success).toBe(true);
        expect(result.data).toBeNull();
        
        return true;
      }),
      { numRuns: 100 }
    );
  });
});
