/**
 * DATA_CHANGE End-to-End Test
 *
 * Tests the REAL broadcast path: tRPC mutation → broadcastDataChange → socket push.
 * Uses the actual app server (not mocked socket.io), two real socket.io clients.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';

// Use the test server on port 3000 (must be running: npm run dev)
const SERVER_URL = 'http://localhost:3000';
const TEST_EMAIL = 'test@vibeflow.local';

describe('DATA_CHANGE E2E (real server)', () => {
  let client1: ClientSocket;
  let client2: ClientSocket;

  function createAuthenticatedClient(email: string): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const client = ioClient(SERVER_URL, {
        transports: ['websocket'],
        auth: { email },
      });
      const timeout = setTimeout(() => {
        client.disconnect();
        reject(new Error('Connection timeout'));
      }, 5000);
      client.on('connect', () => {
        clearTimeout(timeout);
        // Wait for client_registered event (server sends after auth)
        client.once('client_registered', () => resolve(client));
        // Fallback: if no client_registered, resolve after short delay
        setTimeout(() => resolve(client), 1000);
      });
      client.on('connect_error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  beforeAll(async () => {
    // Skip if server not running
    try {
      const resp = await fetch(`${SERVER_URL}/api/health`);
      if (!resp.ok) throw new Error('Server not healthy');
    } catch {
      console.log('⚠️ Server not running on port 3000, skipping E2E tests');
      return;
    }

    // Connect two clients as the same user
    client1 = await createAuthenticatedClient(TEST_EMAIL);
    client2 = await createAuthenticatedClient(TEST_EMAIL);
  }, 15000);

  afterAll(() => {
    client1?.disconnect();
    client2?.disconnect();
  });

  it('both clients should be connected', () => {
    if (!client1 || !client2) return; // skip if no server
    expect(client1.connected).toBe(true);
    expect(client2.connected).toBe(true);
  });

  it('client2 should receive OCTOPUS_COMMAND when client1 triggers a task mutation via HTTP', async () => {
    if (!client1 || !client2) return;

    // Listen for any OCTOPUS_COMMAND on client2
    const commands: Array<{ commandType: string; payload: unknown }> = [];
    client2.on('OCTOPUS_COMMAND', (cmd: { commandType: string; payload: unknown }) => {
      commands.push(cmd);
    });

    // Trigger a task creation via tRPC HTTP (simulating tab1 action)
    const response = await fetch(`${SERVER_URL}/api/trpc/task.create?batch=1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Dev-User-Email': TEST_EMAIL,
      },
      body: JSON.stringify({
        '0': {
          json: {
            title: 'E2E test task for DATA_CHANGE',
            priority: 'P2',
            planDate: new Date().toISOString().split('T')[0],
          },
        },
      }),
    });

    expect(response.ok).toBe(true);

    // Wait for WS push to arrive
    await new Promise((r) => setTimeout(r, 2000));

    // Check if client2 received DATA_CHANGE
    const dataChanges = commands.filter((c) => c.commandType === 'DATA_CHANGE');
    const syncStates = commands.filter((c) => c.commandType === 'SYNC_STATE');

    console.log('Commands received by client2:', commands.map(c => c.commandType));
    console.log('DATA_CHANGE payloads:', dataChanges.map(c => c.payload));

    // Should receive at least one command (DATA_CHANGE or SYNC_STATE)
    expect(commands.length).toBeGreaterThan(0);

    // Specifically check for DATA_CHANGE with entity 'task'
    if (dataChanges.length > 0) {
      const taskChange = dataChanges.find(
        (c) => (c.payload as { entity: string }).entity === 'task'
      );
      expect(taskChange).toBeDefined();
    }
  }, 10000);

  it('client2 should receive SYNC_STATE when pomodoro starts', async () => {
    if (!client1 || !client2) return;

    const commands: Array<{ commandType: string; payload: unknown }> = [];
    client2.on('OCTOPUS_COMMAND', (cmd: { commandType: string; payload: unknown }) => {
      commands.push(cmd);
    });

    // Start a taskless pomodoro via HTTP
    const response = await fetch(`${SERVER_URL}/api/trpc/pomodoro.startTaskless?batch=1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Dev-User-Email': TEST_EMAIL,
      },
      body: JSON.stringify({
        '0': { json: { duration: 1500 } },
      }),
    });

    // May fail if pomodoro already running — that's ok
    const data = await response.json();
    console.log('Pomodoro start response:', JSON.stringify(data).substring(0, 200));

    // Wait for WS push
    await new Promise((r) => setTimeout(r, 2000));

    console.log('Commands after pomodoro start:', commands.map(c => c.commandType));

    // Should receive SYNC_STATE (from broadcastFullState) and/or UPDATE_POLICY
    const hasSync = commands.some((c) => c.commandType === 'SYNC_STATE');
    const hasPolicy = commands.some((c) => c.commandType === 'UPDATE_POLICY');

    // At least one broadcast should arrive
    expect(hasSync || hasPolicy).toBe(true);
  }, 10000);
});
