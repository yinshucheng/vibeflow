/**
 * Chat Cron Triggers Service (S9)
 *
 * Scheduled (cron-like) AI triggers that fire at specific times:
 *   S9.1 morning_greeting  — Weekday morning reminder (when user is LOCKED)
 *   S9.2 evening_summary   — End-of-day summary (LLM-generated)
 *   S9.3 progress_check    — Every 2h progress check (don't interrupt FOCUS)
 *   S9.4 midday_check      — Midday review (disabled by default)
 *
 * All triggers go through the aiTriggerService framework (shouldFire + fire).
 */

import { prisma } from '@/lib/prisma';
import { aiTriggerService } from './ai-trigger.service';
import { stateEngineService } from './state-engine.service';
import type { TriggerDefinition } from './ai-trigger.service';

// ---------------------------------------------------------------------------
// Cron trigger definitions — registered into BUILTIN_TRIGGERS via init()
// ---------------------------------------------------------------------------

export const CRON_TRIGGER_DEFINITIONS: TriggerDefinition[] = [
  {
    id: 'morning_greeting',
    sourceType: 'cron',
    promptTemplate: [
      '新的一天开始了！你今天有 {{todayTaskCount}} 个任务待完成',
      '{{overdueHint}}',
      '准备好进入 Airlock 了吗？',
    ].join('，'),
    useLLM: false,
    cooldownSeconds: 86400, // once per day
    userConfigurable: true,
    defaultEnabled: true,
    priority: 'normal',
  },
  {
    id: 'evening_summary',
    sourceType: 'cron',
    promptTemplate: [
      '你是 VibeFlow 助手。今天的工作即将结束。',
      '请根据以下数据生成一段简洁的每日总结。',
      '',
      '今日数据：',
      '{{context}}',
    ].join('\n'),
    useLLM: true,
    cooldownSeconds: 86400,
    userConfigurable: true,
    defaultEnabled: true,
    priority: 'normal',
    scene: 'chat:summary',
  },
  {
    id: 'progress_check',
    sourceType: 'cron',
    promptTemplate: [
      '已过去 {{elapsedHours}} 小时，完成了 {{completed}}/{{target}} 个番茄钟。',
      '{{progressHint}}',
    ].join(''),
    useLLM: false,
    cooldownSeconds: 7200, // 2 hours
    userConfigurable: true,
    defaultEnabled: false, // disabled by default per design
    priority: 'low',
  },
  {
    id: 'midday_check',
    sourceType: 'cron',
    promptTemplate: [
      '你是 VibeFlow 助手。现在是午间时段。',
      '请根据上午的工作情况，给出简短的午间回顾和下午建议。',
      '',
      '上午数据：',
      '{{context}}',
    ].join('\n'),
    useLLM: true,
    cooldownSeconds: 86400,
    userConfigurable: true,
    defaultEnabled: false, // disabled by default
    priority: 'normal',
    scene: 'chat:summary',
  },
];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const chatTriggersCronService = {
  /**
   * Register cron triggers into the aiTriggerService registry.
   * Called once at init time.
   */
  init(): void {
    for (const def of CRON_TRIGGER_DEFINITIONS) {
      aiTriggerService.registerTrigger(def);
    }
  },

  // -----------------------------------------------------------------------
  // S9.1 morning_greeting
  // -----------------------------------------------------------------------

  async handleMorningGreeting(userId: string): Promise<void> {
    const trigger = aiTriggerService.getTrigger('morning_greeting');
    if (!trigger) return;

    // Condition: user must be in IDLE state (hasn't started work)
    const currentState = await stateEngineService.getState(userId);
    if (currentState !== 'idle') return;

    const canFire = await aiTriggerService.shouldFire(userId, trigger);
    if (!canFire) return;

    const context = await _buildMorningContext(userId);
    await aiTriggerService.fire(userId, trigger, context);
  },

  // -----------------------------------------------------------------------
  // S9.2 evening_summary
  // -----------------------------------------------------------------------

  async handleEveningSummary(userId: string): Promise<void> {
    const trigger = aiTriggerService.getTrigger('evening_summary');
    if (!trigger) return;

    const canFire = await aiTriggerService.shouldFire(userId, trigger);
    if (!canFire) return;

    const context = await _buildEveningContext(userId);
    await aiTriggerService.fire(userId, trigger, context);
  },

  // -----------------------------------------------------------------------
  // S9.3 progress_check
  // -----------------------------------------------------------------------

  async handleProgressCheck(userId: string): Promise<void> {
    const trigger = aiTriggerService.getTrigger('progress_check');
    if (!trigger) return;

    const canFire = await aiTriggerService.shouldFire(userId, trigger);
    if (!canFire) return;

    const context = await _buildProgressContext(userId);
    await aiTriggerService.fire(userId, trigger, context);
  },

  // -----------------------------------------------------------------------
  // S9.4 midday_check
  // -----------------------------------------------------------------------

  async handleMiddayCheck(userId: string): Promise<void> {
    const trigger = aiTriggerService.getTrigger('midday_check');
    if (!trigger) return;

    const canFire = await aiTriggerService.shouldFire(userId, trigger);
    if (!canFire) return;

    const context = await _buildMiddayContext(userId);
    await aiTriggerService.fire(userId, trigger, context);
  },

  // -----------------------------------------------------------------------
  // Cron runner — called every minute by the scheduler
  // -----------------------------------------------------------------------

  async runCronTriggers(): Promise<void> {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat

    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

    // Find all users who might need cron triggers
    // (users with active conversations or daily states)
    const activeUsers = await _getActiveUserIds();

    for (const userId of activeUsers) {
      // S9.1: Morning greeting — weekday 9:00
      if (isWeekday && hour === 9 && minute === 0) {
        await this.handleMorningGreeting(userId).catch((err) =>
          console.error(`[CronTrigger] morning_greeting failed for ${userId}:`, err)
        );
      }

      // S9.2: Evening summary — 18:00
      if (hour === 18 && minute === 0) {
        await this.handleEveningSummary(userId).catch((err) =>
          console.error(`[CronTrigger] evening_summary failed for ${userId}:`, err)
        );
      }

      // S9.3: Progress check — every 2h during work hours (10, 12, 14, 16)
      if ([10, 12, 14, 16].includes(hour) && minute === 0) {
        await this.handleProgressCheck(userId).catch((err) =>
          console.error(`[CronTrigger] progress_check failed for ${userId}:`, err)
        );
      }

      // S9.4: Midday check — 12:30
      if (hour === 12 && minute === 30) {
        await this.handleMiddayCheck(userId).catch((err) =>
          console.error(`[CronTrigger] midday_check failed for ${userId}:`, err)
        );
      }
    }
  },
};

