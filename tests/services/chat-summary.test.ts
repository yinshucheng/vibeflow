/**
 * S7.5 Tests: Summary Generation
 *
 * - Messages <= 40 → no summary generated
 * - Messages > 40 → LLM called (mock), summary injected into messages
 * - Summary cache: second call doesn't regenerate
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { chatSummaryService, SUMMARY_CONFIG } from '@/services/chat-summary.service';

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  default: {
    chatMessage: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

// Mock LLM adapter
vi.mock('@/services/llm-adapter.service', () => ({
  llmAdapterService: {
    callGenerateText: vi.fn(),
  },
}));

import prisma from '@/lib/prisma';
import { llmAdapterService } from '@/services/llm-adapter.service';

const mockPrisma = vi.mocked(prisma);
const mockLLM = vi.mocked(llmAdapterService);

describe('chatSummaryService (S7.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatSummaryService.clearSummaryCache('test-conv-id');
  });

  // ── getOrCreateSummary ──
  describe('getOrCreateSummary', () => {
    it('returns empty string when messages <= 40', async () => {
      mockPrisma.chatMessage.count.mockResolvedValue(30);

      const result = await chatSummaryService.getOrCreateSummary('test-conv-id', 20);

      expect(result.success).toBe(true);
      expect(result.data).toBe('');
      expect(mockLLM.callGenerateText).not.toHaveBeenCalled();
    });

    it('returns empty string when messages exactly at threshold', async () => {
      mockPrisma.chatMessage.count.mockResolvedValue(SUMMARY_CONFIG.summarizeThreshold);

      const result = await chatSummaryService.getOrCreateSummary('test-conv-id', 20);

      expect(result.success).toBe(true);
      expect(result.data).toBe('');
    });

    it('generates summary when messages > 40', async () => {
      mockPrisma.chatMessage.count.mockResolvedValue(50);
      mockPrisma.chatMessage.findMany.mockResolvedValue([
        { id: '1', role: 'user', content: '你好', conversationId: 'test-conv-id', createdAt: new Date(), metadata: null, tokenCount: null },
        { id: '2', role: 'assistant', content: '你好！', conversationId: 'test-conv-id', createdAt: new Date(), metadata: null, tokenCount: null },
      ] as never);

      mockLLM.callGenerateText.mockResolvedValue({
        text: '用户打了个招呼，AI 回复了问候。',
      } as never);

      const result = await chatSummaryService.getOrCreateSummary('test-conv-id', 20);

      expect(result.success).toBe(true);
      expect(result.data).toBe('用户打了个招呼，AI 回复了问候。');
      expect(mockLLM.callGenerateText).toHaveBeenCalledOnce();
      expect(mockLLM.callGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          scene: 'internal:summarize',
        })
      );
    });

    it('uses cached summary on second call (same message count)', async () => {
      // First call
      mockPrisma.chatMessage.count.mockResolvedValue(50);
      mockPrisma.chatMessage.findMany.mockResolvedValue([
        { id: '1', role: 'user', content: 'test', conversationId: 'test-conv-id', createdAt: new Date(), metadata: null, tokenCount: null },
      ] as never);
      mockLLM.callGenerateText.mockResolvedValue({ text: 'cached summary' } as never);

      await chatSummaryService.getOrCreateSummary('test-conv-id', 20);
      expect(mockLLM.callGenerateText).toHaveBeenCalledOnce();

      // Second call — should use cache
      vi.clearAllMocks();
      mockPrisma.chatMessage.count.mockResolvedValue(50);

      const result = await chatSummaryService.getOrCreateSummary('test-conv-id', 20);
      expect(result.data).toBe('cached summary');
      expect(mockLLM.callGenerateText).not.toHaveBeenCalled();
    });

    it('regenerates summary when message count changes', async () => {
      // First call at 50 messages
      mockPrisma.chatMessage.count.mockResolvedValue(50);
      mockPrisma.chatMessage.findMany.mockResolvedValue([
        { id: '1', role: 'user', content: 'test', conversationId: 'test-conv-id', createdAt: new Date(), metadata: null, tokenCount: null },
      ] as never);
      mockLLM.callGenerateText.mockResolvedValue({ text: 'first summary' } as never);
      await chatSummaryService.getOrCreateSummary('test-conv-id', 20);

      // Second call at 55 messages
      vi.clearAllMocks();
      mockPrisma.chatMessage.count.mockResolvedValue(55);
      mockPrisma.chatMessage.findMany.mockResolvedValue([
        { id: '1', role: 'user', content: 'test', conversationId: 'test-conv-id', createdAt: new Date(), metadata: null, tokenCount: null },
      ] as never);
      mockLLM.callGenerateText.mockResolvedValue({ text: 'updated summary' } as never);

      const result = await chatSummaryService.getOrCreateSummary('test-conv-id', 20);
      expect(result.data).toBe('updated summary');
      expect(mockLLM.callGenerateText).toHaveBeenCalledOnce();
    });

    it('skips system messages when building summary input', async () => {
      mockPrisma.chatMessage.count.mockResolvedValue(50);
      mockPrisma.chatMessage.findMany.mockResolvedValue([
        { id: '1', role: 'system', content: '日期分割线', conversationId: 'test-conv-id', createdAt: new Date(), metadata: null, tokenCount: null },
        { id: '2', role: 'user', content: '你好', conversationId: 'test-conv-id', createdAt: new Date(), metadata: null, tokenCount: null },
      ] as never);
      mockLLM.callGenerateText.mockResolvedValue({ text: 'summary' } as never);

      await chatSummaryService.getOrCreateSummary('test-conv-id', 20);

      const callArgs = mockLLM.callGenerateText.mock.calls[0][0];
      expect(callArgs.messages).toHaveLength(1); // system message filtered out
      expect(callArgs.messages[0].role).toBe('user');
    });

    it('returns error on LLM failure', async () => {
      mockPrisma.chatMessage.count.mockResolvedValue(50);
      mockPrisma.chatMessage.findMany.mockResolvedValue([
        { id: '1', role: 'user', content: 'test', conversationId: 'test-conv-id', createdAt: new Date(), metadata: null, tokenCount: null },
      ] as never);
      mockLLM.callGenerateText.mockRejectedValue(new Error('LLM timeout'));

      const result = await chatSummaryService.getOrCreateSummary('test-conv-id', 20);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INTERNAL_ERROR');
    });
  });

  // ── getCompressionAction (S7.4) ──
  describe('getCompressionAction', () => {
    it('returns "none" for < 80%', () => {
      const action = chatSummaryService.getCompressionAction(70);
      expect(action.type).toBe('none');
    });

    it('returns "auto_compress" for 80-90%', () => {
      const action = chatSummaryService.getCompressionAction(85);
      expect(action.type).toBe('auto_compress');
      expect(action.message).toContain('自动压缩');
    });

    it('returns "suggest_new_session" for > 90%', () => {
      const action = chatSummaryService.getCompressionAction(95);
      expect(action.type).toBe('suggest_new_session');
      expect(action.message).toContain('新会话');
    });

    it('returns "auto_compress" at exactly 81%', () => {
      const action = chatSummaryService.getCompressionAction(81);
      expect(action.type).toBe('auto_compress');
    });

    it('returns "suggest_new_session" at exactly 91%', () => {
      const action = chatSummaryService.getCompressionAction(91);
      expect(action.type).toBe('suggest_new_session');
    });

    it('returns "none" at exactly 80%', () => {
      const action = chatSummaryService.getCompressionAction(80);
      expect(action.type).toBe('none');
    });
  });
});
