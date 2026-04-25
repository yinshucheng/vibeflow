/**
 * Integration Tests: blocking.service.ts Orchestration Logic (E2)
 *
 * Tests the subscribe callback's coordination logic by extracting
 * and testing the decision functions that drive schedule management,
 * context sync, and evaluation ordering.
 *
 * These tests verify the LOGIC of the orchestration without requiring
 * actual Zustand store or native module mocking — which is fragile
 * due to module-level singleton initialization.
 */

import { evaluateBlockingReason, evaluateBlockingReasonIgnoringTempUnblock } from '../src/utils/blocking-reason';
import type { BlockingReasonInput } from '../src/utils/blocking-reason';
import type {
  ActivePomodoroData,
  PolicyData,
  BlockingReason,
} from '../src/types';

// =============================================================================
// HELPERS
// =============================================================================

function makePomodoro(overrides: Partial<ActivePomodoroData> = {}): ActivePomodoroData {
  return {
    id: 'pom-1',
    taskId: 'task-1',
    taskTitle: 'Test Task',
    startTime: Date.now(),
    duration: 25,
    status: 'active',
    ...overrides,
  };
}

function makePolicy(overrides: Partial<PolicyData> = {}): PolicyData {
  return {
    version: 1,
    distractionApps: [],
    updatedAt: Date.now(),
    ...overrides,
  };
}

// =============================================================================
// Types mirroring blocking.service.ts internals
// =============================================================================

interface BlockingContext {
  currentBlockingReason: string | null;
  sleepScheduleActive: boolean;
  sleepStartHour: number | null;
  sleepStartMinute: number | null;
  sleepEndHour: number | null;
  sleepEndMinute: number | null;
  overRestActive: boolean;
}

interface ScheduleAction {
  type: 'register_pomodoro' | 'cancel_pomodoro' | 'register_temp_unblock' | 'cancel_temp_unblock' | 'register_sleep' | 'clear_sleep' | 'sync_context' | 'evaluate' | 'none';
  payload?: any;
}

// =============================================================================
// Extracted orchestration logic (mirrors blocking.service.ts subscribe callback)
// =============================================================================

/**
 * Computes the endTimeMs from a pomodoro, with D2 startTime unit defense.
 */
function computePomodoroEndTime(pomodoro: ActivePomodoroData): number {
  const startTimeMs = pomodoro.startTime > 1e12 ? pomodoro.startTime : pomodoro.startTime * 1000;
  return startTimeMs + pomodoro.duration * 60 * 1000;
}

/**
 * Determines what schedule actions to take based on state transitions.
 * This mirrors the logic in blocking.service.ts startListening() subscribe callback.
 */
