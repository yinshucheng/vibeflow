import { test, expect } from '../fixtures';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';

/**
 * Chat Basic E2E Tests (F5.3)
 *
 * Tests the end-to-end flow of sending CHAT_MESSAGE events and
 * receiving CHAT_RESPONSE commands via Socket.io.
 *
 * - Send CHAT_MESSAGE → receive CHAT_RESPONSE (delta * N + complete)
 * - Message persistence: after sending, tRPC chat.getHistory returns the messages
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

/** Helper: connect a Socket.io client authenticated as a given email */
function connectSocket(email: string): ClientSocket {
  return ioClient(BASE_URL, {
    transports: ['websocket'],
    auth: { email },
  });
}

/** Helper: wait for connection */
function waitForConnect(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Socket connect timeout')), 10000);
    socket.on('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Collect OCTOPUS_COMMAND events matching a given commandType.
 * Returns a promise that resolves when predicate returns true or times out.
 */
function collectCommands<T>(
  socket: ClientSocket,
  commandType: string,
  predicate: (collected: T[]) => boolean,
  timeoutMs: number = 30000
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const collected: T[] = [];
    const timeout = setTimeout(() => {
      socket.off('OCTOPUS_COMMAND', handler);
      reject(new Error(`Timeout waiting for ${commandType}: collected ${collected.length} so far`));
    }, timeoutMs);

    function handler(command: { commandType: string; payload: T }) {
      if (command.commandType === commandType) {
        collected.push(command.payload);
        if (predicate(collected)) {
          clearTimeout(timeout);
          socket.off('OCTOPUS_COMMAND', handler);
          resolve(collected);
        }
      }
    }

    socket.on('OCTOPUS_COMMAND', handler);
  });
}

test.describe('Chat Basic (F5)', () => {
  test('send CHAT_MESSAGE → receive CHAT_RESPONSE delta + complete', async ({
    testUser,
  }) => {
    const socket = connectSocket(testUser.email);
    try {
      await waitForConnect(socket);

      // Set up collector for CHAT_RESPONSE — wait until we get a 'complete' message
      const responsePromise = collectCommands<{
        conversationId: string;
        messageId: string;
        type: 'delta' | 'complete';
        content: string;
      }>(
        socket,
        'CHAT_RESPONSE',
        (items) => items.some((i) => i.type === 'complete'),
        30000
      );

      // Send a chat message
      socket.emit('OCTOPUS_EVENT', {
        eventType: 'CHAT_MESSAGE',
        timestamp: Date.now(),
        clientType: 'mobile',
        payload: {
          conversationId: '',
          messageId: crypto.randomUUID(),
          content: 'Hello, this is a test message',
        },
      });

      const responses = await responsePromise;

      // Should have at least one response (the complete)
      expect(responses.length).toBeGreaterThanOrEqual(1);

      // The last response should be 'complete'
      const completeResponse = responses.find((r) => r.type === 'complete');
      expect(completeResponse).toBeDefined();
      expect(completeResponse!.content).toBeTruthy();
      expect(completeResponse!.conversationId).toBeTruthy();
      expect(completeResponse!.messageId).toBeTruthy();

      // If there are delta responses, each should have content
      const deltas = responses.filter((r) => r.type === 'delta');
      for (const delta of deltas) {
        expect(delta.content).toBeTruthy();
      }
    } finally {
      socket.disconnect();
    }
  });

  test('messages are persisted in the database', async ({
    testUser,
    prisma,
  }) => {
    const socket = connectSocket(testUser.email);
    try {
      await waitForConnect(socket);

      const responsePromise = collectCommands<{
        conversationId: string;
        messageId: string;
        type: 'delta' | 'complete';
        content: string;
      }>(
        socket,
        'CHAT_RESPONSE',
        (items) => items.some((i) => i.type === 'complete'),
        30000
      );

      socket.emit('OCTOPUS_EVENT', {
        eventType: 'CHAT_MESSAGE',
        timestamp: Date.now(),
        clientType: 'mobile',
        payload: {
          conversationId: '',
          messageId: crypto.randomUUID(),
          content: 'persistence test message',
        },
      });

      const responses = await responsePromise;
      const complete = responses.find((r) => r.type === 'complete')!;

      // Verify messages are persisted in DB
      const conversation = await prisma.conversation.findFirst({
        where: {
          userId: testUser.id,
          type: 'DEFAULT',
          status: 'ACTIVE',
        },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 2,
          },
        },
      });

      expect(conversation).toBeDefined();
      expect(conversation!.messages.length).toBeGreaterThanOrEqual(2);

      // The most recent messages should be user + assistant
      const roles = conversation!.messages.map((m) => m.role).sort();
      expect(roles).toContain('user');
      expect(roles).toContain('assistant');

      // User message content should match
      const userMsg = conversation!.messages.find((m) => m.role === 'user');
      expect(userMsg?.content).toBe('persistence test message');

      // Assistant message should match complete response
      const assistantMsg = conversation!.messages.find((m) => m.role === 'assistant');
      expect(assistantMsg?.content).toBe(complete.content);
    } finally {
      socket.disconnect();
    }
  });
});
