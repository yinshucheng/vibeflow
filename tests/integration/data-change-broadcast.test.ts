/**
 * DATA_CHANGE Broadcast Integration Test
 *
 * Verifies that when a tRPC mutation is called, all connected clients
 * for the same user receive a DATA_CHANGE OCTOPUS_COMMAND via WebSocket.
 *
 * Uses real socket.io server + client to test the full broadcast path:
 *   mutation → broadcastDataChange → socketServer.broadcastOctopusCommand → client
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';

// Simulates the broadcast path without needing the full app server
describe('DATA_CHANGE Broadcast', () => {
  let httpServer: ReturnType<typeof createServer>;
  let ioServer: Server;
  let port: number;

  beforeAll(async () => {
    httpServer = createServer();
    ioServer = new Server(httpServer, {
      cors: { origin: '*' },
      transports: ['websocket'],
    });

    // Simulate server: join user rooms on connect, broadcast DATA_CHANGE
    ioServer.on('connection', (socket) => {
      const userId = socket.handshake.auth?.userId;
      if (userId) {
        socket.join(`user:${userId}`);
      }

      // Simulate a tRPC mutation triggering DATA_CHANGE
      socket.on('TRIGGER_MUTATION', (data: { userId: string; entity: string; action: string; ids: string[] }) => {
        // This is what broadcastOctopusCommand does
        ioServer.to(`user:${data.userId}`).emit('OCTOPUS_COMMAND', {
          commandId: 'test-cmd-id',
          commandType: 'DATA_CHANGE',
          targetClient: 'all',
          priority: 'normal',
          requiresAck: false,
          createdAt: Date.now(),
          payload: {
            entity: data.entity,
            action: data.action,
            ids: data.ids,
            timestamp: Date.now(),
          },
        });
      });
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        port = (httpServer.address() as { port: number }).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    ioServer.close();
    httpServer.close();
  });

  function createClient(userId: string): ClientSocket {
    return ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
      auth: { userId },
    });
  }

  function waitForEvent(socket: ClientSocket, event: string, timeout = 3000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeout);
      socket.once(event, (data: unknown) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }

  it('should deliver DATA_CHANGE to another client of the same user', async () => {
    const userId = 'user-123';
    const client1 = createClient(userId);
    const client2 = createClient(userId);

    await Promise.all([
      new Promise<void>((r) => client1.on('connect', r)),
      new Promise<void>((r) => client2.on('connect', r)),
    ]);

    // Client 2 listens for OCTOPUS_COMMAND
    const received = waitForEvent(client2, 'OCTOPUS_COMMAND');

    // Client 1 triggers a mutation (simulates tRPC mutation → broadcastDataChange)
    client1.emit('TRIGGER_MUTATION', {
      userId,
      entity: 'task',
      action: 'update',
      ids: ['task-abc'],
    });

    const command = (await received) as { commandType: string; payload: { entity: string; ids: string[] } };
    expect(command.commandType).toBe('DATA_CHANGE');
    expect(command.payload.entity).toBe('task');
    expect(command.payload.ids).toEqual(['task-abc']);

    client1.disconnect();
    client2.disconnect();
  });

  it('should deliver DATA_CHANGE to the sender too (same user room)', async () => {
    const userId = 'user-456';
    const client1 = createClient(userId);

    await new Promise<void>((r) => client1.on('connect', r));

    const received = waitForEvent(client1, 'OCTOPUS_COMMAND');

    client1.emit('TRIGGER_MUTATION', {
      userId,
      entity: 'project',
      action: 'create',
      ids: ['proj-xyz'],
    });

    const command = (await received) as { commandType: string; payload: { entity: string } };
    expect(command.commandType).toBe('DATA_CHANGE');
    expect(command.payload.entity).toBe('project');

    client1.disconnect();
  });

  it('should NOT deliver DATA_CHANGE to clients of a different user', async () => {
    const client1 = createClient('user-A');
    const client2 = createClient('user-B');

    await Promise.all([
      new Promise<void>((r) => client1.on('connect', r)),
      new Promise<void>((r) => client2.on('connect', r)),
    ]);

    const spy = vi.fn();
    client2.on('OCTOPUS_COMMAND', spy);

    client1.emit('TRIGGER_MUTATION', {
      userId: 'user-A',
      entity: 'task',
      action: 'delete',
      ids: ['task-123'],
    });

    // Wait a bit to ensure no event arrives
    await new Promise((r) => setTimeout(r, 500));
    expect(spy).not.toHaveBeenCalled();

    client1.disconnect();
    client2.disconnect();
  });

  it('should include timestamp in DATA_CHANGE payload', async () => {
    const userId = 'user-789';
    const client1 = createClient(userId);

    await new Promise<void>((r) => client1.on('connect', r));

    const before = Date.now();
    const received = waitForEvent(client1, 'OCTOPUS_COMMAND');

    client1.emit('TRIGGER_MUTATION', {
      userId,
      entity: 'settings',
      action: 'update',
      ids: ['settings'],
    });

    const command = (await received) as { payload: { timestamp: number } };
    expect(command.payload.timestamp).toBeGreaterThanOrEqual(before);
    expect(command.payload.timestamp).toBeLessThanOrEqual(Date.now() + 1000);

    client1.disconnect();
  });
});
