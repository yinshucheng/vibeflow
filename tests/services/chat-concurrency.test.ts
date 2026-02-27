/**
 * F3.4 Chat Concurrency tests
 *
 * Verifies that conversationLocks prevent concurrent LLM calls on the same
 * conversation while allowing parallel calls on different conversations.
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
import { chatService, conversationLocks } from '../../src/services/chat.service';

beforeAll(() => setupChatTestUser());
afterAll(() => cleanupChatTestUser());

beforeEach(async () => {
  vi.clearAllMocks();
  conversationLocks.clear();

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

/**
 * Helper: create a mock streamText that takes a controlled amount of time.
 * Records the order of execution start/end for concurrency assertions.
 */
function createDelayedMockStreamText(
  delayMs: number,
  response: string,
  executionLog: string[]
) {
  let callCounter = 0;

  return (opts: Record<string, unknown>) => {
    const callId = `call-${callCounter++}`;
    executionLog.push(`${callId}:start`);

    if (typeof opts.onFinish === 'function') {
      // Delay the onFinish to simulate async LLM processing
      setTimeout(() => {
        (opts.onFinish as (result: { text: string; usage: { inputTokens: number; outputTokens: number; totalTokens: number } }) => void)({
          text: response,
          usage: { inputTokens: 10, outputTokens: response.length, totalTokens: 10 + response.length },
        });
      }, delayMs * 0.8);
    }

    // Return a stream that delays
    const currentCallId = callId;
    async function* textStreamGenerator() {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      executionLog.push(`${currentCallId}:end`);
      yield response;
    }

    return {
      textStream: textStreamGenerator(),
      text: new Promise<string>((resolve) =>
        setTimeout(() => resolve(response), delayMs)
      ),
      usage: Promise.resolve({
        inputTokens: 10,
        outputTokens: response.length,
        totalTokens: 10 + response.length,
      }),
      toolCalls: Promise.resolve([]),
      toolResults: Promise.resolve([]),
      finishReason: Promise.resolve('stop'),
      warnings: Promise.resolve([]),
    };
  };
}

describe('chatService concurrency (F3.3)', () => {
  it('same conversationId: concurrent handleMessage calls are serialized', () =>
    skipIfNoDb(async () => {
      const executionLog: string[] = [];
      const delay = 100; // ms

      vi.mocked(streamText).mockImplementation(
        createDelayedMockStreamText(delay, 'response', executionLog) as unknown as typeof streamText
      );

      // Pre-create conversation so both calls use the same one
      await chatService.getOrCreateDefaultConversation(getTestUserId());

      // Fire two concurrent handleMessage calls
      const [result1, result2] = await Promise.all([
        chatService.handleMessage(getTestUserId(), 'message-1'),
        chatService.handleMessage(getTestUserId(), 'message-2'),
      ]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // Verify serialization: call-0 should end before call-1 starts
      expect(executionLog.length).toBe(4);
      expect(executionLog[0]).toBe('call-0:start');
      expect(executionLog[1]).toBe('call-0:end');
      expect(executionLog[2]).toBe('call-1:start');
      expect(executionLog[3]).toBe('call-1:end');
    }));

  it('different conversationIds: concurrent handleMessage calls run in parallel', () =>
    skipIfNoDb(async () => {
      // Create a second user for a different conversation
      const email2 = `chat-concur-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.vibeflow.local`;
      const user2 = await prisma.user.create({ data: { email: email2, password: 'test_hash' } });

      try {
        const executionLog: string[] = [];
        const delay = 100;

        vi.mocked(streamText).mockImplementation(
          createDelayedMockStreamText(delay, 'response', executionLog) as unknown as typeof streamText
        );

        // Fire concurrent handleMessage calls for different users (different conversations)
        const [result1, result2] = await Promise.all([
          chatService.handleMessage(getTestUserId(), 'message-from-user1'),
          chatService.handleMessage(user2.id, 'message-from-user2'),
        ]);

        expect(result1.success).toBe(true);
        expect(result2.success).toBe(true);

        // Both should start before either ends (parallel execution)
        const startIndices = executionLog
          .map((entry, i) => entry.endsWith(':start') ? i : -1)
          .filter((i) => i >= 0);
        const endIndices = executionLog
          .map((entry, i) => entry.endsWith(':end') ? i : -1)
          .filter((i) => i >= 0);

        // Both starts should happen before the first end
        expect(startIndices.length).toBe(2);
        expect(endIndices.length).toBe(2);
        expect(Math.max(...startIndices)).toBeLessThan(Math.max(...endIndices));
      } finally {
        await prisma.lLMUsageLog.deleteMany({ where: { userId: user2.id } });
        await prisma.chatMessage.deleteMany({ where: { conversation: { userId: user2.id } } });
        await prisma.conversation.deleteMany({ where: { userId: user2.id } });
        await prisma.user.delete({ where: { id: user2.id } });
      }
    }));

  it('lock is released even if LLM call throws an error', () =>
    skipIfNoDb(async () => {
      // First call: streamText throws an error
      vi.mocked(streamText).mockImplementationOnce((() => {
        throw new Error('LLM API Error');
      }) as unknown as typeof streamText);

      // First call should fail but release lock
      const result1 = await chatService.handleMessage(getTestUserId(), 'will-fail');
      expect(result1.success).toBe(false);
      expect(result1.error?.message).toContain('LLM API Error');

      // Verify lock is released
      expect(conversationLocks.size).toBe(0);

      // Second call should succeed (lock was released)
      vi.mocked(streamText).mockImplementation(((opts: Record<string, unknown>) => {
        if (typeof opts.onFinish === 'function') {
          (opts.onFinish as (r: { text: string; usage: { inputTokens: number; outputTokens: number; totalTokens: number } }) => void)({
            text: 'ok',
            usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
          });
        }
        return {
          textStream: (async function* () { yield 'ok'; })(),
          text: Promise.resolve('ok'),
          usage: Promise.resolve({ inputTokens: 5, outputTokens: 2, totalTokens: 7 }),
          toolCalls: Promise.resolve([]),
          toolResults: Promise.resolve([]),
          finishReason: Promise.resolve('stop'),
          warnings: Promise.resolve([]),
        };
      }) as unknown as typeof streamText);

      const result2 = await chatService.handleMessage(getTestUserId(), 'should-work');
      expect(result2.success).toBe(true);
    }));
});
