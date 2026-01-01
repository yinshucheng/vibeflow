'use client';

/**
 * FocusSessionStats Component
 * 
 * Displays ad-hoc focus session statistics including total time and session count.
 * Requirements: 8.2, 8.3
 */

import { useMemo } from 'react';
import { Card, CardHeader, CardContent } from '@/components/layout';
import { trpc } from '@/lib/trpc';

interface FocusSessionStatsProps {
  /** Number of days to show stats for */
  days?: number;
}

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  });
}

/**
 * Format time for display
 */
function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format duration in minutes to hours and minutes
 */
function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}小时`;
  return `${hours}小时${mins}分钟`;
}

/**
 * Get status badge color
 */
function getStatusColor(status: string): { bg: string; text: string } {
  switch (status) {
    case 'completed':
      return { bg: 'bg-green-100', text: 'text-green-700' };
    case 'active':
      return { bg: 'bg-blue-100', text: 'text-blue-700' };
    case 'cancelled':
      return { bg: 'bg-red-100', text: 'text-red-700' };
    default:
      return { bg: 'bg-gray-100', text: 'text-gray-700' };
  }
}

/**
 * Get status display text
 */
function getStatusText(status: string): string {
  switch (status) {
    case 'completed':
      return '已完成';
    case 'active':
      return '进行中';
    case 'cancelled':
      return '已取消';
    default:
      return status;
  }
}

export function FocusSessionStats({ days = 7 }: FocusSessionStatsProps) {
  // Fetch session history
  const { data: sessions, isLoading, error } = trpc.focusSession.getSessionHistory.useQuery({
    days,
  });

  // Fetch session stats
  const { data: stats } = trpc.focusSession.getSessionStats.useQuery({
    days,
  });

  // Group sessions by date
  const groupedSessions = useMemo(() => {
    if (!sessions) return [];

    const groups: Map<string, typeof sessions> = new Map();

    for (const session of sessions) {
      const dateKey = new Date(session.createdAt).toISOString().split('T')[0];
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(session);
    }

    return Array.from(groups.entries())
      .sort((a, b) => b[0].localeCompare(a[0])) // Sort by date descending
      .map(([date, items]) => ({
        date,
        items: items.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
        totalMinutes: items.reduce((sum, s) => sum + s.duration, 0),
      }));
  }, [sessions]);

  // Calculate completion rate
  const completionRate = useMemo(() => {
    if (!sessions || sessions.length === 0) return 0;
    const completed = sessions.filter(s => s.status === 'completed').length;
    return Math.round((completed / sessions.length) * 100);
  }, [sessions]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader title="🎯 临时专注时段" description="Ad-hoc Focus Session 统计" />
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-lg" />
              ))}
            </div>
            <div className="h-40 bg-gray-100 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader title="🎯 临时专注时段" />
        <CardContent>
          <div className="text-center py-8 text-red-500">
            加载失败: {error.message}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader 
        title="🎯 临时专注时段" 
        description={`过去 ${days} 天的 Ad-hoc Focus Session 统计 (Requirements: 8.2, 8.3)`}
      />
      <CardContent className="space-y-6">
        {/* Summary Stats (Requirements: 8.2, 8.3) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Total Sessions */}
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">
              {stats?.totalSessions ?? 0}
            </div>
            <div className="text-sm text-blue-600/70">总会话数</div>
          </div>

          {/* Total Focus Time */}
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {formatDuration(stats?.totalMinutes ?? 0)}
            </div>
            <div className="text-sm text-green-600/70">总专注时间</div>
          </div>

          {/* Average Duration */}
          <div className="p-4 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">
              {stats?.averageDuration ?? 0}分钟
            </div>
            <div className="text-sm text-purple-600/70">平均时长</div>
          </div>

          {/* Completion Rate */}
          <div className="p-4 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">
              {completionRate}%
            </div>
            <div className="text-sm text-yellow-600/70">完成率</div>
          </div>
        </div>

        {/* Session History */}
        {groupedSessions.length === 0 ? (
          <div className="text-center py-8">
            <span className="text-4xl">🎯</span>
            <p className="mt-2 text-gray-500">
              过去 {days} 天没有临时专注时段记录
            </p>
            <p className="text-sm text-gray-400">
              在非工作时间使用临时专注功能来保持专注
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedSessions.map(({ date, items, totalMinutes }) => (
              <div key={date}>
                {/* Date Header */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    {formatDate(new Date(date))}
                  </span>
                  <span className="text-xs text-gray-500">
                    共 {formatDuration(totalMinutes)}
                  </span>
                </div>

                {/* Session Items */}
                <div className="space-y-2">
                  {items.map((session) => {
                    const statusColor = getStatusColor(session.status);
                    
                    return (
                      <div
                        key={session.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          {/* Time */}
                          <div className="text-sm text-gray-600">
                            {formatTime(new Date(session.startTime))}
                            {session.actualEndTime && (
                              <span className="text-gray-400">
                                {' → '}{formatTime(new Date(session.actualEndTime))}
                              </span>
                            )}
                          </div>

                          {/* Sleep Override Badge */}
                          {session.overridesSleepTime && (
                            <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">
                              🌙 覆盖睡眠
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          {/* Duration */}
                          <span className="text-sm font-medium text-gray-700">
                            {formatDuration(session.duration)}
                          </span>

                          {/* Status Badge */}
                          <span className={`
                            px-2 py-0.5 rounded-full text-xs font-medium
                            ${statusColor.bg} ${statusColor.text}
                          `}>
                            {getStatusText(session.status)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Usage Tips */}
        {(stats?.totalSessions ?? 0) > 0 && (
          <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
            <span className="mr-2">💡</span>
            临时专注时段帮助你在非工作时间保持专注，共计为你节省了 {formatDuration(stats?.totalMinutes ?? 0)} 的分心时间
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default FocusSessionStats;
