/**
 * /api/skill/tasks/[id]
 * GET    — Task details
 * PUT    — Update task
 * DELETE — Delete task
 */

import { NextRequest } from 'next/server';
import { authenticateRequest, resolveAuth, unauthorizedResponse, serviceResultResponse, errorResponse } from '@/lib/skill-auth';
import { taskService } from '@/services/task.service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = resolveAuth(await authenticateRequest(req, 'read'));
  if (error) return error;

  try {
    const { id } = await params;
    const result = await taskService.getById(id, user.userId);
    return serviceResultResponse(result);
  } catch (error) {
    console.error('[Skill API] GET /tasks/[id] error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to get task', 500);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = resolveAuth(await authenticateRequest(req, 'write'));
  if (error) return error;

  try {
    const { id } = await params;
    const body = await req.json();
    const result = await taskService.update(id, user.userId, body);
    return serviceResultResponse(result);
  } catch (error) {
    console.error('[Skill API] PUT /tasks/[id] error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to update task', 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = resolveAuth(await authenticateRequest(req, 'write'));
  if (error) return error;

  try {
    const { id } = await params;
    const result = await taskService.delete(id, user.userId);
    return serviceResultResponse(result);
  } catch (error) {
    console.error('[Skill API] DELETE /tasks/[id] error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to delete task', 500);
  }
}
