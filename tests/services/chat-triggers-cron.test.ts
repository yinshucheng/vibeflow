/**
 * Chat Cron Trigger Tests (S9.5)
 *
 * Tests for:
 * - morning_greeting: IDLE + weekday 9:00 → trigger
 * - morning_greeting: user already in non-IDLE state → don't trigger
 * - morning_greeting: weekend → don't trigger
 * - evening_summary: end-of-day time → trigger + message includes stats
 * - progress_check: FOCUS state → don't interrupt (shouldFire returns false)
 * - midday_check: disabled by default → don't trigger
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------- Prisma mock ----------

const mockPrismaClient = vi.hoisted(() => ({
  user: { findUnique: vi.fn().mockResolvedValue(null) },
  userSettings: { findUnique: vi.fn().mockResolvedValue(null) },
  task: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
  pomodoro: { count: vi.fn().mockResolvedValue(0) },
  conversation: {
    findFirst: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
  },
  chatMessage: { create: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrismaClient,
  prisma: mockPrismaClient,
}));

// ---------- Mock daily state ----------

const mockGetCurrentState = vi.hoisted(() => vi.fn());

vi.mock('@/services/daily-state.service', () => ({
  dailyStateService: {
    getCurrentState: mockGetCurrentState,
  },
}));

// ---------- Mock chat service ----------

vi.mock('@/services/chat.service', () => ({
  chatService: {
    getOrCreateDefaultConversation: vi.fn().mockResolvedValue({
      success: true,
      data: { id: 'conv-cron-001' },
    }),
    persistMessage: vi.fn().mockResolvedValue({
      success: true,
      data: { id: 'msg-cron-001' },
    }),
  },
}));

// ---------- Mock chat context service ----------

vi.mock('@/services/chat-context.service', () => ({
  chatContextService: {
    buildSystemPrompt: vi.fn().mockResolvedValue({
      success: true,
      data: 'System prompt',
    }),
  },
}));

// ---------- Mock LLM adapter ----------

vi.mock('@/services/llm-adapter.service', () => ({
  llmAdapterService: {
    callGenerateText: vi.fn().mockResolvedValue({
      text: '今天的工作总结：完成了 3 个番茄钟，做了 2 个任务。明天继续加油！',
    }),
  },
}));

// ---------- Mock audit service ----------

vi.mock('@/services/mcp-audit.service', () => ({
  mcpAuditService: {
    logToolCall: vi.fn().mockResolvedValue({ success: true }),
  },
}));

import { chatTriggersCronService } from '@/services/chat-triggers-cron.service';
import { aiTriggerService, registerProactiveBroadcaster } from '@/services/ai-trigger.service';
import { chatService } from '@/services/chat.service';
import { llmAdapterService } from '@/services/llm-adapter.service';

const TEST_USER = 'test-user-cron-001';

describe('Chat Cron Triggers (S9)', () => {
  let broadcastedCommands: Array<{ userId: string; command: unknown }>;

  beforeEach(() => {
    vi.clearAllMocks();
    aiTriggerService._clearCooldowns();
    aiTriggerService._triggers.clear();
    aiTriggerService.init();
    chatTriggersCronService.init();

    broadcastedCommands = [];
    registerProactiveBroadcaster((userId, command) => {
      broadcastedCommands.push({ userId, command });
    });

    // Default: user in IDLE state (for morning_greeting)
    mockGetCurrentState.mockResolvedValue({ success: true, data: 'idle' });

    // Default: no quiet hours (avoids time-of-day dependency in tests)
    mockPrismaClient.userSettings.findUnique.mockResolvedValue({
      aiTriggerConfig: {
        enabled: true,
        quietHours: null,
        triggers: {},
      },
    });
  });

  // =====================================================================
  // S9.1 morning_greeting
  // =====================================================================

  describe('morning_greeting (S9.1)', () => {
    it('should fire when user is IDLE on a weekday morning', async () => {
      mockGetCurrentState.mockResolvedValue({ success: true, data: 'idle' });

      await chatTriggersCronService.handleMorningGreeting(TEST_USER);

      expect(chatService.persistMessage).toHaveBeenCalled();
      expect(broadcastedCommands).toHaveLength(1);

      const payload = (broadcastedCommands[0].command as Record<string, unknown>).payload as Record<string, unknown>;
      expect(payload.isProactive).toBe(true);
      expect(payload.triggerId).toBe('morning_greeting');
    });

    it('should NOT fire when user is already in PLANNING', async () => {
      mockGetCurrentState.mockResolvedValue({ success: true, data: 'planning' });

      await chatTriggersCronService.handleMorningGreeting(TEST_USER);

      expect(chatService.persistMessage).not.toHaveBeenCalled();
      expect(broadcastedCommands).toHaveLength(0);
    });

    it('should NOT fire when user is in FOCUS', async () => {
      mockGetCurrentState.mockResolvedValue({ success: true, data: 'focus' });

      await chatTriggersCronService.handleMorningGreeting(TEST_USER);

      expect(chatService.persistMessage).not.toHaveBeenCalled();
    });

    it('should include task counts in the message', async () => {
      mockGetCurrentState.mockResolvedValue({ success: true, data: 'idle' });
      mockPrismaClient.task.findMany
        .mockResolvedValueOnce([{ id: 't1' }, { id: 't2' }, { id: 't3' }]) // today tasks
        .mockResolvedValueOnce([{ id: 'ot1' }]); // overdue tasks

      await chatTriggersCronService.handleMorningGreeting(TEST_USER);

      expect(chatService.persistMessage).toHaveBeenCalled();
      const content = vi.mocked(chatService.persistMessage).mock.calls[0][2];
      expect(content).toContain('3');
    });

    it('should respect cooldown (once per day)', async () => {
      mockGetCurrentState.mockResolvedValue({ success: true, data: 'idle' });

      await chatTriggersCronService.handleMorningGreeting(TEST_USER);
      expect(broadcastedCommands).toHaveLength(1);

      // Second call should be blocked by cooldown
      await chatTriggersCronService.handleMorningGreeting(TEST_USER);
      expect(broadcastedCommands).toHaveLength(1); // still 1
    });
  });

  // =====================================================================
  // S9.2 evening_summary
  // =====================================================================

  describe('evening_summary (S9.2)', () => {
    it('should fire and use LLM to generate summary', async () => {
      // evening_summary is normal priority, so we need non-focus state
      mockGetCurrentState.mockResolvedValue({ success: true, data: 'rest' });

      await chatTriggersCronService.handleEveningSummary(TEST_USER);

      expect(llmAdapterService.callGenerateText).toHaveBeenCalled();
      expect(chatService.persistMessage).toHaveBeenCalled();
      expect(broadcastedCommands).toHaveLength(1);
    });

    it('should include today completion stats in context', async () => {
      mockGetCurrentState.mockResolvedValue({ success: true, data: 'rest' });
      mockPrismaClient.pomodoro.count.mockResolvedValueOnce(5);
      mockPrismaClient.task.count
        .mockResolvedValueOnce(3)  // completed tasks
        .mockResolvedValueOnce(2); // remaining tasks

      await chatTriggersCronService.handleEveningSummary(TEST_USER);

      expect(llmAdapterService.callGenerateText).toHaveBeenCalled();
      // The LLM should receive context with stats
      const callArgs = vi.mocked(llmAdapterService.callGenerateText).mock.calls[0][0];
      expect(callArgs.messages[0].content).toContain('5'); // completed pomodoros
    });
  });

  // =====================================================================
  // S9.3 progress_check
  // =====================================================================

  describe('progress_check (S9.3)', () => {
    it('should NOT fire when user is in FOCUS state (low priority)', async () => {
      mockGetCurrentState.mockResolvedValue({ success: true, data: 'focus' });

      // Enable progress_check (disabled by default)
      aiTriggerService._triggers.get('progress_check')!.defaultEnabled = true;

      await chatTriggersCronService.handleProgressCheck(TEST_USER);

      // Should NOT fire — FOCUS protection for low priority
      expect(chatService.persistMessage).not.toHaveBeenCalled();
    });

    it('should fire when user is in PLANNING state and trigger is enabled via user config', async () => {
      mockGetCurrentState.mockResolvedValue({ success: true, data: 'planning' });

      // Enable progress_check via user config (overrides default disabled)
      mockPrismaClient.userSettings.findUnique.mockResolvedValue({
        aiTriggerConfig: {
          enabled: true,
          quietHours: null,
          triggers: { progress_check: { enabled: true } },
        },
      });

      await chatTriggersCronService.handleProgressCheck(TEST_USER);

      expect(chatService.persistMessage).toHaveBeenCalled();
      expect(broadcastedCommands).toHaveLength(1);
    });
  });

  // =====================================================================
  // S9.4 midday_check
  // =====================================================================

  describe('midday_check (S9.4)', () => {
    it('should NOT fire by default (disabled)', async () => {
      mockGetCurrentState.mockResolvedValue({ success: true, data: 'rest' });

      await chatTriggersCronService.handleMiddayCheck(TEST_USER);

      // midday_check has defaultEnabled=false → shouldFire returns false
      expect(chatService.persistMessage).not.toHaveBeenCalled();
      expect(broadcastedCommands).toHaveLength(0);
    });

    it('should fire when explicitly enabled via user config', async () => {
      mockGetCurrentState.mockResolvedValue({ success: true, data: 'rest' });

      // Enable midday_check via user config (overrides default disabled)
      mockPrismaClient.userSettings.findUnique.mockResolvedValue({
        aiTriggerConfig: {
          enabled: true,
          quietHours: null,
          triggers: { midday_check: { enabled: true } },
        },
      });

      await chatTriggersCronService.handleMiddayCheck(TEST_USER);

      expect(llmAdapterService.callGenerateText).toHaveBeenCalled();
      expect(chatService.persistMessage).toHaveBeenCalled();
    });
  });

  // =====================================================================
  // Trigger registration
  // =====================================================================

  describe('trigger registration', () => {
    it('should register all 4 cron triggers', () => {
      const triggers = aiTriggerService.getAllTriggers();
      const cronTriggers = triggers.filter((t) => t.sourceType === 'cron');
      expect(cronTriggers).toHaveLength(4);

      const ids = cronTriggers.map((t) => t.id);
      expect(ids).toContain('morning_greeting');
      expect(ids).toContain('evening_summary');
      expect(ids).toContain('progress_check');
      expect(ids).toContain('midday_check');
    });

    it('morning_greeting should be non-LLM (template)', () => {
      const trigger = aiTriggerService.getTrigger('morning_greeting');
      expect(trigger?.useLLM).toBe(false);
    });

    it('evening_summary should use LLM', () => {
      const trigger = aiTriggerService.getTrigger('evening_summary');
      expect(trigger?.useLLM).toBe(true);
    });

    it('progress_check should be low priority', () => {
      const trigger = aiTriggerService.getTrigger('progress_check');
      expect(trigger?.priority).toBe('low');
    });
  });
});
