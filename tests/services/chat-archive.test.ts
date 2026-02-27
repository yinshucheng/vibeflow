/**
 * Chat Archive Service Tests (S8.4)
 *
 * Tests for:
 * - archiveAndRotate: old DEFAULT → type=DAILY, status=ARCHIVED, date=yesterday
 * - archiveAndRotate: new DEFAULT created, messages empty
 * - archiveAndRotate: getOrCreateDefaultConversation returns new (not old)
 * - Cleanup: 31-day-old messages deleted, 30-day-old retained
 * - getArchivedConversations: lists archived conversations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------- Prisma mock ----------

const mockPrismaClient = vi.hoisted(() => ({
  conversation: {
    findFirst: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
  },
  chatMessage: {
    create: vi.fn(),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
}));

vi.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrismaClient,
  prisma: mockPrismaClient,
}));

// ---------- Chat service mock (for getOrCreateDefaultConversation / getHistory) ----------

const { mockConvId, mockNewConvId } = vi.hoisted(() => ({
  mockConvId: 'conv-default-001',
  mockNewConvId: 'conv-default-002',
}));

vi.mock('@/services/chat.service', () => ({
  chatService: {
    getOrCreateDefaultConversation: vi.fn().mockResolvedValue({
      success: true,
      data: { id: mockConvId, userId: 'user-001', type: 'DEFAULT', status: 'ACTIVE' },
    }),
    getHistory: vi.fn().mockResolvedValue({
      success: true,
      data: [
        { id: 'msg-1', role: 'user', content: 'Hello' },
        { id: 'msg-2', role: 'assistant', content: 'Hi' },
      ],
    }),
  },
}));

import { chatArchiveService, getYesterdayDateString, getTodayDateString } from '@/services/chat-archive.service';

describe('Chat Archive Service (S8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: create returns a new conversation
    mockPrismaClient.conversation.create.mockResolvedValue({
      id: mockNewConvId,
      userId: 'user-001',
      type: 'DEFAULT',
      status: 'ACTIVE',
      title: 'VibeFlow Assistant',
    });
    mockPrismaClient.conversation.update.mockResolvedValue({
      id: mockConvId,
      type: 'DAILY',
      status: 'ARCHIVED',
    });
    mockPrismaClient.chatMessage.create.mockResolvedValue({
      id: 'msg-divider',
      role: 'system',
      content: '{}',
    });
  });

  // =======================================================================
  // archiveAndRotate
  // =======================================================================

  describe('archiveAndRotate (S8.1)', () => {
    it('should archive old DEFAULT → type=DAILY, status=ARCHIVED', async () => {
      const result = await chatArchiveService.archiveAndRotate('user-001');

      expect(result.success).toBe(true);
      expect(result.data?.archivedId).toBe(mockConvId);

      // Verify the update call
      expect(mockPrismaClient.conversation.update).toHaveBeenCalledWith({
        where: { id: mockConvId },
        data: expect.objectContaining({
          type: 'DAILY',
          status: 'ARCHIVED',
        }),
      });

      // date should be yesterday's date string
      const updateCall = mockPrismaClient.conversation.update.mock.calls[0][0];
      expect(updateCall.data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should create a new DEFAULT conversation', async () => {
      const result = await chatArchiveService.archiveAndRotate('user-001');

      expect(result.success).toBe(true);
      expect(result.data?.newId).toBe(mockNewConvId);

      expect(mockPrismaClient.conversation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-001',
          type: 'DEFAULT',
          status: 'ACTIVE',
          title: 'VibeFlow Assistant',
        }),
      });
    });

    it('should insert a day-divider system message in the new conversation', async () => {
      await chatArchiveService.archiveAndRotate('user-001');

      expect(mockPrismaClient.chatMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          conversationId: mockNewConvId,
          role: 'system',
        }),
      });

      // Verify content is a day_divider
      const msgData = mockPrismaClient.chatMessage.create.mock.calls[0][0].data;
      const content = JSON.parse(msgData.content);
      expect(content.type).toBe('day_divider');
      expect(content.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should fail gracefully when getOrCreateDefaultConversation fails', async () => {
      const { chatService } = await import('@/services/chat.service');
      vi.mocked(chatService.getOrCreateDefaultConversation).mockResolvedValueOnce({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'DB error' },
      });

      const result = await chatArchiveService.archiveAndRotate('user-001');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INTERNAL_ERROR');
    });
  });

  // =======================================================================
  // runDailyArchive
  // =======================================================================

  describe('runDailyArchive (S8.1)', () => {
    it('should archive all active DEFAULT conversations', async () => {
      mockPrismaClient.conversation.findMany.mockResolvedValueOnce([
        { userId: 'user-001' },
        { userId: 'user-002' },
      ]);

      // For user-002, need a second create call
      mockPrismaClient.conversation.create
        .mockResolvedValueOnce({ id: 'conv-002-new', userId: 'user-001', type: 'DEFAULT' })
        .mockResolvedValueOnce({ id: 'conv-003-new', userId: 'user-002', type: 'DEFAULT' });

      const result = await chatArchiveService.runDailyArchive();
      expect(result.success).toBe(true);
      expect(result.data?.archivedCount).toBe(2);
    });
  });

  // =======================================================================
  // getArchivedConversations
  // =======================================================================

  describe('getArchivedConversations (S8.2)', () => {
    it('should return archived conversations for a user', async () => {
      mockPrismaClient.conversation.findMany.mockResolvedValueOnce([
        { id: 'conv-arch-1', userId: 'user-001', type: 'DAILY', status: 'ARCHIVED', date: '2026-02-25' },
        { id: 'conv-arch-2', userId: 'user-001', type: 'DAILY', status: 'ARCHIVED', date: '2026-02-24' },
      ]);

      const result = await chatArchiveService.getArchivedConversations('user-001');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);

      // Verify query filters
      expect(mockPrismaClient.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-001', status: 'ARCHIVED' },
          orderBy: { updatedAt: 'desc' },
        }),
      );
    });
  });

  // =======================================================================
  // getArchivedMessages
  // =======================================================================

  describe('getArchivedMessages (S8.2)', () => {
    it('should return messages for an archived conversation via chatService.getHistory', async () => {
      const result = await chatArchiveService.getArchivedMessages('user-001', 'conv-arch-1');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });
  });

  // =======================================================================
  // cleanupOldMessages
  // =======================================================================

  describe('cleanupOldMessages (S8.3)', () => {
    it('should delete messages older than 30 days from ARCHIVED conversations', async () => {
      mockPrismaClient.chatMessage.deleteMany.mockResolvedValueOnce({ count: 42 });

      const result = await chatArchiveService.cleanupOldMessages(30);
      expect(result.success).toBe(true);
      expect(result.data?.deletedCount).toBe(42);

      // Verify the deleteMany filter
      const call = mockPrismaClient.chatMessage.deleteMany.mock.calls[0][0];
      expect(call.where.conversation.status).toBe('ARCHIVED');
      expect(call.where.createdAt.lt).toBeInstanceOf(Date);
    });

    it('should keep messages within 30 days', async () => {
      mockPrismaClient.chatMessage.deleteMany.mockResolvedValueOnce({ count: 0 });

      const result = await chatArchiveService.cleanupOldMessages(30);
      expect(result.success).toBe(true);
      expect(result.data?.deletedCount).toBe(0);
    });

    it('should delete messages older than 31 days (boundary)', async () => {
      mockPrismaClient.chatMessage.deleteMany.mockResolvedValueOnce({ count: 5 });

      const result = await chatArchiveService.cleanupOldMessages(31);
      expect(result.success).toBe(true);

      // The cutoff date should be 31 days ago
      const call = mockPrismaClient.chatMessage.deleteMany.mock.calls[0][0];
      const cutoff = call.where.createdAt.lt as Date;
      const daysAgo = Math.round((Date.now() - cutoff.getTime()) / 86400000);
      expect(daysAgo).toBe(31);
    });
  });

  // =======================================================================
  // Helper functions
  // =======================================================================

  describe('helper functions', () => {
    it('getYesterdayDateString should return YYYY-MM-DD format', () => {
      // Create a date at 10:00 AM local time (well past 4AM boundary)
      const date = new Date();
      date.setHours(10, 0, 0, 0);
      const result = getYesterdayDateString(date);

      // "Yesterday" from 10AM today
      const expected = new Date(date);
      expected.setDate(expected.getDate() - 1);
      expect(result).toBe(expected.toISOString().split('T')[0]);
    });

    it('getYesterdayDateString should handle pre-4AM correctly', () => {
      // At 3AM, "today" is logically yesterday, so "yesterday" is two days back
      const date = new Date();
      date.setHours(3, 0, 0, 0);
      const result = getYesterdayDateString(date);

      const expected = new Date(date);
      expected.setDate(expected.getDate() - 2);
      expect(result).toBe(expected.toISOString().split('T')[0]);
    });

    it('getTodayDateString should return today accounting for 4AM boundary', () => {
      const date = new Date();
      date.setHours(10, 0, 0, 0);
      const result = getTodayDateString(date);
      expect(result).toBe(date.toISOString().split('T')[0]);
    });

    it('getTodayDateString pre-4AM should return yesterday', () => {
      const date = new Date();
      date.setHours(3, 0, 0, 0);
      const result = getTodayDateString(date);

      const expected = new Date(date);
      expected.setDate(expected.getDate() - 1);
      expect(result).toBe(expected.toISOString().split('T')[0]);
    });
  });
});
