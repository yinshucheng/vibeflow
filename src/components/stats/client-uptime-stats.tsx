'use client';

/**
 * Client Uptime Stats Component
 * 
 * Displays client connection uptime statistics and offline history.
 * Requirements: 3.6
 */

import { useMemo } from 'react';
import { Card, CardHeader, CardContent } from '@/components/layout';
import { trpc } from '@/lib/trpc';

interface ClientUptimeStatsProps {
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
 * Get color class based on uptime percentage
 */
function getUptimeColor(percentage: number): string {
  if (percentage >= 95) return 'text-green-600';
  if (percentage >= 80) return 'text-yellow-600';
  if (percentage >= 60) return 'text-orange-600';
  return 'text-red-600';
}

/**
 * Get background color class based on uptime percentage
 */
function getUptimeBgColor(percentage: number): string {
  if (percentage >= 95) return 'bg-green-50';
  if (percentage >= 80) return 'bg-yellow-50';
  if (percentage >= 60) return 'bg-orange-50';
  return 'bg-red-50';
}

export function ClientUptimeStats({ days = 30 }: ClientUptimeStatsProps) {
  // Fetch uptime stats
  const { data: uptimeStats, isLoading: isLoadingUptime, error: uptimeError } = 
    trpc.heartbeat.getUptimeStats.useQuery({ days });

  // Fetch offline history
  const { data: offlineHistory, isLoading: isLoadingHistory } = 
    trpc.heartbeat.getOfflineHistory.useQuery({ days });

  // Fetch connected clients
  const { data: clients } = trpc.heartbeat.getClientsByUser.useQuery();

  // Calculate additional stats from offline history
  const offlineStats = useMemo(() => {
    if (!offlineHistory || offlineHistory.length === 0) {
      return {
        workHoursOfflineCount: 0,
        pomodoroInterruptCount: 0,
        averageOfflineDuration: 0,
        longestOffline: null as { startedAt: Date; durationSeconds: number } | null,
      };
    }

    const workHoursOfflineCount = offlineHistory.filter(e => e.wasInWorkHours).length;
    const pomodoroInterruptCount = offlineHistory.filter(e => e.wasInPomodoro).length;
    
    const completedEvents = offlineHistory.filter(e => e.durationSeconds !== null);
    const totalDuration = completedEvents.reduce((sum, e) => sum + (e.durationSeconds ?? 0), 0);
    const averageOfflineDuration = completedEvents.length > 0 
      ? Math.round(totalDuration / completedEvents.length) 
      : 0;

    const longestEvent = completedEvents.reduce((max, e) => 
      (e.durationSeconds ?? 0) > (max?.durationSeconds ?? 0) ? e : max,
      null as typeof completedEvents[0] | null
    );

    return {
      workHoursOfflineCount,
      pomodoroInterruptCount,
      averageOfflineDuration,
      longestOffline: longestEvent ? {
        startedAt: longestEvent.startedAt,
        durationSeconds: longestEvent.durationSeconds ?? 0,
      } : null,
    };
  }, [offlineHistory]);

  const isLoading = isLoadingUptime || isLoadingHistory;

  if (isLoading) {
    return (
      <Card>
        <CardHeader title="📡 客户端在线统计" />
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

  if (uptimeError) {
    return (
      <Card>
        <CardHeader title="📡 客户端在线统计" />
        <CardContent>
          <div className="text-center py-8 text-red-500">
            加载失败: {uptimeError.message}
          </div>
        </CardContent>
      </Card>
    );
  }

  const uptimePercentage = uptimeStats?.uptimePercentage ?? 100;

  return (
    <Card>
      <CardHeader 
        title="📡 客户端在线统计" 
        description={`过去 ${days} 天的桌面客户端连接情况`}
      />
      <CardContent className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Uptime Percentage */}
          <div className={`p-4 rounded-lg ${getUptimeBgColor(uptimePercentage)}`}>
            <div className={`text-2xl font-bold ${getUptimeColor(uptimePercentage)}`}>
              {uptimePercentage}%
            </div>
            <div className={`text-sm ${getUptimeColor(uptimePercentage)} opacity-70`}>
              在线率
            </div>
          </div>

          {/* Total Online Time */}
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {formatDuration(uptimeStats?.totalOnlineSeconds ?? 0)}
            </div>
            <div className="text-sm text-green-600/70">总在线时长</div>
          </div>

          {/* Offline Event Count */}
          <div className="p-4 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">
              {uptimeStats?.offlineEventCount ?? 0}
            </div>
            <div className="text-sm text-yellow-600/70">离线次数</div>
          </div>

          {/* Work Hours Offline */}
          <div className="p-4 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-600">
              {offlineStats.workHoursOfflineCount}
            </div>
            <div className="text-sm text-red-600/70">工作时间离线</div>
          </div>
        </div>

        {/* Connected Clients */}
        {clients && clients.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">已连接设备</h4>
            <div className="space-y-2">
              {clients.map((client) => (
                <div 
                  key={client.clientId}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    client.isOnline ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${
                      client.isOnline ? 'bg-green-500' : 'bg-gray-400'
                    }`} />
                    <div>
                      <div className="text-sm font-medium text-gray-800">
                        {client.deviceName ?? '未命名设备'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {client.mode} · v{client.appVersion}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    最后心跳: {formatDate(new Date(client.lastHeartbeat))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Offline History */}
        {offlineHistory && offlineHistory.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">
              离线记录 (最近 {Math.min(offlineHistory.length, 10)} 条)
            </h4>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {offlineHistory.slice(0, 10).map((event) => (
                <div 
                  key={event.id}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    event.wasInWorkHours 
                      ? event.wasInPomodoro 
                        ? 'bg-red-50 border border-red-200' 
                        : 'bg-yellow-50 border border-yellow-200'
                      : 'bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">
                      {event.wasInPomodoro ? '🍅' : event.wasInWorkHours ? '⚠️' : '💤'}
                    </span>
                    <div>
                      <div className="text-sm text-gray-800">
                        {formatDate(new Date(event.startedAt))}
                      </div>
                      <div className="text-xs text-gray-500">
                        {event.wasInPomodoro && '番茄期间 · '}
                        {event.wasInWorkHours && '工作时间 · '}
                        {event.gracePeriodUsed && '使用宽限期 · '}
                        {event.isBypassAttempt && '绕过尝试'}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm font-medium text-gray-600">
                    {event.durationSeconds !== null 
                      ? formatDuration(event.durationSeconds)
                      : '进行中'
                    }
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {(!offlineHistory || offlineHistory.length === 0) && (
          <div className="text-center py-4 text-gray-500">
            <span className="text-2xl">🎉</span>
            <p className="mt-2">太棒了！过去 {days} 天没有离线记录</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ClientUptimeStats;
