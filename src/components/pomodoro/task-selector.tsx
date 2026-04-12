'use client';

/**
 * Task Selector Component
 * 
 * Dropdown selector for choosing a task to focus on.
 * Requirements: 4.1, 4.2
 */

import { useState, useRef, useEffect } from 'react';

interface Task {
  id: string;
  title: string;
  priority: 'P1' | 'P2' | 'P3';
  project?: {
    id: string;
    title: string;
  } | null;
}

interface TaskSelectorProps {
  tasks: Task[];
  selectedTaskId: string | null;
  onSelect: (taskId: string | null) => void;
  disabled?: boolean;
  hideLabel?: boolean;
}

const priorityColors = {
  P1: 'bg-red-100 text-red-700',
  P2: 'bg-yellow-100 text-yellow-700',
  P3: 'bg-gray-100 text-gray-700',
};

export function TaskSelector({
  tasks,
  selectedTaskId,
  onSelect,
  disabled = false,
  hideLabel = false,
}: TaskSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter tasks based on search query
  const filteredTasks = tasks.filter((task) =>
    task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    task.project?.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get selected task
  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  const handleSelect = (taskId: string) => {
    onSelect(taskId);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = () => {
    onSelect(null);
    setSearchQuery('');
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {!hideLabel && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Select Task
        </label>
      )}
      
      {/* Selected Task Display / Input */}
      <div
        className={`
          flex items-center gap-2 w-full px-3 py-2 border rounded-lg
          ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white cursor-pointer hover:border-blue-400'}
          ${isOpen ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-300'}
        `}
        onClick={() => !disabled && setIsOpen(true)}
      >
        {selectedTask ? (
          <>
            <span className={`text-xs px-1.5 py-0.5 rounded ${priorityColors[selectedTask.priority]}`}>
              {selectedTask.priority}
            </span>
            <span className="flex-1 truncate text-gray-900">{selectedTask.title}</span>
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClear();
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </>
        ) : (
          <span className="text-gray-400 flex-1">Choose a task...</span>
        )}
        <span className="text-gray-400">▼</span>
      </div>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-hidden">
          {/* Search Input */}
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400"
              autoFocus
            />
          </div>

          {/* Task List */}
          <div className="overflow-y-auto max-h-48">
            {filteredTasks.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-500 text-center">
                {tasks.length === 0 
                  ? 'No tasks planned for today' 
                  : 'No matching tasks found'}
              </div>
            ) : (
              filteredTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => handleSelect(task.id)}
                  className={`
                    w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-2
                    ${task.id === selectedTaskId ? 'bg-blue-50' : ''}
                  `}
                >
                  <span className={`text-xs px-1.5 py-0.5 rounded ${priorityColors[task.priority]}`}>
                    {task.priority}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-900 truncate">{task.title}</div>
                    {task.project && (
                      <div className="text-xs text-gray-500 truncate">
                        📁 {task.project.title}
                      </div>
                    )}
                  </div>
                  {task.id === selectedTaskId && (
                    <span className="text-blue-500">✓</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
