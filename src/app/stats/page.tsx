'use client';

/**
 * Statistics Page
 * 
 * Main page for viewing pomodoro statistics with multiple views.
 * Requirements: 3.1-3.11, 10.3-10.8, 24.1-24.5, 24.1.1-24.1.6, 14.3-14.5, 8.2-8.3, 3.6, 4.5, 6.8
 */

import { useState, useCallback } from 'react';
import { MainLayout, PageHeader } from '@/components/layout';
import { StatsDashboard } from '@/components/stats/stats-dashboard';
import { ProjectStats } from '@/components/stats/project-stats';
import { TaskStats } from '@/components/stats/task-stats';
import { DailyStats } from '@/components/stats/daily-stats';
import { DailyReviewCard } from '@/components/stats/daily-review-card';
import { TrendChart } from '@/components/stats/trend-chart';
import { SkipTokenStats } from '@/components/stats/skip-token-stats';
import { EfficiencyAnalysis } from '@/components/stats/efficiency-analysis';
import { ProductivityHeatmap } from '@/components/stats/productivity-heatmap';
import { ExemptionHistory } from '@/components/stats/exemption-history';
import { FocusSessionStats } from '@/components/stats/focus-session-stats';
import { EntertainmentStats } from '@/components/stats/entertainment-stats';
import { WorkStartStats } from '@/components/stats/work-start-stats';
import { ClientUptimeStats } from '@/components/stats/client-uptime-stats';
import { BypassAttemptStats } from '@/components/stats/bypass-attempt-stats';
import { DemoModeStats } from '@/components/stats/demo-mode-stats';
import { trpc } from '@/lib/trpc';
import type { PomodoroStats } from '@/services/stats.service';

// Tab types
type StatsTab = 'overview' | 'projects' | 'tasks' | 'daily' | 'review' | 'skipTokens' | 'efficiency' | 'focusSessions' | 'entertainment' | 'workStart' | 'clientUptime' | 'bypassAttempts' | 'demoMode';

const TABS: { id: StatsTab; label: string; icon: string }[] = [
  { id: 'overview', label: '总览', icon: '📊' },
  { id: 'projects', label: '项目', icon: '📁' },
  { id: 'tasks', label: '任务', icon: '📋' },
  { id: 'daily', label: '每日', icon: '📅' },
  { id: 'review', label: '复盘', icon: '🎯' },
  { id: 'efficiency', label: '效率', icon: '📈' },
  { id: 'focusSessions', label: '专注', icon: '🎯' },
  { id: 'entertainment', label: '娱乐', icon: '🎮' },
  { id: 'workStart', label: '启动', icon: '🚀' },
  { id: 'skipTokens', label: '跳过令牌', icon: '⏭️' },
  { id: 'clientUptime', label: '客户端', icon: '📡' },
  { id: 'bypassAttempts', label: '绕过检测', icon: '🛡️' },
  { id: 'demoMode', label: '演示模式', icon: '🎭' },
];

