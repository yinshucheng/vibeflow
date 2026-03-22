'use client';

/**
 * TaskRow Component
 *
 * Global reusable task row — full-width horizontal bar displaying:
 * checkbox + title + priority + project + estimate + planDate + pomodoro button.
 * Supports subtask expand/collapse, Top 3 star, hover actions (Edit/Delete),
 * optimistic checkbox toggle, and inline delete confirmation.
 *
 * Replaces TaskTreeItem in TaskTree for unified display across Dashboard and /tasks.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { Icons } from '@/lib/icons';
import { TaskPomodoroButton } from './task-pomodoro-button';
import type { Task, Project, TaskStatus, Priority } from '@prisma/client';

export type TaskWithRelations = Task & {
  project?: Project;
  subTasks?: TaskWithRelations[];
  estimatedMinutes?: number | null;
};

export interface TaskRowProps {
  task: TaskWithRelations;
  showProject?: boolean;
  showPlanDate?: boolean;
  isTop3?: boolean;
  depth?: number;
  onSelect?: (taskId: string) => void;
  onStatusChange?: () => void;
  onDelete?: () => void;
  /** All tasks in the tree (for finding subtasks by parentId) */
  allTasks?: TaskWithRelations[];
}

const priorityColors: Record<Priority, string> = {
  P1: 'bg-notion-accent-red-bg text-notion-accent-red',
  P2: 'bg-notion-accent-orange-bg text-notion-accent-orange',
  P3: 'bg-notion-bg-tertiary text-notion-text-tertiary',
};

