'use client';

/**
 * TimerSettingsForm Component
 * 
 * Form for configuring Pomodoro timer durations and daily cap.
 * Requirements: 14.1, 14.2, 14.3, 14.4, 12.1
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { Card, CardHeader, CardContent } from '@/components/layout';
import { trpc } from '@/lib/trpc';

interface TimerSettings {
  pomodoroDuration: number;
  shortRestDuration: number;
  longRestDuration: number;
  longRestInterval: number;
  dailyCap: number;
}

export function TimerSettingsForm() {
  const utils = trpc.useUtils();
  
  const { data: settings, isLoading } = trpc.settings.get.useQuery();
  
  const [formData, setFormData] = useState<TimerSettings>({
    pomodoroDuration: 25,
    shortRestDuration: 5,
    longRestDuration: 15,
    longRestInterval: 4,
    dailyCap: 8,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);

  // Update form when settings load
  useEffect(() => {
    if (settings) {
      setFormData({
        pomodoroDuration: settings.pomodoroDuration,
        shortRestDuration: settings.shortRestDuration,
        longRestDuration: settings.longRestDuration,
        longRestInterval: settings.longRestInterval,
        dailyCap: settings.dailyCap,
      });
    }
  }, [settings]);

  const updateMutation = trpc.settings.updateTimer.useMutation({
    onSuccess: () => {
      utils.settings.get.invalidate();
      setIsDirty(false);
      setErrors({});
    },
    onError: (err: { message: string }) => {
      setErrors({ submit: err.message });
    },
  });

  const handleChange = (field: keyof TimerSettings, value: number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
    // Clear field error on change
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Pomodoro duration: 10-120 minutes (Requirement 14.5)
    if (formData.pomodoroDuration < 10 || formData.pomodoroDuration > 120) {
      newErrors.pomodoroDuration = 'Must be between 10 and 120 minutes';
    }

    // Short rest: 2-30 minutes (Requirement 14.5)
    if (formData.shortRestDuration < 2 || formData.shortRestDuration > 30) {
      newErrors.shortRestDuration = 'Must be between 2 and 30 minutes';
    }

    // Long rest: 5-60 minutes, must be >= short rest
    if (formData.longRestDuration < 5 || formData.longRestDuration > 60) {
      newErrors.longRestDuration = 'Must be between 5 and 60 minutes';
    } else if (formData.longRestDuration < formData.shortRestDuration) {
      newErrors.longRestDuration = 'Must be at least as long as short rest';
    }

    // Long rest interval: 1-10 pomodoros
    if (formData.longRestInterval < 1 || formData.longRestInterval > 10) {
      newErrors.longRestInterval = 'Must be between 1 and 10 pomodoros';
    }

    // Daily cap: 1-20 pomodoros (Requirement 12.1)
    if (formData.dailyCap < 1 || formData.dailyCap > 20) {
      newErrors.dailyCap = 'Must be between 1 and 20 pomodoros';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    updateMutation.mutate(formData);
  };

  const handleReset = () => {
    if (settings) {
      setFormData({
        pomodoroDuration: settings.pomodoroDuration,
        shortRestDuration: settings.shortRestDuration,
        longRestDuration: settings.longRestDuration,
        longRestInterval: settings.longRestInterval,
        dailyCap: settings.dailyCap,
      });
      setIsDirty(false);
      setErrors({});
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader title="Timer Settings" description="Configure your Pomodoro timer" />
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-16 bg-gray-100 rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader 
          title="Timer Settings" 
          description="Configure your Pomodoro timer durations and daily limits"
        />
        <CardContent className="space-y-6">
          {/* Pomodoro Duration */}
          <div>
            <label htmlFor="pomodoroDuration" className="block text-sm font-medium text-gray-700 mb-1">
              🍅 Pomodoro Duration
            </label>
            <div className="flex items-center gap-3">
              <input
                id="pomodoroDuration"
                type="range"
                min={10}
                max={120}
                step={5}
                value={formData.pomodoroDuration}
                onChange={(e) => handleChange('pomodoroDuration', parseInt(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-red-500"
              />
              <div className="w-20 text-center">
                <span className="text-lg font-semibold text-gray-900">{formData.pomodoroDuration}</span>
                <span className="text-sm text-gray-500 ml-1">min</span>
              </div>
            </div>
            {errors.pomodoroDuration && (
              <p className="mt-1 text-sm text-red-600">{errors.pomodoroDuration}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">Default: 25 minutes • Min: 10 • Max: 120</p>
          </div>

          {/* Short Rest Duration */}
          <div>
            <label htmlFor="shortRestDuration" className="block text-sm font-medium text-gray-700 mb-1">
              ☕ Short Rest Duration
            </label>
            <div className="flex items-center gap-3">
              <input
                id="shortRestDuration"
                type="range"
                min={2}
                max={30}
                step={1}
                value={formData.shortRestDuration}
                onChange={(e) => handleChange('shortRestDuration', parseInt(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-500"
              />
              <div className="w-20 text-center">
                <span className="text-lg font-semibold text-gray-900">{formData.shortRestDuration}</span>
                <span className="text-sm text-gray-500 ml-1">min</span>
              </div>
            </div>
            {errors.shortRestDuration && (
              <p className="mt-1 text-sm text-red-600">{errors.shortRestDuration}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">Default: 5 minutes • Min: 2 • Max: 30</p>
          </div>

          {/* Long Rest Duration */}
          <div>
            <label htmlFor="longRestDuration" className="block text-sm font-medium text-gray-700 mb-1">
              🌴 Long Rest Duration
            </label>
            <div className="flex items-center gap-3">
              <input
                id="longRestDuration"
                type="range"
                min={5}
                max={60}
                step={5}
                value={formData.longRestDuration}
                onChange={(e) => handleChange('longRestDuration', parseInt(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <div className="w-20 text-center">
                <span className="text-lg font-semibold text-gray-900">{formData.longRestDuration}</span>
                <span className="text-sm text-gray-500 ml-1">min</span>
              </div>
            </div>
            {errors.longRestDuration && (
              <p className="mt-1 text-sm text-red-600">{errors.longRestDuration}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">Default: 15 minutes • Min: 5 • Max: 60</p>
          </div>

          {/* Long Rest Interval */}
          <div>
            <label htmlFor="longRestInterval" className="block text-sm font-medium text-gray-700 mb-1">
              🔄 Long Rest After
            </label>
            <div className="flex items-center gap-3">
              <input
                id="longRestInterval"
                type="range"
                min={1}
                max={10}
                step={1}
                value={formData.longRestInterval}
                onChange={(e) => handleChange('longRestInterval', parseInt(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
              <div className="w-24 text-center">
                <span className="text-lg font-semibold text-gray-900">{formData.longRestInterval}</span>
                <span className="text-sm text-gray-500 ml-1">🍅</span>
              </div>
            </div>
            {errors.longRestInterval && (
              <p className="mt-1 text-sm text-red-600">{errors.longRestInterval}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">Take a long rest after this many pomodoros • Default: 4</p>
          </div>

          {/* Daily Cap */}
          <div className="pt-4 border-t border-gray-200">
            <label htmlFor="dailyCap" className="block text-sm font-medium text-gray-700 mb-1">
              🛑 Daily Cap (村上春树模式)
            </label>
            <div className="flex items-center gap-3">
              <input
                id="dailyCap"
                type="range"
                min={1}
                max={20}
                step={1}
                value={formData.dailyCap}
                onChange={(e) => handleChange('dailyCap', parseInt(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <div className="w-24 text-center">
                <span className="text-lg font-semibold text-gray-900">{formData.dailyCap}</span>
                <span className="text-sm text-gray-500 ml-1">🍅/day</span>
              </div>
            </div>
            {errors.dailyCap && (
              <p className="mt-1 text-sm text-red-600">{errors.dailyCap}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Maximum pomodoros per day to prevent burnout • Default: 8
            </p>
          </div>

          {/* Summary */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Daily Summary</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Max focus time:</span>
                <span className="ml-2 font-medium text-gray-900">
                  {Math.floor((formData.pomodoroDuration * formData.dailyCap) / 60)}h {(formData.pomodoroDuration * formData.dailyCap) % 60}m
                </span>
              </div>
              <div>
                <span className="text-gray-500">Long rests:</span>
                <span className="ml-2 font-medium text-gray-900">
                  {Math.floor(formData.dailyCap / formData.longRestInterval)} per day
                </span>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {errors.submit && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{errors.submit}</p>
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
              Reset
            </Button>
            <Button 
              type="submit" 
              isLoading={updateMutation.isPending}
              disabled={!isDirty}
            >
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
