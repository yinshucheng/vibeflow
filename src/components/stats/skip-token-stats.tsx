'use client';

/**
 * Skip Token Stats Component
 * 
 * Displays skip token usage history and statistics.
 * Requirements: 5.7
 */

import { useMemo } from 'react';
import { Card, CardHeader, CardContent } from '@/components/layout';
import { trpc } from '@/lib/trpc';

interface SkipTokenStatsProps {
  /** Number of days to show history for */
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
 * Get color class based on usage percentage
 */
function getUsageColor(used: number, limit: number): string {
  if (limit === 0) return 'bg-gray-200';
  const percentage = (used / limit) * 100;
  if (percentage === 0) return 'bg-green-100 text-green-700';
  if (percentage <= 50) return 'bg-yellow-100 text-yellow-700';
  if (percentage < 100) return 'bg-orange-100 text-orange-700';
  return 'bg-red-100 text-red-700';
}

export function SkipTokenStats({ days = 7 }: SkipTokenStatsProps) {
  // Calculate date range
  const dateRange = useMemo(() => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days + 1);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    return { startDate, endDate };
  }, [days]);

  // Fetch skip token history
  const { data: history, isLoading, error } = trpc.skipToken.getHistory.useQuery({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  // Fetch current status
  const { data: currentStatus } = trpc.skipToken.getStatus.useQuery();

  // Calculate statistics
  const stats = useMemo(() => {
    if (!history || history.length === 0) {
      return {
        totalUsed: 0,
        averagePerDay: 0,
        daysWithUsage: 0,
        maxUsageDay: null as { date: Date; count: number } | null,
      };
    }

    const totalUsed = history.reduce((sum, entry) => sum + entry.usedCount, 0);
    const daysWithUsage = history.filter(entry => entry.usedCount > 0).length;
    const averagePerDay = totalUsed / days;
    
    const maxEntry = history.reduce((max, entry) => 
      entry.usedCount > (max?.usedCount ?? 0) ? entry : max,
      null as typeof history[0] | null
    );

    return {
      totalUsed,
      averagePerDay,
      daysWithUsage,
      maxUsageDay: maxEntry ? { date: maxEntry.date, count: maxEntry.usedCount } : null,
    };
  }, [history, days]);

  // Generate all days in range for display
  const allDays = useMemo(() => {
    const result: Array<{
      date: Date;
      usedCount: number;
      dailyLimit: number;
      hasData: boolean;
    }> = [];

    const currentDate = new Date(dateRange.startDate);
    while (currentDate <= dateRange.endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const historyEntry = history?.find(h => 
        new Date(h.date).toISOString().split('T')[0] === dateStr
      );

      result.push({
        date: new Date(currentDate),
        usedCount: historyEntry?.usedCount ?? 0,
        dailyLimit: historyEntry?.dailyLimit ?? currentStatus?.dailyLimit ?? 3,
        hasData: !!historyEntry,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return result.reverse(); // Most recent first
  }, [dateRange, history, currentStatus?.dailyLimit]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader title="⏭️ Skip Token 使用记录" />
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
        <CardHeader title="⏭️ Skip Token 使用记录" />
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
        title="⏭️ Skip Token 使用记录" 
        description={`过去 ${days} 天的跳过/延迟令牌使用情况`}
      />
      <CardContent className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Total Used */}
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">
              {stats.totalUsed}
            </div>
            <div className="text-sm text-blue-600/70">总使用次数</div>
          </div>

          {/* Average Per Day */}
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {stats.averagePerDay.toFixed(1)}
            </div>
            <div className="text-sm text-green-600/70">日均使用</div>
          </div>

          {/* Days With Usage */}
          <div className="p-4 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">
              {stats.daysWithUsage}
            </div>
            <div className="text-sm text-yellow-600/70">使用天数</div>
          </div>

          {/* Current Remaining */}
          <div className="p-4 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">
              {currentStatus?.remaining ?? 0}
            </div>
            <div className="text-sm text-purple-600/70">今日剩余</div>
          </div>
        </div>

        {/* Current Mode Info */}
        {currentStatus && (
          <div className={`p-3 rounded-lg ${
            currentStatus.enforcementMode === 'strict' 
              ? 'bg-red-50 border border-red-200' 
              : 'bg-orange-50 border border-orange-200'
          }`}>
            <div className="flex items-center justify-between">
              <span className={`text-sm font-medium ${
                currentStatus.enforcementMode === 'strict' 
                  ? 'text-red-700' 
                  : 'text-orange-700'
              }`}>
                {currentStatus.enforcementMode === 'strict' ? '🔒 严格模式' : '🔓 温和模式'}
              </span>
              <span className={`text-sm ${
                currentStatus.enforcementMode === 'strict' 
                  ? 'text-red-600' 
                  : 'text-orange-600'
              }`}>
                每日限额: {currentStatus.dailyLimit} | 最大延迟: {currentStatus.maxDelayMinutes}分钟
              </span>
            </div>
          </div>
        )}

        {/* Daily History */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">每日使用详情</h4>
          <div className="space-y-2">
            {allDays.map((day, index) => {
              const isToday = index === 0;
              const usagePercentage = day.dailyLimit > 0 
                ? (day.usedCount / day.dailyLimit) * 100 
                : 0;

              return (
                <div 
                  key={day.date.toISOString()}
                  className={`flex items-center gap-4 p-3 rounded-lg ${
                    isToday ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'
                  }`}
                >
                  {/* Date */}
                  <div className="w-24 text-sm">
                    <span className={isToday ? 'font-medium text-blue-700' : 'text-gray-600'}>
                      {isToday ? '今天' : formatDate(day.date)}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ${
                          usagePercentage === 0 ? 'bg-green-400' :
                          usagePercentage <= 50 ? 'bg-yellow-400' :
                          usagePercentage < 100 ? 'bg-orange-400' :
                          'bg-red-400'
                        }`}
                        style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Usage Count */}
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                    getUsageColor(day.usedCount, day.dailyLimit)
                  }`}>
                    {day.usedCount} / {day.dailyLimit}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Empty State */}
        {allDays.every(d => d.usedCount === 0) && (
          <div className="text-center py-4 text-gray-500">
            <span className="text-2xl">🎉</span>
            <p className="mt-2">太棒了！过去 {days} 天没有使用任何跳过令牌</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SkipTokenStats;