function formatEstimate(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatPlanDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function TaskRow({
  task,
  showProject = false,
  showPlanDate = false,
  isTop3 = false,
  depth = 0,
  onSelect,
  onStatusChange,
  onDelete,
  allTasks,
}: TaskRowProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [optimisticStatus, setOptimisticStatus] = useState<TaskStatus>(task.status);

  const utils = trpc.useUtils();

  // Sync optimistic status when task prop changes
  useEffect(() => {
    setOptimisticStatus(task.status);
  }, [task.status]);

  // Find subtasks
  const subTasks = allTasks ? allTasks.filter((t) => t.parentId === task.id) : [];
  const hasSubTasks = subTasks.length > 0;

  // Status toggle mutation with optimistic update
  const updateStatusMutation = trpc.task.updateStatus.useMutation({
    onSuccess: () => {
      utils.task.getTodayTasks.invalidate();
      utils.task.getTodayTasksAll.invalidate();
      utils.task.getBacklog.invalidate();
      utils.task.getByProject.invalidate({ projectId: task.projectId });
      onStatusChange?.();
    },
    onError: () => {
      // Rollback on failure
      setOptimisticStatus(task.status);
    },
  });

  // Delete mutation
  const deleteMutation = trpc.task.delete.useMutation({
    onSuccess: () => {
      utils.task.getTodayTasks.invalidate();
      utils.task.getTodayTasksAll.invalidate();
      utils.task.getBacklog.invalidate();
      utils.task.getByProject.invalidate({ projectId: task.projectId });
      onDelete?.();
    },
  });

  const handleStatusToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus: TaskStatus = optimisticStatus === 'DONE' ? 'TODO' : 'DONE';
    // Optimistic update
    setOptimisticStatus(newStatus);
    updateStatusMutation.mutate({
      id: task.id,
      status: newStatus,
      cascadeToSubtasks: hasSubTasks && newStatus === 'DONE',
    });
  };

  const handleTitleClick = (e: React.MouseEvent) => {
    if (onSelect) {
      e.preventDefault();
      onSelect(task.id);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirm(true);
  };

  const handleDeleteConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteMutation.mutate({ id: task.id });
    setDeleteConfirm(false);
  };

  const handleDeleteCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirm(false);
  };

  // Auto-reset delete confirm after 2 seconds
  useEffect(() => {
    if (!deleteConfirm) return;
    const timer = setTimeout(() => setDeleteConfirm(false), 2000);
    return () => clearTimeout(timer);
  }, [deleteConfirm]);

  const isDone = optimisticStatus === 'DONE';

  return (
    <li className="list-none">
      <div
        className={`
          group flex items-center gap-2 px-2 py-1.5 rounded-notion-md transition-all duration-200
          hover:bg-notion-bg-hover
          ${isDone ? 'opacity-60' : ''}
        `}
        style={{ paddingLeft: depth * 24 + 8 }}
      >
        {/* Top 3 Star */}
        {isTop3 && (
          <Icons.star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500 shrink-0" />
        )}

        {/* Expand/Collapse Button */}
        {hasSubTasks ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="w-4 h-4 flex items-center justify-center text-notion-text-tertiary hover:text-notion-text-secondary shrink-0"
          >
            {isExpanded ? (
              <Icons.chevronDown className="w-3.5 h-3.5" />
            ) : (
              <Icons.chevronRight className="w-3.5 h-3.5" />
            )}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {/* Status Checkbox */}
        <button
          onClick={handleStatusToggle}
          disabled={updateStatusMutation.isPending}
          className={`
            w-4 h-4 flex items-center justify-center rounded-notion-sm border transition-colors shrink-0
            ${
              isDone
                ? 'bg-notion-accent-blue border-notion-accent-blue text-white'
                : 'border-notion-border-strong hover:border-notion-text-tertiary'
            }
            ${updateStatusMutation.isPending ? 'opacity-50' : ''}
          `}
        >
          {isDone && <Icons.check className="w-3 h-3" />}
        </button>

        {/* Task Title — clickable area for onSelect */}
        {onSelect ? (
          <button
            onClick={handleTitleClick}
            className="flex-1 min-w-0 text-left"
          >
            <span
              className={`text-sm truncate ${
                isDone
                  ? 'line-through text-notion-text-tertiary'
                  : 'text-notion-text hover:text-notion-accent-blue'
              }`}
            >
              {task.title}
            </span>
          </button>
        ) : (
          <Link href={`/tasks/${task.id}`} className="flex-1 min-w-0">
            <span
              className={`text-sm truncate ${
                isDone
                  ? 'line-through text-notion-text-tertiary'
                  : 'text-notion-text'
              }`}
            >
              {task.title}
            </span>
          </Link>
        )}

        {/* Priority Badge */}
        <span
          className={`text-xs px-1.5 py-0.5 rounded-notion-sm shrink-0 ${priorityColors[task.priority]}`}
        >
          {task.priority}
        </span>

        {/* Project Badge */}
        {showProject && task.project && (
          <Link
            href={`/projects/${task.projectId}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-notion-text-tertiary hover:text-notion-text-secondary truncate max-w-[100px] shrink-0"
          >
            <Icons.projects className="w-3 h-3" />
            {task.project.title}
          </Link>
        )}

        {/* Estimated Time */}
        {task.estimatedMinutes && task.estimatedMinutes > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded-notion-sm bg-notion-accent-blue-bg text-notion-accent-blue shrink-0 hidden sm:inline-flex items-center gap-0.5">
            <Icons.clock className="w-3 h-3" />
            {formatEstimate(task.estimatedMinutes)}
          </span>
        )}

        {/* Plan Date */}
        {showPlanDate && task.planDate && (
          <span className="text-xs text-notion-text-tertiary shrink-0 hidden sm:inline">
            {formatPlanDate(task.planDate)}
          </span>
        )}

        {/* Pomodoro Button */}
        {!isDone && (
          <TaskPomodoroButton taskId={task.id} taskTitle={task.title} size="sm" />
        )}

        {/* Hover Actions: Edit + Delete */}
        {deleteConfirm ? (
          <span className="inline-flex items-center gap-1 text-xs shrink-0">
            <span className="text-notion-text-secondary">确认？</span>
            <button
              onClick={handleDeleteConfirm}
              className="text-notion-accent-red hover:underline font-medium"
            >
              是
            </button>
            <button
              onClick={handleDeleteCancel}
              className="text-notion-text-tertiary hover:underline"
            >
              否
            </button>
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <Link
              href={`/tasks/${task.id}/edit`}
              onClick={(e) => e.stopPropagation()}
              className="p-1 text-notion-text-tertiary hover:text-notion-text-secondary rounded-notion-sm hover:bg-notion-bg-tertiary"
              title="Edit"
            >
              <Icons.edit className="w-3.5 h-3.5" />
            </Link>
            <button
              onClick={handleDeleteClick}
              className="p-1 text-notion-text-tertiary hover:text-notion-accent-red rounded-notion-sm hover:bg-notion-accent-red-bg"
              title="Delete"
            >
              <Icons.trash className="w-3.5 h-3.5" />
            </button>
          </span>
        )}
      </div>

      {/* Subtasks */}
      {hasSubTasks && isExpanded && (
        <ul className="mt-0.5">
          {subTasks.map((subTask) => (
            <TaskRow
              key={subTask.id}
              task={subTask}
              allTasks={allTasks}
              showProject={showProject}
              showPlanDate={showPlanDate}
              depth={depth + 1}
              onSelect={onSelect}
              onStatusChange={onStatusChange}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
