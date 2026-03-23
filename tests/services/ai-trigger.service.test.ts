/**
 * AI Trigger Service Tests (S4.4)
 *
 * Tests for shouldFire() condition combinations and fire() push + audit.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock prisma before imports — must use vi.hoisted for mock factory references
const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn().mockResolvedValue(null) },
  userSettings: { findUnique: vi.fn().mockResolvedValue(null) },
  task: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
  pomodoro: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
  dailyState: { findFirst: vi.fn().mockResolvedValue(null) },
  chatMessage: { create: vi.fn() },
  conversation: { findFirst: vi.fn(), create: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
}));

// Mock state engine service
vi.mock('@/services/state-engine.service', () => ({
  stateEngineService: {
    getState: vi.fn().mockResolvedValue('planning'),
  },
}));

// Mock chat service
vi.mock('@/services/chat.service', () => ({
  chatService: {
    getOrCreateDefaultConversation: vi.fn().mockResolvedValue({
      success: true,
      data: { id: 'conv-001' },
    }),
    persistMessage: vi.fn().mockResolvedValue({
      success: true,
      data: { id: 'msg-001' },
    }),
  },
}));

// Mock chat context service
vi.mock('@/services/chat-context.service', () => ({
  chatContextService: {
    buildSystemPrompt: vi.fn().mockResolvedValue({
      success: true,
      data: 'System prompt',
    }),
  },
}));

// Mock LLM adapter
vi.mock('@/services/llm-adapter.service', () => ({
  llmAdapterService: {
    callGenerateText: vi.fn().mockResolvedValue({
      text: 'AI generated proactive message',
    }),
  },
}));

// Mock audit service
vi.mock('@/services/mcp-audit.service', () => ({
  mcpAuditService: {
    logToolCall: vi.fn().mockResolvedValue({ success: true }),
  },
}));

import {
  aiTriggerService,
  registerProactiveBroadcaster,
  DEFAULT_AI_TRIGGER_CONFIG,
  BUILTIN_TRIGGERS,
  getEscalationLevel,
  getEscalationTemplate,
} from '@/services/ai-trigger.service';
import type { TriggerDefinition } from '@/services/ai-trigger.service';
import { stateEngineService } from '@/services/state-engine.service';
import { chatService } from '@/services/chat.service';
import { llmAdapterService } from '@/services/llm-adapter.service';
import { mcpAuditService } from '@/services/mcp-audit.service';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_USER_ID = 'test-user-001';

const testTrigger: TriggerDefinition = {
  id: 'test_trigger',
  sourceType: 'state_transition',
  promptTemplate: 'Hello {{name}}, welcome!',
  useLLM: false,
  cooldownSeconds: 60,
  userConfigurable: true,
  defaultEnabled: true,
  priority: 'normal',
};

const highPriorityTrigger: TriggerDefinition = {
  ...testTrigger,
  id: 'high_priority_trigger',
  priority: 'high',
};

const lowPriorityTrigger: TriggerDefinition = {
  ...testTrigger,
  id: 'low_priority_trigger',
  priority: 'low',
};

const llmTrigger: TriggerDefinition = {
  ...testTrigger,
  id: 'llm_trigger',
  useLLM: true,
  scene: 'trigger:on_rest_enter',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('aiTriggerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    aiTriggerService._clearCooldowns();
    // Re-init to ensure builtin triggers are registered
    aiTriggerService._triggers.clear();
    aiTriggerService.init();

    // Reset specific mocks to clear mockResolvedValueOnce queues, then re-set defaults
    vi.mocked(mockPrisma.userSettings.findUnique).mockReset().mockResolvedValue(null as never);
    vi.mocked(stateEngineService.getState).mockReset().mockResolvedValue('planning' as never);
  });

  // =====================================================================
  // Registry
  // =====================================================================

  describe('registry', () => {
    it('should register all builtin triggers on init', () => {
      expect(aiTriggerService.getAllTriggers().length).toBe(BUILTIN_TRIGGERS.length);
      for (const t of BUILTIN_TRIGGERS) {
        expect(aiTriggerService.getTrigger(t.id)).toBeDefined();
      }
    });

    it('should register and retrieve a custom trigger', () => {
      aiTriggerService.registerTrigger(testTrigger);
      expect(aiTriggerService.getTrigger('test_trigger')).toEqual(testTrigger);
    });
  });

  // =====================================================================
  // shouldFire
  // =====================================================================

  describe('shouldFire', () => {
    it('should return false when global config is disabled', async () => {
      // Mock userSettings with globally disabled config
      vi.mocked(mockPrisma.userSettings.findUnique).mockResolvedValueOnce({
        aiTriggerConfig: { ...DEFAULT_AI_TRIGGER_CONFIG, enabled: false },
      } as never);

      const result = await aiTriggerService.shouldFire(TEST_USER_ID, testTrigger);
      expect(result).toBe(false);
    });

    it('should return false when specific trigger is disabled', async () => {
      vi.mocked(mockPrisma.userSettings.findUnique).mockResolvedValueOnce({
        aiTriggerConfig: {
          ...DEFAULT_AI_TRIGGER_CONFIG,
          triggers: { test_trigger: { enabled: false } },
        },
      } as never);

      const result = await aiTriggerService.shouldFire(TEST_USER_ID, testTrigger);
      expect(result).toBe(false);
    });

    it('should return false when within cooldown period', async () => {
      const now = Date.now();
      aiTriggerService._updateCooldown(TEST_USER_ID, testTrigger.id, now - 30_000); // 30s ago

      const result = await aiTriggerService.shouldFire(TEST_USER_ID, testTrigger, { now });
      expect(result).toBe(false); // 30s < 60s cooldown
    });

    it('should return true when cooldown has expired', async () => {
      // Use a daytime timestamp to avoid quiet hours (default 22:00-07:00)
      const daytime = new Date();
      daytime.setHours(10, 0, 0, 0);
      const now = daytime.getTime();
      aiTriggerService._updateCooldown(TEST_USER_ID, testTrigger.id, now - 61_000); // 61s ago

      const result = await aiTriggerService.shouldFire(TEST_USER_ID, testTrigger, { now });
      expect(result).toBe(true);
    });

    it('should return false for low priority in FOCUS state', async () => {
      vi.mocked(stateEngineService.getState).mockResolvedValueOnce('focus' as never);

      const result = await aiTriggerService.shouldFire(TEST_USER_ID, lowPriorityTrigger);
      expect(result).toBe(false);
    });

    it('should return false for normal priority in FOCUS state', async () => {
      vi.mocked(stateEngineService.getState).mockResolvedValueOnce('focus' as never);

      const result = await aiTriggerService.shouldFire(TEST_USER_ID, testTrigger);
      expect(result).toBe(false);
    });

    it('should return true for high priority even in FOCUS state', async () => {
      // high priority skips FOCUS check entirely
      const result = await aiTriggerService.shouldFire(TEST_USER_ID, highPriorityTrigger);
      expect(result).toBe(true);
    });

    it('should return false during quiet hours for non-high priority', async () => {
      // Set quiet hours to include the test time
      vi.mocked(mockPrisma.userSettings.findUnique).mockResolvedValueOnce({
        aiTriggerConfig: {
          ...DEFAULT_AI_TRIGGER_CONFIG,
          quietHours: { start: '00:00', end: '23:59' }, // Always quiet
        },
      } as never);

      const result = await aiTriggerService.shouldFire(TEST_USER_ID, testTrigger);
      expect(result).toBe(false);
    });

    it('should return true during quiet hours for high priority', async () => {
      vi.mocked(mockPrisma.userSettings.findUnique).mockResolvedValueOnce({
        aiTriggerConfig: {
          ...DEFAULT_AI_TRIGGER_CONFIG,
          quietHours: { start: '00:00', end: '23:59' },
        },
      } as never);

      const result = await aiTriggerService.shouldFire(TEST_USER_ID, highPriorityTrigger);
      expect(result).toBe(true);
    });

    it('should return true when all conditions are met', async () => {
      // Default mocks: user has no settings (defaults apply),
      // state is 'planning', no cooldown
      // Use a daytime timestamp to avoid quiet hours (default 22:00-07:00)
      const daytime = new Date();
      daytime.setHours(10, 0, 0, 0);
      const result = await aiTriggerService.shouldFire(TEST_USER_ID, testTrigger, { now: daytime.getTime() });
      expect(result).toBe(true);
    });
  });

  // =====================================================================
  // fire
  // =====================================================================

  describe('fire', () => {
    let broadcastedCommands: Array<{ userId: string; command: unknown }>;

    beforeEach(() => {
      broadcastedCommands = [];
      registerProactiveBroadcaster((userId, command) => {
        broadcastedCommands.push({ userId, command });
      });
    });

    afterEach(() => {
      registerProactiveBroadcaster(() => {});
    });

    it('should persist message via chatService', async () => {
      const result = await aiTriggerService.fire(TEST_USER_ID, testTrigger, { name: 'World' });
      expect(result.success).toBe(true);

      expect(chatService.getOrCreateDefaultConversation).toHaveBeenCalledWith(TEST_USER_ID);
      expect(chatService.persistMessage).toHaveBeenCalledWith(
        'conv-001',
        'assistant',
        'Hello World, welcome!',
        expect.objectContaining({
          isProactive: true,
          triggerId: 'test_trigger',
        }),
      );
    });

    it('should broadcast CHAT_RESPONSE via Socket.io', async () => {
      await aiTriggerService.fire(TEST_USER_ID, testTrigger, { name: 'World' });

      expect(broadcastedCommands).toHaveLength(1);
      expect(broadcastedCommands[0].userId).toBe(TEST_USER_ID);
      const cmd = broadcastedCommands[0].command as Record<string, unknown>;
      expect(cmd.commandType).toBe('CHAT_RESPONSE');
      const payload = cmd.payload as Record<string, unknown>;
      expect(payload.isProactive).toBe(true);
      expect(payload.triggerId).toBe('test_trigger');
      expect(payload.type).toBe('complete');
    });

    it('should write audit log', async () => {
      await aiTriggerService.fire(TEST_USER_ID, testTrigger, { name: 'World' });

      expect(mcpAuditService.logToolCall).toHaveBeenCalledWith(
        TEST_USER_ID,
        expect.objectContaining({
          agentId: 'ai-trigger-system',
          toolName: 'ai_trigger:test_trigger',
          success: true,
        }),
      );
    });

    it('should use LLM when useLLM=true', async () => {
      await aiTriggerService.fire(TEST_USER_ID, llmTrigger, {});

      expect(llmAdapterService.callGenerateText).toHaveBeenCalled();
      expect(chatService.persistMessage).toHaveBeenCalledWith(
        'conv-001',
        'assistant',
        'AI generated proactive message',
        expect.objectContaining({ isProactive: true }),
      );
    });

    it('should use template rendering when useLLM=false', async () => {
      await aiTriggerService.fire(TEST_USER_ID, testTrigger, { name: 'Alice' });

      expect(llmAdapterService.callGenerateText).not.toHaveBeenCalled();
      expect(chatService.persistMessage).toHaveBeenCalledWith(
        'conv-001',
        'assistant',
        'Hello Alice, welcome!',
        expect.anything(),
      );
    });

    it('should update cooldown after firing', async () => {
      expect(aiTriggerService._getCooldown(TEST_USER_ID, testTrigger.id)).toBeUndefined();

      await aiTriggerService.fire(TEST_USER_ID, testTrigger, {});

      expect(aiTriggerService._getCooldown(TEST_USER_ID, testTrigger.id)).toBeDefined();
    });

    it('should return error when conversation creation fails', async () => {
      vi.mocked(chatService.getOrCreateDefaultConversation).mockResolvedValueOnce({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'DB error' },
      } as never);

      const result = await aiTriggerService.fire(TEST_USER_ID, testTrigger, {});
      expect(result.success).toBe(false);
    });
  });

  // =====================================================================
  // Escalation helpers
  // =====================================================================

  describe('escalation helpers', () => {
    it('should return gentle for 0-5 min', () => {
      expect(getEscalationLevel(0)).toBe('gentle');
      expect(getEscalationLevel(3)).toBe('gentle');
      expect(getEscalationLevel(5)).toBe('gentle');
    });

    it('should return moderate for 5-10 min', () => {
      expect(getEscalationLevel(6)).toBe('moderate');
      expect(getEscalationLevel(10)).toBe('moderate');
    });

    it('should return strong for 10+ min', () => {
      expect(getEscalationLevel(11)).toBe('strong');
      expect(getEscalationLevel(30)).toBe('strong');
    });

    it('should return a template string for each level', () => {
      expect(getEscalationTemplate('gentle')).toContain('休息结束了');
      expect(getEscalationTemplate('moderate')).toContain('超时');
      expect(getEscalationTemplate('strong')).toContain('大幅超出');
    });
  });

  // =====================================================================
  // Quiet hours helper
  // =====================================================================

  describe('_isInQuietHours', () => {
    it('should detect overnight quiet hours (22:00 - 07:00)', () => {
      // 23:00 → in quiet hours
      const at23 = new Date('2026-02-27T23:00:00').getTime();
      expect(aiTriggerService._isInQuietHours({ start: '22:00', end: '07:00' }, at23)).toBe(true);

      // 06:00 → in quiet hours
      const at06 = new Date('2026-02-27T06:00:00').getTime();
      expect(aiTriggerService._isInQuietHours({ start: '22:00', end: '07:00' }, at06)).toBe(true);

      // 10:00 → not in quiet hours
      const at10 = new Date('2026-02-27T10:00:00').getTime();
      expect(aiTriggerService._isInQuietHours({ start: '22:00', end: '07:00' }, at10)).toBe(false);
    });

    it('should detect same-day quiet hours (09:00 - 17:00)', () => {
      const at12 = new Date('2026-02-27T12:00:00').getTime();
      expect(aiTriggerService._isInQuietHours({ start: '09:00', end: '17:00' }, at12)).toBe(true);

      const at20 = new Date('2026-02-27T20:00:00').getTime();
      expect(aiTriggerService._isInQuietHours({ start: '09:00', end: '17:00' }, at20)).toBe(false);
    });
  });

  // =====================================================================
  // Template rendering
  // =====================================================================

  describe('_renderTemplate', () => {
    it('should replace placeholders', () => {
      const result = aiTriggerService._renderTemplate(
        'Hello {{name}}, you have {{count}} tasks',
        { name: 'Alice', count: 5 },
      );
      expect(result).toBe('Hello Alice, you have 5 tasks');
    });

    it('should handle missing placeholders gracefully', () => {
      const result = aiTriggerService._renderTemplate(
        'Hello {{name}}, {{missing}}!',
        { name: 'Bob' },
      );
      expect(result).toBe('Hello Bob, {{missing}}!');
    });
  });
});
