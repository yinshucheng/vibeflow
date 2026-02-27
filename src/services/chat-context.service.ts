/**
 * Chat Context Service (F6)
 *
 * Builds System Prompt and LLM message arrays for AI chat.
 *
 * F6.1 buildSystemPrompt — static template + dynamic context via contextProviderService
 * F6.2 buildLLMMessages  — sliding window (N=20), skip role='system', token trimming
 */

import prisma from '@/lib/prisma';
import { contextProviderService } from '@/services/context-provider.service';
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

// ===== Constants =====

export const CONTEXT_WINDOW = {
  recentMessageCount: 20,
  recentMessageMaxTokens: 8000,
};

// Rough token estimation: ~4 chars per token for mixed CJK/Latin text
const CHARS_PER_TOKEN = 4;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// ===== Static template =====

const SYSTEM_PROMPT_TEMPLATE = `# VibeFlow AI 助手

你是 VibeFlow 的 AI 助手，帮助用户管理任务、规划每日工作、控制番茄钟。

## 行为准则
- 修改数据前用中文简洁描述你将要做什么
- 批量修改前列出变更清单
- 在 FOCUS 状态下，优先引导用户专注当前任务
- 在 PLANNING 状态下，主动帮助用户规划
- 回复简洁，避免冗余`;

// ===== Service =====

export const chatContextService = {
  /**
   * F6.1: Build the system prompt for an LLM call.
   *
   * Combines a static role/behaviour template with dynamic user context
   * (current state, active pomodoro, Top 3, progress) from contextProviderService.
   */
  async buildSystemPrompt(userId: string): Promise<ServiceResult<string>> {
    try {
      const ctxResult = await contextProviderService.getFullContext(userId);

      if (!ctxResult.success || !ctxResult.data) {
        // Fallback: return the static template without dynamic context
        return { success: true, data: SYSTEM_PROMPT_TEMPLATE };
      }

      const dynamicMarkdown = contextProviderService.serializeToMarkdown(ctxResult.data);

      const prompt = `${SYSTEM_PROMPT_TEMPLATE}

## 当前上下文
${dynamicMarkdown}`;

      return { success: true, data: prompt };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: `Failed to build system prompt: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  },

  /**
   * F6.2: Build the LLM message array for a conversation turn.
   *
   * 1. Fetch the most recent N=20 messages from DB
   * 2. Skip role='system' (date separator lines — not for LLM)
   * 3. Append the new user message
   * 4. Trim from the earliest messages if total tokens exceed budget
   */
  async buildLLMMessages(
    userId: string,
    conversationId: string,
    newMessage: string
  ): Promise<ServiceResult<ModelMessage[]>> {
    try {
      // Verify ownership
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, userId },
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

      // 1. Fetch recent N messages (ordered newest first, then reverse)
      const recentMessages = await prisma.chatMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: CONTEXT_WINDOW.recentMessageCount,
      });
      recentMessages.reverse();

      // 2. Convert to LLM format, skipping role='system'
      const messages: ModelMessage[] = [];
      for (const msg of recentMessages) {
        if (msg.role === 'system') continue;
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }

      // 3. Append new user message
      messages.push({ role: 'user', content: newMessage });

      // 4. Token trimming — remove earliest messages first until within budget
      const trimmed = this.trimToTokenBudget(messages, CONTEXT_WINDOW.recentMessageMaxTokens);

      return { success: true, data: trimmed };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: `Failed to build LLM messages: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  },

  /**
   * Trim messages to fit within a token budget.
   * Removes from the *beginning* (oldest) while keeping the last message
   * (the new user message) intact.
   */
  trimToTokenBudget(messages: ModelMessage[], maxTokens: number): ModelMessage[] {
    if (messages.length === 0) return messages;

    let totalTokens = 0;
    for (const m of messages) {
      totalTokens += estimateTokens(typeof m.content === 'string' ? m.content : JSON.stringify(m.content));
    }

    if (totalTokens <= maxTokens) return messages;

    // Remove from the beginning, always keep the last message (new user message)
    const result = [...messages];
    while (result.length > 1 && totalTokens > maxTokens) {
      const removed = result.shift()!;
      totalTokens -= estimateTokens(typeof removed.content === 'string' ? removed.content : JSON.stringify(removed.content));
    }

    return result;
  },
};

// Re-export helpers for testing
export { estimateTokens, SYSTEM_PROMPT_TEMPLATE, CHARS_PER_TOKEN };