function computeScheduleActions(
  prev: {
    pomodoroId: string | null;
    pomodoroStatus: string | null;
    tempUnblockActive: boolean;
    tempUnblockEndTime: number;
    sleepEnabled: boolean;
    sleepStart: string;
    sleepEnd: string;
    policyVersion: number;
    sleepActive: boolean;
    overRest: boolean;
  },
  cur: {
    pomodoroId: string | null;
    pomodoroStatus: string | null;
    tempUnblockActive: boolean;
    tempUnblockEndTime: number;
    sleepEnabled: boolean;
    sleepStart: string;
    sleepEnd: string;
    policyVersion: number;
    sleepActive: boolean;
    overRest: boolean;
    activePomodoro: ActivePomodoroData | null;
    policy: PolicyData | null;
    dailyState: any;
  }
): ScheduleAction[] {
  const actions: ScheduleAction[] = [];

  const pomodoroChanged =
    prev.pomodoroId !== cur.pomodoroId ||
    prev.pomodoroStatus !== cur.pomodoroStatus;

  const tempUnblockChanged =
    prev.tempUnblockActive !== cur.tempUnblockActive ||
    prev.tempUnblockEndTime !== cur.tempUnblockEndTime;

  const policyChanged =
    prev.policyVersion !== cur.policyVersion ||
    prev.sleepActive !== cur.sleepActive ||
    prev.overRest !== cur.overRest ||
    tempUnblockChanged;

  const sleepScheduleChanged =
    prev.sleepEnabled !== cur.sleepEnabled ||
    prev.sleepStart !== cur.sleepStart ||
    prev.sleepEnd !== cur.sleepEnd;

  // Sleep schedule management
  if (sleepScheduleChanged) {
    if (cur.sleepEnabled && cur.sleepStart && cur.sleepEnd) {
      actions.push({ type: 'register_sleep', payload: { start: cur.sleepStart, end: cur.sleepEnd } });
    } else if (!cur.sleepEnabled) {
      actions.push({ type: 'clear_sleep' });
    }
  }

  // A1: Sync context BEFORE schedule registration
  if (pomodoroChanged || tempUnblockChanged) {
    actions.push({ type: 'sync_context' });
  }

  // Pomodoro schedule management
  if (pomodoroChanged) {
    const wasActive = prev.pomodoroId !== null && prev.pomodoroStatus === 'active';
    const isActive = cur.pomodoroId !== null && cur.pomodoroStatus === 'active';

    if (!wasActive && isActive && cur.activePomodoro) {
      const endTimeMs = computePomodoroEndTime(cur.activePomodoro);
      actions.push({ type: 'register_pomodoro', payload: { endTimeMs } });
    } else if (wasActive && !isActive) {
      actions.push({ type: 'cancel_pomodoro' });
    }
  }

  // Temp unblock schedule management
  if (tempUnblockChanged) {
    if (cur.tempUnblockActive && cur.tempUnblockEndTime > Date.now()) {
      const reasonToRestore = evaluateBlockingReasonIgnoringTempUnblock({
        activePomodoro: cur.activePomodoro,
        policy: cur.policy,
        dailyState: cur.dailyState,
      });
      if (reasonToRestore) {
        actions.push({
          type: 'register_temp_unblock',
          payload: { endTimeMs: cur.tempUnblockEndTime, reason: reasonToRestore },
        });
      }
    } else if (!cur.tempUnblockActive && prev.tempUnblockActive) {
      actions.push({ type: 'cancel_temp_unblock' });
    }
  }

  // Evaluate blocking state (via serialized queue)
  if (pomodoroChanged || policyChanged) {
    actions.push({ type: 'evaluate' });
  }

  return actions;
}

/**
 * Build BlockingContext from state (mirrors syncBlockingContext in blocking.service.ts).
 */
function buildBlockingContext(
  activePomodoro: ActivePomodoroData | null,
  policy: PolicyData | null,
  dailyState: any
): BlockingContext {
  const reason = evaluateBlockingReason({ activePomodoro, policy, dailyState });
  return {
    currentBlockingReason: reason,
    sleepScheduleActive: !!(
      policy?.sleepTime?.enabled &&
      policy.sleepTime.isCurrentlyActive &&
      !policy.sleepTime.isSnoozed
    ),
    sleepStartHour: policy?.sleepTime?.startTime ? parseInt(policy.sleepTime.startTime.split(':')[0], 10) : null,
    sleepStartMinute: policy?.sleepTime?.startTime ? parseInt(policy.sleepTime.startTime.split(':')[1], 10) : null,
    sleepEndHour: policy?.sleepTime?.endTime ? parseInt(policy.sleepTime.endTime.split(':')[0], 10) : null,
    sleepEndMinute: policy?.sleepTime?.endTime ? parseInt(policy.sleepTime.endTime.split(':')[1], 10) : null,
    overRestActive: !!(policy?.overRest?.isOverRest),
  };
}

// Default "no state" for prev
const EMPTY_PREV = {
  pomodoroId: null as string | null,
  pomodoroStatus: null as string | null,
  tempUnblockActive: false,
  tempUnblockEndTime: 0,
  sleepEnabled: false,
  sleepStart: '',
  sleepEnd: '',
  policyVersion: 0,
  sleepActive: false,
  overRest: false,
};

// =============================================================================
// TESTS
// =============================================================================

