'use client';

/**
 * RestEnforcementSettings Component
 *
 * Manages REST state enforcement settings: toggle, action type, grace config, and work apps link.
 * Reads/writes via trpc.settings.get / trpc.settings.update.
 */

import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui';

type EnforcementAction = 'close' | 'hide';

const ACTION_OPTIONS: Array<{ value: EnforcementAction; label: string; description: string }> = [
  {
    value: 'close',
    label: 'Close Apps',
    description: 'Force quit work apps during rest time',
  },
  {
    value: 'hide',
    label: 'Hide Apps',
    description: 'Minimize/hide work apps (gentler, apps stay running)',
  },
];

const GRACE_LIMIT_OPTIONS = [1, 2, 3, 4, 5];
const GRACE_DURATION_OPTIONS = [1, 2, 3, 5, 10];

interface FormData {
  enabled: boolean;
  action: EnforcementAction;
  graceLimit: number;
  graceDuration: number;
}

function parseAction(actions: string[] | undefined): EnforcementAction {
  if (actions && actions.includes('hide')) return 'hide';
  return 'close';
}

export function RestEnforcementSettings() {
  const [formData, setFormData] = useState<FormData>({
    enabled: false,
    action: 'close',
    graceLimit: 2,
    graceDuration: 2,
  });
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { data: settings, isLoading, refetch } = trpc.settings.get.useQuery();
  const updateMutation = trpc.settings.update.useMutation({
    onSuccess: () => {
      refetch();
      setIsSaving(false);
      setIsDirty(false);
    },
    onError: () => {
      setIsSaving(false);
    },
  });

  // Initialize from settings
  useEffect(() => {
    if (settings) {
      setFormData({
        enabled: settings.restEnforcementEnabled ?? false,
        action: parseAction(settings.restEnforcementActions as string[] | undefined),
        graceLimit: settings.restGraceLimit ?? 2,
        graceDuration: settings.restGraceDuration ?? 2,
      });
      setIsDirty(false);
    }
  }, [settings]);

  const updateField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSave = () => {
    setIsSaving(true);
    updateMutation.mutate({
      restEnforcementEnabled: formData.enabled,
      restEnforcementActions: [formData.action],
      restGraceLimit: formData.graceLimit,
      restGraceDuration: formData.graceDuration,
    });
  };

  const handleReset = () => {
    if (settings) {
      setFormData({
        enabled: settings.restEnforcementEnabled ?? false,
        action: parseAction(settings.restEnforcementActions as string[] | undefined),
        graceLimit: settings.restGraceLimit ?? 2,
        graceDuration: settings.restGraceDuration ?? 2,
      });
      setIsDirty(false);
    }
  };

  const workAppsCount = Array.isArray(settings?.workApps)
    ? (settings.workApps as Array<{ bundleId: string; name: string }>).length
    : 0;

  if (isLoading) {
    return (
      <div className="py-8 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-gray-500">Loading rest enforcement settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg">
        <div className="flex gap-3">
          <span className="text-xl">😴</span>
          <div>
            <h3 className="text-sm font-medium text-blue-900">REST Enforcement</h3>
            <p className="mt-1 text-sm text-blue-700">
              When a pomodoro completes and you enter REST state, the system can close or hide
              your work apps to help you actually take a break. Configure the enforcement behavior below.
            </p>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {updateMutation.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {updateMutation.error.message}
        </div>
      )}

      {/* Enable Toggle */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-900">Enable REST Enforcement</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Automatically close or hide work apps when you enter REST state
            </p>
          </div>
          <button
            role="switch"
            aria-checked={formData.enabled}
            onClick={() => updateField('enabled', !formData.enabled)}
            className={`
              relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
              transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
              ${formData.enabled ? 'bg-blue-600' : 'bg-gray-300'}
            `}
          >
            <span
              className={`
                pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
                transition duration-200 ease-in-out
                ${formData.enabled ? 'translate-x-5' : 'translate-x-0'}
              `}
            />
          </button>
        </div>
      </div>

      {/* Action Selector */}
      <div className={`bg-white border border-gray-200 rounded-lg p-4 ${!formData.enabled ? 'opacity-50' : ''}`}>
        <h3 className="text-sm font-medium text-gray-900 mb-2">Enforcement Action</h3>
        <p className="text-sm text-gray-500 mb-4">
          What should happen to work apps during rest time?
        </p>
        <div className="space-y-3">
          {ACTION_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                formData.action === option.value
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
              } ${!formData.enabled ? 'pointer-events-none' : ''}`}
            >
              <input
                type="radio"
                name="enforcement-action"
                value={option.value}
                checked={formData.action === option.value}
                onChange={() => updateField('action', option.value)}
                disabled={!formData.enabled}
                className="mt-1 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
              />
              <div className="flex-1">
                <span className="font-medium text-gray-900">{option.label}</span>
                <p className="text-sm text-gray-500 mt-0.5">{option.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Grace Settings */}
      <div className={`bg-white border border-gray-200 rounded-lg p-4 ${!formData.enabled ? 'opacity-50' : ''}`}>
        <h3 className="text-sm font-medium text-gray-900 mb-2">Grace Period</h3>
        <p className="text-sm text-gray-500 mb-4">
          Allow temporary exemptions to continue working during REST. You can request a grace
          period from the desktop app to delay enforcement.
        </p>

        {/* Grace Limit */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-500 uppercase mb-2">
            Grace requests per rest cycle
          </label>
          <div className="flex flex-wrap gap-2">
            {GRACE_LIMIT_OPTIONS.map((count) => (
              <button
                key={count}
                onClick={() => updateField('graceLimit', count)}
                disabled={!formData.enabled}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  formData.graceLimit === count
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                } ${!formData.enabled ? 'pointer-events-none' : ''}`}
              >
                {count}x
              </button>
            ))}
          </div>
        </div>

        {/* Grace Duration */}
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase mb-2">
            Duration per grace (minutes)
          </label>
          <div className="flex flex-wrap gap-2">
            {GRACE_DURATION_OPTIONS.map((minutes) => (
              <button
                key={minutes}
                onClick={() => updateField('graceDuration', minutes)}
                disabled={!formData.enabled}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  formData.graceDuration === minutes
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                } ${!formData.enabled ? 'pointer-events-none' : ''}`}
              >
                {minutes} min
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Work Apps Link */}
      <div className={`bg-white border border-gray-200 rounded-lg p-4 ${!formData.enabled ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-900">Work Apps</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {workAppsCount > 0
                ? `${workAppsCount} app${workAppsCount !== 1 ? 's' : ''} configured`
                : 'No work apps configured yet'}
            </p>
          </div>
          <p className="text-sm text-blue-600">
            Configure in the &quot;Work Apps&quot; tab
          </p>
        </div>
      </div>

      {/* Save / Reset Buttons */}
      <div className="flex justify-end gap-3">
        <Button
          onClick={handleReset}
          disabled={!isDirty || isSaving}
          variant="secondary"
          size="md"
        >
          Reset
        </Button>
        <Button
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          size="md"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
