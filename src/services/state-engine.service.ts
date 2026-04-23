/**
 * StateEngine Service
 *
 * Unified state transition engine for VibeFlow.
 * All state changes must go through stateEngine.send().
 *
 * Design: .kiro/specs/state-management-overhaul/design.md §3
 */

import prisma from '@/lib/prisma';
import type { DailyState } from '@prisma/client';
import { normalizeState, serializeState } from '@/lib/state-utils';
import type { SystemState } from '@/lib/state-utils';
import { getNextSnapshot } from 'xstate';
import {
  vibeflowMachine,
  isEventAllowed,
  type VibeFlowContext,
  type VibeFlowEvent,
} from '@/machines/vibeflow.machine';
import { mcpEventService } from './mcp-event.service';
import { dailyStateService } from './daily-state.service';
import { isWithinWorkHours } from './idle.service';
import { focusSessionService } from './focus-session.service';
import { sleepTimeService } from './sleep-time.service';
import type { WorkTimeSlot } from './user.service';

// ── Types ──────────────────────────────────────────────────────────────

export type TransitionResult =
  | {
      success: true;
      from: SystemState;
      to: SystemState;
      event: string;
    }
  | {
      success: false;
      error: 'INVALID_TRANSITION' | 'GUARD_FAILED' | 'INTERNAL_ERROR';
      message: string;
      currentState: SystemState;
    };

export interface SendOptions {
  skipBroadcast?: boolean;
}

// Late-bound broadcaster (registered by socket-init at startup)
// FullStateBroadcaster and PolicyUpdateBroadcaster types moved to state-engine-broadcaster.ts

// ── Self-transition events (same state is valid, not a rejection) ──────

const SELF_TRANSITION_EVENTS = new Set<string>([
  'SWITCH_TASK',
  'COMPLETE_CURRENT_TASK',
  'DAILY_RESET', // idle→idle is valid for DAILY_RESET
]);

// ── Service ────────────────────────────────────────────────────────────

/** Per-user concurrency locks */
const locks = new Map<string, Promise<void>>();

/** OVER_REST delayed timers */
const overRestTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Broadcaster functions live in a separate module to avoid CJS dual-instance issues.
// When state-engine.service is imported via barrel (services/index) vs direct path,
// CJS can create two module instances with separate `let` variables.
// The isolated module ensures a single shared instance.
import {
  registerFullStateBroadcaster,
  registerStateEnginePolicyBroadcaster,
  broadcastFullState,
  broadcastPolicyUpdate as broadcastPolicyUpdateToUser,
} from './state-engine-broadcaster';

// Re-export register functions so existing callers don't break
export { registerFullStateBroadcaster, registerStateEnginePolicyBroadcaster };

// ── withLock ───────────────────────────────────────────────────────────

/**
 * Per-user mutex based on promise chaining.
 * Ensures same-userId send() calls execute serially.
 */
async function withLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(userId);
  let resolve: () => void;
  const current = new Promise<void>((r) => {
    resolve = r;
  });
  locks.set(userId, current);

  if (prev) await prev;

  try {
    return await fn();
  } finally {
    resolve!();
    if (locks.get(userId) === current) {
      locks.delete(userId);
    }
  }
}

// ── buildContext ────────────────────────────────────────────────────────

/**
 * Reconstruct XState context from DB state for a given user.
 * This is called inside the lock so the data is consistent.
 */
async function buildContext(
  userId: string,
  dailyState: DailyState,
): Promise<VibeFlowContext> {
  const [settings, activePomodoro] = await Promise.all([
    prisma.userSettings.findFirst({ where: { userId } }),
    prisma.pomodoro.findFirst({
      where: { userId, status: 'IN_PROGRESS' },
      include: { timeSlices: { orderBy: { startTime: 'asc' } } },
    }),
  ]);

  return {
    userId,
    todayPomodoroCount: dailyState.pomodoroCount,
    dailyCap: (settings as Record<string, unknown>)?.dailyCap as number ?? 8,
    currentPomodoroId: activePomodoro?.id ?? null,
    currentTaskId: activePomodoro?.taskId ?? null,
    pomodoroStartTime: activePomodoro?.startTime?.getTime() ?? null,
    taskStack:
      activePomodoro?.timeSlices?.map((ts) => ({
        taskId: ts.taskId,
        startTime: ts.startTime.getTime(),
      })) ?? [],
    isTaskless: activePomodoro?.isTaskless ?? false,
    lastPomodoroEndTime: dailyState.lastPomodoroEndTime?.getTime() ?? null,
    overRestEnteredAt: dailyState.overRestEnteredAt?.getTime() ?? null,
    overRestExitCount: dailyState.overRestExitCount,
  };
}

// ── OVER_REST timer management ─────────────────────────────────────────

function clearOverRestTimer(userId: string): void {
  const existing = overRestTimers.get(userId);
  if (existing) {
    clearTimeout(existing);
    overRestTimers.delete(userId);
  }
}

/**
 * Schedule OVER_REST entry after a completed pomodoro.
 * Only sets a timer when state is IDLE and lastPomodoroEndTime is set
 * (i.e., pomodoro was completed, not aborted).
 */
