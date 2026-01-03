'use client';

/**
 * EntertainmentStats Component
 * 
 * Displays entertainment time statistics including daily/weekly totals and quota usage.
 * Requirements: 12.5, 12.6
 */

import { useMemo } from 'react';
import { Card, CardHeader, CardContent } from '@/components/layout';
import { trpc } from '@/lib/trpc';

interface EntertainmentStatsProps {
  days?: number;
}

// Format minutes to hours and minutes
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours === 0) return `${mins}分钟`;
  if (mins === 0) return `${hours}小时`;
  return `${hours}小时${mins}分钟`;
}

export function EntertainmentStats({ days = 7 }: EntertainmentStatsProps) {
  // Fetch entertainment history
  const { data: history, isLoading, error } = trpc.entertainment.getHistory.useQuery({ days });
  
  // Fetch current status
  const { data: status } = trpc.entertainment.getStatus.useQuery();

  // Calculate statistics
  const stats = useMemo(() => {
    if (!history || history.length === 0) {
      return {
        totalMinutes: 0,
        averageMinutes: 0,
        totalSessions: 0,
        daysWithEntertainment: 0,
        topSites: [] as { site: string; count: number }[],
      };
    }

    const totalMinutes = history.reduce((sum, day) => sum + day.quotaUsedMinutes, 0);
    const totalSessions = history.reduce((sum, day) => sum + day.sessionCount, 0);
    const daysWithEntertainment = history.filter(day => day.quotaUsedMinutes > 0).length;
    const averageMinutes = daysWithEntertainment > 0 
      ? Math.round(totalMinutes / daysWithEntertainment) 
      : 0;

    // Aggregate sites visited
    const siteCounts: Record<string, number> = {};
    for (const day of history) {
      for (const site of day.sitesVisited) {
        siteCounts[site] = (siteCounts[site] || 0) + 1;
      }
    }
    const topSites = Object.entries(siteCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([site, count]) => ({ site, count }));

    return {
      totalMinutes,
      averageMinutes,
      totalSessions,
      daysWithEntertainment,
      topSites,
    };
  }, [history]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader title="🎮 娱乐时间统计" />
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-lg" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader title="🎮 娱乐时间统计" />
        <CardContent>
          <div className="text-center py-4 text-red-500">
            加载失败: {error.message}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader 
        title="🎮 娱乐时间统计" 
        description={`最近 ${days} 天`}
      />
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Total Time */}
          <div className="p-3 bg-purple-50 rounded-lg">
            <div className="text-xl font-bold text-purple-600">
              {formatDuration(stats.totalMinutes)}
            </div>
            <div className="text-xs text-purple-600/70">总娱乐时间</div>
          </div>

          {/* Average Per Day */}
          <div className="p-3 bg-blue-50 rounded-lg">
            <div className="text-xl font-bold text-blue-600">
              {formatDuration(stats.averageMinutes)}
            </div>
            <div className="text-xs text-blue-600/70">日均时间</div>
          </div>

          {/* Total Sessions */}
          <div className="p-3 bg-green-50 rounded-lg">
            <div className="text-xl font-bold text-green-600">
              {stats.totalSessions}
            </div>
            <div className="text-xs text-green-600/70">娱乐次数</div>
          </div>

          {/* Days with Entertainment */}
          <div className="p-3 bg-yellow-50 rounded-lg">
            <div className="text-xl font-bold text-yellow-600">
              {stats.daysWithEntertainment}/{days}
            </div>
            <div className="text-xs text-yellow-600/70">使用天数</div>
          </div>
        </div>

        {/* Today's Quota Usage (Requirements 12.6) */}
        {status && (
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">今日配额使用</span>
              <span className="text-sm text-gray-500">
                {status.quotaUsed}/{status.quotaTotal} 分钟
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all ${
                  status.quotaRemaining === 0 
                    ? 'bg-red-500' 
                    : status.quotaRemaining < 30 
                      ? 'bg-yellow-500' 
                      : 'bg-purple-500'
                }`}
                style={{ width: `${Math.min(100, (status.quotaUsed / status.quotaTotal) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-gray-500">
                已使用 {formatDuration(status.quotaUsed)}
              </span>
              <span className="text-xs text-gray-500">
                剩余 {formatDuration(status.quotaRemaining)}
              </span>
            </div>
          </div>
        )}

        {/* Top Sites */}
        {stats.topSites.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">常访问网站</h4>
            <div className="space-y-2">
              {stats.topSites.map(({ site, count }) => (
                <div key={site} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 truncate flex-1">{site}</span>
                  <span className="text-xs text-gray-400 ml-2">{count} 次</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {stats.totalMinutes === 0 && (
          <div className="text-center py-4 text-gray-500">
            <div className="text-2xl mb-2">🎮</div>
            <p className="text-sm">最近 {days} 天没有娱乐记录</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default EntertainmentStats;
