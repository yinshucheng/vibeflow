'use client';

/**
 * DistractionAppsSettings Component
 * 
 * Manages the list of distraction apps that will be controlled during focus sessions.
 * This component is designed to work with the Electron desktop app.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.7
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { Card, CardHeader, CardContent } from '@/components/layout';
import { SettingsLockIndicator } from './settings-lock-indicator';
import { useSettingsLock } from '@/hooks/use-settings-lock';

// Types matching the Electron app
interface DistractionApp {
  bundleId: string;
  name: string;
  action: 'force_quit' | 'hide_window';
  isPreset: boolean;
}

interface RunningApp {
  bundleId: string;
  name: string;
  pid: number;
  isActive: boolean;
}

type AppCategory = 
  | 'social_messaging'
  | 'music_audio'
  | 'video_entertainment'
  | 'gaming'
  | 'social_media'
  | 'other';

interface CategoryInfo {
  id: AppCategory;
  name: string;
  description: string;
  defaultAction: 'force_quit' | 'hide_window';
}

// Check if running in Electron
const isElectron = typeof window !== 'undefined' && window.vibeflow?.platform?.isElectron;

// Category icons
const CATEGORY_ICONS: Record<AppCategory, string> = {
  social_messaging: '💬',
  music_audio: '🎵',
  video_entertainment: '🎬',
  gaming: '🎮',
  social_media: '📱',
  other: '📦',
};

// Action icons
const ACTION_ICONS = {
  force_quit: '🚫',
  hide_window: '👁️',
};

interface AppListItemProps {
  app: DistractionApp;
  isRunning: boolean;
  onToggleAction: () => void;
  onRemove: () => void;
  isLocked: boolean;
}

function AppListItem({ app, isRunning, onToggleAction, onRemove, isLocked }: AppListItemProps) {
  return (
    <li className={`flex items-center justify-between p-3 rounded-lg border ${
      app.action === 'force_quit' 
        ? 'bg-red-50 border-red-100' 
        : 'bg-yellow-50 border-yellow-100'
    }`}>
      <div className="flex items-center gap-3">
        <span className="text-lg">{ACTION_ICONS[app.action]}</span>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900">{app.name}</span>
            {app.isPreset && (
              <span className="px-1.5 py-0.5 text-xs bg-gray-200 text-gray-600 rounded">
                Preset
              </span>
            )}
            {isRunning && (
              <span className="px-1.5 py-0.5 text-xs bg-green-200 text-green-700 rounded animate-pulse">
                Running
              </span>
            )}
          </div>
          <code className="text-xs text-gray-500">{app.bundleId}</code>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        {/* Toggle Action Button */}
        <button
          onClick={onToggleAction}
          disabled={isLocked}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            isLocked 
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
          }`}
          title={app.action === 'force_quit' ? 'Switch to Hide' : 'Switch to Force Quit'}
        >
          {app.action === 'force_quit' ? 'Force Quit' : 'Hide'}
        </button>
        
        {/* Remove Button */}
        {!app.isPreset && (
          <button
            onClick={onRemove}
            disabled={isLocked}
            className={`p-1 transition-colors ${
              isLocked 
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-gray-400 hover:text-red-500'
            }`}
            title="Remove app"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </li>
  );
}

interface CategorySectionProps {
  category: CategoryInfo;
  apps: DistractionApp[];
  runningApps: Set<string>;
  onToggleAction: (bundleId: string) => void;
  onRemove: (bundleId: string) => void;
  isLocked: boolean;
}

function CategorySection({ 
  category, 
  apps, 
  runningApps, 
  onToggleAction, 
  onRemove,
  isLocked,
}: CategorySectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  if (apps.length === 0) return null;
  
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span>{CATEGORY_ICONS[category.id]}</span>
          <span className="font-medium text-gray-900">{category.name}</span>
          <span className="text-sm text-gray-500">({apps.length})</span>
        </div>
        <svg 
          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isExpanded && (
        <ul className="p-3 space-y-2">
          {apps.map((app) => (
            <AppListItem
              key={app.bundleId}
              app={app}
              isRunning={runningApps.has(app.bundleId)}
              onToggleAction={() => onToggleAction(app.bundleId)}
              onRemove={() => onRemove(app.bundleId)}
              isLocked={isLocked}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export function DistractionAppsSettings() {
  const [apps, setApps] = useState<DistractionApp[]>([]);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [appsByCategory, setAppsByCategory] = useState<Record<AppCategory, DistractionApp[]>>({
    social_messaging: [],
    music_audio: [],
    video_entertainment: [],
    gaming: [],
    social_media: [],
    other: [],
  });
  const [runningApps, setRunningApps] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [newAppName, setNewAppName] = useState('');
  const [newAppBundleId, setNewAppBundleId] = useState('');
  const [error, setError] = useState('');
  
  const settingsLock = useSettingsLock();
  const lockStatus = settingsLock.getStatus('distractionApps');
  const isLocked = lockStatus.isLocked;

  // Load data from Electron
  useEffect(() => {
    if (!isElectron || !window.vibeflow) {
      setIsLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        const vibeflow = window.vibeflow!;
        const [presets, cats, byCategory] = await Promise.all([
          vibeflow.distractionApps.getPresets(),
          vibeflow.distractionApps.getCategories(),
          vibeflow.distractionApps.getByCategory(),
        ]);
        
        setApps(presets);
        setCategories(cats);
        setAppsByCategory(byCategory);
      } catch (err) {
        console.error('Failed to load distraction apps:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // Poll for running apps
  useEffect(() => {
    if (!isElectron || !window.vibeflow || apps.length === 0) return;

    const checkRunningApps = async () => {
      try {
        const vibeflow = window.vibeflow!;
        const running = await vibeflow.distractionApps.getRunning(apps);
        setRunningApps(new Set(running.map(app => app.bundleId)));
      } catch (err) {
        console.error('Failed to check running apps:', err);
      }
    };

    checkRunningApps();
    const interval = setInterval(checkRunningApps, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [apps]);

  const handleToggleAction = (bundleId: string) => {
    if (isLocked) return;
    
    setApps(prev => prev.map(app => {
      if (app.bundleId === bundleId) {
        return {
          ...app,
          action: app.action === 'force_quit' ? 'hide_window' : 'force_quit',
        };
      }
      return app;
    }));
    
    // Update by category as well
    setAppsByCategory(prev => {
      const updated = { ...prev };
      for (const category of Object.keys(updated) as AppCategory[]) {
        updated[category] = updated[category].map(app => {
          if (app.bundleId === bundleId) {
            return {
              ...app,
              action: app.action === 'force_quit' ? 'hide_window' : 'force_quit',
            };
          }
          return app;
        });
      }
      return updated;
    });
  };

  const handleRemove = (bundleId: string) => {
    if (isLocked) return;
    
    setApps(prev => prev.filter(app => app.bundleId !== bundleId));
    
    // Update by category as well
    setAppsByCategory(prev => {
      const updated = { ...prev };
      for (const category of Object.keys(updated) as AppCategory[]) {
        updated[category] = updated[category].filter(app => app.bundleId !== bundleId);
      }
      return updated;
    });
  };

  const handleAddCustomApp = () => {
    if (isLocked) return;
    
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
    
    const newApp: DistractionApp = {
      bundleId: trimmedBundleId,
      name: trimmedName,
      action: 'hide_window',
      isPreset: false,
    };
    
    setApps(prev => [...prev, newApp]);
    setAppsByCategory(prev => ({
      ...prev,
      other: [...prev.other, newApp],
    }));
    
    setNewAppName('');
    setNewAppBundleId('');
    setError('');
  };

  // Not running in Electron
  if (!isElectron) {
    return (
      <Card>
        <CardHeader 
          title="🖥️ Distraction Apps" 
          description="Control apps that distract you during focus sessions"
        />
        <CardContent>
          <div className="py-8 text-center">
            <span className="text-4xl block mb-4">💻</span>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Desktop App Required</h3>
            <p className="text-gray-500 max-w-md mx-auto">
              Distraction app control is only available in the VibeFlow desktop application.
              Download the desktop app to control apps like WeChat, Slack, Discord, and more during focus sessions.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader 
          title="🖥️ Distraction Apps" 
          description="Control apps that distract you during focus sessions"
        />
        <CardContent>
          <div className="py-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-500">Loading distraction apps...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Settings Lock Indicator */}
      {isLocked && (
        <SettingsLockIndicator 
          settingKey="distractionApps"
          showLabel
        />
      )}

      {/* Info Banner */}
      <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg">
        <div className="flex gap-3">
          <span className="text-xl">💡</span>
          <div>
            <h3 className="text-sm font-medium text-blue-900">How Distraction App Control Works</h3>
            <p className="mt-1 text-sm text-blue-700">
              During <strong>Focus Mode</strong>, apps in this list will be automatically controlled based on your enforcement mode.
              In <strong>Strict Mode</strong>, apps are force quit. In <strong>Gentle Mode</strong>, apps are hidden with a warning first.
            </p>
          </div>
        </div>
      </div>

      {/* Running Apps Summary */}
      {runningApps.size > 0 && (
        <div className="p-4 bg-yellow-50 border border-yellow-100 rounded-lg">
          <div className="flex gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <h3 className="text-sm font-medium text-yellow-900">
                {runningApps.size} Distraction App{runningApps.size > 1 ? 's' : ''} Running
              </h3>
              <p className="mt-1 text-sm text-yellow-700">
                These apps will be controlled when you start a focus session.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom App */}
      <Card>
        <CardHeader 
          title="➕ Add Custom App" 
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
                disabled={isLocked}
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
                disabled={isLocked}
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button
            onClick={handleAddCustomApp}
            disabled={isLocked || !newAppName.trim() || !newAppBundleId.trim()}
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

      {/* Apps by Category */}
      <Card>
        <CardHeader 
          title="📱 Distraction Apps" 
          description="Apps that will be controlled during focus sessions"
        />
        <CardContent className="space-y-4">
          {categories.map((category) => (
            <CategorySection
              key={category.id}
              category={category}
              apps={appsByCategory[category.id] || []}
              runningApps={runningApps}
              onToggleAction={handleToggleAction}
              onRemove={handleRemove}
              isLocked={isLocked}
            />
          ))}
        </CardContent>
      </Card>

      {/* Action Legend */}
      <div className="p-4 bg-gray-50 rounded-lg">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Action Types</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-start gap-2">
            <span className="text-lg">{ACTION_ICONS.force_quit}</span>
            <div>
              <p className="text-sm font-medium text-gray-900">Force Quit</p>
              <p className="text-xs text-gray-500">App will be completely closed</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-lg">{ACTION_ICONS.hide_window}</span>
            <div>
              <p className="text-sm font-medium text-gray-900">Hide Window</p>
              <p className="text-xs text-gray-500">App will be hidden but keep running</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
