/**
 * /api/skill/pomodoro
 * GET  — Current pomodoro
 * POST — Start a new pomodoro
 */

import { NextRequest } from 'next/server';
import { authenticateRequest, unauthorizedResponse, serviceResultResponse, errorResponse } from '@/lib/skill-auth';
import { pomodoroService } from '@/services/pomodoro.service';

export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req, 'read');
  if (!user) return unauthorizedResponse();

  try {
    const result = await pomodoroService.getCurrent(user.userId);
    return serviceResultResponse(result);
  } catch (error) {
    console.error('[Skill API] GET /pomodoro error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to get current pomodoro', 500);
  }
}

export async function POST(req: NextRequest) {
  const user = await authenticateRequest(req, 'write');
  if (!user) return unauthorizedResponse();

  try {
    const body = await req.json().catch(() => ({}));
    const result = await pomodoroService.start(user.userId, body);
    return serviceResultResponse(result);
  } catch (error) {
    console.error('[Skill API] POST /pomodoro error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to start pomodoro', 500);
  }
}
