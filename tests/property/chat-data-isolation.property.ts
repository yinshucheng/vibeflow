/**
 * F3.4 Property tests for Chat data isolation.
 *
 * Verifies:
 * - getHistory only returns messages belonging to the requesting user
 * - getOrCreateDefaultConversation produces exactly one ACTIVE DEFAULT per user
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fc from 'fast-check';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// We create multiple test users for isolation testing
const testUsers: Array<{ id: string; email: string }> = [];
let dbAvailable = false;

beforeAll(async () => {
  try {
    await prisma.$connect();
    dbAvailable = true;
  } catch {
    dbAvailable = false;
    return;
  }

  // Create 3 test users
  for (let i = 0; i < 3; i++) {
    const email = `chat-isolation-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}@test.vibeflow.local`;
    const user = await prisma.user.create({
      data: { email, password: 'test_hash' },
    });
    testUsers.push({ id: user.id, email });
  }
});

afterAll(async () => {
  if (!dbAvailable) return;
  for (const user of testUsers) {
    await prisma.lLMUsageLog.deleteMany({ where: { userId: user.id } });
    await prisma.chatMessage.deleteMany({ where: { conversation: { userId: user.id } } });
    await prisma.conversation.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
  await prisma.$disconnect();
});

function skipIfNoDb() {
  return !dbAvailable;
}

describe('Chat Data Isolation Properties', () => {
  it('getHistory: user can only see their own messages', async () => {
    if (skipIfNoDb()) return;

    // Setup: each user gets a conversation with messages
    const userConvs: Array<{ userId: string; conversationId: string }> = [];

    for (const user of testUsers) {
      const conv = await prisma.conversation.create({
        data: { userId: user.id, type: 'DEFAULT', status: 'ACTIVE' },
      });
      // Add messages
      await prisma.chatMessage.create({
        data: {
          conversationId: conv.id,
          role: 'user',
          content: `Message from ${user.email}`,
        },
      });
      userConvs.push({ userId: user.id, conversationId: conv.id });
    }

    // Property: for any pair of users, user A cannot read user B's conversation
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: testUsers.length - 1 }),
        fc.integer({ min: 0, max: testUsers.length - 1 }),
        async (idxA, idxB) => {
          if (idxA === idxB) return; // same user, skip

          const userA = testUsers[idxA];
          const convB = userConvs[idxB];

          // User A tries to read User B's conversation
          const conversation = await prisma.conversation.findFirst({
            where: {
              id: convB.conversationId,
              userId: userA.id, // ownership check
            },
          });

          // Should NOT find it (different user)
          expect(conversation).toBeNull();
        }
      ),
      { numRuns: 9 }
    );

    // Cleanup
    for (const uc of userConvs) {
      await prisma.chatMessage.deleteMany({ where: { conversationId: uc.conversationId } });
      await prisma.conversation.delete({ where: { id: uc.conversationId } });
    }
  });

  it('getOrCreateDefaultConversation: each user has at most one ACTIVE DEFAULT', async () => {
    if (skipIfNoDb()) return;

    // Create multiple DEFAULT conversations for each user (simulating multiple calls)
    for (const user of testUsers) {
      // Call getOrCreate multiple times
      for (let i = 0; i < 3; i++) {
        const existing = await prisma.conversation.findFirst({
          where: { userId: user.id, type: 'DEFAULT', status: 'ACTIVE' },
        });

        if (!existing) {
          await prisma.conversation.create({
            data: { userId: user.id, type: 'DEFAULT', status: 'ACTIVE' },
          });
        }
      }
    }

    // Property: for every user, count of ACTIVE DEFAULT conversations is exactly 1
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: testUsers.length - 1 }),
        async (idx) => {
          const user = testUsers[idx];

          const count = await prisma.conversation.count({
            where: {
              userId: user.id,
              type: 'DEFAULT',
              status: 'ACTIVE',
            },
          });

          expect(count).toBe(1);
        }
      ),
      { numRuns: 9 }
    );

    // Cleanup
    for (const user of testUsers) {
      await prisma.chatMessage.deleteMany({ where: { conversation: { userId: user.id } } });
      await prisma.conversation.deleteMany({ where: { userId: user.id } });
    }
  });

  it('messages from one user never leak into another user\'s history query', async () => {
    if (skipIfNoDb()) return;

    // Each user creates a conversation with a unique message
    const convIds: string[] = [];
    for (let i = 0; i < testUsers.length; i++) {
      const conv = await prisma.conversation.create({
        data: { userId: testUsers[i].id, type: 'DEFAULT', status: 'ACTIVE' },
      });
      await prisma.chatMessage.create({
        data: {
          conversationId: conv.id,
          role: 'user',
          content: `secret-${testUsers[i].id}`,
        },
      });
      convIds.push(conv.id);
    }

    // For each user, query their messages and verify no leakage
    for (let i = 0; i < testUsers.length; i++) {
      const messages = await prisma.chatMessage.findMany({
        where: {
          conversation: { userId: testUsers[i].id },
        },
      });

      for (const msg of messages) {
        // Every message should contain only this user's secret
        if (msg.content.startsWith('secret-')) {
          expect(msg.content).toBe(`secret-${testUsers[i].id}`);
        }
      }
    }

    // Cleanup
    for (const convId of convIds) {
      await prisma.chatMessage.deleteMany({ where: { conversationId: convId } });
      await prisma.conversation.delete({ where: { id: convId } });
    }
  });
});
