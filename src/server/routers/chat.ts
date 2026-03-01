/**
 * Chat tRPC Router (S3.2)
 *
 * Provides HTTP endpoints for Web Chat:
 *   - sendMessage: Trigger chat message processing (non-streaming; streaming goes via Socket.io)
 *   - getHistory: Retrieve conversation message history
 *   - getConversationStats: Token usage and context statistics
 *
 * All procedures use protectedProcedure — authentication required.
 * Business logic delegated to chatService / chatObservabilityService.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { chatService, SearchMessagesSchema } from '@/services/chat.service';
import { chatObservabilityService } from '@/services/chat-observability.service';

export const chatRouter = router({
  /**
   * Send a message and trigger LLM processing.
   * The streaming response is delivered via Socket.io CHAT_RESPONSE,
   * not via tRPC (tRPC doesn't natively stream in this project's setup).
   * Returns the persisted user message ID.
   */
  sendMessage: protectedProcedure
    .input(
      z.object({
        content: z.string().min(1).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await chatService.handleMessage(
        ctx.user.userId,
        input.content
      );

      if (!result.success) {
        throw new TRPCError({
          code:
            result.error?.code === 'CONFLICT'
              ? 'CONFLICT'
              : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to process message',
        });
      }

      return result.data;
    }),

  /**
   * Get message history for the user's default conversation.
   */
  getHistory: protectedProcedure
    .input(
      z
        .object({
          conversationId: z.string().optional(),
          limit: z.number().min(1).max(100).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      // Get or create default conversation
      const convResult = await chatService.getOrCreateDefaultConversation(
        ctx.user.userId
      );
      if (!convResult.success || !convResult.data) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get conversation',
        });
      }

      const conversationId = input?.conversationId ?? convResult.data.id;
      const limit = input?.limit ?? 50;

      const result = await chatService.getHistory(
        ctx.user.userId,
        conversationId,
        limit
      );

      if (!result.success) {
        throw new TRPCError({
          code:
            result.error?.code === 'NOT_FOUND'
              ? 'NOT_FOUND'
              : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get history',
        });
      }

      return result.data;
    }),

  /**
   * Get token usage and context statistics for the user's conversation.
   */
  getConversationStats: protectedProcedure
    .input(
      z
        .object({
          conversationId: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      // Get or create default conversation
      const convResult = await chatService.getOrCreateDefaultConversation(
        ctx.user.userId
      );
      if (!convResult.success || !convResult.data) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get conversation',
        });
      }

      const conversationId = input?.conversationId ?? convResult.data.id;

      const result = await chatObservabilityService.getConversationStats(
        ctx.user.userId,
        conversationId
      );

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to get stats',
        });
      }

      return result.data;
    }),

  /**
   * S11.1: Create a TOPIC conversation (cross-day, not archived by daily reset).
   */
  createTopic: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await chatService.createTopicConversation(
        ctx.user.userId,
        input.title
      );

      if (!result.success) {
        throw new TRPCError({
          code:
            result.error?.code === 'VALIDATION_ERROR'
              ? 'BAD_REQUEST'
              : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to create topic',
        });
      }

      return result.data;
    }),

  /**
   * S11.1: List all active TOPIC conversations for the current user.
   */
  listTopics: protectedProcedure.query(async ({ ctx }) => {
    const result = await chatService.listTopicConversations(ctx.user.userId);

    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error?.message ?? 'Failed to list topics',
      });
    }

    return result.data;
  }),

  /**
   * S11.1: Switch to a different conversation (DEFAULT or TOPIC).
   */
  switchConversation: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await chatService.switchConversation(
        ctx.user.userId,
        input.conversationId
      );

      if (!result.success) {
        throw new TRPCError({
          code:
            result.error?.code === 'NOT_FOUND'
              ? 'NOT_FOUND'
              : 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to switch conversation',
        });
      }

      return result.data;
    }),

  /**
   * S11.2: Full-text search across the user's chat messages.
   */
  search: protectedProcedure
    .input(SearchMessagesSchema)
    .query(async ({ ctx, input }) => {
      const result = await chatService.searchMessages(
        ctx.user.userId,
        input
      );

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error?.message ?? 'Failed to search messages',
        });
      }

      return result.data;
    }),
});
