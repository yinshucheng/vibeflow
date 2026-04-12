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

// ── Mock idle.service (isWithinWorkHours) ─────────────────────────────

const mockIsWithinWorkHours = vi.hoisted(() => vi.fn().mockReturnValue(true));

vi.mock('./idle.service', () => ({
  isWithinWorkHours: mockIsWithinWorkHours,
  parseTimeToMinutes: vi.fn(),
  getCurrentTimeMinutes: vi.fn(),
}));

// ── Mock focus-session.service ────────────────────────────────────────

const mockIsInFocusSession = vi.hoisted(() => vi.fn().mockResolvedValue({ success: true, data: false }));

vi.mock('./focus-session.service', () => ({
  focusSessionService: {
    isInFocusSession: mockIsInFocusSession,
    getActiveSession: vi.fn().mockResolvedValue({ success: true, data: null }),
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

    it('should reject START_POMODORO when daily cap is reached (GUARD_FAILED)', async () => {
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
        // START_POMODORO is a valid event in idle, but guard (canStartPomodoro) fails
        expect(result.error).toBe('GUARD_FAILED');
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

  // ── Integration-style multi-step transitions ──────────────────────

  describe('multi-step transitions', () => {
    /**
     * Helper: setup mocks so that each send() call reads fresh state.
     * Tracks the "current state" in a closure that updates after each $transaction.
     */
    function setupStatefulMocks(initial: { systemState: string; pomodoroCount: number }) {
      let currentSystemState = initial.systemState;
      let currentPomodoroCount = initial.pomodoroCount;
      let currentLastPomodoroEndTime: Date | null = null;

      mockDailyStateService.getOrCreateToday.mockImplementation(async () => ({
        success: true,
        data: makeDailyState({
          systemState: currentSystemState,
          pomodoroCount: currentPomodoroCount,
          lastPomodoroEndTime: currentLastPomodoroEndTime,
        }),
      }));

      mockPrisma.userSettings.findFirst.mockResolvedValue(
        makeSettings({ dailyCap: 8, shortRestDuration: 5, overRestGracePeriod: 5 }),
      );
      mockPrisma.pomodoro.findFirst.mockResolvedValue(null);

      mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
        const mockUpdate = vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          // Track state changes from the transaction
          if (data.systemState) currentSystemState = data.systemState as string;
          if (typeof data.pomodoroCount === 'number') currentPomodoroCount = data.pomodoroCount;
          if (data.lastPomodoroEndTime !== undefined) {
            currentLastPomodoroEndTime = data.lastPomodoroEndTime as Date | null;
          }
        });
        await fn({
          dailyState: { update: mockUpdate },
          stateTransitionLog: { create: vi.fn() },
        });
      });

      return { getCurrentState: () => currentSystemState };
    }

    it('should complete IDLE→FOCUS→IDLE round-trip (START + COMPLETE)', async () => {
      const tracker = setupStatefulMocks({ systemState: 'IDLE', pomodoroCount: 0 });

      // Step 1: START_POMODORO (IDLE → FOCUS)
      const startResult = await stateEngineService.send(TEST_USER_ID, {
        type: 'START_POMODORO',
        pomodoroId: 'pomo-round-1',
        taskId: 'task-round-1',
      });

      expect(startResult).toEqual({
        success: true,
        from: 'idle',
        to: 'focus',
        event: 'START_POMODORO',
      });
      expect(tracker.getCurrentState()).toBe('FOCUS');

      // Step 2: COMPLETE_POMODORO (FOCUS → IDLE)
      const completeResult = await stateEngineService.send(TEST_USER_ID, {
        type: 'COMPLETE_POMODORO',
      });

      expect(completeResult).toEqual({
        success: true,
        from: 'focus',
        to: 'idle',
        event: 'COMPLETE_POMODORO',
      });
      expect(tracker.getCurrentState()).toBe('IDLE');
    });

    it('should complete IDLE→FOCUS→IDLE round-trip (START + ABORT)', async () => {
      setupStatefulMocks({ systemState: 'IDLE', pomodoroCount: 0 });

      const startResult = await stateEngineService.send(TEST_USER_ID, {
        type: 'START_POMODORO',
        pomodoroId: 'pomo-abort-1',
        taskId: 'task-abort-1',
      });
      expect(startResult.success).toBe(true);

      const abortResult = await stateEngineService.send(TEST_USER_ID, {
        type: 'ABORT_POMODORO',
      });

      expect(abortResult).toEqual({
        success: true,
        from: 'focus',
        to: 'idle',
        event: 'ABORT_POMODORO',
      });
    });

    it('should transition IDLE→OVER_REST via ENTER_OVER_REST', async () => {
      const lastEndTime = new Date(Date.now() - 15 * 60 * 1000); // 15 min ago
      const tracker = setupStatefulMocks({ systemState: 'IDLE', pomodoroCount: 1 });

      // Override to include lastPomodoroEndTime
      mockDailyStateService.getOrCreateToday.mockResolvedValue({
        success: true,
        data: makeDailyState({
          systemState: 'IDLE',
          pomodoroCount: 1,
          lastPomodoroEndTime: lastEndTime,
        }),
      });

      const result = await stateEngineService.send(TEST_USER_ID, {
        type: 'ENTER_OVER_REST',
      });

      expect(result).toEqual({
        success: true,
        from: 'idle',
        to: 'over_rest',
        event: 'ENTER_OVER_REST',
      });
      expect(tracker.getCurrentState()).toBe('OVER_REST');
    });

    it('should complete full cycle: IDLE→FOCUS→IDLE→OVER_REST→FOCUS', async () => {
      const tracker = setupStatefulMocks({ systemState: 'IDLE', pomodoroCount: 0 });

      // 1. Start pomodoro
      const r1 = await stateEngineService.send(TEST_USER_ID, {
        type: 'START_POMODORO',
        pomodoroId: 'p1',
        taskId: 't1',
      });
      expect(r1.success).toBe(true);

      // 2. Complete pomodoro
      const r2 = await stateEngineService.send(TEST_USER_ID, {
        type: 'COMPLETE_POMODORO',
      });
      expect(r2.success).toBe(true);

      // 3. Enter over rest
      const r3 = await stateEngineService.send(TEST_USER_ID, {
        type: 'ENTER_OVER_REST',
      });
      expect(r3.success).toBe(true);
      expect(tracker.getCurrentState()).toBe('OVER_REST');

      // 4. Start new pomodoro from OVER_REST
      const r4 = await stateEngineService.send(TEST_USER_ID, {
        type: 'START_POMODORO',
        pomodoroId: 'p2',
        taskId: 't2',
      });
      expect(r4).toEqual({
        success: true,
        from: 'over_rest',
        to: 'focus',
        event: 'START_POMODORO',
      });
    });
  });

  // ── Guard rejection side effects ─────────────────────────────────

  describe('guard rejection side effects', () => {
    it('should not broadcast when transition is rejected', async () => {
      const mockBroadcaster = vi.fn().mockResolvedValue(undefined);
      // Register the broadcaster so we can assert it's NOT called
      stateEngineService.registerFullStateBroadcaster(mockBroadcaster);

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
      expect(mockBroadcaster).not.toHaveBeenCalled();

      // Clean up: reset broadcaster
      stateEngineService.registerFullStateBroadcaster(null as unknown as (userId: string) => Promise<void>);
    });
  });

  // ── scheduleOverRestTimer work hours + focus session checks ──────

  describe('scheduleOverRestTimer (work hours + focus session)', () => {
    /**
     * Helper: complete a pomodoro so that scheduleOverRestTimer fires.
     * Uses stateful mocks so the IDLE transition triggers the timer.
     */
    async function triggerOverRestSchedule(opts: {
      withinWorkHours: boolean;
      inFocusSession: boolean;
      shortRestDuration?: number;
      overRestGracePeriod?: number;
    }) {
      const { withinWorkHours, inFocusSession, shortRestDuration = 5, overRestGracePeriod = 5 } = opts;

      mockIsWithinWorkHours.mockReturnValue(withinWorkHours);
      mockIsInFocusSession.mockResolvedValue({ success: true, data: inFocusSession });

      let currentSystemState = 'FOCUS';
      let currentLastPomodoroEndTime: Date | null = null;

      mockDailyStateService.getOrCreateToday.mockImplementation(async () => ({
        success: true,
        data: makeDailyState({
          systemState: currentSystemState,
          pomodoroCount: 1,
          lastPomodoroEndTime: currentLastPomodoroEndTime,
        }),
      }));

      mockPrisma.userSettings.findFirst.mockResolvedValue(
        makeSettings({
          shortRestDuration,
          overRestGracePeriod,
          workTimeSlots: [{ id: '1', startTime: '09:00', endTime: '18:00', enabled: true }],
        }),
      );
      mockPrisma.pomodoro.findFirst.mockResolvedValue(null);

      mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
        const mockUpdate = vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          if (data.systemState) currentSystemState = data.systemState as string;
          if (data.lastPomodoroEndTime !== undefined) {
            currentLastPomodoroEndTime = data.lastPomodoroEndTime as Date | null;
          }
        });
        await fn({
          dailyState: { update: mockUpdate },
          stateTransitionLog: { create: vi.fn() },
        });
      });

      // COMPLETE_POMODORO transitions FOCUS→IDLE and triggers scheduleOverRestTimer
      const result = await stateEngineService.send(TEST_USER_ID, {
        type: 'COMPLETE_POMODORO',
      });

      expect(result.success).toBe(true);
      return result;
    }

    it('should schedule timer when within work hours (no focus session)', async () => {
      await triggerOverRestSchedule({ withinWorkHours: true, inFocusSession: false });

      // Give async scheduleOverRestTimer a tick to run
      await new Promise((r) => setTimeout(r, 50));

      expect(stateEngineService._overRestTimers.has(TEST_USER_ID)).toBe(true);
    });

    it('should schedule timer when in focus session (not within work hours)', async () => {
      await triggerOverRestSchedule({ withinWorkHours: false, inFocusSession: true });

      await new Promise((r) => setTimeout(r, 50));

      expect(stateEngineService._overRestTimers.has(TEST_USER_ID)).toBe(true);
    });

    it('should NOT schedule timer when outside work hours and no focus session', async () => {
      await triggerOverRestSchedule({ withinWorkHours: false, inFocusSession: false });

      await new Promise((r) => setTimeout(r, 50));

      expect(stateEngineService._overRestTimers.has(TEST_USER_ID)).toBe(false);
    });
  });
});
