import fc from 'fast-check';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { heartbeatService, HEARTBEAT_INTERVAL_MS } from '@/services/heartbeat.service';
import prisma from '@/lib/prisma';

/**
 * Feature: desktop-production-resilience
 * Property 2: Heartbeat Interval Consistency
 * Validates: Requirements 3.1
 * 
 * For any connected client, heartbeat signals SHALL be sent at intervals
 * not exceeding 30 seconds (with tolerance for network latency).
 */

// =============================================================================
// TEST SETUP
// =============================================================================

let testUserId: string;
let testUserEmail: string;

beforeEach(async () => {
  // Create a unique test user for each test
  testUserEmail = `test-heartbeat-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
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

describe('Property 2: Heartbeat Interval Consistency', () => {
  /**
   * Feature: desktop-production-resilience, Property 2: Heartbeat Interval Consistency
   * Validates: Requirements 3.1
   *
   * For any connected client, heartbeat signals SHALL be sent at intervals
   * not exceeding 30 seconds (with tolerance for network latency).
   */

  it('should have heartbeat interval configured to 30 seconds', () => {
    // Verify the constant is set correctly
    expect(HEARTBEAT_INTERVAL_MS).toBe(30 * 1000);
    
    const config = heartbeatService.getConfig();
    expect(config.heartbeatIntervalMs).toBe(30 * 1000);
  });

  it('should update lastHeartbeat timestamp on each heartbeat', async () => {
    await fc.assert(
      fc.asyncProperty(heartbeatPayloadArb(testUserId), async (payload) => {
        // First heartbeat
        const beforeTime = new Date();
        const result1 = await heartbeatService.trackHeartbeat(payload);
        const afterTime = new Date();
        
        expect(result1.success).toBe(true);
        if (result1.success && result1.data) {
          // Verify lastHeartbeat is within the expected time range
          const heartbeatTime = result1.data.lastHeartbeat.getTime();
          expect(heartbeatTime).toBeGreaterThanOrEqual(beforeTime.getTime());
          expect(heartbeatTime).toBeLessThanOrEqual(afterTime.getTime());
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should track consecutive heartbeats with increasing timestamps', { timeout: 15000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        heartbeatPayloadArb(testUserId),
        fc.integer({ min: 2, max: 5 }),
        async (payload, heartbeatCount) => {
          const timestamps: number[] = [];
          
          for (let i = 0; i < heartbeatCount; i++) {
            const result = await heartbeatService.trackHeartbeat(payload);
            
            expect(result.success).toBe(true);
            if (result.success && result.data) {
              timestamps.push(result.data.lastHeartbeat.getTime());
            }
            
            // Small delay to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 10));
          }
          
          // Verify timestamps are non-decreasing (allowing for same-millisecond updates)
          for (let i = 1; i < timestamps.length; i++) {
            expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should mark client as online after receiving heartbeat', async () => {
    await fc.assert(
      fc.asyncProperty(heartbeatPayloadArb(testUserId), async (payload) => {
        const result = await heartbeatService.trackHeartbeat(payload);
        
        expect(result.success).toBe(true);
        if (result.success && result.data) {
          expect(result.data.isOnline).toBe(true);
        }
        
        // Verify via getClientStatus
        const statusResult = await heartbeatService.getClientStatus(payload.clientId);
        expect(statusResult.success).toBe(true);
        if (statusResult.success && statusResult.data) {
          expect(statusResult.data.isOnline).toBe(true);
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve client metadata across heartbeats', async () => {
    await fc.assert(
      fc.asyncProperty(heartbeatPayloadArb(testUserId), async (payload) => {
        // Send heartbeat
        const result = await heartbeatService.trackHeartbeat(payload);
        
        expect(result.success).toBe(true);
        if (result.success && result.data) {
          // Verify metadata is preserved
          expect(result.data.clientId).toBe(payload.clientId);
          expect(result.data.userId).toBe(payload.userId);
          expect(result.data.appVersion).toBe(payload.appVersion);
          expect(result.data.mode).toBe(payload.mode);
          expect(result.data.deviceName).toBe(payload.deviceName ?? null);
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should handle multiple clients sending heartbeats independently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(heartbeatPayloadArb(testUserId), { minLength: 2, maxLength: 5 }),
        async (payloads) => {
          // Ensure unique clientIds
          const uniquePayloads = payloads.map((p, i) => ({
            ...p,
            clientId: `${p.clientId}-${i}`,
          }));
          
          // Send heartbeats for all clients
          for (const payload of uniquePayloads) {
            const result = await heartbeatService.trackHeartbeat(payload);
            expect(result.success).toBe(true);
          }
          
          // Verify all clients are tracked independently
          const clientsResult = await heartbeatService.getClientsByUser(testUserId);
          expect(clientsResult.success).toBe(true);
          if (clientsResult.success && clientsResult.data) {
            const clientIds = clientsResult.data.map(c => c.clientId);
            for (const payload of uniquePayloads) {
              expect(clientIds).toContain(payload.clientId);
            }
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should close open offline events when heartbeat is received', async () => {
    await fc.assert(
      fc.asyncProperty(heartbeatPayloadArb(testUserId), async (payload) => {
        // First, register the client
        await heartbeatService.trackHeartbeat(payload);
        
        // Mark client as offline
        await heartbeatService.markClientOffline(payload.clientId);
        
        // Verify client is offline
        const offlineStatus = await heartbeatService.getClientStatus(payload.clientId);
        expect(offlineStatus.success).toBe(true);
        if (offlineStatus.success && offlineStatus.data) {
          expect(offlineStatus.data.isOnline).toBe(false);
        }
        
        // Send heartbeat to bring client back online
        const result = await heartbeatService.trackHeartbeat(payload);
        expect(result.success).toBe(true);
        if (result.success && result.data) {
          expect(result.data.isOnline).toBe(true);
        }
        
        // Verify offline event was closed
        const historyResult = await heartbeatService.getOfflineHistory(testUserId, 1);
        expect(historyResult.success).toBe(true);
        if (historyResult.success && historyResult.data) {
          const clientEvents = historyResult.data.filter(e => e.clientId === payload.clientId);
          // All events should have endedAt set (closed)
          for (const event of clientEvents) {
            expect(event.endedAt).not.toBeNull();
          }
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });
});
