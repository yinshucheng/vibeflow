/**
 * Chat Archive Service (S8)
 *
 * S8.1 Daily Archive: At 04:00 AM, archive current DEFAULT conversation
 *      → type=DAILY, status=ARCHIVED, date=yesterday. Create a new DEFAULT.
 *      Insert a day-divider system message in the new conversation.
 *
 * S8.2 History: List archived conversations and view messages (read-only).
 *
 * S8.3 Cleanup: Delete messages older than 30 days from archived conversations.
 */

import { prisma } from '@/lib/prisma';
import { chatService } from './chat.service';
import type { Conversation, ChatMessage } from '@prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAILY_RESET_HOUR = 4;

/** Returns the "logical" yesterday date string (YYYY-MM-DD), accounting for 4 AM boundary. */
function getYesterdayDateString(now?: Date): string {
  const d = new Date(now ?? Date.now());
  // If before 4 AM, "today" is still yesterday; so yesterday is two days back.
  if (d.getHours() < DAILY_RESET_HOUR) {
    d.setDate(d.getDate() - 2);
  } else {
    d.setDate(d.getDate() - 1);
  }
  return d.toISOString().split('T')[0];
}

/** Returns today's logical date string accounting for the 4 AM boundary. */
function getTodayDateString(now?: Date): string {
  const d = new Date(now ?? Date.now());
  if (d.getHours() < DAILY_RESET_HOUR) {
    d.setDate(d.getDate() - 1);
  }
  return d.toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const chatArchiveService = {
  /**
   * S8.1 — Archive the current DEFAULT conversation and create a new one.
   * Called during the 04:00 AM daily reset for each active user.
   */
  async archiveAndRotate(userId: string): Promise<ServiceResult<{ archivedId: string; newId: string }>> {
    try {
      const convResult = await chatService.getOrCreateDefaultConversation(userId);
      if (!convResult.success || !convResult.data) {
        return { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get current conversation' } };
      }

      const current = convResult.data;
      const yesterdayDate = getYesterdayDateString();

      // Archive the current DEFAULT conversation
      await prisma.conversation.update({
        where: { id: current.id },
        data: {
          type: 'DAILY',
          status: 'ARCHIVED',
          date: yesterdayDate,
          title: `对话记录 ${yesterdayDate}`,
        },
      });

      // Create a new DEFAULT conversation
      const newConv = await prisma.conversation.create({
        data: {
          userId,
          type: 'DEFAULT',
          status: 'ACTIVE',
          title: 'VibeFlow Assistant',
        },
      });

      // Insert a day-divider system message in the new conversation
      const todayDate = getTodayDateString();
      await prisma.chatMessage.create({
        data: {
          conversationId: newConv.id,
          role: 'system',
          content: JSON.stringify({ type: 'day_divider', date: todayDate }),
        },
      });

      return {
        success: true,
        data: { archivedId: current.id, newId: newConv.id },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: `archiveAndRotate failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  },

  /**
   * S8.1 — Run daily archive for all users with active DEFAULT conversations.
   * Called from dailyResetSchedulerService at 04:00 AM.
   */
  async runDailyArchive(): Promise<ServiceResult<{ archivedCount: number }>> {
    try {
      // Find all active DEFAULT conversations (each user has at most one)
      const activeDefaults = await prisma.conversation.findMany({
        where: { type: 'DEFAULT', status: 'ACTIVE' },
        select: { userId: true },
      });

      let archivedCount = 0;
      for (const { userId } of activeDefaults) {
        const result = await this.archiveAndRotate(userId);
        if (result.success) archivedCount++;
      }

      return { success: true, data: { archivedCount } };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: `runDailyArchive failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  },

  /**
   * S8.2 — List archived conversations for a user, ordered by date descending.
   */
  async getArchivedConversations(
    userId: string,
    limit: number = 30,
  ): Promise<ServiceResult<Conversation[]>> {
    try {
      const conversations = await prisma.conversation.findMany({
        where: { userId, status: 'ARCHIVED' },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      });
      return { success: true, data: conversations };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: `getArchivedConversations failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  },

  /**
   * S8.2 — Get messages for an archived conversation (read-only).
   * Reuses chatService.getHistory with ownership check.
   */
  async getArchivedMessages(
    userId: string,
    conversationId: string,
    limit: number = 200,
  ): Promise<ServiceResult<ChatMessage[]>> {
    return chatService.getHistory(userId, conversationId, limit);
  },

  /**
   * S8.3 — Delete messages older than `days` from ARCHIVED conversations.
   * Returns the count of deleted messages.
   */
  async cleanupOldMessages(days: number = 30): Promise<ServiceResult<{ deletedCount: number }>> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const result = await prisma.chatMessage.deleteMany({
        where: {
          createdAt: { lt: cutoff },
          conversation: { status: 'ARCHIVED' },
        },
      });

      return { success: true, data: { deletedCount: result.count } };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: `cleanupOldMessages failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  },
};

// Export helpers for testing
export { getYesterdayDateString, getTodayDateString };
export default chatArchiveService;
