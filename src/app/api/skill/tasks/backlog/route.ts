/**
 * GET /api/skill/tasks/backlog — Backlog tasks (no planDate)
 */

import { NextRequest } from 'next/server';
import { authenticateRequest, unauthorizedResponse, serviceResultResponse, errorResponse } from '@/lib/skill-auth';
import { taskService } from '@/services/task.service';

export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req, 'read');
  if (!user) return unauthorizedResponse();

  try {
    const result = await taskService.getBacklog(user.userId);
    return serviceResultResponse(result);
  } catch (error) {
    console.error('[Skill API] GET /tasks/backlog error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to get backlog', 500);
  }
}
