/**
 * F7.3 Tests: Chat Observability Service
 *
 * - trackUsage: writes LLMUsageLog with correct fields
 * - trackUsage: contextUsagePercent = promptTokens / contextWindow * 100
 * - getConversationStats: totalTokens = sum of all logs
 * - getConversationStats: querying another user's conversation returns error
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupChatTestUser,
  cleanupChatTestUser,
  getTestUserId,
  skipIfNoDb,
  prisma,
} from '../helpers/chat-test-setup';
import { chatObservabilityService } from '@/services/chat-observability.service';

beforeAll(() => setupChatTestUser());
afterAll(() => cleanupChatTestUser());

// Helper: create a conversation for the test user
async function createTestConversation(userId?: string) {
  return prisma.conversation.create({
    data: {
      userId: userId ?? getTestUserId(),
      type: 'DEFAULT',
      status: 'ACTIVE',
      title: 'Observability Test Conversation',
    },
  });
}

// Helper: create a second test user for ownership tests
async function createOtherUser() {
  const email = `chat-obs-other-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.vibeflow.local`;
  return prisma.user.create({ data: { email, password: 'test_hash' } });
}

// Cleanup between tests
async function cleanupLogs() {
  await prisma.lLMUsageLog.deleteMany({ where: { userId: getTestUserId() } });
  await prisma.chatMessage.deleteMany({ where: { conversation: { userId: getTestUserId() } } });
  await prisma.conversation.deleteMany({ where: { userId: getTestUserId() } });
}

describe('chatObservabilityService', () => {
  beforeEach(() => skipIfNoDb(() => cleanupLogs()));

  describe('trackUsage (F7.1)', () => {
    it('writes LLMUsageLog record with correct fields', () =>
      skipIfNoDb(async () => {
        const conv = await createTestConversation();

        const result = await chatObservabilityService.trackUsage({
          userId: getTestUserId(),
          conversationId: conv.id,
          messageId: null,
          scene: 'chat:default',
          modelId: 'qwen-plus',
          usage: { promptTokens: 500, completionTokens: 200 },
        });

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();

        const log = await prisma.lLMUsageLog.findUnique({ where: { id: result.data!.id } });
        expect(log).not.toBeNull();
        expect(log!.userId).toBe(getTestUserId());
        expect(log!.conversationId).toBe(conv.id);
        expect(log!.scene).toBe('chat:default');
        expect(log!.model).toBe('qwen-plus');
        expect(log!.inputTokens).toBe(500);
        expect(log!.outputTokens).toBe(200);
        expect(log!.totalTokens).toBe(700);
        expect(log!.contextLength).toBe(500);
        expect(log!.maxContextLimit).toBe(131072); // qwen-plus contextWindow
      }));

    it('contextUsagePercent = promptTokens / contextWindow * 100', () =>
      skipIfNoDb(async () => {
        const conv = await createTestConversation();

        const result = await chatObservabilityService.trackUsage({
          userId: getTestUserId(),
          conversationId: conv.id,
          messageId: null,
          scene: 'chat:default',
          modelId: 'kimi-8k',
          usage: { promptTokens: 4096, completionTokens: 100 },
        });

        expect(result.success).toBe(true);

        const log = await prisma.lLMUsageLog.findUnique({ where: { id: result.data!.id } });
        // kimi-8k contextWindow = 8192
        const expected = (4096 / 8192) * 100; // 50
        expect(log!.contextUsagePercent).toBeCloseTo(expected, 2);
      }));

    it('returns error for unknown modelId', () =>
      skipIfNoDb(async () => {
        const conv = await createTestConversation();

        const result = await chatObservabilityService.trackUsage({
          userId: getTestUserId(),
          conversationId: conv.id,
          messageId: null,
          scene: 'chat:default',
          modelId: 'nonexistent-model',
          usage: { promptTokens: 100, completionTokens: 50 },
        });

        expect(result.success).toBe(false);
        expect(result.error!.code).toBe('VALIDATION_ERROR');
      }));
  });

  describe('getConversationStats (F7.2)', () => {
    it('accumulates totalTokens correctly across multiple trackUsage calls', () =>
      skipIfNoDb(async () => {
        const conv = await createTestConversation();

        // Three calls with different token counts
        await chatObservabilityService.trackUsage({
          userId: getTestUserId(),
          conversationId: conv.id,
          messageId: null,
          scene: 'chat:default',
          modelId: 'qwen-plus',
          usage: { promptTokens: 100, completionTokens: 50 },
        });
        await chatObservabilityService.trackUsage({
          userId: getTestUserId(),
          conversationId: conv.id,
          messageId: null,
          scene: 'chat:default',
          modelId: 'qwen-plus',
          usage: { promptTokens: 200, completionTokens: 80 },
        });
        await chatObservabilityService.trackUsage({
          userId: getTestUserId(),
          conversationId: conv.id,
          messageId: null,
          scene: 'chat:default',
          modelId: 'qwen-plus',
          usage: { promptTokens: 300, completionTokens: 120 },
        });

        const stats = await chatObservabilityService.getConversationStats(
          getTestUserId(),
          conv.id,
        );

        expect(stats.success).toBe(true);
        expect(stats.data!.totalInputTokens).toBe(600);
        expect(stats.data!.totalOutputTokens).toBe(250);
        expect(stats.data!.totalTokens).toBe(850);
      }));

    it('returns latestContextUsagePercent from the most recent log', () =>
      skipIfNoDb(async () => {
        const conv = await createTestConversation();

        await chatObservabilityService.trackUsage({
          userId: getTestUserId(),
          conversationId: conv.id,
          messageId: null,
          scene: 'chat:default',
          modelId: 'kimi-8k',
          usage: { promptTokens: 1000, completionTokens: 50 },
        });

        // Second call with different usage
        await chatObservabilityService.trackUsage({
          userId: getTestUserId(),
          conversationId: conv.id,
          messageId: null,
          scene: 'chat:default',
          modelId: 'kimi-8k',
          usage: { promptTokens: 4096, completionTokens: 100 },
        });

        const stats = await chatObservabilityService.getConversationStats(
          getTestUserId(),
          conv.id,
        );

        expect(stats.success).toBe(true);
        // Latest log: 4096 / 8192 * 100 = 50
        expect(stats.data!.latestContextUsagePercent).toBeCloseTo(50, 2);
      }));

    it('includes correct messageCount', () =>
      skipIfNoDb(async () => {
        const conv = await createTestConversation();

        // Seed some messages
        for (let i = 0; i < 5; i++) {
          await prisma.chatMessage.create({
            data: {
              conversationId: conv.id,
              role: i % 2 === 0 ? 'user' : 'assistant',
              content: `Message ${i}`,
            },
          });
        }

        const stats = await chatObservabilityService.getConversationStats(
          getTestUserId(),
          conv.id,
        );

        expect(stats.success).toBe(true);
        expect(stats.data!.messageCount).toBe(5);
      }));

    it('returns error when querying another user\'s conversation', () =>
      skipIfNoDb(async () => {
        // Create another user + conversation
        const otherUser = await createOtherUser();
        const otherConv = await prisma.conversation.create({
          data: {
            userId: otherUser.id,
            type: 'DEFAULT',
            status: 'ACTIVE',
            title: 'Other User Conv',
          },
        });

        try {
          const stats = await chatObservabilityService.getConversationStats(
            getTestUserId(),
            otherConv.id,
          );

          expect(stats.success).toBe(false);
          expect(stats.error!.code).toBe('NOT_FOUND');
        } finally {
          // Cleanup other user's data
          await prisma.lLMUsageLog.deleteMany({ where: { userId: otherUser.id } });
          await prisma.conversation.deleteMany({ where: { userId: otherUser.id } });
          await prisma.user.delete({ where: { id: otherUser.id } });
        }
      }));

    it('returns zeros/defaults when no usage logs exist', () =>
      skipIfNoDb(async () => {
        const conv = await createTestConversation();

        const stats = await chatObservabilityService.getConversationStats(
          getTestUserId(),
          conv.id,
        );

        expect(stats.success).toBe(true);
        expect(stats.data!.totalInputTokens).toBe(0);
        expect(stats.data!.totalOutputTokens).toBe(0);
        expect(stats.data!.totalTokens).toBe(0);
        expect(stats.data!.latestContextUsagePercent).toBe(0);
        expect(stats.data!.messageCount).toBe(0);
      }));
  });
});
