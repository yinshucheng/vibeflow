'use client';

/**
 * Bypass Attempt Stats Component
 * 
 * Displays bypass attempt history and statistics.
 * Requirements: 4.5
 */

import { useMemo } from 'react';
import { Card, CardHeader, CardContent } from '@/components/layout';
import { trpc } from '@/lib/trpc';

interface BypassAttemptStatsProps {
  /** Number of days to show history for */
  days?: number;
}

/**
 * Format duration in seconds to human readable
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}秒`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours}小时`;
  }
  return `${hours}小时${remainingMinutes}分钟`;
}

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get warning level color
 */
function getWarningLevelColor(level: string): { bg: string; text: string; border: string } {
  switch (level) {
    case 'high':
      return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' };
    case 'medium':
      return { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' };
    case 'low':
      return { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' };
    default:
      return { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' };
  }
}

/**
 * Get event type label
 */
function getEventTypeLabel(type: string): { label: string; icon: string } {
  switch (type) {
    case 'force_quit':
      return { label: '强制退出', icon: '🚪' };
    case 'offline_timeout':
      return { label: '离线超时', icon: '📡' };
    case 'guardian_killed':
      return { label: '守护进程终止', icon: '🛡️' };
    default:
      return { label: type, icon: '❓' };
  }
}

/**
 * Get warning level label
 */
function getWarningLevelLabel(level: string): string {
  switch (level) {
    case 'high':
      return '高风险';
    case 'medium':
      return '中风险';
    case 'low':
      return '低风险';
    default:
      return '无风险';
  }
}

export function BypassAttemptStats({ days = 30 }: BypassAttemptStatsProps) {
  // Fetch bypass score
  const { data: bypassScore, isLoading: isLoadingScore } = 
    trpc.bypassDetection.getBypassScore.useQuery({ days: 7 });

  // Fetch bypass stats
  const { data: bypassStats, isLoading: isLoadingStats, error } = 
    trpc.bypassDetection.getBypassStats.useQuery({ days });

  // Fetch bypass history
  const { data: bypassHistory, isLoading: isLoadingHistory } = 
    trpc.bypassDetection.getBypassHistory.useQuery({ days });

  // Fetch warning status
  const { data: warningStatus } = trpc.bypassDetection.shouldShowWarning.useQuery();

  const isLoading = isLoadingScore || isLoadingStats || isLoadingHistory;

  // Calculate score color
  const scoreColor = useMemo(() => {
    const score = bypassScore?.score ?? 0;
    if (score >= 75) return { bg: 'bg-red-50', text: 'text-red-600' };
    if (score >= 50) return { bg: 'bg-orange-50', text: 'text-orange-600' };
    if (score >= 20) return { bg: 'bg-yellow-50', text: 'text-yellow-600' };
    return { bg: 'bg-green-50', text: 'text-green-600' };
  }, [bypassScore?.score]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader title="🛡️ 绕过检测统计" />
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
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
        <CardHeader title="🛡️ 绕过检测统计" />
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
        title="🛡️ 绕过检测统计" 
        description={`过去 ${days} 天的绕过尝试记录`}
      />
      <CardContent className="space-y-6">
        {/* Warning Banner */}
        {warningStatus?.shouldShow && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-xl">⚠️</span>
              <div>
                <div className="font-medium text-red-700">绕过行为警告</div>
                <div className="text-sm text-red-600">
                  您的绕过分数 ({warningStatus.score}) 已超过阈值 ({warningStatus.threshold})。
                  请保持专注，避免频繁关闭客户端。
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Bypass Score */}
          <div className={`p-4 rounded-lg ${scoreColor.bg}`}>
            <div className={`text-2xl font-bold ${scoreColor.text}`}>
              {bypassScore?.score ?? 0}
            </div>
            <div className={`text-sm ${scoreColor.text} opacity-70`}>
              绕过分数
            </div>
          </div>

          {/* Total Attempts */}
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">
              {bypassStats?.totalAttempts ?? 0}
            </div>
            <div className="text-sm text-blue-600/70">总尝试次数</div>
          </div>

          {/* Work Hours Attempts */}
          <div className="p-4 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">
              {bypassStats?.workHoursAttempts ?? 0}
            </div>
            <div className="text-sm text-yellow-600/70">工作时间尝试</div>
          </div>

          {/* Pomodoro Interrupts */}
          <div className="p-4 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-600">
              {bypassStats?.pomodoroInterrupts ?? 0}
            </div>
            <div className="text-sm text-red-600/70">番茄中断</div>
          </div>
        </div>

        {/* Score Factors */}
        {bypassScore?.factors && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">分数构成</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-lg font-bold text-gray-700">
                  {Math.round(bypassScore.factors.frequencyScore)}
                </div>
                <div className="text-xs text-gray-500">频率分数 (40%)</div>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-lg font-bold text-gray-700">
                  {Math.round(bypassScore.factors.durationScore)}
                </div>
                <div className="text-xs text-gray-500">时长分数 (30%)</div>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-lg font-bold text-gray-700">
                  {Math.round(bypassScore.factors.pomodoroInterruptScore)}
                </div>
                <div className="text-xs text-gray-500">番茄中断分数 (30%)</div>
              </div>
            </div>
          </div>
        )}

        {/* Event Type Breakdown */}
        {bypassStats?.byEventType && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">按事件类型</h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(bypassStats.byEventType).map(([type, count]) => {
                const { label, icon } = getEventTypeLabel(type);
                return (
                  <div 
                    key={type}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg"
                  >
                    <span>{icon}</span>
                    <span className="text-sm text-gray-700">{label}</span>
                    <span className="text-sm font-bold text-gray-900">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bypass History */}
        {bypassHistory && bypassHistory.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">
              绕过记录 (最近 {Math.min(bypassHistory.length, 10)} 条)
            </h4>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {bypassHistory.slice(0, 10).map((event) => {
                const { label, icon } = getEventTypeLabel(event.eventType);
                const colors = getWarningLevelColor(event.warningLevel);
                
                return (
                  <div 
                    key={event.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${colors.bg} ${colors.border}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{icon}</span>
                      <div>
                        <div className="text-sm text-gray-800">
                          {label}
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatDate(new Date(event.timestamp))}
                          {event.wasInPomodoro && ' · 番茄期间'}
                          {event.wasInWorkHours && ' · 工作时间'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {event.durationSeconds !== null && (
                        <span className="text-sm text-gray-600">
                          {formatDuration(event.durationSeconds)}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 text-xs rounded-full ${colors.bg} ${colors.text}`}>
                        {getWarningLevelLabel(event.warningLevel)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {(!bypassHistory || bypassHistory.length === 0) && (
          <div className="text-center py-4 text-gray-500">
            <span className="text-2xl">🎉</span>
            <p className="mt-2">太棒了！过去 {days} 天没有绕过尝试记录</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default BypassAttemptStats;
