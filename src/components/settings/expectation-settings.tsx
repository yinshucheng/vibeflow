'use client';

/**
 * ExpectationSettings Component
 * 
 * Form for configuring daily expected work time and pomodoro count.
 * Supports different expectations for different days of the week.
 * Requirements: 10.1, 10.2, 10.10
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { Card, CardHeader, CardContent } from '@/components/layout';
import { trpc } from '@/lib/trpc';

// Weekday expectation interface
export interface WeekdayExpectation {
  workMinutes: number;
  pomodoroCount: number;
}

// Weekday expectations map (0-6 for Sunday-Saturday)
export type WeekdayExpectations = Record<string, WeekdayExpectation>;

interface ExpectationConfig {
  expectedWorkMinutes: number;
  expectedPomodoroCount: number;
  useWeekdayExpectations: boolean;
  weekdayExpectations: WeekdayExpectations;
}

const WEEKDAYS = [
  { key: '0', label: '周日', short: '日' },
  { key: '1', label: '周一', short: '一' },
  { key: '2', label: '周二', short: '二' },
  { key: '3', label: '周三', short: '三' },
  { key: '4', label: '周四', short: '四' },
  { key: '5', label: '周五', short: '五' },
  { key: '6', label: '周六', short: '六' },
];

// Format minutes to hours and minutes display
function formatMinutesToDisplay(minutes: number): { hours: number; mins: number } {
  return {
    hours: Math.floor(minutes / 60),
    mins: minutes % 60,
  };
}

// Convert hours and minutes to total minutes
function toTotalMinutes(hours: number, mins: number): number {
  return hours * 60 + mins;
}

// Default weekday expectations (weekdays vs weekends)
function getDefaultWeekdayExpectations(workMinutes: number, pomodoroCount: number): WeekdayExpectations {
  const weekdayExpectation = { workMinutes, pomodoroCount };
  const weekendExpectation = { workMinutes: Math.floor(workMinutes / 3), pomodoroCount: Math.floor(pomodoroCount / 3) };
  
  return {
    '0': weekendExpectation, // Sunday
    '1': weekdayExpectation,
    '2': weekdayExpectation,
    '3': weekdayExpectation,
    '4': weekdayExpectation,
    '5': weekdayExpectation,
    '6': weekendExpectation, // Saturday
  };
}

export function ExpectationSettings() {
  const utils = trpc.useUtils();
  
  const { data: settings, isLoading } = trpc.settings.get.useQuery();
  
  const [formData, setFormData] = useState<ExpectationConfig>({
    expectedWorkMinutes: 360, // 6 hours default
    expectedPomodoroCount: 10,
    useWeekdayExpectations: false,
    weekdayExpectations: getDefaultWeekdayExpectations(360, 10),
  });
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update form when settings load
  useEffect(() => {
    if (settings) {
      const s = settings as {
        expectedWorkMinutes?: number;
        expectedPomodoroCount?: number;
        weekdayExpectations?: WeekdayExpectations | string;
      };
      
      const workMinutes = s.expectedWorkMinutes ?? 360;
      const pomodoroCount = s.expectedPomodoroCount ?? 10;
      
      // Parse weekdayExpectations - could be JSON string or object
      let weekdayExpectations: WeekdayExpectations = getDefaultWeekdayExpectations(workMinutes, pomodoroCount);
      let useWeekdayExpectations = false;
      
      if (s.weekdayExpectations) {
        if (typeof s.weekdayExpectations === 'string') {
          try {
            const parsed = JSON.parse(s.weekdayExpectations);
            if (Object.keys(parsed).length > 0) {
              weekdayExpectations = parsed;
              useWeekdayExpectations = true;
            }
          } catch {
            // Use default
          }
        } else if (Object.keys(s.weekdayExpectations).length > 0) {
          weekdayExpectations = s.weekdayExpectations;
          useWeekdayExpectations = true;
        }
      }
      
      setFormData({
        expectedWorkMinutes: workMinutes,
        expectedPomodoroCount: pomodoroCount,
        useWeekdayExpectations,
        weekdayExpectations,
      });
    }
  }, [settings]);

  const updateMutation = trpc.settings.updateExpectations.useMutation({
    onSuccess: () => {
      utils.settings.get.invalidate();
      setIsDirty(false);
      setError(null);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleWorkMinutesChange = (hours: number, mins: number) => {
    const totalMinutes = toTotalMinutes(hours, mins);
    setFormData(prev => ({ ...prev, expectedWorkMinutes: totalMinutes }));
    setIsDirty(true);
  };

  const handlePomodoroCountChange = (count: number) => {
    setFormData(prev => ({ ...prev, expectedPomodoroCount: count }));
    setIsDirty(true);
  };

  const handleToggleWeekdayExpectations = () => {
    setFormData(prev => {
      if (!prev.useWeekdayExpectations) {
        // Initialize weekday expectations from current default values
        return {
          ...prev,
          useWeekdayExpectations: true,
          weekdayExpectations: getDefaultWeekdayExpectations(
            prev.expectedWorkMinutes,
            prev.expectedPomodoroCount
          ),
        };
      }
      return { ...prev, useWeekdayExpectations: false };
    });
    setIsDirty(true);
  };

  const handleWeekdayChange = (
    dayKey: string,
    field: 'workMinutes' | 'pomodoroCount',
    value: number
  ) => {
    setFormData(prev => ({
      ...prev,
      weekdayExpectations: {
        ...prev.weekdayExpectations,
        [dayKey]: {
          ...prev.weekdayExpectations[dayKey],
          [field]: value,
        },
      },
    }));
    setIsDirty(true);
  };

  const handleWeekdayWorkMinutesChange = (dayKey: string, hours: number, mins: number) => {
    handleWeekdayChange(dayKey, 'workMinutes', toTotalMinutes(hours, mins));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    updateMutation.mutate({
      expectedWorkMinutes: formData.expectedWorkMinutes,
      expectedPomodoroCount: formData.expectedPomodoroCount,
      weekdayExpectations: formData.useWeekdayExpectations 
        ? formData.weekdayExpectations 
        : undefined,
    });
  };

  const handleReset = () => {
    if (settings) {
      const s = settings as {
        expectedWorkMinutes?: number;
        expectedPomodoroCount?: number;
        weekdayExpectations?: WeekdayExpectations | string;
      };
      
      const workMinutes = s.expectedWorkMinutes ?? 360;
      const pomodoroCount = s.expectedPomodoroCount ?? 10;
      
      let weekdayExpectations: WeekdayExpectations = getDefaultWeekdayExpectations(workMinutes, pomodoroCount);
      let useWeekdayExpectations = false;
      
      if (s.weekdayExpectations) {
        if (typeof s.weekdayExpectations === 'string') {
          try {
            const parsed = JSON.parse(s.weekdayExpectations);
            if (Object.keys(parsed).length > 0) {
              weekdayExpectations = parsed;
              useWeekdayExpectations = true;
            }
          } catch {
            // Use default
          }
        } else if (Object.keys(s.weekdayExpectations).length > 0) {
          weekdayExpectations = s.weekdayExpectations;
          useWeekdayExpectations = true;
        }
      }
      
      setFormData({
        expectedWorkMinutes: workMinutes,
        expectedPomodoroCount: pomodoroCount,
        useWeekdayExpectations,
        weekdayExpectations,
      });
      setIsDirty(false);
      setError(null);
    }
  };

  // Calculate weekly totals
  const weeklyTotals = formData.useWeekdayExpectations
    ? Object.values(formData.weekdayExpectations).reduce(
        (acc, day) => ({
          workMinutes: acc.workMinutes + day.workMinutes,
          pomodoroCount: acc.pomodoroCount + day.pomodoroCount,
        }),
        { workMinutes: 0, pomodoroCount: 0 }
      )
    : {
        workMinutes: formData.expectedWorkMinutes * 7,
        pomodoroCount: formData.expectedPomodoroCount * 7,
      };

  if (isLoading) {
    return (
      <Card>
        <CardHeader title="预期时间设置" description="设置每日预期工作时间" />
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-gray-100 rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const { hours: workHours, mins: workMins } = formatMinutesToDisplay(formData.expectedWorkMinutes);

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader 
          title="预期时间设置" 
          description="设置每日预期工作时间和番茄数量，用于复盘对比"
        />
        <CardContent className="space-y-6">
          {/* Default Daily Expectations */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700">📊 默认每日预期</h3>
            
            {/* Expected Work Time (Requirements 10.1) */}
            <div>
              <label className="block text-sm text-gray-600 mb-2">
                预期工作时间
              </label>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={24}
                    value={workHours}
                    onChange={(e) => handleWorkMinutesChange(parseInt(e.target.value) || 0, workMins)}
                    className="w-16 px-2 py-1 border border-gray-300 rounded text-center"
                  />
                  <span className="text-sm text-gray-500">小时</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={59}
                    step={5}
                    value={workMins}
                    onChange={(e) => handleWorkMinutesChange(workHours, parseInt(e.target.value) || 0)}
                    className="w-16 px-2 py-1 border border-gray-300 rounded text-center"
                  />
                  <span className="text-sm text-gray-500">分钟</span>
                </div>
              </div>
            </div>

            {/* Expected Pomodoro Count (Requirements 10.2) */}
            <div>
              <label className="block text-sm text-gray-600 mb-2">
                预期番茄数量
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={formData.expectedPomodoroCount}
                  onChange={(e) => handlePomodoroCountChange(parseInt(e.target.value) || 0)}
                  className="w-20 px-2 py-1 border border-gray-300 rounded text-center"
                />
                <span className="text-sm text-gray-500">个番茄</span>
                <span className="text-xs text-gray-400">
                  (约 {Math.round(formData.expectedPomodoroCount * 25 / 60 * 10) / 10} 小时专注时间)
                </span>
              </div>
            </div>
          </div>

          {/* Weekday-specific Expectations Toggle (Requirements 10.10) */}
          <div className="pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700">📅 按星期设置不同预期</h3>
                <p className="text-xs text-gray-500 mt-1">
                  为工作日和周末设置不同的预期值
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={formData.useWeekdayExpectations}
                onClick={handleToggleWeekdayExpectations}
                className={`
                  relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                  ${formData.useWeekdayExpectations ? 'bg-blue-600' : 'bg-gray-300'}
                `}
              >
                <span
                  className={`
                    inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                    ${formData.useWeekdayExpectations ? 'translate-x-6' : 'translate-x-1'}
                  `}
                />
              </button>
            </div>

            {/* Weekday-specific Settings */}
            {formData.useWeekdayExpectations && (
              <div className="space-y-3">
                {WEEKDAYS.map((day) => {
                  const dayExpectation = formData.weekdayExpectations[day.key] || {
                    workMinutes: formData.expectedWorkMinutes,
                    pomodoroCount: formData.expectedPomodoroCount,
                  };
                  const { hours: dayHours, mins: dayMins } = formatMinutesToDisplay(dayExpectation.workMinutes);
                  const isWeekend = day.key === '0' || day.key === '6';
                  
                  return (
                    <div 
                      key={day.key}
                      className={`
                        flex items-center gap-4 p-3 rounded-lg border
                        ${isWeekend ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-200'}
                      `}
                    >
                      <span className={`
                        w-12 text-sm font-medium
                        ${isWeekend ? 'text-orange-700' : 'text-gray-700'}
                      `}>
                        {day.label}
                      </span>
                      
                      {/* Work Time */}
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={24}
                          value={dayHours}
                          onChange={(e) => handleWeekdayWorkMinutesChange(
                            day.key,
                            parseInt(e.target.value) || 0,
                            dayMins
                          )}
                          className="w-12 px-1 py-1 border border-gray-300 rounded text-center text-sm"
                        />
                        <span className="text-xs text-gray-500">h</span>
                        <input
                          type="number"
                          min={0}
                          max={59}
                          step={5}
                          value={dayMins}
                          onChange={(e) => handleWeekdayWorkMinutesChange(
                            day.key,
                            dayHours,
                            parseInt(e.target.value) || 0
                          )}
                          className="w-12 px-1 py-1 border border-gray-300 rounded text-center text-sm"
                        />
                        <span className="text-xs text-gray-500">m</span>
                      </div>
                      
                      {/* Pomodoro Count */}
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={50}
                          value={dayExpectation.pomodoroCount}
                          onChange={(e) => handleWeekdayChange(
                            day.key,
                            'pomodoroCount',
                            parseInt(e.target.value) || 0
                          )}
                          className="w-12 px-1 py-1 border border-gray-300 rounded text-center text-sm"
                        />
                        <span className="text-xs text-gray-500">🍅</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Weekly Summary */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-700 mb-2">📈 每周预期汇总</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">预期工作时间:</span>
                <span className="ml-2 font-medium text-gray-900">
                  {Math.floor(weeklyTotals.workMinutes / 60)}小时{weeklyTotals.workMinutes % 60}分钟
                </span>
              </div>
              <div>
                <span className="text-gray-500">预期番茄数量:</span>
                <span className="ml-2 font-medium text-gray-900">
                  {weeklyTotals.pomodoroCount} 个
                </span>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleReset}
              disabled={!isDirty}
            >
              重置
            </Button>
            <Button 
              type="submit" 
              isLoading={updateMutation.isPending}
              disabled={!isDirty}
            >
              保存设置
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
