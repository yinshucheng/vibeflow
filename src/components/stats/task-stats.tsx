'use client';

/**
 * TaskStats Component
 * 
 * Displays pomodoro statistics grouped by task with completion/interruption counts.
 * Requirements: 3.2, 3.9
 */

import { useState, useMemo } from 'react';
import { Card, CardHeader, CardContent, EmptyState } from '@/components/layout';
import type { TaskStats as TaskStatsType } from '@/services/stats.service';
import { formatDuration } from './stats-dashboard';

interface TaskStatsProps {
  stats: TaskStatsType[];
  isLoading?: boolean;
}

type SortField = 'time' | 'completed' | 'interrupted';
type SortOrder = 'asc' | 'desc';

export function TaskStats({ stats, isLoading }: TaskStatsProps) {
  const [sortField, setSortField] = useState<SortField>('time');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [filterProject, setFilterProject] = useState<string>('');

  // Get unique projects for filter
  const projects = useMemo(() => {
    const projectSet = new Map<string, string>();
    stats?.forEach(task => {
      projectSet.set(task.projectId, task.projectTitle);
    });
    return Array.from(projectSet.entries()).map(([id, title]) => ({ id, title }));
  }, [stats]);

  // Filter and sort tasks
  const filteredAndSortedStats = useMemo(() => {
    if (!stats) return [];
    
    let filtered = [...stats];
    
    // Apply project filter
    if (filterProject) {
      filtered = filtered.filter(task => task.projectId === filterProject);
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'time':
          comparison = a.totalMinutes - b.totalMinutes;
          break;
        case 'completed':
          comparison = a.completedCount - b.completedCount;
          break;
        case 'interrupted':
          comparison = a.interruptedCount - b.interruptedCount;
          break;
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });
    
    return filtered;
  }, [stats, filterProject, sortField, sortOrder]);

  // Handle sort toggle
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Calculate totals
  const totals = useMemo(() => {
    return filteredAndSortedStats.reduce(
      (acc, task) => ({
        totalMinutes: acc.totalMinutes + task.totalMinutes,
        completedCount: acc.completedCount + task.completedCount,
        interruptedCount: acc.interruptedCount + task.interruptedCount,
        abortedCount: acc.abortedCount + task.abortedCount,
      }),
      { totalMinutes: 0, completedCount: 0, interruptedCount: 0, abortedCount: 0 }
    );
  }, [filteredAndSortedStats]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader title="📋 任务统计" description="按任务分组的番茄完成情况" />
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 bg-gray-100 rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!stats || stats.length === 0) {
    return (
      <Card>
        <CardHeader title="📋 任务统计" description="按任务分组的番茄完成情况" />
        <CardContent>
          <EmptyState
            icon="📋"
            title="暂无任务数据"
            description="在选定时间范围内没有完成的番茄记录"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader 
        title="📋 任务统计" 
        description="按任务分组的番茄完成/中断统计 (Requirement 3.2, 3.9)"
      />
      <CardContent className="space-y-4">
        {/* Filters and Sort Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Project Filter */}
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="">全部项目</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>

          {/* Sort Buttons */}
          <div className="flex items-center gap-1 text-sm">
            <span className="text-gray-500">排序:</span>
            {[
              { field: 'time' as SortField, label: '时间' },
              { field: 'completed' as SortField, label: '完成' },
              { field: 'interrupted' as SortField, label: '中断' },
            ].map(({ field, label }) => (
              <button
                key={field}
                onClick={() => handleSort(field)}
                className={`
                  px-2 py-1 rounded transition-colors
                  ${sortField === field
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                  }
                `}
              >
                {label}
                {sortField === field && (
                  <span className="ml-1">{sortOrder === 'desc' ? '↓' : '↑'}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-3 p-3 bg-gray-50 rounded-lg">
          <div className="text-center">
            <div className="text-lg font-bold text-gray-900">
              {filteredAndSortedStats.length}
            </div>
            <div className="text-xs text-gray-500">任务数</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-green-600">
              {totals.completedCount}
            </div>
            <div className="text-xs text-gray-500">完成</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-yellow-600">
              {totals.interruptedCount}
            </div>
            <div className="text-xs text-gray-500">中断</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-red-600">
              {totals.abortedCount}
            </div>
            <div className="text-xs text-gray-500">放弃</div>
          </div>
        </div>

        {/* Task List */}
        <div className="space-y-2">
          {filteredAndSortedStats.map((task) => {
            const totalPomodoros = task.completedCount + task.interruptedCount + task.abortedCount;
            const completionRate = totalPomodoros > 0 
              ? (task.completedCount / totalPomodoros) * 100 
              : 0;

            return (
              <div
                key={task.taskId}
                className="p-3 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
              >
                {/* Task Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 truncate">
                      {task.taskTitle}
                    </h4>
                    <p className="text-xs text-gray-500 truncate">
                      📁 {task.projectTitle}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-medium text-gray-900">
                      {formatDuration(task.totalMinutes)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {totalPomodoros} 个番茄
                    </div>
                  </div>
                </div>

                {/* Status Breakdown */}
                <div className="flex items-center gap-4 text-xs">
                  {/* Completion Rate Bar */}
                  <div className="flex-1">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full flex">
                        <div
                          className="bg-green-500 transition-all duration-300"
                          style={{ width: `${(task.completedCount / totalPomodoros) * 100}%` }}
                        />
                        <div
                          className="bg-yellow-500 transition-all duration-300"
                          style={{ width: `${(task.interruptedCount / totalPomodoros) * 100}%` }}
                        />
                        <div
                          className="bg-red-500 transition-all duration-300"
                          style={{ width: `${(task.abortedCount / totalPomodoros) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Status Counts */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="flex items-center gap-1 text-green-600">
                      ✓ {task.completedCount}
                    </span>
                    <span className="flex items-center gap-1 text-yellow-600">
                      ⏸ {task.interruptedCount}
                    </span>
                    <span className="flex items-center gap-1 text-red-600">
                      ✕ {task.abortedCount}
                    </span>
                  </div>

                  {/* Completion Rate */}
                  <span className={`
                    px-2 py-0.5 rounded text-xs font-medium
                    ${completionRate >= 80 ? 'bg-green-100 text-green-700' :
                      completionRate >= 50 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'}
                  `}>
                    {completionRate.toFixed(0)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty State for Filtered Results */}
        {filteredAndSortedStats.length === 0 && stats.length > 0 && (
          <div className="text-center py-6 text-gray-500">
            没有符合筛选条件的任务
          </div>
        )}
      </CardContent>
    </Card>
  );
}
