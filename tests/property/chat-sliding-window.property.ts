/**
 * F6.3 Property Tests: Chat Sliding Window
 *
 * Invariants:
 * - For any N messages in DB, buildLLMMessages returns <= min(N, 20) + 1
 * - Returned messages never contain role='system'
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  setupChatTestUser,
  cleanupChatTestUser,
  getTestUserId,
  isDbAvailable,
  prisma,
} from '../helpers/chat-test-setup';
import { chatContextService, CONTEXT_WINDOW } from '@/services/chat-context.service';

beforeAll(() => setupChatTestUser());
afterAll(() => cleanupChatTestUser());

async function cleanupConversations() {
  const userId = getTestUserId();
  if (!userId) return;
  await prisma.chatMessage.deleteMany({ where: { conversation: { userId } } });
  await prisma.conversation.deleteMany({ where: { userId } });
}

describe('chat-sliding-window property', () => {
  beforeEach(async () => {
    if (!isDbAvailable()) return;
    await cleanupConversations();
  });

  it('returns <= min(N, 20) + 1 messages for any N', async () => {
    if (!isDbAvailable()) {
      console.warn('[property] Skipping: Database not available');
      return;
    }

    // Use smaller N values for property tests to keep them fast
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 40 }), async (n) => {
        await cleanupConversations();

        const conv = await prisma.conversation.create({
          data: {
            userId: getTestUserId(),
            type: 'DEFAULT',
            status: 'ACTIVE',
            title: `Property test N=${n}`,
          },
        });

        // Seed N messages with a mix of roles including system
        for (let i = 0; i < n; i++) {
          const role = i % 7 === 0 ? 'system' : i % 2 === 0 ? 'user' : 'assistant';
          await prisma.chatMessage.create({
            data: {
              conversationId: conv.id,
              role,
              content: `Msg ${i}`,
            },
          });
        }

        const result = await chatContextService.buildLLMMessages(
          getTestUserId(),
          conv.id,
          'Property test new message'
        );

        expect(result.success).toBe(true);

        // Upper bound: min(N, 20) non-system messages from DB + 1 new message
        const maxFromDb = Math.min(n, CONTEXT_WINDOW.recentMessageCount);
        // +1 for the new user message
        expect(result.data!.length).toBeLessThanOrEqual(maxFromDb + 1);
        // At least the new message
        expect(result.data!.length).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 10 } // Keep property tests reasonably fast
    );
  });

  it('never returns role=system messages', async () => {
    if (!isDbAvailable()) {
      console.warn('[property] Skipping: Database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 30 }), async (n) => {
        await cleanupConversations();

        const conv = await prisma.conversation.create({
          data: {
            userId: getTestUserId(),
            type: 'DEFAULT',
            status: 'ACTIVE',
            title: `No-system test N=${n}`,
          },
        });

        // Seed messages: deliberately include many system messages
        for (let i = 0; i < n; i++) {
          const role = i % 3 === 0 ? 'system' : i % 2 === 0 ? 'user' : 'assistant';
          await prisma.chatMessage.create({
            data: {
              conversationId: conv.id,
              role,
              content: role === 'system' ? '--- separator ---' : `Hello ${i}`,
            },
          });
        }

        const result = await chatContextService.buildLLMMessages(
          getTestUserId(),
          conv.id,
          'Check no system'
        );

        expect(result.success).toBe(true);
        for (const msg of result.data!) {
          expect(msg.role).not.toBe('system');
        }
      }),
      { numRuns: 10 }
    );
  });
});
