'use client';

/**
 * Tasks Page
 * 
 * Displays all tasks with filtering and management.
 * Shows current running pomodoro session.
 * Requirements: 2.3, 2.4, 2.5, 2.6
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MainLayout, PageHeader, Card, CardHeader, CardContent, EmptyState } from '@/components/layout';
import { Button } from '@/components/ui';
import { TaskTree } from '@/components/tasks/task-tree';
import { trpc } from '@/lib/trpc';
import { calculateRemainingSeconds } from '@/lib/pomodoro-cache';
import type { Task, Project } from '@prisma/client';

type TaskFilter = 'today' | 'backlog' | 'all';

type TaskWithProject = Task & {
  project: Project;
  subTasks?: Task[];
};

export default function TasksPage() {
  const [filter, setFilter] = useState<TaskFilter>('today');
  
  const { data: todayTasks, isLoading: todayLoading } = trpc.task.getTodayTasks.useQuery();
  const { data: backlogTasks, isLoading: backlogLoading } = trpc.task.getBacklog.useQuery();
  const { data: projects } = trpc.project.list.useQuery();
  const { data: currentPomodoro } = trpc.pomodoro.getCurrent.useQuery();

  const isLoading = filter === 'today' ? todayLoading : backlogLoading;
  const tasks = filter === 'today' 
    ? (todayTasks as TaskWithProject[] | undefined) 
    : (backlogTasks as TaskWithProject[] | undefined);

  return (
    <MainLayout title="Tasks">
      <PageHeader 
        title="Tasks" 
        description="Manage your tasks across all projects"
        actions={
          <Link href="/tasks/new">
            <Button>+ New Task</Button>
          </Link>
        }
      />

      {/* Current Pomodoro Session (Requirement 2.4, 2.5) */}
      {currentPomodoro && (
        <CurrentPomodoroCard pomodoro={currentPomodoro} />
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFilter('today')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === 'today' 
              ? 'bg-blue-100 text-blue-700' 
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          📅 Today ({todayTasks?.length ?? 0})
        </button>
        <button
          onClick={() => setFilter('backlog')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === 'backlog' 
              ? 'bg-blue-100 text-blue-700' 
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          📋 Backlog ({backlogTasks?.length ?? 0})
        </button>
      </div>

      {/* Tasks List */}
      <Card>
        <CardHeader 
          title={filter === 'today' ? "Today's Tasks" : 'Backlog'}
          description={filter === 'today' 
            ? 'Tasks planned for today' 
            : 'Tasks without a plan date'
          }
        />
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse h-12 bg-gray-100 rounded" />
              ))}
            </div>
          ) : tasks && tasks.length > 0 ? (
            <TaskTree tasks={tasks} showProject />
          ) : (
            <EmptyState
              icon={filter === 'today' ? '📅' : '📋'}
              title={filter === 'today' ? 'No Tasks Today' : 'Backlog Empty'}
              description={filter === 'today' 
                ? 'Plan your day in the Morning Airlock or add tasks manually'
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
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Tasks by Project</h2>
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

  return (
    <Card>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          <span className="text-gray-400">{isExpanded ? '▼' : '▶'}</span>
          <span className="font-medium text-gray-900">{project.title}</span>
        </div>
        <Link 
          href={`/tasks/new?projectId=${project.id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          + Add
        </Link>
      </button>
      
      {isExpanded && (
        <CardContent className="pt-0">
          {typedTasks.length > 0 ? (
            <TaskTree tasks={typedTasks} />
          ) : (
            <p className="text-sm text-gray-500 py-2">No tasks in this project</p>
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
    taskId: string;
    duration: number;
    startTime: Date;
    task: {
      id: string;
      title: string;
      projectId: string;
    };
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

  return (
    <Card className="mb-6 border-green-200 bg-green-50">
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
                  stroke="#dcfce7"
                  strokeWidth="3"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 16}`}
                  strokeDashoffset={`${2 * Math.PI * 16 * (1 - progress / 100)}`}
                  className="transition-all duration-1000"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-green-700">
                🍅
              </span>
            </div>
            
            {/* Task Info */}
            <div>
              <p className="text-sm font-medium text-green-800">
                Focus Session in Progress
              </p>
              <p className="text-sm text-green-600 truncate max-w-[200px]">
                {pomodoro.task.title}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Time Remaining */}
            <span className="text-2xl font-bold text-green-700 tabular-nums">
              {formatTime(timeRemaining)}
            </span>
            
            {/* View Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/pomodoro')}
              className="border-green-300 text-green-700 hover:bg-green-100"
            >
              View Timer
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
