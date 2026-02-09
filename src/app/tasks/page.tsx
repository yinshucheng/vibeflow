'use client';

/**
 * Tasks Page
 *
 * Notion-style task management with filtering.
 * Shows current running pomodoro session.
 * Requirements: 2.3, 2.4, 2.5, 2.6
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MainLayout,
  PageHeader,
  Card,
  CardHeader,
  CardContent,
  EmptyState,
} from '@/components/layout';
import { Button } from '@/components/ui';
import { TaskTree } from '@/components/tasks/task-tree';
import { Icons } from '@/lib/icons';
import { trpc } from '@/lib/trpc';
import { calculateRemainingSeconds } from '@/lib/pomodoro-cache';
import type { Task, Project } from '@prisma/client';

type TaskFilter = 'today' | 'overdue' | 'backlog';

type TaskWithProject = Task & {
  project: Project;
  subTasks?: Task[];
};

export default function TasksPage() {
  const [filter, setFilter] = useState<TaskFilter>('today');

  const { data: todayTasks, isLoading: todayLoading } = trpc.task.getTodayTasks.useQuery();
  const { data: overdueTasks, isLoading: overdueLoading } = trpc.task.getOverdue.useQuery();
  const { data: backlogTasks, isLoading: backlogLoading } = trpc.task.getBacklog.useQuery();
  const { data: projects } = trpc.project.list.useQuery();
  const { data: currentPomodoro } = trpc.pomodoro.getCurrent.useQuery();

  const isLoading =
    filter === 'today' ? todayLoading : filter === 'overdue' ? overdueLoading : backlogLoading;
  const tasks =
    filter === 'today'
      ? (todayTasks as TaskWithProject[] | undefined)
      : filter === 'overdue'
        ? (overdueTasks as TaskWithProject[] | undefined)
        : (backlogTasks as TaskWithProject[] | undefined);

  const PlusIcon = Icons.plus;
  const CalendarIcon = Icons.timeline;
  const AlertIcon = Icons.alert;
  const TaskIcon = Icons.tasks;

  return (
    <MainLayout title="Tasks">
      <PageHeader
        title="Tasks"
        description="Manage your tasks across all projects"
        actions={
          <Link href="/tasks/new">
            <Button>
              <PlusIcon className="w-4 h-4" />
              New Task
            </Button>
          </Link>
        }
      />

      {/* Current Pomodoro Session (Requirement 2.4, 2.5) */}
      {currentPomodoro && <CurrentPomodoroCard pomodoro={currentPomodoro} />}

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFilter('today')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-notion-md text-sm font-medium transition-colors ${
            filter === 'today'
              ? 'bg-notion-accent-blue-bg text-notion-accent-blue'
              : 'bg-notion-bg-tertiary text-notion-text-secondary hover:bg-notion-bg-hover'
          }`}
        >
          <CalendarIcon className="w-3.5 h-3.5" />
          Today ({todayTasks?.length ?? 0})
        </button>
        {(overdueTasks?.length ?? 0) > 0 && (
          <button
            onClick={() => setFilter('overdue')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-notion-md text-sm font-medium transition-colors ${
              filter === 'overdue'
                ? 'bg-notion-accent-red-bg text-notion-accent-red'
                : 'bg-notion-accent-red-bg/50 text-notion-accent-red hover:bg-notion-accent-red-bg'
            }`}
          >
            <AlertIcon className="w-3.5 h-3.5" />
            Overdue ({overdueTasks?.length ?? 0})
          </button>
        )}
        <button
          onClick={() => setFilter('backlog')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-notion-md text-sm font-medium transition-colors ${
            filter === 'backlog'
              ? 'bg-notion-accent-blue-bg text-notion-accent-blue'
              : 'bg-notion-bg-tertiary text-notion-text-secondary hover:bg-notion-bg-hover'
          }`}
        >
          <TaskIcon className="w-3.5 h-3.5" />
          Backlog ({backlogTasks?.length ?? 0})
        </button>
      </div>

      {/* Tasks List */}
      <Card>
        <CardHeader
          title={
            filter === 'today'
              ? "Today's Tasks"
              : filter === 'overdue'
                ? 'Overdue Tasks'
                : 'Backlog'
          }
          description={
            filter === 'today'
              ? 'Tasks planned for today'
              : filter === 'overdue'
                ? 'Tasks from past dates that need attention'
                : 'Tasks without a plan date'
          }
        />
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="animate-pulse h-12 bg-notion-bg-tertiary rounded-notion-md"
                />
              ))}
            </div>
          ) : tasks && tasks.length > 0 ? (
            <TaskTree tasks={tasks} showProject />
          ) : (
            <EmptyState
              icon={
                filter === 'today' ? (
                  <CalendarIcon className="w-8 h-8" />
                ) : filter === 'overdue' ? (
                  <Icons.check className="w-8 h-8" />
                ) : (
                  <TaskIcon className="w-8 h-8" />
                )
              }
              title={
                filter === 'today'
                  ? 'No Tasks Today'
                  : filter === 'overdue'
                    ? 'No Overdue Tasks'
                    : 'Backlog Empty'
              }
              description={
                filter === 'today'
                  ? 'Plan your day in the Morning Airlock or add tasks manually'
                  : filter === 'overdue'
                    ? 'Great job! All past tasks are completed'
                    : 'All tasks have been scheduled'
              }
              action={
                <Link href="/tasks/new">
                  <Button size="sm">Add Task</Button>
                </Link>
              }
            />
          )}
        </CardContent>
      </Card>

      {/* Tasks by Project */}
      {projects && projects.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-notion-text mb-4">Tasks by Project</h2>
          <div className="space-y-4">
            {projects
              .filter((p: Project) => p.status === 'ACTIVE')
              .map((project: Project) => (
                <ProjectTasksCard key={project.id} project={project} />
              ))}
          </div>
        </div>
      )}
    </MainLayout>
  );
}

interface ProjectTasksCardProps {
  project: Project;
}

function ProjectTasksCard({ project }: ProjectTasksCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { data: tasks } = trpc.task.getByProject.useQuery(
    { projectId: project.id },
    { enabled: isExpanded }
  );

  const typedTasks = (tasks ?? []) as TaskWithProject[];
  const ChevronIcon = isExpanded ? Icons.chevronDown : Icons.chevronRight;

  return (
    <Card>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-notion-bg-hover transition-colors"
      >
        <div className="flex items-center gap-2">
          <ChevronIcon className="w-4 h-4 text-notion-text-tertiary" />
          <span className="font-medium text-notion-text">{project.title}</span>
        </div>
        <Link
          href={`/tasks/new?projectId=${project.id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-sm text-notion-accent-blue hover:underline"
        >
          + Add
        </Link>
      </button>

      {isExpanded && (
        <CardContent className="pt-0">
          {typedTasks.length > 0 ? (
            <TaskTree tasks={typedTasks} />
          ) : (
            <p className="text-sm text-notion-text-tertiary py-2">No tasks in this project</p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

/**
 * CurrentPomodoroCard Component
 *
 * Displays the current running pomodoro session with timer.
 * Requirements: 2.4, 2.5
 */
interface CurrentPomodoroCardProps {
  pomodoro: {
    id: string;
    taskId: string | null;
    duration: number;
    startTime: Date;
    task: {
      id: string;
      title: string;
      projectId: string;
    } | null;
  };
}

function CurrentPomodoroCard({ pomodoro }: CurrentPomodoroCardProps) {
  const router = useRouter();
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const utils = trpc.useUtils();

  // Calculate remaining time
  useEffect(() => {
    const remaining = calculateRemainingSeconds(pomodoro.startTime, pomodoro.duration);
    setTimeRemaining(remaining);
  }, [pomodoro.startTime, pomodoro.duration]);

  // Countdown timer
  useEffect(() => {
    if (timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          utils.pomodoro.getCurrent.invalidate();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timeRemaining, utils]);

  // Format time as MM:SS
  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Calculate progress percentage
  const totalSeconds = pomodoro.duration * 60;
  const progress = ((totalSeconds - timeRemaining) / totalSeconds) * 100;

  const TimerIcon = Icons.pomodoro;

  return (
    <Card className="mb-6 border-notion-accent-green bg-notion-accent-green-bg">
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Timer Circle */}
            <div className="relative w-12 h-12">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  className="stroke-notion-accent-green/20"
                  strokeWidth="3"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  className="stroke-notion-accent-green"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 16}`}
                  strokeDashoffset={`${2 * Math.PI * 16 * (1 - progress / 100)}`}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center">
                <TimerIcon className="w-4 h-4 text-notion-accent-green" />
              </span>
            </div>

            {/* Task Info */}
            <div>
              <p className="text-sm font-medium text-notion-accent-green">
                Focus Session in Progress
              </p>
              <p className="text-sm text-notion-accent-green/80 truncate max-w-[200px]">
                {pomodoro.task?.title ?? 'Taskless'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Time Remaining */}
            <span className="text-2xl font-bold text-notion-accent-green tabular-nums">
              {formatTime(timeRemaining)}
            </span>

            {/* View Button */}
            <Button variant="outline" size="sm" onClick={() => router.push('/pomodoro')}>
              View Timer
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
