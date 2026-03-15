'use client';

/**
 * TaskTree Component
 *
 * Notion-style collapsible task tree.
 * Uses TaskRow for individual task rendering — unified across Dashboard and /tasks.
 * Requirements: 2.2, 2.3, 2.4, 2.6, 20.5
 */

import { TaskRow } from './task-row';
import type { TaskWithRelations } from './task-row';
import type { Task, Project } from '@prisma/client';

// Re-export for backward compatibility
export type { TaskWithRelations };

interface TaskTreeProps {
  tasks: TaskWithRelations[];
  showProject?: boolean;
  showPlanDate?: boolean;
  parentId?: string | null;
  onTaskSelect?: (taskId: string) => void;
}

export function TaskTree({
  tasks,
  showProject = false,
  showPlanDate = false,
  parentId = null,
  onTaskSelect,
}: TaskTreeProps) {
  // Filter to only show root-level tasks (no parent) or tasks with matching parentId
  const rootTasks = tasks.filter((t) => t.parentId === parentId);

  if (rootTasks.length === 0) {
    return null;
  }

  return (
    <ul className="space-y-0.5">
      {rootTasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          allTasks={tasks}
          showProject={showProject}
          showPlanDate={showPlanDate}
          onSelect={onTaskSelect}
        />
      ))}
    </ul>
  );
}
