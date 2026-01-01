'use client';

/**
 * NotificationSettings Component
 * 
 * Form for configuring pomodoro completion notifications.
 * Requirements: 4.3, 4.4
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { Card, CardHeader, CardContent } from '@/components/layout';
import { trpc } from '@/lib/trpc';
import { 
  requestNotificationPermission, 
  isNotificationSupported,
  playSound,
  type NotificationSoundType,
} from '@/services/notification.service';

interface NotificationSettings {
  notificationEnabled: boolean;
  notificationSound: NotificationSoundType;
  flashTabEnabled: boolean;
}

const SOUND_OPTIONS: { value: NotificationSoundType; label: string; icon: string }[] = [
  { value: 'bell', label: 'Bell', icon: '🔔' },
  { value: 'chime', label: 'Chime', icon: '🎵' },
  { value: 'gentle', label: 'Gentle', icon: '🌊' },
  { value: 'none', label: 'None', icon: '🔇' },
];

export function NotificationSettings() {
  const utils = trpc.useUtils();
  
  const { data: settings, isLoading } = trpc.settings.get.useQuery();
  
  const [formData, setFormData] = useState<NotificationSettings>({
    notificationEnabled: true,
    notificationSound: 'bell',
    flashTabEnabled: true,
  });
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission | 'unsupported'>('default');
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check notification permission on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermissionStatus(Notification.permission);
    } else {
      setPermissionStatus('unsupported');
    }
  }, []);

  // Update form when settings load
  useEffect(() => {
    if (settings) {
      // Use type assertion for notification fields
      const s = settings as {
        notificationEnabled?: boolean;
        notificationSound?: string;
        flashTabEnabled?: boolean;
      };
      setFormData({
        notificationEnabled: s.notificationEnabled ?? true,
        notificationSound: (s.notificationSound as NotificationSoundType) ?? 'bell',
        flashTabEnabled: s.flashTabEnabled ?? true,
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

  const handleChange = <K extends keyof NotificationSettings>(
    field: K,
    value: NotificationSettings[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
    setError(null);
  };

  const handleRequestPermission = async () => {
    const granted = await requestNotificationPermission();
    setPermissionStatus(granted ? 'granted' : 'denied');
  };

  const handleTestSound = () => {
    if (formData.notificationSound !== 'none') {
      playSound(formData.notificationSound);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  const handleReset = () => {
    if (settings) {
      const s = settings as {
        notificationEnabled?: boolean;
        notificationSound?: string;
        flashTabEnabled?: boolean;
      };
      setFormData({
        notificationEnabled: s.notificationEnabled ?? true,
        notificationSound: (s.notificationSound as NotificationSoundType) ?? 'bell',
        flashTabEnabled: s.flashTabEnabled ?? true,
      });
      setIsDirty(false);
      setError(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader title="Notification Settings" description="Configure completion alerts" />
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => (
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
          title="Notification Settings" 
          description="Configure how you're notified when a pomodoro completes"
        />
        <CardContent className="space-y-6">
          {/* Browser Permission Status */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-gray-700">Browser Notifications</h4>
                <p className="text-xs text-gray-500 mt-1">
                  {permissionStatus === 'granted' && '✅ Notifications are enabled'}
                  {permissionStatus === 'denied' && '❌ Notifications are blocked'}
                  {permissionStatus === 'default' && '⚠️ Permission not yet requested'}
                  {permissionStatus === 'unsupported' && '⚠️ Not supported in this browser'}
                </p>
              </div>
              {permissionStatus === 'default' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRequestPermission}
                >
                  Enable
                </Button>
              )}
            </div>
          </div>

          {/* Enable Notifications Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label htmlFor="notificationEnabled" className="text-sm font-medium text-gray-700">
                🔔 Show Notifications
              </label>
              <p className="text-xs text-gray-500 mt-1">
                Display browser notification when pomodoro completes
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={formData.notificationEnabled}
              onClick={() => handleChange('notificationEnabled', !formData.notificationEnabled)}
              className={`
                relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                ${formData.notificationEnabled ? 'bg-blue-600' : 'bg-gray-200'}
              `}
            >
              <span
                className={`
                  inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                  ${formData.notificationEnabled ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </button>
          </div>

          {/* Sound Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              🎵 Notification Sound
            </label>
            <div className="grid grid-cols-2 gap-2">
              {SOUND_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleChange('notificationSound', option.value)}
                  className={`
                    flex items-center gap-2 p-3 rounded-lg border-2 transition-colors
                    ${formData.notificationSound === option.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                    }
                  `}
                >
                  <span className="text-lg">{option.icon}</span>
                  <span className="text-sm font-medium">{option.label}</span>
                </button>
              ))}
            </div>
            {formData.notificationSound !== 'none' && (
              <button
                type="button"
                onClick={handleTestSound}
                className="mt-2 text-sm text-blue-600 hover:text-blue-700"
              >
                🔊 Test sound
              </button>
            )}
          </div>

          {/* Flash Tab Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label htmlFor="flashTabEnabled" className="text-sm font-medium text-gray-700">
                ✨ Flash Tab Title
              </label>
              <p className="text-xs text-gray-500 mt-1">
                Flash the browser tab when pomodoro completes (if tab is not focused)
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={formData.flashTabEnabled}
              onClick={() => handleChange('flashTabEnabled', !formData.flashTabEnabled)}
              className={`
                relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                ${formData.flashTabEnabled ? 'bg-blue-600' : 'bg-gray-200'}
              `}
            >
              <span
                className={`
                  inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                  ${formData.flashTabEnabled ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </button>
          </div>

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
