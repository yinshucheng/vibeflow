/**
 * Chat Summary Service (S7)
 *
 * S7.1 getOrCreateSummary — generate summary when messages > 40, with cache
 * S7.2 compressToolResult — truncate tool results for LLM prompt (DB keeps full)
 * S7.4 triggerContextCompression — auto-compress at > 80%, suggest new session at > 90%
 */

import prisma from '@/lib/prisma';
import { llmAdapterService } from '@/services/llm-adapter.service';

// ===== Constants =====

export const SUMMARY_CONFIG = {
  /** Threshold: generate summary when total messages exceed this count */
  summarizeThreshold: 40,
  /** Max tokens for the summary text */
  summaryMaxTokens: 1000,
  /** Max tokens for tool results in LLM prompt */
  toolResultMaxTokens: 500,
  /** Chars per token (rough estimate for CJK/Latin mix) */
  charsPerToken: 4,
  /** Auto-compression threshold (context usage percent) */
  autoCompressThreshold: 80,
  /** Suggest new session threshold (context usage percent) */
  suggestNewSessionThreshold: 90,
};

// ===== In-memory summary cache =====
// Key: conversationId, Value: { summary, messageCountAtGeneration }
const summaryCache = new Map<string, { summary: string; messageCountAtGeneration: number }>();

// ===== Types =====

interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export interface CompressionAction {
  type: 'none' | 'auto_compress' | 'suggest_new_session';
  contextUsagePercent: number;
  message?: string;
}

// ===== Service =====

export const chatSummaryService = {
  /**
   * S7.1: Get or create a summary for early messages in a conversation.
   *
   * When total message count > summarizeThreshold:
   * 1. Check cache — if already generated at same message count, return cached
   * 2. Fetch early messages (those not in the recent window)
   * 3. Call LLM (lightweight model) to generate summary
   * 4. Cache the result
   *
   * Returns empty string if no summary needed.
   */
  async getOrCreateSummary(
    conversationId: string,
    recentMessageCount: number,
    userId?: string
  ): Promise<ServiceResult<string>> {
    try {
      // Verify conversation ownership if userId provided
      if (userId) {
        const conv = await prisma.conversation.findFirst({ where: { id: conversationId, userId } });
        if (!conv) {
          return { success: false, error: { code: 'NOT_FOUND', message: 'Conversation not found' } };
        }
      }

      // Count total messages
      const totalCount = await prisma.chatMessage.count({
        where: { conversationId },
      });

      if (totalCount <= SUMMARY_CONFIG.summarizeThreshold) {
        return { success: true, data: '' };
      }

      // Check cache
      const cached = summaryCache.get(conversationId);
      if (cached && cached.messageCountAtGeneration === totalCount) {
        return { success: true, data: cached.summary };
      }

      // Fetch early messages (excluding the recent N)
      const earlyMessages = await prisma.chatMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        take: Math.max(0, totalCount - recentMessageCount),
      });

      if (earlyMessages.length === 0) {
        return { success: true, data: '' };
      }

      // Build messages for summarization
      const summaryInput = earlyMessages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content.slice(0, 500), // truncate individual messages for summary input
        }));

      if (summaryInput.length === 0) {
        return { success: true, data: '' };
      }

      // Generate summary using lightweight model
      const result = await llmAdapterService.callGenerateText({
        scene: 'internal:summarize',
        system: '总结以下对话的关键信息：执行了哪些操作、做了哪些决定、未完成的事项。不超过 300 字。',
        messages: summaryInput,
      });

      const summary = result.text || '';

      // Cache
      summaryCache.set(conversationId, {
        summary,
        messageCountAtGeneration: totalCount,
      });

      return { success: true, data: summary };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: `Failed to generate summary: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  },

  /**
   * S7.2: Compress a tool result for LLM prompt.
   *
   * DB stores the full JSON. This function truncates for the LLM context:
   * - If the result is under the token limit, return as-is
   * - If over, truncate to fit within the limit and add an ellipsis
   */
  compressToolResult(toolResult: string, maxTokens?: number): string {
    const limit = maxTokens ?? SUMMARY_CONFIG.toolResultMaxTokens;
    const maxChars = limit * SUMMARY_CONFIG.charsPerToken;

    if (toolResult.length <= maxChars) {
      return toolResult;
    }

    return toolResult.slice(0, maxChars) + '\n... [truncated]';
  },

  /**
   * S7.4: Determine what compression action to take based on context usage.
   *
   * - > 90%: suggest opening a new session
   * - > 80%: auto-compress (trigger summary generation)
   * - Otherwise: no action
   */
  getCompressionAction(contextUsagePercent: number): CompressionAction {
    if (contextUsagePercent > SUMMARY_CONFIG.suggestNewSessionThreshold) {
      return {
        type: 'suggest_new_session',
        contextUsagePercent,
        message: '对话已超过上下文容量的 90%，建议归档当前对话并开启新会话以保持最佳响应质量。',
      };
    }

    if (contextUsagePercent > SUMMARY_CONFIG.autoCompressThreshold) {
      return {
        type: 'auto_compress',
        contextUsagePercent,
        message: '对话较长，已自动压缩历史消息以保持响应质量。',
      };
    }

    return {
      type: 'none',
      contextUsagePercent,
    };
  },

  /**
   * S7.4: Trigger context compression for a conversation.
   * Called when context usage exceeds 80%.
   */
  async triggerContextCompression(
    conversationId: string,
    recentMessageCount: number,
    contextUsagePercent: number
  ): Promise<ServiceResult<CompressionAction>> {
    const action = this.getCompressionAction(contextUsagePercent);

    if (action.type === 'none') {
      return { success: true, data: action };
    }

    // For auto_compress: generate summary if not already cached
    if (action.type === 'auto_compress' || action.type === 'suggest_new_session') {
      await this.getOrCreateSummary(conversationId, recentMessageCount);
    }

    return { success: true, data: action };
  },

  /**
   * Clear cached summary for a conversation.
   * Used when the conversation is archived or reset.
   */
  clearSummaryCache(conversationId: string): void {
    summaryCache.delete(conversationId);
  },

  /** Visible for testing */
  _getSummaryCache() {
    return summaryCache;
  },
};
