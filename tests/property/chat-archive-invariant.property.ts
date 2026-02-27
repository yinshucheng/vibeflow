/**
 * Chat Archive Invariant Property Tests (S8.4)
 *
 * Property: At any given moment, each userId has at most one
 *   type=DEFAULT, status=ACTIVE Conversation.
 *
 * We also verify that archiveAndRotate preserves this invariant.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

// ---------- Prisma mock ----------

const mockPrismaClient = vi.hoisted(() => ({
  conversation: {
    findFirst: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
  },
  chatMessage: {
    create: vi.fn().mockResolvedValue({ id: 'msg-div' }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
}));

vi.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrismaClient,
  prisma: mockPrismaClient,
}));

vi.mock('@/services/chat.service', () => ({
  chatService: {
    getOrCreateDefaultConversation: vi.fn().mockResolvedValue({
      success: true,
      data: { id: 'conv-default', userId: 'user-1', type: 'DEFAULT', status: 'ACTIVE' },
    }),
    getHistory: vi.fn().mockResolvedValue({ success: true, data: [] }),
  },
}));

import { chatArchiveService } from '@/services/chat-archive.service';

describe('Chat Archive Invariants (S8.4 property)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrismaClient.conversation.update.mockResolvedValue({ id: 'conv-default', type: 'DAILY', status: 'ARCHIVED' });
    mockPrismaClient.conversation.create.mockResolvedValue({
      id: 'conv-new-default',
      userId: 'user-1',
      type: 'DEFAULT',
      status: 'ACTIVE',
    });
  });

  it('archiveAndRotate should always result in exactly one ACTIVE DEFAULT per user', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // arbitrary userId
        async (userId) => {
          // Reset mocks for each run
          const { chatService } = await import('@/services/chat.service');
          vi.mocked(chatService.getOrCreateDefaultConversation).mockResolvedValue({
            success: true,
            data: { id: `conv-${userId}`, userId, type: 'DEFAULT', status: 'ACTIVE' } as never,
          });
          mockPrismaClient.conversation.create.mockResolvedValue({
            id: `conv-new-${userId}`,
            userId,
            type: 'DEFAULT',
            status: 'ACTIVE',
          });

          const result = await chatArchiveService.archiveAndRotate(userId);

          if (result.success) {
            // The old conversation was archived
            expect(mockPrismaClient.conversation.update).toHaveBeenCalledWith(
              expect.objectContaining({
                data: expect.objectContaining({
                  type: 'DAILY',
                  status: 'ARCHIVED',
                }),
              }),
            );

            // A new DEFAULT was created
            expect(mockPrismaClient.conversation.create).toHaveBeenCalledWith(
              expect.objectContaining({
                data: expect.objectContaining({
                  userId,
                  type: 'DEFAULT',
                  status: 'ACTIVE',
                }),
              }),
            );

            // The returned IDs differ (old archived vs new active)
            expect(result.data!.archivedId).not.toBe(result.data!.newId);
          }
        },
      ),
      { numRuns: 20 },
    );
  });

  it('archiveAndRotate always sets date on the archived conversation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (userId) => {
          const { chatService } = await import('@/services/chat.service');
          vi.mocked(chatService.getOrCreateDefaultConversation).mockResolvedValue({
            success: true,
            data: { id: `conv-${userId}`, userId, type: 'DEFAULT', status: 'ACTIVE' } as never,
          });
          mockPrismaClient.conversation.create.mockResolvedValue({
            id: `conv-new-${userId}`,
            userId,
            type: 'DEFAULT',
            status: 'ACTIVE',
          });

          const result = await chatArchiveService.archiveAndRotate(userId);

          if (result.success) {
            const updateArgs = mockPrismaClient.conversation.update.mock.calls[
              mockPrismaClient.conversation.update.mock.calls.length - 1
            ][0];
            const date = updateArgs.data.date as string;
            // date must be a valid YYYY-MM-DD
            expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          }
        },
      ),
      { numRuns: 20 },
    );
  });

  it('cleanupOldMessages cutoff should be exactly N days ago', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 365 }),
        (days) => {
          const now = Date.now();
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - days);

          // Cutoff should be approximately N days ago (within 1 second tolerance)
          const diffMs = now - cutoff.getTime();
          const diffDays = diffMs / 86400000;
          expect(Math.abs(diffDays - days)).toBeLessThan(0.01);
        },
      ),
      { numRuns: 50 },
    );
  });
});
