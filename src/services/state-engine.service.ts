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
  type VibeFlowContext,
  type VibeFlowEvent,
} from '@/machines/vibeflow.machine';
import { mcpEventService } from './mcp-event.service';
import { dailyStateService } from './daily-state.service';

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
type FullStateBroadcaster = (userId: string) => Promise<void>;
type PolicyUpdateBroadcaster = (userId: string) => Promise<void>;

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

/** Late-bound broadcasters */
let fullStateBroadcaster: FullStateBroadcaster | null = null;
let policyUpdateBroadcaster: PolicyUpdateBroadcaster | null = null;

/**
 * Register the full-state broadcaster (called by socket-init at startup).
 */
export function registerFullStateBroadcaster(broadcaster: FullStateBroadcaster): void {
  fullStateBroadcaster = broadcaster;
}

/**
 * Register the policy-update broadcaster (called by socket-init at startup).
 */
export function registerStateEnginePolicyBroadcaster(broadcaster: PolicyUpdateBroadcaster): void {
  policyUpdateBroadcaster = broadcaster;
}

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
          // Engine will validate: must be IDLE + guard checks work hours
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

/**
 * Broadcast full state to the user (via late-bound broadcaster).
 */
async function broadcastFullState(userId: string): Promise<void> {
  if (fullStateBroadcaster) {
    await fullStateBroadcaster(userId);
  } else {
    console.log(`[StateEngine] broadcastFullState queued (server not ready): ${userId}`);
  }
}

/**
 * Broadcast policy update to the user (via late-bound broadcaster).
 */
async function broadcastPolicyUpdateToUser(userId: string): Promise<void> {
  if (policyUpdateBroadcaster) {
    await policyUpdateBroadcaster(userId);
  } else {
    console.log(`[StateEngine] broadcastPolicyUpdate queued (server not ready): ${userId}`);
  }
}

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
        return {
          success: false as const,
          error: 'INVALID_TRANSITION' as const,
          message: `Event ${event.type} not allowed in state ${currentState}`,
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