function scheduleOverRestTimer(
  userId: string,
  state: SystemState,
  context: VibeFlowContext,
): void {
  clearOverRestTimer(userId);

  // Only schedule when transitioning to IDLE after a completed pomodoro
  if (state !== 'idle' || !context.lastPomodoroEndTime) return;

  // Read shortRestDuration + gracePeriod from DB asynchronously
  (async () => {
    try {
      const settings = await prisma.userSettings.findFirst({ where: { userId } });
      const settingsAny = settings as Record<string, unknown> | null;

      // Check work hours and focus session — only schedule when within work hours OR in focus session
      const workTimeSlots = (settingsAny?.workTimeSlots as unknown as WorkTimeSlot[]) || [];
      const withinWorkHours = isWithinWorkHours(workTimeSlots);
      const focusSessionResult = await focusSessionService.isInFocusSession(userId);
      const inFocusSession = focusSessionResult.success && focusSessionResult.data === true;

      // OVER_REST allowed: focus session always qualifies; work hours only if not in sleep time
      const sleepResult = await sleepTimeService.isInSleepTime(userId);
      const inSleepTime = sleepResult.success && sleepResult.data === true;
      const overRestAllowed = inFocusSession || (withinWorkHours && !inSleepTime);

      if (!overRestAllowed) {
        // Not in a qualifying time window: clear lastPomodoroEndTime to prevent
        // stale timestamp from triggering OVER_REST when work hours resume
        const dsResult = await dailyStateService.getOrCreateToday(userId);
        if (dsResult.success && dsResult.data?.lastPomodoroEndTime) {
          await prisma.dailyState.update({
            where: { id: dsResult.data.id },
            data: { lastPomodoroEndTime: null },
          });
        }
        return;
      }

      // Re-validate state after async operations — user may have started a new pomodoro
      const currentState = await stateEngineService.getState(userId);
      if (currentState !== 'idle') {
        return; // State changed during async queries, abort scheduling
      }

      const shortRestDuration = (settingsAny?.shortRestDuration as number) ?? 5;
      const gracePeriod = (settingsAny?.overRestGracePeriod as number) ?? 5;
      const delayMs = (shortRestDuration + gracePeriod) * 60 * 1000;

      // Calculate actual delay from lastPomodoroEndTime
      const elapsed = Date.now() - context.lastPomodoroEndTime!;
      const remaining = delayMs - elapsed;

      if (remaining <= 0) {
        // Already past the threshold — trigger immediately
        await stateEngineService.send(userId, { type: 'ENTER_OVER_REST' });
        return;
      }

      const timer = setTimeout(async () => {
        overRestTimers.delete(userId);
        try {
          // Re-check: must still be in a qualifying time window
          const currentSettings = await prisma.userSettings.findFirst({ where: { userId } });
          const currentSettingsAny = currentSettings as Record<string, unknown> | null;
          const currentSlots = (currentSettingsAny?.workTimeSlots as unknown as WorkTimeSlot[]) || [];
          const stillWithinWorkHours = isWithinWorkHours(currentSlots);
          const focusResult = await focusSessionService.isInFocusSession(userId);
          const stillInFocusSession = focusResult.success && focusResult.data === true;
          const sleepCheck = await sleepTimeService.isInSleepTime(userId);
          const nowInSleepTime = sleepCheck.success && sleepCheck.data === true;

          // Focus session always qualifies; work hours only if not in sleep time
          const stillAllowed = stillInFocusSession || (stillWithinWorkHours && !nowInSleepTime);

          if (!stillAllowed) {
            // Time window changed — clear lastPomodoroEndTime and skip
            const dsResult = await dailyStateService.getOrCreateToday(userId);
            if (dsResult.success && dsResult.data?.lastPomodoroEndTime) {
              await prisma.dailyState.update({
                where: { id: dsResult.data.id },
                data: { lastPomodoroEndTime: null },
              });
            }
            return;
          }
          await stateEngineService.send(userId, { type: 'ENTER_OVER_REST' });
        } catch (err) {
          console.error(`[StateEngine] ENTER_OVER_REST timer error for ${userId}:`, err);
        }
      }, remaining);

      overRestTimers.set(userId, timer);
    } catch (err) {
      console.error(`[StateEngine] scheduleOverRestTimer error for ${userId}:`, err);
    }
  })();
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Extract minimal context for the transition log (avoid dumping entire context).
 */
function extractLogContext(
  event: VibeFlowEvent,
  context: VibeFlowContext,
): Record<string, unknown> {
  const base: Record<string, unknown> = {};

  switch (event.type) {
    case 'START_POMODORO':
      base.pomodoroId = event.pomodoroId;
      base.taskId = event.taskId;
      if (event.isTaskless) base.isTaskless = true;
      break;
    case 'SWITCH_TASK':
      base.taskId = event.taskId;
      base.timeSliceId = event.timeSliceId;
      break;
    case 'COMPLETE_POMODORO':
      base.todayPomodoroCount = context.todayPomodoroCount;
      break;
    case 'RETURN_TO_IDLE':
      base.overRestExitCount = context.overRestExitCount;
      break;
  }

  return base;
}

// broadcastFullState and broadcastPolicyUpdateToUser are now imported
// from ./state-engine-broadcaster (isolated module to avoid CJS dual-instance)

/**
 * Publish MCP event for state transition (async, non-blocking).
 */
function publishMCPEvent(
  userId: string,
  from: SystemState,
  to: SystemState,
  event: VibeFlowEvent,
): void {
  mcpEventService
    .publish({
      type: 'daily_state.changed',
      userId,
      payload: {
        previousState: from,
        newState: to,
        event: event.type,
        timestamp: new Date().toISOString(),
      },
    })
    .catch((err: unknown) =>
      console.error('[StateEngine] MCP event publish error:', err),
    );
}

// ── send() ─────────────────────────────────────────────────────────────

/**
 * Send a state transition event.
 * All state changes must go through this method.
 *
 * Phase 1 (current): Stub implementation returning INTERNAL_ERROR.
 * Phase 2 (task 2.1): Full implementation with DB, XState, $transaction, broadcast.
 */
async function send(
  userId: string,
  event: VibeFlowEvent,
  options?: SendOptions,
): Promise<TransitionResult> {
  return withLock(userId, async () => {
    try {
      // 1. Read current state + context from DB
      const dailyStateResult = await dailyStateService.getOrCreateToday(userId);
      if (!dailyStateResult.success || !dailyStateResult.data) {
        return {
          success: false as const,
          error: 'INTERNAL_ERROR' as const,
          message: 'Failed to read daily state',
          currentState: 'idle' as SystemState,
        };
      }

      const dailyState = dailyStateResult.data;
      const currentState = normalizeState(dailyState.systemState);
      const context = await buildContext(userId, dailyState);

      // 2. Use XState to validate transition
      const snapshot = vibeflowMachine.resolveState({
        value: currentState,
        context,
      });
      const nextSnapshot = getNextSnapshot(vibeflowMachine, snapshot, event);

      const nextValue = nextSnapshot.value as SystemState;

      // Check if the transition was rejected (same state and not a self-transition event)
      if (nextValue === currentState && !SELF_TRANSITION_EVENTS.has(event.type)) {
        // Distinguish: is the event defined for this state (guard failed) or not (invalid transition)?
        const eventHandled = isEventAllowed(currentState, event.type);
        return {
          success: false as const,
          error: eventHandled ? 'GUARD_FAILED' as const : 'INVALID_TRANSITION' as const,
          message: eventHandled
            ? `Event ${event.type} rejected by guard in state ${currentState}`
            : `Event ${event.type} not allowed in state ${currentState}`,
          currentState,
        };
      }

      const newState = nextValue;
      const newContext = nextSnapshot.context;

      // 3. Execute DB operations in $transaction
      await prisma.$transaction(async (tx) => {
        // 3a. Write new state + persisted context fields
        await tx.dailyState.update({
          where: { id: dailyState.id },
          data: {
            systemState: serializeState(newState),
            pomodoroCount: newContext.todayPomodoroCount,
            lastPomodoroEndTime: newContext.lastPomodoroEndTime
              ? new Date(newContext.lastPomodoroEndTime)
              : null,
            overRestEnteredAt: newContext.overRestEnteredAt
              ? new Date(newContext.overRestEnteredAt)
              : null,
            overRestExitCount: newContext.overRestExitCount,
          },
        });

        // 3b. Write transition log
        await tx.stateTransitionLog.create({
          data: {
            userId,
            fromState: currentState,
            toState: newState,
            event: event.type,
            context: JSON.stringify(extractLogContext(event, newContext)),
            timestamp: new Date(),
          },
        });
      });

      // 4. Post-transaction side effects
      //    Clear any existing overRest timer (any transition clears it)
      clearOverRestTimer(userId);

      if (!options?.skipBroadcast) {
        await broadcastFullState(userId);
        await broadcastPolicyUpdateToUser(userId);
      }

      publishMCPEvent(userId, currentState, newState, event);
      scheduleOverRestTimer(userId, newState, newContext);

      return {
        success: true as const,
        from: currentState,
        to: newState,
        event: event.type,
      };
    } catch (error) {
      console.error('[StateEngine] send() error:', error);
      return {
        success: false as const,
        error: 'INTERNAL_ERROR' as const,
        message: error instanceof Error ? error.message : 'Unknown error',
        currentState: 'idle' as SystemState,
      };
    }
  });
}

// ── getState() ─────────────────────────────────────────────────────────

/**
 * Read current state for a user (from DB + normalizeState).
 */
async function getState(userId: string): Promise<SystemState> {
  const result = await dailyStateService.getOrCreateToday(userId);
  if (!result.success || !result.data) return 'idle';
  return normalizeState(result.data.systemState);
}

// ── Public API ─────────────────────────────────────────────────────────

export const stateEngineService = {
  send,
  getState,
  buildContext,
  registerFullStateBroadcaster,
  registerStateEnginePolicyBroadcaster,

  // Exposed for testing
  _locks: locks,
  _overRestTimers: overRestTimers,
  _clearOverRestTimer: clearOverRestTimer,
};

export default stateEngineService;
