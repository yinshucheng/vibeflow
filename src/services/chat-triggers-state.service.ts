/**
 * Chat State Transition Triggers (S5)
 *
 * Listens to domain events (state changes, pomodoro completions) and
 * fires proactive AI messages via aiTriggerService.
 *
 * Triggers:
 *   S5.1 on_planning_enter — Airlock complete → daily planning advice
 *   S5.2 on_rest_enter     — Pomodoro complete → session summary + next step
 *   S5.3 on_over_rest_enter — Rest timeout → template reminder
 *   S5.4 over_rest_escalation — Escalating urgency over time
 *   S5.5 task_stuck         — Same task ≥3 pomodoros → suggest splitting
 */

import { prisma } from '@/lib/prisma';
import { aiTriggerService, getEscalationLevel, getEscalationTemplate } from './ai-trigger.service';
import type { TriggerDefinition } from './ai-trigger.service';

// ---------------------------------------------------------------------------
// S5.1 on_planning_enter
// ---------------------------------------------------------------------------

export async function handlePlanningEnter(userId: string): Promise<void> {
  const trigger = aiTriggerService.getTrigger('on_planning_enter');
  if (!trigger) return;

  const canFire = await aiTriggerService.shouldFire(userId, trigger);
  if (!canFire) return;

  // Build context for the LLM
  const context = await _buildPlanningContext(userId);
  await aiTriggerService.fire(userId, trigger, context);
}

async function _buildPlanningContext(userId: string): Promise<Record<string, unknown>> {
  const now = new Date();
  const todayDate = new Date(now);
  todayDate.setHours(0, 0, 0, 0);

  const tomorrowDate = new Date(todayDate);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);

  const yesterdayDate = new Date(todayDate);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);

  // Fetch overdue tasks
  const overdueTasks = await prisma.task.findMany({
    where: {
      project: { userId },
      status: { not: 'DONE' },
      planDate: { lt: todayDate },
    },
    select: { id: true, title: true, priority: true, planDate: true },
    take: 10,
  });

  // Fetch today's tasks
  const todayTasks = await prisma.task.findMany({
    where: {
      project: { userId },
      planDate: { gte: todayDate, lt: tomorrowDate },
      status: { not: 'DONE' },
    },
    select: { id: true, title: true, priority: true },
    take: 20,
  });

  // Yesterday's pomodoro count
  const yesterdayPomodoros = await prisma.pomodoro.count({
    where: {
      userId,
      status: 'COMPLETED',
      startTime: { gte: yesterdayDate, lt: todayDate },
    },
  });

  return {
    overdueTasks,
    todayTasks,
    yesterdayPomodoros,
    date: todayDate.toISOString().slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// S5.2 on_rest_enter
// ---------------------------------------------------------------------------

export async function handleRestEnter(
  userId: string,
  pomodoroPayload: Record<string, unknown>,
): Promise<void> {
  const trigger = aiTriggerService.getTrigger('on_rest_enter');
  if (!trigger) return;

  const canFire = await aiTriggerService.shouldFire(userId, trigger);
  if (!canFire) return;

  const context = await _buildRestContext(userId, pomodoroPayload);
  await aiTriggerService.fire(userId, trigger, context);
}

async function _buildRestContext(
  userId: string,
  pomodoroPayload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const now = new Date();
  const todayDate = new Date(now);
  todayDate.setHours(0, 0, 0, 0);

  // Today's completed pomodoros
  const todayCompleted = await prisma.pomodoro.count({
    where: {
      userId,
      status: 'COMPLETED',
      startTime: { gte: todayDate },
    },
  });

  // Fetch daily state for pomodoro count and user settings for cap
  const dailyState = await prisma.dailyState.findFirst({
    where: { userId, date: todayDate },
    select: { pomodoroCount: true },
  });

  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { dailyCap: true },
  });

  return {
    ...pomodoroPayload,
    todayCompleted,
    dailyCap: settings?.dailyCap ?? 8,
    pomodoroCount: dailyState?.pomodoroCount ?? todayCompleted,
  };
}

// ---------------------------------------------------------------------------
// S5.3 on_over_rest_enter
// ---------------------------------------------------------------------------

export async function handleOverRestEnter(userId: string): Promise<void> {
  const trigger = aiTriggerService.getTrigger('on_over_rest_enter');
  if (!trigger) return;

  const canFire = await aiTriggerService.shouldFire(userId, trigger);
  if (!canFire) return;

  await aiTriggerService.fire(userId, trigger, {});
}

// ---------------------------------------------------------------------------
// S5.4 over_rest_escalation
// ---------------------------------------------------------------------------