describe('Orchestration: Pomodoro schedule actions', () => {
  it('should register pomodoro schedule when pomodoro starts', () => {
    const pom = makePomodoro({ duration: 25 });
    const actions = computeScheduleActions(EMPTY_PREV, {
      ...EMPTY_PREV,
      pomodoroId: pom.id,
      pomodoroStatus: 'active',
      activePomodoro: pom,
      policy: makePolicy(),
      dailyState: null,
    });

    const registerAction = actions.find((a) => a.type === 'register_pomodoro');
    expect(registerAction).toBeDefined();
    expect(registerAction!.payload.endTimeMs).toBeGreaterThan(Date.now());
  });

  it('should cancel pomodoro schedule when pomodoro ends', () => {
    const actions = computeScheduleActions(
      { ...EMPTY_PREV, pomodoroId: 'pom-1', pomodoroStatus: 'active' },
      { ...EMPTY_PREV, pomodoroId: null, pomodoroStatus: null, activePomodoro: null, policy: makePolicy(), dailyState: null }
    );

    expect(actions.find((a) => a.type === 'cancel_pomodoro')).toBeDefined();
  });

  it('should cancel pomodoro schedule when status changes to paused', () => {
    const actions = computeScheduleActions(
      { ...EMPTY_PREV, pomodoroId: 'pom-1', pomodoroStatus: 'active' },
      {
        ...EMPTY_PREV,
        pomodoroId: 'pom-1',
        pomodoroStatus: 'paused',
        activePomodoro: makePomodoro({ status: 'paused' }),
        policy: makePolicy(),
        dailyState: null,
      }
    );

    expect(actions.find((a) => a.type === 'cancel_pomodoro')).toBeDefined();
  });

  it('should not register/cancel when pomodoro does not change', () => {
    const prev = { ...EMPTY_PREV, pomodoroId: 'pom-1', pomodoroStatus: 'active' };
    const actions = computeScheduleActions(prev, {
      ...prev,
      activePomodoro: makePomodoro(),
      policy: makePolicy({ version: 2 }), // only policy changed
      dailyState: null,
      policyVersion: 2,
    });

    expect(actions.find((a) => a.type === 'register_pomodoro')).toBeUndefined();
    expect(actions.find((a) => a.type === 'cancel_pomodoro')).toBeUndefined();
  });

  it('should apply D2 startTime normalization (seconds → ms)', () => {
    const pom = makePomodoro({ startTime: 1714000000, duration: 25 }); // seconds
    const endTimeMs = computePomodoroEndTime(pom);
    expect(endTimeMs).toBe(1714000000 * 1000 + 25 * 60 * 1000);
  });

  it('should keep ms startTime unchanged', () => {
    const pom = makePomodoro({ startTime: 1714000000000, duration: 25 }); // ms
    const endTimeMs = computePomodoroEndTime(pom);
    expect(endTimeMs).toBe(1714000000000 + 25 * 60 * 1000);
  });
});

