'use client';

/**
 * TodayTaskList Component
 *
 * Enhanced today's task list for the Dashboard.
 * Shows all tasks planned for today (including completed) using TaskRow.
 *
 * Sorting logic (frontend):
 * 1. Top 3 tasks pinned at top
 * 2. Incomplete tasks sorted by priority: P1 → P2 → P3
 * 3. Completed tasks at bottom (collapsible, default collapsed)
 *
 * Data sources:
 * - trpc.task.getTodayTasksAll — all today's tasks (incl. DONE)
 * - trpc.dailyState.getToday — top3TaskIds
 */

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardContent, EmptyState } from '@/components/layout';
import { TaskRow } from '@/components/tasks/task-row';
import { Icons } from '@/lib/icons';
import { trpc } from '@/lib/trpc';
import type { TaskWithRelations } from '@/components/tasks/task-row';

const PRIORITY_ORDER: Record<string, number> = { P1: 0, P2: 1, P3: 2 };

interface TodayTaskListProps {
  onTaskSelect?: (taskId: string) => void;
}

export function TodayTaskList({ onTaskSelect }: TodayTaskListProps) {
  const [showCompleted, setShowCompleted] = useState(false);

  const { data: allTasks, isLoading: tasksLoading } =
    trpc.task.getTodayTasksAll.useQuery();
  const { data: dailyState } = trpc.dailyState.getToday.useQuery();

  const top3Ids = useMemo(
    () => new Set(dailyState?.top3TaskIds ?? []),
    [dailyState?.top3TaskIds],
  );

  // Split into root tasks (no parent) for display, keep all for subtask lookup
  const { top3Tasks, incompleteTasks, completedTasks } = useMemo(() => {
    if (!allTasks) return { top3Tasks: [], incompleteTasks: [], completedTasks: [] };

    const tasks = allTasks as TaskWithRelations[];
    // Only show root-level tasks (parentId === null); subtasks render via TaskRow expand
    const rootTasks = tasks.filter((t) => !t.parentId);

    const top3: TaskWithRelations[] = [];
    const incomplete: TaskWithRelations[] = [];
    const completed: TaskWithRelations[] = [];

    for (const task of rootTasks) {
      if (task.status === 'DONE') {
        completed.push(task);
      } else if (top3Ids.has(task.id)) {
        top3.push(task);
      } else {
        incomplete.push(task);
      }
    }

    // Sort Top 3 by priority
    top3.sort(
      (a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2),
    );

    // Sort incomplete by priority
    incomplete.sort(
      (a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2),
    );

    return { top3Tasks: top3, incompleteTasks: incomplete, completedTasks: completed };
  }, [allTasks, top3Ids]);

  const completedCount = completedTasks.length;
  const allTasksFlat = (allTasks as TaskWithRelations[] | undefined) ?? [];

  return (
    <Card>
      <CardHeader
        title="Today's Tasks"
        actions={
          <Link href="/tasks" className="text-sm text-notion-accent-blue hover:underline">
            View all
          </Link>
        }
      />
      <CardContent>
        {tasksLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="animate-pulse h-10 bg-notion-bg-tertiary rounded-notion-md"
              />
            ))}
          </div>
        ) : top3Tasks.length === 0 &&
          incompleteTasks.length === 0 &&
          completedTasks.length === 0 ? (
          <EmptyState
            icon={<Icons.tasks className="w-8 h-8" />}
            title="No Tasks Today"
            description="Plan your day in the Morning Airlock"
          />
        ) : (
          <div className="space-y-1">
            {/* Top 3 section */}
            {top3Tasks.length > 0 && (
              <ul>
                {top3Tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    isTop3
                    showProject
                    onSelect={onTaskSelect}
                    allTasks={allTasksFlat}
                  />
                ))}
              </ul>
            )}

            {/* Divider between Top 3 and other incomplete */}
            {top3Tasks.length > 0 && incompleteTasks.length > 0 && (
              <div className="border-t border-notion-border my-1" />
            )}

            {/* Other incomplete tasks */}
            {incompleteTasks.length > 0 && (
              <ul>
                {incompleteTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    showProject
                    onSelect={onTaskSelect}
                    allTasks={allTasksFlat}
                  />
                ))}
              </ul>
            )}

            {/* Completed section — collapsible */}
            {completedCount > 0 && (
              <>
                <div className="border-t border-notion-border my-1" />
                <button
                  onClick={() => setShowCompleted(!showCompleted)}
                  className="flex items-center gap-1.5 w-full px-2 py-1.5 text-sm text-notion-text-tertiary hover:text-notion-text-secondary transition-colors rounded-notion-md hover:bg-notion-bg-hover"
                >
                  {showCompleted ? (
                    <Icons.chevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <Icons.chevronRight className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {completedCount} completed
                  </span>
                </button>
                {showCompleted && (
                  <ul>
                    {completedTasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        showProject
                        onSelect={onTaskSelect}
                        allTasks={allTasksFlat}
                      />
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
