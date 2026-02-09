'use client';

/**
 * Home Page / Dashboard
 *
 * Notion-style dashboard showing system state and quick actions.
 * Redirects to Airlock when system is in LOCKED state (respects airlockMode setting).
 */

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MainLayout,
  PageHeader,
  Card,
  CardHeader,
  CardContent,
  EmptyState,
} from '@/components/layout';
import { FocusSessionControl } from '@/components/focus-session';
import {
  DashboardStatus,
  DailyProgressCard,
  GoalRiskSuggestions,
  TaskSuggestions,
} from '@/components/dashboard';
import { Button } from '@/components/ui/button';
import { Icons } from '@/lib/icons';
import { trpc } from '@/lib/trpc';
import type { SystemState } from '@/machines/vibeflow.machine';

type AirlockMode = 'required' | 'optional' | 'disabled';

export default function Home() {
  const router = useRouter();
  const { data: dailyState, isLoading: stateLoading } = trpc.dailyState.getToday.useQuery();
  const { data: settings, isLoading: settingsLoading } = trpc.settings.get.useQuery();
  const { data: projects, isLoading: projectsLoading } = trpc.project.list.useQuery();
  const { data: todayTasks, isLoading: tasksLoading } = trpc.task.getTodayTasks.useQuery();

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
  const ProjectIcon = Icons.projects;
  const TaskIcon = Icons.tasks;
  const PlusIcon = Icons.plus;

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
      <PageHeader title="Welcome to VibeFlow" description="Your AI-Native Output Engine" />

      {/* Show Airlock prompt if locked but not required */}
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

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Current Status Card (Requirements: 15.1-15.5) */}
        <Card>
          <CardHeader title="Current Status" />
          <CardContent>
            <DashboardStatus compact />
          </CardContent>
        </Card>

        {/* Daily Progress Card (Requirements: 17.1-17.4, 19.1-19.7) */}
        <Card>
          <CardHeader title="Daily Progress" />
          <CardContent>
            <DailyProgressCard compact />
          </CardContent>
        </Card>

        {/* Ad-hoc Focus Session Card (Requirements: 5.1, 5.2, 5.3, 5.4) */}
        <Card>
          <CardHeader title="Focus Session" description="Block distractions outside work hours" />
          <CardContent>
            <FocusSessionControl compact />
          </CardContent>
        </Card>

        {/* Goal Risk Suggestions (Requirements: 19.1.1-19.1.7) */}
        <div className="md:col-span-2 lg:col-span-3">
          <GoalRiskSuggestions />
        </div>

        {/* Task Suggestions Card (Requirements: 22.1-22.4) */}
        <Card>
          <CardHeader title="Suggested Tasks" description="Based on priority and remaining time" />
          <CardContent>
            <TaskSuggestions maxSuggestions={3} compact />
          </CardContent>
        </Card>

        {/* Active Projects Card */}
        <Card>
          <CardHeader
            title="Active Projects"
            actions={
              <Link
                href="/projects"
                className="text-sm text-notion-accent-blue hover:underline"
              >
                View all
              </Link>
            }
          />
          <CardContent>
            {projectsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse h-12 bg-notion-bg-tertiary rounded-notion-md" />
                ))}
              </div>
            ) : projects && projects.length > 0 ? (
              <ul className="space-y-1">
                {projects
                  .filter((p: { status: string }) => p.status === 'ACTIVE')
                  .slice(0, 5)
                  .map((project: { id: string; title: string; deliverable: string }) => (
                    <li key={project.id}>
                      <Link
                        href={`/projects/${project.id}`}
                        className="group flex items-center gap-2 p-2 rounded-notion-md hover:bg-notion-bg-hover transition-colors"
                      >
                        <ProjectIcon className="w-4 h-4 text-notion-text-tertiary" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-notion-text truncate">
                            {project.title}
                          </div>
                          <div className="text-xs text-notion-text-tertiary truncate">
                            {project.deliverable}
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
              </ul>
            ) : (
              <EmptyState
                icon={<ProjectIcon className="w-8 h-8" />}
                title="No Projects"
                description="Create your first project to get started"
                action={
                  <Link href="/projects/new">
                    <Button variant="primary" size="sm">
                      <PlusIcon className="w-3.5 h-3.5" />
                      Create Project
                    </Button>
                  </Link>
                }
              />
            )}
          </CardContent>
        </Card>

        {/* Today's Tasks Card */}
        <Card>
          <CardHeader
            title="Today's Tasks"
            actions={
              <Link href="/tasks" className="text-sm text-notion-accent-blue hover:underline">
                View all
              </Link>
            }
          />
          <CardContent>
            {tasksLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse h-10 bg-notion-bg-tertiary rounded-notion-md" />
                ))}
              </div>
            ) : todayTasks && todayTasks.length > 0 ? (
              <ul className="space-y-1">
                {todayTasks
                  .slice(0, 5)
                  .map((task: { id: string; title: string; status: string; priority: string }) => (
                    <li key={task.id}>
                      <div className="group flex items-center gap-2 p-2 rounded-notion-md hover:bg-notion-bg-hover transition-colors">
                        <div
                          className={`w-4 h-4 rounded-notion-sm border flex items-center justify-center ${
                            task.status === 'DONE'
                              ? 'bg-notion-accent-blue border-notion-accent-blue'
                              : 'border-notion-border-strong'
                          }`}
                        >
                          {task.status === 'DONE' && (
                            <Icons.check className="w-3 h-3 text-white" />
                          )}
                        </div>
                        <span
                          className={`flex-1 text-sm ${
                            task.status === 'DONE'
                              ? 'line-through text-notion-text-tertiary'
                              : 'text-notion-text'
                          }`}
                        >
                          {task.title}
                        </span>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-notion-sm ${
                            task.priority === 'P1'
                              ? 'bg-notion-accent-red-bg text-notion-accent-red'
                              : task.priority === 'P2'
                                ? 'bg-notion-accent-orange-bg text-notion-accent-orange'
                                : 'bg-notion-bg-tertiary text-notion-text-tertiary'
                          }`}
                        >
                          {task.priority}
                        </span>
                      </div>
                    </li>
                  ))}
              </ul>
            ) : (
              <EmptyState
                icon={<TaskIcon className="w-8 h-8" />}
                title="No Tasks Today"
                description="Plan your day in the Morning Airlock"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