// ---------------------------------------------------------------------------
// Context builders
// ---------------------------------------------------------------------------

async function _buildMorningContext(userId: string): Promise<Record<string, unknown>> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const [todayTasks, overdueTasks] = await Promise.all([
    prisma.task.findMany({
      where: {
        project: { userId },
        planDate: { gte: todayStart, lt: tomorrowStart },
        status: { not: 'DONE' },
      },
      select: { id: true },
    }),
    prisma.task.findMany({
      where: {
        project: { userId },
        planDate: { lt: todayStart },
        status: { not: 'DONE' },
      },
      select: { id: true },
    }),
  ]);

  const overdueHint = overdueTasks.length > 0
    ? `其中 ${overdueTasks.length} 个逾期`
    : '';

  return {
    todayTaskCount: todayTasks.length,
    overdueCount: overdueTasks.length,
    overdueHint,
  };
}

async function _buildEveningContext(userId: string): Promise<Record<string, unknown>> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [completedPomodoros, completedTasks, totalTasks] = await Promise.all([
    prisma.pomodoro.count({
      where: { userId, status: 'COMPLETED', startTime: { gte: todayStart } },
    }),
    prisma.task.count({
      where: {
        project: { userId },
        status: 'DONE',
        updatedAt: { gte: todayStart },
      },
    }),
    prisma.task.count({
      where: {
        project: { userId },
        planDate: { gte: todayStart },
        status: { not: 'DONE' },
      },
    }),
  ]);

  return {
    completedPomodoros,
    completedTasks,
    remainingTasks: totalTasks,
    context: JSON.stringify({ completedPomodoros, completedTasks, remainingTasks: totalTasks }),
  };
}

async function _buildProgressContext(userId: string): Promise<Record<string, unknown>> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const now = new Date();
  const elapsedHours = Math.round((now.getTime() - todayStart.getTime()) / 3600000);

  const completed = await prisma.pomodoro.count({
    where: { userId, status: 'COMPLETED', startTime: { gte: todayStart } },
  });

  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { dailyCap: true },
  });
  const target = settings?.dailyCap ?? 8;

  const progressHint = completed < target / 2
    ? '进度稍慢，需要调整今天的目标吗？'
    : '进度不错，继续保持！';

  return { elapsedHours, completed, target, progressHint };
}

async function _buildMiddayContext(userId: string): Promise<Record<string, unknown>> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const completedPomodoros = await prisma.pomodoro.count({
    where: { userId, status: 'COMPLETED', startTime: { gte: todayStart } },
  });

  return {
    completedPomodoros,
    context: JSON.stringify({ morningPomodoros: completedPomodoros }),
  };
}

async function _getActiveUserIds(): Promise<string[]> {
  // Get users who have an active DEFAULT conversation (i.e. have used chat)
  const conversations = await prisma.conversation.findMany({
    where: { type: 'DEFAULT', status: 'ACTIVE' },
    select: { userId: true },
    distinct: ['userId'],
  });
  return conversations.map((c) => c.userId);
}

// Init cron triggers into the registry
chatTriggersCronService.init();

export default chatTriggersCronService;