describe('Orchestration: Temp unblock schedule actions', () => {
  it('should register temp unblock schedule with restore reason when sleep is active', () => {
    const endTime = Date.now() + 20 * 60 * 1000;
    const policy = makePolicy({
      version: 2,
      sleepTime: {
        enabled: true, startTime: '23:00', endTime: '07:00',
        isCurrentlyActive: true, isSnoozed: false,
      },
      temporaryUnblock: { active: true, endTime },
    });

    const actions = computeScheduleActions(EMPTY_PREV, {
      ...EMPTY_PREV,
      policyVersion: 2,
      tempUnblockActive: true,
      tempUnblockEndTime: endTime,
      sleepActive: true,
      activePomodoro: null,
      policy,
      dailyState: null,
    });

    const registerAction = actions.find((a) => a.type === 'register_temp_unblock');
    expect(registerAction).toBeDefined();
    expect(registerAction!.payload.endTimeMs).toBe(endTime);
    expect(registerAction!.payload.reason).toBe('sleep');
  });

  it('should NOT register when no underlying blocking reason', () => {
    const endTime = Date.now() + 20 * 60 * 1000;
    const policy = makePolicy({
      version: 2,
      temporaryUnblock: { active: true, endTime },
    });

    const actions = computeScheduleActions(EMPTY_PREV, {
      ...EMPTY_PREV,
      policyVersion: 2,
      tempUnblockActive: true,
      tempUnblockEndTime: endTime,
      activePomodoro: null,
      policy,
      dailyState: null,
    });

    expect(actions.find((a) => a.type === 'register_temp_unblock')).toBeUndefined();
  });

  it('should cancel temp unblock schedule when unblock ends', () => {
    const actions = computeScheduleActions(
      { ...EMPTY_PREV, tempUnblockActive: true, tempUnblockEndTime: Date.now() + 10 * 60 * 1000 },
      { ...EMPTY_PREV, tempUnblockActive: false, tempUnblockEndTime: 0, activePomodoro: null, policy: makePolicy({ version: 2 }), dailyState: null, policyVersion: 2 }
    );

    expect(actions.find((a) => a.type === 'cancel_temp_unblock')).toBeDefined();
  });

  it('should determine focus as restore reason during active pomodoro', () => {
    const endTime = Date.now() + 20 * 60 * 1000;
    const pom = makePomodoro({ status: 'active' });
    const policy = makePolicy({
      version: 2,
      temporaryUnblock: { active: true, endTime },
    });

    const actions = computeScheduleActions(EMPTY_PREV, {
      ...EMPTY_PREV,
      pomodoroId: pom.id,
      pomodoroStatus: 'active',
      policyVersion: 2,
      tempUnblockActive: true,
      tempUnblockEndTime: endTime,
      activePomodoro: pom,
      policy,
      dailyState: null,
    });

    const registerAction = actions.find((a) => a.type === 'register_temp_unblock');
    expect(registerAction).toBeDefined();
    expect(registerAction!.payload.reason).toBe('focus');
  });
});

describe('Orchestration: A1 — sync_context before schedule registration', () => {
  it('should place sync_context BEFORE register_pomodoro in action sequence', () => {
    const pom = makePomodoro({ duration: 25 });
    const actions = computeScheduleActions(EMPTY_PREV, {
      ...EMPTY_PREV,
      pomodoroId: pom.id,
      pomodoroStatus: 'active',
      activePomodoro: pom,
      policy: makePolicy(),
      dailyState: null,
    });

    const syncIdx = actions.findIndex((a) => a.type === 'sync_context');
    const regIdx = actions.findIndex((a) => a.type === 'register_pomodoro');

    expect(syncIdx).toBeGreaterThanOrEqual(0);
    expect(regIdx).toBeGreaterThanOrEqual(0);
    expect(syncIdx).toBeLessThan(regIdx);
  });

  it('should place sync_context BEFORE register_temp_unblock', () => {
    const endTime = Date.now() + 20 * 60 * 1000;
    const policy = makePolicy({
      version: 2,
      sleepTime: {
        enabled: true, startTime: '23:00', endTime: '07:00',
        isCurrentlyActive: true, isSnoozed: false,
      },
      temporaryUnblock: { active: true, endTime },
    });

    const actions = computeScheduleActions(EMPTY_PREV, {
      ...EMPTY_PREV,
      policyVersion: 2,
      tempUnblockActive: true,
      tempUnblockEndTime: endTime,
      sleepActive: true,
      activePomodoro: null,
      policy,
      dailyState: null,
    });

    const syncIdx = actions.findIndex((a) => a.type === 'sync_context');
    const regIdx = actions.findIndex((a) => a.type === 'register_temp_unblock');

    expect(syncIdx).toBeGreaterThanOrEqual(0);
    expect(regIdx).toBeGreaterThanOrEqual(0);
    expect(syncIdx).toBeLessThan(regIdx);
  });

  it('should NOT sync_context when neither pomodoro nor tempUnblock changed', () => {
    const prev = { ...EMPTY_PREV, policyVersion: 1 };
    const actions = computeScheduleActions(prev, {
      ...prev,
      policyVersion: 2, // only policy version changed
      activePomodoro: null,
      policy: makePolicy({ version: 2 }),
      dailyState: null,
    });

    expect(actions.find((a) => a.type === 'sync_context')).toBeUndefined();
  });
});

