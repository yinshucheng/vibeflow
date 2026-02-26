/**
 * Property tests for Chat data models (Prisma schema).
 *
 * Uses fast-check to verify Conversation / ChatMessage round-trip
 * through Prisma write/read. Requires a running database.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fc from 'fast-check';
import { PrismaClient, ConversationType, ConversationStatus } from '@prisma/client';

const prisma = new PrismaClient();
let testUserId: string;
let dbAvailable = false;

beforeAll(async () => {
  try {
    await prisma.$connect();
    dbAvailable = true;
  } catch {
    dbAvailable = false;
    return;
  }

  const email = `chat-schema-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.vibeflow.local`;
  const user = await prisma.user.create({
    data: { email, password: 'test_hash' },
  });
  testUserId = user.id;
});

afterAll(async () => {
  if (!dbAvailable) return;
  // Cleanup in dependency order
  await prisma.lLMUsageLog.deleteMany({ where: { userId: testUserId } });
  await prisma.chatMessage.deleteMany({ where: { conversation: { userId: testUserId } } });
  await prisma.conversation.deleteMany({ where: { userId: testUserId } });
  await prisma.user.delete({ where: { id: testUserId } });
  await prisma.$disconnect();
});

function skipIfNoDb() {
  if (!dbAvailable) {
    return true;
  }
  return false;
}

describe('Chat Message Schema Properties', () => {
  it('Conversation round-trip: write and read back yields consistent data', async () => {
    if (skipIfNoDb()) return;

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<ConversationType>('DEFAULT', 'DAILY', 'TOPIC'),
        fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
        async (type, title) => {
          const conv = await prisma.conversation.create({
            data: {
              userId: testUserId,
              type,
              title: title ?? undefined,
            },
          });

          const read = await prisma.conversation.findUniqueOrThrow({
            where: { id: conv.id },
          });

          expect(read.userId).toBe(testUserId);
          expect(read.type).toBe(type);
          expect(read.status).toBe('ACTIVE');
          if (title) {
            expect(read.title).toBe(title);
          }

          // Cleanup this conversation
          await prisma.conversation.delete({ where: { id: conv.id } });
        }
      ),
      { numRuns: 9 } // 3 types × 3 variations
    );
  });

  it('ChatMessage round-trip: write and read back yields consistent data', async () => {
    if (skipIfNoDb()) return;

    // Create a conversation to hold messages
    const conv = await prisma.conversation.create({
      data: { userId: testUserId, type: 'DEFAULT' },
    });

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('user', 'assistant', 'tool_call', 'tool_result', 'system'),
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.option(fc.integer({ min: 0, max: 10000 }), { nil: undefined }),
        async (role, content, tokenCount) => {
          const msg = await prisma.chatMessage.create({
            data: {
              conversationId: conv.id,
              role,
              content,
              tokenCount: tokenCount ?? undefined,
            },
          });

          const read = await prisma.chatMessage.findUniqueOrThrow({
            where: { id: msg.id },
          });

          expect(read.conversationId).toBe(conv.id);
          expect(read.role).toBe(role);
          expect(read.content).toBe(content);
          if (tokenCount !== undefined) {
            expect(read.tokenCount).toBe(tokenCount);
          }

          await prisma.chatMessage.delete({ where: { id: msg.id } });
        }
      ),
      { numRuns: 15 }
    );

    await prisma.conversation.delete({ where: { id: conv.id } });
  });

  it('ChatMessage with JSON metadata round-trips correctly', async () => {
    if (skipIfNoDb()) return;

    const conv = await prisma.conversation.create({
      data: { userId: testUserId, type: 'DEFAULT' },
    });

    const metadata = {
      toolCallId: 'tc-123',
      toolName: 'flow_complete_task',
      parameters: { taskId: 'task-abc' },
      isProactive: false,
    };

    const msg = await prisma.chatMessage.create({
      data: {
        conversationId: conv.id,
        role: 'tool_call',
        content: 'Completing task...',
        metadata,
      },
    });

    const read = await prisma.chatMessage.findUniqueOrThrow({
      where: { id: msg.id },
    });

    expect(read.metadata).toEqual(metadata);

    await prisma.chatMessage.delete({ where: { id: msg.id } });
    await prisma.conversation.delete({ where: { id: conv.id } });
  });

  it('ConversationType enum covers DEFAULT, DAILY, TOPIC', async () => {
    if (skipIfNoDb()) return;

    for (const type of ['DEFAULT', 'DAILY', 'TOPIC'] as ConversationType[]) {
      const conv = await prisma.conversation.create({
        data: { userId: testUserId, type },
      });
      expect(conv.type).toBe(type);
      await prisma.conversation.delete({ where: { id: conv.id } });
    }
  });

  it('ConversationStatus enum covers ACTIVE, ARCHIVED, DELETED', async () => {
    if (skipIfNoDb()) return;

    for (const status of ['ACTIVE', 'ARCHIVED', 'DELETED'] as ConversationStatus[]) {
      const conv = await prisma.conversation.create({
        data: { userId: testUserId, type: 'DEFAULT', status },
      });
      expect(conv.status).toBe(status);
      await prisma.conversation.delete({ where: { id: conv.id } });
    }
  });

  it('Cascade delete: deleting conversation removes its messages', async () => {
    if (skipIfNoDb()) return;

    const conv = await prisma.conversation.create({
      data: { userId: testUserId, type: 'DEFAULT' },
    });

    await prisma.chatMessage.createMany({
      data: [
        { conversationId: conv.id, role: 'user', content: 'hello' },
        { conversationId: conv.id, role: 'assistant', content: 'hi' },
      ],
    });

    const beforeCount = await prisma.chatMessage.count({
      where: { conversationId: conv.id },
    });
    expect(beforeCount).toBe(2);

    await prisma.conversation.delete({ where: { id: conv.id } });

    const afterCount = await prisma.chatMessage.count({
      where: { conversationId: conv.id },
    });
    expect(afterCount).toBe(0);
  });

  it('LLMUsageLog round-trip: write and read back yields consistent data', async () => {
    if (skipIfNoDb()) return;

    const conv = await prisma.conversation.create({
      data: { userId: testUserId, type: 'DEFAULT' },
    });

    const log = await prisma.lLMUsageLog.create({
      data: {
        userId: testUserId,
        conversationId: conv.id,
        messageId: 'msg-123',
        scene: 'chat:default',
        model: 'qwen-plus',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        contextLength: 2000,
        maxContextLimit: 131072,
        contextUsagePercent: 1.53,
      },
    });

    const read = await prisma.lLMUsageLog.findUniqueOrThrow({
      where: { id: log.id },
    });

    expect(read.userId).toBe(testUserId);
    expect(read.conversationId).toBe(conv.id);
    expect(read.scene).toBe('chat:default');
    expect(read.model).toBe('qwen-plus');
    expect(read.inputTokens).toBe(100);
    expect(read.outputTokens).toBe(50);
    expect(read.totalTokens).toBe(150);
    expect(read.contextUsagePercent).toBeCloseTo(1.53);

    await prisma.lLMUsageLog.delete({ where: { id: log.id } });
    await prisma.conversation.delete({ where: { id: conv.id } });
  });
});
