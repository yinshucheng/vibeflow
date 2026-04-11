import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createActor } from 'xstate';
import {
  vibeflowMachine,
  getAllowedEvents,
  isEventAllowed,
  getStateDisplayInfo,
  validateTransition,
  parseSystemState,
  serializeSystemState,
  vibeFlowMachine,
} from './vibeflow.machine';

// ── Actor helpers ──────────────────────────────────────────────────

function createIdleActor(overrides?: { todayPomodoroCount?: number; dailyCap?: number }) {
  const actor = createActor(vibeflowMachine, {
    input: {
      userId: 'test-user',
      todayPomodoroCount: overrides?.todayPomodoroCount ?? 0,
      dailyCap: overrides?.dailyCap ?? 8,
    },
  });
  actor.start();
  return actor;
}

function createFocusActor() {
  const actor = createIdleActor();
  actor.send({ type: 'START_POMODORO', pomodoroId: 'pomo-1', taskId: 'task-1' });
  return actor;
}

function createOverRestActor() {
  const actor = createFocusActor();
  actor.send({ type: 'COMPLETE_POMODORO' });
  actor.send({ type: 'ENTER_OVER_REST' });
  return actor;
}

// ── State transitions ──────────────────────────────────────────────

describe('VibeFlow 3-State Machine', () => {
  let dateNowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000000);
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
  });

  describe('initial state', () => {
    it('should start in idle', () => {
      const actor = createIdleActor();
      expect(actor.getSnapshot().value).toBe('idle');
    });

    it('should initialize context correctly', () => {
      const actor = createIdleActor({ todayPomodoroCount: 3, dailyCap: 10 });
      const ctx = actor.getSnapshot().context;
      expect(ctx.userId).toBe('test-user');
      expect(ctx.todayPomodoroCount).toBe(3);
      expect(ctx.dailyCap).toBe(10);
      expect(ctx.currentPomodoroId).toBeNull();
      expect(ctx.currentTaskId).toBeNull();
      expect(ctx.pomodoroStartTime).toBeNull();
      expect(ctx.taskStack).toEqual([]);
      expect(ctx.isTaskless).toBe(false);
      expect(ctx.lastPomodoroEndTime).toBeNull();
      expect(ctx.overRestEnteredAt).toBeNull();
      expect(ctx.overRestExitCount).toBe(0);
    });
  });

  // ── IDLE transitions ──────────────────────────────────────────

  describe('IDLE → FOCUS (START_POMODORO)', () => {
    it('should transition to focus with task', () => {
      const actor = createIdleActor();
      actor.send({ type: 'START_POMODORO', pomodoroId: 'p1', taskId: 't1' });

      const snap = actor.getSnapshot();
      expect(snap.value).toBe('focus');
      expect(snap.context.currentPomodoroId).toBe('p1');
      expect(snap.context.currentTaskId).toBe('t1');
      expect(snap.context.pomodoroStartTime).toBe(1000000);
      expect(snap.context.isTaskless).toBe(false);
      expect(snap.context.taskStack).toEqual([{ taskId: 't1', startTime: 1000000 }]);
    });

    it('should transition to focus with isTaskless', () => {
      const actor = createIdleActor();
      actor.send({ type: 'START_POMODORO', pomodoroId: 'p1', taskId: null, isTaskless: true });

      const snap = actor.getSnapshot();
      expect(snap.value).toBe('focus');
      expect(snap.context.currentTaskId).toBeNull();
      expect(snap.context.isTaskless).toBe(true);
      expect(snap.context.taskStack).toEqual([]);
    });

    it('should reject START_POMODORO when daily cap reached', () => {
      const actor = createIdleActor({ todayPomodoroCount: 8, dailyCap: 8 });
      actor.send({ type: 'START_POMODORO', pomodoroId: 'p1', taskId: 't1' });

      expect(actor.getSnapshot().value).toBe('idle');
    });

    it('should clear lastPomodoroEndTime and overRestEnteredAt on start', () => {
      // Complete one pomodoro first to set lastPomodoroEndTime
      const actor = createIdleActor();
      actor.send({ type: 'START_POMODORO', pomodoroId: 'p1', taskId: 't1' });
      actor.send({ type: 'COMPLETE_POMODORO' });
      expect(actor.getSnapshot().context.lastPomodoroEndTime).toBe(1000000);

      // Start another
      actor.send({ type: 'START_POMODORO', pomodoroId: 'p2', taskId: 't2' });
      expect(actor.getSnapshot().context.lastPomodoroEndTime).toBeNull();
      expect(actor.getSnapshot().context.overRestEnteredAt).toBeNull();
    });
  });

  describe('IDLE → OVER_REST (ENTER_OVER_REST)', () => {
    it('should transition to over_rest when lastPomodoroEndTime is set', () => {
      // Must complete a pomodoro first so lastPomodoroEndTime is set (guard)
      const actor = createIdleActor();
      actor.send({ type: 'START_POMODORO', pomodoroId: 'p1', taskId: 't1' });
      actor.send({ type: 'COMPLETE_POMODORO' });

      actor.send({ type: 'ENTER_OVER_REST' });

      expect(actor.getSnapshot().value).toBe('over_rest');
      expect(actor.getSnapshot().context.overRestEnteredAt).toBe(1000000);
    });

    it('should reject ENTER_OVER_REST when lastPomodoroEndTime is null', () => {
      const actor = createIdleActor();
      actor.send({ type: 'ENTER_OVER_REST' });

      expect(actor.getSnapshot().value).toBe('idle'); // guard blocked
    });
  });

  describe('IDLE → IDLE (DAILY_RESET)', () => {
    it('should reset all context on daily reset', () => {
      const actor = createFocusActor();
      actor.send({ type: 'COMPLETE_POMODORO' });
      // Now in idle with pomodoroCount=1
      expect(actor.getSnapshot().context.todayPomodoroCount).toBe(1);

      actor.send({ type: 'DAILY_RESET' });

      const ctx = actor.getSnapshot().context;
      expect(actor.getSnapshot().value).toBe('idle');
      expect(ctx.todayPomodoroCount).toBe(0);
      expect(ctx.currentPomodoroId).toBeNull();
      expect(ctx.lastPomodoroEndTime).toBeNull();
      expect(ctx.overRestEnteredAt).toBeNull();
      expect(ctx.overRestExitCount).toBe(0);
    });
  });

  // ── Disallowed IDLE events ────────────────────────────────────

  describe('IDLE: disallowed events', () => {
    it('should ignore COMPLETE_POMODORO in idle', () => {
      const actor = createIdleActor();
      actor.send({ type: 'COMPLETE_POMODORO' });
      expect(actor.getSnapshot().value).toBe('idle');
    });

    it('should ignore ABORT_POMODORO in idle', () => {
      const actor = createIdleActor();
      actor.send({ type: 'ABORT_POMODORO' });
      expect(actor.getSnapshot().value).toBe('idle');
    });

    it('should ignore RETURN_TO_IDLE in idle', () => {
      const actor = createIdleActor();
      actor.send({ type: 'RETURN_TO_IDLE' });
      expect(actor.getSnapshot().value).toBe('idle');
    });
  });

  // ── FOCUS transitions ─────────────────────────────────────────

  describe('FOCUS → IDLE (COMPLETE_POMODORO)', () => {
    it('should return to idle and increment count', () => {
      const actor = createFocusActor();
      actor.send({ type: 'COMPLETE_POMODORO' });

      const snap = actor.getSnapshot();
      expect(snap.value).toBe('idle');
      expect(snap.context.todayPomodoroCount).toBe(1);
      expect(snap.context.currentPomodoroId).toBeNull();
      expect(snap.context.currentTaskId).toBeNull();
      expect(snap.context.pomodoroStartTime).toBeNull();
      expect(snap.context.taskStack).toEqual([]);
      expect(snap.context.isTaskless).toBe(false);
      expect(snap.context.lastPomodoroEndTime).toBe(1000000);
    });
  });

  describe('FOCUS → IDLE (ABORT_POMODORO)', () => {
    it('should return to idle without incrementing count', () => {
      const actor = createFocusActor();
      actor.send({ type: 'ABORT_POMODORO' });

      const snap = actor.getSnapshot();
      expect(snap.value).toBe('idle');
      expect(snap.context.todayPomodoroCount).toBe(0);
      expect(snap.context.currentPomodoroId).toBeNull();
      expect(snap.context.taskStack).toEqual([]);
    });

    it('should NOT set lastPomodoroEndTime on abort', () => {
      const actor = createFocusActor();
      actor.send({ type: 'ABORT_POMODORO' });

      // Abort should not trigger OVER_REST later
      expect(actor.getSnapshot().context.lastPomodoroEndTime).toBeNull();
    });
  });

  describe('FOCUS: self-transitions', () => {
    it('SWITCH_TASK should update taskStack and currentTaskId', () => {
      const actor = createFocusActor();
      dateNowSpy.mockReturnValue(2000000);
      actor.send({ type: 'SWITCH_TASK', taskId: 'task-2', timeSliceId: 'ts-1' });

      const ctx = actor.getSnapshot().context;
      expect(actor.getSnapshot().value).toBe('focus');
      expect(ctx.currentTaskId).toBe('task-2');
      expect(ctx.taskStack).toHaveLength(2);
      expect(ctx.taskStack[1]).toEqual({ taskId: 'task-2', startTime: 2000000 });
    });

    it('COMPLETE_CURRENT_TASK should push null-taskId entry', () => {
      const actor = createFocusActor();
      dateNowSpy.mockReturnValue(2000000);
      actor.send({ type: 'COMPLETE_CURRENT_TASK' });

      const ctx = actor.getSnapshot().context;
      expect(actor.getSnapshot().value).toBe('focus');
      expect(ctx.currentTaskId).toBeNull();
      expect(ctx.taskStack).toHaveLength(2);
      expect(ctx.taskStack[1]).toEqual({ taskId: null, startTime: 2000000 });
    });
  });

  describe('FOCUS → IDLE (DAILY_RESET)', () => {
    it('should reset from focus to idle', () => {
      const actor = createFocusActor();
      actor.send({ type: 'DAILY_RESET' });

      expect(actor.getSnapshot().value).toBe('idle');
      expect(actor.getSnapshot().context.todayPomodoroCount).toBe(0);
    });
  });

  describe('FOCUS: disallowed events', () => {
    it('should ignore START_POMODORO in focus', () => {
      const actor = createFocusActor();
      actor.send({ type: 'START_POMODORO', pomodoroId: 'p2', taskId: 't2' });
      // Should stay in focus with original pomodoro
      expect(actor.getSnapshot().context.currentPomodoroId).toBe('pomo-1');
    });

    it('should ignore ENTER_OVER_REST in focus', () => {
      const actor = createFocusActor();
      actor.send({ type: 'ENTER_OVER_REST' });
      expect(actor.getSnapshot().value).toBe('focus');
    });
  });

  // ── OVER_REST transitions ────────────────────────────────────

  describe('OVER_REST → FOCUS (START_POMODORO)', () => {
    it('should allow starting pomodoro from over_rest', () => {
      const actor = createOverRestActor();
      expect(actor.getSnapshot().value).toBe('over_rest');

      actor.send({ type: 'START_POMODORO', pomodoroId: 'p2', taskId: 't2' });
      expect(actor.getSnapshot().value).toBe('focus');
      expect(actor.getSnapshot().context.currentPomodoroId).toBe('p2');
    });

    it('should reject START_POMODORO when daily cap reached', () => {
      const actor = createIdleActor({ todayPomodoroCount: 7, dailyCap: 8 });
      actor.send({ type: 'START_POMODORO', pomodoroId: 'p1', taskId: 't1' });
      actor.send({ type: 'COMPLETE_POMODORO' }); // count = 8
      actor.send({ type: 'ENTER_OVER_REST' });

      expect(actor.getSnapshot().value).toBe('over_rest');
      actor.send({ type: 'START_POMODORO', pomodoroId: 'p2', taskId: 't2' });
      expect(actor.getSnapshot().value).toBe('over_rest'); // guard blocked
    });
  });

  describe('OVER_REST → IDLE (RETURN_TO_IDLE)', () => {
    it('should allow return to idle after cooldown period', () => {
      const actor = createOverRestActor();
      expect(actor.getSnapshot().context.overRestEnteredAt).toBe(1000000);

      // Advance past 10-minute cooldown
      dateNowSpy.mockReturnValue(1000000 + 10 * 60 * 1000);
      actor.send({ type: 'RETURN_TO_IDLE' });

      expect(actor.getSnapshot().value).toBe('idle');
      expect(actor.getSnapshot().context.overRestEnteredAt).toBeNull();
      expect(actor.getSnapshot().context.overRestExitCount).toBe(1);
    });

    it('should reject RETURN_TO_IDLE before cooldown expires', () => {
      const actor = createOverRestActor();

      // Only 5 minutes elapsed
      dateNowSpy.mockReturnValue(1000000 + 5 * 60 * 1000);
      actor.send({ type: 'RETURN_TO_IDLE' });

      expect(actor.getSnapshot().value).toBe('over_rest');
    });

    it('should reject RETURN_TO_IDLE after 3 daily exits', () => {
      const actor = createIdleActor();

      // Simulate 3 over_rest→idle cycles
      for (let i = 0; i < 3; i++) {
        actor.send({ type: 'START_POMODORO', pomodoroId: `p${i}`, taskId: `t${i}` });
        actor.send({ type: 'COMPLETE_POMODORO' });
        actor.send({ type: 'ENTER_OVER_REST' });
        dateNowSpy.mockReturnValue(1000000 + (i + 1) * 20 * 60 * 1000);
        actor.send({ type: 'RETURN_TO_IDLE' });
      }

      expect(actor.getSnapshot().context.overRestExitCount).toBe(3);

      // 4th cycle: should be blocked
      actor.send({ type: 'START_POMODORO', pomodoroId: 'p3', taskId: 't3' });
      actor.send({ type: 'COMPLETE_POMODORO' });
      actor.send({ type: 'ENTER_OVER_REST' });
      dateNowSpy.mockReturnValue(1000000 + 100 * 60 * 1000);
      actor.send({ type: 'RETURN_TO_IDLE' });

      expect(actor.getSnapshot().value).toBe('over_rest'); // blocked by exit count
    });
  });

  describe('OVER_REST → IDLE (WORK_TIME_ENDED)', () => {
    it('should unconditionally return to idle', () => {
      const actor = createOverRestActor();

      // No cooldown required for WORK_TIME_ENDED
      actor.send({ type: 'WORK_TIME_ENDED' });

      expect(actor.getSnapshot().value).toBe('idle');
    });

    it('should work even when RETURN_TO_IDLE would be blocked', () => {
      const actor = createOverRestActor();

      // Not enough cooldown time
      dateNowSpy.mockReturnValue(1000000 + 1000);
      actor.send({ type: 'WORK_TIME_ENDED' });

      expect(actor.getSnapshot().value).toBe('idle');
    });

    it('should NOT increment overRestExitCount (system-initiated, not user-initiated)', () => {
      const actor = createOverRestActor();
      const exitCountBefore = actor.getSnapshot().context.overRestExitCount;

      actor.send({ type: 'WORK_TIME_ENDED' });

      expect(actor.getSnapshot().context.overRestExitCount).toBe(exitCountBefore);
    });
  });

  describe('OVER_REST → IDLE (DAILY_RESET)', () => {
    it('should reset from over_rest to idle', () => {
      const actor = createOverRestActor();
      actor.send({ type: 'DAILY_RESET' });

      expect(actor.getSnapshot().value).toBe('idle');
      expect(actor.getSnapshot().context.overRestExitCount).toBe(0);
    });
  });

  describe('OVER_REST: disallowed events', () => {
    it('should ignore COMPLETE_POMODORO in over_rest', () => {
      const actor = createOverRestActor();
      actor.send({ type: 'COMPLETE_POMODORO' });
      expect(actor.getSnapshot().value).toBe('over_rest');
    });

    it('should ignore ENTER_OVER_REST in over_rest', () => {
      const actor = createOverRestActor();
      actor.send({ type: 'ENTER_OVER_REST' });
      expect(actor.getSnapshot().value).toBe('over_rest');
    });
  });

  // ── Full lifecycle ────────────────────────────────────────────

  describe('full lifecycle', () => {
    it('IDLE→FOCUS→IDLE→OVER_REST→FOCUS→IDLE', () => {
      const actor = createIdleActor();

      actor.send({ type: 'START_POMODORO', pomodoroId: 'p1', taskId: 't1' });
      expect(actor.getSnapshot().value).toBe('focus');

      actor.send({ type: 'COMPLETE_POMODORO' });
      expect(actor.getSnapshot().value).toBe('idle');
      expect(actor.getSnapshot().context.todayPomodoroCount).toBe(1);

      actor.send({ type: 'ENTER_OVER_REST' });
      expect(actor.getSnapshot().value).toBe('over_rest');

      actor.send({ type: 'START_POMODORO', pomodoroId: 'p2', taskId: 't2' });
      expect(actor.getSnapshot().value).toBe('focus');

      actor.send({ type: 'COMPLETE_POMODORO' });
      expect(actor.getSnapshot().value).toBe('idle');
      expect(actor.getSnapshot().context.todayPomodoroCount).toBe(2);
    });
  });
});

