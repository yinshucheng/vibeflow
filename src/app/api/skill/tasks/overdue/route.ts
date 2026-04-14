/**
 * GET /api/skill/tasks/overdue — Overdue tasks
 */

import { NextRequest } from 'next/server';
import { authenticateRequest, resolveAuth, unauthorizedResponse, serviceResultResponse, errorResponse } from '@/lib/skill-auth';
import { taskService } from '@/services/task.service';

export async function GET(req: NextRequest) {
  const { user, error } = resolveAuth(await authenticateRequest(req, 'read'));
  if (error) return error;

  try {
    const result = await taskService.getOverdue(user.userId);
    return serviceResultResponse(result);
  } catch (error) {
    console.error('[Skill API] GET /tasks/overdue error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to get overdue tasks', 500);
  }
}
