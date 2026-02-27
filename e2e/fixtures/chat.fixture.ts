import { PrismaClient, Conversation, ChatMessage } from '@prisma/client';
import { TestDataTracker } from './database.fixture';

/**
 * Chat fixture for E2E tests
 * Provides helpers to seed conversations and messages for test isolation
 */

export class ChatTestHelper {
  private prisma: PrismaClient;
  private tracker: TestDataTracker;

  constructor(prisma: PrismaClient, tracker: TestDataTracker) {
    this.prisma = prisma;
    this.tracker = tracker;
  }

  /**
   * Create a test conversation with optional messages, registered to Tracker for cleanup
   */
  async seedConversation(
    userId: string,
    messageCount: number = 0,
    options?: { title?: string; type?: 'DEFAULT' | 'DAILY' | 'TOPIC' }
  ): Promise<Conversation & { messages: ChatMessage[] }> {
    const conv = await this.prisma.conversation.create({
      data: {
        userId,
        type: options?.type ?? 'DEFAULT',
        title: options?.title ?? 'Test Conversation',
      },
    });
    this.tracker.trackConversation(conv.id);

    const messages: ChatMessage[] = [];
    for (let i = 0; i < messageCount; i++) {
      const msg = await this.prisma.chatMessage.create({
        data: {
          conversationId: conv.id,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Test message ${i}`,
        },
      });
      this.tracker.trackChatMessage(msg.id);
      messages.push(msg);
    }

    return { ...conv, messages };
  }

  /**
   * Create an LLMUsageLog entry, registered to Tracker for cleanup
   */
  async seedUsageLog(
    userId: string,
    conversationId: string,
    options?: {
      model?: string;
      scene?: string;
      inputTokens?: number;
      outputTokens?: number;
    }
  ) {
    const inputTokens = options?.inputTokens ?? 100;
    const outputTokens = options?.outputTokens ?? 50;
    const totalTokens = inputTokens + outputTokens;
    const maxContextLimit = 131072;

    const log = await this.prisma.lLMUsageLog.create({
      data: {
        userId,
        conversationId,
        scene: options?.scene ?? 'chat:default',
        model: options?.model ?? 'qwen-plus',
        inputTokens,
        outputTokens,
        totalTokens,
        contextLength: inputTokens,
        maxContextLimit,
        contextUsagePercent: (inputTokens / maxContextLimit) * 100,
      },
    });
    this.tracker.trackLLMUsageLog(log.id);
    return log;
  }
}
