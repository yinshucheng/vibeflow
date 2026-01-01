'use client';

/**
 * DailyStats Component
 * 
 * Displays pomodoro statistics grouped by day with daily timeline.
 * Requirements: 3.3, 3.7
 */

import { useMemo } from 'react';
import { Card, CardHeader, CardContent, EmptyState } from '@/components/layout';
import type { DayStats as DayStatsType } from '@/services/stats.service';
import { formatDuration } from './stats-dashboard';

interface DailyStatsProps {
  stats: DayStatsType[];
  isLoading?: boolean;
}

// Format date for display
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (dateStr === today.toISOString().split('T')[0]) {
    return '今天';
  }
  if (dateStr === yesterday.toISOString().split('T')[0]) {
    return '昨天';
  }

  const options: Intl.DateTimeFormatOptions = { 
    month: 'short', 
    day: 'numeric',
    weekday: 'short'
  };
  return date.toLocaleDateString('zh-CN', options);
}

// Get day of week name
function getDayOfWeek(dateStr: string): string {
  const date = new Date(dateStr);
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return days[date.getDay()];
}

export function DailyStats({ stats, isLoading }: DailyStatsProps) {
  // Calculate max minutes for scaling
  const maxMinutes = useMemo(() => {
    if (!stats || stats.length === 0) return 0;
    return Math.max(...stats.map(s => s.totalMinutes));
  }, [stats]);

  // Calculate totals and averages
  const summary = useMemo(() => {
    if (!stats || stats.length === 0) {
      return { totalMinutes: 0, totalPomodoros: 0, avgMinutes: 0, avgPomodoros: 0 };
    }
    
    const totalMinutes = stats.reduce((sum, day) => sum + day.totalMinutes, 0);
    const totalPomodoros = stats.reduce((sum, day) => sum + day.pomodoroCount, 0);
    const daysWithData = stats.filter(day => day.pomodoroCount > 0).length;
    
    return {
      totalMinutes,
      totalPomodoros,
      avgMinutes: daysWithData > 0 ? totalMinutes / daysWithData : 0,
      avgPomodoros: daysWithData > 0 ? totalPomodoros / daysWithData : 0,
    };
  }, [stats]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader title="📅 每日统计" description="按日期分组的番茄时间线" />
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-16 h-4 bg-gray-100 rounded" />
                <div className="flex-1 h-6 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!stats || stats.length === 0) {
    return (
      <Card>
        <CardHeader title="📅 每日统计" description="按日期分组的番茄时间线" />
        <CardContent>
          <EmptyState
            icon="📅"
            title="暂无每日数据"
            description="在选定时间范围内没有完成的番茄记录"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader 
        title="📅 每日统计" 
        description="按日期分组的番茄时间线 (Requirement 3.3, 3.7)"
      />
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-gray-50 rounded-lg">
          <div className="text-center">
            <div className="text-lg font-bold text-gray-900">
              {stats.length}
            </div>
            <div className="text-xs text-gray-500">天数</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-blue-600">
              {formatDuration(summary.totalMinutes)}
            </div>
            <div className="text-xs text-gray-500">总时间</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-green-600">
              {Math.round(summary.avgMinutes)}分钟
            </div>
            <div className="text-xs text-gray-500">日均时间</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-purple-600">
              {summary.avgPomodoros.toFixed(1)}
            </div>
            <div className="text-xs text-gray-500">日均番茄</div>
          </div>
        </div>

        {/* Daily Bar Chart */}
        <div className="space-y-2">
          {stats.map((day) => {
            const barWidth = maxMinutes > 0 ? (day.totalMinutes / maxMinutes) * 100 : 0;
            const completionRate = day.pomodoroCount > 0
              ? (day.completedCount / day.pomodoroCount) * 100
              : 0;

            return (
              <div key={day.date} className="group">
                <div className="flex items-center gap-3">
                  {/* Date Label */}
                  <div className="w-20 flex-shrink-0 text-right">
                    <div className="text-sm font-medium text-gray-900">
                      {formatDate(day.date)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {getDayOfWeek(day.date)}
                    </div>
                  </div>

                  {/* Bar */}
                  <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden relative">
                    {/* Completed portion */}
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-green-400 to-green-500 transition-all duration-500"
                      style={{ 
                        width: `${barWidth * (completionRate / 100)}%` 
                      }}
                    />
                    {/* Interrupted/Aborted portion */}
                    <div
                      className="absolute inset-y-0 bg-gradient-to-r from-yellow-400 to-orange-400 transition-all duration-500"
                      style={{ 
                        left: `${barWidth * (completionRate / 100)}%`,
                        width: `${barWidth * ((100 - completionRate) / 100)}%` 
                      }}
                    />
                    
                    {/* Time Label on Bar */}
                    {day.totalMinutes > 0 && (
                      <div className="absolute inset-0 flex items-center px-2">
                        <span className={`
                          text-xs font-medium
                          ${barWidth > 30 ? 'text-white' : 'text-gray-700 ml-auto'}
                        `}>
                          {formatDuration(day.totalMinutes)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Pomodoro Count */}
                  <div className="w-16 flex-shrink-0 text-right">
                    <span className="text-sm font-medium text-gray-900">
                      🍅 {day.pomodoroCount}
                    </span>
                  </div>
                </div>

                {/* Expanded Details on Hover */}
                <div className="hidden group-hover:flex items-center gap-3 mt-1 ml-[92px] text-xs text-gray-500">
                  <span className="text-green-600">✓ {day.completedCount} 完成</span>
                  <span className="text-yellow-600">⏸ {day.interruptedCount} 中断</span>
                  <span className="text-red-600">✕ {day.abortedCount} 放弃</span>
                  <span className="text-gray-400">|</span>
                  <span>完成率 {completionRate.toFixed(0)}%</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Weekly Pattern Analysis */}
        {stats.length >= 7 && (
          <div className="pt-4 border-t border-gray-200">
            <h4 className="text-sm font-medium text-gray-700 mb-3">📊 周模式分析</h4>
            <div className="grid grid-cols-7 gap-1">
              {['日', '一', '二', '三', '四', '五', '六'].map((day, index) => {
                // Calculate average for this day of week
                const daysOfWeek = stats.filter(s => new Date(s.date).getDay() === index);
                const avgMinutes = daysOfWeek.length > 0
                  ? daysOfWeek.reduce((sum, d) => sum + d.totalMinutes, 0) / daysOfWeek.length
                  : 0;
                const intensity = maxMinutes > 0 ? avgMinutes / maxMinutes : 0;

                return (
                  <div key={day} className="text-center">
                    <div className="text-xs text-gray-500 mb-1">周{day}</div>
                    <div
                      className="h-8 rounded transition-colors"
                      style={{
                        backgroundColor: `rgba(34, 197, 94, ${Math.max(0.1, intensity)})`,
                      }}
                      title={`平均 ${Math.round(avgMinutes)} 分钟`}
                    />
                    <div className="text-xs text-gray-400 mt-1">
                      {Math.round(avgMinutes)}m
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 text-xs text-gray-500 pt-2">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-green-500" />
            <span>完成</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-yellow-500" />
            <span>中断/放弃</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