describe('Orchestration: Sleep schedule management', () => {
  it('should register sleep schedule even when currently in sleep (bug fix)', () => {
    const actions = computeScheduleActions(EMPTY_PREV, {
      ...EMPTY_PREV,
      sleepEnabled: true,
      sleepStart: '23:00',
      sleepEnd: '07:00',
      sleepActive: true, // currently in sleep period
      policyVersion: 1,
      activePomodoro: null,
      policy: makePolicy({
        sleepTime: {
          enabled: true, startTime: '23:00', endTime: '07:00',
          isCurrentlyActive: true, isSnoozed: false,
        },
      }),
      dailyState: null,
    });

    const registerAction = actions.find((a) => a.type === 'register_sleep');
    expect(registerAction).toBeDefined();
    expect(registerAction!.payload).toEqual({ start: '23:00', end: '07:00' });
  });

  it('should clear sleep schedule when disabled', () => {
    const actions = computeScheduleActions(
      { ...EMPTY_PREV, sleepEnabled: true, sleepStart: '23:00', sleepEnd: '07:00' },
      {
        ...EMPTY_PREV,
        sleepEnabled: false,
        sleepStart: '23:00',
        sleepEnd: '07:00',
        activePomodoro: null,
        policy: makePolicy({ version: 2 }),
        dailyState: null,
        policyVersion: 2,
      }
    );

    expect(actions.find((a) => a.type === 'clear_sleep')).toBeDefined();
  });
});

describe('Orchestration: evaluate is triggered correctly', () => {
  it('should trigger evaluate when pomodoro changes', () => {
    const actions = computeScheduleActions(EMPTY_PREV, {
      ...EMPTY_PREV,
      pomodoroId: 'pom-1',
      pomodoroStatus: 'active',
      activePomodoro: makePomodoro(),
      policy: makePolicy(),
      dailyState: null,
    });

    expect(actions.find((a) => a.type === 'evaluate')).toBeDefined();
  });

  it('should trigger evaluate when policy version changes', () => {
    const prev = { ...EMPTY_PREV, policyVersion: 1 };
    const actions = computeScheduleActions(prev, {
      ...prev,
      policyVersion: 2,
      activePomodoro: null,
      policy: makePolicy({ version: 2 }),
      dailyState: null,
    });

    expect(actions.find((a) => a.type === 'evaluate')).toBeDefined();
  });

  it('should trigger evaluate when overRest changes', () => {
    const actions = computeScheduleActions(EMPTY_PREV, {
      ...EMPTY_PREV,
      overRest: true,
      policyVersion: 1,
      activePomodoro: null,
      policy: makePolicy({ overRest: { isOverRest: true, overRestMinutes: 10 } }),
      dailyState: null,
    });

    expect(actions.find((a) => a.type === 'evaluate')).toBeDefined();
  });

  it('should NOT trigger evaluate when only sleep schedule changes (no policy change)', () => {
    const prev = { ...EMPTY_PREV, sleepEnabled: false };
    const actions = computeScheduleActions(prev, {
      ...prev,
      sleepEnabled: true,
      sleepStart: '23:00',
      sleepEnd: '07:00',
      activePomodoro: null,
      policy: makePolicy(),
      dailyState: null,
    });

    // evaluate is triggered by policyChanged, not sleepScheduleChanged
    // sleepScheduleChanged alone doesn't trigger evaluate
    expect(actions.find((a) => a.type === 'evaluate')).toBeUndefined();
  });
});