// ── Helper functions ────────────────────────────────────────────

describe('Helper functions (3-state model)', () => {
  describe('getAllowedEvents', () => {
    it('idle: START_POMODORO, ENTER_OVER_REST, DAILY_RESET', () => {
      expect(getAllowedEvents('idle')).toEqual(
        expect.arrayContaining(['START_POMODORO', 'ENTER_OVER_REST', 'DAILY_RESET']),
      );
    });

    it('focus: COMPLETE_POMODORO, ABORT_POMODORO, SWITCH_TASK, COMPLETE_CURRENT_TASK, DAILY_RESET', () => {
      const events = getAllowedEvents('focus');
      expect(events).toContain('COMPLETE_POMODORO');
      expect(events).toContain('ABORT_POMODORO');
      expect(events).toContain('SWITCH_TASK');
      expect(events).toContain('COMPLETE_CURRENT_TASK');
      expect(events).toContain('DAILY_RESET');
    });

    it('over_rest: START_POMODORO, RETURN_TO_IDLE, WORK_TIME_ENDED, DAILY_RESET', () => {
      const events = getAllowedEvents('over_rest');
      expect(events).toContain('START_POMODORO');
      expect(events).toContain('RETURN_TO_IDLE');
      expect(events).toContain('WORK_TIME_ENDED');
      expect(events).toContain('DAILY_RESET');
    });

    it('unknown state returns empty array', () => {
      expect(getAllowedEvents('bogus' as never)).toEqual([]);
    });
  });

  describe('isEventAllowed', () => {
    it('allows START_POMODORO in idle', () => {
      expect(isEventAllowed('idle', 'START_POMODORO')).toBe(true);
    });

    it('rejects START_POMODORO in focus', () => {
      expect(isEventAllowed('focus', 'START_POMODORO')).toBe(false);
    });
  });

  describe('getStateDisplayInfo', () => {
    it('returns correct info for idle', () => {
      const info = getStateDisplayInfo('idle');
      expect(info.state).toBe('idle');
      expect(info.label).toBe('Idle');
    });

    it('returns correct info for focus', () => {
      const info = getStateDisplayInfo('focus');
      expect(info.state).toBe('focus');
      expect(info.color).toBe('green');
    });

    it('returns correct info for over_rest', () => {
      const info = getStateDisplayInfo('over_rest');
      expect(info.state).toBe('over_rest');
      expect(info.color).toBe('orange');
    });

    it('returns idle fallback for unknown state', () => {
      const info = getStateDisplayInfo('bogus' as never);
      expect(info.state).toBe('idle');
      expect(info.label).toBe('Unknown');
    });
  });

  describe('validateTransition', () => {
    it('returns null for valid transition', () => {
      expect(validateTransition('idle', 'START_POMODORO')).toBeNull();
    });

    it('returns error message for invalid transition', () => {
      const msg = validateTransition('idle', 'COMPLETE_POMODORO');
      expect(msg).toContain('Cannot perform COMPLETE_POMODORO');
      expect(msg).toContain('idle');
    });
  });

  describe('parseSystemState (legacy compat)', () => {
    it('maps old states through normalizeState', () => {
      expect(parseSystemState('LOCKED')).toBe('idle');
      expect(parseSystemState('PLANNING')).toBe('idle');
      expect(parseSystemState('REST')).toBe('idle');
      expect(parseSystemState('FOCUS')).toBe('focus');
      expect(parseSystemState('OVER_REST')).toBe('over_rest');
    });
  });

  describe('serializeSystemState (legacy compat)', () => {
    it('serializes to UPPERCASE', () => {
      expect(serializeSystemState('idle')).toBe('IDLE');
      expect(serializeSystemState('focus')).toBe('FOCUS');
      expect(serializeSystemState('over_rest')).toBe('OVER_REST');
    });
  });

  describe('vibeFlowMachine alias', () => {
    it('should be the same reference as vibeflowMachine', () => {
      expect(vibeFlowMachine).toBe(vibeflowMachine);
    });
  });
});
