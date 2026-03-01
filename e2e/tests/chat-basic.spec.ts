import { test, expect } from '../fixtures';
import {
  connectSocket,
  waitForConnect,
  collectCommands,
  sendChatMessage,
} from '../helpers/socket-test-utils';

/**
 * Chat Basic E2E Tests (F5.3)
 *
 * Tests the end-to-end flow of sending CHAT_MESSAGE events and
 * receiving CHAT_RESPONSE commands via Socket.io.
 *
 * - Send CHAT_MESSAGE -> receive CHAT_RESPONSE (delta * N + complete)
 * - Message persistence: after sending, tRPC chat.getHistory returns the messages
 */

test.describe('Chat Basic (F5)', () => {
  test('send CHAT_MESSAGE -> receive CHAT_RESPONSE delta + complete', async ({
    testUser,
  }) => {
    const socket = connectSocket(testUser.email);
    try {
      await waitForConnect(socket);

      // Set up collector for CHAT_RESPONSE -- wait until we get a 'complete' message
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
      sendChatMessage(socket, 'Hello, this is a test message');

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

      sendChatMessage(socket, 'persistence test message');

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