describe('Orchestration: Combined state changes', () => {
  it('pomodoro start + temp unblock start in same update', () => {
    const pom = makePomodoro({ duration: 25 });
    const endTime = Date.now() + 20 * 60 * 1000;
    const policy = makePolicy({
      version: 2,
      sleepTime: {
        enabled: true, startTime: '23:00', endTime: '07:00',
        isCurrentlyActive: true, isSnoozed: false,
      },
      temporaryUnblock: { active: true, endTime },
    });

    const actions = computeScheduleActions(EMPTY_PREV, {
      ...EMPTY_PREV,
      pomodoroId: pom.id,
      pomodoroStatus: 'active',
      policyVersion: 2,
      tempUnblockActive: true,
      tempUnblockEndTime: endTime,
      sleepActive: true,
      activePomodoro: pom,
      policy,
      dailyState: null,
    });

    // Should have: sync_context, register_pomodoro, register_temp_unblock, evaluate
    expect(actions.find((a) => a.type === 'sync_context')).toBeDefined();
    expect(actions.find((a) => a.type === 'register_pomodoro')).toBeDefined();
    expect(actions.find((a) => a.type === 'register_temp_unblock')).toBeDefined();
    expect(actions.find((a) => a.type === 'evaluate')).toBeDefined();

    // sync_context should come before both registers
    const syncIdx = actions.findIndex((a) => a.type === 'sync_context');
    const pomIdx = actions.findIndex((a) => a.type === 'register_pomodoro');
    const unlockIdx = actions.findIndex((a) => a.type === 'register_temp_unblock');
    expect(syncIdx).toBeLessThan(pomIdx);
    expect(syncIdx).toBeLessThan(unlockIdx);
  });

  it('pomodoro end + sleep schedule change in same update', () => {
    const actions = computeScheduleActions(
      { ...EMPTY_PREV, pomodoroId: 'pom-1', pomodoroStatus: 'active' },
      {
        ...EMPTY_PREV,
        pomodoroId: null,
        pomodoroStatus: null,
        sleepEnabled: true,
        sleepStart: '23:00',
        sleepEnd: '07:00',
        policyVersion: 2,
        activePomodoro: null,
        policy: makePolicy({
          version: 2,
          sleepTime: {
            enabled: true, startTime: '23:00', endTime: '07:00',
            isCurrentlyActive: false, isSnoozed: false,
          },
        }),
        dailyState: null,
      }
    );

    expect(actions.find((a) => a.type === 'cancel_pomodoro')).toBeDefined();
    expect(actions.find((a) => a.type === 'register_sleep')).toBeDefined();
    expect(actions.find((a) => a.type === 'evaluate')).toBeDefined();
  });
});

describe('Orchestration: BlockingContext construction', () => {
  it('should reflect current blocking reason in context', () => {
    const ctx = buildBlockingContext(
      makePomodoro({ status: 'active' }),
      makePolicy(),
      null
    );
    expect(ctx.currentBlockingReason).toBe('focus');
  });

  it('should set sleepScheduleActive correctly', () => {
    const ctx = buildBlockingContext(null, makePolicy({
      sleepTime: {
        enabled: true, startTime: '23:00', endTime: '07:00',
        isCurrentlyActive: true, isSnoozed: false,
      },
    }), null);
    expect(ctx.sleepScheduleActive).toBe(true);
    expect(ctx.currentBlockingReason).toBe('sleep');
  });

  it('should set overRestActive correctly', () => {
    const ctx = buildBlockingContext(null, makePolicy({
      overRest: { isOverRest: true, overRestMinutes: 10 },
    }), null);
    expect(ctx.overRestActive).toBe(true);
    expect(ctx.currentBlockingReason).toBe('over_rest');
  });

  it('context should be stale-safe: reflects state at construction time', () => {
    // This test documents the known limitation: context is a snapshot
    const ctx1 = buildBlockingContext(
      makePomodoro({ status: 'active' }),
      makePolicy(),
      null
    );
    expect(ctx1.currentBlockingReason).toBe('focus');
    expect(ctx1.overRestActive).toBe(false);

    // Later, overRest becomes active, but ctx1 doesn't know
    // This is the known limitation documented in design.md
    const ctx2 = buildBlockingContext(null, makePolicy({
      overRest: { isOverRest: true, overRestMinutes: 10 },
    }), null);
    expect(ctx2.overRestActive).toBe(true);

    // ctx1 still shows old state
    expect(ctx1.overRestActive).toBe(false);
  });
});
