/**
 * Chat Topic Service Tests (S11.1)
 *
 * Tests for:
 * - createTopicConversation: creates a TOPIC conversation
 * - listTopicConversations: lists user's active TOPIC conversations
 * - switchConversation: switches to a conversation with ownership check
 * - Archive exclusion: TOPIC conversations are not archived by runDailyArchive
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

describe('Chat Topic Service (S11.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =======================================================================
  // createTopicConversation
  // =======================================================================

  describe('createTopicConversation', () => {
    it('should create a TOPIC conversation with the given title', async () => {
      const mockConv = {
        id: 'conv-topic-001',
        userId: 'user-001',
        type: 'TOPIC',
        status: 'ACTIVE',
        title: 'Sprint Planning Q2',
      };
      mockPrismaClient.conversation.create.mockResolvedValueOnce(mockConv);

      const result = await chatService.createTopicConversation('user-001', 'Sprint Planning Q2');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockConv);
      expect(mockPrismaClient.conversation.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-001',
          type: 'TOPIC',
          status: 'ACTIVE',
          title: 'Sprint Planning Q2',
        },
      });
    });

    it('should trim whitespace from title', async () => {
      const mockConv = {
        id: 'conv-topic-002',
        userId: 'user-001',
        type: 'TOPIC',
        status: 'ACTIVE',
        title: 'Trimmed Title',
      };
      mockPrismaClient.conversation.create.mockResolvedValueOnce(mockConv);

      const result = await chatService.createTopicConversation('user-001', '  Trimmed Title  ');

      expect(result.success).toBe(true);
      expect(mockPrismaClient.conversation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ title: 'Trimmed Title' }),
      });
    });

    it('should return VALIDATION_ERROR for empty title', async () => {
      const result = await chatService.createTopicConversation('user-001', '');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return VALIDATION_ERROR for whitespace-only title', async () => {
      const result = await chatService.createTopicConversation('user-001', '   ');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return INTERNAL_ERROR on database failure', async () => {
      mockPrismaClient.conversation.create.mockRejectedValueOnce(new Error('DB down'));

      const result = await chatService.createTopicConversation('user-001', 'Test Topic');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INTERNAL_ERROR');
    });
  });

  // =======================================================================
  // listTopicConversations
  // =======================================================================

  describe('listTopicConversations', () => {
    it('should return active TOPIC conversations ordered by updatedAt desc', async () => {
      const mockTopics = [
        { id: 'conv-topic-001', userId: 'user-001', type: 'TOPIC', status: 'ACTIVE', title: 'Topic A' },
        { id: 'conv-topic-002', userId: 'user-001', type: 'TOPIC', status: 'ACTIVE', title: 'Topic B' },
      ];
      mockPrismaClient.conversation.findMany.mockResolvedValueOnce(mockTopics);

      const result = await chatService.listTopicConversations('user-001');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(mockPrismaClient.conversation.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-001',
          type: 'TOPIC',
          status: 'ACTIVE',
        },
        orderBy: { updatedAt: 'desc' },
      });
    });

    it('should return empty array when no TOPIC conversations exist', async () => {
      mockPrismaClient.conversation.findMany.mockResolvedValueOnce([]);

      const result = await chatService.listTopicConversations('user-001');

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should return INTERNAL_ERROR on database failure', async () => {
      mockPrismaClient.conversation.findMany.mockRejectedValueOnce(new Error('DB down'));

      const result = await chatService.listTopicConversations('user-001');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INTERNAL_ERROR');
    });
  });

  // =======================================================================
  // switchConversation
  // =======================================================================

  describe('switchConversation', () => {
    it('should return the conversation when userId matches and status is ACTIVE', async () => {
      const mockConv = {
        id: 'conv-topic-001',
        userId: 'user-001',
        type: 'TOPIC',
        status: 'ACTIVE',
        title: 'My Topic',
      };
      mockPrismaClient.conversation.findFirst.mockResolvedValueOnce(mockConv);

      const result = await chatService.switchConversation('user-001', 'conv-topic-001');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockConv);
      expect(mockPrismaClient.conversation.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'conv-topic-001',
          userId: 'user-001',
          status: 'ACTIVE',
        },
      });
    });

    it('should work for DEFAULT conversations too', async () => {
      const mockConv = {
        id: 'conv-default-001',
        userId: 'user-001',
        type: 'DEFAULT',
        status: 'ACTIVE',
      };
      mockPrismaClient.conversation.findFirst.mockResolvedValueOnce(mockConv);

      const result = await chatService.switchConversation('user-001', 'conv-default-001');

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe('DEFAULT');
    });

    it('should return NOT_FOUND when conversation does not exist', async () => {
      mockPrismaClient.conversation.findFirst.mockResolvedValueOnce(null);

      const result = await chatService.switchConversation('user-001', 'non-existent');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NOT_FOUND');
    });

    it('should return NOT_FOUND when userId does not match (ownership check)', async () => {
      mockPrismaClient.conversation.findFirst.mockResolvedValueOnce(null);

      const result = await chatService.switchConversation('user-002', 'conv-topic-001');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NOT_FOUND');
    });

    it('should return NOT_FOUND for ARCHIVED conversations', async () => {
      mockPrismaClient.conversation.findFirst.mockResolvedValueOnce(null);

      const result = await chatService.switchConversation('user-001', 'conv-archived-001');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NOT_FOUND');
    });

    it('should return INTERNAL_ERROR on database failure', async () => {
      mockPrismaClient.conversation.findFirst.mockRejectedValueOnce(new Error('DB down'));

      const result = await chatService.switchConversation('user-001', 'conv-topic-001');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INTERNAL_ERROR');
    });
  });

  // =======================================================================
  // Archive exclusion verification
  // =======================================================================

  describe('archive exclusion (S11.1 + S8.1)', () => {
    it('runDailyArchive only queries DEFAULT conversations, excluding TOPIC', async () => {
      // Import archive service
      const { chatArchiveService } = await import('@/services/chat-archive.service');

      // Return no active DEFAULT conversations (simulates no work to do)
      mockPrismaClient.conversation.findMany.mockResolvedValueOnce([]);

      await chatArchiveService.runDailyArchive();

      // Verify the query only looks for type: DEFAULT
      expect(mockPrismaClient.conversation.findMany).toHaveBeenCalledWith({
        where: { type: 'DEFAULT', status: 'ACTIVE' },
        select: { userId: true },
      });
    });
  });
});
