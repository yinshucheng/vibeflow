'use client';

/**
 * Home Page / Dashboard — Command Center
 *
 * Single-column layout with priority-ordered sections:
 * 1. FocusZone — embedded pomodoro controls
 * 2. TodayTaskList — today's tasks with inline actions
 * 3. Auxiliary dual-column: DailyProgressCard + FocusSessionControl
 * 4. Suggestions (collapsible): GoalRiskSuggestions + TaskSuggestions
 */

import { useState } from 'react';
import {
  MainLayout,
  PageHeader,
  Card,
  CardHeader,
  CardContent,
} from '@/components/layout';
import { FocusSessionControl } from '@/components/focus-session';
import {
  DailyProgressCard,
  GoalRiskSuggestions,
  TaskSuggestions,
  FocusZone,
  TodayTaskList,
} from '@/components/dashboard';
import { TaskDetailPanel } from '@/components/tasks/task-detail-panel';
import { Icons } from '@/lib/icons';
import { trpc } from '@/lib/trpc';

export default function Home() {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const { isLoading: stateLoading } = trpc.dailyState.getToday.useQuery();

  const LoaderIcon = Icons.loader;

  // Show loading while checking state
  if (stateLoading) {
    return (
      <MainLayout title="Dashboard">
        <div className="flex items-center justify-center h-64">
          <LoaderIcon className="w-5 h-5 animate-spin text-notion-text-tertiary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Dashboard">
      <PageHeader title="Dashboard" description="Your command center" />

      <div className="space-y-6">
        {/* FocusZone — full width */}
        <FocusZone />

        {/* Today's Tasks — full width */}
        <TodayTaskList onTaskSelect={setSelectedTaskId} />

        {/* Auxiliary dual-column: Daily Progress + Focus Session */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader title="Daily Progress" />
            <CardContent>
              <DailyProgressCard compact />
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Focus Session" description="Block distractions outside work hours" />
            <CardContent>
              <FocusSessionControl compact />
            </CardContent>
          </Card>
        </div>

        {/* Suggestions — collapsible, default collapsed */}
        <div className="border border-notion-border rounded-notion-lg overflow-hidden">
          <button
            onClick={() => setSuggestionsOpen(!suggestionsOpen)}
            className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium text-notion-text-secondary hover:bg-notion-bg-hover transition-colors"
          >
            {suggestionsOpen ? (
              <Icons.chevronDown className="w-4 h-4" />
            ) : (
              <Icons.chevronRight className="w-4 h-4" />
            )}
            Suggestions
          </button>
          {suggestionsOpen && (
            <div className="px-4 pb-4 space-y-4">
              <GoalRiskSuggestions />
              <Card>
                <CardHeader title="Suggested Tasks" description="Based on priority and remaining time" />
                <CardContent>
                  <TaskSuggestions maxSuggestions={3} compact />
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      <TaskDetailPanel taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
    </MainLayout>
  );
}
