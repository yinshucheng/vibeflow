'use client';

/**
 * WorkStartStats Component
 * 
 * Displays work start time statistics including average delay and trend chart.
 * Requirements: 14.3, 14.4, 14.5, 14.6
 */

import { useMemo } from 'react';
import { Card, CardHeader, CardContent } from '@/components/layout';
import { trpc } from '@/lib/trpc';

interface WorkStartStatsProps {
  days?: number;
}

// Format minutes to human readable
function formatDelay(minutes: number): string {
  if (minutes === 0) return '准时';
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}小时`;
  return `${hours}小时${mins}分钟`;
}

// Get delay color class
function getDelayColor(minutes: number): string {
  if (minutes === 0) return 'text-green-600';
  if (minutes <= 30) return 'text-yellow-600';
  return 'text-red-600';
}

// Get delay background color class
function getDelayBgColor(minutes: number): string {
  if (minutes === 0) return 'bg-green-50';
  if (minutes <= 30) return 'bg-yellow-50';
  return 'bg-red-50';
}

export function WorkStartStats({ days = 30 }: WorkStartStatsProps) {
  // Fetch work start stats
  const { data: stats, isLoading: statsLoading, error: statsError } = trpc.workStart.getStats.useQuery({ days });
  
  // Fetch work start trend
  const { data: trend, isLoading: trendLoading } = trpc.workStart.getTrend.useQuery({ days });

  // Calculate trend visualization data
  const trendData = useMemo(() => {
    if (!trend || trend.length === 0) return [];
    
    const maxDelay = Math.max(...trend.map(t => t.delayMinutes), 60);
    
    return trend.map(t => ({
      date: t.date,
      delay: t.delayMinutes,
      height: Math.max(4, (t.delayMinutes / maxDelay) * 100),
      color: t.delayMinutes === 0 
        ? 'bg-green-400' 
        : t.delayMinutes <= 30 
          ? 'bg-yellow-400' 
          : 'bg-red-400',
    }));
  }, [trend]);

  const isLoading = statsLoading || trendLoading;

  if (isLoading) {
    return (
      <Card>
        <CardHeader title="🚀 工作启动统计" />
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-lg" />
              ))}
            </div>
            <div className="h-24 bg-gray-100 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (statsError) {
    return (
      <Card>
        <CardHeader title="🚀 工作启动统计" />
        <CardContent>
          <div className="text-center py-4 text-red-500">
            加载失败: {statsError.message}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!stats || stats.totalDays === 0) {
    return (
      <Card>
        <CardHeader title="🚀 工作启动统计" description={`最近 ${days} 天`} />
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <div className="text-3xl mb-2">🚀</div>
            <p className="text-sm">暂无工作启动记录</p>
            <p className="text-xs text-gray-400 mt-1">完成 Airlock 后会自动记录</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader 
        title="🚀 工作启动统计" 
        description={`最近 ${days} 天`}
      />
      <CardContent className="space-y-4">
        {/* Summary Stats (Requirements 14.5) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* On-time Rate */}
          <div className="p-3 bg-green-50 rounded-lg">
            <div className="text-xl font-bold text-green-600">
              {stats.onTimePercentage}%
            </div>
            <div className="text-xs text-green-600/70">准时率</div>
          </div>

          {/* Average Delay */}
          <div className={`p-3 rounded-lg ${getDelayBgColor(stats.averageDelayMinutes)}`}>
            <div className={`text-xl font-bold ${getDelayColor(stats.averageDelayMinutes)}`}>
              {formatDelay(stats.averageDelayMinutes)}
            </div>
            <div className="text-xs opacity-70">平均延迟</div>
          </div>

          {/* Max Delay */}
          <div className={`p-3 rounded-lg ${getDelayBgColor(stats.maxDelayMinutes)}`}>
            <div className={`text-xl font-bold ${getDelayColor(stats.maxDelayMinutes)}`}>
              {formatDelay(stats.maxDelayMinutes)}
            </div>
            <div className="text-xs opacity-70">最大延迟</div>
          </div>

          {/* Days Tracked */}
          <div className="p-3 bg-blue-50 rounded-lg">
            <div className="text-xl font-bold text-blue-600">
              {stats.onTimeDays}/{stats.totalDays}
            </div>
            <div className="text-xs text-blue-600/70">准时天数</div>
          </div>
        </div>

        {/* Trend Chart (Requirements 14.6) */}
        {trendData.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">启动时间趋势</h4>
            <div className="p-4 bg-gray-50 rounded-lg">
              {/* Simple bar chart */}
              <div className="flex items-end justify-between gap-1 h-24">
                {trendData.slice(-14).map((item, idx) => (
                  <div 
                    key={idx}
                    className="flex-1 flex flex-col items-center"
                    title={`${item.date}: ${item.delay === 0 ? '准时' : `延迟${item.delay}分钟`}`}
                  >
                    <div 
                      className={`w-full rounded-t ${item.color} transition-all`}
                      style={{ height: `${item.height}%`, minHeight: '4px' }}
                    />
                  </div>
                ))}
              </div>
              {/* X-axis labels */}
              <div className="flex justify-between mt-2">
                <span className="text-xs text-gray-400">
                  {trendData.length > 0 ? trendData[Math.max(0, trendData.length - 14)].date.slice(5) : ''}
                </span>
                <span className="text-xs text-gray-400">
                  {trendData.length > 0 ? trendData[trendData.length - 1].date.slice(5) : ''}
                </span>
              </div>
              {/* Legend */}
              <div className="flex justify-center gap-4 mt-3">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-green-400 rounded" />
                  <span className="text-xs text-gray-500">准时</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-yellow-400 rounded" />
                  <span className="text-xs text-gray-500">≤30分钟</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-red-400 rounded" />
                  <span className="text-xs text-gray-500">&gt;30分钟</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Recent Records */}
        {trend && trend.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">最近记录</h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {trend.slice(-7).reverse().map((record, idx) => (
                <div 
                  key={idx}
                  className={`flex items-center justify-between p-2 rounded ${getDelayBgColor(record.delayMinutes)}`}
                >
                  <span className="text-sm text-gray-600">{record.date}</span>
                  <span className={`text-sm font-medium ${getDelayColor(record.delayMinutes)}`}>
                    {record.delayMinutes === 0 ? '✓ 准时' : `延迟 ${record.delayMinutes} 分钟`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default WorkStartStats;
