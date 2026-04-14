/**
 * GET /api/skill/analytics — Productivity analytics
 *
 * Query params:
 *   days — Number of days for analysis (default: 7, max: 30)
 */

import { NextRequest } from 'next/server';
import { authenticateRequest, resolveAuth, unauthorizedResponse, errorResponse } from '@/lib/skill-auth';
import { statsService } from '@/services/stats.service';
import { progressCalculationService } from '@/services/progress-calculation.service';

export async function GET(req: NextRequest) {
  const { user, error } = resolveAuth(await authenticateRequest(req, 'read'));
  if (error) return error;

  try {
    const daysParam = req.nextUrl.searchParams.get('days');
    const days = Math.min(Math.max(parseInt(daysParam || '7', 10) || 7, 1), 30);

    const timeRange = days <= 1 ? 'today' as const : days <= 7 ? 'week' as const : 'month' as const;

    const [statsResult, progressResult] = await Promise.all([
      statsService.getStats(user.userId, { timeRange }),
      progressCalculationService.getDailyProgress(user.userId),
    ]);

    return Response.json({
      success: true,
      data: {
        period: { days, timeRange },
        stats: statsResult.success ? statsResult.data : null,
        todayProgress: progressResult.success ? progressResult.data : null,
      },
    });
  } catch (error) {
    console.error('[Skill API] GET /analytics error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to get analytics', 500);
  }
}
