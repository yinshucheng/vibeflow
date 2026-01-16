'use client';

/**
 * WorkAppsSettings Component
 *
 * Manages the list of work apps that will be controlled during REST/SLEEP states.
 * This component is designed to work with the Electron desktop app.
 */

import { useState } from 'react';
import { Button } from '@/components/ui';
import { Card, CardHeader, CardContent } from '@/components/layout';

interface WorkApp {
  bundleId: string;
  name: string;
  isPreset: boolean;
}

const isElectron = typeof window !== 'undefined' && window.vibeflow?.platform?.isElectron;

const PRESET_WORK_APPS: WorkApp[] = [
  // IDE
  { bundleId: 'com.microsoft.VSCode', name: 'VS Code', isPreset: true },
  { bundleId: 'com.todesktop.230313mzl4w4u92', name: 'Cursor', isPreset: true },
  { bundleId: 'com.jetbrains.intellij', name: 'IntelliJ IDEA', isPreset: true },
  { bundleId: 'com.apple.dt.Xcode', name: 'Xcode', isPreset: true },
  { bundleId: 'com.google.android.studio', name: 'Android Studio', isPreset: true },
  // Terminal
  { bundleId: 'com.apple.Terminal', name: 'Terminal', isPreset: true },
  { bundleId: 'com.googlecode.iterm2', name: 'iTerm', isPreset: true },
  { bundleId: 'dev.warp.Warp-Stable', name: 'Warp', isPreset: true },
  { bundleId: 'co.zeit.hyper', name: 'Hyper', isPreset: true },
  // Email
  { bundleId: 'com.apple.mail', name: 'Mail', isPreset: true },
  { bundleId: 'com.microsoft.Outlook', name: 'Outlook', isPreset: true },
  { bundleId: 'com.readdle.smartemail-Mac', name: 'Spark', isPreset: true },
  // Productivity
  { bundleId: 'notion.id', name: 'Notion', isPreset: true },
  { bundleId: 'md.obsidian', name: 'Obsidian', isPreset: true },
];

export function WorkAppsSettings() {
  const [apps, setApps] = useState<WorkApp[]>(PRESET_WORK_APPS);
  const [newAppName, setNewAppName] = useState('');
  const [newAppBundleId, setNewAppBundleId] = useState('');
  const [error, setError] = useState('');

  const handleAddCustomApp = () => {

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

    if (apps.some(app => app.bundleId === trimmedBundleId)) {
      setError('This app is already in the list');
      return;
    }

    const newApp: WorkApp = {
      bundleId: trimmedBundleId,
      name: trimmedName,
      isPreset: false,
    };

    setApps(prev => [...prev, newApp]);
    setNewAppName('');
    setNewAppBundleId('');
    setError('');
  };

  const handleRemove = (bundleId: string) => {
    setApps(prev => prev.filter(app => app.bundleId !== bundleId));
  };

  if (!isElectron) {
    return (
      <Card>
        <CardHeader
          title="Work Apps"
          description="Control work apps during rest and sleep time"
        />
        <CardContent>
          <div className="py-8 text-center">
            <span className="text-4xl block mb-4">💻</span>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Desktop App Required</h3>
            <p className="text-gray-500 max-w-md mx-auto">
              Work app control is only available in the VibeFlow desktop application.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg">
        <div className="flex gap-3">
          <span className="text-xl">💡</span>
          <div>
            <h3 className="text-sm font-medium text-blue-900">How Work App Control Works</h3>
            <p className="mt-1 text-sm text-blue-700">
              During <strong>Rest</strong> or <strong>Sleep</strong> time, apps in this list can be controlled to help you truly rest.
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Add Custom App"
          description="Add apps not in the preset list"
        />
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                App Name
              </label>
              <input
                type="text"
                value={newAppName}
                onChange={(e) => {
                  setNewAppName(e.target.value);
                  setError('');
                }}
                placeholder="e.g., My App"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bundle ID
              </label>
              <input
                type="text"
                value={newAppBundleId}
                onChange={(e) => {
                  setNewAppBundleId(e.target.value);
                  setError('');
                }}
                placeholder="e.g., com.example.app"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button
            onClick={handleAddCustomApp}
            disabled={!newAppName.trim() || !newAppBundleId.trim()}
            size="md"
          >
            Add App
          </Button>
          <p className="text-xs text-gray-500">
            💡 Tip: You can find an app&apos;s bundle ID by running{' '}
            <code className="bg-gray-100 px-1 rounded">osascript -e &apos;id of app &quot;AppName&quot;&apos;</code>{' '}
            in Terminal.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Work Apps"
          description="Apps that will be controlled during rest and sleep time"
        />
        <CardContent>
          <ul className="space-y-2">
            {apps.map((app) => (
              <li key={app.bundleId} className="flex items-center justify-between p-3 rounded-lg border bg-gray-50 border-gray-100">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{app.name}</span>
                    {app.isPreset && (
                      <span className="px-1.5 py-0.5 text-xs bg-gray-200 text-gray-600 rounded">
                        Preset
                      </span>
                    )}
                  </div>
                  <code className="text-xs text-gray-500">{app.bundleId}</code>
                </div>

                {!app.isPreset && (
                  <button
                    onClick={() => handleRemove(app.bundleId)}
                    className="p-1 transition-colors text-gray-400 hover:text-red-500"
                    title="Remove app"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
