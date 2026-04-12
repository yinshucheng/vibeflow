'use client';

/**
 * TodayTaskList Component
 *
 * Enhanced today's task list for the Dashboard.
 * Shows overdue tasks at the top, then today's tasks (including completed) using TaskRow.
 *
 * Sorting logic (frontend):
 * 1. Overdue tasks pinned at top (sorted by planDate ascending — oldest first)
 * 2. Top 3 tasks
 * 3. Incomplete tasks sorted by priority: P1 → P2 → P3
 * 4. Completed tasks at bottom (collapsible, default collapsed)
 *
 * Data sources:
 * - trpc.task.getTodayTasksAll — all today's tasks (incl. DONE)
 * - trpc.task.getOverdue — tasks with planDate < today, not DONE
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
  const [showAllOverdue, setShowAllOverdue] = useState(false);

  const { data: allTasks, isLoading: tasksLoading } =
    trpc.task.getTodayTasksAll.useQuery();
  const { data: overdueTasks, isLoading: overdueLoading } =
    trpc.task.getOverdue.useQuery();
  const { data: dailyState } = trpc.dailyState.getToday.useQuery();

  const top3Ids = useMemo(
    () => new Set(dailyState?.top3TaskIds ?? []),
    [dailyState?.top3TaskIds],
  );

  // Merge today + overdue, dedup by id
  const allTasksFlat = useMemo(() => {
    const todayArr = (allTasks as TaskWithRelations[] | undefined) ?? [];
    const overdueArr = (overdueTasks as TaskWithRelations[] | undefined) ?? [];
    const map = new Map<string, TaskWithRelations>();
    for (const t of todayArr) map.set(t.id, t);
    for (const t of overdueArr) map.set(t.id, t);
    return Array.from(map.values());
  }, [allTasks, overdueTasks]);

  // Split into sections
  const { overdueSectionTasks, top3Tasks, incompleteTasks, completedTasks } = useMemo(() => {
    if (!allTasks) return { overdueSectionTasks: [], top3Tasks: [], incompleteTasks: [], completedTasks: [] };

    const todayTasks = allTasks as TaskWithRelations[];
    const todayIds = new Set(todayTasks.map((t) => t.id));
    const overdueArr = (overdueTasks as TaskWithRelations[] | undefined) ?? [];

    // Overdue = from overdue query, root tasks only, exclude any that are also in today
    const overdue: TaskWithRelations[] = overdueArr
      .filter((t) => !t.parentId && !todayIds.has(t.id))
      .sort((a, b) => {
        // Oldest first (ascending planDate)
        const da = a.planDate ? new Date(a.planDate).getTime() : 0;
        const db = b.planDate ? new Date(b.planDate).getTime() : 0;
        return da - db;
      });

    // Today's root tasks split into top3 / incomplete / completed
    const rootTasks = todayTasks.filter((t) => !t.parentId);

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

    top3.sort(
      (a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2),
    );
    incomplete.sort(
      (a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2),
    );

    return { overdueSectionTasks: overdue, top3Tasks: top3, incompleteTasks: incomplete, completedTasks: completed };
  }, [allTasks, overdueTasks, top3Ids]);

  const completedCount = completedTasks.length;
  const isLoading = tasksLoading || overdueLoading;

  const isEmpty =
    overdueSectionTasks.length === 0 &&
    top3Tasks.length === 0 &&
    incompleteTasks.length === 0 &&
    completedTasks.length === 0;

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
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="animate-pulse h-10 bg-notion-bg-tertiary rounded-notion-md"
              />
            ))}
          </div>
        ) : isEmpty ? (
          <EmptyState
            icon={<Icons.tasks className="w-8 h-8" />}
            title="No Tasks Today"
            description="Add tasks or use daily planning to get started"
          />
        ) : (
          <div className="space-y-1">
            {/* Overdue section — collapses to 3 items when many */}
            {overdueSectionTasks.length > 0 && (() => {
              const OVERDUE_PREVIEW = 3;
              const needsCollapse = overdueSectionTasks.length > OVERDUE_PREVIEW;
              const visibleOverdue = needsCollapse && !showAllOverdue
                ? overdueSectionTasks.slice(0, OVERDUE_PREVIEW)
                : overdueSectionTasks;

              return (
                <>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500">
                    <Icons.alertTriangle className="w-3.5 h-3.5" />
                    <span>Overdue ({overdueSectionTasks.length})</span>
                  </div>
                  <ul>
                    {visibleOverdue.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        showProject
                        showPlanDate
                        onSelect={onTaskSelect}
                        allTasks={allTasksFlat}
                      />
                    ))}
                  </ul>
                  {needsCollapse && (
                    <button
                      onClick={() => setShowAllOverdue(!showAllOverdue)}
                      className="flex items-center gap-1 w-full px-3 py-1 text-xs text-red-500 hover:text-red-600 transition-colors"
                    >
                      {showAllOverdue ? (
                        <>
                          <Icons.chevronUp className="w-3 h-3" />
                          <span>Show less</span>
                        </>
                      ) : (
                        <>
                          <Icons.chevronDown className="w-3 h-3" />
                          <span>Show all {overdueSectionTasks.length} overdue</span>
                        </>
                      )}
                    </button>
                  )}
                  <div className="border-t border-notion-border my-1" />
                </>
              );
            })()}

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
