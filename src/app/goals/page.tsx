'use client';

/**
 * Goals Page
 * 
 * Displays all goals grouped by type (long-term/short-term).
 * Requirements: 11.1, 11.2, 11.3, 11.9
 */

import { useState } from 'react';
import Link from 'next/link';
import { MainLayout, PageHeader, Card, CardHeader, CardContent, EmptyState } from '@/components/layout';
import { Button } from '@/components/ui';
import { GoalProgressCard } from '@/components/goals/goal-progress-card';
import { trpc } from '@/lib/trpc';
import type { Goal, GoalType, GoalStatus, ProjectGoal, Project } from '@prisma/client';

type GoalFilter = 'ALL' | GoalStatus;

type GoalWithProjects = Goal & {
  projects?: (ProjectGoal & { project: Project })[];
};

const statusConfig: Record<GoalStatus, { label: string; color: string }> = {
  ACTIVE: { label: 'Active', color: 'bg-green-100 text-green-700' },
  COMPLETED: { label: 'Completed', color: 'bg-blue-100 text-blue-700' },
  ARCHIVED: { label: 'Archived', color: 'bg-gray-100 text-gray-500' },
};

export default function GoalsPage() {
  const [filter, setFilter] = useState<GoalFilter>('ACTIVE');
  const { data: goals, isLoading } = trpc.goal.list.useQuery();

  const typedGoals = (goals ?? []) as GoalWithProjects[];
  const filteredGoals = typedGoals.filter((g: GoalWithProjects) => 
    filter === 'ALL' || g.status === filter
  );

  const longTermGoals = filteredGoals.filter((g: GoalWithProjects) => g.type === 'LONG_TERM');
  const shortTermGoals = filteredGoals.filter((g: GoalWithProjects) => g.type === 'SHORT_TERM');

  return (
    <MainLayout title="Goals">
      <PageHeader 
        title="Goals" 
        description="Define your long-term vision and short-term milestones"
        actions={
          <Link href="/goals/new">
            <Button>+ New Goal</Button>
          </Link>
        }
      />

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        <button
          onClick={() => setFilter('ALL')}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
            filter === 'ALL' 
              ? 'bg-blue-100 text-blue-700' 
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          All ({typedGoals.length})
        </button>
        {(Object.keys(statusConfig) as GoalStatus[]).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              filter === status 
                ? statusConfig[status].color
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {statusConfig[status].label} (
            {typedGoals.filter((g: GoalWithProjects) => g.status === status).length})
          </button>
        ))}
      </div>

      {/* Goals List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse h-32 bg-gray-100 rounded-lg" />
          ))}
        </div>
      ) : filteredGoals.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon="🎯"
              title="No Goals Found"
              description={filter === 'ALL' 
                ? "Define your first goal to align your work with your vision" 
                : `No ${filter.toLowerCase()} goals`
              }
              action={
                filter === 'ALL' || filter === 'ACTIVE' ? (
                  <Link href="/goals/new">
                    <Button>Create Goal</Button>
                  </Link>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Long-term Goals */}
          {longTermGoals.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                🌟 Long-term Goals
                <span className="text-sm font-normal text-gray-500">
                  (1-5 years)
                </span>
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {longTermGoals.map((goal: GoalWithProjects) => (
                  <GoalCard key={goal.id} goal={goal} />
                ))}
              </div>
            </div>
          )}

          {/* Short-term Goals */}
          {shortTermGoals.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                🎯 Short-term Goals
                <span className="text-sm font-normal text-gray-500">
                  (1 week - 6 months)
                </span>
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {shortTermGoals.map((goal: GoalWithProjects) => (
                  <GoalCard key={goal.id} goal={goal} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </MainLayout>
  );
}

interface GoalCardProps {
  goal: GoalWithProjects;
}

function GoalCard({ goal }: GoalCardProps) {
  const config = statusConfig[goal.status];
  const linkedProjects = goal.projects?.length ?? 0;
  const targetDate = new Date(goal.targetDate);
  const isOverdue = goal.status === 'ACTIVE' && targetDate < new Date();
  
  return (
    <Link href={`/goals/${goal.id}`}>
      <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
        <CardContent>
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span>{goal.type === 'LONG_TERM' ? '🌟' : '🎯'}</span>
              <h3 className="font-medium text-gray-900 line-clamp-1">{goal.title}</h3>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${config.color}`}>
              {config.label}
            </span>
          </div>
          
          <p className="text-sm text-gray-500 line-clamp-2 mb-3">{goal.description}</p>
          
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span className={isOverdue ? 'text-red-600' : ''}>
              📅 {targetDate.toLocaleDateString()}
              {isOverdue && ' (Overdue)'}
            </span>
            <span>
              📁 {linkedProjects} project{linkedProjects !== 1 ? 's' : ''}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
