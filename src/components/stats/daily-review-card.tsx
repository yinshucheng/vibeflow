'use client';

/**
 * DailyReviewCard Component
 * 
 * Displays daily review data with expected vs actual comparison.
 * Requirements: 10.3, 10.4, 10.5, 10.6
 */

import { Card, CardHeader, CardContent } from '@/components/layout';
import type { DailyReviewData } from '@/services/review.service';

interface DailyReviewCardProps {
  data: DailyReviewData;
  showDetails?: boolean;
}

// Format minutes to hours and minutes display
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours === 0) return `${mins}分钟`;
  if (mins === 0) return `${hours}小时`;
  return `${hours}小时${mins}分钟`;
}

// Get achievement status color and icon
function getAchievementStatus(rate: number): {
  color: string;
  bgColor: string;
  icon: string;
  label: string;
} {
  if (rate >= 100) {
    return {
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      icon: '🎉',
      label: '已达成',
    };
  }
  if (rate >= 80) {
    return {
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      icon: '💪',
      label: '接近目标',
    };
  }
  if (rate >= 50) {
    return {
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
      icon: '⚡',
      label: '继续加油',
    };
  }
  return {
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
    icon: '🌱',
    label: '刚刚开始',
  };
}

// Progress bar component
function ProgressBar({ 
  value, 
  max, 
  color = 'bg-blue-500' 
}: { 
  value: number; 
  max: number; 
  color?: string;
}) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const exceeds = value > max && max > 0;
  
  return (
    <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
      <div
        className={`h-full transition-all duration-500 ${exceeds ? 'bg-green-500' : color}`}
        style={{ width: `${percentage}%` }}
      />
      {exceeds && (
        <div className="absolute inset-0 flex items-center justify-end pr-1">
          <span className="text-[10px] text-white font-bold">+{Math.round(((value - max) / max) * 100)}%</span>
        </div>
      )}
    </div>
  );
}

export function DailyReviewCard({ data, showDetails = true }: DailyReviewCardProps) {
  const workStatus = getAchievementStatus(data.workTimeAchievementRate);
  const pomodoroStatus = getAchievementStatus(data.pomodoroAchievementRate);
  
  // Calculate remaining (Requirements 10.6)
  const remainingMinutes = Math.max(0, data.expectedWorkMinutes - data.actualWorkMinutes);
  const remainingPomodoros = Math.max(0, data.expectedPomodoroCount - data.completedPomodoros);
  
  return (
    <Card>
      <CardHeader 
        title={`📊 每日复盘 - ${data.date}`}
        description="预期 vs 实际对比"
      />
      <CardContent className="space-y-6">
        {/* Work Time Comparison (Requirements 10.3) */}
        <div className={`p-4 rounded-lg ${workStatus.bgColor}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">{workStatus.icon}</span>
              <span className="font-medium text-gray-700">工作时间</span>
            </div>
            <span className={`text-sm font-medium ${workStatus.color}`}>
              {workStatus.label} ({Math.round(data.workTimeAchievementRate)}%)
            </span>
          </div>
          
          <ProgressBar 
            value={data.actualWorkMinutes} 
            max={data.expectedWorkMinutes}
            color="bg-blue-500"
          />
          
          <div className="flex justify-between mt-2 text-sm">
            <span className="text-gray-600">
              实际: <span className="font-medium text-gray-900">{formatDuration(data.actualWorkMinutes)}</span>
            </span>
            <span className="text-gray-600">
              预期: <span className="font-medium text-gray-900">{formatDuration(data.expectedWorkMinutes)}</span>
            </span>
          </div>
          
          {/* Remaining time (Requirements 10.6) */}
          {remainingMinutes > 0 && (
            <p className="mt-2 text-sm text-gray-500">
              还需 <span className="font-medium text-orange-600">{formatDuration(remainingMinutes)}</span> 达成目标
            </p>
          )}
        </div>

        {/* Pomodoro Count Comparison (Requirements 10.4) */}
        <div className={`p-4 rounded-lg ${pomodoroStatus.bgColor}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">{pomodoroStatus.icon}</span>
              <span className="font-medium text-gray-700">番茄数量</span>
            </div>
            <span className={`text-sm font-medium ${pomodoroStatus.color}`}>
              {pomodoroStatus.label} ({Math.round(data.pomodoroAchievementRate)}%)
            </span>
          </div>
          
          <ProgressBar 
            value={data.completedPomodoros} 
            max={data.expectedPomodoroCount}
            color="bg-red-400"
          />
          
          <div className="flex justify-between mt-2 text-sm">
            <span className="text-gray-600">
              完成: <span className="font-medium text-gray-900">{data.completedPomodoros} 个</span>
            </span>
            <span className="text-gray-600">
              预期: <span className="font-medium text-gray-900">{data.expectedPomodoroCount} 个</span>
            </span>
          </div>
          
          {/* Remaining pomodoros (Requirements 10.6) */}
          {remainingPomodoros > 0 && (
            <p className="mt-2 text-sm text-gray-500">
              还需 <span className="font-medium text-orange-600">{remainingPomodoros} 个番茄</span> 达成目标
            </p>
          )}
        </div>

        {/* Detailed Stats */}
        {showDetails && (
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200">
            {/* Completed */}
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {data.completedPomodoros}
              </div>
              <div className="text-xs text-gray-500">完成</div>
            </div>
            
            {/* Interrupted */}
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {data.interruptedPomodoros}
              </div>
              <div className="text-xs text-gray-500">中断</div>
            </div>
            
            {/* Aborted */}
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {data.abortedPomodoros}
              </div>
              <div className="text-xs text-gray-500">放弃</div>
            </div>
          </div>
        )}

        {/* Website Usage Stats */}
        {showDetails && (data.productiveMinutes > 0 || data.distractingMinutes > 0 || data.neutralMinutes > 0) && (
          <div className="pt-4 border-t border-gray-200">
            <h4 className="text-sm font-medium text-gray-700 mb-3">🌐 网站使用</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-2 bg-green-50 rounded">
                <div className="text-lg font-bold text-green-600">
                  {formatDuration(data.productiveMinutes)}
                </div>
                <div className="text-xs text-green-600/70">生产性</div>
              </div>
              <div className="text-center p-2 bg-gray-50 rounded">
                <div className="text-lg font-bold text-gray-600">
                  {formatDuration(data.neutralMinutes)}
                </div>
                <div className="text-xs text-gray-600/70">中性</div>
              </div>
              <div className="text-center p-2 bg-red-50 rounded">
                <div className="text-lg font-bold text-red-600">
                  {formatDuration(data.distractingMinutes)}
                </div>
                <div className="text-xs text-red-600/70">分心</div>
              </div>
            </div>
          </div>
        )}

        {/* Achievement Feedback (Requirements 10.5) */}
        {data.workTimeAchievementRate >= 100 && data.pomodoroAchievementRate >= 100 && (
          <div className="p-4 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-200">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🏆</span>
              <div>
                <p className="font-medium text-green-700">太棒了！今日目标全部达成！</p>
                <p className="text-sm text-green-600/70">继续保持这个节奏</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
