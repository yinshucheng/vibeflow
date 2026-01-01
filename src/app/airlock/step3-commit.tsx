'use client';

/**
 * Airlock Step 3: Commit
 * 
 * Select up to 3 tasks as Top N priorities and start the day.
 * Requirements: 3.7, 3.8, 3.9
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import type { Task, Project } from '@prisma/client';

type TaskWithProject = Task & { project?: Project | null };

interface AirlockStep3CommitProps {
  selectedTop3: string[];
  onTop3Change: (taskIds: string[]) => void;
  onBack: () => void;
  canSkip?: boolean;
  onSkip?: () => void;
  isReEntry?: boolean;
}

export function AirlockStep3Commit({ selectedTop3, onTop3Change, onBack, canSkip, onSkip, isReEntry }: AirlockStep3CommitProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Get today's tasks
  const { data: todayTasks, isLoading } = trpc.task.getTodayTasks.useQuery();
  
  // Complete airlock mutation
  const completeAirlockMutation = trpc.dailyState.completeAirlock.useMutation({
    onSuccess: () => {
      router.push('/');
    },
    onError: (error) => {
      alert(`Failed to start day: ${error.message}`);
      setIsSubmitting(false);
    },
  });

  const todayTasksList = todayTasks ?? [];
  
  // Calculate max selectable tasks (up to 3, but limited by available tasks)
  const maxSelectable = Math.min(3, todayTasksList.length);
  const minRequired = Math.min(1, todayTasksList.length);

  const handleToggleTask = (taskId: string) => {
    if (selectedTop3.includes(taskId)) {
      // Remove from selection
      onTop3Change(selectedTop3.filter(id => id !== taskId));
    } else if (selectedTop3.length < maxSelectable) {
      // Add to selection
      onTop3Change([...selectedTop3, taskId]);
    }
  };

  const handleStartDay = () => {
    if (selectedTop3.length < minRequired) {
      alert(`Please select at least ${minRequired} task as your priority.`);
      return;
    }
    
    setIsSubmitting(true);
    completeAirlockMutation.mutate({ top3TaskIds: selectedTop3 });
  };

  const canStartDay = selectedTop3.length >= minRequired && selectedTop3.length <= maxSelectable;
  const remainingToSelect = maxSelectable - selectedTop3.length;

  return (
    <div className="space-y-6">
      {/* Step Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 mb-4">
          <span className="text-3xl">🎯</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">
          {isReEntry ? 'Adjust Your Priorities' : 'Commit to Your Top Tasks'}
        </h2>
        <p className="text-white/70 max-w-md mx-auto">
          {maxSelectable === 0 
            ? 'No tasks available. Add some tasks first or skip this step.'
            : maxSelectable === 1
              ? 'Select your priority task for today.'
              : maxSelectable === 2
                ? 'Select up to 2 tasks as your priorities for today.'
                : 'Select up to 3 tasks that you commit to completing today. These are your non-negotiables.'}
        </p>
      </div>

      {/* Selection Counter - only show if there are tasks */}
      {maxSelectable > 0 && (
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-3 px-6 py-3 bg-white/10 rounded-full">
            {Array.from({ length: maxSelectable }, (_, i) => i + 1).map((num) => (
              <div
                key={num}
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg
                  transition-all duration-300
                  ${selectedTop3.length >= num 
                    ? 'bg-green-500 text-white scale-110' 
                    : 'bg-white/20 text-white/40'}
                `}
              >
                {selectedTop3.length >= num ? '✓' : num}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Task Selection */}
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 overflow-hidden">
        <div className="px-4 py-3 bg-white/5 border-b border-white/10">
          <h3 className="font-medium text-white flex items-center gap-2">
            <span>📋</span> Today&apos;s Tasks
            {maxSelectable > 0 && (
              <span className="text-white/50 text-sm">
                {remainingToSelect > 0 
                  ? `(Select ${remainingToSelect} more${remainingToSelect < maxSelectable ? ' optional' : ''})` 
                  : '(Selection complete)'}
              </span>
            )}
          </h3>
        </div>
        
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-pulse text-white/60">Loading tasks...</div>
          </div>
        ) : todayTasksList.length === 0 ? (
          <div className="p-8 text-center">
            <span className="text-4xl mb-4 block">📭</span>
            <h3 className="text-lg font-medium text-white mb-2">No tasks for today</h3>
            <p className="text-white/60 text-sm mb-4">
              {canSkip 
                ? 'You can skip this step and add tasks later.'
                : 'Go back and add some tasks to your day first.'}
            </p>
            {canSkip && onSkip && (
              <button
                onClick={onSkip}
                className="px-6 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors"
              >
                Skip & Continue →
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-white/10">
            {todayTasksList.map((task: TaskWithProject) => {
              const isSelected = selectedTop3.includes(task.id);
              const selectionIndex = selectedTop3.indexOf(task.id);
              const canSelect = isSelected || selectedTop3.length < maxSelectable;
              
              return (
                <li 
                  key={task.id}
                  onClick={() => canSelect && handleToggleTask(task.id)}
                  className={`
                    p-4 cursor-pointer transition-all
                    ${isSelected 
                      ? 'bg-green-500/20 hover:bg-green-500/25' 
                      : canSelect 
                        ? 'hover:bg-white/5' 
                        : 'opacity-50 cursor-not-allowed'}
                  `}
                >
                  <div className="flex items-center gap-4">
                    {/* Selection Indicator */}
                    <div className={`
                      w-8 h-8 rounded-full flex items-center justify-center font-bold
                      transition-all duration-300
                      ${isSelected 
                        ? 'bg-green-500 text-white' 
                        : 'bg-white/10 text-white/40'}
                    `}>
                      {isSelected ? selectionIndex + 1 : ''}
                    </div>

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
                      <h4 className={`font-medium ${isSelected ? 'text-white' : 'text-white/80'}`}>
                        {task.title}
                      </h4>
                    </div>

                    {/* Selection Checkbox */}
                    <div className={`
                      w-6 h-6 rounded border-2 flex items-center justify-center
                      transition-all
                      ${isSelected 
                        ? 'bg-green-500 border-green-500' 
                        : 'border-white/30'}
                    `}>
                      {isSelected && <span className="text-white text-sm">✓</span>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Selected Top N Summary */}
      {selectedTop3.length > 0 && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
          <h4 className="text-green-300 font-medium mb-3 flex items-center gap-2">
            <span>🏆</span> Your {selectedTop3.length === 1 ? 'Priority' : `Top ${selectedTop3.length}`} Commitment{selectedTop3.length > 1 ? 's' : ''}
          </h4>
          <ol className="space-y-2">
            {selectedTop3.map((taskId, index) => {
              const task = todayTasksList.find((t: TaskWithProject) => t.id === taskId);
              if (!task) return null;
              return (
                <li key={taskId} className="flex items-center gap-3 text-white">
                  <span className="w-6 h-6 rounded-full bg-green-500 text-white text-sm flex items-center justify-center font-bold">
                    {index + 1}
                  </span>
                  <span>{task.title}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          disabled={isSubmitting}
          className="px-6 py-3 rounded-xl font-medium text-white/70 hover:text-white hover:bg-white/10 transition-all disabled:opacity-50"
        >
          ← Back
        </button>
        <button
          onClick={handleStartDay}
          disabled={!canStartDay || isSubmitting}
          className={`
            px-8 py-4 rounded-xl font-bold text-lg transition-all
            ${canStartDay && !isSubmitting
              ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-400 hover:to-emerald-400 shadow-lg shadow-green-500/30' 
              : 'bg-white/20 text-white/60 cursor-not-allowed'}
          `}
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">⏳</span> Starting...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span>🚀</span> {isReEntry ? 'Update & Continue' : 'Start My Day'}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
