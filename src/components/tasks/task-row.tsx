'use client';

/**
 * TaskRow Component
 *
 * Global reusable task row — full-width horizontal bar displaying:
 * round checkbox (priority-colored) + title + project + estimate + planDate + pomodoro button.
 * Supports subtask expand/collapse with progress count, Top 3 star, hover actions (Edit/Delete),
 * optimistic checkbox toggle, and inline delete confirmation.
 *
 * Design: Things 3 inspired — round checkbox, breathing row height, color-dot priority.
 */

import { useState, useEffect, useMemo } from 'react';
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

/** Priority → checkbox border/fill color */
const priorityCheckboxColors: Record<Priority, { border: string; fill: string }> = {
  P1: { border: 'border-red-400', fill: 'bg-red-400' },
  P2: { border: 'border-amber-400', fill: 'bg-amber-400' },
  P3: { border: 'border-notion-border-strong', fill: 'bg-notion-text-tertiary' },
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

function isOverdue(date: Date | string | null): boolean {
  if (!date) return false;
  const d = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d < today;
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
  const subTasks = useMemo(
    () => (allTasks ? allTasks.filter((t) => t.parentId === task.id) : []),
    [allTasks, task.id],
  );
  const hasSubTasks = subTasks.length > 0;

  // Subtask progress count
  const subtaskProgress = useMemo(() => {
    if (!hasSubTasks) return null;
    const total = subTasks.length;
    const done = subTasks.filter((t) => t.status === 'DONE').length;
    return { done, total };
  }, [subTasks, hasSubTasks]);

  // Status toggle mutation with optimistic update
  const updateStatusMutation = trpc.task.updateStatus.useMutation({
    onSuccess: () => {
      utils.task.getTodayTasks.invalidate();
      utils.task.getTodayTasksAll.invalidate();
      utils.task.getBacklog.invalidate();
      utils.task.getOverdue.invalidate();
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
      utils.task.getOverdue.invalidate();
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
  const colors = priorityCheckboxColors[task.priority];
  const isRoot = depth === 0;
  const overdue = isOverdue(task.planDate);

  return (
    <li className="list-none">
      <div
        className={`
          group flex items-center gap-2.5 px-3 py-2.5 rounded-notion-md transition-all duration-200
          hover:bg-notion-bg-hover
          ${isDone ? 'opacity-50' : ''}
        `}
        style={{ paddingLeft: depth * 28 + 12 }}
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

        {/* Round Checkbox with Priority Color */}
        <button
          onClick={handleStatusToggle}
          disabled={updateStatusMutation.isPending}
          title={`Priority: ${task.priority}`}
          className={`
            w-[18px] h-[18px] flex items-center justify-center rounded-full border-[1.5px] transition-all shrink-0
            hover:scale-110
            ${
              isDone
                ? `${colors.fill} border-transparent text-white`
                : `${colors.border} hover:opacity-80`
            }
            ${updateStatusMutation.isPending ? 'opacity-50' : ''}
          `}
        >
          {isDone && <Icons.check className="w-3 h-3" />}
        </button>

        {/* Task Title */}
        {onSelect ? (
          <button
            onClick={handleTitleClick}
            className="flex-1 min-w-0 text-left overflow-hidden"
          >
            <span
              className={`block truncate ${
                isDone
                  ? 'line-through text-notion-text-tertiary'
                  : isRoot
                    ? 'text-[15px] leading-snug font-medium text-notion-text hover:text-notion-accent-blue'
                    : 'text-sm text-notion-text hover:text-notion-accent-blue'
              }`}
            >
              {task.title}
            </span>
          </button>
        ) : (
          <Link href={`/tasks/${task.id}`} className="flex-1 min-w-0 overflow-hidden">
            <span
              className={`block truncate ${
                isDone
                  ? 'line-through text-notion-text-tertiary'
                  : isRoot
                    ? 'text-[15px] leading-snug font-medium text-notion-text'
                    : 'text-sm text-notion-text'
              }`}
            >
              {task.title}
            </span>
          </Link>
        )}

        {/* Subtask Progress Count */}
        {subtaskProgress && (
          <span className="text-xs text-notion-text-tertiary tabular-nums shrink-0">
            {subtaskProgress.done}/{subtaskProgress.total}
          </span>
        )}

        {/* Project Badge */}
        {showProject && task.project && (
          <Link
            href={`/projects/${task.projectId}`}
            onClick={(e) => e.stopPropagation()}
            className="text-[11px] text-notion-text-tertiary opacity-70 hover:text-notion-text-secondary truncate max-w-[100px] shrink-0"
          >
            {task.project.title}
          </Link>
        )}

        {/* Estimated Time */}
        {task.estimatedMinutes && task.estimatedMinutes > 0 && (
          <span className="text-xs text-notion-text-tertiary shrink-0 whitespace-nowrap hidden sm:inline-flex items-center gap-0.5">
            <Icons.clock className="w-3 h-3" />
            {formatEstimate(task.estimatedMinutes)}
          </span>
        )}

        {/* Plan Date */}
        {showPlanDate && task.planDate && (
          <span
            className={`text-xs shrink-0 hidden sm:inline ${
              overdue
                ? 'text-red-500 font-medium'
                : 'text-notion-text-tertiary'
            }`}
          >
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
          <span className="inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <Link
              href={`/tasks/${task.id}/edit`}
              onClick={(e) => e.stopPropagation()}
              className="p-1 text-notion-text-tertiary hover:text-notion-text-secondary rounded-notion-sm hover:bg-notion-bg-tertiary"
              title="Edit"
            >
              <Icons.edit className="w-4 h-4" />
            </Link>
            <button
              onClick={handleDeleteClick}
              className="p-1 text-notion-text-tertiary hover:text-notion-accent-red rounded-notion-sm hover:bg-notion-accent-red-bg"
              title="Delete"
            >
              <Icons.trash className="w-4 h-4" />
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
