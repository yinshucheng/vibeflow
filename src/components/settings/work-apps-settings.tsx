'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

interface WorkApp {
  bundleId: string;
  name: string;
}

function isWorkApp(obj: unknown): obj is WorkApp {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'bundleId' in obj &&
    'name' in obj &&
    typeof obj.bundleId === 'string' &&
    typeof obj.name === 'string'
  );
}

function parseWorkApps(data: unknown): WorkApp[] {
  if (!Array.isArray(data)) return [];
  return data.filter(isWorkApp);
}

const PRESET_WORK_APPS: WorkApp[] = [
  { bundleId: 'com.microsoft.VSCode', name: 'VS Code' },
  { bundleId: 'com.apple.Terminal', name: 'Terminal' },
  { bundleId: 'com.tdesktop.Telegram', name: 'Telegram' },
  { bundleId: 'us.zoom.xos', name: 'Zoom' },
  { bundleId: 'com.google.Chrome', name: 'Chrome' },
];

export function WorkAppsSettings() {
  const [customName, setCustomName] = useState('');
  const [customBundleId, setCustomBundleId] = useState('');

  const { data: settings } = trpc.settings.get.useQuery();
  const updateSettings = trpc.settings.update.useMutation();

  const workApps = parseWorkApps(settings?.workApps);

  const addApp = (app: WorkApp) => {
    const newWorkApps = [...workApps, app];
    updateSettings.mutate({ workApps: newWorkApps });
  };

  const addCustomApp = () => {
    if (!customName.trim() || !customBundleId.trim()) return;
    addApp({ name: customName.trim(), bundleId: customBundleId.trim() });
    setCustomName('');
    setCustomBundleId('');
  };

  const removeApp = (bundleId: string) => {
    const newWorkApps = workApps.filter((app) => app.bundleId !== bundleId);
    updateSettings.mutate({ workApps: newWorkApps });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Work Apps</h3>
      <p className="text-sm text-gray-600">
        Apps to block during REST and SLEEP states
      </p>

      <div className="space-y-2">
        {workApps.map((app) => (
          <div key={app.bundleId} className="flex items-center justify-between p-2 border rounded">
            <span>{app.name}</span>
            <button
              onClick={() => removeApp(app.bundleId)}
              className="text-red-600 hover:text-red-800"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Quick Add:</p>
        <div className="flex flex-wrap gap-2">
          {PRESET_WORK_APPS.filter(
            (preset) => !workApps.some((app) => app.bundleId === preset.bundleId)
          ).map((preset) => (
            <button
              key={preset.bundleId}
              onClick={() => addApp(preset)}
              className="px-3 py-1 text-sm border rounded hover:bg-gray-100"
            >
              + {preset.name}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 pt-4 border-t">
        <p className="text-sm font-medium">Add Custom App:</p>
        <div className="space-y-2">
          <input
            type="text"
            placeholder="App Name (e.g., Slack)"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            className="w-full px-3 py-2 text-sm border rounded"
          />
          <input
            type="text"
            placeholder="Bundle ID (e.g., com.tinyspeck.slackmacgap)"
            value={customBundleId}
            onChange={(e) => setCustomBundleId(e.target.value)}
            className="w-full px-3 py-2 text-sm border rounded"
          />
          <button
            onClick={addCustomApp}
            disabled={!customName.trim() || !customBundleId.trim()}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Add Custom App
          </button>
        </div>
      </div>
    </div>
  );
}
