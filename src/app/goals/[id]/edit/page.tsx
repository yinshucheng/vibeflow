'use client';

/**
 * Edit Goal Page
 * 
 * Page for editing an existing goal.
 */

import { useParams } from 'next/navigation';
import { MainLayout, PageHeader, EmptyState } from '@/components/layout';
import { GoalForm } from '@/components/goals/goal-form';
import { Button } from '@/components/ui';
import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import type { Goal, GoalType } from '@prisma/client';

export default function EditGoalPage() {
  const params = useParams();
  const goalId = params.id as string;

  const { data: goals, isLoading } = trpc.goal.list.useQuery();
  const goal = (goals ?? []).find((g: Goal) => g.id === goalId);

  if (isLoading) {
    return (
      <MainLayout title="Loading...">
        <div className="animate-pulse space-y-4 max-w-2xl">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-64 bg-gray-200 rounded" />
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
          description="The goal you're trying to edit doesn't exist."
          action={
            <Link href="/goals">
              <Button>Back to Goals</Button>
            </Link>
          }
        />
      </MainLayout>
    );
  }

  return (
    <MainLayout title={`Edit: ${goal.title}`}>
      <PageHeader 
        title="Edit Goal" 
        description={`Editing: ${goal.title}`}
      />
      <div className="max-w-2xl">
        <GoalForm 
          goalId={goalId}
          initialData={{
            title: goal.title,
            description: goal.description,
            type: goal.type as GoalType,
            targetDate: goal.targetDate,
          }}
        />
      </div>
    </MainLayout>
  );
}
