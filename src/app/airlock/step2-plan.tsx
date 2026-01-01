'use client';

/**
 * Airlock Step 2: Plan
 * 
 * Display project backlog and allow dragging tasks to Today's list.
 * Requirements: 3.5, 3.6
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import type { Task, Project } from '@prisma/client';
import type { Project as ProjectType } from '@prisma/client';

type TaskWithProject = Task & { project?: Project | null };

interface AirlockStep2PlanProps {
  onComplete: () => void;
  onBack: () => void;
  canSkip?: boolean;
  onSkip?: () => void;
}

export function AirlockStep2Plan({ onComplete, onBack, canSkip, onSkip }: AirlockStep2PlanProps) {
  const utils = trpc.useUtils();
  
  // Get backlog tasks grouped by project
  const { data: backlogByProject, isLoading: backlogLoading } = trpc.task.getBacklogByProject.useQuery();
  
  // Get today's tasks
  const { data: todayTasks, isLoading: todayLoading } = trpc.task.getTodayTasks.useQuery();
  
  // Get projects for names
  const { data: projects } = trpc.project.list.useQuery();
  
  // Drag state
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  
  // Mutation for setting plan date
  const setPlanDateMutation = trpc.task.setPlanDate.useMutation({
    onSuccess: () => {
      utils.task.getBacklogByProject.invalidate();
      utils.task.getTodayTasks.invalidate();
    },
  });

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.setData('taskId', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropToToday = (e: React.DragEvent) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    if (taskId) {
      // Calculate today's date (accounting for 4 AM reset)
      const now = new Date();
      const today = new Date(now);
      if (now.getHours() < 4) {
        today.setDate(today.getDate() - 1);
      }
      today.setHours(0, 0, 0, 0);
      
      setPlanDateMutation.mutate({ id: taskId, planDate: today });
    }
    setDraggedTaskId(null);
  };

  const handleDropToBacklog = (e: React.DragEvent) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    if (taskId) {
      setPlanDateMutation.mutate({ id: taskId, planDate: null });
    }
    setDraggedTaskId(null);
  };

  const handleAddToToday = (taskId: string) => {
    const now = new Date();
    const today = new Date(now);
    if (now.getHours() < 4) {
      today.setDate(today.getDate() - 1);
    }
    today.setHours(0, 0, 0, 0);
    
    setPlanDateMutation.mutate({ id: taskId, planDate: today });
  };

  const handleRemoveFromToday = (taskId: string) => {
    setPlanDateMutation.mutate({ id: taskId, planDate: null });
  };

  const getProjectName = (projectId: string) => {
    return projects?.find((p: ProjectType) => p.id === projectId)?.title ?? 'Unknown Project';
  };

  const isLoading = backlogLoading || todayLoading;
  const todayTasksList = todayTasks ?? [];
  const hasTasksForToday = todayTasksList.length > 0;

  return (
    <div className="space-y-6">
      {/* Step Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/20 mb-4">
          <span className="text-3xl">📅</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Plan Your Day</h2>
        <p className="text-white/70 max-w-md mx-auto">
          Drag tasks from your backlog to today&apos;s list. Focus on what you can realistically accomplish.
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-pulse text-white/60">Loading tasks...</div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Backlog Column */}
          <div 
            className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 overflow-hidden"
            onDragOver={handleDragOver}
            onDrop={handleDropToBacklog}
          >
            <div className="px-4 py-3 bg-white/5 border-b border-white/10">
              <h3 className="font-medium text-white flex items-center gap-2">
                <span>📦</span> Project Backlog
              </h3>
            </div>
            <div className="p-4 max-h-[50vh] overflow-y-auto">
              {!backlogByProject || Object.keys(backlogByProject).length === 0 ? (
                <div className="text-center py-8 text-white/50">
                  <span className="text-2xl block mb-2">📭</span>
                  No tasks in backlog
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(backlogByProject).map(([projectId, tasks]) => (
                    <div key={projectId}>
                      <h4 className="text-sm font-medium text-white/60 mb-2 flex items-center gap-1">
                        <span>📁</span> {getProjectName(projectId)}
                      </h4>
                      <ul className="space-y-2">
                        {(tasks as TaskWithProject[]).map((task) => (
                          <li
                            key={task.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, task.id)}
                            onDragEnd={handleDragEnd}
                            className={`
                              p-3 bg-white/10 rounded-lg cursor-grab active:cursor-grabbing
                              hover:bg-white/15 transition-all
                              ${draggedTaskId === task.id ? 'opacity-50 scale-95' : ''}
                            `}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`
                                  text-xs px-1.5 py-0.5 rounded font-medium
                                  ${task.priority === 'P1' ? 'bg-red-500/30 text-red-300' :
                                    task.priority === 'P2' ? 'bg-yellow-500/30 text-yellow-300' :
                                    'bg-gray-500/30 text-gray-300'}
                                `}>
                                  {task.priority}
                                </span>
                                <span className="text-white text-sm truncate">{task.title}</span>
                              </div>
                              <button
                                onClick={() => handleAddToToday(task.id)}
                                className="text-blue-400 hover:text-blue-300 text-sm shrink-0"
                              >
                                Add →
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Today Column */}
          <div 
            className={`
              bg-white/10 backdrop-blur-sm rounded-2xl border-2 overflow-hidden transition-colors
              ${draggedTaskId ? 'border-blue-400/50 bg-blue-500/10' : 'border-white/20'}
            `}
            onDragOver={handleDragOver}
            onDrop={handleDropToToday}
          >
            <div className="px-4 py-3 bg-white/5 border-b border-white/10">
              <h3 className="font-medium text-white flex items-center gap-2">
                <span>🎯</span> Today&apos;s Tasks
                <span className="text-white/50 text-sm">({todayTasksList.length})</span>
              </h3>
            </div>
            <div className="p-4 min-h-[200px] max-h-[50vh] overflow-y-auto">
              {todayTasksList.length === 0 ? (
                <div className="text-center py-8 text-white/50 border-2 border-dashed border-white/20 rounded-xl">
                  <span className="text-2xl block mb-2">📥</span>
                  Drag tasks here
                </div>
              ) : (
                <ul className="space-y-2">
                  {todayTasksList.map((task: TaskWithProject) => (
                    <li
                      key={task.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onDragEnd={handleDragEnd}
                      className={`
                        p-3 bg-white/10 rounded-lg cursor-grab active:cursor-grabbing
                        hover:bg-white/15 transition-all
                        ${draggedTaskId === task.id ? 'opacity-50 scale-95' : ''}
                      `}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`
                            text-xs px-1.5 py-0.5 rounded font-medium
                            ${task.priority === 'P1' ? 'bg-red-500/30 text-red-300' :
                              task.priority === 'P2' ? 'bg-yellow-500/30 text-yellow-300' :
                              'bg-gray-500/30 text-gray-300'}
                          `}>
                            {task.priority}
                          </span>
                          <span className="text-white text-sm truncate">{task.title}</span>
                        </div>
                        <button
                          onClick={() => handleRemoveFromToday(task.id)}
                          className="text-red-400 hover:text-red-300 text-sm shrink-0"
                        >
                          ← Remove
                        </button>
                      </div>
                      {task.project && (
                        <div className="text-xs text-white/40 mt-1 ml-10">
                          📁 {task.project.title}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="px-6 py-3 rounded-xl font-medium text-white/70 hover:text-white hover:bg-white/10 transition-all"
        >
          ← Back
        </button>
        <button
          onClick={onComplete}
          disabled={!hasTasksForToday}
          className={`
            px-8 py-3 rounded-xl font-medium text-lg transition-all
            ${hasTasksForToday 
              ? 'bg-white text-indigo-900 hover:bg-white/90 shadow-lg shadow-white/20' 
              : 'bg-white/20 text-white/60 cursor-not-allowed'}
          `}
        >
          {hasTasksForToday ? 'Continue to Commit →' : 'Add tasks to continue'}
        </button>
      </div>
    </div>
  );
}
