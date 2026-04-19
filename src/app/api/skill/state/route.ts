/**
 * GET /api/skill/state — Current system state
 */

import { NextRequest } from 'next/server';
import { authenticateRequest, resolveAuth, unauthorizedResponse, errorResponse } from '@/lib/skill-auth';
import { stateEngineService } from '@/services/state-engine.service';
import { dailyStateService } from '@/services/daily-state.service';
import { pomodoroService } from '@/services/pomodoro.service';

export async function GET(req: NextRequest) {
  const { user, error } = resolveAuth(await authenticateRequest(req, 'read'));
  if (error) return error;

  try {
    const [systemState, dailyStateResult, currentPomodoro] = await Promise.all([
      stateEngineService.getState(user.userId),
      dailyStateService.getOrCreateToday(user.userId),
      pomodoroService.getCurrent(user.userId),
    ]);

    const dailyState = dailyStateResult.success ? dailyStateResult.data : null;
    const pomodoro = currentPomodoro.success ? currentPomodoro.data : null;

    return Response.json({
      success: true,
      data: {
        systemState,
        pomodoroCount: dailyState?.pomodoroCount ?? 0,
        adjustedGoal: dailyState?.adjustedGoal ?? null,
        top3TaskIds: dailyState?.top3TaskIds ?? [],
        activePomodoro: pomodoro ? {
          id: pomodoro.id,
          taskId: pomodoro.taskId,
          taskTitle: pomodoro.task?.title ?? null,
          duration: pomodoro.duration,
          startTime: pomodoro.startTime,
        } : null,
      },
    });
  } catch (error) {
    console.error('[Skill API] GET /state error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to get state', 500);
  }
}
