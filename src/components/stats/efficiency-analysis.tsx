'use client';

/**
 * EfficiencyAnalysis Component
 * 
 * Displays historical efficiency analysis with time period breakdown and insights.
 * Requirements: 24.1, 24.1.1, 24.1.2, 24.1.3, 24.1.4, 24.1.5
 */

import { useMemo } from 'react';
import { Card, CardHeader, CardContent } from '@/components/layout';
import { trpc } from '@/lib/trpc';
import type { TimePeriod, TimePeriodStats, EfficiencyInsight } from '@/services/efficiency-analysis.service';

interface EfficiencyAnalysisProps {
  /** Number of days to analyze */
  days?: number;
}

// Time period display names
const PERIOD_NAMES: Record<TimePeriod, string> = {
  morning: '上午',
  afternoon: '下午',
  evening: '晚上',
};

// Time period icons
const PERIOD_ICONS: Record<TimePeriod, string> = {
  morning: '🌅',
  afternoon: '☀️',
  evening: '🌙',
};

// Time period colors
const PERIOD_COLORS: Record<TimePeriod, { bg: string; text: string; bar: string }> = {
  morning: { bg: 'bg-orange-50', text: 'text-orange-700', bar: 'bg-orange-400' },
  afternoon: { bg: 'bg-yellow-50', text: 'text-yellow-700', bar: 'bg-yellow-400' },
  evening: { bg: 'bg-indigo-50', text: 'text-indigo-700', bar: 'bg-indigo-400' },
};

// Insight type icons and colors
const INSIGHT_STYLES: Record<string, { icon: string; bg: string; text: string }> = {
  best_period: { icon: '🏆', bg: 'bg-green-50', text: 'text-green-700' },
  pattern: { icon: '📊', bg: 'bg-blue-50', text: 'text-blue-700' },
  suggestion: { icon: '💡', bg: 'bg-yellow-50', text: 'text-yellow-700' },
  warning: { icon: '⚠️', bg: 'bg-red-50', text: 'text-red-700' },
};

/**
 * Format minutes to hours and minutes
 */
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours === 0) return `${mins}分钟`;
  if (mins === 0) return `${hours}小时`;
  return `${hours}小时${mins}分钟`;
}

export function EfficiencyAnalysis({ days = 30 }: EfficiencyAnalysisProps) {
  // Fetch historical analysis
  const { data: analysis, isLoading, error } = trpc.efficiencyAnalysis.getHistoricalAnalysis.useQuery({
    days,
  });

  // Find the best time period
  const bestPeriod = useMemo(() => {
    if (!analysis?.byTimePeriod || analysis.byTimePeriod.length === 0) return null;
    return analysis.byTimePeriod.reduce((best, current) =>
      current.averagePomodoros > best.averagePomodoros ? current : best
    );
  }, [analysis?.byTimePeriod]);

  // Calculate max for scaling bars
  const maxPomodoros = useMemo(() => {
    if (!analysis?.byTimePeriod) return 0;
    return Math.max(...analysis.byTimePeriod.map(p => p.averagePomodoros), 1);
  }, [analysis?.byTimePeriod]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader title="📈 效率分析" description="分时段效率统计与洞察" />
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-gray-100 rounded-lg" />
              ))}
            </div>
            <div className="h-32 bg-gray-100 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader title="📈 效率分析" />
        <CardContent>
          <div className="text-center py-8 text-red-500">
            加载失败: {error.message}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!analysis) {
    return (
      <Card>
        <CardHeader title="📈 效率分析" />
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            暂无效率分析数据
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader 
        title="📈 效率分析" 
        description={`过去 ${days} 天的效率统计与洞察`}
      />
      <CardContent className="space-y-6">
        {/* Overall Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Average Daily Pomodoros */}
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">
              {analysis.averageDailyPomodoros}
            </div>
            <div className="text-sm text-blue-600/70">日均番茄</div>
          </div>

          {/* Goal Achievement Rate */}
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {analysis.goalAchievementRate}%
            </div>
            <div className="text-sm text-green-600/70">目标达成率</div>
          </div>

          {/* Average Rest Duration */}
          <div className="p-4 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">
              {Math.round(analysis.averageRestDuration)}分钟
            </div>
            <div className="text-sm text-purple-600/70">平均休息时长</div>
          </div>

          {/* Suggested Goal */}
          <div className="p-4 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">
              {analysis.suggestedDailyGoal}
            </div>
            <div className="text-sm text-yellow-600/70">建议目标</div>
          </div>
        </div>

        {/* Time Period Breakdown (Requirements: 24.1.1, 24.1.2, 24.1.3) */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">
            ⏰ 分时段效率 (Requirements: 24.1.1-24.1.3)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {analysis.byTimePeriod.map((periodStats: TimePeriodStats) => {
              const colors = PERIOD_COLORS[periodStats.period];
              const isBest = bestPeriod?.period === periodStats.period;
              const barWidth = (periodStats.averagePomodoros / maxPomodoros) * 100;

              return (
                <div
                  key={periodStats.period}
                  className={`p-4 rounded-lg ${colors.bg} ${isBest ? 'ring-2 ring-green-400' : ''}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-lg font-medium ${colors.text}`}>
                      {PERIOD_ICONS[periodStats.period]} {PERIOD_NAMES[periodStats.period]}
                    </span>
                    {isBest && (
                      <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">
                        最佳
                      </span>
                    )}
                  </div>

                  {/* Average Pomodoros Bar */}
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>平均番茄</span>
                      <span className="font-medium">{periodStats.averagePomodoros}</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${colors.bar} transition-all duration-500`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500">完成率</span>
                      <div className={`font-medium ${colors.text}`}>
                        {periodStats.completionRate}%
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500">总时长</span>
                      <div className={`font-medium ${colors.text}`}>
                        {formatDuration(periodStats.totalMinutes)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Day of Week Stats (Requirements: 24.5) */}
        {analysis.dayOfWeekStats && analysis.dayOfWeekStats.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">
              📅 每周模式
            </h4>
            <div className="grid grid-cols-7 gap-2">
              {analysis.dayOfWeekStats.map((dayStat) => {
                const maxDayAvg = Math.max(...analysis.dayOfWeekStats.map(d => d.averagePomodoros), 1);
                const intensity = dayStat.averagePomodoros / maxDayAvg;
                const dayNames = ['日', '一', '二', '三', '四', '五', '六'];

                return (
                  <div key={dayStat.dayOfWeek} className="text-center">
                    <div className="text-xs text-gray-500 mb-1">
                      周{dayNames[dayStat.dayOfWeek]}
                    </div>
                    <div
                      className="h-12 rounded-lg flex items-center justify-center transition-colors"
                      style={{
                        backgroundColor: `rgba(34, 197, 94, ${Math.max(0.1, intensity)})`,
                      }}
                    >
                      <span className={`text-sm font-medium ${intensity > 0.5 ? 'text-white' : 'text-gray-700'}`}>
                        {dayStat.averagePomodoros}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {dayStat.totalDays}天
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Insights (Requirements: 24.1.4, 24.1.5) */}
        {analysis.insights && analysis.insights.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">
              💡 效率洞察 (Requirements: 24.1.4, 24.1.5)
            </h4>
            <div className="space-y-2">
              {analysis.insights.map((insight: EfficiencyInsight, index: number) => {
                const style = INSIGHT_STYLES[insight.type] || INSIGHT_STYLES.suggestion;
                return (
                  <div
                    key={index}
                    className={`p-3 rounded-lg ${style.bg} ${style.text}`}
                  >
                    <span className="mr-2">{style.icon}</span>
                    {insight.message}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default EfficiencyAnalysis;
