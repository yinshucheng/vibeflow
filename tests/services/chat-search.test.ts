/**
 * Chat Search Service Tests (S11.2)
 *
 * Tests for:
 * - searchMessages: full-text search across user's chat messages
 *   - Search hit (matching content)
 *   - Search miss (no results)
 *   - Cross-conversation search
 *   - userId isolation (cannot search other user's messages)
 *   - Filtering by conversationId
 *   - Filtering by dateRange
 *   - Pagination (limit + offset)
 *   - Database error handling
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
    count: vi.fn().mockResolvedValue(0),
    findMany: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrismaClient,
  prisma: mockPrismaClient,
}));

// ---------- LLM adapter mock ----------

vi.mock('@/services/llm-adapter.service', () => ({
  llmAdapterService: {
    callLLM: vi.fn(),
  },
}));

import { chatService } from '@/services/chat.service';

describe('Chat Search Service (S11.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =======================================================================
  // searchMessages — search hit
  // =======================================================================

  describe('searchMessages — search hit', () => {
    it('should return matching messages with conversation titles', async () => {
      const mockMessages = [
        {
          id: 'msg-001',
          conversationId: 'conv-001',
          role: 'user',
          content: '帮我规划今天的任务',
          metadata: null,
          tokenCount: null,
          createdAt: new Date('2026-03-01T10:00:00Z'),
          conversation: { title: 'VibeFlow Assistant' },
        },
        {
          id: 'msg-002',
          conversationId: 'conv-002',
          role: 'assistant',
          content: '今天的任务规划如下',
          metadata: null,
          tokenCount: null,
          createdAt: new Date('2026-03-01T11:00:00Z'),
          conversation: { title: 'Sprint Planning' },
        },
      ];

      mockPrismaClient.chatMessage.count.mockResolvedValueOnce(2);
      mockPrismaClient.chatMessage.findMany.mockResolvedValueOnce(mockMessages);

      const result = await chatService.searchMessages('user-001', {
        query: '任务',
        limit: 20,
        offset: 0,
      });

      expect(result.success).toBe(true);
      expect(result.data?.messages).toHaveLength(2);
      expect(result.data?.total).toBe(2);
      expect(result.data?.messages[0].conversationTitle).toBe('VibeFlow Assistant');
      expect(result.data?.messages[1].conversationTitle).toBe('Sprint Planning');
    });

    it('should use case-insensitive search', async () => {
      mockPrismaClient.chatMessage.count.mockResolvedValueOnce(0);
      mockPrismaClient.chatMessage.findMany.mockResolvedValueOnce([]);

      await chatService.searchMessages('user-001', {
        query: 'hello',
        limit: 20,
        offset: 0,
      });

      expect(mockPrismaClient.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            content: { contains: 'hello', mode: 'insensitive' },
          }),
        })
      );
    });
  });

  // =======================================================================
  // searchMessages — search miss
  // =======================================================================

  describe('searchMessages — search miss', () => {
    it('should return empty results when no messages match', async () => {
      mockPrismaClient.chatMessage.count.mockResolvedValueOnce(0);
      mockPrismaClient.chatMessage.findMany.mockResolvedValueOnce([]);

      const result = await chatService.searchMessages('user-001', {
        query: '不存在的内容xyz',
        limit: 20,
        offset: 0,
      });

      expect(result.success).toBe(true);
      expect(result.data?.messages).toEqual([]);
      expect(result.data?.total).toBe(0);
    });
  });

  // =======================================================================
  // searchMessages — cross-conversation search
  // =======================================================================

  describe('searchMessages — cross-conversation search', () => {
    it('should search across all conversations when conversationId is not specified', async () => {
      mockPrismaClient.chatMessage.count.mockResolvedValueOnce(3);
      mockPrismaClient.chatMessage.findMany.mockResolvedValueOnce([
        {
          id: 'msg-001',
          conversationId: 'conv-001',
          role: 'user',
          content: '番茄钟开始',
          metadata: null,
          tokenCount: null,
          createdAt: new Date(),
          conversation: { title: 'Daily Chat' },
        },
        {
          id: 'msg-002',
          conversationId: 'conv-002',
          role: 'assistant',
          content: '番茄钟已完成',
          metadata: null,
          tokenCount: null,
          createdAt: new Date(),
          conversation: { title: 'Sprint Topic' },
        },
        {
          id: 'msg-003',
          conversationId: 'conv-003',
          role: 'user',
          content: '番茄钟统计',
          metadata: null,
          tokenCount: null,
          createdAt: new Date(),
          conversation: { title: 'Archived 2026-02-28' },
        },
      ]);

      const result = await chatService.searchMessages('user-001', {
        query: '番茄钟',
        limit: 20,
        offset: 0,
      });

      expect(result.success).toBe(true);
      expect(result.data?.messages).toHaveLength(3);
      expect(result.data?.total).toBe(3);

      // Verify no conversationId filter was applied
      const whereArg = mockPrismaClient.chatMessage.findMany.mock.calls[0][0].where;
      expect(whereArg.conversation).toEqual({ userId: 'user-001' });
    });
  });

  // =======================================================================
  // searchMessages — userId isolation
  // =======================================================================

  describe('searchMessages — userId isolation', () => {
    it('should only search messages belonging to the requesting user', async () => {
      mockPrismaClient.chatMessage.count.mockResolvedValueOnce(0);
      mockPrismaClient.chatMessage.findMany.mockResolvedValueOnce([]);

      await chatService.searchMessages('user-002', {
        query: 'test',
        limit: 20,
        offset: 0,
      });

      // Verify userId filter is applied through conversation relation
      const countWhere = mockPrismaClient.chatMessage.count.mock.calls[0][0].where;
      const findWhere = mockPrismaClient.chatMessage.findMany.mock.calls[0][0].where;

      expect(countWhere.conversation.userId).toBe('user-002');
      expect(findWhere.conversation.userId).toBe('user-002');
    });
  });

  // =======================================================================
  // searchMessages — conversationId filter
  // =======================================================================

  describe('searchMessages — conversationId filter', () => {
    it('should filter by conversationId when provided', async () => {
      mockPrismaClient.chatMessage.count.mockResolvedValueOnce(1);
      mockPrismaClient.chatMessage.findMany.mockResolvedValueOnce([
        {
          id: 'msg-001',
          conversationId: 'conv-specific',
          role: 'user',
          content: 'test message',
          metadata: null,
          tokenCount: null,
          createdAt: new Date(),
          conversation: { title: 'Specific Topic' },
        },
      ]);

      await chatService.searchMessages('user-001', {
        query: 'test',
        limit: 20,
        offset: 0,
        conversationId: 'conv-specific',
      });

      const whereArg = mockPrismaClient.chatMessage.findMany.mock.calls[0][0].where;
      expect(whereArg.conversation).toEqual({
        userId: 'user-001',
        id: 'conv-specific',
      });
    });
  });

  // =======================================================================
  // searchMessages — dateRange filter
  // =======================================================================

  describe('searchMessages — dateRange filter', () => {
    it('should filter by date range when provided', async () => {
      const from = new Date('2026-03-01T00:00:00Z');
      const to = new Date('2026-03-02T23:59:59Z');

      mockPrismaClient.chatMessage.count.mockResolvedValueOnce(0);
      mockPrismaClient.chatMessage.findMany.mockResolvedValueOnce([]);

      await chatService.searchMessages('user-001', {
        query: 'test',
        limit: 20,
        offset: 0,
        dateRange: { from, to },
      });

      const whereArg = mockPrismaClient.chatMessage.findMany.mock.calls[0][0].where;
      expect(whereArg.createdAt).toEqual({ gte: from, lte: to });
    });

    it('should not filter by date when dateRange is not provided', async () => {
      mockPrismaClient.chatMessage.count.mockResolvedValueOnce(0);
      mockPrismaClient.chatMessage.findMany.mockResolvedValueOnce([]);

      await chatService.searchMessages('user-001', {
        query: 'test',
        limit: 20,
        offset: 0,
      });

      const whereArg = mockPrismaClient.chatMessage.findMany.mock.calls[0][0].where;
      expect(whereArg.createdAt).toBeUndefined();
    });
  });

  // =======================================================================
  // searchMessages — pagination
  // =======================================================================

  describe('searchMessages — pagination', () => {
    it('should apply limit and offset', async () => {
      mockPrismaClient.chatMessage.count.mockResolvedValueOnce(50);
      mockPrismaClient.chatMessage.findMany.mockResolvedValueOnce([]);

      await chatService.searchMessages('user-001', {
        query: 'test',
        limit: 10,
        offset: 20,
      });

      expect(mockPrismaClient.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        })
      );
    });

    it('should return total count for pagination', async () => {
      mockPrismaClient.chatMessage.count.mockResolvedValueOnce(42);
      mockPrismaClient.chatMessage.findMany.mockResolvedValueOnce([]);

      const result = await chatService.searchMessages('user-001', {
        query: 'test',
        limit: 10,
        offset: 0,
      });

      expect(result.success).toBe(true);
      expect(result.data?.total).toBe(42);
    });

    it('should order results by createdAt desc (newest first)', async () => {
      mockPrismaClient.chatMessage.count.mockResolvedValueOnce(0);
      mockPrismaClient.chatMessage.findMany.mockResolvedValueOnce([]);

      await chatService.searchMessages('user-001', {
        query: 'test',
        limit: 20,
        offset: 0,
      });

      expect(mockPrismaClient.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        })
      );
    });
  });

  // =======================================================================
  // searchMessages — error handling
  // =======================================================================

  describe('searchMessages — error handling', () => {
    it('should return INTERNAL_ERROR on database failure', async () => {
      mockPrismaClient.chatMessage.count.mockRejectedValueOnce(
        new Error('DB connection lost')
      );

      const result = await chatService.searchMessages('user-001', {
        query: 'test',
        limit: 20,
        offset: 0,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INTERNAL_ERROR');
      expect(result.error?.message).toContain('DB connection lost');
    });
  });
});
