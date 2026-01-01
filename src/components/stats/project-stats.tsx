'use client';

/**
 * ProjectStats Component
 * 
 * Displays pomodoro statistics grouped by project with time distribution and percentages.
 * Requirements: 3.1, 3.8
 */

import { Card, CardHeader, CardContent, EmptyState } from '@/components/layout';
import type { ProjectStats as ProjectStatsType } from '@/services/stats.service';
import { formatDuration } from './stats-dashboard';

interface ProjectStatsProps {
  stats: ProjectStatsType[];
  isLoading?: boolean;
}

// Color palette for project bars
const PROJECT_COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-yellow-500',
  'bg-red-500',
  'bg-indigo-500',
  'bg-teal-500',
];

export function ProjectStats({ stats, isLoading }: ProjectStatsProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader title="📁 项目统计" description="按项目分组的番茄时间分布" />
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 bg-gray-100 rounded w-1/3" />
                <div className="h-6 bg-gray-100 rounded" />
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
        <CardHeader title="📁 项目统计" description="按项目分组的番茄时间分布" />
        <CardContent>
          <EmptyState
            icon="📊"
            title="暂无项目数据"
            description="在选定时间范围内没有完成的番茄记录"
          />
        </CardContent>
      </Card>
    );
  }

  // Calculate max minutes for scaling bars
  const maxMinutes = Math.max(...stats.map(s => s.totalMinutes));

  return (
    <Card>
      <CardHeader 
        title="📁 项目统计" 
        description="按项目分组的番茄时间分布 (Requirement 3.1, 3.8)"
      />
      <CardContent className="space-y-4">
        {/* Project Distribution Chart */}
        <div className="space-y-3">
          {stats.map((project, index) => (
            <div key={project.projectId} className="space-y-1">
              {/* Project Header */}
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div 
                    className={`w-3 h-3 rounded-full ${PROJECT_COLORS[index % PROJECT_COLORS.length]}`} 
                  />
                  <span className="font-medium text-gray-900 truncate max-w-[200px]">
                    {project.projectTitle}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-gray-600">
                  <span>{formatDuration(project.totalMinutes)}</span>
                  <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                    {project.percentage.toFixed(1)}%
                  </span>
                </div>
              </div>
              
              {/* Progress Bar */}
              <div className="h-6 bg-gray-100 rounded-lg overflow-hidden">
                <div
                  className={`h-full ${PROJECT_COLORS[index % PROJECT_COLORS.length]} transition-all duration-500`}
                  style={{ width: `${(project.totalMinutes / maxMinutes) * 100}%` }}
                />
              </div>
              
              {/* Pomodoro Count */}
              <div className="text-xs text-gray-500">
                🍅 {project.pomodoroCount} 个番茄
              </div>
            </div>
          ))}
        </div>

        {/* Pie Chart Visualization */}
        <div className="pt-4 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-3">时间分布饼图</h4>
          <div className="flex items-center justify-center">
            <div className="relative w-40 h-40">
              <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                {(() => {
                  let cumulativePercentage = 0;
                  return stats.map((project, index) => {
                    const percentage = project.percentage;
                    const startAngle = cumulativePercentage * 3.6; // Convert to degrees
                    cumulativePercentage += percentage;
                    
                    // Calculate SVG arc
                    const radius = 40;
                    const circumference = 2 * Math.PI * radius;
                    const strokeDasharray = `${(percentage / 100) * circumference} ${circumference}`;
                    const strokeDashoffset = -((startAngle / 360) * circumference);
                    
                    return (
                      <circle
                        key={project.projectId}
                        cx="50"
                        cy="50"
                        r={radius}
                        fill="none"
                        stroke={`hsl(${(index * 137.5) % 360}, 70%, 50%)`}
                        strokeWidth="20"
                        strokeDasharray={strokeDasharray}
                        strokeDashoffset={strokeDashoffset}
                        className="transition-all duration-500"
                      />
                    );
                  });
                })()}
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-900">
                    {stats.length}
                  </div>
                  <div className="text-xs text-gray-500">项目</div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Legend */}
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            {stats.slice(0, 5).map((project, index) => (
              <div key={project.projectId} className="flex items-center gap-1 text-xs">
                <div 
                  className={`w-2 h-2 rounded-full ${PROJECT_COLORS[index % PROJECT_COLORS.length]}`}
                />
                <span className="text-gray-600 truncate max-w-[80px]">
                  {project.projectTitle}
                </span>
              </div>
            ))}
            {stats.length > 5 && (
              <span className="text-xs text-gray-400">+{stats.length - 5} 更多</span>
            )}
          </div>
        </div>

        {/* Summary Table */}
        <div className="pt-4 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-3">详细数据</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="pb-2 font-medium">项目</th>
                  <th className="pb-2 font-medium text-right">时间</th>
                  <th className="pb-2 font-medium text-right">番茄数</th>
                  <th className="pb-2 font-medium text-right">占比</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((project) => (
                  <tr key={project.projectId} className="border-b border-gray-100">
                    <td className="py-2 text-gray-900">{project.projectTitle}</td>
                    <td className="py-2 text-right text-gray-600">
                      {formatDuration(project.totalMinutes)}
                    </td>
                    <td className="py-2 text-right text-gray-600">
                      {project.pomodoroCount}
                    </td>
                    <td className="py-2 text-right">
                      <span className="inline-block bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">
                        {project.percentage.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
