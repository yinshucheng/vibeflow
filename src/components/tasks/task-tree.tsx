'use client';

/**
 * TaskTree Component
 *
 * Notion-style collapsible task tree with drag-and-drop reordering.
 * Includes pomodoro start button for each task.
 * Requirements: 2.2, 2.3, 2.4, 2.6, 20.5
 */

import { useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { Icons } from '@/lib/icons';
import { TaskPomodoroButton } from './task-pomodoro-button';
import type { Task, Project, TaskStatus, Priority } from '@prisma/client';

type TaskWithRelations = Task & {
  project?: Project;
  subTasks?: TaskWithRelations[];
  estimatedMinutes?: number | null;
};

interface TaskTreeProps {
  tasks: TaskWithRelations[];
  showProject?: boolean;
  parentId?: string | null;
}

export function TaskTree({ tasks, showProject = false, parentId = null }: TaskTreeProps) {
  // Filter to only show root-level tasks (no parent) or tasks with matching parentId
  const rootTasks = tasks.filter((t) => t.parentId === parentId);

  if (rootTasks.length === 0) {
    return null;
  }

  return (
    <ul className="space-y-0.5">
      {rootTasks.map((task, index) => (
        <TaskTreeItem
          key={task.id}
          task={task}
          allTasks={tasks}
          showProject={showProject}
          index={index}
        />
      ))}
    </ul>
  );
}

interface TaskTreeItemProps {
  task: TaskWithRelations;
  allTasks: TaskWithRelations[];
  showProject: boolean;
  index: number;
  depth?: number;
}

function TaskTreeItem({ task, allTasks, showProject, index, depth = 0 }: TaskTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  const utils = trpc.useUtils();

  const updateStatusMutation = trpc.task.updateStatus.useMutation({
    onSuccess: () => {
      utils.task.getTodayTasks.invalidate();
      utils.task.getBacklog.invalidate();
      utils.task.getByProject.invalidate({ projectId: task.projectId });
    },
  });

  const reorderMutation = trpc.task.reorder.useMutation({
    onSuccess: () => {
      utils.task.getByProject.invalidate({ projectId: task.projectId });
    },
  });

  // Find subtasks
  const subTasks = allTasks.filter((t) => t.parentId === task.id);
  const hasSubTasks = subTasks.length > 0;

  const handleStatusToggle = () => {
    const newStatus: TaskStatus = task.status === 'DONE' ? 'TODO' : 'DONE';
    updateStatusMutation.mutate({
      id: task.id,
      status: newStatus,
      cascadeToSubtasks: hasSubTasks && newStatus === 'DONE',
    });
  };

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    e.dataTransfer.setData('taskId', task.id);
    e.dataTransfer.setData('taskIndex', index.toString());
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const draggedTaskId = e.dataTransfer.getData('taskId');

    if (draggedTaskId && draggedTaskId !== task.id) {
      reorderMutation.mutate({
        taskId: draggedTaskId,
        newIndex: index,
      });
    }
  };

  const priorityColors: Record<Priority, string> = {
    P1: 'bg-notion-accent-red-bg text-notion-accent-red',
    P2: 'bg-notion-accent-orange-bg text-notion-accent-orange',
    P3: 'bg-notion-bg-tertiary text-notion-text-tertiary',
  };

  const ChevronIcon = isExpanded ? Icons.chevronDown : Icons.chevronRight;
  const CheckIcon = Icons.check;
  const ProjectIcon = Icons.projects;
  const MoreIcon = Icons.more;

  return (
    <li>
      <div
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`
          group flex items-center gap-2 p-2 rounded-notion-md transition-colors
          ${isDragging ? 'opacity-50 bg-notion-accent-blue-bg' : 'hover:bg-notion-bg-hover'}
        `}
        style={{ marginLeft: depth * 24 }}
      >
        {/* Expand/Collapse Button */}
        {hasSubTasks ? (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-4 h-4 flex items-center justify-center text-notion-text-tertiary hover:text-notion-text-secondary"
          >
            <ChevronIcon className="w-3.5 h-3.5" />
          </button>
        ) : (
          <span className="w-4" />
        )}

        {/* Status Checkbox */}
        <button
          onClick={handleStatusToggle}
          disabled={updateStatusMutation.isPending}
          className={`
            w-4 h-4 flex items-center justify-center rounded-notion-sm border transition-colors
            ${
              task.status === 'DONE'
                ? 'bg-notion-accent-blue border-notion-accent-blue text-white'
                : 'border-notion-border-strong hover:border-notion-text-tertiary'
            }
            ${updateStatusMutation.isPending ? 'opacity-50' : ''}
          `}
        >
          {task.status === 'DONE' && <CheckIcon className="w-3 h-3" />}
        </button>

        {/* Task Content */}
        <Link href={`/tasks/${task.id}`} className="flex-1 min-w-0 flex items-center gap-2">
          <span
            className={`text-sm ${
              task.status === 'DONE'
                ? 'line-through text-notion-text-tertiary'
                : 'text-notion-text'
            }`}
          >
            {task.title}
          </span>
        </Link>

        {/* Priority Badge */}
        <span className={`text-xs px-1.5 py-0.5 rounded-notion-sm ${priorityColors[task.priority]}`}>
          {task.priority}
        </span>

        {/* Estimated Time Badge (Requirements: 20.5) */}
        {task.estimatedMinutes && task.estimatedMinutes > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded-notion-sm bg-notion-accent-blue-bg text-notion-accent-blue">
            {task.estimatedMinutes}min
          </span>
        )}

        {/* Pomodoro Button (Requirement 2.1, 2.2) */}
        {task.status !== 'DONE' && (
          <TaskPomodoroButton taskId={task.id} taskTitle={task.title} size="sm" />
        )}

        {/* Project Badge (optional) */}
        {showProject && task.project && (
          <Link
            href={`/projects/${task.projectId}`}
            className="inline-flex items-center gap-1 text-xs text-notion-text-tertiary hover:text-notion-text-secondary truncate max-w-[100px]"
          >
            <ProjectIcon className="w-3 h-3" />
            {task.project.title}
          </Link>
        )}

        {/* Drag Handle - visible on hover */}
        <span className="text-notion-text-tertiary opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity">
          <MoreIcon className="w-4 h-4 rotate-90" />
        </span>
      </div>

      {/* Subtasks */}
      {hasSubTasks && isExpanded && (
        <ul className="mt-0.5">
          {subTasks.map((subTask, subIndex) => (
            <TaskTreeItem
              key={subTask.id}
              task={subTask}
              allTasks={allTasks}
              showProject={showProject}
              index={subIndex}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
