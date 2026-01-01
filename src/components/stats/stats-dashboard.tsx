'use client';

/**
 * StatsDashboard Component
 * 
 * Main statistics dashboard with time range selector and dimension filters.
 * Requirements: 3.4, 3.5, 3.10
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '@/components/layout';
import { Button } from '@/components/ui';
import { trpc } from '@/lib/trpc';
import type { PomodoroStats } from '@/services/stats.service';

// Time range filter types
export type TimeRangeType = 'today' | 'week' | 'month' | 'custom';

export interface TimeRangeFilter {
  type: TimeRangeType;
  startDate?: Date;
  endDate?: Date;
}

// Dimension filter types
export type DimensionType = 'all' | 'project' | 'task';

export interface DimensionFilter {
  type: DimensionType;
  projectId?: string;
  taskId?: string;
}

interface StatsDashboardProps {
  children?: React.ReactNode;
  onStatsChange?: (stats: PomodoroStats | null) => void;
}

// Time range presets
const TIME_RANGE_OPTIONS: { value: TimeRangeType; label: string; icon: string }[] = [
  { value: 'today', label: '今天', icon: '📅' },
  { value: 'week', label: '本周', icon: '📆' },
  { value: 'month', label: '本月', icon: '🗓️' },
  { value: 'custom', label: '自定义', icon: '⚙️' },
];

// Format minutes to hours and minutes
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours === 0) return `${mins}分钟`;
  if (mins === 0) return `${hours}小时`;
  return `${hours}小时${mins}分钟`;
}

// Format date for input
function formatDateForInput(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function StatsDashboard({ children, onStatsChange }: StatsDashboardProps) {
  // Time range state
  const [timeRange, setTimeRange] = useState<TimeRangeFilter>({
    type: 'week',
  });
  
  // Custom date range state
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return formatDateForInput(date);
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    return formatDateForInput(new Date());
  });
  
  // Dimension filter state
  const [dimensionFilter, setDimensionFilter] = useState<DimensionFilter>({
    type: 'all',
  });

  // Get projects for filter dropdown
  const { data: projects } = trpc.project.list.useQuery();

  // Build query input
  const queryInput = useMemo(() => {
    const input: {
      timeRange: TimeRangeType;
      startDate?: Date;
      endDate?: Date;
      projectId?: string;
      taskId?: string;
    } = {
      timeRange: timeRange.type,
    };

    if (timeRange.type === 'custom') {
      input.startDate = new Date(customStartDate);
      input.endDate = new Date(customEndDate);
    }

    if (dimensionFilter.projectId) {
      input.projectId = dimensionFilter.projectId;
    }

    if (dimensionFilter.taskId) {
      input.taskId = dimensionFilter.taskId;
    }

    return input;
  }, [timeRange.type, customStartDate, customEndDate, dimensionFilter]);

  // Fetch stats
  const { data: stats, isLoading, error } = trpc.pomodoro.getStats.useQuery(queryInput);

  // Notify parent when stats change
  useEffect(() => {
    onStatsChange?.(stats ?? null);
  }, [stats, onStatsChange]);

  // Handle time range change
  const handleTimeRangeChange = useCallback((type: TimeRangeType) => {
    setTimeRange({ type });
  }, []);

  // Handle custom date change
  const handleCustomDateChange = useCallback((start: string, end: string) => {
    setCustomStartDate(start);
    setCustomEndDate(end);
    setTimeRange({ type: 'custom' });
  }, []);

  // Handle project filter change
  const handleProjectFilterChange = useCallback((projectId: string | null) => {
    if (projectId) {
      setDimensionFilter({ type: 'project', projectId });
    } else {
      setDimensionFilter({ type: 'all' });
    }
  }, []);

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    setTimeRange({ type: 'week' });
    setDimensionFilter({ type: 'all' });
  }, []);

  return (
    <div className="space-y-6">
      {/* Filters Card */}
      <Card>
        <CardHeader 
          title="📊 统计筛选" 
          description="选择时间范围和维度进行数据筛选"
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
            >
              重置
            </Button>
          }
        />
        <CardContent className="space-y-4">
          {/* Time Range Selector (Requirements 3.4, 3.5) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ⏰ 时间范围
            </label>
            <div className="flex flex-wrap gap-2">
              {TIME_RANGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleTimeRangeChange(option.value)}
                  className={`
                    px-3 py-2 rounded-lg text-sm font-medium transition-colors
                    ${timeRange.type === option.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }
                  `}
                >
                  {option.icon} {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Date Range (Requirement 3.5) */}
          {timeRange.type === 'custom' && (
            <div className="flex flex-wrap items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">从</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => handleCustomDateChange(e.target.value, customEndDate)}
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">到</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => handleCustomDateChange(customStartDate, e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                />
              </div>
            </div>
          )}

          {/* Project Filter (Requirement 3.10) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              📁 项目筛选
            </label>
            <select
              value={dimensionFilter.projectId ?? ''}
              onChange={(e) => handleProjectFilterChange(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">全部项目</option>
              {projects?.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats Card */}
      <Card>
        <CardHeader title="📈 总览" />
        <CardContent>
          {isLoading ? (
            <div className="animate-pulse space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-20 bg-gray-100 rounded-lg" />
                ))}
              </div>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">
              加载统计数据失败: {error.message}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Total Time */}
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {formatDuration(stats.totalMinutes)}
                </div>
                <div className="text-sm text-blue-600/70">总专注时间</div>
              </div>

              {/* Completed Count */}
              <div className="p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {stats.completedCount}
                </div>
                <div className="text-sm text-green-600/70">完成番茄</div>
              </div>

              {/* Interrupted Count */}
              <div className="p-4 bg-yellow-50 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">
                  {stats.interruptedCount}
                </div>
                <div className="text-sm text-yellow-600/70">中断番茄</div>
              </div>

              {/* Average Duration */}
              <div className="p-4 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  {Math.round(stats.averageDuration)}分钟
                </div>
                <div className="text-sm text-purple-600/70">平均时长</div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              暂无统计数据
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pass stats to children */}
      {children}
    </div>
  );
}

// Export context for child components to access stats
export { formatDuration };
