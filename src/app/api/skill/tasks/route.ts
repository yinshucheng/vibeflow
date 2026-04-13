/**
 * /api/skill/tasks
 * GET  — Today's tasks
 * POST — Create a task
 */

import { NextRequest } from 'next/server';
import { authenticateRequest, unauthorizedResponse, serviceResultResponse, errorResponse } from '@/lib/skill-auth';
import { taskService } from '@/services/task.service';

export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req, 'read');
  if (!user) return unauthorizedResponse();

  try {
    const includeDone = req.nextUrl.searchParams.get('includeDone') === 'true';
    const result = await taskService.getTodayTasks(user.userId, includeDone);
    return serviceResultResponse(result);
  } catch (error) {
    console.error('[Skill API] GET /tasks error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to get tasks', 500);
  }
}

export async function POST(req: NextRequest) {
  const user = await authenticateRequest(req, 'write');
  if (!user) return unauthorizedResponse();

  try {
    const body = await req.json();
    const result = await taskService.create(user.userId, body);
    return serviceResultResponse(result);
  } catch (error) {
    console.error('[Skill API] POST /tasks error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to create task', 500);
  }
}
