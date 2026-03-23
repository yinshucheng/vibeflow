/**
 * Chat State Transition Trigger Tests (S5.6)
 *
 * Tests for on_planning_enter, on_rest_enter, on_over_rest_enter,
 * over_rest_escalation, and task_stuck triggers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma — must use vi.hoisted for mock factory references
const mockPrismaClient = vi.hoisted(() => ({
  user: { findUnique: vi.fn().mockResolvedValue(null) },
  task: {
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
  },
  pomodoro: {
    count: vi.fn().mockResolvedValue(0),
    findMany: vi.fn().mockResolvedValue([]),
  },
  dailyState: {
    findFirst: vi.fn().mockResolvedValue(null),
  },
  userSettings: {
    findUnique: vi.fn().mockResolvedValue(null),
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

// Mock state engine service
vi.mock('@/services/state-engine.service', () => ({
  stateEngineService: {
    getState: vi.fn().mockResolvedValue('idle'),
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
      text: 'AI generated message for trigger',
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
  handleDailyStateChanged,
  handlePomodoroCompleted,
  handleOverRestEscalation,
  handlePlanningEnter,
  handleRestEnter,
  handleOverRestEnter,
  handleTaskStuck,
} from '@/services/chat-triggers-state.service';
import { aiTriggerService, registerProactiveBroadcaster } from '@/services/ai-trigger.service';
import { chatService } from '@/services/chat.service';
import { llmAdapterService } from '@/services/llm-adapter.service';

const TEST_USER = 'test-user-state-001';

describe('Chat State Transition Triggers (S5)', () => {
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
  // S5.1 on_planning_enter
  // =====================================================================

  describe('on_planning_enter (S5.1)', () => {
    it('should fire when daily_state.changed with newState=planning', async () => {
      await handleDailyStateChanged(TEST_USER, {
        previousState: 'locked',
        newState: 'planning',
      });

      expect(chatService.persistMessage).toHaveBeenCalled();
      expect(llmAdapterService.callGenerateText).toHaveBeenCalled();
      expect(broadcastedCommands).toHaveLength(1);

      const payload = (broadcastedCommands[0].command as Record<string, unknown>).payload as Record<string, unknown>;
      expect(payload.isProactive).toBe(true);
      expect(payload.triggerId).toBe('on_planning_enter');
    });

    it('should not fire when newState is not planning', async () => {
      await handleDailyStateChanged(TEST_USER, {
        previousState: 'rest',
        newState: 'focus',
      });

      expect(chatService.persistMessage).not.toHaveBeenCalled();
      expect(broadcastedCommands).toHaveLength(0);
    });

    it('should respect cooldown (once per day)', async () => {
      await handlePlanningEnter(TEST_USER);
      expect(broadcastedCommands).toHaveLength(1);

      // Second call should be blocked by cooldown
      await handlePlanningEnter(TEST_USER);
      expect(broadcastedCommands).toHaveLength(1);
    });
  });

  // =====================================================================
  // S5.2 on_rest_enter
  // =====================================================================

  describe('on_rest_enter (S5.2)', () => {
    it('should fire on pomodoro completion', async () => {
      await handlePomodoroCompleted(TEST_USER, {
        pomodoroId: 'pom-001',
        taskId: 'task-001',
        taskTitle: 'Test task',
        duration: 25,
      });

      // on_rest_enter should have fired (persistMessage called with proactive metadata)
      expect(chatService.persistMessage).toHaveBeenCalledWith(
        'conv-001',
        'assistant',
        expect.any(String),
        expect.objectContaining({
          isProactive: true,
          triggerId: 'on_rest_enter',
        }),
      );
    });

    it('should call LLM to generate summary', async () => {
      await handleRestEnter(TEST_USER, {
        pomodoroId: 'pom-002',
        taskTitle: 'Writing tests',
        duration: 25,
      });

      expect(llmAdapterService.callGenerateText).toHaveBeenCalled();
    });
  });

  // =====================================================================
  // S5.3 on_over_rest_enter
  // =====================================================================

  describe('on_over_rest_enter (S5.3)', () => {
    it('should fire when state transitions to over_rest', async () => {
      await handleDailyStateChanged(TEST_USER, {
        previousState: 'rest',
        newState: 'over_rest',
      });

      expect(chatService.persistMessage).toHaveBeenCalled();
      expect(llmAdapterService.callGenerateText).not.toHaveBeenCalled(); // template, not LLM
    });

    it('should use template (not LLM) for over_rest_enter', async () => {
      await handleOverRestEnter(TEST_USER);

      expect(llmAdapterService.callGenerateText).not.toHaveBeenCalled();
      expect(chatService.persistMessage).toHaveBeenCalledWith(
        'conv-001',
        'assistant',
        expect.stringContaining('休息时间已结束'),
        expect.anything(),
      );
    });
  });

  // =====================================================================
  // S5.4 over_rest_escalation
  // =====================================================================

  describe('over_rest_escalation (S5.4)', () => {
    it('should produce gentle message for 0-5 min', async () => {
      await handleOverRestEscalation(TEST_USER, 3);

      expect(chatService.persistMessage).toHaveBeenCalled();
      const content = vi.mocked(chatService.persistMessage).mock.calls[0][2];
      expect(content).toContain('休息结束了');
    });

    it('should produce moderate message for 5-10 min', async () => {
      // Need fresh cooldown — clear the escalation trigger cooldown
      aiTriggerService._clearCooldowns();
      await handleOverRestEscalation(TEST_USER, 7);

      expect(chatService.persistMessage).toHaveBeenCalled();
      const content = vi.mocked(chatService.persistMessage).mock.calls[0][2];
      expect(content).toContain('超时');
    });

    it('should produce strong message for 10+ min', async () => {
      aiTriggerService._clearCooldowns();
      await handleOverRestEscalation(TEST_USER, 15);

      expect(chatService.persistMessage).toHaveBeenCalled();
      const content = vi.mocked(chatService.persistMessage).mock.calls[0][2];
      expect(content).toContain('大幅超出');
    });

    it('should have 3 distinct escalation levels', async () => {
      const { getEscalationLevel, getEscalationTemplate } = await import('@/services/ai-trigger.service');
      const levels = [3, 7, 15];
      const templates = levels.map((m) => getEscalationTemplate(getEscalationLevel(m)));
      expect(new Set(templates).size).toBe(3); // 3 distinct templates
    });
  });

  // =====================================================================
  // S5.5 task_stuck
  // =====================================================================

  describe('task_stuck (S5.5)', () => {
    it('should not fire when task has < 3 consecutive pomodoros', async () => {
      vi.mocked(mockPrismaClient.pomodoro.findMany).mockResolvedValueOnce([
        { taskId: 'task-001' },
        { taskId: 'task-001' },
      ] as never);

      await handleTaskStuck(TEST_USER, 'task-001', { taskTitle: 'Test' });

      expect(chatService.persistMessage).not.toHaveBeenCalled();
    });

    it('should fire when task has >= 3 consecutive pomodoros', async () => {
      vi.mocked(mockPrismaClient.pomodoro.findMany).mockResolvedValueOnce([
        { taskId: 'task-001' },
        { taskId: 'task-001' },
        { taskId: 'task-001' },
      ] as never);

      vi.mocked(mockPrismaClient.task.findUnique).mockResolvedValueOnce({
        title: 'Complex task',
        priority: 'P1',
        estimatedMinutes: 60,
      });

      await handleTaskStuck(TEST_USER, 'task-001', { taskTitle: 'Complex task' });

      expect(llmAdapterService.callGenerateText).toHaveBeenCalled();
      expect(chatService.persistMessage).toHaveBeenCalled();
    });

    it('should break consecutive count when different task appears', async () => {
      vi.mocked(mockPrismaClient.pomodoro.findMany).mockResolvedValueOnce([
        { taskId: 'task-001' },
        { taskId: 'task-002' }, // breaks the streak
        { taskId: 'task-001' },
      ] as never);

      await handleTaskStuck(TEST_USER, 'task-001', { taskTitle: 'Test' });

      // Only 1 consecutive for task-001 (most recent), should not fire
      expect(chatService.persistMessage).not.toHaveBeenCalled();
    });
  });

  // =====================================================================
  // Event router
  // =====================================================================

  describe('handlePomodoroCompleted (event router)', () => {
    it('should trigger both on_rest_enter and task_stuck check', async () => {
      // 3 consecutive pomodoros for the task
      vi.mocked(mockPrismaClient.pomodoro.findMany).mockResolvedValueOnce([
        { taskId: 'task-x' },
        { taskId: 'task-x' },
        { taskId: 'task-x' },
      ] as never);

      vi.mocked(mockPrismaClient.task.findUnique).mockResolvedValueOnce({
        title: 'Stuck task',
        priority: 'P2',
        estimatedMinutes: 120,
      });

      await handlePomodoroCompleted(TEST_USER, {
        pomodoroId: 'pom-x',
        taskId: 'task-x',
        taskTitle: 'Stuck task',
        duration: 25,
      });

      // on_rest_enter fires (LLM call)
      expect(llmAdapterService.callGenerateText).toHaveBeenCalled();
      // persistMessage should be called at least twice (rest + stuck)
      expect(vi.mocked(chatService.persistMessage).mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('should not check task_stuck when no taskId', async () => {
      await handlePomodoroCompleted(TEST_USER, {
        pomodoroId: 'pom-y',
        taskTitle: 'Taskless',
        duration: 25,
        // no taskId
      });

      // on_rest_enter fires, but task_stuck should not query task details
      expect(vi.mocked(mockPrismaClient.task.findUnique)).not.toHaveBeenCalled();
    });
  });
});
