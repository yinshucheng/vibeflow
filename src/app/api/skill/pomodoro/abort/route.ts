/**
 * POST /api/skill/pomodoro/abort — Abort the active pomodoro
 */

import { NextRequest } from 'next/server';
import { authenticateRequest, resolveAuth, unauthorizedResponse, serviceResultResponse, errorResponse } from '@/lib/skill-auth';
import { pomodoroService } from '@/services/pomodoro.service';

export async function POST(req: NextRequest) {
  const { user, error } = resolveAuth(await authenticateRequest(req, 'write'));
  if (error) return error;

  try {
    // Find the active pomodoro first
    const currentResult = await pomodoroService.getCurrent(user.userId);
    if (!currentResult.success || !currentResult.data) {
      return errorResponse('NOT_FOUND', 'No active pomodoro', 404);
    }

    const result = await pomodoroService.abort(currentResult.data.id, user.userId);
    return serviceResultResponse(result);
  } catch (error) {
    console.error('[Skill API] POST /pomodoro/abort error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to abort pomodoro', 500);
  }
}
