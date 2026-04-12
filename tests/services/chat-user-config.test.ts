/**
 * Chat User Configuration Tests (S10.3)
 *
 * Tests for:
 * - aiTriggerConfig.enabled=false → all triggers don't fire
 * - aiTriggerConfig.triggers.morning_greeting.enabled=false → only that trigger blocked
 * - aiModelConfig sets chat:default to specific model → resolveModelForScene returns it
 * - quietHours 22:00-07:00 → 23:00 trigger silenced (high priority excepted)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------- Prisma mock ----------

const mockPrismaClient = vi.hoisted(() => ({
  user: { findUnique: vi.fn().mockResolvedValue(null) },
  userSettings: {
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue({}),
  },
  conversation: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  chatMessage: { create: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrismaClient,
  prisma: mockPrismaClient,
}));

vi.mock('@/services/state-engine.service', () => ({
  stateEngineService: {
    getState: vi.fn().mockResolvedValue('idle'),
  },
}));

vi.mock('@/services/chat.service', () => ({
  chatService: {
    getOrCreateDefaultConversation: vi.fn().mockResolvedValue({
      success: true,
      data: { id: 'conv-cfg-001' },
    }),
    persistMessage: vi.fn().mockResolvedValue({
      success: true,
      data: { id: 'msg-cfg-001' },
    }),
  },
}));

vi.mock('@/services/chat-context.service', () => ({
  chatContextService: {
    buildSystemPrompt: vi.fn().mockResolvedValue({ success: true, data: 'System' }),
  },
}));

vi.mock('@/services/llm-adapter.service', () => ({
  llmAdapterService: {
    callGenerateText: vi.fn().mockResolvedValue({ text: 'AI response' }),
  },
}));

vi.mock('@/services/mcp-audit.service', () => ({
  mcpAuditService: {
    logToolCall: vi.fn().mockResolvedValue({ success: true }),
  },
}));

// Mock llm.config to avoid real model creation
vi.mock('@/config/llm.config', () => ({
  isValidModelId: vi.fn((id: string) => {
    const validModels = ['qwen-plus', 'qwen-turbo', 'kimi-k2', 'sf-deepseek-v3'];
    return validModels.includes(id);
  }),
  DEFAULT_SCENE_CONFIG: {
    'chat:default': { model: 'qwen-plus', maxTokens: 4096, temperature: 0.7, toolsEnabled: true },
    'chat:quick_action': { model: 'qwen-turbo', maxTokens: 1024, temperature: 0.3, toolsEnabled: true },
    'chat:planning': { model: 'qwen-plus', maxTokens: 4096, temperature: 0.7, toolsEnabled: true },
  },
  MODEL_META: {
    'qwen-plus': { displayName: 'Qwen Plus' },
    'qwen-turbo': { displayName: 'Qwen Turbo' },
    'kimi-k2': { displayName: 'Kimi K2' },
    'sf-deepseek-v3': { displayName: 'DeepSeek V3' },
  },
}));

import { chatUserConfigService } from '@/services/chat-user-config.service';
import { aiTriggerService, registerProactiveBroadcaster } from '@/services/ai-trigger.service';
import { chatService } from '@/services/chat.service';

const TEST_USER = 'test-user-config-001';

describe('Chat User Configuration (S10)', () => {
  let broadcastedCommands: Array<{ userId: string; command: unknown }>;

  beforeEach(() => {
    vi.clearAllMocks();
    aiTriggerService._clearCooldowns();
    aiTriggerService._triggers.clear();
    aiTriggerService.init();

    broadcastedCommands = [];
    registerProactiveBroadcaster((userId, command) => {
      broadcastedCommands.push({ userId, command });
    });

    // Clear env overrides
    delete process.env.LLM_MODEL_CHAT_DEFAULT;
  });

  // =====================================================================
  // S10.1 — Trigger configuration
  // =====================================================================

  describe('aiTriggerConfig (S10.1)', () => {
    it('enabled=false → all triggers should not fire', async () => {
      // Simulate user has set enabled=false
      mockPrismaClient.userSettings.findUnique.mockResolvedValue({
        aiTriggerConfig: { enabled: false, triggers: {} },
      });

      const trigger = aiTriggerService.getTrigger('on_planning_enter')!;
      const canFire = await aiTriggerService.shouldFire(TEST_USER, trigger);

      expect(canFire).toBe(false);
    });

    it('triggers.morning_greeting.enabled=false → that trigger blocked, others unaffected', async () => {
      // User has disabled morning_greeting specifically
      mockPrismaClient.userSettings.findUnique.mockResolvedValue({
        aiTriggerConfig: {
          enabled: true,
          triggers: {
            morning_greeting: { enabled: false },
          },
        },
      });

      // Import the cron service to get the trigger registered
      const { chatTriggersCronService } = await import('@/services/chat-triggers-cron.service');
      chatTriggersCronService.init();

      // morning_greeting should be blocked
      const morningTrigger = aiTriggerService.getTrigger('morning_greeting')!;
      const morningCanFire = await aiTriggerService.shouldFire(TEST_USER, morningTrigger);
      expect(morningCanFire).toBe(false);

      // on_planning_enter should still work (high priority, bypasses quiet hours)
      const planningTrigger = aiTriggerService.getTrigger('on_planning_enter')!;
      const planningCanFire = await aiTriggerService.shouldFire(TEST_USER, planningTrigger);
      expect(planningCanFire).toBe(true);
    });

    it('quietHours 22:00-07:00 → 23:00 trigger is silenced (normal priority)', async () => {
      mockPrismaClient.userSettings.findUnique.mockResolvedValue({
        aiTriggerConfig: {
          enabled: true,
          quietHours: { start: '22:00', end: '07:00' },
          triggers: {},
        },
      });

      // Import the cron service to get the trigger registered
      const { chatTriggersCronService } = await import('@/services/chat-triggers-cron.service');
      chatTriggersCronService.init();

      // Simulate 23:00 — within quiet hours
      const at2300 = new Date('2026-02-27T23:00:00').getTime();

      // evening_summary is normal priority → should be silenced
      const eveningTrigger = aiTriggerService.getTrigger('evening_summary')!;
      const canFire = await aiTriggerService.shouldFire(TEST_USER, eveningTrigger, { now: at2300 });
      expect(canFire).toBe(false);
    });

    it('quietHours → high priority triggers still fire during quiet hours', async () => {
      mockPrismaClient.userSettings.findUnique.mockResolvedValue({
        aiTriggerConfig: {
          enabled: true,
          quietHours: { start: '22:00', end: '07:00' },
          triggers: {},
        },
      });

      // on_planning_enter is high priority → should bypass quiet hours
      const at2300 = new Date('2026-02-27T23:00:00').getTime();
      const trigger = aiTriggerService.getTrigger('on_planning_enter')!;
      const canFire = await aiTriggerService.shouldFire(TEST_USER, trigger, { now: at2300 });
      expect(canFire).toBe(true);
    });

    it('getAITriggerConfig should merge with defaults', async () => {
      mockPrismaClient.userSettings.findUnique.mockResolvedValue({
        aiTriggerConfig: {
          enabled: false,
          triggers: { morning_greeting: { enabled: false } },
        },
      });

      const result = await chatUserConfigService.getAITriggerConfig(TEST_USER);
      expect(result.success).toBe(true);
      expect(result.data?.enabled).toBe(false);
      expect(result.data?.triggers.morning_greeting.enabled).toBe(false);
      // Other triggers should get defaults
      expect(result.data?.triggers.on_planning_enter.enabled).toBe(true);
    });

    it('updateAITriggerConfig should persist changes', async () => {
      mockPrismaClient.userSettings.findUnique.mockResolvedValue({
        aiTriggerConfig: {},
      });

      const result = await chatUserConfigService.updateAITriggerConfig(TEST_USER, {
        enabled: false,
      });

      expect(result.success).toBe(true);
      expect(result.data?.enabled).toBe(false);
      expect(mockPrismaClient.userSettings.upsert).toHaveBeenCalled();
    });
  });

  // =====================================================================
  // S10.2 — Model preference
  // =====================================================================

  describe('aiModelConfig (S10.2)', () => {
    it('should return default model when no user override', async () => {
      mockPrismaClient.userSettings.findUnique.mockResolvedValue(null);

      const model = await chatUserConfigService.resolveModelForScene(TEST_USER, 'chat:default');
      expect(model).toBe('qwen-plus');
    });

    it('user setting should override code default', async () => {
      mockPrismaClient.userSettings.findUnique.mockResolvedValue({
        aiModelConfig: {
          'chat:default': { model: 'kimi-k2' },
        },
      });

      const model = await chatUserConfigService.resolveModelForScene(TEST_USER, 'chat:default');
      expect(model).toBe('kimi-k2');
    });

    it('env variable should override code default but not user setting', async () => {
      // Set env override
      process.env.LLM_MODEL_CHAT_DEFAULT = 'qwen-turbo';

      // No user setting
      mockPrismaClient.userSettings.findUnique.mockResolvedValue(null);

      const model = await chatUserConfigService.resolveModelForScene(TEST_USER, 'chat:default');
      expect(model).toBe('qwen-turbo');

      // With user setting → user wins
      mockPrismaClient.userSettings.findUnique.mockResolvedValue({
        aiModelConfig: {
          'chat:default': { model: 'kimi-k2' },
        },
      });

      const model2 = await chatUserConfigService.resolveModelForScene(TEST_USER, 'chat:default');
      expect(model2).toBe('kimi-k2');

      delete process.env.LLM_MODEL_CHAT_DEFAULT;
    });

    it('invalid model in user settings should fall through to env/default', async () => {
      mockPrismaClient.userSettings.findUnique.mockResolvedValue({
        aiModelConfig: {
          'chat:default': { model: 'nonexistent-model' },
        },
      });

      const model = await chatUserConfigService.resolveModelForScene(TEST_USER, 'chat:default');
      // Should fall through to code default since 'nonexistent-model' is not valid
      expect(model).toBe('qwen-plus');
    });

    it('getAIModelConfig should return stored config', async () => {
      mockPrismaClient.userSettings.findUnique.mockResolvedValue({
        aiModelConfig: {
          'chat:default': { model: 'kimi-k2' },
          'chat:planning': { model: 'sf-deepseek-v3' },
        },
      });

      const result = await chatUserConfigService.getAIModelConfig(TEST_USER);
      expect(result.success).toBe(true);
      expect(result.data?.['chat:default']?.model).toBe('kimi-k2');
      expect(result.data?.['chat:planning']?.model).toBe('sf-deepseek-v3');
    });

    it('updateAIModelConfig should persist changes', async () => {
      mockPrismaClient.userSettings.findUnique.mockResolvedValue({
        aiModelConfig: {},
      });

      const result = await chatUserConfigService.updateAIModelConfig(TEST_USER, {
        'chat:default': { model: 'kimi-k2' },
      });

      expect(result.success).toBe(true);
      expect(result.data?.['chat:default']?.model).toBe('kimi-k2');
      expect(mockPrismaClient.userSettings.upsert).toHaveBeenCalled();
    });

    it('unknown scene should fall back to chat:default config', async () => {
      mockPrismaClient.userSettings.findUnique.mockResolvedValue(null);

      const model = await chatUserConfigService.resolveModelForScene(TEST_USER, 'chat:nonexistent');
      expect(model).toBe('qwen-plus'); // chat:default's model
    });
  });

  // =====================================================================
  // Integration: trigger config affects trigger firing
  // =====================================================================

  describe('integration: config affects trigger behavior', () => {
    it('global enabled=false should prevent all trigger fires', async () => {
      mockPrismaClient.userSettings.findUnique.mockResolvedValue({
        aiTriggerConfig: { enabled: false, triggers: {} },
      });

      // Test multiple triggers
      const triggers = ['on_planning_enter', 'on_rest_enter', 'on_over_rest_enter'];
      for (const triggerId of triggers) {
        const trigger = aiTriggerService.getTrigger(triggerId);
        if (trigger) {
          const canFire = await aiTriggerService.shouldFire(TEST_USER, trigger);
          expect(canFire).toBe(false);
        }
      }
    });

    it('per-trigger disabled should only affect that trigger', async () => {
      mockPrismaClient.userSettings.findUnique.mockResolvedValue({
        aiTriggerConfig: {
          enabled: true,
          triggers: {
            on_rest_enter: { enabled: false },
          },
        },
      });

      // on_rest_enter should be blocked
      const restTrigger = aiTriggerService.getTrigger('on_rest_enter')!;
      expect(await aiTriggerService.shouldFire(TEST_USER, restTrigger)).toBe(false);

      // on_planning_enter should still work (high priority)
      const planningTrigger = aiTriggerService.getTrigger('on_planning_enter')!;
      expect(await aiTriggerService.shouldFire(TEST_USER, planningTrigger)).toBe(true);
    });
  });
});
