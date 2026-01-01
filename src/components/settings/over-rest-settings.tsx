'use client';

/**
 * OverRestSettings Component
 * 
 * Manages over rest configuration including grace period, actions, and apps to close.
 * 
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5
 */

import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui';

// Types
type OverRestAction = 'show_notification' | 'close_browser' | 'close_apps';

interface OverRestApp {
  bundleId: string;
  name: string;
}

// Action display info
const ACTION_INFO: Record<OverRestAction, { label: string; icon: string; description: string }> = {
  show_notification: {
    label: 'Show Notification',
    icon: '🔔',
    description: 'Display a reminder notification',
  },
  close_browser: {
    label: 'Close Browser',
    icon: '🌐',
    description: 'Close the web browser',
  },
  close_apps: {
    label: 'Close Apps',
    icon: '📱',
    description: 'Close specified apps from the list below',
  },
};

// Grace period options (Requirements: 16.5)
const GRACE_PERIOD_OPTIONS = [1, 2, 3, 5, 7, 10];

export function OverRestSettings() {
  const [gracePeriod, setGracePeriod] = useState(5);
  const [actions, setActions] = useState<OverRestAction[]>(['show_notification']);
  const [apps, setApps] = useState<OverRestApp[]>([]);
  const [newAppName, setNewAppName] = useState('');
  const [newAppBundleId, setNewAppBundleId] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Fetch current config
  const { data: config, isLoading, refetch } = trpc.overRest.getConfig.useQuery();
  const { data: presetApps } = trpc.overRest.getPresetApps.useQuery();

  // Mutations
  const updateConfigMutation = trpc.overRest.updateConfig.useMutation({
    onSuccess: () => {
      refetch();
      setIsSaving(false);
    },
    onError: (err) => {
      setError(err.message);
      setIsSaving(false);
    },
  });

  const addAppMutation = trpc.overRest.addApp.useMutation({
    onSuccess: () => {
      refetch();
      setNewAppName('');
      setNewAppBundleId('');
      setError('');
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const removeAppMutation = trpc.overRest.removeApp.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  // Initialize state from config
  useEffect(() => {
    if (config) {
      setGracePeriod(config.gracePeriod);
      setActions(config.actions as OverRestAction[]);
      setApps(config.apps);
    }
  }, [config]);

  const handleToggleAction = (action: OverRestAction) => {
    setActions(prev => {
      if (prev.includes(action)) {
        // Don't allow removing all actions
        if (prev.length === 1) return prev;
        return prev.filter(a => a !== action);
      }
      return [...prev, action];
    });
  };

  const handleSave = () => {
    setIsSaving(true);
    setError('');
    updateConfigMutation.mutate({
      gracePeriod,
      actions,
      apps,
    });
  };

  const handleAddApp = () => {
    const trimmedName = newAppName.trim();
    const trimmedBundleId = newAppBundleId.trim();

    if (!trimmedName) {
      setError('App name is required');
      return;
    }

    if (!trimmedBundleId) {
      setError('Bundle ID is required');
      return;
    }

    addAppMutation.mutate({
      bundleId: trimmedBundleId,
      name: trimmedName,
    });
  };

  const handleRemoveApp = (bundleId: string) => {
    removeAppMutation.mutate({ bundleId });
  };

  const handleAddPresetApp = (app: OverRestApp) => {
    if (apps.some(a => a.bundleId === app.bundleId)) {
      setError('This app is already in the list');
      return;
    }
    addAppMutation.mutate(app);
  };

  const hasChanges = config && (
    gracePeriod !== config.gracePeriod ||
    JSON.stringify(actions.sort()) !== JSON.stringify((config.actions as OverRestAction[]).sort()) ||
    JSON.stringify(apps) !== JSON.stringify(config.apps)
  );

  if (isLoading) {
    return (
      <div className="py-8 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-gray-500">Loading over rest settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="p-4 bg-amber-50 border border-amber-100 rounded-lg">
        <div className="flex gap-3">
          <span className="text-xl">⏰</span>
          <div>
            <h3 className="text-sm font-medium text-amber-900">Over Rest Detection</h3>
            <p className="mt-1 text-sm text-amber-700">
              When you rest longer than your configured rest duration during work hours,
              the system can remind you to get back to work. Configure the grace period
              and actions below.
            </p>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Grace Period (Requirements: 16.5) */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-2">Grace Period</h3>
        <p className="text-sm text-gray-500 mb-4">
          How long to wait after rest time ends before triggering actions (1-10 minutes).
        </p>
        <div className="flex flex-wrap gap-2">
          {GRACE_PERIOD_OPTIONS.map((minutes) => (
            <button
              key={minutes}
              onClick={() => setGracePeriod(minutes)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                gracePeriod === minutes
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {minutes} min
            </button>
          ))}
        </div>
      </div>

      {/* Actions (Requirements: 16.2) */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-2">Actions</h3>
        <p className="text-sm text-gray-500 mb-4">
          What should happen when you&apos;re resting too long? Select one or more actions.
        </p>
        <div className="space-y-3">
          {(Object.keys(ACTION_INFO) as OverRestAction[]).map((action) => (
            <label
              key={action}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                actions.includes(action)
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
              }`}
            >
              <input
                type="checkbox"
                checked={actions.includes(action)}
                onChange={() => handleToggleAction(action)}
                className="mt-1 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span>{ACTION_INFO[action].icon}</span>
                  <span className="font-medium text-gray-900">{ACTION_INFO[action].label}</span>
                </div>
                <p className="text-sm text-gray-500 mt-0.5">{ACTION_INFO[action].description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Apps to Close (Requirements: 16.3) */}
      {actions.includes('close_apps') && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-2">Apps to Close</h3>
          <p className="text-sm text-gray-500 mb-4">
            These apps will be closed when over rest actions are triggered.
          </p>

          {/* Current Apps List */}
          {apps.length > 0 ? (
            <ul className="space-y-2 mb-4">
              {apps.map((app) => (
                <li
                  key={app.bundleId}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <span className="font-medium text-gray-900">{app.name}</span>
                    <code className="ml-2 text-xs text-gray-500">{app.bundleId}</code>
                  </div>
                  <button
                    onClick={() => handleRemoveApp(app.bundleId)}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    title="Remove app"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400 italic mb-4">No apps configured yet.</p>
          )}

          {/* Preset Apps */}
          {presetApps && presetApps.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Quick Add Presets</h4>
              <div className="flex flex-wrap gap-2">
                {presetApps
                  .filter(preset => !apps.some(a => a.bundleId === preset.bundleId))
                  .map((preset) => (
                    <button
                      key={preset.bundleId}
                      onClick={() => handleAddPresetApp(preset)}
                      className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                    >
                      + {preset.name}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Add Custom App */}
          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Add Custom App</h4>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">App Name</label>
                <input
                  type="text"
                  value={newAppName}
                  onChange={(e) => {
                    setNewAppName(e.target.value);
                    setError('');
                  }}
                  placeholder="e.g., Slack"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Bundle ID</label>
                <input
                  type="text"
                  value={newAppBundleId}
                  onChange={(e) => {
                    setNewAppBundleId(e.target.value);
                    setError('');
                  }}
                  placeholder="e.g., com.tinyspeck.slackmacgap"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <Button
              onClick={handleAddApp}
              disabled={!newAppName.trim() || !newAppBundleId.trim()}
              size="sm"
              variant="secondary"
            >
              Add App
            </Button>
            <p className="text-xs text-gray-500 mt-2">
              💡 Find bundle ID: <code className="bg-gray-100 px-1 rounded">osascript -e &apos;id of app &quot;AppName&quot;&apos;</code>
            </p>
          </div>
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          size="md"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
