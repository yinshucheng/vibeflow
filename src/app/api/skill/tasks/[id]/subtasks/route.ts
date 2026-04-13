/**
 * POST /api/skill/tasks/[id]/subtasks — Add a subtask
 */

import { NextRequest } from 'next/server';
import { authenticateRequest, unauthorizedResponse, serviceResultResponse, errorResponse } from '@/lib/skill-auth';
import { taskService } from '@/services/task.service';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await authenticateRequest(req, 'write');
  if (!user) return unauthorizedResponse();

  try {
    const { id: parentId } = await params;

    // Verify parent task exists and belongs to user
    const parentResult = await taskService.getById(parentId, user.userId);
    if (!parentResult.success) {
      return serviceResultResponse(parentResult);
    }

    const body = await req.json();
    const result = await taskService.create(user.userId, {
      ...body,
      parentId,
    });
    return serviceResultResponse(result);
  } catch (error) {
    console.error('[Skill API] POST /tasks/[id]/subtasks error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to add subtask', 500);
  }
}
