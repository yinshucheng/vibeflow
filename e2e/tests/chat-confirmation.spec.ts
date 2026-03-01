import { test, expect } from '../fixtures';
import {
  connectSocket,
  waitForConnect,
  collectCommands,
  collectAnyCommands,
  sendChatMessage,
  sendChatAction,
} from '../helpers/socket-test-utils';

/**
 * Chat Confirmation E2E Tests (S2.3)
 *
 * Tests the high-risk operation confirmation mechanism:
 * - High-risk tool -> CHAT_TOOL_CALL with requiresConfirmation=true -> confirm -> execute
 * - High-risk tool -> cancel -> tool not executed
 * - Low-risk tool -> auto-execute (no confirmation needed)
 */

test.describe('Chat Confirmation Mechanism (S2)', () => {
  test('high-risk tool (flow_delete_task) requires confirmation', async ({
    testUser,
    prisma,
  }) => {
    // Create a task to potentially delete
    const project = await prisma.project.findFirst({
      where: { userId: testUser.id },
    });
    if (!project) {
      test.skip();
      return;
    }

    const taskToDelete = await prisma.task.create({
      data: {
        title: 'Task to be deleted via chat',
        projectId: project.id,
        userId: testUser.id,
        priority: 'P3',
        status: 'TODO',
      },
    });

    const socket = connectSocket(testUser.email);
    try {
      await waitForConnect(socket);

      // Listen for CHAT_TOOL_CALL with requiresConfirmation
      const toolCallPromise = collectCommands<{
        conversationId: string;
        messageId: string;
        toolCallId: string;
        toolName: string;
        requiresConfirmation: boolean;
        parameters: Record<string, unknown>;
      }>(
        socket,
        'CHAT_TOOL_CALL',
        (items) => items.some((i) => i.toolName === 'flow_delete_task'),
        30000
      );

      // Send a message asking to delete the task
      sendChatMessage(socket, `删除任务 ${taskToDelete.id}`);

      const toolCalls = await toolCallPromise;
      const deleteToolCall = toolCalls.find(
        (tc) => tc.toolName === 'flow_delete_task'
      );

      expect(deleteToolCall).toBeDefined();
      expect(deleteToolCall!.requiresConfirmation).toBe(true);

      // Now confirm the tool call
      const resultPromise = collectCommands<{
        toolCallId: string;
        success: boolean;
        summary: string;
      }>(
        socket,
        'CHAT_TOOL_RESULT',
        (items) =>
          items.some((i) => i.toolCallId === deleteToolCall!.toolCallId),
        30000
      );

      sendChatAction(
        socket,
        deleteToolCall!.conversationId,
        deleteToolCall!.toolCallId,
        'confirm'
      );

      const results = await resultPromise;
      const result = results.find(
        (r) => r.toolCallId === deleteToolCall!.toolCallId
      );
      expect(result).toBeDefined();
      expect(result!.success).toBe(true);
    } finally {
      socket.disconnect();
      // Cleanup: task may already be deleted
      await prisma.task
        .delete({ where: { id: taskToDelete.id } })
        .catch(() => {});
    }
  });

  test('high-risk tool cancel prevents execution', async ({
    testUser,
    prisma,
  }) => {
    const project = await prisma.project.findFirst({
      where: { userId: testUser.id },
    });
    if (!project) {
      test.skip();
      return;
    }

    const taskToKeep = await prisma.task.create({
      data: {
        title: 'Task that should survive cancel',
        projectId: project.id,
        userId: testUser.id,
        priority: 'P3',
        status: 'TODO',
      },
    });

    const socket = connectSocket(testUser.email);
    try {
      await waitForConnect(socket);

      const toolCallPromise = collectCommands<{
        conversationId: string;
        toolCallId: string;
        toolName: string;
        requiresConfirmation: boolean;
      }>(
        socket,
        'CHAT_TOOL_CALL',
        (items) => items.some((i) => i.toolName === 'flow_delete_task'),
        30000
      );

      sendChatMessage(socket, `删除任务 ${taskToKeep.id}`);

      const toolCalls = await toolCallPromise;
      const deleteToolCall = toolCalls.find(
        (tc) => tc.toolName === 'flow_delete_task'
      )!;

      // Cancel instead of confirm
      const resultPromise = collectCommands<{
        toolCallId: string;
        success: boolean;
        summary: string;
      }>(
        socket,
        'CHAT_TOOL_RESULT',
        (items) =>
          items.some((i) => i.toolCallId === deleteToolCall.toolCallId),
        30000
      );

      sendChatAction(
        socket,
        deleteToolCall.conversationId,
        deleteToolCall.toolCallId,
        'cancel'
      );

      const results = await resultPromise;
      const result = results.find(
        (r) => r.toolCallId === deleteToolCall.toolCallId
      );
      expect(result).toBeDefined();
      // Cancelled tool should not succeed / indicate cancellation
      expect(result!.summary).toContain('cancel');

      // Verify the task still exists
      const task = await prisma.task.findUnique({
        where: { id: taskToKeep.id },
      });
      expect(task).not.toBeNull();
    } finally {
      socket.disconnect();
      await prisma.task
        .delete({ where: { id: taskToKeep.id } })
        .catch(() => {});
    }
  });

  test('low-risk tool (flow_get_task) auto-executes without confirmation', async ({
    testUser,
    prisma,
  }) => {
    const project = await prisma.project.findFirst({
      where: { userId: testUser.id },
    });
    if (!project) {
      test.skip();
      return;
    }

    const taskToRead = await prisma.task.create({
      data: {
        title: 'Task for auto-execute test',
        projectId: project.id,
        userId: testUser.id,
        priority: 'P2',
        status: 'TODO',
      },
    });

    const socket = connectSocket(testUser.email);
    try {
      await waitForConnect(socket);

      // Collect both CHAT_TOOL_CALL and CHAT_RESPONSE
      const toolCallsWithConfirmation = collectAnyCommands(
        socket,
        'CHAT_TOOL_CALL',
        15000
      );

      // Also wait for the complete response
      const responsePromise = collectCommands<{
        type: 'delta' | 'complete';
        content: string;
      }>(
        socket,
        'CHAT_RESPONSE',
        (items) => items.some((i) => i.type === 'complete'),
        30000
      );

      sendChatMessage(socket, `查看任务 ${taskToRead.id} 的详情`);

      // Wait for the complete response
      const responses = await responsePromise;
      expect(responses.some((r) => r.type === 'complete')).toBe(true);

      // Check that any CHAT_TOOL_CALL that was emitted has requiresConfirmation=false
      const toolCalls = (await toolCallsWithConfirmation) as Array<{
        requiresConfirmation: boolean;
        toolName: string;
      }>;
      for (const tc of toolCalls) {
        if (tc.toolName === 'flow_get_task') {
          expect(tc.requiresConfirmation).toBe(false);
        }
      }
    } finally {
      socket.disconnect();
      await prisma.task
        .delete({ where: { id: taskToRead.id } })
        .catch(() => {});
    }
  });
});
