'use client';

/**
 * GoalForm Component
 * 
 * Form for creating and editing goals.
 * Requirements: 11.1, 11.2, 11.3
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { Card, CardHeader, CardContent } from '@/components/layout';
import { trpc } from '@/lib/trpc';
import type { GoalType } from '@prisma/client';

interface GoalFormProps {
  goalId?: string;
  initialData?: {
    title: string;
    description: string;
    type: GoalType;
    targetDate: Date;
  };
}

export function GoalForm({ goalId, initialData }: GoalFormProps) {
  const router = useRouter();
  const utils = trpc.useUtils();
  
  const [title, setTitle] = useState(initialData?.title ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [type, setType] = useState<GoalType>(initialData?.type ?? 'SHORT_TERM');
  const [targetDate, setTargetDate] = useState<string>(
    initialData?.targetDate 
      ? new Date(initialData.targetDate).toISOString().split('T')[0] 
      : ''
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = trpc.goal.create.useMutation({
    onSuccess: () => {
      utils.goal.list.invalidate();
      router.push('/goals');
    },
    onError: (err: { message: string }) => {
      setErrors({ submit: err.message });
    },
  });

  const updateMutation = trpc.goal.update.useMutation({
    onSuccess: () => {
      utils.goal.list.invalidate();
      router.push(`/goals/${goalId}`);
    },
    onError: (err: { message: string }) => {
      setErrors({ submit: err.message });
    },
  });

  const isLoading = createMutation.isPending || updateMutation.isPending;
  const isEditing = !!goalId;

  const validate = () => {
    const newErrors: Record<string, string> = {};
    
    if (!title.trim()) {
      newErrors.title = 'Title is required';
    }
    if (!description.trim()) {
      newErrors.description = 'Description is required';
    }
    if (!targetDate) {
      newErrors.targetDate = 'Target date is required';
    } else {
      const date = new Date(targetDate);
      const now = new Date();
      
      if (type === 'LONG_TERM') {
        // Long-term: 1-5 years
        const oneYear = new Date(now);
        oneYear.setFullYear(oneYear.getFullYear() + 1);
        const fiveYears = new Date(now);
        fiveYears.setFullYear(fiveYears.getFullYear() + 5);
        
        if (date < oneYear || date > fiveYears) {
          newErrors.targetDate = 'Long-term goals should be 1-5 years from now';
        }
      } else {
        // Short-term: 1 week - 6 months
        const oneWeek = new Date(now);
        oneWeek.setDate(oneWeek.getDate() + 7);
        const sixMonths = new Date(now);
        sixMonths.setMonth(sixMonths.getMonth() + 6);
        
        if (date < oneWeek || date > sixMonths) {
          newErrors.targetDate = 'Short-term goals should be 1 week to 6 months from now';
        }
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;

    const data = {
      title: title.trim(),
      description: description.trim(),
      type,
      targetDate: new Date(targetDate),
    };

    if (isEditing && goalId) {
      updateMutation.mutate({ id: goalId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  // Calculate suggested date ranges
  const now = new Date();
  const minDate = type === 'LONG_TERM' 
    ? new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
    : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const maxDate = type === 'LONG_TERM'
    ? new Date(now.getFullYear() + 5, now.getMonth(), now.getDate())
    : new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader title="Goal Details" />
        <CardContent className="space-y-4">
          {/* Goal Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Goal Type
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setType('LONG_TERM')}
                className={`flex-1 p-4 rounded-lg border-2 text-left transition-colors ${
                  type === 'LONG_TERM'
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">🌟</span>
                  <span className="font-medium text-gray-900">Long-term</span>
                </div>
                <p className="text-xs text-gray-500">1-5 years • Life direction</p>
              </button>
              <button
                type="button"
                onClick={() => setType('SHORT_TERM')}
                className={`flex-1 p-4 rounded-lg border-2 text-left transition-colors ${
                  type === 'SHORT_TERM'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">🎯</span>
                  <span className="font-medium text-gray-900">Short-term</span>
                </div>
                <p className="text-xs text-gray-500">1 week - 6 months • Milestone</p>
              </button>
            </div>
          </div>

          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              Goal Title *
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={type === 'LONG_TERM' 
                ? "e.g., Become a senior engineer" 
                : "e.g., Launch MVP by Q2"
              }
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.title ? 'border-red-300' : 'border-gray-300'}`}
            />
            {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title}</p>}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description *
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does achieving this goal look like? Why is it important?"
              rows={4}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.description ? 'border-red-300' : 'border-gray-300'}`}
            />
            {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description}</p>}
          </div>

          {/* Target Date */}
          <div>
            <label htmlFor="targetDate" className="block text-sm font-medium text-gray-700 mb-1">
              Target Date *
            </label>
            <input
              id="targetDate"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              min={minDate.toISOString().split('T')[0]}
              max={maxDate.toISOString().split('T')[0]}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.targetDate ? 'border-red-300' : 'border-gray-300'}`}
            />
            {errors.targetDate && <p className="mt-1 text-sm text-red-600">{errors.targetDate}</p>}
            <p className="mt-1 text-xs text-gray-500">
              {type === 'LONG_TERM' 
                ? 'Long-term goals should be 1-5 years from now'
                : 'Short-term goals should be 1 week to 6 months from now'
              }
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
          {isEditing ? 'Save Changes' : 'Create Goal'}
        </Button>
      </div>
    </form>
  );
}
