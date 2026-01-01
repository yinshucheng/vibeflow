'use client';

/**
 * Project Detail Page
 * 
 * Displays project details with tasks and actions.
 * Requirements: 1.3, 1.4, 1.5, 21.1, 21.2, 21.3, 21.4
 */

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { MainLayout, PageHeader, Card, CardHeader, CardContent, EmptyState } from '@/components/layout';
import { Button } from '@/components/ui';
import { trpc } from '@/lib/trpc';
import type { ProjectStatus, Task, TaskStatus, Priority, Goal, ProjectGoal } from '@prisma/client';

type TaskWithRelations = Task & {
  subTasks?: Task[];
  estimatedMinutes?: number | null;
};

type ProjectWithGoals = {
  id: string;
  title: string;
  deliverable: string;
  status: ProjectStatus;
  createdAt: Date;
  goals?: (ProjectGoal & { goal: Goal })[];
};

const statusConfig: Record<ProjectStatus, { label: string; color: string }> = {
  ACTIVE: { label: 'Active', color: 'bg-green-100 text-green-700' },
  COMPLETED: { label: 'Completed', color: 'bg-blue-100 text-blue-700' },
  ARCHIVED: { label: 'Archived', color: 'bg-gray-100 text-gray-500' },
};

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  const { data: project, isLoading } = trpc.project.getById.useQuery(
    { id: projectId },
    { enabled: !!projectId }
  );
  
  const { data: tasks } = trpc.task.getByProject.useQuery(
    { projectId },
    { enabled: !!projectId }
  );
  
  // Get user settings for pomodoro duration (Requirements: 21.2)
  const { data: settings } = trpc.settings.get.useQuery();
  const pomodoroDuration = settings?.pomodoroDuration ?? 25;
  
  // Get project estimation (Requirements: 21.1, 21.2, 21.3, 21.4)
  const { data: projectEstimation } = trpc.project.getProjectEstimation.useQuery(
    { id: projectId, pomodoroDuration },
    { enabled: !!projectId }
  );

  const utils = trpc.useUtils();
  
  const archiveMutation = trpc.project.archive.useMutation({
    onSuccess: () => {
      utils.project.list.invalidate();
      router.push('/projects');
    },
  });

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

  const typedProject = project as ProjectWithGoals | undefined;

  if (!typedProject) {
    return (
      <MainLayout title="Not Found">
        <EmptyState
          icon="❌"
          title="Project Not Found"
          description="The project you're looking for doesn't exist or has been deleted."
          action={
            <Link href="/projects">
              <Button>Back to Projects</Button>
            </Link>
          }
        />
      </MainLayout>
    );
  }

  const config = statusConfig[typedProject.status];
  const typedTasks = (tasks ?? []) as TaskWithRelations[];
  const todoTasks = typedTasks.filter((t: TaskWithRelations) => t.status === 'TODO');
  const inProgressTasks = typedTasks.filter((t: TaskWithRelations) => t.status === 'IN_PROGRESS');
  const doneTasks = typedTasks.filter((t: TaskWithRelations) => t.status === 'DONE');

  return (
    <MainLayout title={typedProject.title}>
      <PageHeader 
        title={typedProject.title}
        description={typedProject.deliverable}
        actions={
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${config.color}`}>
              {config.label}
            </span>
            {typedProject.status === 'ACTIVE' && (
              <>
                <Link href={`/projects/${projectId}/edit`}>
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
          {/* Tasks Section */}
          <Card>
            <CardHeader 
              title="Tasks" 
              actions={
                typedProject.status === 'ACTIVE' && (
                  <Link href={`/tasks/new?projectId=${projectId}`}>
                    <Button size="sm">+ Add Task</Button>
                  </Link>
                )
              }
            />
            <CardContent>
              {typedTasks.length > 0 ? (
                <div className="space-y-4">
                  {/* In Progress */}
                  {inProgressTasks.length > 0 && (
                    <TaskGroup title="In Progress" tasks={inProgressTasks} icon="🔄" />
                  )}
                  
                  {/* To Do */}
                  {todoTasks.length > 0 && (
                    <TaskGroup title="To Do" tasks={todoTasks} icon="📋" />
                  )}
                  
                  {/* Done */}
                  {doneTasks.length > 0 && (
                    <TaskGroup title="Done" tasks={doneTasks} icon="✅" collapsed />
                  )}
                </div>
              ) : (
                <EmptyState
                  icon="✅"
                  title="No Tasks Yet"
                  description="Add tasks to track work for this project"
                  action={
                    typedProject.status === 'ACTIVE' && (
                      <Link href={`/tasks/new?projectId=${projectId}`}>
                        <Button size="sm">Add First Task</Button>
                      </Link>
                    )
                  }
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Project Info */}
          <Card>
            <CardHeader title="Details" />
            <CardContent className="space-y-3 text-sm">
              <div>
                <span className="text-gray-500">Created:</span>
                <span className="ml-2 text-gray-900">
                  {new Date(typedProject.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Tasks:</span>
                <span className="ml-2 text-gray-900">
                  {doneTasks.length}/{typedTasks.length} completed
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Time Estimation Card (Requirements: 21.1, 21.2, 21.3, 21.4) */}
          <Card>
            <CardHeader title="Time Tracking" />
            <CardContent className="space-y-3 text-sm">
              {/* Estimated Time */}
              <div>
                <span className="text-gray-500">Estimated:</span>
                <span className="ml-2 text-gray-900">
                  {projectEstimation?.totalEstimatedMinutes 
                    ? `${projectEstimation.totalEstimatedMinutes} min (${projectEstimation.totalEstimatedPomodoros} 🍅)`
                    : 'Not set'
                  }
                </span>
              </div>
              
              {/* Actual Time */}
              <div>
                <span className="text-gray-500">Actual:</span>
                <span className="ml-2 text-gray-900">
                  {projectEstimation?.completedMinutes 
                    ? `${projectEstimation.completedMinutes} min (${projectEstimation.completedPomodoros} 🍅)`
                    : '0 min'
                  }
                </span>
              </div>
              
              {/* Remaining */}
              {projectEstimation?.totalEstimatedMinutes && projectEstimation.totalEstimatedMinutes > 0 && (
                <div>
                  <span className="text-gray-500">Remaining:</span>
                  <span className="ml-2 text-gray-900">
                    {projectEstimation.remainingMinutes} min ({projectEstimation.remainingPomodoros} 🍅)
                  </span>
                </div>
              )}
              
              {/* Tasks with estimates */}
              <div>
                <span className="text-gray-500">Tasks with estimates:</span>
                <span className="ml-2 text-gray-900">
                  {projectEstimation?.tasksWithEstimates ?? 0}/{projectEstimation?.taskCount ?? 0}
                </span>
              </div>
              
              {/* Progress Bar (if estimated) */}
              {projectEstimation?.totalEstimatedMinutes && projectEstimation.totalEstimatedMinutes > 0 && (
                <div className="pt-2">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Progress</span>
                    <span>{projectEstimation.completionPercentage}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all ${
                        projectEstimation.completedMinutes > projectEstimation.totalEstimatedMinutes
                          ? 'bg-red-500'
                          : 'bg-blue-500'
                      }`}
                      style={{ 
                        width: `${Math.min(100, projectEstimation.completionPercentage)}%` 
                      }}
                    />
                  </div>
                  {projectEstimation.completedMinutes > projectEstimation.totalEstimatedMinutes && (
                    <p className="text-xs text-red-600 mt-1">
                      Over estimate by {projectEstimation.completedMinutes - projectEstimation.totalEstimatedMinutes} min
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Linked Goals */}
          <Card>
            <CardHeader title="Linked Goals" />
            <CardContent>
              {typedProject.goals && typedProject.goals.length > 0 ? (
                <ul className="space-y-2">
                  {typedProject.goals.map(({ goal }) => (
                    <li key={goal.id}>
                      <Link 
                        href={`/goals/${goal.id}`}
                        className="flex items-center gap-2 p-2 rounded hover:bg-gray-50"
                      >
                        <span>🎯</span>
                        <span className="text-sm text-gray-900">{goal.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">
                  No goals linked to this project.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Archive Confirmation Modal */}
      {showArchiveConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader title="Archive Project?" />
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Archiving this project will also archive all {typedTasks.length} associated tasks.
                You can still view archived projects but won&apos;t be able to add new tasks.
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
                  onClick={() => archiveMutation.mutate({ id: projectId })}
                >
                  Archive Project
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </MainLayout>
  );
}

interface TaskGroupProps {
  title: string;
  icon: string;
  tasks: TaskWithRelations[];
  collapsed?: boolean;
}

function TaskGroup({ title, icon, tasks, collapsed = false }: TaskGroupProps) {
  const [isOpen, setIsOpen] = useState(!collapsed);

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full text-left mb-2"
      >
        <span className="text-gray-400">{isOpen ? '▼' : '▶'}</span>
        <span>{icon}</span>
        <span className="font-medium text-gray-700">{title}</span>
        <span className="text-sm text-gray-400">({tasks.length})</span>
      </button>
      
      {isOpen && (
        <ul className="space-y-1 ml-6">
          {tasks.map((task) => (
            <li key={task.id}>
              <Link 
                href={`/tasks/${task.id}`}
                className="flex items-center gap-2 p-2 rounded hover:bg-gray-50"
              >
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  task.priority === 'P1' ? 'bg-red-100 text-red-700' :
                  task.priority === 'P2' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {task.priority}
                </span>
                <span className={`text-sm flex-1 ${task.status === 'DONE' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                  {task.title}
                </span>
                {/* Estimated Time Badge (Requirements: 20.5) */}
                {task.estimatedMinutes && task.estimatedMinutes > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                    {task.estimatedMinutes}min
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