export async function handleOverRestEscalation(
  userId: string,
  overRestMinutes: number,
): Promise<void> {
  const trigger = aiTriggerService.getTrigger('over_rest_escalation');
  if (!trigger) return;

  const canFire = await aiTriggerService.shouldFire(userId, trigger);
  if (!canFire) return;

  const level = getEscalationLevel(overRestMinutes);
  const template = getEscalationTemplate(level);

  // Get a hint about next task for the gentle message
  let taskHint = '';
  if (level === 'gentle') {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const tomorrowStart = new Date(todayStart);
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);
      const nextTask = await prisma.task.findFirst({
        where: {
          project: { userId },
          planDate: { gte: todayStart, lt: tomorrowStart },
          status: { not: 'DONE' },
        },
        orderBy: { priority: 'asc' },
        select: { title: true },
      });
      if (nextTask) {
        taskHint = `还剩「${nextTask.title}」。`;
      }
    } catch {
      // non-fatal
    }
  }

  // We override the trigger's template with the escalation-specific one
  const overrideTrigger: TriggerDefinition = {
    ...trigger,
    promptTemplate: template,
    useLLM: false,
  };

  await aiTriggerService.fire(userId, overrideTrigger, {
    overMinutes: Math.round(overRestMinutes),
    taskHint,
    escalationLevel: level,
  });
}

// ---------------------------------------------------------------------------
// S5.5 task_stuck
// ---------------------------------------------------------------------------

export async function handleTaskStuck(
  userId: string,
  taskId: string,
  pomodoroPayload: Record<string, unknown>,
): Promise<void> {
  const trigger = aiTriggerService.getTrigger('task_stuck');
  if (!trigger) return;

  // Count consecutive pomodoros for this task today
  const consecutiveCount = await _countConsecutivePomodorosForTask(userId, taskId);
  if (consecutiveCount < 3) return;

  // Use task-specific cooldown key
  const taskSpecificTrigger: TriggerDefinition = {
    ...trigger,
    id: `task_stuck:${taskId}`,
  };

  const canFire = await aiTriggerService.shouldFire(userId, taskSpecificTrigger);
  if (!canFire) return;

  // Fetch task details
  const task = await prisma.task.findFirst({
    where: { id: taskId, project: { userId } },
    select: { title: true, priority: true, estimatedMinutes: true },
  });

  await aiTriggerService.fire(userId, taskSpecificTrigger, {
    ...pomodoroPayload,
    taskId,
    taskTitle: task?.title ?? 'Unknown',
    consecutiveCount,
    context: JSON.stringify({
      taskTitle: task?.title,
      priority: task?.priority,
      estimatedMinutes: task?.estimatedMinutes,
      consecutivePomodoros: consecutiveCount,
    }),
  });
}

async function _countConsecutivePomodorosForTask(
  userId: string,
  taskId: string,
): Promise<number> {
  // Get today's completed pomodoros in reverse chronological order
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const recentPomodoros = await prisma.pomodoro.findMany({
    where: {
      userId,
      status: 'COMPLETED',
      startTime: { gte: todayStart },
    },
    orderBy: { startTime: 'desc' },
    select: { taskId: true },
    take: 20,
  });

  // Count consecutive from most recent
  let count = 0;
  for (const p of recentPomodoros) {
    if (p.taskId === taskId) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Event router — called by the socket/event layer
// ---------------------------------------------------------------------------

export async function handleDailyStateChanged(
  userId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const newState = payload.newState as string | undefined;
  const previousState = payload.previousState as string | undefined;

  if (newState === 'planning') {
    await handlePlanningEnter(userId);
  }

  if (newState === 'rest' && previousState === 'focus') {
    // Also check for pomodoro completion context — the pomodoro.completed event
    // is the primary trigger for on_rest_enter (see handlePomodoroCompleted)
  }

  if (newState === 'over_rest') {
    await handleOverRestEnter(userId);
  }
}

export async function handlePomodoroCompleted(
  userId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  // S5.2: Fire on_rest_enter
  await handleRestEnter(userId, payload);

  // S5.5: Check task_stuck
  const taskId = payload.taskId as string | undefined;
  if (taskId) {
    await handleTaskStuck(userId, taskId, payload);
  }
}

export const chatTriggersStateService = {
  handleDailyStateChanged,
  handlePomodoroCompleted,
  handleOverRestEscalation,
  handlePlanningEnter,
  handleRestEnter,
  handleOverRestEnter,
  handleTaskStuck,
};

export default chatTriggersStateService;
