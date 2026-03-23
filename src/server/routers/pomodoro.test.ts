import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

vi.mock('@/services/pomodoro.service', () => ({
  pomodoroService: {
    startTaskless: vi.fn(),
    getSummary: vi.fn(),
    completeTaskInPomodoro: vi.fn(),
    getLastTask: vi.fn(),
    getCurrent: vi.fn(),
    getTodayCount: vi.fn(),
    isDailyCapped: vi.fn(),
    getByTask: vi.fn(),
    getTimerConfig: vi.fn(),
    start: vi.fn(),
    complete: vi.fn(),
    abort: vi.fn(),
    interrupt: vi.fn(),
    record: vi.fn(),
  },
  StartPomodoroSchema: z.object({ taskId: z.string().uuid() }),
  CompletePomodoroSchema: z.object({ id: z.string().uuid() }),
  RecordPomodoroSchema: z.object({
    taskId: z.string().uuid().nullable().optional(),
    duration: z.number().min(10).max(120),
    completedAt: z.coerce.date(),
    summary: z.string().max(1000).optional(),
  }),
}));

vi.mock('@/services/stats.service', () => ({
  statsService: { getStats: vi.fn() },
  GetStatsSchema: z.object({}),
}));

vi.mock('@/lib/prisma', () => ({ default: {} }));
vi.mock('@/server/socket', () => ({ socketServer: { sendExecuteCommand: vi.fn() } }));
vi.mock('@/services/tray-integration.service', () => ({ trayIntegrationService: { updatePomodoroState: vi.fn(), handlePomodoroCompletion: vi.fn() } }));
vi.mock('@/services/over-rest.service', () => ({ overRestService: { checkOverRestStatus: vi.fn() } }));

import { pomodoroRouter } from './pomodoro';
import { pomodoroService } from '@/services/pomodoro.service';
import { dailyStateService } from '@/services/daily-state.service';
import { stateEngineService } from '@/services/state-engine.service';

vi.mock('@/services/daily-state.service', () => ({
  dailyStateService: {
    isDailyCapped: vi.fn(),
    updateSystemState: vi.fn(),
  },
}));

vi.mock('@/services/socket-broadcast.service', () => ({
  broadcastPolicyUpdate: vi.fn(),
}));

vi.mock('@/services/state-engine.service', () => ({
  stateEngineService: {
    send: vi.fn(),
  },
}));

const mockPomodoroService = pomodoroService as unknown as {
  startTaskless: ReturnType<typeof vi.fn>;
  getSummary: ReturnType<typeof vi.fn>;
  completeTaskInPomodoro: ReturnType<typeof vi.fn>;
  getLastTask: ReturnType<typeof vi.fn>;
};

const mockDailyStateService = dailyStateService as unknown as {
  isDailyCapped: ReturnType<typeof vi.fn>;
  updateSystemState: ReturnType<typeof vi.fn>;
};

const mockStateEngineService = stateEngineService as unknown as {
  send: ReturnType<typeof vi.fn>;
};

const createCaller = () => {
  const ctx = { user: { userId: 'test-user' } };
  return pomodoroRouter.createCaller(ctx as never);
};

describe('pomodoroRouter - Multi-task endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDailyStateService.isDailyCapped.mockResolvedValue({ success: true, data: false });
    mockDailyStateService.updateSystemState.mockResolvedValue({ success: true });
    mockStateEngineService.send.mockResolvedValue({ success: true, from: 'idle', to: 'focus', event: 'START_POMODORO' });
  });

  describe('startTaskless', () => {
    it('should start a taskless pomodoro', async () => {
      const pomodoroData = {
        id: 'pomo-1',
        isTaskless: true,
        label: 'Deep work',
        taskId: null,
        duration: 25,
        startTime: new Date('2024-01-01T10:00:00Z'),
        task: null,
      };
      mockPomodoroService.startTaskless.mockResolvedValue({
        success: true,
        data: pomodoroData,
      });

      const caller = createCaller();
      const result = await caller.startTaskless({ label: 'Deep work' });

      expect(result).toEqual(pomodoroData);
      expect(mockPomodoroService.startTaskless).toHaveBeenCalledWith('test-user', 'Deep work');
      expect(mockStateEngineService.send).toHaveBeenCalledWith('test-user', {
        type: 'START_POMODORO',
        pomodoroId: 'pomo-1',
        taskId: null,
        isTaskless: true,
      });
    });

    it('should reject when daily cap reached', async () => {
      mockDailyStateService.isDailyCapped.mockResolvedValue({ success: true, data: true });

      const caller = createCaller();
      await expect(caller.startTaskless({})).rejects.toThrow('Daily cap reached');
    });
  });

  describe('getSummary', () => {
    it('should return pomodoro summary with time distribution', async () => {
      const summary = {
        pomodoroId: 'pomo-1',
        totalDuration: 1500,
        taskSwitchCount: 2,
        timeDistribution: [
          { taskId: 'task-1', taskTitle: 'Task 1', seconds: 900, percentage: 60 },
          { taskId: 'task-2', taskTitle: 'Task 2', seconds: 600, percentage: 40 },
        ],
      };
      mockPomodoroService.getSummary.mockResolvedValue({ success: true, data: summary });

      const caller = createCaller();
      const result = await caller.getSummary({ id: '00000000-0000-0000-0000-000000000001' });

      expect(result).toEqual(summary);
    });

    it('should throw NOT_FOUND for invalid pomodoro', async () => {
      mockPomodoroService.getSummary.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Pomodoro not found' },
      });

      const caller = createCaller();
      await expect(
        caller.getSummary({ id: '00000000-0000-0000-0000-000000000001' })
      ).rejects.toThrow('Pomodoro not found');
    });
  });

  describe('completeTask', () => {
    it('should complete task and optionally switch to next', async () => {
      mockPomodoroService.completeTaskInPomodoro.mockResolvedValue({
        success: true,
        data: { completedTaskId: 'task-1', newSliceId: 'slice-2' },
      });

      const caller = createCaller();
      const result = await caller.completeTask({
        pomodoroId: '00000000-0000-0000-0000-000000000001',
        nextTaskId: '00000000-0000-0000-0000-000000000002',
      });

      expect(result).toEqual({ completedTaskId: 'task-1', newSliceId: 'slice-2' });
    });
  });

  describe('getLastTask', () => {
    it('should return last worked task', async () => {
      mockPomodoroService.getLastTask.mockResolvedValue({
        success: true,
        data: { id: 'task-1', title: 'Last Task' },
      });

      const caller = createCaller();
      const result = await caller.getLastTask();

      expect(result).toEqual({ id: 'task-1', title: 'Last Task' });
    });
  });
});
