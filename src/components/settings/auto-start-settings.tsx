'use client';

/**
 * AutoStartSettings Component
 * 
 * Form for configuring Pomodoro auto-start behavior for breaks and next pomodoros.
 * Requirements: 7.1, 7.2
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { Card, CardHeader, CardContent } from '@/components/layout';
import { trpc } from '@/lib/trpc';

interface AutoStartSettings {
  autoStartBreak: boolean;
  autoStartNextPomodoro: boolean;
  autoStartCountdown: number;
}

export function AutoStartSettings() {
  const utils = trpc.useUtils();
  
  const { data: settings, isLoading } = trpc.settings.get.useQuery();
  
  const [formData, setFormData] = useState<AutoStartSettings>({
    autoStartBreak: false,
    autoStartNextPomodoro: false,
    autoStartCountdown: 5,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);

  // Update form when settings load
  useEffect(() => {
    if (settings) {
      // Type assertion needed as Prisma types may not be fully synced
      const s = settings as {
        autoStartBreak?: boolean;
        autoStartNextPomodoro?: boolean;
        autoStartCountdown?: number;
      };
      setFormData({
        autoStartBreak: s.autoStartBreak ?? false,
        autoStartNextPomodoro: s.autoStartNextPomodoro ?? false,
        autoStartCountdown: s.autoStartCountdown ?? 5,
      });
    }
  }, [settings]);

  const updateMutation = trpc.settings.updateAutoStart.useMutation({
    onSuccess: () => {
      utils.settings.get.invalidate();
      setIsDirty(false);
      setErrors({});
    },
    onError: (err: { message: string }) => {
      setErrors({ submit: err.message });
    },
  });

  const handleToggle = (field: 'autoStartBreak' | 'autoStartNextPomodoro') => {
    setFormData(prev => ({ ...prev, [field]: !prev[field] }));
    setIsDirty(true);
  };

  const handleCountdownChange = (value: number) => {
    setFormData(prev => ({ ...prev, autoStartCountdown: value }));
    setIsDirty(true);
    if (errors.autoStartCountdown) {
      setErrors(prev => {
        const next = { ...prev };
        delete next.autoStartCountdown;
        return next;
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Countdown: 3-30 seconds
    if (formData.autoStartCountdown < 3 || formData.autoStartCountdown > 30) {
      newErrors.autoStartCountdown = 'Must be between 3 and 30 seconds';
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
      // Type assertion needed as Prisma types may not be fully synced
      const s = settings as {
        autoStartBreak?: boolean;
        autoStartNextPomodoro?: boolean;
        autoStartCountdown?: number;
      };
      setFormData({
        autoStartBreak: s.autoStartBreak ?? false,
        autoStartNextPomodoro: s.autoStartNextPomodoro ?? false,
        autoStartCountdown: s.autoStartCountdown ?? 5,
      });
      setIsDirty(false);
      setErrors({});
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader title="Auto-Start Settings" description="Configure automatic transitions" />
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

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader 
          title="Auto-Start Settings" 
          description="Configure automatic transitions between pomodoros and breaks"
        />
        <CardContent className="space-y-6">
          {/* Auto-start Break Toggle */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex-1">
              <label htmlFor="autoStartBreak" className="block text-sm font-medium text-gray-700">
                ☕ Auto-start Break
              </label>
              <p className="text-xs text-gray-500 mt-1">
                Automatically start break period after completing a pomodoro
              </p>
            </div>
            <button
              id="autoStartBreak"
              type="button"
              role="switch"
              aria-checked={formData.autoStartBreak}
              onClick={() => handleToggle('autoStartBreak')}
              className={`
                relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent 
                transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2
                ${formData.autoStartBreak ? 'bg-green-500' : 'bg-gray-200'}
              `}
            >
              <span
                className={`
                  pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 
                  transition duration-200 ease-in-out
                  ${formData.autoStartBreak ? 'translate-x-5' : 'translate-x-0'}
                `}
              />
            </button>
          </div>

          {/* Auto-start Next Pomodoro Toggle */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex-1">
              <label htmlFor="autoStartNextPomodoro" className="block text-sm font-medium text-gray-700">
                🍅 Auto-start Next Pomodoro
              </label>
              <p className="text-xs text-gray-500 mt-1">
                Automatically start next pomodoro after break ends
              </p>
            </div>
            <button
              id="autoStartNextPomodoro"
              type="button"
              role="switch"
              aria-checked={formData.autoStartNextPomodoro}
              onClick={() => handleToggle('autoStartNextPomodoro')}
              className={`
                relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent 
                transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2
                ${formData.autoStartNextPomodoro ? 'bg-red-500' : 'bg-gray-200'}
              `}
            >
              <span
                className={`
                  pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 
                  transition duration-200 ease-in-out
                  ${formData.autoStartNextPomodoro ? 'translate-x-5' : 'translate-x-0'}
                `}
              />
            </button>
          </div>

          {/* Countdown Duration */}
          <div className={`transition-opacity duration-200 ${(!formData.autoStartBreak && !formData.autoStartNextPomodoro) ? 'opacity-50' : ''}`}>
            <label htmlFor="autoStartCountdown" className="block text-sm font-medium text-gray-700 mb-1">
              ⏱️ Countdown Duration
            </label>
            <div className="flex items-center gap-3">
              <input
                id="autoStartCountdown"
                type="range"
                min={3}
                max={30}
                step={1}
                value={formData.autoStartCountdown}
                onChange={(e) => handleCountdownChange(parseInt(e.target.value))}
                disabled={!formData.autoStartBreak && !formData.autoStartNextPomodoro}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:opacity-50"
              />
              <div className="w-20 text-center">
                <span className="text-lg font-semibold text-gray-900">{formData.autoStartCountdown}</span>
                <span className="text-sm text-gray-500 ml-1">sec</span>
              </div>
            </div>
            {errors.autoStartCountdown && (
              <p className="mt-1 text-sm text-red-600">{errors.autoStartCountdown}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Time to wait before auto-starting • Default: 5 seconds • Min: 3 • Max: 30
            </p>
          </div>

          {/* Info Box */}
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
            <h4 className="text-sm font-medium text-blue-800 mb-2">💡 How it works</h4>
            <ul className="text-xs text-blue-700 space-y-1">
              <li>• When auto-start is enabled, a countdown will appear before the next phase begins</li>
              <li>• You can click &quot;Start Now&quot; to skip the countdown</li>
              <li>• A notification sound will play during the countdown</li>
              <li>• If you don&apos;t respond within the idle threshold, an intervention may be triggered</li>
            </ul>
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
