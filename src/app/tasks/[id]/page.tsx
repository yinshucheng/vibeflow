'use client';

/**
 * Task Detail Page
 * 
 * Displays task details with subtasks and actions.
 * Requirements: 2.3, 2.4, 2.5, 20.4, 20.5
 */

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { MainLayout, PageHeader, Card, CardHeader, CardContent, EmptyState } from '@/components/layout';
import { Button } from '@/components/ui';
import { TaskTree } from '@/components/tasks/task-tree';
import { trpc } from '@/lib/trpc';
import type { Task, TaskStatus, Priority, Project } from '@prisma/client';

type TaskWithRelations = Task & {
  project: Project;
  subTasks?: Task[];
  parent?: Task | null;
  estimatedMinutes?: number | null;
};

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // We need to fetch the task - let's use getTodayTasks and getBacklog to find it
  const { data: todayTasks } = trpc.task.getTodayTasks.useQuery();
  const { data: backlogTasks } = trpc.task.getBacklog.useQuery();
  
  // Get user settings for pomodoro duration (Requirements: 20.3)
  const { data: settings } = trpc.settings.get.useQuery();
  const pomodoroDuration = settings?.pomodoroDuration ?? 25;

  // Find the task from either list
  const allTasks = [...(todayTasks ?? []), ...(backlogTasks ?? [])] as TaskWithRelations[];
  const task = allTasks.find(t => t.id === taskId);
  
  // Get task estimation details (Requirements: 20.4, 20.5)
  const { data: taskEstimation } = trpc.task.getTaskWithEstimation.useQuery(
    { id: taskId, pomodoroDuration },
    { enabled: !!taskId }
  );

  // Get tasks from the same project for subtask display
  const { data: siblingTasks } = trpc.task.getByProject.useQuery(
    { projectId: task?.projectId ?? '' },
    { enabled: !!task?.projectId }
  );

  const utils = trpc.useUtils();
  
  const updateStatusMutation = trpc.task.updateStatus.useMutation({
    onSuccess: () => {
      utils.task.getTodayTasks.invalidate();
      utils.task.getBacklog.invalidate();
      if (task?.projectId) {
        utils.task.getByProject.invalidate({ projectId: task.projectId });
      }
    },
  });

  const deleteMutation = trpc.task.delete.useMutation({
    onSuccess: () => {
      utils.task.getTodayTasks.invalidate();
      utils.task.getBacklog.invalidate();
      router.push('/tasks');
    },
  });

  const isLoading = !todayTasks && !backlogTasks;

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

  if (!task) {
    return (
      <MainLayout title="Not Found">
        <EmptyState
          icon="❌"
          title="Task Not Found"
          description="The task you're looking for doesn't exist or has been deleted."
          action={
            <Link href="/tasks">
              <Button>Back to Tasks</Button>
            </Link>
          }
        />
      </MainLayout>
    );
  }

  const priorityConfig: Record<Priority, { label: string; color: string }> = {
    P1: { label: 'High Priority', color: 'bg-red-100 text-red-700' },
    P2: { label: 'Medium Priority', color: 'bg-yellow-100 text-yellow-700' },
    P3: { label: 'Low Priority', color: 'bg-gray-100 text-gray-700' },
  };

  const statusConfig: Record<TaskStatus, { label: string; color: string }> = {
    TODO: { label: 'To Do', color: 'bg-gray-100 text-gray-700' },
    IN_PROGRESS: { label: 'In Progress', color: 'bg-blue-100 text-blue-700' },
    DONE: { label: 'Done', color: 'bg-green-100 text-green-700' },
  };

  const subTasks = (siblingTasks ?? []).filter((t: Task) => t.parentId === taskId) as TaskWithRelations[];

  const handleStatusChange = (newStatus: TaskStatus) => {
    updateStatusMutation.mutate({
      id: taskId,
      status: newStatus,
      cascadeToSubtasks: subTasks.length > 0 && newStatus === 'DONE',
    });
  };

  return (
    <MainLayout title={task.title}>
      <PageHeader 
        title={task.title}
        actions={
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusConfig[task.status].color}`}>
              {statusConfig[task.status].label}
            </span>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${priorityConfig[task.priority].color}`}>
              {priorityConfig[task.priority].label}
            </span>
            <Link href={`/tasks/${taskId}/edit`}>
              <Button variant="outline" size="sm">Edit</Button>
            </Link>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Status Actions */}
          <Card>
            <CardHeader title="Status" />
            <CardContent>
              <div className="flex gap-2">
                {(['TODO', 'IN_PROGRESS', 'DONE'] as TaskStatus[]).map((status) => (
                  <Button
                    key={status}
                    variant={task.status === status ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => handleStatusChange(status)}
                    isLoading={updateStatusMutation.isPending}
                  >
                    {statusConfig[status].label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Subtasks */}
          <Card>
            <CardHeader 
              title="Subtasks" 
              actions={
                <Link href={`/tasks/new?projectId=${task.projectId}&parentId=${taskId}`}>
                  <Button size="sm">+ Add Subtask</Button>
                </Link>
              }
            />
            <CardContent>
              {subTasks.length > 0 ? (
                <TaskTree tasks={subTasks} />
              ) : (
                <EmptyState
                  icon="📋"
                  title="No Subtasks"
                  description="Break this task into smaller pieces"
                  action={
                    <Link href={`/tasks/new?projectId=${task.projectId}&parentId=${taskId}`}>
                      <Button size="sm">Add Subtask</Button>
                    </Link>
                  }
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Task Info */}
          <Card>
            <CardHeader title="Details" />
            <CardContent className="space-y-3 text-sm">
              <div>
                <span className="text-gray-500">Project:</span>
                <Link 
                  href={`/projects/${task.projectId}`}
                  className="ml-2 text-blue-600 hover:underline"
                >
                  {task.project?.title ?? 'Unknown'}
                </Link>
              </div>
              <div>
                <span className="text-gray-500">Created:</span>
                <span className="ml-2 text-gray-900">
                  {new Date(task.createdAt).toLocaleDateString()}
                </span>
              </div>
              {task.planDate && (
                <div>
                  <span className="text-gray-500">Planned:</span>
                  <span className="ml-2 text-gray-900">
                    {new Date(task.planDate).toLocaleDateString()}
                  </span>
                </div>
              )}
              <div>
                <span className="text-gray-500">Subtasks:</span>
                <span className="ml-2 text-gray-900">
                  {subTasks.filter(t => t.status === 'DONE').length}/{subTasks.length} completed
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Time Estimation Card (Requirements: 20.4, 20.5) */}
          <Card>
            <CardHeader title="Time Tracking" />
            <CardContent className="space-y-3 text-sm">
              {/* Estimated Time */}
              <div>
                <span className="text-gray-500">Estimated:</span>
                <span className="ml-2 text-gray-900">
                  {taskEstimation?.estimatedMinutes 
                    ? `${taskEstimation.estimatedMinutes} min (${taskEstimation.estimatedPomodoros} 🍅)`
                    : 'Not set'
                  }
                </span>
              </div>
              
              {/* Actual Time */}
              <div>
                <span className="text-gray-500">Actual:</span>
                <span className="ml-2 text-gray-900">
                  {taskEstimation?.actualMinutes 
                    ? `${taskEstimation.actualMinutes} min (${taskEstimation.actualPomodoros} 🍅)`
                    : '0 min'
                  }
                </span>
              </div>
              
              {/* Progress Bar (if estimated) */}
              {taskEstimation?.estimatedMinutes && taskEstimation.estimatedMinutes > 0 && (
                <div className="pt-2">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Progress</span>
                    <span>
                      {Math.min(100, Math.round((taskEstimation.actualMinutes / taskEstimation.estimatedMinutes) * 100))}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all ${
                        taskEstimation.actualMinutes > taskEstimation.estimatedMinutes
                          ? 'bg-red-500'
                          : 'bg-blue-500'
                      }`}
                      style={{ 
                        width: `${Math.min(100, (taskEstimation.actualMinutes / taskEstimation.estimatedMinutes) * 100)}%` 
                      }}
                    />
                  </div>
                  {taskEstimation.actualMinutes > taskEstimation.estimatedMinutes && (
                    <p className="text-xs text-red-600 mt-1">
                      Over estimate by {taskEstimation.actualMinutes - taskEstimation.estimatedMinutes} min
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader title="Delete Task?" />
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                {subTasks.length > 0 
                  ? `This will also delete ${subTasks.length} subtask(s). This action cannot be undone.`
                  : 'This action cannot be undone.'
                }
              </p>
              <div className="flex gap-3 justify-end">
                <Button 
                  variant="outline" 
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </Button>
                <Button 
                  variant="danger"
                  isLoading={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate({ id: taskId })}
                >
                  Delete Task
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </MainLayout>
  );
}
