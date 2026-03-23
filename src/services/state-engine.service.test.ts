/**
 * StateEngine Service — Unit Tests
 *
 * Tests for buildContext(), withLock(), send() (basic transitions),
 * and timer skeleton.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock prisma ────────────────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  userSettings: {
    findFirst: vi.fn(),
  },
  pomodoro: {
    findFirst: vi.fn(),
  },
  dailyState: {
    update: vi.fn(),
  },
  stateTransitionLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
}));

// ── Mock dailyStateService ─────────────────────────────────────────────

const mockDailyStateService = vi.hoisted(() => ({
  getOrCreateToday: vi.fn(),
}));

vi.mock('./daily-state.service', () => ({
  dailyStateService: mockDailyStateService,
}));

// ── Mock mcpEventService ───────────────────────────────────────────────

vi.mock('./mcp-event.service', () => ({
  mcpEventService: {
    publish: vi.fn().mockResolvedValue(undefined),
  },
}));

// ── Import after mocks ────────────────────────────────────────────────

import { stateEngineService, type TransitionResult } from './state-engine.service';

// ── Test helpers ───────────────────────────────────────────────────────

const TEST_USER_ID = 'test-user-123';

function makeDailyState(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ds-1',
    userId: TEST_USER_ID,
    date: new Date('2025-03-24'),
    systemState: 'IDLE',
    top3TaskIds: [],
    pomodoroCount: 3,
    capOverrideCount: 0,
    airlockCompleted: false,
    adjustedGoal: null,
    lastPomodoroEndTime: null,
    overRestEnteredAt: null,
    overRestExitCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeSettings(overrides: Record<string, unknown> = {}) {
  return {
    id: 'settings-1',
    userId: TEST_USER_ID,
    dailyCap: 8,
    ...overrides,
  };
}

function makePomodoro(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pomo-1',
    userId: TEST_USER_ID,
    duration: 25,
    startTime: new Date('2025-03-24T10:00:00Z'),
    endTime: null,
    status: 'IN_PROGRESS',
    taskId: 'task-1',
    isTaskless: false,
    taskSwitchCount: 0,
    label: null,
    summary: null,
    timeSlices: [
      {
        id: 'ts-1',
        pomodoroId: 'pomo-1',
        taskId: 'task-1',
        startTime: new Date('2025-03-24T10:00:00Z'),
        endTime: null,
        durationSeconds: null,
        isFragment: false,
      },
    ],
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('StateEngineService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear internal locks and timers
    stateEngineService._locks.clear();
    stateEngineService._overRestTimers.forEach((t) => clearTimeout(t));
    stateEngineService._overRestTimers.clear();
  });

  // ── buildContext ─────────────────────────────────────────────────────

  describe('buildContext', () => {
    it('should build context from IDLE state with no active pomodoro', async () => {
      const dailyState = makeDailyState({ pomodoroCount: 5 });

      mockPrisma.userSettings.findFirst.mockResolvedValue(makeSettings({ dailyCap: 10 }));
      mockPrisma.pomodoro.findFirst.mockResolvedValue(null);

      const context = await stateEngineService.buildContext(TEST_USER_ID, dailyState as never);

      expect(context).toEqual({
        userId: TEST_USER_ID,
        todayPomodoroCount: 5,
        dailyCap: 10,
        currentPomodoroId: null,
        currentTaskId: null,
        pomodoroStartTime: null,
        taskStack: [],
        isTaskless: false,
        lastPomodoroEndTime: null,
        overRestEnteredAt: null,
        overRestExitCount: 0,
      });
    });

    it('should build context with active pomodoro and time slices', async () => {
      const startTime = new Date('2025-03-24T10:00:00Z');
      const sliceTime = new Date('2025-03-24T10:00:00Z');
      const dailyState = makeDailyState({ pomodoroCount: 2, systemState: 'FOCUS' });
      const pomodoro = makePomodoro({
        id: 'pomo-active',
        taskId: 'task-42',
        startTime,
        isTaskless: false,
        timeSlices: [
          {
            id: 'ts-1',
            pomodoroId: 'pomo-active',
            taskId: 'task-42',
            startTime: sliceTime,
            endTime: null,
            durationSeconds: null,
            isFragment: false,
          },
          {
            id: 'ts-2',
            pomodoroId: 'pomo-active',
            taskId: 'task-43',
            startTime: new Date('2025-03-24T10:15:00Z'),
            endTime: null,
            durationSeconds: null,
            isFragment: false,
          },
        ],
      });

      mockPrisma.userSettings.findFirst.mockResolvedValue(makeSettings());
      mockPrisma.pomodoro.findFirst.mockResolvedValue(pomodoro);

      const context = await stateEngineService.buildContext(TEST_USER_ID, dailyState as never);

      expect(context.currentPomodoroId).toBe('pomo-active');
      expect(context.currentTaskId).toBe('task-42');
      expect(context.pomodoroStartTime).toBe(startTime.getTime());
      expect(context.isTaskless).toBe(false);
      expect(context.taskStack).toEqual([
        { taskId: 'task-42', startTime: sliceTime.getTime() },
        { taskId: 'task-43', startTime: new Date('2025-03-24T10:15:00Z').getTime() },
      ]);
    });

    it('should build context with taskless pomodoro', async () => {
      const dailyState = makeDailyState({ systemState: 'FOCUS' });
      const pomodoro = makePomodoro({
        taskId: null,
        isTaskless: true,
        timeSlices: [],
      });

      mockPrisma.userSettings.findFirst.mockResolvedValue(makeSettings());
      mockPrisma.pomodoro.findFirst.mockResolvedValue(pomodoro);

      const context = await stateEngineService.buildContext(TEST_USER_ID, dailyState as never);

      expect(context.currentTaskId).toBeNull();
      expect(context.isTaskless).toBe(true);
      expect(context.taskStack).toEqual([]);
    });

    it('should use default dailyCap=8 when no settings exist', async () => {
      const dailyState = makeDailyState();

      mockPrisma.userSettings.findFirst.mockResolvedValue(null);
      mockPrisma.pomodoro.findFirst.mockResolvedValue(null);

      const context = await stateEngineService.buildContext(TEST_USER_ID, dailyState as never);

      expect(context.dailyCap).toBe(8);
    });

    it('should restore lastPomodoroEndTime from DailyState', async () => {
      const endTime = new Date('2025-03-24T10:30:00Z');
      const dailyState = makeDailyState({ lastPomodoroEndTime: endTime });

      mockPrisma.userSettings.findFirst.mockResolvedValue(makeSettings());
      mockPrisma.pomodoro.findFirst.mockResolvedValue(null);

      const context = await stateEngineService.buildContext(TEST_USER_ID, dailyState as never);

      expect(context.lastPomodoroEndTime).toBe(endTime.getTime());
    });

    it('should restore overRestEnteredAt and overRestExitCount from DailyState', async () => {
      const enteredAt = new Date('2025-03-24T11:00:00Z');
      const dailyState = makeDailyState({
        overRestEnteredAt: enteredAt,
        overRestExitCount: 2,
      });

      mockPrisma.userSettings.findFirst.mockResolvedValue(makeSettings());
      mockPrisma.pomodoro.findFirst.mockResolvedValue(null);

      const context = await stateEngineService.buildContext(TEST_USER_ID, dailyState as never);

      expect(context.overRestEnteredAt).toBe(enteredAt.getTime());
      expect(context.overRestExitCount).toBe(2);
    });

    it('should query prisma with correct parameters', async () => {
      const dailyState = makeDailyState();

      mockPrisma.userSettings.findFirst.mockResolvedValue(makeSettings());
      mockPrisma.pomodoro.findFirst.mockResolvedValue(null);

      await stateEngineService.buildContext(TEST_USER_ID, dailyState as never);

      expect(mockPrisma.userSettings.findFirst).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID },
      });
      expect(mockPrisma.pomodoro.findFirst).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID, status: 'IN_PROGRESS' },
        include: { timeSlices: { orderBy: { startTime: 'asc' } } },
      });
    });
  });

  // ── withLock (tested through send) ──────────────────────────────────

  describe('withLock (concurrency)', () => {
    it('should serialize concurrent send() calls for the same userId', async () => {
      const order: number[] = [];
      const dailyState = makeDailyState({ pomodoroCount: 0 });

      mockDailyStateService.getOrCreateToday.mockResolvedValue({
        success: true,
        data: dailyState,
      });
      mockPrisma.userSettings.findFirst.mockResolvedValue(makeSettings());
      mockPrisma.pomodoro.findFirst.mockResolvedValue(null);

      // Mock $transaction to introduce a delay and track order
      let callCount = 0;
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
        const myCount = ++callCount;
        // Simulate some async work
        await new Promise((r) => setTimeout(r, myCount === 1 ? 50 : 10));
        order.push(myCount);
        await fn({
          dailyState: { update: vi.fn() },
          stateTransitionLog: { create: vi.fn() },
        });
      });

      // Fire two send() calls concurrently
      const [result1, result2] = await Promise.all([
        stateEngineService.send(TEST_USER_ID, {
          type: 'START_POMODORO',
          pomodoroId: 'p1',
          taskId: 't1',
        }),
        stateEngineService.send(TEST_USER_ID, {
          type: 'START_POMODORO',
          pomodoroId: 'p2',
          taskId: 't2',
        }),
      ]);

      // First call should complete before second starts
      expect(order).toEqual([1, 2]);

      // First should succeed (IDLE→FOCUS), second should fail or succeed
      // depending on what the mock returns for the second read
      expect(result1.success || result2.success).toBe(true);
    });
  });

  // ── send() basic transitions ────────────────────────────────────────

  describe('send()', () => {
    it('should transition IDLE→FOCUS on START_POMODORO', async () => {
      const dailyState = makeDailyState({ pomodoroCount: 0 });

      mockDailyStateService.getOrCreateToday.mockResolvedValue({
        success: true,
        data: dailyState,
      });
      mockPrisma.userSettings.findFirst.mockResolvedValue(makeSettings({ dailyCap: 8 }));
      mockPrisma.pomodoro.findFirst.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
        await fn({
          dailyState: { update: vi.fn() },
          stateTransitionLog: { create: vi.fn() },
        });
      });

      const result = await stateEngineService.send(TEST_USER_ID, {
        type: 'START_POMODORO',
        pomodoroId: 'pomo-1',
        taskId: 'task-1',
      });

      expect(result).toEqual({
        success: true,
        from: 'idle',
        to: 'focus',
        event: 'START_POMODORO',
      });
    });

    it('should reject START_POMODORO when daily cap is reached', async () => {
      const dailyState = makeDailyState({ pomodoroCount: 8 });

      mockDailyStateService.getOrCreateToday.mockResolvedValue({
        success: true,
        data: dailyState,
      });
      mockPrisma.userSettings.findFirst.mockResolvedValue(makeSettings({ dailyCap: 8 }));
      mockPrisma.pomodoro.findFirst.mockResolvedValue(null);

      const result = await stateEngineService.send(TEST_USER_ID, {
        type: 'START_POMODORO',
        pomodoroId: 'pomo-1',
        taskId: 'task-1',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INVALID_TRANSITION');
        expect(result.currentState).toBe('idle');
      }
    });

    it('should reject COMPLETE_POMODORO when in IDLE state', async () => {
      const dailyState = makeDailyState({ systemState: 'IDLE' });

      mockDailyStateService.getOrCreateToday.mockResolvedValue({
        success: true,
        data: dailyState,
      });
      mockPrisma.userSettings.findFirst.mockResolvedValue(makeSettings());
      mockPrisma.pomodoro.findFirst.mockResolvedValue(null);

      const result = await stateEngineService.send(TEST_USER_ID, {
        type: 'COMPLETE_POMODORO',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INVALID_TRANSITION');
        expect(result.currentState).toBe('idle');
      }
    });

    it('should return INTERNAL_ERROR when dailyState read fails', async () => {
      mockDailyStateService.getOrCreateToday.mockResolvedValue({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'DB down' },
      });

      const result = await stateEngineService.send(TEST_USER_ID, {
        type: 'START_POMODORO',
        pomodoroId: 'pomo-1',
        taskId: 'task-1',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INTERNAL_ERROR');
      }
    });

    it('should normalize legacy state values (LOCKED→idle)', async () => {
      const dailyState = makeDailyState({ systemState: 'LOCKED' });

      mockDailyStateService.getOrCreateToday.mockResolvedValue({
        success: true,
        data: dailyState,
      });
      mockPrisma.userSettings.findFirst.mockResolvedValue(makeSettings());
      mockPrisma.pomodoro.findFirst.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
        await fn({
          dailyState: { update: vi.fn() },
          stateTransitionLog: { create: vi.fn() },
        });
      });

      const result = await stateEngineService.send(TEST_USER_ID, {
        type: 'START_POMODORO',
        pomodoroId: 'pomo-1',
        taskId: 'task-1',
      });

      // LOCKED normalizes to idle, so START_POMODORO should work
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.from).toBe('idle');
        expect(result.to).toBe('focus');
      }
    });

    it('should write transition log in $transaction', async () => {
      const dailyState = makeDailyState({ pomodoroCount: 0 });

      mockDailyStateService.getOrCreateToday.mockResolvedValue({
        success: true,
        data: dailyState,
      });
      mockPrisma.userSettings.findFirst.mockResolvedValue(makeSettings());
      mockPrisma.pomodoro.findFirst.mockResolvedValue(null);

      const mockTx = {
        dailyState: { update: vi.fn() },
        stateTransitionLog: { create: vi.fn() },
      };
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
        await fn(mockTx);
      });

      await stateEngineService.send(TEST_USER_ID, {
        type: 'START_POMODORO',
        pomodoroId: 'pomo-1',
        taskId: 'task-1',
      });

      expect(mockTx.stateTransitionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: TEST_USER_ID,
          fromState: 'idle',
          toState: 'focus',
          event: 'START_POMODORO',
        }),
      });
    });

    it('should not write to DB when transition is rejected', async () => {
      const dailyState = makeDailyState({ systemState: 'IDLE' });

      mockDailyStateService.getOrCreateToday.mockResolvedValue({
        success: true,
        data: dailyState,
      });
      mockPrisma.userSettings.findFirst.mockResolvedValue(makeSettings());
      mockPrisma.pomodoro.findFirst.mockResolvedValue(null);

      await stateEngineService.send(TEST_USER_ID, {
        type: 'COMPLETE_POMODORO',
      });

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ── getState ────────────────────────────────────────────────────────

  describe('getState()', () => {
    it('should return normalized state from DB', async () => {
      mockDailyStateService.getOrCreateToday.mockResolvedValue({
        success: true,
        data: makeDailyState({ systemState: 'FOCUS' }),
      });

      const state = await stateEngineService.getState(TEST_USER_ID);
      expect(state).toBe('focus');
    });

    it('should normalize legacy state values', async () => {
      mockDailyStateService.getOrCreateToday.mockResolvedValue({
        success: true,
        data: makeDailyState({ systemState: 'PLANNING' }),
      });

      const state = await stateEngineService.getState(TEST_USER_ID);
      expect(state).toBe('idle');
    });

    it('should return idle when dailyState read fails', async () => {
      mockDailyStateService.getOrCreateToday.mockResolvedValue({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'DB down' },
      });

      const state = await stateEngineService.getState(TEST_USER_ID);
      expect(state).toBe('idle');
    });
  });

  // ── Timer skeleton ──────────────────────────────────────────────────

  describe('timer management', () => {
    it('should clear overRest timer via _clearOverRestTimer', () => {
      const timer = setTimeout(() => {}, 10000);
      stateEngineService._overRestTimers.set(TEST_USER_ID, timer);

      stateEngineService._clearOverRestTimer(TEST_USER_ID);

      expect(stateEngineService._overRestTimers.has(TEST_USER_ID)).toBe(false);
    });

    it('should be a no-op when no timer exists', () => {
      // Should not throw
      stateEngineService._clearOverRestTimer('nonexistent-user');
    });
  });
});
