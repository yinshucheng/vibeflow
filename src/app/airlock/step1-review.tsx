'use client';

/**
 * Airlock Step 1: Review
 * 
 * Display yesterday's incomplete tasks and allow user to Defer or Delete each.
 * Requirements: 3.3, 3.4
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import type { Task, Project } from '@prisma/client';

type TaskWithProject = Task & { project?: Project | null };

interface AirlockStep1ReviewProps {
  onComplete: () => void;
  canSkip?: boolean;
  onSkip?: () => void;
}

export function AirlockStep1Review({ onComplete, canSkip, onSkip }: AirlockStep1ReviewProps) {
  const utils = trpc.useUtils();
  
  // Get yesterday's incomplete tasks
  const { data: yesterdayTasks, isLoading } = trpc.task.getYesterdayIncompleteTasks.useQuery();
  
  // Track processed tasks
  const [processedTasks, setProcessedTasks] = useState<Set<string>>(new Set());
  
  // Mutations
  const deferMutation = trpc.task.deferToToday.useMutation({
    onSuccess: () => {
      utils.task.getYesterdayIncompleteTasks.invalidate();
      utils.task.getTodayTasks.invalidate();
    },
  });
  
  const deleteMutation = trpc.task.delete.useMutation({
    onSuccess: () => {
      utils.task.getYesterdayIncompleteTasks.invalidate();
    },
  });

  const handleDefer = (taskId: string) => {
    deferMutation.mutate({ id: taskId }, {
      onSuccess: () => {
        setProcessedTasks(prev => {
          const newSet = new Set(prev);
          newSet.add(taskId);
          return newSet;
        });
      },
    });
  };

  const handleDelete = (taskId: string) => {
    if (confirm('Are you sure you want to delete this task?')) {
      deleteMutation.mutate({ id: taskId }, {
        onSuccess: () => {
          setProcessedTasks(prev => {
            const newSet = new Set(prev);
            newSet.add(taskId);
            return newSet;
          });
        },
      });
    }
  };

  // Filter out processed tasks - cast to handle the type mismatch
  const taskList = (yesterdayTasks ?? []) as TaskWithProject[];
  const remainingTasks = taskList.filter(
    (task) => !processedTasks.has(task.id)
  );

  const allProcessed = remainingTasks.length === 0 && !isLoading;

  return (
    <div className="space-y-6">
      {/* Step Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/20 mb-4">
          <span className="text-3xl">📋</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Review Yesterday</h2>
        <p className="text-white/70 max-w-md mx-auto">
          Let&apos;s look at what didn&apos;t get done yesterday. Decide what to carry forward and what to let go.
        </p>
      </div>

      {/* Task List */}
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-pulse text-white/60">Loading tasks...</div>
          </div>
        ) : remainingTasks.length === 0 ? (
          <div className="p-8 text-center">
            <span className="text-4xl mb-4 block">✨</span>
            <h3 className="text-lg font-medium text-white mb-2">
              {processedTasks.size > 0 ? 'All tasks reviewed!' : 'No incomplete tasks from yesterday'}
            </h3>
            <p className="text-white/60 text-sm">
              {processedTasks.size > 0 
                ? 'Great job! You\'ve processed all your pending tasks.'
                : 'You\'re starting fresh today!'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-white/10">
            {remainingTasks.map((task) => (
              <li key={task.id} className="p-4 hover:bg-white/5 transition-colors">
                <div className="flex items-start gap-4">
                  {/* Task Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`
                        text-xs px-2 py-0.5 rounded-full font-medium
                        ${task.priority === 'P1' ? 'bg-red-500/20 text-red-300' :
                          task.priority === 'P2' ? 'bg-yellow-500/20 text-yellow-300' :
                          'bg-gray-500/20 text-gray-300'}
                      `}>
                        {task.priority}
                      </span>
                      {task.project && (
                        <span className="text-xs text-white/50">
                          📁 {task.project.title}
                        </span>
                      )}
                    </div>
                    <h4 className="text-white font-medium">{task.title}</h4>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDefer(task.id)}
                      disabled={deferMutation.isPending}
                      className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      Defer →
                    </button>
                    <button
                      onClick={() => handleDelete(task.id)}
                      disabled={deleteMutation.isPending}
                      className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Continue Button */}
      <div className="flex justify-center pt-4">
        <button
          onClick={onComplete}
          disabled={!allProcessed && remainingTasks.length > 0}
          className={`
            px-8 py-3 rounded-xl font-medium text-lg transition-all
            ${allProcessed 
              ? 'bg-white text-indigo-900 hover:bg-white/90 shadow-lg shadow-white/20' 
              : 'bg-white/20 text-white/60 cursor-not-allowed'}
          `}
        >
          {allProcessed ? 'Continue to Planning →' : `Review ${remainingTasks.length} remaining task${remainingTasks.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}
