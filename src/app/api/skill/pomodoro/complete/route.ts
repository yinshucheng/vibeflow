/**
 * POST /api/skill/pomodoro/complete — Complete the active pomodoro
 *
 * Body (optional): { summary?: string }
 */

import { NextRequest } from 'next/server';
import { authenticateRequest, unauthorizedResponse, serviceResultResponse, errorResponse } from '@/lib/skill-auth';
import { pomodoroService } from '@/services/pomodoro.service';

export async function POST(req: NextRequest) {
  const user = await authenticateRequest(req, 'write');
  if (!user) return unauthorizedResponse();

  try {
    // Find the active pomodoro first
    const currentResult = await pomodoroService.getCurrent(user.userId);
    if (!currentResult.success || !currentResult.data) {
      return errorResponse('NOT_FOUND', 'No active pomodoro', 404);
    }

    const body = await req.json().catch(() => ({}));
    const result = await pomodoroService.complete(
      currentResult.data.id,
      user.userId,
      body.summary ? { summary: body.summary } : undefined
    );
    return serviceResultResponse(result);
  } catch (error) {
    console.error('[Skill API] POST /pomodoro/complete error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to complete pomodoro', 500);
  }
}
