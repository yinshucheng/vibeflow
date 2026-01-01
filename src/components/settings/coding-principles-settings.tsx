'use client';

/**
 * CodingPrinciplesSettings Component
 * 
 * Manages coding standards and preferences for MCP integration.
 * Requirements: 9.4
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { Card, CardHeader, CardContent } from '@/components/layout';
import { trpc } from '@/lib/trpc';

export function CodingPrinciplesSettings() {
  const utils = trpc.useUtils();

  // Fetch current data
  const { data: codingStandards = [], isLoading: standardsLoading } = trpc.settings.getCodingStandards.useQuery();
  const { data: preferences = {}, isLoading: preferencesLoading } = trpc.settings.getPreferences.useQuery();

  // Local state
  const [standards, setStandards] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<Record<string, string>>({});
  const [newStandard, setNewStandard] = useState('');
  const [newPrefKey, setNewPrefKey] = useState('');
  const [newPrefValue, setNewPrefValue] = useState('');
  const [standardsError, setStandardsError] = useState('');
  const [prefsError, setPrefsError] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  // Sync with server data
  useEffect(() => {
    if (codingStandards) {
      setStandards(codingStandards);
    }
  }, [codingStandards]);

  useEffect(() => {
    if (preferences) {
      // Convert unknown values to strings
      const stringPrefs: Record<string, string> = {};
      Object.entries(preferences).forEach(([key, value]) => {
        stringPrefs[key] = String(value);
      });
      setPrefs(stringPrefs);
    }
  }, [preferences]);

  // Mutations
  const updateStandards = trpc.settings.updateCodingStandards.useMutation({
    onSuccess: () => {
      utils.settings.getCodingStandards.invalidate();
      setIsDirty(false);
    },
    onError: (err: { message: string }) => {
      setStandardsError(err.message);
    },
  });

  const updatePreferences = trpc.settings.updatePreferences.useMutation({
    onSuccess: () => {
      utils.settings.getPreferences.invalidate();
      setIsDirty(false);
    },
    onError: (err: { message: string }) => {
      setPrefsError(err.message);
    },
  });

  // Handlers for coding standards
  const handleAddStandard = () => {
    const trimmed = newStandard.trim();
    if (!trimmed) {
      setStandardsError('Standard cannot be empty');
      return;
    }
    if (trimmed.length > 1000) {
      setStandardsError('Standard is too long (max 1000 characters)');
      return;
    }
    if (standards.includes(trimmed)) {
      setStandardsError('Standard already exists');
      return;
    }

    const newStandards = [...standards, trimmed];
    setStandards(newStandards);
    setNewStandard('');
    setStandardsError('');
    setIsDirty(true);
  };

  const handleRemoveStandard = (index: number) => {
    const newStandards = standards.filter((_, i) => i !== index);
    setStandards(newStandards);
    setIsDirty(true);
  };

  const handleStandardKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddStandard();
    }
  };

  // Handlers for preferences
  const handleAddPreference = () => {
    const key = newPrefKey.trim();
    const value = newPrefValue.trim();

    if (!key) {
      setPrefsError('Key cannot be empty');
      return;
    }
    if (!value) {
      setPrefsError('Value cannot be empty');
      return;
    }
    if (key in prefs) {
      setPrefsError('Key already exists');
      return;
    }

    setPrefs({ ...prefs, [key]: value });
    setNewPrefKey('');
    setNewPrefValue('');
    setPrefsError('');
    setIsDirty(true);
  };

  const handleRemovePreference = (key: string) => {
    const newPrefs = { ...prefs };
    delete newPrefs[key];
    setPrefs(newPrefs);
    setIsDirty(true);
  };

  const handleUpdatePreference = (key: string, value: string) => {
    setPrefs({ ...prefs, [key]: value });
    setIsDirty(true);
  };

  // Save all changes
  const handleSave = async () => {
    setStandardsError('');
    setPrefsError('');

    try {
      await Promise.all([
        updateStandards.mutateAsync({ standards }),
        updatePreferences.mutateAsync({ preferences: prefs }),
      ]);
    } catch {
      // Errors handled by mutation callbacks
    }
  };

  // Reset to server state
  const handleReset = () => {
    setStandards(codingStandards);
    const stringPrefs: Record<string, string> = {};
    Object.entries(preferences).forEach(([key, value]) => {
      stringPrefs[key] = String(value);
    });
    setPrefs(stringPrefs);
    setIsDirty(false);
    setStandardsError('');
    setPrefsError('');
  };

  const isLoading = standardsLoading || preferencesLoading;
  const isSaving = updateStandards.isPending || updatePreferences.isPending;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader title="Coding Standards" />
          <CardContent>
            <div className="animate-pulse space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-gray-100 rounded" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="p-4 bg-purple-50 border border-purple-100 rounded-lg">
        <div className="flex gap-3">
          <span className="text-xl">🧠</span>
          <div>
            <h3 className="text-sm font-medium text-purple-900">MCP Integration</h3>
            <p className="mt-1 text-sm text-purple-700">
              These settings are exposed to external AI agents (Cursor, Claude Code) via the MCP Server.
              They help AI understand your coding style and preferences.
            </p>
          </div>
        </div>
      </div>

      {/* Coding Standards */}
      <Card>
        <CardHeader 
          title="📋 Coding Standards" 
          description="Rules and guidelines for code quality"
        />
        <CardContent className="space-y-4">
          {/* Add Standard Input */}
          <div className="flex gap-2">
            <div className="flex-1">
              <textarea
                value={newStandard}
                onChange={(e) => {
                  setNewStandard(e.target.value);
                  setStandardsError('');
                }}
                onKeyDown={handleStandardKeyDown}
                placeholder="e.g., Use TypeScript strict mode, Prefer functional components..."
                rows={2}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  standardsError ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {standardsError && <p className="mt-1 text-xs text-red-600">{standardsError}</p>}
            </div>
            <Button
              onClick={handleAddStandard}
              disabled={!newStandard.trim()}
              size="md"
            >
              Add
            </Button>
          </div>

          {/* Standards List */}
          {standards.length === 0 ? (
            <div className="py-6 text-center text-gray-500">
              <span className="text-2xl block mb-2">📝</span>
              <p className="text-sm">No coding standards defined yet</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {standards.map((standard, index) => (
                <li
                  key={index}
                  className="flex items-start justify-between p-3 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <p className="text-sm text-gray-800 flex-1 pr-4">{standard}</p>
                  <button
                    onClick={() => handleRemoveStandard(index)}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                    title="Remove standard"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader 
          title="⚙️ Preferences" 
          description="Key-value pairs for custom settings"
        />
        <CardContent className="space-y-4">
          {/* Add Preference Input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newPrefKey}
              onChange={(e) => {
                setNewPrefKey(e.target.value);
                setPrefsError('');
              }}
              placeholder="Key (e.g., language)"
              className="w-1/3 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              value={newPrefValue}
              onChange={(e) => {
                setNewPrefValue(e.target.value);
                setPrefsError('');
              }}
              placeholder="Value (e.g., TypeScript)"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Button
              onClick={handleAddPreference}
              disabled={!newPrefKey.trim() || !newPrefValue.trim()}
              size="md"
            >
              Add
            </Button>
          </div>
          {prefsError && <p className="text-xs text-red-600">{prefsError}</p>}

          {/* Preferences List */}
          {Object.keys(prefs).length === 0 ? (
            <div className="py-6 text-center text-gray-500">
              <span className="text-2xl block mb-2">🔧</span>
              <p className="text-sm">No preferences defined yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(prefs).map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <code className="text-sm font-mono text-purple-600 bg-purple-50 px-2 py-1 rounded min-w-[100px]">
                    {key}
                  </code>
                  <span className="text-gray-400">=</span>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => handleUpdatePreference(key, e.target.value)}
                    className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => handleRemovePreference(key)}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    title="Remove preference"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Common Preferences Suggestions */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <h4 className="text-xs font-medium text-gray-700 mb-2">Common Preferences</h4>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'language', value: 'TypeScript' },
                { key: 'framework', value: 'React' },
                { key: 'testFramework', value: 'Vitest' },
                { key: 'styleGuide', value: 'Airbnb' },
              ].filter(({ key }) => !(key in prefs)).map(({ key, value }) => (
                <button
                  key={key}
                  onClick={() => {
                    setPrefs({ ...prefs, [key]: value });
                    setIsDirty(true);
                  }}
                  className="text-xs px-2 py-1 bg-white border border-gray-200 rounded hover:bg-gray-100 transition-colors"
                >
                  + {key}: {value}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Actions */}
      {isDirty && (
        <div className="flex gap-3 justify-end p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <span className="text-sm text-yellow-700 flex-1">You have unsaved changes</span>
          <Button variant="outline" onClick={handleReset}>
            Discard
          </Button>
          <Button onClick={handleSave} isLoading={isSaving}>
            Save All Changes
          </Button>
        </div>
      )}
    </div>
  );
}
