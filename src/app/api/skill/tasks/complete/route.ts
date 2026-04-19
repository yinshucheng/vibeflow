/**
 * POST /api/skill/tasks/complete — Complete a task with optional summary
 *
 * Sets task status to DONE. More semantic than PUT /tasks/[id] for completion.
 * Equivalent to MCP flow_complete_task.
 */

import { NextRequest } from 'next/server';
import { authenticateRequest, resolveAuth, errorResponse, serviceResultResponse } from '@/lib/skill-auth';
import { taskService } from '@/services/task.service';

export async function POST(req: NextRequest) {
  const { user, error } = resolveAuth(await authenticateRequest(req, 'write'));
  if (error) return error;

  try {
    const body = await req.json();
    const { task_id, summary } = body;
    if (!task_id || typeof task_id !== 'string') {
      return errorResponse('VALIDATION_ERROR', 'task_id is required', 400);
    }

    const result = await taskService.updateStatus(task_id, user.userId, 'DONE', false);
    if (!result.success) return serviceResultResponse(result);

    return Response.json({
      success: true,
      data: {
        id: result.data?.id,
        title: result.data?.title,
        status: result.data?.status,
        summary: summary || null,
      },
    });
  } catch (err) {
    console.error('[Skill API] POST /tasks/complete error:', err);
    return errorResponse('INTERNAL_ERROR', 'Failed to complete task', 500);
  }
}
