import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { llmAdapterService } from '@/services/llm-adapter.service';
import type { Conversation, ChatMessage } from '@prisma/client';
import type { ModelMessage } from 'ai';

// ===== Types =====

interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

type OnDeltaCallback = (delta: string) => void;

interface HandleMessageResult {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  fullText: string;
}

// ===== Search Types =====

export const SearchMessagesSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
  conversationId: z.string().uuid().optional(),
  dateRange: z
    .object({
      from: z.coerce.date(),
      to: z.coerce.date(),
    })
    .optional(),
});

type SearchMessagesInput = z.infer<typeof SearchMessagesSchema>;

interface SearchMessagesResult {
  messages: (ChatMessage & { conversationTitle: string | null })[];
  total: number;
}

// ===== Conversation Locks =====
// In-memory mutex per conversationId to prevent concurrent LLM calls
// that would corrupt context ordering.
const conversationLocks = new Map<string, Promise<void>>();

async function acquireLock(conversationId: string): Promise<() => void> {
  // Wait for any existing lock on this conversation
  while (conversationLocks.has(conversationId)) {
    await conversationLocks.get(conversationId);
  }

  // Set the lock
  let releaseLock!: () => void;
  conversationLocks.set(
    conversationId,
    new Promise<void>((resolve) => {
      releaseLock = resolve;
    })
  );

  return () => {
    conversationLocks.delete(conversationId);
    releaseLock();
  };
}

// ===== Chat Service =====

