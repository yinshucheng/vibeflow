'use client';

/**
 * TaskDetailPanel Component
 *
 * Right-side slide-out panel showing task details when a task row is clicked.
 * Follows ChatPanel pattern for slide-in/out animation and backdrop.
 *
 * Features:
 * - Status toggle buttons (TODO / IN_PROGRESS / DONE)
 * - Priority & project display
 * - Time tracking with progress bar
 * - Subtask list (compact TaskRow)
 * - Edit (navigate) & Delete (confirm modal) actions
 * - Esc to close, backdrop click to close
 * - Slide animation (translate-x)
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { Icons } from '@/lib/icons';
import { Button } from '@/components/ui';
import { Card, CardHeader, CardContent } from '@/components/layout';
import { TaskTree } from './task-tree';
import type { Task, TaskStatus, Priority, Project } from '@prisma/client';

type TaskWithRelations = Task & {
  project: Project;
  subTasks?: Task[];
  parent?: Task | null;
  estimatedMinutes?: number | null;
};

export interface TaskDetailPanelProps {
  taskId: string | null;
  onClose: () => void;
}

const priorityConfig: Record<Priority, { label: string; color: string }> = {
  P1: { label: 'P1 High', color: 'bg-notion-accent-red-bg text-notion-accent-red' },
  P2: { label: 'P2 Medium', color: 'bg-notion-accent-orange-bg text-notion-accent-orange' },
  P3: { label: 'P3 Low', color: 'bg-notion-bg-tertiary text-notion-text-tertiary' },
};

const statusConfig: Record<TaskStatus, { label: string; color: string; activeColor: string }> = {
  TODO: {
    label: 'To Do',
    color: 'bg-notion-bg-tertiary text-notion-text-secondary',
    activeColor: 'bg-notion-text text-white',
  },
  IN_PROGRESS: {
    label: 'In Progress',
    color: 'bg-notion-bg-tertiary text-notion-text-secondary',
    activeColor: 'bg-notion-accent-blue text-white',
  },
  DONE: {
    label: 'Done',
    color: 'bg-notion-bg-tertiary text-notion-text-secondary',
    activeColor: 'bg-notion-accent-green text-white',
  },
};

export function TaskDetailPanel({ taskId, onClose }: TaskDetailPanelProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Fetch task details
  const { data: task, isLoading: taskLoading } = trpc.task.getById.useQuery(
    { id: taskId! },
    { enabled: !!taskId }
  ) as { data: TaskWithRelations | undefined; isLoading: boolean };

  // Get user settings for pomodoro duration
  const { data: settings } = trpc.settings.get.useQuery();
  const pomodoroDuration = settings?.pomodoroDuration ?? 25;

  // Get task estimation details
  const { data: taskEstimation } = trpc.task.getTaskWithEstimation.useQuery(
    { id: taskId!, pomodoroDuration },
    { enabled: !!taskId }
  );

  // Get tasks from same project for subtask display
  const { data: siblingTasks } = trpc.task.getByProject.useQuery(
    { projectId: task?.projectId ?? '' },
    { enabled: !!task?.projectId }
  );

  const utils = trpc.useUtils();

  // Status update mutation
  const updateStatusMutation = trpc.task.updateStatus.useMutation({
    onSuccess: () => {
      utils.task.getById.invalidate({ id: taskId! });
      utils.task.getTaskWithEstimation.invalidate({ id: taskId! });
      utils.task.getTodayTasks.invalidate();
      utils.task.getTodayTasksAll.invalidate();
      utils.task.getBacklog.invalidate();
      if (task?.projectId) {
        utils.task.getByProject.invalidate({ projectId: task.projectId });
      }
    },
  });

  // Delete mutation
  const deleteMutation = trpc.task.delete.useMutation({
    onSuccess: () => {
      utils.task.getTodayTasks.invalidate();
      utils.task.getTodayTasksAll.invalidate();
      utils.task.getBacklog.invalidate();
      if (task?.projectId) {
        utils.task.getByProject.invalidate({ projectId: task.projectId });
      }
      handleClose();
    },
  });

  // Animated close
  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      setShowDeleteConfirm(false);
      onClose();
    }, 200);
  }, [onClose]);

  // Esc key handler
  useEffect(() => {
    if (!taskId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [taskId, handleClose]);

  // Reset delete confirm when switching tasks
  useEffect(() => {
    setShowDeleteConfirm(false);
  }, [taskId]);

  if (!taskId) return null;

  const subTasks = (siblingTasks ?? []).filter((t: Task) => t.parentId === taskId) as TaskWithRelations[];

  const handleStatusChange = (newStatus: TaskStatus) => {
    updateStatusMutation.mutate({
      id: taskId,
      status: newStatus,
      cascadeToSubtasks: subTasks.length > 0 && newStatus === 'DONE',
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/10 transition-opacity duration-200 ${
          isClosing ? 'opacity-0' : 'opacity-100'
        }`}
        onClick={handleClose}
        data-testid="task-detail-backdrop"
      />

      {/* Panel */}
      <div
        className={`fixed bottom-0 right-0 top-0 z-50 flex w-96 max-w-[90vw] flex-col border-l border-notion-border bg-notion-bg shadow-notion-lg transition-transform ${
          isClosing
            ? 'translate-x-full duration-200 ease-in'
            : 'translate-x-0 duration-300 ease-out'
        }`}
        data-testid="task-detail-panel"
      >
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-notion-border px-4">
          <h2 className="text-sm font-semibold text-notion-text truncate">Task Details</h2>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-notion-sm text-notion-text-secondary hover:bg-notion-bg-hover hover:text-notion-text"
            onClick={handleClose}
            aria-label="Close"
            data-testid="task-detail-close"
          >
            <Icons.close className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {taskLoading ? (
            <div className="p-4 space-y-4">
              <div className="animate-pulse h-6 bg-notion-bg-tertiary rounded w-3/4" />
              <div className="animate-pulse h-8 bg-notion-bg-tertiary rounded w-full" />
              <div className="animate-pulse h-20 bg-notion-bg-tertiary rounded w-full" />
            </div>
          ) : task ? (
            <div className="p-4 space-y-5">
              {/* Title */}
              <h3
                className={`text-lg font-semibold ${
                  task.status === 'DONE'
                    ? 'line-through text-notion-text-tertiary'
                    : 'text-notion-text'
                }`}
              >
                {task.title}
              </h3>

              {/* Status Buttons */}
              <div>
                <label className="text-xs font-medium text-notion-text-tertiary uppercase tracking-wider mb-2 block">
                  Status
                </label>
                <div className="flex gap-1.5">
                  {(['TODO', 'IN_PROGRESS', 'DONE'] as TaskStatus[]).map((status) => (
                    <button
                      key={status}
                      onClick={() => handleStatusChange(status)}
                      disabled={updateStatusMutation.isPending}
                      className={`px-3 py-1.5 rounded-notion-md text-xs font-medium transition-colors ${
                        task.status === status
                          ? statusConfig[status].activeColor
                          : statusConfig[status].color + ' hover:bg-notion-bg-hover'
                      } ${updateStatusMutation.isPending ? 'opacity-50' : ''}`}
                    >
                      {statusConfig[status].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Priority */}
              <div>
                <label className="text-xs font-medium text-notion-text-tertiary uppercase tracking-wider mb-1 block">
                  Priority
                </label>
                <span
                  className={`inline-flex text-xs px-2 py-1 rounded-notion-sm font-medium ${
                    priorityConfig[task.priority].color
                  }`}
                >
                  {priorityConfig[task.priority].label}
                </span>
              </div>

              {/* Project */}
              {task.project && (
                <div>
                  <label className="text-xs font-medium text-notion-text-tertiary uppercase tracking-wider mb-1 block">
                    Project
                  </label>
                  <Link
                    href={`/projects/${task.projectId}`}
                    className="inline-flex items-center gap-1.5 text-sm text-notion-accent-blue hover:underline"
                  >
                    <Icons.projects className="w-3.5 h-3.5" />
                    {task.project.title}
                  </Link>
                </div>
              )}

              {/* Plan Date */}
              {task.planDate && (
                <div>
                  <label className="text-xs font-medium text-notion-text-tertiary uppercase tracking-wider mb-1 block">
                    Plan Date
                  </label>
                  <span className="inline-flex items-center gap-1.5 text-sm text-notion-text">
                    <Icons.timeline className="w-3.5 h-3.5 text-notion-text-tertiary" />
                    {new Date(task.planDate).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              )}

              {/* Divider */}
              <div className="border-t border-notion-border" />

              {/* Time Tracking */}
              <div>
                <label className="text-xs font-medium text-notion-text-tertiary uppercase tracking-wider mb-2 block">
                  Time Tracking
                </label>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-notion-text-secondary">Estimated</span>
                    <span className="text-notion-text">
                      {taskEstimation?.estimatedMinutes
                        ? `${taskEstimation.estimatedMinutes} min (${taskEstimation.estimatedPomodoros} 🍅)`
                        : 'Not set'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-notion-text-secondary">Actual</span>
                    <span className="text-notion-text">
                      {taskEstimation?.actualMinutes
                        ? `${taskEstimation.actualMinutes} min (${taskEstimation.actualPomodoros} 🍅)`
                        : '0 min'}
                    </span>
                  </div>
                  {/* Progress Bar */}
                  {taskEstimation?.estimatedMinutes && taskEstimation.estimatedMinutes > 0 && (
                    <div className="pt-1">
                      <div className="flex justify-between text-xs text-notion-text-tertiary mb-1">
                        <span>Progress</span>
                        <span>
                          {Math.min(
                            100,
                            Math.round(
                              (taskEstimation.actualMinutes / taskEstimation.estimatedMinutes) * 100
                            )
                          )}
                          %
                        </span>
                      </div>
                      <div className="w-full bg-notion-bg-tertiary rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            taskEstimation.actualMinutes > taskEstimation.estimatedMinutes
                              ? 'bg-notion-accent-red'
                              : 'bg-notion-accent-blue'
                          }`}
                          style={{
                            width: `${Math.min(
                              100,
                              (taskEstimation.actualMinutes / taskEstimation.estimatedMinutes) * 100
                            )}%`,
                          }}
                        />
                      </div>
                      {taskEstimation.actualMinutes > taskEstimation.estimatedMinutes && (
                        <p className="text-xs text-notion-accent-red mt-1">
                          Over estimate by{' '}
                          {taskEstimation.actualMinutes - taskEstimation.estimatedMinutes} min
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-notion-border" />

              {/* Subtasks */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-notion-text-tertiary uppercase tracking-wider">
                    Subtasks
                    {subTasks.length > 0 && (
                      <span className="ml-1 text-notion-text-tertiary">
                        ({subTasks.filter((t) => t.status === 'DONE').length}/{subTasks.length})
                      </span>
                    )}
                  </label>
                  <Link
                    href={`/tasks/new?projectId=${task.projectId}&parentId=${taskId}`}
                    className="text-xs text-notion-accent-blue hover:underline"
                  >
                    + Add
                  </Link>
                </div>
                {subTasks.length > 0 ? (
                  <TaskTree tasks={subTasks} />
                ) : (
                  <p className="text-xs text-notion-text-tertiary py-2">No subtasks</p>
                )}
              </div>

              {/* Divider */}
              <div className="border-t border-notion-border" />

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Link href={`/tasks/${taskId}/edit`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full">
                    <Icons.edit className="w-3.5 h-3.5" />
                    Edit
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-notion-accent-red hover:bg-notion-accent-red-bg"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Icons.trash className="w-3.5 h-3.5" />
                  Delete
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-sm text-notion-text-tertiary">
              Task not found
            </div>
          )}
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 rounded-l-lg">
            <div className="bg-notion-bg border border-notion-border rounded-notion-lg shadow-notion-lg p-4 mx-4 w-full max-w-xs">
              <h4 className="font-medium text-notion-text mb-2">Delete Task?</h4>
              <p className="text-sm text-notion-text-secondary mb-4">
                {subTasks.length > 0
                  ? `This will also delete ${subTasks.length} subtask(s). This action cannot be undone.`
                  : 'This action cannot be undone.'}
              </p>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  isLoading={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate({ id: taskId! })}
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
