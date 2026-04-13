/**
 * /api/skill/top3
 * GET  — Get today's top 3 tasks
 * POST — Set today's top 3 tasks
 */

import { NextRequest } from 'next/server';
import { authenticateRequest, unauthorizedResponse, serviceResultResponse, errorResponse } from '@/lib/skill-auth';
import { dailyStateService } from '@/services/daily-state.service';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req, 'read');
  if (!user) return unauthorizedResponse();

  try {
    const result = await dailyStateService.getTop3Tasks(user.userId);
    return serviceResultResponse(result);
  } catch (error) {
    console.error('[Skill API] GET /top3 error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to get top 3', 500);
  }
}

export async function POST(req: NextRequest) {
  const user = await authenticateRequest(req, 'write');
  if (!user) return unauthorizedResponse();

  try {
    const body = await req.json();
    const taskIds: string[] = body.taskIds;

    if (!Array.isArray(taskIds) || taskIds.length === 0 || taskIds.length > 3) {
      return errorResponse('VALIDATION_ERROR', 'taskIds must be an array of 1-3 task IDs', 400);
    }

    // Verify all tasks exist and belong to user
    const tasks = await prisma.task.findMany({
      where: { id: { in: taskIds }, userId: user.userId },
    });
    if (tasks.length !== taskIds.length) {
      return errorResponse('NOT_FOUND', 'One or more tasks not found', 404);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.dailyState.upsert({
      where: { userId_date: { userId: user.userId, date: today } },
      update: { top3TaskIds: taskIds },
      create: {
        userId: user.userId,
        date: today,
        systemState: 'IDLE',
        top3TaskIds: taskIds,
      },
    });

    // Also set planDate for these tasks to today
    await prisma.task.updateMany({
      where: { id: { in: taskIds } },
      data: { planDate: today },
    });

    return Response.json({
      success: true,
      data: { taskIds },
    });
  } catch (error) {
    console.error('[Skill API] POST /top3 error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to set top 3', 500);
  }
}
