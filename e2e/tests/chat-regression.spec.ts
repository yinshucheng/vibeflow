import { test, expect } from '../fixtures';
import {
  connectSocket,
  waitForConnect,
  collectCommands,
  sendChatMessage,
  waitForChatComplete,
} from '../helpers/socket-test-utils';

/**
 * Chat Regression E2E Tests
 *
 * Covers bugs discovered during manual acceptance testing:
 * - BUG-2: Empty assistant messages persisted in DB
 * - BUG-3: Cold-start connection does not receive chat history
 * - BUG-4: Tool-triggered pomodoro start does not broadcast SYNC_STATE to other devices
 * - BUG-5: User with no projects — chat task creation should auto-create Inbox project
 */

test.describe('Chat Regression', () => {
  test('BUG-2: empty assistant message is not persisted', async ({
    testUser,
    prisma,
  }) => {
    const socket = connectSocket(testUser.email);
    try {
      await waitForConnect(socket);

      // Send a message and wait for complete response
      const responsePromise = waitForChatComplete(socket);
      sendChatMessage(socket, 'Hello, regression test for empty message');
      await responsePromise;

      // Allow a short settle time for any async DB writes
      await new Promise((r) => setTimeout(r, 1000));

      // Check DB: no assistant messages with empty content
      const emptyAssistantMessages = await prisma.chatMessage.findMany({
        where: {
          conversation: {
            userId: testUser.id,
          },
          role: 'assistant',
          content: '',
        },
      });

      expect(emptyAssistantMessages.length).toBe(0);
    } finally {
      socket.disconnect();
    }
  });

  test('BUG-3: cold-start connection receives CHAT_SYNC with history', async ({
    testUser,
    chatHelper,
  }) => {
    // Seed a conversation with 4 messages (2 user + 2 assistant)
    const seeded = await chatHelper.seedConversation(testUser.id, 4);
    const seededCount = seeded.messages.length;

    // Now connect a fresh socket — should receive CHAT_SYNC on connect
    const socket = connectSocket(testUser.email);
    try {
      await waitForConnect(socket);

      const syncPromise = collectCommands<{
        conversationId: string;
        messages: Array<{ id: string; role: string; content: string }>;
      }>(
        socket,
        'CHAT_SYNC',
        (items) => items.length >= 1,
        15000
      );

      const syncResults = await syncPromise;

      expect(syncResults.length).toBeGreaterThanOrEqual(1);
      // The CHAT_SYNC should contain at least the seeded messages
      const sync = syncResults[0];
      expect(sync.messages.length).toBeGreaterThanOrEqual(seededCount);
    } finally {
      socket.disconnect();
    }
  });

  test('BUG-4: tool-triggered pomodoro broadcasts SYNC_STATE to other device', async ({
    testUser,
    prisma,
    projectFactory,
  }) => {
    // Create project + task for the pomodoro
    const project = await projectFactory.create(testUser.id, { title: 'Regression Test Project' });
    const task = await prisma.task.create({
      data: {
        title: 'Regression pomodoro task',
        projectId: project.id,
        userId: testUser.id,
        priority: 'P2',
        status: 'TODO',
      },
    });

    const socketA = connectSocket(testUser.email);
    const socketB = connectSocket(testUser.email);

    try {
      await Promise.all([
        waitForConnect(socketA),
        waitForConnect(socketB),
      ]);

      // Device B: listen for SYNC_STATE broadcast
      const syncStatePromise = collectCommands<Record<string, unknown>>(
        socketB,
        'SYNC_STATE',
        (items) => items.length >= 1,
        45000
      );

      // Device A: send a chat message requesting to start a pomodoro
      const responsePromise = waitForChatComplete(socketA, 45000);
      sendChatMessage(socketA, `开始一个25分钟的番茄钟，任务是 ${task.id}`);

      await responsePromise;

      // Device B should have received a SYNC_STATE command
      const syncStates = await syncStatePromise;
      expect(syncStates.length).toBeGreaterThanOrEqual(1);
    } finally {
      socketA.disconnect();
      socketB.disconnect();
      // Cleanup any started pomodoros
      await prisma.pomodoro.deleteMany({
        where: { taskId: task.id, status: 'IN_PROGRESS' },
      });
    }
  });

  test('BUG-5: user with no projects — task creation auto-creates Inbox', async ({
    testUser,
    prisma,
  }) => {
    // Ensure the test user has NO projects
    await prisma.project.deleteMany({
      where: { userId: testUser.id },
    });

    const socket = connectSocket(testUser.email);
    try {
      await waitForConnect(socket);

      // Send a message that triggers task creation
      const responsePromise = waitForChatComplete(socket, 45000);
      sendChatMessage(socket, '帮我创建一个任务：写回归测试');
      await responsePromise;

      // Allow settle time for DB writes
      await new Promise((r) => setTimeout(r, 2000));

      // Check: user should now have a project (Inbox auto-created)
      const projects = await prisma.project.findMany({
        where: { userId: testUser.id },
      });
      expect(projects.length).toBeGreaterThanOrEqual(1);

      // The auto-created project should be named "Inbox" or similar
      const inboxProject = projects.find(
        (p) => p.title.toLowerCase().includes('inbox')
      );
      expect(inboxProject).toBeDefined();
    } finally {
      socket.disconnect();
    }
  });
});
