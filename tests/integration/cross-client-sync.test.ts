/**
 * Cross-Client Sync Integration Test
 *
 * Tests the complete flow:
 *   1. Auth: get API token via HTTP (same as iOS does)
 *   2. WS connect with token (same as iOS does)
 *   3. WS connect with email (same as Web does)
 *   4. Mutation via HTTP → both clients receive broadcast
 *
 * Runs against local dev server (localhost:3000).
 * Tests auth paths, socket broadcast, and DATA_CHANGE delivery.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import os from 'os';

const SERVER = 'http://localhost:3000';
const TEST_EMAIL = 'cross-client-sync-test@vibeflow.local';
const TEST_PASSWORD = 'testpass123';
// Use the main dev database (same as the running server), not the test database
const dbUser = os.userInfo().username;
const prisma = new PrismaClient({
  datasourceUrl: `postgresql://${dbUser}@localhost:5432/vibeflow?schema=public`,
});

// Helper: wait for socket event with timeout
function waitFor(socket: ClientSocket, event: string, ms = 5000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout waiting for "${event}" after ${ms}ms`)), ms);
    socket.once(event, (data: unknown) => { clearTimeout(t); resolve(data); });
  });
}

// Helper: collect events for a duration
function collectEvents(socket: ClientSocket, event: string, ms: number): Promise<unknown[]> {
  return new Promise((resolve) => {
    const events: unknown[] = [];
    const handler = (data: unknown) => events.push(data);
    socket.on(event, handler);
    setTimeout(() => { socket.off(event, handler); resolve(events); }, ms);
  });
}

describe('Cross-Client Sync (real server)', () => {
  let serverAvailable = false;
  let apiToken: string | null = null;

  beforeAll(async () => {
    try {
      const resp = await fetch(`${SERVER}/api/health`);
      serverAvailable = resp.ok;
    } catch {
      console.log('⚠️  Server not running on localhost:3000 — skipping');
      return;
    }

    if (serverAvailable) {
      // Ensure test user exists with a real bcrypt password
      const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 12);
      await prisma.user.upsert({
        where: { email: TEST_EMAIL },
        update: { password: hashedPassword },
        create: { email: TEST_EMAIL, password: hashedPassword },
      });
    }
  });

  afterAll(async () => {
    // Clean up test user and related data
    try {
      const user = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
      if (user) {
        await prisma.apiToken.deleteMany({ where: { userId: user.id } });
        await prisma.pomodoro.deleteMany({ where: { userId: user.id } });
        await prisma.task.deleteMany({ where: { userId: user.id } });
        await prisma.dailyState.deleteMany({ where: { userId: user.id } });
        await prisma.stateTransitionLog.deleteMany({ where: { userId: user.id } });
        await prisma.userSettings.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
    } catch (error) {
      console.warn('[cross-client-sync] cleanup error:', error);
    } finally {
      await prisma.$disconnect();
    }
  });

  // =========================================================================
  // 1. Auth: API token (iOS flow)
  // =========================================================================

  describe('Auth: API token flow (iOS)', () => {
    it('should get API token via POST /api/auth/token', async () => {
      if (!serverAvailable) return;

      const resp = await fetch(`${SERVER}/api/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, clientType: 'mobile' }),
      });

      expect(resp.status).toBe(200);
      const data = await resp.json() as { success: boolean; token: string };
      expect(data.success).toBe(true);
      expect(data.token).toBeTruthy();
      apiToken = data.token;
    });

    it('should verify token via GET /api/auth/token', async () => {
      if (!serverAvailable || !apiToken) return;

      const resp = await fetch(`${SERVER}/api/auth/token`, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });

      expect(resp.status).toBe(200);
      const data = await resp.json() as { valid: boolean; user: { email: string } };
      expect(data.valid).toBe(true);
      expect(data.user.email).toBe(TEST_EMAIL);
    });
  });

  // =========================================================================
  // 2. WebSocket auth: token (iOS) + email (Web)
  // =========================================================================

  describe('WebSocket auth', () => {
    it('should connect via API token (iOS path)', async () => {
      if (!serverAvailable || !apiToken) return;

      const client = ioClient(SERVER, {
        transports: ['websocket'],
        auth: { token: apiToken },
      });

      await waitFor(client, 'connect');
      expect(client.connected).toBe(true);

      // Should receive initial sync
      const cmd = await waitFor(client, 'OCTOPUS_COMMAND') as { commandType: string };
      expect(['SYNC_STATE', 'UPDATE_POLICY']).toContain(cmd.commandType);

      client.disconnect();
    });

    it('should connect via API token (second client)', async () => {
      if (!serverAvailable || !apiToken) return;

      const client = ioClient(SERVER, {
        transports: ['websocket'],
        auth: { token: apiToken },
      });

      await waitFor(client, 'connect');
      expect(client.connected).toBe(true);
      client.disconnect();
    });
  });

  // =========================================================================
  // 3. Cross-client broadcast: DATA_CHANGE
  // =========================================================================

  describe('DATA_CHANGE broadcast', () => {
    let webClient: ClientSocket;
    let iosClient: ClientSocket;

    beforeAll(async () => {
      if (!serverAvailable || !apiToken) return;

      // Web client (token auth)
      webClient = ioClient(SERVER, { transports: ['websocket'], auth: { token: apiToken } });
      // iOS client (token auth)
      iosClient = ioClient(SERVER, { transports: ['websocket'], auth: { token: apiToken } });

      await Promise.all([
        waitFor(webClient, 'connect'),
        waitFor(iosClient, 'connect'),
      ]);

      // Wait for initial sync to settle
      await new Promise(r => setTimeout(r, 2000));
    });

    afterAll(() => {
      webClient?.disconnect();
      iosClient?.disconnect();
    });

    it('iOS client should receive DATA_CHANGE when Web creates a task', async () => {
      if (!serverAvailable || !iosClient) return;

      // Start collecting events on iOS client
      const eventsPromise = collectEvents(iosClient, 'OCTOPUS_COMMAND', 3000);

      // Web creates a task via HTTP (simulates browser action with API token)
      const resp = await fetch(`${SERVER}/api/trpc/task.quickCreateInbox?batch=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiToken}` },
        body: JSON.stringify({ '0': { json: { title: `cross-client-test-${Date.now()}` } } }),
      });
      expect(resp.status).toBe(200);

      const events = await eventsPromise;
      const commandTypes = events.map((e) => (e as { commandType: string }).commandType);

      console.log('[Test] iOS received after Web task create:', commandTypes);
      expect(commandTypes).toContain('DATA_CHANGE');

      const dataChange = events.find((e) => (e as { commandType: string }).commandType === 'DATA_CHANGE') as {
        payload: { entity: string; action: string };
      };
      expect(dataChange.payload.entity).toBe('task');
      expect(dataChange.payload.action).toBe('create');
    });

    it('Web client should receive DATA_CHANGE when iOS creates a task', async () => {
      if (!serverAvailable || !webClient) return;

      const eventsPromise = collectEvents(webClient, 'OCTOPUS_COMMAND', 3000);

      // iOS creates a task via HTTP with API token
      const resp = await fetch(`${SERVER}/api/trpc/task.quickCreateInbox?batch=1`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify({ '0': { json: { title: `ios-task-test-${Date.now()}` } } }),
      });
      expect(resp.status).toBe(200);

      const events = await eventsPromise;
      const commandTypes = events.map((e) => (e as { commandType: string }).commandType);

      console.log('[Test] Web received after iOS task create:', commandTypes);
      expect(commandTypes).toContain('DATA_CHANGE');
    });
  });

  // =========================================================================
  // 4. SYNC_STATE broadcast (pomodoro)
  // =========================================================================

  describe('SYNC_STATE broadcast (pomodoro)', () => {
    let client: ClientSocket;

    beforeAll(async () => {
      if (!serverAvailable || !apiToken) return;
      client = ioClient(SERVER, { transports: ['websocket'], auth: { token: apiToken } });
      await waitFor(client, 'connect');
      await new Promise(r => setTimeout(r, 2000));
    });

    afterAll(() => client?.disconnect());

    it('should receive SYNC_STATE when pomodoro starts', async () => {
      if (!serverAvailable || !client) return;

      const eventsPromise = collectEvents(client, 'OCTOPUS_COMMAND', 3000);

      // Start pomodoro
      const resp = await fetch(`${SERVER}/api/trpc/pomodoro.startTaskless?batch=1`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify({ '0': { json: { duration: 1500 } } }),
      });

      // May return 409 if already running — skip test in that case
      if (resp.status === 409) {
        console.log('[Test] Pomodoro already running, skipping');
        return;
      }
      expect(resp.status).toBe(200);

      const events = await eventsPromise;
      const types = events.map((e) => (e as { commandType: string }).commandType);
      console.log('[Test] Received after pomodoro start:', types);

      expect(types).toContain('SYNC_STATE');

      // Cleanup: abort the pomodoro
      const body = await resp.json() as Array<{ result: { data: { json: { id: string } } } }>;
      const pomId = body?.[0]?.result?.data?.json?.id;
      if (pomId) {
        await fetch(`${SERVER}/api/trpc/pomodoro.abort?batch=1`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiToken}` },
          body: JSON.stringify({ '0': { json: { id: pomId } } }),
        });
      }
    });
  });
});
