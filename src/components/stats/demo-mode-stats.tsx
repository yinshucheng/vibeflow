'use client';

/**
 * Demo Mode Stats Component
 * 
 * Displays demo mode usage history and statistics.
 * Requirements: 6.8
 */

import { useMemo } from 'react';
import { Card, CardHeader, CardContent } from '@/components/layout';
import { trpc } from '@/lib/trpc';

interface DemoModeStatsProps {
  /** Number of months to show history for */
  months?: number;
}

/**
 * Format duration in minutes to human readable
 */
function formatDuration(minutes: number): string {
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
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format date for month display
 */
function formatMonth(date: Date): string {
  return new Date(date).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
  });
}

/**
 * Get token status color
 */
function getTokenStatusColor(token: { usedAt: Date | null; endedAt: Date | null }): {
  bg: string;
  text: string;
  label: string;
} {
  if (!token.usedAt) {
    return { bg: 'bg-green-50', text: 'text-green-700', label: '可用' };
  }
  if (!token.endedAt) {
    return { bg: 'bg-blue-50', text: 'text-blue-700', label: '使用中' };
  }
  return { bg: 'bg-gray-50', text: 'text-gray-700', label: '已使用' };
}

export function DemoModeStats({ months = 3 }: DemoModeStatsProps) {
  // Fetch demo mode state
  const { data: demoState, isLoading: isLoadingState } = 
    trpc.demoMode.getDemoModeState.useQuery();

  // Fetch demo mode history
  const { data: demoHistory, isLoading: isLoadingHistory, error } = 
    trpc.demoMode.getDemoModeHistory.useQuery({ months });

  // Fetch demo mode config
  const { data: demoConfig } = trpc.demoMode.getConfig.useQuery();

  const isLoading = isLoadingState || isLoadingHistory;

  // Group tokens by month
  const tokensByMonth = useMemo(() => {
    if (!demoHistory?.tokens) return [];

    const grouped = new Map<string, typeof demoHistory.tokens>();
    
    for (const token of demoHistory.tokens) {
      const monthKey = formatMonth(new Date(token.allocatedAt));
      const existing = grouped.get(monthKey) ?? [];
      existing.push(token);
      grouped.set(monthKey, existing);
    }

    return Array.from(grouped.entries()).map(([month, tokens]) => ({
      month,
      tokens,
      usedCount: tokens.filter(t => t.usedAt !== null).length,
      totalDuration: tokens.reduce((sum, t) => sum + (t.durationMinutes ?? 0), 0),
    }));
  }, [demoHistory?.tokens]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader title="🎭 演示模式统计" />
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
        <CardHeader title="🎭 演示模式统计" />
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
        title="🎭 演示模式统计" 
        description={`过去 ${months} 个月的演示模式使用情况`}
      />
      <CardContent className="space-y-6">
        {/* Active Demo Mode Banner */}
        {demoState?.isActive && (
          <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎭</span>
                <div>
                  <div className="font-medium text-purple-700">演示模式进行中</div>
                  <div className="text-sm text-purple-600">
                    剩余时间: {demoState.remainingMinutes} 分钟
                  </div>
                </div>
              </div>
              {demoState.expiresAt && (
                <div className="text-sm text-purple-600">
                  将于 {formatDate(new Date(demoState.expiresAt))} 结束
                </div>
              )}
            </div>
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Remaining Tokens */}
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {demoState?.remainingTokensThisMonth ?? 0}
            </div>
            <div className="text-sm text-green-600/70">本月剩余令牌</div>
          </div>

          {/* Used This Month */}
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">
              {demoHistory?.totalUsedThisMonth ?? 0}
            </div>
            <div className="text-sm text-blue-600/70">本月已使用</div>
          </div>

          {/* Total Duration This Month */}
          <div className="p-4 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">
              {formatDuration(demoHistory?.totalDurationMinutesThisMonth ?? 0)}
            </div>
            <div className="text-sm text-purple-600/70">本月总时长</div>
          </div>

          {/* Monthly Limit */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-600">
              {demoConfig?.tokensPerMonth ?? 3}
            </div>
            <div className="text-sm text-gray-600/70">每月限额</div>
          </div>
        </div>

        {/* Config Info */}
        {demoConfig && (
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">
                最大时长: {demoConfig.maxDurationMinutes} 分钟
              </span>
              <span className="text-gray-600">
                下次重置: {formatDate(new Date(demoConfig.nextResetDate))}
              </span>
            </div>
          </div>
        )}

        {/* Monthly Breakdown */}
        {tokensByMonth.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">月度使用详情</h4>
            <div className="space-y-4">
              {tokensByMonth.map(({ month, tokens, usedCount, totalDuration }) => (
                <div key={month} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Month Header */}
                  <div className="flex items-center justify-between p-3 bg-gray-50">
                    <span className="font-medium text-gray-700">{month}</span>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span>使用: {usedCount}/{tokens.length}</span>
                      <span>总时长: {formatDuration(totalDuration)}</span>
                    </div>
                  </div>
                  
                  {/* Tokens List */}
                  <div className="divide-y divide-gray-100">
                    {tokens.map((token) => {
                      const status = getTokenStatusColor(token);
                      return (
                        <div 
                          key={token.id}
                          className="flex items-center justify-between p-3"
                        >
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-0.5 text-xs rounded-full ${status.bg} ${status.text}`}>
                              {status.label}
                            </span>
                            <div className="text-sm">
                              {token.usedAt ? (
                                <span className="text-gray-700">
                                  {formatDate(new Date(token.usedAt))}
                                </span>
                              ) : (
                                <span className="text-gray-500">未使用</span>
                              )}
                            </div>
                          </div>
                          <div className="text-sm text-gray-600">
                            {token.durationMinutes !== null && (
                              <span>{formatDuration(token.durationMinutes)}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {tokensByMonth.length === 0 && (
          <div className="text-center py-4 text-gray-500">
            <span className="text-2xl">📭</span>
            <p className="mt-2">暂无演示模式使用记录</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default DemoModeStats;
