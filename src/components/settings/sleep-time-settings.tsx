'use client';

/**
 * SleepTimeSettings Component
 * 
 * Form for configuring sleep time window and enforcement apps.
 * Requirements: 9.1, 9.2, 10.1, 10.2, 10.3, 10.4
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { Card, CardHeader, CardContent } from '@/components/layout';
import { trpc } from '@/lib/trpc';

// Sleep enforcement app interface
interface SleepEnforcementApp {
  bundleId: string;
  name: string;
  isPreset: boolean;
}

// Preset sleep enforcement apps (Requirements: 10.2)
const PRESET_SLEEP_ENFORCEMENT_APPS: SleepEnforcementApp[] = [
  { bundleId: 'com.tencent.xinWeChat', name: 'WeChat', isPreset: true },
  { bundleId: 'company.thebrowser.Browser', name: 'Arc Browser', isPreset: true },
  { bundleId: 'com.tinyspeck.slackmacgap', name: 'Slack', isPreset: true },
  { bundleId: 'com.hnc.Discord', name: 'Discord', isPreset: true },
];

interface SleepTimeConfig {
  enabled: boolean;
  startTime: string;
  endTime: string;
  enforcementApps: SleepEnforcementApp[];
  snoozeLimit: number;
  snoozeDuration: number;
}

const DEFAULT_CONFIG: SleepTimeConfig = {
  enabled: false,
  startTime: '23:00',
  endTime: '07:00',
  enforcementApps: [],
  snoozeLimit: 2,
  snoozeDuration: 30,
};

// Validate time format (HH:mm)
function isValidTimeFormat(time: string): boolean {
  const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  return regex.test(time);
}

// Calculate sleep duration
function calculateSleepDuration(startTime: string, endTime: string): string {
  if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime)) {
    return '0h 0m';
  }
  
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  
  let startMins = sh * 60 + sm;
  let endMins = eh * 60 + em;
  
  // Handle overnight (e.g., 23:00 - 07:00)
  if (endMins <= startMins) {
    endMins += 24 * 60;
  }
  
  const totalMins = endMins - startMins;
  const hours = Math.floor(totalMins / 60);
  const minutes = totalMins % 60;
  
  return `${hours}h ${minutes}m`;
}

export function SleepTimeSettings() {
  const utils = trpc.useUtils();
  
  const { data: config, isLoading } = trpc.sleepTime.getConfig.useQuery();
  
  const [formData, setFormData] = useState<SleepTimeConfig>(DEFAULT_CONFIG);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newAppName, setNewAppName] = useState('');
  const [newAppBundleId, setNewAppBundleId] = useState('');
  const [addAppError, setAddAppError] = useState('');

  // Update form when config loads
  useEffect(() => {
    if (config) {
      setFormData({
        enabled: config.enabled,
        startTime: config.startTime,
        endTime: config.endTime,
        enforcementApps: config.enforcementApps,
        snoozeLimit: config.snoozeLimit,
        snoozeDuration: config.snoozeDuration,
      });
    }
  }, [config]);

  const updateMutation = trpc.sleepTime.updateConfig.useMutation({
    onSuccess: () => {
      utils.sleepTime.getConfig.invalidate();
      setIsDirty(false);
      setError(null);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleToggleEnabled = () => {
    setFormData(prev => ({ ...prev, enabled: !prev.enabled }));
    setIsDirty(true);
  };

  const handleTimeChange = (field: 'startTime' | 'endTime', value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleSnoozeChange = (field: 'snoozeLimit' | 'snoozeDuration', value: number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleTogglePresetApp = (app: SleepEnforcementApp) => {
    const exists = formData.enforcementApps.some(a => a.bundleId === app.bundleId);
    
    if (exists) {
      setFormData(prev => ({
        ...prev,
        enforcementApps: prev.enforcementApps.filter(a => a.bundleId !== app.bundleId),
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        enforcementApps: [...prev.enforcementApps, app],
      }));
    }
    setIsDirty(true);
  };

  const handleAddCustomApp = () => {
    const trimmedName = newAppName.trim();
    const trimmedBundleId = newAppBundleId.trim();
    
    if (!trimmedName) {
      setAddAppError('App name is required');
      return;
    }
    
    if (!trimmedBundleId) {
      setAddAppError('Bundle ID is required');
      return;
    }
    
    if (formData.enforcementApps.some(app => app.bundleId === trimmedBundleId)) {
      setAddAppError('This app is already in the list');
      return;
    }
    
    const newApp: SleepEnforcementApp = {
      bundleId: trimmedBundleId,
      name: trimmedName,
      isPreset: false,
    };
    
    setFormData(prev => ({
      ...prev,
      enforcementApps: [...prev.enforcementApps, newApp],
    }));
    
    setNewAppName('');
    setNewAppBundleId('');
    setAddAppError('');
    setIsDirty(true);
  };

  const handleRemoveApp = (bundleId: string) => {
    setFormData(prev => ({
      ...prev,
      enforcementApps: prev.enforcementApps.filter(a => a.bundleId !== bundleId),
    }));
    setIsDirty(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isValidTimeFormat(formData.startTime)) {
      setError('Invalid start time format');
      return;
    }
    
    if (!isValidTimeFormat(formData.endTime)) {
      setError('Invalid end time format');
      return;
    }

    updateMutation.mutate({
      enabled: formData.enabled,
      startTime: formData.startTime,
      endTime: formData.endTime,
      enforcementApps: formData.enforcementApps,
      snoozeLimit: formData.snoozeLimit,
      snoozeDuration: formData.snoozeDuration,
    });
  };

  const handleReset = () => {
    if (config) {
      setFormData({
        enabled: config.enabled,
        startTime: config.startTime,
        endTime: config.endTime,
        enforcementApps: config.enforcementApps,
        snoozeLimit: config.snoozeLimit,
        snoozeDuration: config.snoozeDuration,
      });
      setIsDirty(false);
      setError(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader title="😴 Sleep Time Settings" description="Configure your sleep time window" />
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
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Main Settings Card */}
      <Card>
        <CardHeader 
          title="😴 Sleep Time Settings"
          description="Configure when you should be sleeping and which apps to close"
        />
        <CardContent className="space-y-6">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Enable Sleep Time Reminder</h3>
              <p className="text-xs text-gray-500 mt-1">
                When enabled, specified apps will be closed during your sleep time window
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={formData.enabled}
              onClick={handleToggleEnabled}
              className={`
                relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer
                ${formData.enabled ? 'bg-blue-600' : 'bg-gray-300'}
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

          {/* Time Window */}
          <div className={`${!formData.enabled ? 'opacity-50' : ''}`}>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              🌙 Sleep Time Window
            </label>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Start Time</label>
                <input
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => handleTimeChange('startTime', e.target.value)}
                  disabled={!formData.enabled}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
              <span className="text-gray-400 mt-5">→</span>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">End Time</label>
                <input
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => handleTimeChange('endTime', e.target.value)}
                  disabled={!formData.enabled}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Sleep duration: <span className="font-medium">{calculateSleepDuration(formData.startTime, formData.endTime)}</span>
            </p>
          </div>

          {/* Snooze Settings */}
          <div className={`pt-4 border-t border-gray-200 ${!formData.enabled ? 'opacity-50' : ''}`}>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              ⏰ Snooze Settings
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Max Snoozes Per Night</label>
                <select
                  value={formData.snoozeLimit}
                  onChange={(e) => handleSnoozeChange('snoozeLimit', parseInt(e.target.value))}
                  disabled={!formData.enabled}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  {[0, 1, 2, 3, 4, 5].map(n => (
                    <option key={n} value={n}>{n} {n === 1 ? 'snooze' : 'snoozes'}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Snooze Duration</label>
                <select
                  value={formData.snoozeDuration}
                  onChange={(e) => handleSnoozeChange('snoozeDuration', parseInt(e.target.value))}
                  disabled={!formData.enabled}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>1 hour</option>
                </select>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              You can snooze sleep enforcement up to {formData.snoozeLimit} times per night, {formData.snoozeDuration} minutes each
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Enforcement Apps Card */}
      <Card>
        <CardHeader 
          title="📱 Apps to Close During Sleep"
          description="Select which apps should be closed during your sleep time"
        />
        <CardContent className={`space-y-4 ${!formData.enabled ? 'opacity-60' : ''}`}>
          {/* Preset Apps */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Preset Apps
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_SLEEP_ENFORCEMENT_APPS.map((app) => {
                const isSelected = formData.enforcementApps.some(a => a.bundleId === app.bundleId);
                return (
                  <button
                    key={app.bundleId}
                    type="button"
                    onClick={() => handleTogglePresetApp(app)}
                    disabled={!formData.enabled}
                    className={`
                      flex items-center gap-2 p-3 rounded-lg border-2 transition-colors text-left
                      ${isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                      }
                      ${!formData.enabled ? 'cursor-not-allowed' : 'cursor-pointer'}
                    `}
                  >
                    <span className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                      isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                    }`}>
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <span className={`text-sm ${isSelected ? 'text-blue-700 font-medium' : 'text-gray-700'}`}>
                      {app.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Apps */}
          <div className="pt-4 border-t border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Custom Apps
            </label>
            
            {/* List of custom apps */}
            {formData.enforcementApps.filter(a => !a.isPreset).length > 0 && (
              <ul className="space-y-2 mb-4">
                {formData.enforcementApps.filter(a => !a.isPreset).map((app) => (
                  <li 
                    key={app.bundleId}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <span className="text-sm font-medium text-gray-900">{app.name}</span>
                      <code className="ml-2 text-xs text-gray-500">{app.bundleId}</code>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveApp(app.bundleId)}
                      disabled={!formData.enabled}
                      className="text-gray-400 hover:text-red-500 transition-colors disabled:cursor-not-allowed"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Add custom app form */}
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={newAppName}
                onChange={(e) => {
                  setNewAppName(e.target.value);
                  setAddAppError('');
                }}
                placeholder="App Name"
                disabled={!formData.enabled}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
              <input
                type="text"
                value={newAppBundleId}
                onChange={(e) => {
                  setNewAppBundleId(e.target.value);
                  setAddAppError('');
                }}
                placeholder="Bundle ID (e.g., com.example.app)"
                disabled={!formData.enabled}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
            {addAppError && <p className="mt-1 text-sm text-red-600">{addAppError}</p>}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddCustomApp}
              disabled={!formData.enabled || !newAppName.trim() || !newAppBundleId.trim()}
              className="mt-2"
            >
              + Add Custom App
            </Button>
            <p className="mt-2 text-xs text-gray-500">
              💡 Tip: Find an app&apos;s bundle ID by running{' '}
              <code className="bg-gray-100 px-1 rounded">osascript -e &apos;id of app &quot;AppName&quot;&apos;</code>{' '}
              in Terminal.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 justify-end">
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
    </form>
  );
}
