'use client';

/**
 * Home Page / Dashboard — Command Center
 *
 * Single-column layout with priority-ordered sections:
 * 1. Airlock Prompt (conditional)
 * 2. FocusZone — embedded pomodoro controls
 * 3. TodayTaskList — today's tasks with inline actions
 * 4. Auxiliary dual-column: DailyProgressCard + FocusSessionControl
 * 5. Suggestions (collapsible): GoalRiskSuggestions + TaskSuggestions
 *
 * Redirects to Airlock when system is in LOCKED state (respects airlockMode setting).
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { Button } from '@/components/ui/button';
import { Icons } from '@/lib/icons';
import { trpc } from '@/lib/trpc';
import type { SystemState } from '@/machines/vibeflow.machine';

type AirlockMode = 'required' | 'optional' | 'disabled';

export default function Home() {
  const router = useRouter();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const { data: dailyState, isLoading: stateLoading } = trpc.dailyState.getToday.useQuery();
  const { data: settings, isLoading: settingsLoading } = trpc.settings.get.useQuery();

  const systemState = dailyState?.systemState?.toLowerCase() as SystemState | undefined;
  const isLocked = systemState === 'locked';
  const airlockCompleted = dailyState?.airlockCompleted ?? false;
  const airlockMode = (settings?.airlockMode as AirlockMode) ?? 'optional';

  // Redirect to Airlock when system is locked and airlock not completed
  // Only redirect if airlockMode is 'required'
  useEffect(() => {
    if (
      !stateLoading &&
      !settingsLoading &&
      isLocked &&
      !airlockCompleted &&
      airlockMode === 'required'
    ) {
      router.push('/airlock');
    }
  }, [stateLoading, settingsLoading, isLocked, airlockCompleted, airlockMode, router]);

  const LoaderIcon = Icons.loader;
  const SunriseIcon = Icons.airlock;

  // Show loading while checking state
  if (stateLoading || settingsLoading) {
    return (
      <MainLayout title="Dashboard">
        <div className="flex items-center justify-center h-64">
          <LoaderIcon className="w-5 h-5 animate-spin text-notion-text-tertiary" />
        </div>
      </MainLayout>
    );
  }

  // Show redirect message if locked and required mode
  if (isLocked && !airlockCompleted && airlockMode === 'required') {
    return (
      <MainLayout title="Dashboard">
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <SunriseIcon className="w-10 h-10 text-notion-accent-orange" />
          <p className="text-notion-text-secondary">Redirecting to Morning Airlock...</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Dashboard">
      <PageHeader title="Dashboard" description="Your command center" />

      {/* Airlock prompt (conditional — locked but not required) */}
      {isLocked && !airlockCompleted && airlockMode !== 'disabled' && (
        <div className="mb-6 p-4 bg-notion-accent-purple-bg border border-notion-border rounded-notion-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SunriseIcon className="w-6 h-6 text-notion-accent-purple" />
              <div>
                <h3 className="font-medium text-notion-text">Start your day with intention</h3>
                <p className="text-sm text-notion-text-secondary">
                  Complete the Morning Airlock to plan your day
                </p>
              </div>
            </div>
            <Link href="/airlock">
              <Button variant="primary">Open Airlock</Button>
            </Link>
          </div>
        </div>
      )}

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
