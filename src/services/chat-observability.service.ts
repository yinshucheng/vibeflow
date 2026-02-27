/**
 * F7 Chat Observability Service
 *
 * - trackUsage: record LLM token usage per call (F7.1)
 * - getConversationStats: aggregated token stats for a conversation (F7.2)
 */
import { prisma } from '@/lib/prisma';
import { MODEL_META, type ModelId } from '@/config/llm.config';

// Re-use project-wide ServiceResult
interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

// ===== Input types =====

interface TrackUsageInput {
  userId: string;
  conversationId: string;
  messageId: string | null;
  scene: string;
  modelId: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
}

// ===== Output types =====

interface ConversationTokenStats {
  conversationId: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  latestContextUsagePercent: number;
  messageCount: number;
  currentModel: {
    id: string;
    contextWindow: number;
    displayName: string;
  };
}

// ===== Service =====

export const chatObservabilityService = {
  /**
   * F7.1 – Record token usage for one LLM call.
   * Called from onFinish callback.
   */
  async trackUsage(input: TrackUsageInput): Promise<ServiceResult<{ id: string }>> {
    try {
      const { userId, conversationId, messageId, scene, modelId, usage } = input;

      const meta = MODEL_META[modelId as ModelId];
      if (!meta) {
        return {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: `Unknown modelId: ${modelId}` },
        };
      }

      const inputTokens = usage.promptTokens;
      const outputTokens = usage.completionTokens;
      const totalTokens = inputTokens + outputTokens;
      const contextLength = inputTokens; // prompt tokens ≈ context length
      const maxContextLimit = meta.contextWindow;
      const contextUsagePercent = maxContextLimit > 0
        ? (contextLength / maxContextLimit) * 100
        : 0;

      const log = await prisma.lLMUsageLog.create({
        data: {
          userId,
          conversationId,
          messageId,
          scene,
          model: modelId,
          inputTokens,
          outputTokens,
          totalTokens,
          contextLength,
          maxContextLimit,
          contextUsagePercent,
        },
      });

      return { success: true, data: { id: log.id } };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: msg },
      };
    }
  },

  /**
   * F7.2 – Aggregated token stats for a conversation.
   * Verifies userId ownership.
   */
  async getConversationStats(
    userId: string,
    conversationId: string,
  ): Promise<ServiceResult<ConversationTokenStats>> {
    try {
      // Ownership check
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, userId },
      });
      if (!conversation) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Conversation not found or access denied' },
        };
      }

      const [aggregate, latestLog, messageCount] = await Promise.all([
        prisma.lLMUsageLog.aggregate({
          where: { conversationId, userId },
          _sum: { inputTokens: true, outputTokens: true, totalTokens: true },
        }),
        prisma.lLMUsageLog.findFirst({
          where: { conversationId, userId },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.chatMessage.count({
          where: { conversationId, conversation: { userId } },
        }),
      ]);

      // Fallback model when no logs exist yet
      const fallbackModelId: ModelId = 'qwen-plus';
      const modelId = (latestLog?.model ?? fallbackModelId) as ModelId;
      const modelMeta = MODEL_META[modelId] ?? MODEL_META[fallbackModelId];

      return {
        success: true,
        data: {
          conversationId,
          totalInputTokens: aggregate._sum.inputTokens ?? 0,
          totalOutputTokens: aggregate._sum.outputTokens ?? 0,
          totalTokens: aggregate._sum.totalTokens ?? 0,
          latestContextUsagePercent: latestLog?.contextUsagePercent ?? 0,
          messageCount,
          currentModel: {
            id: modelId,
            contextWindow: modelMeta.contextWindow,
            displayName: modelMeta.displayName,
          },
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: msg },
      };
    }
  },
};

export type { TrackUsageInput, ConversationTokenStats };
