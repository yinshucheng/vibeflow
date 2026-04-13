/**
 * POST /api/skill/tasks/batch — Batch update tasks
 *
 * Body: { updates: [{ id: string, ...updateFields }] }
 */

import { NextRequest } from 'next/server';
import { authenticateRequest, unauthorizedResponse, errorResponse } from '@/lib/skill-auth';
import { taskService } from '@/services/task.service';

export async function POST(req: NextRequest) {
  const user = await authenticateRequest(req, 'write');
  if (!user) return unauthorizedResponse();

  try {
    const body = await req.json();
    const updates: Array<{ id: string; [key: string]: unknown }> = body.updates;

    if (!Array.isArray(updates) || updates.length === 0) {
      return errorResponse('VALIDATION_ERROR', 'updates array is required', 400);
    }

    if (updates.length > 50) {
      return errorResponse('VALIDATION_ERROR', 'Maximum 50 updates per batch', 400);
    }

    const results = [];
    const errors = [];

    for (const update of updates) {
      const { id, ...data } = update;
      if (!id) {
        errors.push({ id: null, error: 'id is required' });
        continue;
      }
      const result = await taskService.update(id, user.userId, data);
      if (result.success) {
        results.push({ id, success: true });
      } else {
        errors.push({ id, error: result.error?.message || 'Update failed' });
      }
    }

    return Response.json({
      success: true,
      data: { updated: results.length, failed: errors.length, results, errors },
    });
  } catch (error) {
    console.error('[Skill API] POST /tasks/batch error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to batch update tasks', 500);
  }
}
