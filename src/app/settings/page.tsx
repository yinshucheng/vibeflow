'use client';

/**
 * Settings Page
 * 
 * Main settings page with tabs for different configuration sections.
 * Requirements: 14.1, 14.2, 14.3, 14.4, 12.1, 13.1, 6.3, 9.4, 4.3, 4.4, 5.1, 5.2, 5.4, 8.2, 8.3, 7.1, 7.2, 9.3, 9.5
 */

import { useState } from 'react';
import { MainLayout, PageHeader } from '@/components/layout';
import { 
  TimerSettingsForm, 
  UrlListSettings, 
  CodingPrinciplesSettings, 
  NotificationSettings, 
  WorkTimeSettings, 
  ExpectationSettings,
  SettingsLockBanner,
  AutoStartSettings,
  ConnectedDevices,
  SleepTimeSettings,
  EarlyWarningSettings,
  OverRestSettings
} from '@/components/settings';

type SettingsTab = 'timer' | 'autostart' | 'worktime' | 'sleeptime' | 'overrest' | 'expectations' | 'notifications' | 'earlywarning' | 'browser' | 'principles' | 'devices';

interface TabConfig {
  id: SettingsTab;
  label: string;
  icon: string;
  description: string;
}

const tabs: TabConfig[] = [
  { 
    id: 'timer', 
    label: 'Timer', 
    icon: '⏱️',
    description: 'Pomodoro durations and daily limits'
  },
  { 
    id: 'autostart', 
    label: 'Auto-Start', 
    icon: '▶️',
    description: 'Automatic transitions between pomodoros and breaks'
  },
  { 
    id: 'worktime', 
    label: 'Work Time', 
    icon: '📅',
    description: 'Work hours and idle alert settings'
  },
  { 
    id: 'sleeptime', 
    label: 'Sleep Time', 
    icon: '😴',
    description: 'Sleep time window and app enforcement'
  },
  { 
    id: 'overrest', 
    label: 'Over Rest', 
    icon: '⏰',
    description: 'Actions when resting too long during work hours'
  },
  { 
    id: 'expectations', 
    label: 'Expectations', 
    icon: '🎯',
    description: 'Daily expected work time and pomodoro count'
  },
  { 
    id: 'notifications', 
    label: 'Notifications', 
    icon: '🔔',
    description: 'Completion alerts and sounds'
  },
  { 
    id: 'earlywarning', 
    label: 'Early Warning', 
    icon: '⚠️',
    description: 'Progress alerts when falling behind'
  },
  { 
    id: 'browser', 
    label: 'Browser', 
    icon: '🌐',
    description: 'Blacklist and whitelist URL patterns'
  },
  { 
    id: 'principles', 
    label: 'Principles', 
    icon: '📝',
    description: 'Coding standards and preferences'
  },
  { 
    id: 'devices', 
    label: 'Devices', 
    icon: '📱',
    description: 'Manage connected devices and clients'
  },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('timer');

  return (
    <MainLayout title="Settings">
      <PageHeader 
        title="Settings" 
        description="Configure your VibeFlow experience"
      />

      {/* Settings Lock Banner (Requirements 8.2, 8.3) */}
      <SettingsLockBanner className="mb-4" />

      {/* Tab Navigation */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex gap-4 -mb-px overflow-x-auto" aria-label="Settings tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                  ${activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          {tabs.find(t => t.id === activeTab)?.description}
        </p>
      </div>

      {/* Tab Content */}
      <div className="max-w-2xl">
        {activeTab === 'timer' && <TimerSettingsForm />}
        {activeTab === 'autostart' && <AutoStartSettings />}
        {activeTab === 'worktime' && <WorkTimeSettings />}
        {activeTab === 'sleeptime' && <SleepTimeSettings />}
        {activeTab === 'overrest' && <OverRestSettings />}
        {activeTab === 'expectations' && <ExpectationSettings />}
        {activeTab === 'notifications' && <NotificationSettings />}
        {activeTab === 'earlywarning' && <EarlyWarningSettings />}
        {activeTab === 'browser' && <UrlListSettings />}
        {activeTab === 'principles' && <CodingPrinciplesSettings />}
        {activeTab === 'devices' && <ConnectedDevices />}
      </div>
    </MainLayout>
  );
}
