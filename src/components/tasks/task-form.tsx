'use client';

/**
 * TaskForm Component
 * 
 * Form for creating and editing tasks.
 * Requirements: 2.1, 2.3, 20.1, 20.2, 20.3
 */

import { useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { Card, CardHeader, CardContent } from '@/components/layout';
import { trpc } from '@/lib/trpc';
import type { Priority, Project, Task } from '@prisma/client';

/**
 * Calculate estimated pomodoro count from estimated minutes
 * Requirements: 20.3
 */
function calculateEstimatedPomodoros(
  estimatedMinutes: number | null | undefined,
  pomodoroDuration: number = 25
): number | null {
  if (estimatedMinutes == null || estimatedMinutes <= 0) {
    return null;
  }
  return Math.ceil(estimatedMinutes / pomodoroDuration);
}

interface TaskFormProps {
  taskId?: string;
  initialData?: {
    title: string;
    projectId: string;
    parentId?: string | null;
    priority: Priority;
    planDate?: Date | null;
    estimatedMinutes?: number | null;
  };
}

export function TaskForm({ taskId, initialData }: TaskFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const utils = trpc.useUtils();
  
  const defaultProjectId = searchParams.get('projectId') ?? initialData?.projectId ?? '';
  const defaultParentId = searchParams.get('parentId') ?? initialData?.parentId ?? '';
  
  const [title, setTitle] = useState(initialData?.title ?? '');
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [parentId, setParentId] = useState(defaultParentId);
  const [priority, setPriority] = useState<Priority>(initialData?.priority ?? 'P2');
  const [planDate, setPlanDate] = useState<string>(
    initialData?.planDate ? new Date(initialData.planDate).toISOString().split('T')[0] : ''
  );
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(
    initialData?.estimatedMinutes ?? null
  );
  const [customEstimate, setCustomEstimate] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: projects } = trpc.project.list.useQuery();
  const { data: projectTasks } = trpc.task.getByProject.useQuery(
    { projectId },
    { enabled: !!projectId }
  );
  
  // Get user settings for pomodoro duration (Requirements: 20.3)
  const { data: settings } = trpc.settings.get.useQuery();
  const pomodoroDuration = settings?.pomodoroDuration ?? 25;
  
  // Calculate estimated pomodoro count (Requirements: 20.3)
  const estimatedPomodoros = useMemo(() => {
    return calculateEstimatedPomodoros(estimatedMinutes, pomodoroDuration);
  }, [estimatedMinutes, pomodoroDuration]);
  
  // Preset durations based on pomodoro duration (Requirements: 20.2)
  const presetDurations = useMemo(() => [
    { label: `${pomodoroDuration}min (1 🍅)`, value: pomodoroDuration },
    { label: `${pomodoroDuration * 2}min (2 🍅)`, value: pomodoroDuration * 2 },
    { label: `${pomodoroDuration * 3}min (3 🍅)`, value: pomodoroDuration * 3 },
  ], [pomodoroDuration]);
  
  const createMutation = trpc.task.create.useMutation({
    onSuccess: () => {
      utils.task.getTodayTasks.invalidate();
      utils.task.getBacklog.invalidate();
      if (projectId) {
        utils.task.getByProject.invalidate({ projectId });
      }
      router.push('/tasks');
    },
    onError: (err: { message: string }) => {
      setErrors({ submit: err.message });
    },
  });

  const updateMutation = trpc.task.update.useMutation({
    onSuccess: () => {
      utils.task.getTodayTasks.invalidate();
      utils.task.getBacklog.invalidate();
      if (projectId) {
        utils.task.getByProject.invalidate({ projectId });
      }
      router.push(`/tasks/${taskId}`);
    },
    onError: (err: { message: string }) => {
      setErrors({ submit: err.message });
    },
  });

  const isLoading = createMutation.isPending || updateMutation.isPending;
  const isEditing = !!taskId;

  // Filter active projects
  const activeProjects = (projects ?? []).filter((p: Project) => p.status === 'ACTIVE') as Project[];
  
  // Filter potential parent tasks (exclude current task and its descendants)
  const potentialParents = (projectTasks ?? []).filter((t: Task) => 
    t.id !== taskId && t.parentId !== taskId
  ) as Task[];

  const validate = () => {
    const newErrors: Record<string, string> = {};
    
    if (!title.trim()) {
      newErrors.title = 'Title is required';
    }
    if (!projectId) {
      newErrors.projectId = 'Project is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;

    const data = {
      title: title.trim(),
      projectId,
      parentId: parentId || undefined,
      priority,
      planDate: planDate ? new Date(planDate) : undefined,
      estimatedMinutes: estimatedMinutes ?? undefined,
    };

    if (isEditing && taskId) {
      updateMutation.mutate({ id: taskId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader title="Task Details" />
        <CardContent className="space-y-4">
          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              Task Title *
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.title ? 'border-red-300' : 'border-gray-300'}`}
            />
            {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title}</p>}
          </div>

          {/* Project Selection */}
          <div>
            <label htmlFor="projectId" className="block text-sm font-medium text-gray-700 mb-1">
              Project *
            </label>
            <select
              id="projectId"
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setParentId(''); // Reset parent when project changes
              }}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.projectId ? 'border-red-300' : 'border-gray-300'}`}
            >
              <option value="">Select a project...</option>
              {activeProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
            {errors.projectId && <p className="mt-1 text-sm text-red-600">{errors.projectId}</p>}
            {activeProjects.length === 0 && (
              <p className="mt-1 text-sm text-gray-500">
                No active projects.{' '}
                <Link href="/projects/new" className="text-blue-600 hover:underline">Create one first</Link>
              </p>
            )}
          </div>

          {/* Parent Task (optional) */}
          {projectId && potentialParents.length > 0 && (
            <div>
              <label htmlFor="parentId" className="block text-sm font-medium text-gray-700 mb-1">
                Parent Task (optional)
              </label>
              <select
                id="parentId"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">No parent (root task)</option>
                {potentialParents.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Make this a subtask of another task
              </p>
            </div>
          )}

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Priority
            </label>
            <div className="flex gap-2">
              {(['P1', 'P2', 'P3'] as Priority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    priority === p
                      ? p === 'P1' ? 'bg-red-100 text-red-700 ring-2 ring-red-500'
                        : p === 'P2' ? 'bg-yellow-100 text-yellow-700 ring-2 ring-yellow-500'
                        : 'bg-gray-100 text-gray-700 ring-2 ring-gray-500'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {p === 'P1' ? '🔴 P1 (High)' : p === 'P2' ? '🟡 P2 (Medium)' : '⚪ P3 (Low)'}
                </button>
              ))}
            </div>
          </div>

          {/* Plan Date */}
          <div>
            <label htmlFor="planDate" className="block text-sm font-medium text-gray-700 mb-1">
              Plan Date (optional)
            </label>
            <input
              id="planDate"
              type="date"
              value={planDate}
              onChange={(e) => setPlanDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              When do you plan to work on this task?
            </p>
          </div>

          {/* Estimated Time (Requirements: 20.1, 20.2, 20.3) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Estimated Time (optional)
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {presetDurations.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => {
                    setEstimatedMinutes(preset.value);
                    setCustomEstimate('');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    estimatedMinutes === preset.value
                      ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-500'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setEstimatedMinutes(null);
                  setCustomEstimate('');
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  estimatedMinutes === null
                    ? 'bg-gray-100 text-gray-700 ring-2 ring-gray-500'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                None
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="customEstimate"
                type="number"
                min="1"
                max="480"
                value={customEstimate}
                onChange={(e) => {
                  const value = e.target.value;
                  setCustomEstimate(value);
                  if (value) {
                    const minutes = parseInt(value, 10);
                    if (minutes >= 1 && minutes <= 480) {
                      setEstimatedMinutes(minutes);
                    }
                  }
                }}
                placeholder="Custom minutes"
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-500">minutes</span>
              {estimatedPomodoros !== null && (
                <span className="text-sm text-blue-600 font-medium ml-2">
                  ≈ {estimatedPomodoros} 🍅
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              How long do you think this task will take?
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Error Message */}
      {errors.submit && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{errors.submit}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" isLoading={isLoading}>
          {isEditing ? 'Save Changes' : 'Create Task'}
        </Button>
      </div>
    </form>
  );
}
