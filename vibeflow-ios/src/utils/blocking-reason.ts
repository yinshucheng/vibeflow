/**
 * Blocking Reason Evaluation (Pure Function)
 *
 * Evaluates which blocking reason should be active based on current app state.
 * Priority: focus > over_rest > sleep > null
 *
 * Extracted as a pure function for testability.
 */

import type {
  ActivePomodoroData,
  PolicyData,
  BlockingReason,
} from '@/types';

export interface BlockingReasonInput {
  activePomodoro: ActivePomodoroData | null;
  policy: PolicyData | null;
}

/**
 * Evaluate blocking reason from app state signals.
 * Priority: temporaryUnblock (override) > focus > over_rest > sleep
 * Returns the reason to block, or null if no blocking needed.
 */
export function evaluateBlockingReason(input: BlockingReasonInput): BlockingReason | null {
  const { activePomodoro, policy } = input;

  // 0. Temporary unblock — overrides ALL blocking reasons
  if (
    policy?.temporaryUnblock?.active &&
    Date.now() < policy.temporaryUnblock.endTime
  ) {
    return null;
  }

  // 1. Active pomodoro — focus blocking (HIGHEST PRIORITY)
  if (activePomodoro && activePomodoro.status === 'active') {
    return 'focus';
  }

  // 2. Over rest — server says user exceeded rest time
  if (policy?.overRest?.isOverRest) {
    return 'over_rest';
  }

  // 3. Sleep time — within sleep window, enabled, not snoozed
  if (
    policy?.sleepTime?.enabled &&
    policy.sleepTime.isCurrentlyActive &&
    !policy.sleepTime.isSnoozed
  ) {
    return 'sleep';
  }

  return null;
}