export const chatService = {
  /**
   * F3.1: Get or create the user's single active DEFAULT conversation.
   * Each user has exactly one ACTIVE DEFAULT conversation at a time.
   */
  async getOrCreateDefaultConversation(
    userId: string
  ): Promise<ServiceResult<Conversation>> {
    try {
      // Look for existing active default conversation
      const existing = await prisma.conversation.findFirst({
        where: {
          userId,
          type: 'DEFAULT',
          status: 'ACTIVE',
        },
      });

      if (existing) {
        return { success: true, data: existing };
      }

      // Create a new one
      const conversation = await prisma.conversation.create({
        data: {
          userId,
          type: 'DEFAULT',
          status: 'ACTIVE',
          title: 'VibeFlow Assistant',
        },
      });

      return { success: true, data: conversation };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: `Failed to get or create default conversation: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  },

  /**
   * F3.1: Persist a message to the database.
   */
  async persistMessage(
    conversationId: string,
    role: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<ServiceResult<ChatMessage>> {
    try {
      const message = await prisma.chatMessage.create({
        data: {
          conversationId,
          role,
          content,
          metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });

      // Touch conversation updatedAt
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      return { success: true, data: message };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: `Failed to persist message: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  },

  /**
   * F3.1: Get conversation history with userId ownership verification.
   */
  async getHistory(
    userId: string,
    conversationId: string,
    limit: number = 50
  ): Promise<ServiceResult<ChatMessage[]>> {
    try {
      // Verify ownership
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          userId,
        },
      });

      if (!conversation) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Conversation not found or access denied',
          },
        };
      }

      const messages = await prisma.chatMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });

      return { success: true, data: messages };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: `Failed to get history: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  },

  /**
   * S11.1: Create a TOPIC conversation (cross-day, not archived by daily reset).
   */
  async createTopicConversation(
    userId: string,
    title: string
  ): Promise<ServiceResult<Conversation>> {
    try {
      if (!title || title.trim().length === 0) {
        return {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Title is required' },
        };
      }

      const conversation = await prisma.conversation.create({
        data: {
          userId,
          type: 'TOPIC',
          status: 'ACTIVE',
          title: title.trim(),
        },
      });

      return { success: true, data: conversation };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: `Failed to create topic conversation: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  },

  /**
   * S11.1: List all TOPIC conversations for a user.
   */
  async listTopicConversations(
    userId: string
  ): Promise<ServiceResult<Conversation[]>> {
    try {
      const conversations = await prisma.conversation.findMany({
        where: {
          userId,
          type: 'TOPIC',
          status: 'ACTIVE',
        },
        orderBy: { updatedAt: 'desc' },
      });

      return { success: true, data: conversations };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: `Failed to list topic conversations: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  },

  /**
   * S11.1: Switch active conversation for a user.
   * Verifies userId ownership before allowing the switch.
   * Returns the target conversation.
   */
  async switchConversation(
    userId: string,
    conversationId: string
  ): Promise<ServiceResult<Conversation>> {
    try {
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          userId,
          status: 'ACTIVE',
        },
      });

      if (!conversation) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Conversation not found or access denied',
          },
        };
      }

      return { success: true, data: conversation };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: `Failed to switch conversation: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  },

  /**
   * S11.2: Full-text search across user's chat messages.
   * Supports filtering by conversationId and dateRange.
   * Verifies userId ownership via conversation join.
   */
  async searchMessages(
    userId: string,
    input: SearchMessagesInput
  ): Promise<ServiceResult<SearchMessagesResult>> {
    try {
      const { query, limit, offset, conversationId, dateRange } = input;

      // Build the where clause — always filter by userId via conversation relation
      const where: Prisma.ChatMessageWhereInput = {
        content: { contains: query, mode: 'insensitive' as Prisma.QueryMode },
        conversation: {
          userId,
          ...(conversationId ? { id: conversationId } : {}),
        },
        ...(dateRange
          ? {
              createdAt: {
                gte: dateRange.from,
                lte: dateRange.to,
              },
            }
          : {}),
      };

      // Execute count and search in parallel
      const [total, messages] = await Promise.all([
        prisma.chatMessage.count({ where }),
        prisma.chatMessage.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,
          include: {
            conversation: {
              select: { title: true },
            },
          },
        }),
      ]);

      // Flatten the conversation title into the result
      const result = messages.map((msg) => ({
        ...msg,
        conversationTitle: msg.conversation.title,
        conversation: undefined as never,
      }));

      return {
        success: true,
        data: { messages: result, total },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: `Failed to search messages: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  },

  /**
   * F3.2: Main message handling flow.
   *
   * 1. Get/create conversation
   * 2. Acquire conversation lock (prevents concurrent LLM calls)
   * 3. Build LLM messages from history
   * 4. Call LLM (streaming)
   * 5. Persist user message + AI reply
   * 6. Record token usage
   */
  async handleMessage(
    userId: string,
    content: string,
    onDelta?: OnDeltaCallback
  ): Promise<ServiceResult<HandleMessageResult>> {
    // 1. Get or create conversation
    const convResult = await chatService.getOrCreateDefaultConversation(userId);
    if (!convResult.success || !convResult.data) {
      return {
        success: false,
        error: convResult.error ?? {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get conversation',
        },
      };
    }

    const conversation = convResult.data;
    const release = await acquireLock(conversation.id);

    try {
      // 3. Build LLM messages from recent history
      const historyResult = await chatService.getHistory(
        userId,
        conversation.id,
        20
      );
      const historyMessages = historyResult.success && historyResult.data
        ? historyResult.data
        : [];

      const llmMessages: ModelMessage[] = [
        // Convert history to LLM format
        ...historyMessages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
        // Add the new user message
        { role: 'user' as const, content },
      ];

      // 4. Persist user message
      const userMsgResult = await chatService.persistMessage(
        conversation.id,
        'user',
        content
      );
      if (!userMsgResult.success || !userMsgResult.data) {
        return {
          success: false,
          error: userMsgResult.error ?? {
            code: 'INTERNAL_ERROR',
            message: 'Failed to persist user message',
          },
        };
      }

      // 5. Call LLM (streaming)
      let fullText = '';
      let tokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

      const result = await llmAdapterService.callLLM({
        scene: 'chat:default',
        messages: llmMessages,
        onFinish: (finishResult) => {
          fullText = finishResult.text;
          tokenUsage = finishResult.usage;
        },
      });

      // Consume the text stream to drive onDelta callbacks
      for await (const chunk of result.textStream) {
        if (onDelta) {
          onDelta(chunk);
        }
        // fullText is set via onFinish, but accumulate here as fallback
        if (!fullText) {
          fullText += chunk;
        }
      }

      // Ensure fullText from onFinish or fallback
      if (!fullText) {
        fullText = await result.text;
      }

      // 6. Persist AI reply
      const assistantMsgResult = await chatService.persistMessage(
        conversation.id,
        'assistant',
        fullText
      );
      if (!assistantMsgResult.success || !assistantMsgResult.data) {
        return {
          success: false,
          error: assistantMsgResult.error ?? {
            code: 'INTERNAL_ERROR',
            message: 'Failed to persist assistant message',
          },
        };
      }

      // 7. Record token usage
      try {
        await prisma.lLMUsageLog.create({
          data: {
            userId,
            conversationId: conversation.id,
            messageId: assistantMsgResult.data.id,
            scene: 'chat:default',
            model: 'qwen-plus', // default scene model
            inputTokens: tokenUsage.inputTokens,
            outputTokens: tokenUsage.outputTokens,
            totalTokens: tokenUsage.totalTokens,
            contextLength: tokenUsage.inputTokens,
            maxContextLimit: 131072, // qwen-plus context window
            contextUsagePercent:
              (tokenUsage.inputTokens / 131072) * 100,
          },
        });
      } catch {
        // Token tracking failure should not break the chat flow
        console.warn('[chat.service] Failed to record token usage');
      }

      return {
        success: true,
        data: {
          conversationId: conversation.id,
          userMessageId: userMsgResult.data.id,
          assistantMessageId: assistantMsgResult.data.id,
          fullText,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: `handleMessage failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    } finally {
      release();
    }
  },
};

// Export for testing
export { conversationLocks, acquireLock };
export type { HandleMessageResult, OnDeltaCallback, SearchMessagesInput, SearchMessagesResult };
