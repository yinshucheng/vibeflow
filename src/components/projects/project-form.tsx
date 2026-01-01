'use client';

/**
 * ProjectForm Component
 * 
 * Form for creating and editing projects with goal association.
 * Requirements: 1.1, 11.4, 11.5
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { Card, CardHeader, CardContent } from '@/components/layout';
import { trpc } from '@/lib/trpc';
import type { Goal } from '@prisma/client';

interface ProjectFormProps {
  projectId?: string;
  initialData?: {
    title: string;
    deliverable: string;
    goalIds: string[];
  };
}

export function ProjectForm({ projectId, initialData }: ProjectFormProps) {
  const router = useRouter();
  const utils = trpc.useUtils();
  
  const [title, setTitle] = useState(initialData?.title ?? '');
  const [deliverable, setDeliverable] = useState(initialData?.deliverable ?? '');
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>(initialData?.goalIds ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: goals } = trpc.goal.list.useQuery();
  
  const createMutation = trpc.project.create.useMutation({
    onSuccess: () => {
      utils.project.list.invalidate();
      router.push('/projects');
    },
    onError: (err: { message: string }) => {
      setErrors({ submit: err.message });
    },
  });

  const updateMutation = trpc.project.update.useMutation({
    onSuccess: () => {
      utils.project.list.invalidate();
      if (projectId) {
        utils.project.getById.invalidate({ id: projectId });
      }
      router.push(`/projects/${projectId}`);
    },
    onError: (err: { message: string }) => {
      setErrors({ submit: err.message });
    },
  });

  const isLoading = createMutation.isPending || updateMutation.isPending;
  const isEditing = !!projectId;

  const validate = () => {
    const newErrors: Record<string, string> = {};
    
    if (!title.trim()) {
      newErrors.title = 'Title is required';
    }
    if (!deliverable.trim()) {
      newErrors.deliverable = 'Deliverable description is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;

    const data = {
      title: title.trim(),
      deliverable: deliverable.trim(),
      goalIds: selectedGoalIds,
    };

    if (isEditing && projectId) {
      updateMutation.mutate({ id: projectId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const toggleGoal = (goalId: string) => {
    setSelectedGoalIds(prev => 
      prev.includes(goalId) 
        ? prev.filter(id => id !== goalId)
        : [...prev, goalId]
    );
  };

  const typedGoals = (goals ?? []) as Goal[];
  const longTermGoals = typedGoals.filter(g => g.type === 'LONG_TERM' && g.status === 'ACTIVE');
  const shortTermGoals = typedGoals.filter(g => g.type === 'SHORT_TERM' && g.status === 'ACTIVE');

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader title="Project Details" />
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              Project Title *
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Launch Marketing Website"
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.title ? 'border-red-300' : 'border-gray-300'}`}
            />
            {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title}</p>}
          </div>

          <div>
            <label htmlFor="deliverable" className="block text-sm font-medium text-gray-700 mb-1">
              Deliverable Description *
            </label>
            <textarea
              id="deliverable"
              value={deliverable}
              onChange={(e) => setDeliverable(e.target.value)}
              placeholder="What is the concrete output of this project?"
              rows={3}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.deliverable ? 'border-red-300' : 'border-gray-300'}`}
            />
            {errors.deliverable && <p className="mt-1 text-sm text-red-600">{errors.deliverable}</p>}
            <p className="mt-1 text-xs text-gray-500">
              Be specific about what you will deliver when this project is complete.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Link to Goals" description="Connect this project to your goals (optional)" />
        <CardContent>
          {typedGoals.length > 0 ? (
            <div className="space-y-4">
              {longTermGoals.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">🌟 Long-term Goals</h4>
                  <div className="space-y-2">
                    {longTermGoals.map((goal) => (
                      <GoalCheckbox
                        key={goal.id}
                        goal={goal}
                        checked={selectedGoalIds.includes(goal.id)}
                        onChange={() => toggleGoal(goal.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {shortTermGoals.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">🎯 Short-term Goals</h4>
                  <div className="space-y-2">
                    {shortTermGoals.map((goal) => (
                      <GoalCheckbox
                        key={goal.id}
                        goal={goal}
                        checked={selectedGoalIds.includes(goal.id)}
                        onChange={() => toggleGoal(goal.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              No goals defined yet.{' '}
              <Link href="/goals/new" className="text-blue-600 hover:underline">Create a goal</Link>
              {' '}to link projects to your objectives.
            </p>
          )}
        </CardContent>
      </Card>

      {errors.submit && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{errors.submit}</p>
        </div>
      )}

      <div className="flex gap-3 justify-end">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" isLoading={isLoading}>
          {isEditing ? 'Save Changes' : 'Create Project'}
        </Button>
      </div>
    </form>
  );
}

interface GoalCheckboxProps {
  goal: Goal;
  checked: boolean;
  onChange: () => void;
}

function GoalCheckbox({ goal, checked, onChange }: GoalCheckboxProps) {
  return (
    <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-900 text-sm">{goal.title}</div>
        <div className="text-xs text-gray-500 line-clamp-1">{goal.description}</div>
      </div>
    </label>
  );
}
