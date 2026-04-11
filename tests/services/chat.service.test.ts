/**
 * F3.4 Chat Service tests
 *
 * Tests for getOrCreateDefaultConversation, persistMessage, getHistory, handleMessage.
 * Uses real DB via chat-test-setup.ts helper + LLM mock via llm-mock.ts.
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
    tool: vi.fn((opts: Record<string, unknown>) => opts),
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

  // Clean up chat data between tests (keep user)
  if (getTestUserId()) {
    try {
      await prisma.lLMUsageLog.deleteMany({ where: { userId: getTestUserId() } });
      await prisma.chatMessage.deleteMany({ where: { conversation: { userId: getTestUserId() } } });
      await prisma.conversation.deleteMany({ where: { userId: getTestUserId() } });
    } catch {
      // ignore cleanup errors
    }
  }
});

describe('chatService.getOrCreateDefaultConversation', () => {
  it('should create a DEFAULT conversation on first call', () =>
    skipIfNoDb(async () => {
      const result = await chatService.getOrCreateDefaultConversation(getTestUserId());

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.userId).toBe(getTestUserId());
      expect(result.data!.type).toBe('DEFAULT');
      expect(result.data!.status).toBe('ACTIVE');
    }));

  it('should return the same conversation on repeated calls', () =>
    skipIfNoDb(async () => {
      const first = await chatService.getOrCreateDefaultConversation(getTestUserId());
      const second = await chatService.getOrCreateDefaultConversation(getTestUserId());

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      expect(first.data!.id).toBe(second.data!.id);
    }));

  it('should return different conversations for different userIds', () =>
    skipIfNoDb(async () => {
      // Create a second test user
      const email2 = `chat-test-other-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.vibeflow.local`;
      const user2 = await prisma.user.create({ data: { email: email2, password: 'test_hash' } });

      try {
        const conv1 = await chatService.getOrCreateDefaultConversation(getTestUserId());
        const conv2 = await chatService.getOrCreateDefaultConversation(user2.id);

        expect(conv1.data!.id).not.toBe(conv2.data!.id);
        expect(conv1.data!.userId).toBe(getTestUserId());
        expect(conv2.data!.userId).toBe(user2.id);
      } finally {
        // Cleanup second user
        await prisma.conversation.deleteMany({ where: { userId: user2.id } });
        await prisma.user.delete({ where: { id: user2.id } });
      }
    }));
});

describe('chatService.persistMessage', () => {
  it('should write a message and read it back via getHistory', () =>
    skipIfNoDb(async () => {
      const convResult = await chatService.getOrCreateDefaultConversation(getTestUserId());
      const conversationId = convResult.data!.id;

      const msgResult = await chatService.persistMessage(conversationId, 'user', 'Hello!');
      expect(msgResult.success).toBe(true);
      expect(msgResult.data!.role).toBe('user');
      expect(msgResult.data!.content).toBe('Hello!');

      const history = await chatService.getHistory(getTestUserId(), conversationId);
      expect(history.success).toBe(true);
      expect(history.data!.length).toBe(1);
      expect(history.data![0].content).toBe('Hello!');
    }));

  it('should persist metadata correctly', () =>
    skipIfNoDb(async () => {
      const convResult = await chatService.getOrCreateDefaultConversation(getTestUserId());
      const conversationId = convResult.data!.id;

      const metadata = { toolName: 'flow_complete_task', isProactive: false };
      const msgResult = await chatService.persistMessage(conversationId, 'tool_call', 'Completing task', metadata);

      expect(msgResult.success).toBe(true);
      expect(msgResult.data!.metadata).toEqual(metadata);
    }));
});

describe('chatService.getHistory', () => {
  it('should return messages in chronological order', () =>
    skipIfNoDb(async () => {
      const convResult = await chatService.getOrCreateDefaultConversation(getTestUserId());
      const conversationId = convResult.data!.id;

      await chatService.persistMessage(conversationId, 'user', 'first');
      await chatService.persistMessage(conversationId, 'assistant', 'second');
      await chatService.persistMessage(conversationId, 'user', 'third');

      const history = await chatService.getHistory(getTestUserId(), conversationId);
      expect(history.success).toBe(true);
      expect(history.data!.length).toBe(3);
      expect(history.data![0].content).toBe('first');
      expect(history.data![1].content).toBe('second');
      expect(history.data![2].content).toBe('third');
    }));

  it('should respect limit parameter', () =>
    skipIfNoDb(async () => {
      const convResult = await chatService.getOrCreateDefaultConversation(getTestUserId());
      const conversationId = convResult.data!.id;

      for (let i = 0; i < 5; i++) {
        await chatService.persistMessage(conversationId, 'user', `msg-${i}`);
      }

      const history = await chatService.getHistory(getTestUserId(), conversationId, 3);
      expect(history.success).toBe(true);
      expect(history.data!.length).toBe(3);
    }));

  it('should return NOT_FOUND when querying another user\'s conversation', () =>
    skipIfNoDb(async () => {
      const convResult = await chatService.getOrCreateDefaultConversation(getTestUserId());
      const conversationId = convResult.data!.id;

      // Try to access with a fake userId
      const result = await chatService.getHistory('nonexistent-user-id', conversationId);
      expect(result.success).toBe(false);
      expect(result.error!.code).toBe('NOT_FOUND');
    }));
});

describe('chatService.handleMessage', () => {
  it('should persist both user message and AI reply (mock LLM)', () =>
    skipIfNoDb(async () => {
      mockStreamText(vi.mocked(streamText), 'Hello! I am your AI assistant.');

      const result = await chatService.handleMessage(getTestUserId(), 'Hi there');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.fullText).toBe('Hello! I am your AI assistant.');

      // Verify both messages persisted
      const history = await chatService.getHistory(
        getTestUserId(),
        result.data!.conversationId
      );
      expect(history.success).toBe(true);
      expect(history.data!.length).toBe(2);
      expect(history.data![0].role).toBe('user');
      expect(history.data![0].content).toBe('Hi there');
      expect(history.data![1].role).toBe('assistant');
      expect(history.data![1].content).toBe('Hello! I am your AI assistant.');
    }));

  it('should invoke onDelta callback with streaming chunks', () =>
    skipIfNoDb(async () => {
      mockStreamText(vi.mocked(streamText), 'ABC');

      const deltas: string[] = [];
      await chatService.handleMessage(getTestUserId(), 'test', (delta) => {
        deltas.push(delta);
      });

      // mockStreamText splits by character: 'A', 'B', 'C'
      expect(deltas.length).toBeGreaterThan(0);
      expect(deltas.join('')).toBe('ABC');
    }));

  it('should record token usage in LLMUsageLog', () =>
    skipIfNoDb(async () => {
      mockStreamText(vi.mocked(streamText), 'Response', {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });

      const result = await chatService.handleMessage(getTestUserId(), 'test');
      expect(result.success).toBe(true);

      // Check LLMUsageLog was created
      const logs = await prisma.lLMUsageLog.findMany({
        where: { userId: getTestUserId() },
      });
      expect(logs.length).toBe(1);
      expect(logs[0].inputTokens).toBe(100);
      expect(logs[0].outputTokens).toBe(50);
      expect(logs[0].totalTokens).toBe(150);
    }));

  it('should create conversation automatically if none exists', () =>
    skipIfNoDb(async () => {
      mockStreamText(vi.mocked(streamText), 'Hi');

      const result = await chatService.handleMessage(getTestUserId(), 'Hello');
      expect(result.success).toBe(true);

      // Verify a conversation was created
      const convs = await prisma.conversation.findMany({
        where: { userId: getTestUserId(), type: 'DEFAULT', status: 'ACTIVE' },
      });
      expect(convs.length).toBe(1);
    }));

  it('should exclude empty-content history messages from LLM call', () =>
    skipIfNoDb(async () => {
      // Setup: create a conversation with an empty assistant message (simulates failed LLM call residue)
      const convResult = await chatService.getOrCreateDefaultConversation(getTestUserId());
      expect(convResult.success).toBe(true);
      const convId = convResult.data!.id;

      // Insert normal user message + empty assistant message (as if prior LLM call failed mid-stream)
      await prisma.chatMessage.createMany({
        data: [
          { conversationId: convId, role: 'user', content: 'first question' },
          { conversationId: convId, role: 'assistant', content: '' },  // empty — should be filtered
        ],
      });

      // Capture messages passed to streamText
      let capturedMessages: Array<{ role: string; content: string }> = [];
      vi.mocked(streamText).mockImplementation((opts: Record<string, unknown>) => {
        capturedMessages = (opts.messages as Array<{ role: string; content: string }>) ?? [];
        if (typeof opts.onFinish === 'function') {
          (opts.onFinish as (r: { text: string; usage: { inputTokens: number; outputTokens: number; totalTokens: number } }) => void)({
            text: 'response',
            usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 },
          });
        }
        // Return minimal mock stream
        return {
          textStream: (async function* () { yield 'response'; })(),
          fullStream: (async function* () { yield { type: 'finish' as const }; })(),
          text: Promise.resolve('response'),
          usage: Promise.resolve({ inputTokens: 10, outputTokens: 8, totalTokens: 18 }),
          toolCalls: Promise.resolve([]),
          toolResults: Promise.resolve([]),
          finishReason: Promise.resolve('stop' as const),
          warnings: Promise.resolve([]),
        };
      });

      const result = await chatService.handleMessage(getTestUserId(), 'second question');
      expect(result.success).toBe(true);

      // Verify: the empty assistant message should NOT appear in captured messages
      const assistantMessages = capturedMessages.filter(m => m.role === 'assistant');
      for (const msg of assistantMessages) {
        expect(msg.content).toBeTruthy();  // no empty content
      }

      // The user's first question should still be in history
      const userMessages = capturedMessages.filter(m => m.role === 'user');
      expect(userMessages.some(m => m.content.includes('first question'))).toBe(true);
      expect(userMessages.some(m => m.content.includes('second question'))).toBe(true);
    }));
});
