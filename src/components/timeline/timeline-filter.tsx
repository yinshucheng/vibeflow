'use client';

/**
 * TimelineFilter Component
 * 
 * Provides filters to show/hide different event types in the timeline.
 * Requirements: 6.6
 */

import { useCallback } from 'react';

// Event type configuration
const EVENT_TYPES = [
  { value: 'pomodoro', label: '番茄', icon: '🍅', color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'distraction', label: '分心', icon: '⚠️', color: 'bg-red-100 text-red-700 border-red-300' },
  { value: 'break', label: '休息', icon: '☕', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  { value: 'scheduled_task', label: '计划任务', icon: '📋', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { value: 'activity_log', label: '活动', icon: '🌐', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { value: 'block', label: '拦截', icon: '🚫', color: 'bg-orange-100 text-orange-700 border-orange-300' },
  { value: 'state_change', label: '状态变更', icon: '🎯', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { value: 'interruption', label: '打断', icon: '⏸️', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'idle', label: '空闲', icon: '💤', color: 'bg-gray-100 text-gray-400 border-gray-200' },
] as const;

export type TimelineEventType = typeof EVENT_TYPES[number]['value'];

export interface TimelineFilterState {
  pomodoro: boolean;
  distraction: boolean;
  break: boolean;
  scheduled_task: boolean;
  activity_log: boolean;
  block: boolean;
  state_change: boolean;
  interruption: boolean;
  idle: boolean;
}

// Default filter state - show all
export const DEFAULT_FILTER_STATE: TimelineFilterState = {
  pomodoro: true,
  distraction: true,
  break: true,
  scheduled_task: true,
  activity_log: true,
  block: true,
  state_change: true,
  interruption: true,
  idle: true,
};

interface TimelineFilterProps {
  filters: TimelineFilterState;
  onChange: (filters: TimelineFilterState) => void;
  compact?: boolean;
}

export function TimelineFilter({
  filters,
  onChange,
  compact = false,
}: TimelineFilterProps) {
  // Toggle a single filter
  const toggleFilter = useCallback((type: TimelineEventType) => {
    onChange({
      ...filters,
      [type]: !filters[type],
    });
  }, [filters, onChange]);

  // Select all filters
  const selectAll = useCallback(() => {
    onChange(DEFAULT_FILTER_STATE);
  }, [onChange]);

  // Clear all filters
  const clearAll = useCallback(() => {
    onChange({
      pomodoro: false,
      distraction: false,
      break: false,
      scheduled_task: false,
      activity_log: false,
      block: false,
      state_change: false,
      interruption: false,
      idle: false,
    });
  }, [onChange]);

  // Count active filters
  const activeCount = Object.values(filters).filter(Boolean).length;
  const totalCount = EVENT_TYPES.length;

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1">
        {EVENT_TYPES.map((type) => (
          <button
            key={type.value}
            onClick={() => toggleFilter(type.value)}
            className={`
              px-2 py-1 text-xs rounded-full border transition-all
              ${filters[type.value]
                ? type.color
                : 'bg-gray-50 text-gray-400 border-gray-200'
              }
            `}
            title={type.label}
          >
            {type.icon}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700">
          🔍 事件类型筛选
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {activeCount}/{totalCount}
          </span>
          <button
            onClick={selectAll}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            全选
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={clearAll}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            清除
          </button>
        </div>
      </div>

      {/* Filter buttons */}
      <div className="flex flex-wrap gap-2">
        {EVENT_TYPES.map((type) => (
          <button
            key={type.value}
            onClick={() => toggleFilter(type.value)}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm
              transition-all
              ${filters[type.value]
                ? type.color
                : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
              }
            `}
          >
            <span>{type.icon}</span>
            <span>{type.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Helper function to get active filter types as array
export function getActiveFilterTypes(filters: TimelineFilterState): TimelineEventType[] {
  return (Object.entries(filters) as [TimelineEventType, boolean][])
    .filter(([, active]) => active)
    .map(([type]) => type);
}

export default TimelineFilter;
