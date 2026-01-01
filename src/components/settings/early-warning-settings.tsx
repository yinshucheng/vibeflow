'use client';

/**
 * EarlyWarningSettings Component
 * 
 * Form for configuring early warning notifications when falling behind daily goals.
 * Requirements: 26.1.1, 26.1.2, 26.1.3, 26.1.4, 26.1.5, 26.1.6
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { Card, CardHeader, CardContent } from '@/components/layout';
import { trpc } from '@/lib/trpc';

interface EarlyWarningSettings {
  enabled: boolean;
  interval: number; // 30, 60, 120 minutes
  threshold: number; // 50, 60, 70, 80 percent
  method: string[]; // browser_notification, desktop_notification
  quietStart: string | null; // "HH:mm" format
  quietEnd: string | null; // "HH:mm" format
}

const INTERVAL_OPTIONS = [
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
];

const THRESHOLD_OPTIONS = [
  { value: 50, label: '50%', description: 'Warn when below half expected progress' },
  { value: 60, label: '60%', description: 'Warn when below 60% expected progress' },
  { value: 70, label: '70%', description: 'Warn when below 70% expected progress (recommended)' },
  { value: 80, label: '80%', description: 'Warn when below 80% expected progress' },
];

const METHOD_OPTIONS = [
  { value: 'browser_notification', label: 'Browser Notification', icon: '🌐' },
  { value: 'desktop_notification', label: 'Desktop Notification', icon: '💻' },
];

export function EarlyWarningSettings() {
  const utils = trpc.useUtils();
  
  const { data: settings, isLoading } = trpc.settings.get.useQuery();
  
  const [formData, setFormData] = useState<EarlyWarningSettings>({
    enabled: true,
    interval: 60,
    threshold: 70,
    method: ['browser_notification'],
    quietStart: null,
    quietEnd: null,
  });
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update form when settings load
  useEffect(() => {
    if (settings) {
      // Use type assertion for early warning fields
      const s = settings as Record<string, unknown>;
      setFormData({
        enabled: (s['earlyWarningEnabled'] as boolean) ?? true,
        interval: (s['earlyWarningInterval'] as number) ?? 60,
        threshold: (s['earlyWarningThreshold'] as number) ?? 70,
        method: (s['earlyWarningMethod'] as string[]) ?? ['browser_notification'],
        quietStart: (s['earlyWarningQuietStart'] as string | null) ?? null,
        quietEnd: (s['earlyWarningQuietEnd'] as string | null) ?? null,
      });
    }
  }, [settings]);

  const updateMutation = trpc.settings.update.useMutation({
    onSuccess: () => {
      utils.settings.get.invalidate();
      setIsDirty(false);
      setError(null);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleChange = <K extends keyof EarlyWarningSettings>(
    field: K,
    value: EarlyWarningSettings[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
    setError(null);
  };

  const handleMethodToggle = (method: string) => {
    const newMethods = formData.method.includes(method)
      ? formData.method.filter(m => m !== method)
      : [...formData.method, method];
    
    // Ensure at least one method is selected
    if (newMethods.length > 0) {
      handleChange('method', newMethods);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate quiet hours
    if ((formData.quietStart && !formData.quietEnd) || (!formData.quietStart && formData.quietEnd)) {
      setError('Both quiet hours start and end must be set, or neither');
      return;
    }
    
    updateMutation.mutate({
      earlyWarningEnabled: formData.enabled,
      earlyWarningInterval: formData.interval,
      earlyWarningThreshold: formData.threshold,
      earlyWarningMethod: formData.method as ('browser_notification' | 'desktop_notification')[],
      earlyWarningQuietStart: formData.quietStart,
      earlyWarningQuietEnd: formData.quietEnd,
    });
  };

  const handleReset = () => {
    if (settings) {
      const s = settings as Record<string, unknown>;
      setFormData({
        enabled: (s['earlyWarningEnabled'] as boolean) ?? true,
        interval: (s['earlyWarningInterval'] as number) ?? 60,
        threshold: (s['earlyWarningThreshold'] as number) ?? 70,
        method: (s['earlyWarningMethod'] as string[]) ?? ['browser_notification'],
        quietStart: (s['earlyWarningQuietStart'] as string | null) ?? null,
        quietEnd: (s['earlyWarningQuietEnd'] as string | null) ?? null,
      });
      setIsDirty(false);
      setError(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader title="Early Warning Settings" description="Configure progress alerts" />
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-12 bg-gray-100 rounded" />
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
          title="Early Warning Settings" 
          description="Get notified when you're falling behind your daily goal"
        />
        <CardContent className="space-y-6">
          {/* Enable Toggle (Requirements: 26.1.1) */}
          <div className="flex items-center justify-between">
            <div>
              <label htmlFor="earlyWarningEnabled" className="text-sm font-medium text-gray-700">
                ⏰ Enable Early Warnings
              </label>
              <p className="text-xs text-gray-500 mt-1">
                Receive notifications when falling behind expected progress
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={formData.enabled}
              onClick={() => handleChange('enabled', !formData.enabled)}
              className={`
                relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                ${formData.enabled ? 'bg-blue-600' : 'bg-gray-200'}
              `}
            >
              <span
                className={`
                  inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                  ${formData.enabled ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </button>
          </div>

          {formData.enabled && (
            <>
              {/* Check Interval (Requirements: 26.1.2) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  📊 Check Interval
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  How often to check your progress against expected pace
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {INTERVAL_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleChange('interval', option.value)}
                      className={`
                        p-3 rounded-lg border-2 transition-colors text-center
                        ${formData.interval === option.value
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 hover:border-gray-300'
                        }
                      `}
                    >
                      <span className="text-sm font-medium">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Warning Threshold (Requirements: 26.1.3) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  📉 Warning Threshold
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  Warn when your actual progress falls below this percentage of expected progress
                </p>
                <div className="space-y-2">
                  {THRESHOLD_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleChange('threshold', option.value)}
                      className={`
                        w-full p-3 rounded-lg border-2 transition-colors text-left
                        ${formData.threshold === option.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                        }
                      `}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${formData.threshold === option.value ? 'text-blue-700' : 'text-gray-700'}`}>
                          {option.label}
                        </span>
                        {option.value === 70 && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                            Recommended
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{option.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Notification Method (Requirements: 26.1.4) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🔔 Notification Method
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  How you want to be notified (select one or more)
                </p>
                <div className="space-y-2">
                  {METHOD_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleMethodToggle(option.value)}
                      className={`
                        w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-colors
                        ${formData.method.includes(option.value)
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                        }
                      `}
                    >
                      <span className="text-lg">{option.icon}</span>
                      <span className={`text-sm font-medium ${formData.method.includes(option.value) ? 'text-blue-700' : 'text-gray-700'}`}>
                        {option.label}
                      </span>
                      {formData.method.includes(option.value) && (
                        <span className="ml-auto text-blue-600">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quiet Hours (Requirements: 26.1.5) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🤫 Quiet Hours (Optional)
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  Don&apos;t send warnings during these hours (e.g., lunch break)
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Start</label>
                    <input
                      type="time"
                      value={formData.quietStart || ''}
                      onChange={(e) => handleChange('quietStart', e.target.value || null)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">End</label>
                    <input
                      type="time"
                      value={formData.quietEnd || ''}
                      onChange={(e) => handleChange('quietEnd', e.target.value || null)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                {formData.quietStart && formData.quietEnd && (
                  <p className="text-xs text-gray-500 mt-2">
                    No warnings will be sent between {formData.quietStart} and {formData.quietEnd}
                  </p>
                )}
                {(formData.quietStart || formData.quietEnd) && (
                  <button
                    type="button"
                    onClick={() => {
                      handleChange('quietStart', null);
                      handleChange('quietEnd', null);
                    }}
                    className="mt-2 text-xs text-red-600 hover:text-red-700"
                  >
                    Clear quiet hours
                  </button>
                )}
              </div>
            </>
          )}

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
