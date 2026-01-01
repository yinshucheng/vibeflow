'use client';

/**
 * ExemptionHistory Component
 * 
 * Displays sleep exemption history including snoozes and focus session overrides.
 * Requirements: 14.3, 14.4, 14.5
 */

import { useMemo } from 'react';
import { Card, CardHeader, CardContent } from '@/components/layout';
import { trpc } from '@/lib/trpc';

interface ExemptionHistoryProps {
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
 * Format time for display
 */
function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format duration in minutes
 */
function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}小时`;
  return `${hours}小时${mins}分钟`;
}

export function ExemptionHistory({ days = 7 }: ExemptionHistoryProps) {
  // Fetch exemption history
  const { data: exemptions, isLoading, error } = trpc.sleepTime.getExemptionHistory.useQuery({
    days,
  });

  // Fetch exemption stats
  const { data: stats } = trpc.sleepTime.getExemptionStats.useQuery({
    days,
  });

  // Group exemptions by date
  const groupedExemptions = useMemo(() => {
    if (!exemptions) return [];

    const groups: Map<string, typeof exemptions> = new Map();

    for (const exemption of exemptions) {
      const dateKey = new Date(exemption.timestamp).toISOString().split('T')[0];
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(exemption);
    }

    return Array.from(groups.entries())
      .sort((a, b) => b[0].localeCompare(a[0])) // Sort by date descending
      .map(([date, items]) => ({
        date,
        items: items.sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        ),
      }));
  }, [exemptions]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader title="🌙 睡眠豁免记录" description="贪睡和专注覆盖事件" />
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
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
        <CardHeader title="🌙 睡眠豁免记录" />
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
        title="🌙 睡眠豁免记录" 
        description={`过去 ${days} 天的贪睡和专注覆盖事件 (Requirements: 14.3, 14.4, 14.5)`}
      />
      <CardContent className="space-y-6">
        {/* Weekly Summary Stats (Requirements: 14.4, 14.5) */}
        <div className="grid grid-cols-3 gap-4">
          {/* Total Snoozes */}
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">
              {stats?.totalSnoozes ?? 0}
            </div>
            <div className="text-sm text-blue-600/70">贪睡次数</div>
          </div>

          {/* Total Focus Overrides */}
          <div className="p-4 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">
              {stats?.totalFocusOverrides ?? 0}
            </div>
            <div className="text-sm text-purple-600/70">专注覆盖次数</div>
          </div>

          {/* Total Override Minutes */}
          <div className="p-4 bg-orange-50 rounded-lg">
            <div className="text-2xl font-bold text-orange-600">
              {formatDuration(stats?.totalOverrideMinutes ?? 0)}
            </div>
            <div className="text-sm text-orange-600/70">覆盖总时长</div>
          </div>
        </div>

        {/* Exemption List (Requirements: 14.3) */}
        {groupedExemptions.length === 0 ? (
          <div className="text-center py-8">
            <span className="text-4xl">😴</span>
            <p className="mt-2 text-gray-500">
              太棒了！过去 {days} 天没有睡眠豁免记录
            </p>
            <p className="text-sm text-gray-400">
              保持良好的睡眠习惯
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedExemptions.map(({ date, items }) => (
              <div key={date}>
                {/* Date Header */}
                <div className="text-sm font-medium text-gray-700 mb-2">
                  {formatDate(new Date(date))}
                </div>

                {/* Exemption Items */}
                <div className="space-y-2">
                  {items.map((exemption) => {
                    const isSnooze = exemption.type === 'snooze';
                    
                    return (
                      <div
                        key={exemption.id}
                        className={`
                          flex items-center justify-between p-3 rounded-lg
                          ${isSnooze ? 'bg-blue-50' : 'bg-purple-50'}
                        `}
                      >
                        <div className="flex items-center gap-3">
                          {/* Icon */}
                          <span className="text-xl">
                            {isSnooze ? '😴' : '🎯'}
                          </span>

                          {/* Details */}
                          <div>
                            <div className={`font-medium ${isSnooze ? 'text-blue-700' : 'text-purple-700'}`}>
                              {isSnooze ? '贪睡' : '专注覆盖'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {formatTime(new Date(exemption.timestamp))}
                            </div>
                          </div>
                        </div>

                        {/* Duration */}
                        <div className={`
                          px-3 py-1 rounded-full text-sm font-medium
                          ${isSnooze ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}
                        `}>
                          {formatDuration(exemption.duration)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tips */}
        {(stats?.totalSnoozes ?? 0) > 5 && (
          <div className="p-3 bg-yellow-50 rounded-lg text-sm text-yellow-700">
            <span className="mr-2">💡</span>
            提示：频繁使用贪睡可能影响睡眠质量，建议调整睡眠时间设置
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ExemptionHistory;
