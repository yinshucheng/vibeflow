'use client';

/**
 * Edit Task Page
 * 
 * Page for editing an existing task.
 * Requirements: 2.5
 */

import { useParams } from 'next/navigation';
import { MainLayout, PageHeader, EmptyState } from '@/components/layout';
import { TaskForm } from '@/components/tasks/task-form';
import { Button } from '@/components/ui';
import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import type { Task, Project, Priority } from '@prisma/client';

type TaskWithProject = Task & {
  project: Project;
  estimatedMinutes?: number | null;
};

export default function EditTaskPage() {
  const params = useParams();
  const taskId = params.id as string;

  // Find the task from today or backlog
  const { data: todayTasks, isLoading: todayLoading } = trpc.task.getTodayTasks.useQuery();
  const { data: backlogTasks, isLoading: backlogLoading } = trpc.task.getBacklog.useQuery();

  const isLoading = todayLoading || backlogLoading;
  const allTasks = [...(todayTasks ?? []), ...(backlogTasks ?? [])] as TaskWithProject[];
  const task = allTasks.find(t => t.id === taskId);

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

  if (!task) {
    return (
      <MainLayout title="Not Found">
        <EmptyState
          icon="❌"
          title="Task Not Found"
          description="The task you're trying to edit doesn't exist."
          action={
            <Link href="/tasks">
              <Button>Back to Tasks</Button>
            </Link>
          }
        />
      </MainLayout>
    );
  }

  return (
    <MainLayout title={`Edit: ${task.title}`}>
      <PageHeader 
        title="Edit Task" 
        description={`Editing: ${task.title}`}
      />
      <div className="max-w-2xl">
        <TaskForm 
          taskId={taskId}
          initialData={{
            title: task.title,
            projectId: task.projectId,
            parentId: task.parentId,
            priority: task.priority as Priority,
            planDate: task.planDate,
            estimatedMinutes: task.estimatedMinutes,
          }}
        />
      </div>
    </MainLayout>
  );
}
