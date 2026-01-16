'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

interface WorkApp {
  bundleId: string;
  name: string;
}

const PRESET_WORK_APPS: WorkApp[] = [
  { bundleId: 'com.microsoft.VSCode', name: 'VS Code' },
  { bundleId: 'com.apple.Terminal', name: 'Terminal' },
  { bundleId: 'com.tdesktop.Telegram', name: 'Telegram' },
  { bundleId: 'us.zoom.xos', name: 'Zoom' },
  { bundleId: 'com.google.Chrome', name: 'Chrome' },
];

export function WorkAppsSettings() {
  const { data: settings } = trpc.settings.get.useQuery();
  const updateSettings = trpc.settings.update.useMutation();

  const workApps = Array.isArray(settings?.workApps)
    ? (settings.workApps as unknown as WorkApp[])
    : [];

  const addApp = (app: WorkApp) => {
    const newWorkApps = [...workApps, app];
    updateSettings.mutate({ workApps: newWorkApps });
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
    </div>
  );
}
