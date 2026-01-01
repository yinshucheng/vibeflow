'use client';

/**
 * TrendChart Component
 * 
 * Displays weekly/monthly trend chart comparing expected vs actual performance.
 * Requirements: 10.8
 */

import { useMemo } from 'react';
import { Card, CardHeader, CardContent } from '@/components/layout';
import type { DailyReviewData, WeeklyTrendData } from '@/services/review.service';

interface TrendChartProps {
  data: WeeklyTrendData;
  metric?: 'workTime' | 'pomodoroCount';
  showExpected?: boolean;
  showActual?: boolean;
}

// Format minutes to hours display
function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return `${hours.toFixed(1)}h`;
}

// Get day label from date string
function getDayLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  return days[date.getDay()];
}

// Simple bar chart component
function BarChart({
  days,
  metric,
  showExpected,
  showActual,
}: {
  days: DailyReviewData[];
  metric: 'workTime' | 'pomodoroCount';
  showExpected: boolean;
  showActual: boolean;
}) {
  // Calculate max value for scaling
  const maxValue = useMemo(() => {
    let max = 0;
    for (const day of days) {
      if (metric === 'workTime') {
        if (showExpected) max = Math.max(max, day.expectedWorkMinutes);
        if (showActual) max = Math.max(max, day.actualWorkMinutes);
      } else {
        if (showExpected) max = Math.max(max, day.expectedPomodoroCount);
        if (showActual) max = Math.max(max, day.completedPomodoros);
      }
    }
    return max || 1;
  }, [days, metric, showExpected, showActual]);

  return (
    <div className="flex items-end justify-between gap-2 h-40">
      {days.map((day) => {
        const expectedValue = metric === 'workTime' 
          ? day.expectedWorkMinutes 
          : day.expectedPomodoroCount;
        const actualValue = metric === 'workTime' 
          ? day.actualWorkMinutes 
          : day.completedPomodoros;
        
        const expectedHeight = (expectedValue / maxValue) * 100;
        const actualHeight = (actualValue / maxValue) * 100;
        const isToday = day.date === new Date().toISOString().split('T')[0];
        
        return (
          <div 
            key={day.date} 
            className="flex-1 flex flex-col items-center gap-1"
          >
            {/* Bars */}
            <div className="relative w-full h-32 flex items-end justify-center gap-1">
              {showExpected && (
                <div
                  className="w-3 bg-gray-300 rounded-t transition-all duration-300"
                  style={{ height: `${expectedHeight}%` }}
                  title={`预期: ${metric === 'workTime' ? formatHours(expectedValue) : expectedValue}`}
                />
              )}
              {showActual && (
                <div
                  className={`w-3 rounded-t transition-all duration-300 ${
                    actualValue >= expectedValue ? 'bg-green-500' : 'bg-blue-500'
                  }`}
                  style={{ height: `${actualHeight}%` }}
                  title={`实际: ${metric === 'workTime' ? formatHours(actualValue) : actualValue}`}
                />
              )}
            </div>
            
            {/* Day label */}
            <span className={`text-xs ${isToday ? 'font-bold text-blue-600' : 'text-gray-500'}`}>
              {getDayLabel(day.date)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function TrendChart({
  data,
  metric = 'workTime',
  showExpected = true,
  showActual = true,
}: TrendChartProps) {
  // Calculate achievement rate change from previous week (mock for now)
  const achievementRate = metric === 'workTime'
    ? data.averageWorkAchievementRate
    : data.averagePomodoroAchievementRate;
  
  const totalExpected = metric === 'workTime'
    ? data.totalExpectedMinutes
    : data.totalExpectedPomodoros;
  
  const totalActual = metric === 'workTime'
    ? data.totalActualMinutes
    : data.totalActualPomodoros;

  return (
    <Card>
      <CardHeader 
        title={`📈 ${metric === 'workTime' ? '工作时间' : '番茄数量'}趋势`}
        description={`周起始: ${data.weekStart}`}
      />
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
          <div className="text-center">
            <div className="text-lg font-bold text-gray-600">
              {metric === 'workTime' ? formatHours(totalExpected) : totalExpected}
            </div>
            <div className="text-xs text-gray-500">预期总计</div>
          </div>
          <div className="text-center">
            <div className={`text-lg font-bold ${totalActual >= totalExpected ? 'text-green-600' : 'text-blue-600'}`}>
              {metric === 'workTime' ? formatHours(totalActual) : totalActual}
            </div>
            <div className="text-xs text-gray-500">实际总计</div>
          </div>
          <div className="text-center">
            <div className={`text-lg font-bold ${achievementRate >= 100 ? 'text-green-600' : achievementRate >= 80 ? 'text-blue-600' : 'text-yellow-600'}`}>
              {Math.round(achievementRate)}%
            </div>
            <div className="text-xs text-gray-500">平均达成率</div>
          </div>
        </div>

        {/* Bar Chart */}
        <div className="pt-4">
          <BarChart
            days={data.days}
            metric={metric}
            showExpected={showExpected}
            showActual={showActual}
          />
        </div>

        {/* Legend */}
        <div className="flex justify-center gap-6 pt-2">
          {showExpected && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-gray-300 rounded" />
              <span className="text-xs text-gray-500">预期</span>
            </div>
          )}
          {showActual && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded" />
              <span className="text-xs text-gray-500">实际</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded" />
            <span className="text-xs text-gray-500">达成</span>
          </div>
        </div>

        {/* Daily Details */}
        <div className="pt-4 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-3">每日详情</h4>
          <div className="space-y-2">
            {data.days.map((day) => {
              const expectedValue = metric === 'workTime' 
                ? day.expectedWorkMinutes 
                : day.expectedPomodoroCount;
              const actualValue = metric === 'workTime' 
                ? day.actualWorkMinutes 
                : day.completedPomodoros;
              const rate = metric === 'workTime'
                ? day.workTimeAchievementRate
                : day.pomodoroAchievementRate;
              const isToday = day.date === new Date().toISOString().split('T')[0];
              
              return (
                <div 
                  key={day.date}
                  className={`flex items-center justify-between p-2 rounded ${
                    isToday ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-sm ${isToday ? 'font-bold text-blue-600' : 'text-gray-600'}`}>
                      {day.date.slice(5)} ({getDayLabel(day.date)})
                    </span>
                    {isToday && (
                      <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">
                        今天
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-gray-500">
                      {metric === 'workTime' ? formatHours(actualValue) : actualValue}
                      <span className="text-gray-400"> / </span>
                      {metric === 'workTime' ? formatHours(expectedValue) : expectedValue}
                    </span>
                    <span className={`font-medium ${
                      rate >= 100 ? 'text-green-600' : 
                      rate >= 80 ? 'text-blue-600' : 
                      rate >= 50 ? 'text-yellow-600' : 'text-gray-500'
                    }`}>
                      {Math.round(rate)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
