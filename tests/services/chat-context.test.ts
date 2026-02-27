/**
 * F6.3 Tests: Chat Context Service
 *
 * - buildSystemPrompt returns static template + dynamic data
 * - buildLLMMessages: sliding window N=20, skip system, append new message
 * - Token trimming logic
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupChatTestUser,
  cleanupChatTestUser,
  getTestUserId,
  skipIfNoDb,
  prisma,
} from '../helpers/chat-test-setup';
import { chatContextService, CONTEXT_WINDOW, estimateTokens, SYSTEM_PROMPT_TEMPLATE } from '@/services/chat-context.service';

beforeAll(() => setupChatTestUser());
afterAll(() => cleanupChatTestUser());

// Helper: create a conversation for the test user
async function createTestConversation() {
  return prisma.conversation.create({
    data: {
      userId: getTestUserId(),
      type: 'DEFAULT',
      status: 'ACTIVE',
      title: 'Test Conversation',
    },
  });
}

// Helper: seed N messages alternating user/assistant, with optional system messages
async function seedMessages(
  conversationId: string,
  count: number,
  opts?: { includeSystem?: boolean }
) {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    let role: string;
    if (opts?.includeSystem && i % 5 === 0) {
      role = 'system';
    } else {
      role = i % 2 === 0 ? 'user' : 'assistant';
    }
    const msg = await prisma.chatMessage.create({
      data: {
        conversationId,
        role,
        content: `Message ${i}: ${role === 'system' ? '--- date separator ---' : `Hello from ${role}`}`,
      },
    });
    ids.push(msg.id);
  }
  return ids;
}

// Cleanup messages between tests
async function cleanupConversations() {
  const userId = getTestUserId();
  if (!userId) return;
  await prisma.chatMessage.deleteMany({ where: { conversation: { userId } } });
  await prisma.conversation.deleteMany({ where: { userId } });
}

describe('chatContextService', () => {
  beforeEach(() => skipIfNoDb(() => cleanupConversations()));

  // ===== F6.1: buildSystemPrompt =====

  describe('buildSystemPrompt', () => {
    it('returns static template content', () =>
      skipIfNoDb(async () => {
        const result = await chatContextService.buildSystemPrompt(getTestUserId());
        expect(result.success).toBe(true);
        expect(result.data).toContain('VibeFlow AI 助手');
        expect(result.data).toContain('行为准则');
      }));

    it('contains dynamic context section', () =>
      skipIfNoDb(async () => {
        const result = await chatContextService.buildSystemPrompt(getTestUserId());
        expect(result.success).toBe(true);
        // Dynamic context from contextProviderService (system state, progress etc.)
        expect(result.data).toContain('当前上下文');
        expect(result.data).toContain('Current State');
      }));

    it('contains today progress data', () =>
      skipIfNoDb(async () => {
        const result = await chatContextService.buildSystemPrompt(getTestUserId());
        expect(result.success).toBe(true);
        expect(result.data).toContain("Today's Progress");
        expect(result.data).toContain('Pomodoros');
      }));
  });

  // ===== F6.2: buildLLMMessages =====

  describe('buildLLMMessages', () => {
    it('fetches only the most recent 20 messages', () =>
      skipIfNoDb(async () => {
        const conv = await createTestConversation();
        await seedMessages(conv.id, 30);

        const result = await chatContextService.buildLLMMessages(
          getTestUserId(),
          conv.id,
          'New message'
        );

        expect(result.success).toBe(true);
        // 20 from DB + 1 new = at most 21
        expect(result.data!.length).toBeLessThanOrEqual(21);
      }));

    it('skips role=system messages', () =>
      skipIfNoDb(async () => {
        const conv = await createTestConversation();
        await seedMessages(conv.id, 10, { includeSystem: true });

        const result = await chatContextService.buildLLMMessages(
          getTestUserId(),
          conv.id,
          'New message'
        );

        expect(result.success).toBe(true);
        const systemMsgs = result.data!.filter((m) => m.role === 'system');
        expect(systemMsgs.length).toBe(0);
      }));

    it('appends new message at the end', () =>
      skipIfNoDb(async () => {
        const conv = await createTestConversation();
        await seedMessages(conv.id, 3);

        const result = await chatContextService.buildLLMMessages(
          getTestUserId(),
          conv.id,
          'I am the new message'
        );

        expect(result.success).toBe(true);
        const last = result.data![result.data!.length - 1];
        expect(last.role).toBe('user');
        expect(last.content).toBe('I am the new message');
      }));

    it('returns NOT_FOUND for wrong userId', () =>
      skipIfNoDb(async () => {
        const conv = await createTestConversation();

        const result = await chatContextService.buildLLMMessages(
          'nonexistent-user-id',
          conv.id,
          'Hello'
        );

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('NOT_FOUND');
      }));

    it('works with empty conversation (0 history messages)', () =>
      skipIfNoDb(async () => {
        const conv = await createTestConversation();

        const result = await chatContextService.buildLLMMessages(
          getTestUserId(),
          conv.id,
          'First message ever'
        );

        expect(result.success).toBe(true);
        expect(result.data!.length).toBe(1);
        expect(result.data![0].content).toBe('First message ever');
      }));
  });

  // ===== Token trimming =====

  describe('trimToTokenBudget', () => {
    it('does not trim when within budget', () => {
      const messages = [
        { role: 'user' as const, content: 'Short message' },
        { role: 'assistant' as const, content: 'Short reply' },
        { role: 'user' as const, content: 'New' },
      ];

      const result = chatContextService.trimToTokenBudget(messages, 10000);
      expect(result.length).toBe(3);
    });

    it('removes oldest messages first when over budget', () => {
      const longContent = 'x'.repeat(4000); // ~1000 tokens
      const messages = [
        { role: 'user' as const, content: longContent },
        { role: 'assistant' as const, content: longContent },
        { role: 'user' as const, content: longContent },
        { role: 'assistant' as const, content: longContent },
        { role: 'user' as const, content: 'New message' },
      ];

      // Budget of 2100 tokens: can fit ~2 long messages + the short new message
      const result = chatContextService.trimToTokenBudget(messages, 2100);

      // Should have removed at least the first 2 messages
      expect(result.length).toBeLessThan(5);
      // Last message (new user message) is always preserved
      expect(result[result.length - 1].content).toBe('New message');
    });

    it('always preserves the last message even if it exceeds budget', () => {
      const messages = [
        { role: 'user' as const, content: 'x'.repeat(40000) }, // ~10000 tokens
      ];

      const result = chatContextService.trimToTokenBudget(messages, 100);
      expect(result.length).toBe(1);
      expect(result[0].content).toBe(messages[0].content);
    });

    it('returns empty array for empty input', () => {
      const result = chatContextService.trimToTokenBudget([], 1000);
      expect(result.length).toBe(0);
    });
  });

  // ===== estimateTokens =====

  describe('estimateTokens', () => {
    it('estimates based on character count', () => {
      expect(estimateTokens('hello')).toBe(2); // ceil(5/4)
      expect(estimateTokens('')).toBe(0);
      expect(estimateTokens('a'.repeat(100))).toBe(25);
    });
  });
});
