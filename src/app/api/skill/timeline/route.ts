/**
 * GET /api/skill/timeline — Today's timeline
 *
 * Query params:
 *   date — ISO date string (default: today)
 */

import { NextRequest } from 'next/server';
import { authenticateRequest, unauthorizedResponse, serviceResultResponse, errorResponse } from '@/lib/skill-auth';
import { timelineService } from '@/services/timeline.service';

export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req, 'read');
  if (!user) return unauthorizedResponse();

  try {
    const dateParam = req.nextUrl.searchParams.get('date');
    const date = dateParam ? new Date(dateParam) : new Date();

    if (isNaN(date.getTime())) {
      return errorResponse('VALIDATION_ERROR', 'Invalid date format', 400);
    }

    const result = await timelineService.getCombinedTimeline(user.userId, date);
    return serviceResultResponse(result);
  } catch (error) {
    console.error('[Skill API] GET /timeline error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to get timeline', 500);
  }
}
