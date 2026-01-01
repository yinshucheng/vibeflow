'use client';

/**
 * Timeline Page
 * 
 * Displays activity timeline with calendar view and event filtering.
 * Requirements: 6.1-6.8
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { MainLayout } from '@/components/layout';
import { Card, CardHeader, CardContent } from '@/components/layout';
import { 
  CalendarView, 
  TimelineView, 
  TimelineFilter,
  DEFAULT_FILTER_STATE,
  getActiveFilterTypes,
} from '@/components/timeline';
import type { TimelineFilterState } from '@/components/timeline';
import { trpc } from '@/lib/trpc';

// Local storage key for filter preferences
const FILTER_STORAGE_KEY = 'vibeflow_timeline_filters';

// Load filter preferences from localStorage
function loadFilterPreferences(): TimelineFilterState {
  if (typeof window === 'undefined') return DEFAULT_FILTER_STATE;
  
  try {
    const stored = localStorage.getItem(FILTER_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_FILTER_STATE;
}

// Save filter preferences to localStorage
function saveFilterPreferences(filters: TimelineFilterState): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Ignore storage errors
  }
}

// Format duration in seconds to human readable
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}秒`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours}小时`;
  }
  return `${hours}小时${remainingMinutes}分钟`;
}

export default function TimelinePage() {
  // Selected date state
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  
  // Filter state - load from localStorage
  const [filters, setFilters] = useState<TimelineFilterState>(DEFAULT_FILTER_STATE);
  
  // Load filter preferences on mount
  useEffect(() => {
    setFilters(loadFilterPreferences());
  }, []);

  // Get active filter types for query
  const activeTypes = useMemo(() => {
    const types = getActiveFilterTypes(filters);
    // If all filters are active, don't pass types (fetch all)
    if (types.length === Object.keys(filters).length) {
      return undefined;
    }
    return types;
  }, [filters]);

  // Fetch timeline events
  const { 
    data: events, 
    isLoading: eventsLoading,
    error: eventsError,
  } = trpc.timeline.getByDate.useQuery({
    date: selectedDate,
    types: activeTypes,
  });

  // Fetch daily summary
  const { 
    data: summary,
    isLoading: summaryLoading,
  } = trpc.timeline.getDailySummary.useQuery({
    date: selectedDate,
  });

  // Handle date selection
  const handleDateSelect = useCallback((date: Date) => {
    setSelectedDate(date);
  }, []);

  // Handle filter change
  const handleFilterChange = useCallback((newFilters: TimelineFilterState) => {
    setFilters(newFilters);
    saveFilterPreferences(newFilters);
  }, []);

  // Format date for display
  const formattedDate = useMemo(() => {
    return selectedDate.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
  }, [selectedDate]);

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">📅 活动时间线</h1>
          <p className="text-gray-500 mt-1">查看每日活动记录和时间分布</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Calendar and Filters */}
          <div className="space-y-6">
            {/* Calendar */}
            <CalendarView
              selectedDate={selectedDate}
              onDateSelect={handleDateSelect}
              maxDate={new Date()}
            />

            {/* Filters */}
            <TimelineFilter
              filters={filters}
              onChange={handleFilterChange}
            />

            {/* Daily Summary */}
            {summary && (
              <Card>
                <CardHeader title="📊 当日统计" />
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">记录时间</span>
                      <span className="font-medium text-gray-800">
                        {formatDuration(summary.totalTrackedTime)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">间隙时间</span>
                      <span className="font-medium text-gray-500">
                        {formatDuration(summary.totalGapTime)}
                      </span>
                    </div>
                    <div className="border-t border-gray-100 pt-3">
                      <p className="text-xs text-gray-500 mb-2">事件统计</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(summary.eventCounts).map(([type, count]) => (
                          <span
                            key={type}
                            className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600"
                          >
                            {type}: {count}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Timeline */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader 
                title={`📋 ${formattedDate}`}
                description={
                  events 
                    ? `共 ${events.length} 条记录` 
                    : '加载中...'
                }
              />
              <CardContent>
                {eventsError ? (
                  <div className="text-center py-8">
                    <div className="text-4xl mb-4">❌</div>
                    <p className="text-red-500">加载失败: {eventsError.message}</p>
                  </div>
                ) : (
                  <TimelineView
                    events={events ?? []}
                    isLoading={eventsLoading || summaryLoading}
                    showGaps={true}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
