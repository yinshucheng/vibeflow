/**
 * POST /api/skill/tasks/inbox — Quick create inbox task
 *
 * Creates a task in the first active project's inbox (no planDate).
 * Equivalent to MCP flow_quick_create_inbox_task.
 */

import { NextRequest } from 'next/server';
import { authenticateRequest, resolveAuth, errorResponse, serviceResultResponse } from '@/lib/skill-auth';
import { taskService } from '@/services/task.service';

export async function POST(req: NextRequest) {
  const { user, error } = resolveAuth(await authenticateRequest(req, 'write'));
  if (error) return error;

  try {
    const body = await req.json();
    const title = body.title;
    if (!title || typeof title !== 'string') {
      return errorResponse('VALIDATION_ERROR', 'title is required', 400);
    }
    const result = await taskService.quickCreateInboxTask(user.userId, title);
    return serviceResultResponse(result);
  } catch (err) {
    console.error('[Skill API] POST /tasks/inbox error:', err);
    return errorResponse('INTERNAL_ERROR', 'Failed to create inbox task', 500);
  }
}