export default function StatsPage() {
  const [activeTab, setActiveTab] = useState<StatsTab>('overview');
  const [stats, setStats] = useState<PomodoroStats | null>(null);
  const [reviewMetric, setReviewMetric] = useState<'workTime' | 'pomodoroCount'>('workTime');

  // Handle stats change from dashboard
  const handleStatsChange = useCallback((newStats: PomodoroStats | null) => {
    setStats(newStats);
  }, []);

  // Fetch review data
  const { data: todayReview, isLoading: isLoadingToday } = trpc.review.getToday.useQuery(
    undefined,
    { enabled: activeTab === 'review' }
  );
  
  const { data: weeklyTrend, isLoading: isLoadingWeekly } = trpc.review.getWeeklyTrend.useQuery(
    { weekStart: undefined },
    { enabled: activeTab === 'review' }
  );

  return (
    <MainLayout title="统计">
      <PageHeader
        title="📊 统计分析"
        description="查看你的番茄工作法统计数据，了解时间分配和工作效率"
      />

      {/* Tab Navigation */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex gap-1 -mb-px">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  px-4 py-2 text-sm font-medium border-b-2 transition-colors
                  ${activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Stats Dashboard with Filters */}
      <StatsDashboard onStatsChange={handleStatsChange}>
        {/* Tab Content */}
        <div className="mt-6">
          {activeTab === 'overview' && stats && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ProjectStats stats={stats.byProject} />
              <TaskStats stats={stats.byTask} />
              <div className="lg:col-span-2">
                <DailyStats stats={stats.byDay} />
              </div>
            </div>
          )}

          {activeTab === 'projects' && stats && (
            <ProjectStats stats={stats.byProject} />
          )}

          {activeTab === 'tasks' && stats && (
            <TaskStats stats={stats.byTask} />
          )}

          {activeTab === 'daily' && stats && (
            <DailyStats stats={stats.byDay} />
          )}

          {activeTab === 'review' && (
            <div className="space-y-6">
              {/* Metric Toggle */}
              <div className="flex justify-center gap-2">
                <button
                  onClick={() => setReviewMetric('workTime')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    reviewMetric === 'workTime'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  ⏱️ 工作时间
                </button>
                <button
                  onClick={() => setReviewMetric('pomodoroCount')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    reviewMetric === 'pomodoroCount'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  🍅 番茄数量
                </button>
              </div>

              {/* Today's Review */}
              {isLoadingToday ? (
                <div className="animate-pulse">
                  <div className="h-64 bg-gray-100 rounded-lg" />
                </div>
              ) : todayReview ? (
                <DailyReviewCard data={todayReview} showDetails={true} />
              ) : (
                <div className="text-center py-8 text-gray-500">
                  暂无今日复盘数据
                </div>
              )}

              {/* Weekly Trend */}
              {isLoadingWeekly ? (
                <div className="animate-pulse">
                  <div className="h-80 bg-gray-100 rounded-lg" />
                </div>
              ) : weeklyTrend ? (
                <TrendChart 
                  data={weeklyTrend} 
                  metric={reviewMetric}
                  showExpected={true}
                  showActual={true}
                />
              ) : (
                <div className="text-center py-8 text-gray-500">
                  暂无本周趋势数据
                </div>
              )}
            </div>
          )}

          {/* Skip Tokens Tab (Requirements 5.7) */}
          {activeTab === 'skipTokens' && (
            <SkipTokenStats days={14} />
          )}

          {/* Efficiency Tab (Requirements 24.1-24.5, 24.1.1-24.1.6) */}
          {activeTab === 'efficiency' && (
            <div className="space-y-6">
              <EfficiencyAnalysis days={30} />
              <ProductivityHeatmap days={30} />
              <ExemptionHistory days={7} />
            </div>
          )}

          {/* Focus Sessions Tab (Requirements 8.2, 8.3) */}
          {activeTab === 'focusSessions' && (
            <FocusSessionStats days={14} />
          )}

          {/* Entertainment Tab (Requirements 12.5, 12.6) */}
          {activeTab === 'entertainment' && (
            <EntertainmentStats days={14} />
          )}

          {/* Work Start Tab (Requirements 14.5, 14.6) */}
          {activeTab === 'workStart' && (
            <WorkStartStats days={30} />
          )}

          {/* Client Uptime Tab (Requirements 3.6) */}
          {activeTab === 'clientUptime' && (
            <ClientUptimeStats days={30} />
          )}

          {/* Bypass Attempts Tab (Requirements 4.5) */}
          {activeTab === 'bypassAttempts' && (
            <BypassAttemptStats days={30} />
          )}

          {/* Demo Mode Tab (Requirements 6.8) */}
          {activeTab === 'demoMode' && (
            <DemoModeStats months={3} />
          )}

          {/* Loading/Empty State */}
          {!stats && activeTab !== 'review' && activeTab !== 'skipTokens' && activeTab !== 'efficiency' && activeTab !== 'focusSessions' && activeTab !== 'entertainment' && activeTab !== 'workStart' && activeTab !== 'clientUptime' && activeTab !== 'bypassAttempts' && activeTab !== 'demoMode' && (
            <div className="text-center py-12 text-gray-500">
              选择时间范围以查看统计数据
            </div>
          )}
        </div>
      </StatsDashboard>
    </MainLayout>
  );
}
