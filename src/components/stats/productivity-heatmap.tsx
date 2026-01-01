'use client';

/**
 * ProductivityHeatmap Component
 * 
 * Displays an hourly productivity heatmap showing when the user is most productive.
 * Requirements: 24.1.6
 */

import { useMemo } from 'react';
import { Card, CardHeader, CardContent } from '@/components/layout';
import { trpc } from '@/lib/trpc';
import type { HourlyHeatmapData } from '@/services/efficiency-analysis.service';

interface ProductivityHeatmapProps {
  /** Number of days to analyze */
  days?: number;
}

// Day names for display
const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

// Hour labels (show every 3 hours)
const HOUR_LABELS = [0, 3, 6, 9, 12, 15, 18, 21];

/**
 * Get color for productivity level
 */
function getProductivityColor(productivity: number): string {
  if (productivity === 0) return 'bg-gray-100';
  if (productivity <= 20) return 'bg-green-100';
  if (productivity <= 40) return 'bg-green-200';
  if (productivity <= 60) return 'bg-green-300';
  if (productivity <= 80) return 'bg-green-400';
  return 'bg-green-500';
}

/**
 * Get text color based on background intensity
 */
function getTextColor(productivity: number): string {
  if (productivity <= 40) return 'text-gray-700';
  return 'text-white';
}

export function ProductivityHeatmap({ days = 30 }: ProductivityHeatmapProps) {
  // Fetch heatmap data
  const { data: heatmapData, isLoading, error } = trpc.efficiencyAnalysis.getHourlyHeatmap.useQuery({
    days,
  });

  // Organize data by hour and day
  const heatmapGrid = useMemo(() => {
    if (!heatmapData) return null;

    // Create a 24x7 grid (hours x days)
    const grid: (HourlyHeatmapData | null)[][] = Array(24)
      .fill(null)
      .map(() => Array(7).fill(null));

    for (const data of heatmapData) {
      grid[data.hour][data.dayOfWeek] = data;
    }

    return grid;
  }, [heatmapData]);

  // Find peak productivity times
  const peakTimes = useMemo(() => {
    if (!heatmapData) return [];

    return heatmapData
      .filter(d => d.productivity > 0)
      .sort((a, b) => b.productivity - a.productivity)
      .slice(0, 3)
      .map(d => ({
        hour: d.hour,
        dayOfWeek: d.dayOfWeek,
        productivity: d.productivity,
        pomodoroCount: d.pomodoroCount,
      }));
  }, [heatmapData]);

  // Calculate total pomodoros
  const totalPomodoros = useMemo(() => {
    if (!heatmapData) return 0;
    return heatmapData.reduce((sum, d) => sum + d.pomodoroCount, 0);
  }, [heatmapData]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader title="🔥 生产力热力图" description="按小时和星期分布的工作效率" />
        <CardContent>
          <div className="animate-pulse">
            <div className="h-64 bg-gray-100 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader title="🔥 生产力热力图" />
        <CardContent>
          <div className="text-center py-8 text-red-500">
            加载失败: {error.message}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!heatmapGrid || totalPomodoros === 0) {
    return (
      <Card>
        <CardHeader title="🔥 生产力热力图" />
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            暂无足够数据生成热力图
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader 
        title="🔥 生产力热力图" 
        description={`过去 ${days} 天按小时和星期分布的工作效率 (Requirements: 24.1.6)`}
      />
      <CardContent className="space-y-6">
        {/* Peak Times Summary */}
        {peakTimes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-gray-500">高效时段:</span>
            {peakTimes.map((peak, index) => (
              <span
                key={index}
                className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full"
              >
                周{DAY_NAMES[peak.dayOfWeek]} {peak.hour}:00 ({peak.pomodoroCount}🍅)
              </span>
            ))}
          </div>
        )}

        {/* Heatmap Grid */}
        <div className="overflow-x-auto">
          <div className="min-w-[400px]">
            {/* Day Headers */}
            <div className="flex mb-1">
              <div className="w-12 flex-shrink-0" /> {/* Spacer for hour labels */}
              {DAY_NAMES.map((day, index) => (
                <div
                  key={index}
                  className="flex-1 text-center text-xs text-gray-500 font-medium"
                >
                  周{day}
                </div>
              ))}
            </div>

            {/* Hour Rows */}
            <div className="space-y-0.5">
              {heatmapGrid.map((hourRow, hour) => (
                <div key={hour} className="flex items-center">
                  {/* Hour Label */}
                  <div className="w-12 flex-shrink-0 text-right pr-2">
                    {HOUR_LABELS.includes(hour) && (
                      <span className="text-xs text-gray-400">{hour}:00</span>
                    )}
                  </div>

                  {/* Day Cells */}
                  {hourRow.map((cell, dayOfWeek) => {
                    const productivity = cell?.productivity ?? 0;
                    const pomodoroCount = cell?.pomodoroCount ?? 0;

                    return (
                      <div
                        key={dayOfWeek}
                        className={`
                          flex-1 h-5 mx-0.5 rounded-sm cursor-pointer
                          transition-all duration-200 hover:ring-2 hover:ring-blue-400
                          ${getProductivityColor(productivity)}
                        `}
                        title={`周${DAY_NAMES[dayOfWeek]} ${hour}:00 - ${pomodoroCount} 番茄`}
                      >
                        {pomodoroCount > 0 && (
                          <div className={`
                            w-full h-full flex items-center justify-center
                            text-[10px] font-medium ${getTextColor(productivity)}
                          `}>
                            {pomodoroCount > 9 ? '9+' : pomodoroCount}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
          <span>少</span>
          <div className="flex gap-0.5">
            <div className="w-4 h-4 rounded-sm bg-gray-100" />
            <div className="w-4 h-4 rounded-sm bg-green-100" />
            <div className="w-4 h-4 rounded-sm bg-green-200" />
            <div className="w-4 h-4 rounded-sm bg-green-300" />
            <div className="w-4 h-4 rounded-sm bg-green-400" />
            <div className="w-4 h-4 rounded-sm bg-green-500" />
          </div>
          <span>多</span>
        </div>

        {/* Total Stats */}
        <div className="text-center text-sm text-gray-500">
          过去 {days} 天共完成 <span className="font-medium text-green-600">{totalPomodoros}</span> 个番茄
        </div>
      </CardContent>
    </Card>
  );
}

export default ProductivityHeatmap;
