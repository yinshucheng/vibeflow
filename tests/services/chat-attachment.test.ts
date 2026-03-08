/**
 * D3 — S11.3 Chat Attachment Context Injection Tests
 *
 * Verifies that chatService.handleMessage correctly resolves attachment references
 * from the database and injects contextual information into the LLM prompt.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

// Mock @ai-sdk/openai before importing anything that uses it
vi.mock('@ai-sdk/openai', () => {
  const mockModel = { modelId: 'mock-model', provider: 'mock-provider' };
  const mockChatFn = vi.fn(() => mockModel);
  const mockProvider = Object.assign(vi.fn(() => mockModel), { chat: mockChatFn });
  return {
    createOpenAI: vi.fn(() => mockProvider),
  };
});

// Mock ai SDK
vi.mock('ai', () => {
  return {
    streamText: vi.fn(),
    generateText: vi.fn(),
    stepCountIs: vi.fn((n: number) => ({ type: 'stepCount', count: n })),
    tool: vi.fn((def: Record<string, unknown>) => def),
  };
});

import { streamText } from 'ai';
import {
  setupChatTestUser,
  cleanupChatTestUser,
  skipIfNoDb,
  getTestUserId,
  prisma,
} from '../helpers/chat-test-setup';
import { mockStreamText } from '../helpers/llm-mock';
import { chatService } from '../../src/services/chat.service';

beforeAll(() => setupChatTestUser());
afterAll(() => cleanupChatTestUser());

beforeEach(async () => {
  vi.clearAllMocks();

  if (getTestUserId()) {
    try {
      await prisma.lLMUsageLog.deleteMany({ where: { userId: getTestUserId() } });
      await prisma.chatMessage.deleteMany({ where: { conversation: { userId: getTestUserId() } } });
      await prisma.conversation.deleteMany({ where: { userId: getTestUserId() } });
      await prisma.pomodoro.deleteMany({ where: { userId: getTestUserId() } });
      await prisma.task.deleteMany({ where: { userId: getTestUserId() } });
      await prisma.project.deleteMany({ where: { userId: getTestUserId() } });
    } catch {
      // ignore cleanup errors
    }
  }
});

describe('chatService.resolveAttachmentContext', () => {
  it('should resolve task attachment with details from DB', () =>
    skipIfNoDb(async () => {
      const userId = getTestUserId();

      // Create a project and task
      const project = await prisma.project.create({
        data: { userId, title: 'Test Project', deliverable: 'Test deliverable' },
      });
      const task = await prisma.task.create({
        data: {
          projectId: project.id,
          userId,
          title: 'Fix login bug',
          priority: 'P1',
          status: 'TODO',
          estimatedMinutes: 30,
        },
      });

      const result = await chatService.resolveAttachmentContext(userId, [
        { type: 'task', id: task.id, title: 'Fix login bug' },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain('[Referenced Task]');
      expect(result[0]).toContain('Fix login bug');
      expect(result[0]).toContain('P1');
      expect(result[0]).toContain('~30min');
      expect(result[0]).toContain('Test Project');
    }));

  it('should resolve project attachment with task summary', () =>
    skipIfNoDb(async () => {
      const userId = getTestUserId();

      const project = await prisma.project.create({
        data: {
          userId,
          title: 'Feature Sprint',
          deliverable: 'New feature set',
        },
      });
      await prisma.task.createMany({
        data: [
          { projectId: project.id, userId, title: 'Task A', priority: 'P1', status: 'TODO' },
          { projectId: project.id, userId, title: 'Task B', priority: 'P2', status: 'DONE' },
        ],
      });

      const result = await chatService.resolveAttachmentContext(userId, [
        { type: 'project', id: project.id, title: 'Feature Sprint' },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain('[Referenced Project]');
      expect(result[0]).toContain('Feature Sprint');
      expect(result[0]).toContain('New feature set');
      expect(result[0]).toContain('Task A');
      expect(result[0]).toContain('Task B');
    }));

  it('should resolve pomodoro attachment', () =>
    skipIfNoDb(async () => {
      const userId = getTestUserId();

      const project = await prisma.project.create({
        data: { userId, title: 'Pomo Project', deliverable: 'test' },
      });
      const task = await prisma.task.create({
        data: { projectId: project.id, userId, title: 'Focus task', priority: 'P2', status: 'TODO' },
      });
      const pomodoro = await prisma.pomodoro.create({
        data: {
          userId,
          taskId: task.id,
          duration: 25,
          status: 'COMPLETED',
          summary: 'Finished the feature implementation',
        },
      });

      const result = await chatService.resolveAttachmentContext(userId, [
        { type: 'pomodoro', id: pomodoro.id, title: 'Pomodoro' },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain('[Referenced Pomodoro]');
      expect(result[0]).toContain('25min');
      expect(result[0]).toContain('COMPLETED');
      expect(result[0]).toContain('Focus task');
      expect(result[0]).toContain('Finished the feature implementation');
    }));

  it('should return empty array for non-existent attachment', () =>
    skipIfNoDb(async () => {
      const userId = getTestUserId();

      const result = await chatService.resolveAttachmentContext(userId, [
        { type: 'task', id: 'non-existent-id', title: 'Ghost Task' },
      ]);

      expect(result).toHaveLength(0);
    }));

  it('should not resolve attachments belonging to other users', () =>
    skipIfNoDb(async () => {
      const userId = getTestUserId();

      // Create task under a different user
      const otherUser = await prisma.user.create({
        data: { email: `other-${Date.now()}@test.local`, password: 'test' },
      });
      const otherProject = await prisma.project.create({
        data: { userId: otherUser.id, title: 'Other Project', deliverable: 'other' },
      });
      const otherTask = await prisma.task.create({
        data: { projectId: otherProject.id, userId: otherUser.id, title: 'Secret task', priority: 'P1', status: 'TODO' },
      });

      const result = await chatService.resolveAttachmentContext(userId, [
        { type: 'task', id: otherTask.id, title: 'Secret task' },
      ]);

      // Should not resolve — different user
      expect(result).toHaveLength(0);

      // Cleanup other user
      await prisma.task.deleteMany({ where: { projectId: otherProject.id } });
      await prisma.project.deleteMany({ where: { userId: otherUser.id } });
      await prisma.user.delete({ where: { id: otherUser.id } });
    }));
});

describe('chatService.handleMessage with attachments', () => {
  it('should inject attachment context into LLM messages', () =>
    skipIfNoDb(async () => {
      const userId = getTestUserId();
      const mockedStreamText = streamText as ReturnType<typeof vi.fn>;
      mockStreamText(mockedStreamText, 'I see you have a P1 task about login.');

      // Create task for attachment
      const project = await prisma.project.create({
        data: { userId, title: 'LLM Test Project', deliverable: 'test' },
      });
      const task = await prisma.task.create({
        data: {
          projectId: project.id,
          userId,
          title: 'Fix auth flow',
          priority: 'P1',
          status: 'IN_PROGRESS',
        },
      });

      const result = await chatService.handleMessage(
        userId,
        '帮我分析一下这个任务',
        undefined,
        [{ type: 'task', id: task.id, title: 'Fix auth flow' }]
      );

      expect(result.success).toBe(true);
      expect(result.data?.fullText).toContain('login');

      // Verify the LLM was called with attachment context injected
      expect(mockedStreamText).toHaveBeenCalledTimes(1);
      const callArgs = mockedStreamText.mock.calls[0][0];
      const lastMessage = callArgs.messages[callArgs.messages.length - 1];
      expect(lastMessage.content).toContain('帮我分析一下这个任务');
      expect(lastMessage.content).toContain('[Referenced Task]');
      expect(lastMessage.content).toContain('Fix auth flow');
      expect(lastMessage.content).toContain('P1');
    }));

  it('should work normally without attachments', () =>
    skipIfNoDb(async () => {
      const userId = getTestUserId();
      const mockedStreamText = streamText as ReturnType<typeof vi.fn>;
      mockStreamText(mockedStreamText, 'Hello there!');

      const result = await chatService.handleMessage(userId, 'Hello');

      expect(result.success).toBe(true);
      expect(result.data?.fullText).toBe('Hello there!');

      // Verify no attachment context was injected
      // Note: handleMessage prepends a time prefix like "[2026/3/9 12:00]\n" to the LLM message
      const callArgs = mockedStreamText.mock.calls[0][0];
      const lastMessage = callArgs.messages[callArgs.messages.length - 1];
      expect(lastMessage.content).toContain('Hello');
      expect(lastMessage.content).not.toContain('[Referenced');
    }));

  it('should persist user message with attachment metadata', () =>
    skipIfNoDb(async () => {
      const userId = getTestUserId();
      const mockedStreamText = streamText as ReturnType<typeof vi.fn>;
      mockStreamText(mockedStreamText, 'Got it.');

      const project = await prisma.project.create({
        data: { userId, title: 'Meta Test', deliverable: 'test' },
      });
      const task = await prisma.task.create({
        data: { projectId: project.id, userId, title: 'Meta task', priority: 'P2', status: 'TODO' },
      });

      const result = await chatService.handleMessage(
        userId,
        'Check this task',
        undefined,
        [{ type: 'task', id: task.id, title: 'Meta task' }]
      );

      expect(result.success).toBe(true);

      // Verify the persisted user message has attachment metadata
      const userMsg = await prisma.chatMessage.findFirst({
        where: { id: result.data!.userMessageId },
      });
      expect(userMsg).not.toBeNull();
      const metadata = userMsg!.metadata as Record<string, unknown>;
      expect(metadata).toHaveProperty('attachments');
      const attachments = metadata.attachments as Array<{ type: string; id: string }>;
      expect(attachments).toHaveLength(1);
      expect(attachments[0].type).toBe('task');
      expect(attachments[0].id).toBe(task.id);
    }));
});
