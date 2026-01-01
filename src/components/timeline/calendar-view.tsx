'use client';

/**
 * CalendarView Component
 * 
 * A calendar component for date selection in the activity timeline.
 * Requirements: 6.1
 */

import { useState, useCallback, useMemo } from 'react';

interface CalendarViewProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
}

// Days of the week labels
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

// Month names
const MONTHS = [
  '一月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '十一月', '十二月'
];

// Helper to check if two dates are the same day
function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

// Helper to check if a date is today
function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

// Helper to get days in a month
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// Helper to get the first day of the month (0 = Sunday)
function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

// Format date as YYYY-MM-DD
function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function CalendarView({
  selectedDate,
  onDateSelect,
  minDate,
  maxDate,
}: CalendarViewProps) {
  // Current view month/year (for navigation)
  const [viewDate, setViewDate] = useState(() => new Date(selectedDate));

  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();

  // Calculate calendar grid
  const calendarDays = useMemo(() => {
    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
    
    const days: (Date | null)[] = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(viewYear, viewMonth, day));
    }
    
    return days;
  }, [viewYear, viewMonth]);

  // Navigate to previous month
  const goToPreviousMonth = useCallback(() => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }, []);

  // Navigate to next month
  const goToNextMonth = useCallback(() => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }, []);

  // Navigate to today
  const goToToday = useCallback(() => {
    const today = new Date();
    setViewDate(today);
    onDateSelect(today);
  }, [onDateSelect]);

  // Check if a date is selectable
  const isDateSelectable = useCallback((date: Date): boolean => {
    if (minDate && date < minDate) return false;
    if (maxDate && date > maxDate) return false;
    return true;
  }, [minDate, maxDate]);

  // Handle date click
  const handleDateClick = useCallback((date: Date) => {
    if (isDateSelectable(date)) {
      onDateSelect(date);
    }
  }, [isDateSelectable, onDateSelect]);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      {/* Header with navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={goToPreviousMonth}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="上个月"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-800">
            {viewYear}年 {MONTHS[viewMonth]}
          </h2>
          <button
            onClick={goToToday}
            className="px-2 py-1 text-xs bg-blue-100 text-blue-600 rounded hover:bg-blue-200 transition-colors"
          >
            今天
          </button>
        </div>
        
        <button
          onClick={goToNextMonth}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="下个月"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {WEEKDAYS.map((day, index) => (
          <div
            key={day}
            className={`
              text-center text-sm font-medium py-2
              ${index === 0 || index === 6 ? 'text-red-400' : 'text-gray-500'}
            `}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} className="h-10" />;
          }

          const isSelected = isSameDay(date, selectedDate);
          const isTodayDate = isToday(date);
          const isSelectable = isDateSelectable(date);
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;

          return (
            <button
              key={formatDateKey(date)}
              onClick={() => handleDateClick(date)}
              disabled={!isSelectable}
              className={`
                h-10 rounded-lg text-sm font-medium transition-all
                ${isSelected
                  ? 'bg-blue-600 text-white shadow-md'
                  : isTodayDate
                    ? 'bg-blue-100 text-blue-600 ring-2 ring-blue-300'
                    : isSelectable
                      ? isWeekend
                        ? 'text-red-400 hover:bg-gray-100'
                        : 'text-gray-700 hover:bg-gray-100'
                      : 'text-gray-300 cursor-not-allowed'
                }
              `}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>

      {/* Selected date display */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-sm text-gray-500">
          已选择: <span className="font-medium text-gray-800">{formatDateKey(selectedDate)}</span>
        </p>
      </div>
    </div>
  );
}

export default CalendarView;
