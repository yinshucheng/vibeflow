/**
 * AI Trigger Cooldown Property Tests (S4.4)
 *
 * Property: For any cooldownSeconds and two fire intervals,
 * if interval < cooldown → second fire blocked; if interval >= cooldown → both fire.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

// Mock dependencies — must use vi.hoisted for mock factory references
const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn().mockResolvedValue(null) },
  conversation: { findFirst: vi.fn(), create: vi.fn() },
  chatMessage: { create: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
}));

vi.mock('@/services/state-engine.service', () => ({
  stateEngineService: {
    getState: vi.fn().mockResolvedValue('idle'),
  },
}));

vi.mock('@/services/chat.service', () => ({
  chatService: {
    getOrCreateDefaultConversation: vi.fn().mockResolvedValue({ success: true, data: { id: 'conv' } }),
    persistMessage: vi.fn().mockResolvedValue({ success: true, data: { id: 'msg' } }),
  },
}));

vi.mock('@/services/chat-context.service', () => ({
  chatContextService: {
    buildSystemPrompt: vi.fn().mockResolvedValue({ success: true, data: '' }),
  },
}));

vi.mock('@/services/llm-adapter.service', () => ({
  llmAdapterService: {
    callGenerateText: vi.fn().mockResolvedValue({ text: 'test' }),
  },
}));

vi.mock('@/services/mcp-audit.service', () => ({
  mcpAuditService: {
    logToolCall: vi.fn().mockResolvedValue({ success: true }),
  },
}));

import { aiTriggerService } from '@/services/ai-trigger.service';
import type { TriggerDefinition } from '@/services/ai-trigger.service';

describe('ai-trigger cooldown property', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    aiTriggerService._clearCooldowns();
    aiTriggerService._triggers.clear();
    aiTriggerService.init();
  });

  it('interval < cooldown → second shouldFire returns false', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 10, max: 3600 }),     // cooldownSeconds
        fc.integer({ min: 1, max: 3599 }),       // intervalMs factor
        async (cooldownSeconds, intervalFactor) => {
          aiTriggerService._clearCooldowns();

          const trigger: TriggerDefinition = {
            id: 'cooldown_test',
            sourceType: 'threshold',
            promptTemplate: 'test',
            useLLM: false,
            cooldownSeconds,
            userConfigurable: true,
            defaultEnabled: true,
            priority: 'high', // bypass FOCUS and quiet hours
          };

          const baseTime = 1_700_000_000_000; // fixed base
          // Ensure interval is strictly less than cooldown
          const intervalMs = Math.min(intervalFactor, cooldownSeconds * 1000 - 1);

          // First fire should succeed
          const first = await aiTriggerService.shouldFire('user-a', trigger, { now: baseTime });
          expect(first).toBe(true);

          // Record the cooldown
          aiTriggerService._updateCooldown('user-a', trigger.id, baseTime);

          // Second fire within cooldown should fail
          const second = await aiTriggerService.shouldFire('user-a', trigger, {
            now: baseTime + intervalMs,
          });
          expect(second).toBe(false);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('interval >= cooldown → both shouldFire return true', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 3600 }),       // cooldownSeconds
        fc.integer({ min: 0, max: 10000 }),      // extra ms beyond cooldown
        async (cooldownSeconds, extraMs) => {
          aiTriggerService._clearCooldowns();

          const trigger: TriggerDefinition = {
            id: 'cooldown_test_2',
            sourceType: 'threshold',
            promptTemplate: 'test',
            useLLM: false,
            cooldownSeconds,
            userConfigurable: true,
            defaultEnabled: true,
            priority: 'high',
          };

          const baseTime = 1_700_000_000_000;
          const intervalMs = cooldownSeconds * 1000 + extraMs;

          // First fire
          const first = await aiTriggerService.shouldFire('user-b', trigger, { now: baseTime });
          expect(first).toBe(true);

          aiTriggerService._updateCooldown('user-b', trigger.id, baseTime);

          // Second fire after cooldown
          const second = await aiTriggerService.shouldFire('user-b', trigger, {
            now: baseTime + intervalMs,
          });
          expect(second).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });
});
