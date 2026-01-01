'use client';

/**
 * Goal Detail Page
 * 
 * Displays goal details with progress and linked projects.
 * Requirements: 11.9
 */

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { MainLayout, PageHeader, Card, CardHeader, CardContent, EmptyState } from '@/components/layout';
import { Button } from '@/components/ui';
import { GoalProgressCard } from '@/components/goals/goal-progress-card';
import { trpc } from '@/lib/trpc';
import type { Goal, GoalType, GoalStatus, Project, ProjectGoal } from '@prisma/client';

type GoalWithProjects = Goal & {
  projects?: (ProjectGoal & { project: Project })[];
};

export default function GoalDetailPage() {
  const params = useParams();
  const router = useRouter();
  const goalId = params.id as string;
  
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  const { data: goals, isLoading } = trpc.goal.list.useQuery();
  const utils = trpc.useUtils();
  
  const archiveMutation = trpc.goal.archive.useMutation({
    onSuccess: () => {
      utils.goal.list.invalidate();
      router.push('/goals');
    },
  });

  const typedGoals = (goals ?? []) as GoalWithProjects[];
  const goal = typedGoals.find(g => g.id === goalId);

  if (isLoading) {
    return (
      <MainLayout title="Loading...">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-32 bg-gray-200 rounded" />
        </div>
      </MainLayout>
    );
  }

  if (!goal) {
    return (
      <MainLayout title="Not Found">
        <EmptyState
          icon="❌"
          title="Goal Not Found"
          description="The goal you're looking for doesn't exist or has been deleted."
          action={
            <Link href="/goals">
              <Button>Back to Goals</Button>
            </Link>
          }
        />
      </MainLayout>
    );
  }

  const statusConfig: Record<GoalStatus, { label: string; color: string }> = {
    ACTIVE: { label: 'Active', color: 'bg-green-100 text-green-700' },
    COMPLETED: { label: 'Completed', color: 'bg-blue-100 text-blue-700' },
    ARCHIVED: { label: 'Archived', color: 'bg-gray-100 text-gray-500' },
  };

  const config = statusConfig[goal.status];
  const targetDate = new Date(goal.targetDate);
  const isOverdue = goal.status === 'ACTIVE' && targetDate < new Date();

  return (
    <MainLayout title={goal.title}>
      <PageHeader 
        title={goal.title}
        description={goal.description}
        actions={
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${config.color}`}>
              {config.label}
            </span>
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-700">
              {goal.type === 'LONG_TERM' ? '🌟 Long-term' : '🎯 Short-term'}
            </span>
            {goal.status === 'ACTIVE' && (
              <>
                <Link href={`/goals/${goalId}/edit`}>
                  <Button variant="outline" size="sm">Edit</Button>
                </Link>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setShowArchiveConfirm(true)}
                >
                  Archive
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Progress */}
          <GoalProgressCard goal={goal} showDetails />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Goal Info */}
          <Card>
            <CardHeader title="Details" />
            <CardContent className="space-y-3 text-sm">
              <div>
                <span className="text-gray-500">Type:</span>
                <span className="ml-2 text-gray-900">
                  {goal.type === 'LONG_TERM' ? 'Long-term (1-5 years)' : 'Short-term (1 week - 6 months)'}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Target Date:</span>
                <span className={`ml-2 ${isOverdue ? 'text-red-600' : 'text-gray-900'}`}>
                  {targetDate.toLocaleDateString()}
                  {isOverdue && ' (Overdue)'}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Created:</span>
                <span className="ml-2 text-gray-900">
                  {new Date(goal.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Linked Projects:</span>
                <span className="ml-2 text-gray-900">
                  {goal.projects?.length ?? 0}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader title="Quick Actions" />
            <CardContent className="space-y-2">
              <Link href={`/projects/new?goalId=${goalId}`} className="block">
                <Button variant="outline" size="sm" className="w-full justify-start">
                  📁 Create Linked Project
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Archive Confirmation Modal */}
      {showArchiveConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader title="Archive Goal?" />
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Archiving this goal will keep it for historical reference but remove it from active tracking.
                Linked projects will not be affected.
              </p>
              <div className="flex gap-3 justify-end">
                <Button 
                  variant="outline" 
                  onClick={() => setShowArchiveConfirm(false)}
                >
                  Cancel
                </Button>
                <Button 
                  variant="danger"
                  isLoading={archiveMutation.isPending}
                  onClick={() => archiveMutation.mutate({ id: goalId })}
                >
                  Archive Goal
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </MainLayout>
  );
}
