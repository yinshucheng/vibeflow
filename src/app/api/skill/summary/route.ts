/**
 * GET /api/skill/summary — Daily work summary
 *
 * Returns completed tasks, pomodoro stats, efficiency score, highlights.
 * Equivalent to MCP flow_generate_daily_summary.
 *
 * Query params:
 *   ?date=YYYY-MM-DD (optional, defaults to today)
 */

import { NextRequest } from 'next/server';
import { authenticateRequest, resolveAuth, errorResponse } from '@/lib/skill-auth';
import prisma from '@/lib/prisma';
import { efficiencyAnalysisService } from '@/services/efficiency-analysis.service';

export async function GET(req: NextRequest) {
  const { user, error } = resolveAuth(await authenticateRequest(req, 'read'));
  if (error) return error;

  try {
    const dateParam = req.nextUrl.searchParams.get('date');
    let targetDate: Date;
    if (dateParam) {
      targetDate = new Date(dateParam);
      targetDate.setHours(0, 0, 0, 0);
    } else {
      targetDate = new Date();
      // VibeFlow daily reset at 04:00 AM
      if (targetDate.getHours() < 4) targetDate.setDate(targetDate.getDate() - 1);
      targetDate.setHours(0, 0, 0, 0);
    }
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const [pomodoros, completedTasks, settings] = await Promise.all([
      prisma.pomodoro.findMany({
        where: { userId: user.userId, startTime: { gte: targetDate, lt: nextDay }, status: 'COMPLETED' },
        include: { task: { select: { id: true, title: true } } },
      }),
      prisma.task.findMany({
        where: { userId: user.userId, status: 'DONE', updatedAt: { gte: targetDate, lt: nextDay } },
      }),
      prisma.userSettings.findUnique({ where: { userId: user.userId } }),
    ]);

    const totalPomodoros = pomodoros.length;
    const focusMinutes = pomodoros.reduce((sum, p) => sum + p.duration, 0);

    // Group pomodoros by task
    const taskPomodoroMap = new Map<string, { title: string; count: number }>();
    for (const p of pomodoros) {
      if (!p.taskId) continue;
      const existing = taskPomodoroMap.get(p.taskId);
      if (existing) existing.count++;
      else taskPomodoroMap.set(p.taskId, { title: p.task?.title ?? 'Unknown', count: 1 });
    }

    const taskBreakdown = Array.from(taskPomodoroMap.values())
      .sort((a, b) => b.count - a.count)
      .map(t => ({ title: t.title, pomodoros: t.count }));

    const expectedPomodoros = settings?.expectedPomodoroCount ?? 8;
    const efficiencyScore = Math.min(100, Math.round((totalPomodoros / expectedPomodoros) * 100));

    const highlights: string[] = [];
    if (completedTasks.length > 0) highlights.push(`完成了 ${completedTasks.length} 个任务`);
    if (totalPomodoros >= expectedPomodoros) highlights.push(`达成每日目标 ${expectedPomodoros} 个番茄钟！`);
    if (focusMinutes >= 120) highlights.push(`${Math.round(focusMinutes / 60)} 小时专注工作`);

    // Weekly trend
    const analysisResult = await efficiencyAnalysisService.getHistoricalAnalysis(user.userId, 7);
    const weeklyTrend = analysisResult.success ? analysisResult.data : null;

    return Response.json({
      success: true,
      data: {
        date: targetDate.toISOString().split('T')[0],
        totalPomodoros,
        expectedPomodoros,
        focusMinutes,
        efficiencyScore,
        completedTaskCount: completedTasks.length,
        taskBreakdown,
        highlights,
        weeklyTrend: weeklyTrend ? {
          averagePomodoros: weeklyTrend.averageDailyPomodoros,
          goalAchievementRate: weeklyTrend.goalAchievementRate,
        } : null,
      },
    });
  } catch (err) {
    console.error('[Skill API] GET /summary error:', err);
    return errorResponse('INTERNAL_ERROR', 'Failed to generate summary', 500);
  }
}
