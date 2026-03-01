import { test, expect } from '../fixtures';
import {
  connectSocket,
  waitForConnect,
  collectCommands,
  sendChatMessage,
} from '../helpers/socket-test-utils';

/**
 * Chat Sync E2E Tests (F5.3)
 *
 * Tests multi-device message synchronisation:
 * - Two sockets for the same user -> A sends message -> B receives CHAT_SYNC
 * - A and B's message history is consistent
 */

test.describe('Chat Sync (F5.2)', () => {
  test('device A sends message -> device B receives CHAT_SYNC', async ({
    testUser,
  }) => {
    // Connect two sockets for the same user (simulating two devices)
    const socketA = connectSocket(testUser.email);
    const socketB = connectSocket(testUser.email);

    try {
      await Promise.all([
        waitForConnect(socketA),
        waitForConnect(socketB),
      ]);

      // Device B: listen for CHAT_SYNC
      const syncPromise = collectCommands<{
        conversationId: string;
        messages: Array<{
          id: string;
          role: string;
          content: string;
          createdAt: string;
        }>;
      }>(
        socketB,
        'CHAT_SYNC',
        (items) => items.length >= 1,
        30000
      );

      // Device A: also wait for CHAT_RESPONSE complete (so we know the flow finished)
      const responsePromise = collectCommands<{
        conversationId: string;
        messageId: string;
        type: 'delta' | 'complete';
        content: string;
      }>(
        socketA,
        'CHAT_RESPONSE',
        (items) => items.some((i) => i.type === 'complete'),
        30000
      );

      // Device A sends a chat message
      sendChatMessage(socketA, 'sync test from device A');

      // Wait for both
      const [syncResults, aResponses] = await Promise.all([
        syncPromise,
        responsePromise,
      ]);

      // Device B should have received CHAT_SYNC with the messages
      expect(syncResults.length).toBeGreaterThanOrEqual(1);
      const sync = syncResults[0];
      expect(sync.conversationId).toBeTruthy();
      expect(sync.messages.length).toBe(2); // user message + assistant reply

      const userMsg = sync.messages.find((m) => m.role === 'user');
      const assistantMsg = sync.messages.find((m) => m.role === 'assistant');
      expect(userMsg).toBeDefined();
      expect(userMsg!.content).toBe('sync test from device A');
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg!.content).toBeTruthy();

      // Device A should have received CHAT_RESPONSE complete
      const aComplete = aResponses.find((r) => r.type === 'complete');
      expect(aComplete).toBeDefined();

      // The assistant content from A's CHAT_RESPONSE should match B's CHAT_SYNC
      expect(assistantMsg!.content).toBe(aComplete!.content);
    } finally {
      socketA.disconnect();
      socketB.disconnect();
    }
  });

  test('both devices see consistent message history after sync', async ({
    testUser,
    prisma,
  }) => {
    const socketA = connectSocket(testUser.email);
    const socketB = connectSocket(testUser.email);

    try {
      await Promise.all([
        waitForConnect(socketA),
        waitForConnect(socketB),
      ]);

      // Listen on both sides
      const syncPromise = collectCommands<{
        conversationId: string;
        messages: Array<{
          id: string;
          role: string;
          content: string;
        }>;
      }>(
        socketB,
        'CHAT_SYNC',
        (items) => items.length >= 1,
        30000
      );

      const responsePromise = collectCommands<{
        conversationId: string;
        type: 'delta' | 'complete';
        content: string;
      }>(
        socketA,
        'CHAT_RESPONSE',
        (items) => items.some((i) => i.type === 'complete'),
        30000
      );

      sendChatMessage(socketA, 'history consistency test');

      const [syncResults] = await Promise.all([syncPromise, responsePromise]);

      const conversationId = syncResults[0].conversationId;

      // Verify DB has the correct messages for both devices
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, userId: testUser.id },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
        },
      });

      expect(conversation).toBeDefined();

      // At minimum: user message + assistant response
      const userMessages = conversation!.messages.filter((m) => m.role === 'user');
      const assistantMessages = conversation!.messages.filter((m) => m.role === 'assistant');
      expect(userMessages.length).toBeGreaterThanOrEqual(1);
      expect(assistantMessages.length).toBeGreaterThanOrEqual(1);

      // The latest user message should be our test message
      const lastUserMsg = userMessages[userMessages.length - 1];
      expect(lastUserMsg.content).toBe('history consistency test');

      // CHAT_SYNC messages should match what's in the DB
      const syncMessages = syncResults[0].messages;
      const syncUserMsg = syncMessages.find((m) => m.role === 'user');
      const syncAssistantMsg = syncMessages.find((m) => m.role === 'assistant');

      expect(syncUserMsg!.content).toBe(lastUserMsg.content);
      const lastAssistantMsg = assistantMessages[assistantMessages.length - 1];
      expect(syncAssistantMsg!.content).toBe(lastAssistantMsg.content);
    } finally {
      socketA.disconnect();
      socketB.disconnect();
    }
  });
});
