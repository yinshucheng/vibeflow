'use client';

/**
 * DemoModeSettings Component
 * 
 * Manages demo mode configuration including tokens per month, max duration,
 * and provides access to activate demo mode and view usage history.
 * 
 * Requirements: 6.13, 6.14, 7.6
 */

import { useState, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui';
import { DemoModeActivationDialog } from '@/components/demo-mode';
import {
  MIN_DEMO_TOKENS_PER_MONTH,
  MAX_DEMO_TOKENS_PER_MONTH,
  MIN_DEMO_DURATION_MINUTES,
  MAX_DEMO_DURATION_MINUTES,
} from '@/services/demo-mode.service';

// Token options - Requirements 6.13
const TOKEN_OPTIONS = [1, 2, 3, 5, 7, 10].filter(
  n => n >= MIN_DEMO_TOKENS_PER_MONTH && n <= MAX_DEMO_TOKENS_PER_MONTH
);

// Duration options in minutes - Requirements 6.14
const DURATION_OPTIONS = [30, 45, 60, 90, 120, 150, 180].filter(
  n => n >= MIN_DEMO_DURATION_MINUTES && n <= MAX_DEMO_DURATION_MINUTES
);

export function DemoModeSettings() {
  const [showActivationDialog, setShowActivationDialog] = useState(false);
  const [error, setError] = useState('');

  const utils = trpc.useUtils();

  // Fetch current state and config
  const { data: demoState, isLoading: isLoadingState } = trpc.demoMode.getDemoModeState.useQuery();
  const { data: config, isLoading: isLoadingConfig } = trpc.demoMode.getConfig.useQuery();
  const { data: history, isLoading: isLoadingHistory } = trpc.demoMode.getDemoModeHistory.useQuery({ months: 3 });
  const { data: settings, isLoading: isLoadingSettings } = trpc.settings.get.useQuery();

  // Update settings mutation
  const updateSettingsMutation = trpc.settings.update.useMutation({
    onSuccess: () => {
      utils.settings.get.invalidate();
      utils.demoMode.getConfig.invalidate();
      utils.demoMode.getRemainingTokens.invalidate();
      setError('');
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleTokensChange = useCallback((tokens: number) => {
    updateSettingsMutation.mutate({ demoTokensPerMonth: tokens });
  }, [updateSettingsMutation]);

  const handleDurationChange = useCallback((duration: number) => {
    updateSettingsMutation.mutate({ demoMaxDurationMinutes: duration });
  }, [updateSettingsMutation]);

  const handleActivateClick = useCallback(() => {
    setShowActivationDialog(true);
  }, []);

  const handleActivationClose = useCallback(() => {
    setShowActivationDialog(false);
  }, []);

  const handleActivated = useCallback(() => {
    setShowActivationDialog(false);
    utils.demoMode.getDemoModeState.invalidate();
    utils.demoMode.getRemainingTokens.invalidate();
    utils.demoMode.getDemoModeHistory.invalidate();
  }, [utils.demoMode]);

  // Format date for display
  const formatDate = (date: Date | string | null | undefined): string => {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Format duration
  const formatDuration = (minutes: number | null | undefined): string => {
    if (!minutes) return '-';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const isLoading = isLoadingState || isLoadingConfig || isLoadingHistory || isLoadingSettings;

  if (isLoading) {
    return (
      <div className="py-8 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-gray-500">Loading demo mode settings...</p>
      </div>
    );
  }

  const currentTokens = (settings as { demoTokensPerMonth?: number } | undefined)?.demoTokensPerMonth ?? config?.tokensPerMonth ?? 3;
  const currentDuration = (settings as { demoMaxDurationMinutes?: number } | undefined)?.demoMaxDurationMinutes ?? config?.maxDurationMinutes ?? 90;

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="p-4 bg-purple-50 border border-purple-100 rounded-lg">
        <div className="flex gap-3">
          <span className="text-xl">🎭</span>
          <div>
            <h3 className="text-sm font-medium text-purple-900">Demo Mode</h3>
            <p className="mt-1 text-sm text-purple-700">
              Demo mode temporarily disables all enforcement features for product presentations.
              You receive a limited number of tokens each month to activate demo mode.
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

      {/* Current Status */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-4">Current Status</h3>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 uppercase mb-1">Status</div>
            <div className={`font-medium ${demoState?.isActive ? 'text-purple-600' : 'text-gray-900'}`}>
              {demoState?.isActive ? '🎭 Active' : '✓ Inactive'}
            </div>
          </div>
          
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 uppercase mb-1">Remaining Tokens</div>
            <div className="font-medium text-gray-900">
              {demoState?.remainingTokensThisMonth ?? 0} / {currentTokens}
            </div>
          </div>
        </div>

        {/* Active Demo Mode Info */}
        {demoState?.isActive && demoState.expiresAt && (
          <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-purple-900">Demo Mode Active</div>
                <div className="text-xs text-purple-700">
                  Expires: {formatDate(demoState.expiresAt)}
                </div>
              </div>
              <div className="text-lg font-bold text-purple-600">
                {demoState.remainingMinutes}m left
              </div>
            </div>
          </div>
        )}

        {/* Activate Button - Requirements 7.6 */}
        {!demoState?.isActive && (
          <div className="mt-4">
            <Button
              variant="primary"
              size="md"
              className="w-full bg-purple-600 hover:bg-purple-700"
              onClick={handleActivateClick}
              disabled={(demoState?.remainingTokensThisMonth ?? 0) === 0}
            >
              🎭 Activate Demo Mode
            </Button>
            {(demoState?.remainingTokensThisMonth ?? 0) === 0 && (
              <p className="text-xs text-gray-500 text-center mt-2">
                No tokens remaining. Tokens reset on {formatDate(config?.nextResetDate)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Configuration - Requirements 6.13, 6.14 */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-4">Configuration</h3>

        {/* Tokens Per Month - Requirements 6.13 */}
        <div className="mb-6">
          <label className="block text-sm text-gray-700 mb-2">
            Demo Tokens Per Month
          </label>
          <p className="text-xs text-gray-500 mb-3">
            Number of times you can activate demo mode each month ({MIN_DEMO_TOKENS_PER_MONTH}-{MAX_DEMO_TOKENS_PER_MONTH}).
          </p>
          <div className="flex flex-wrap gap-2">
            {TOKEN_OPTIONS.map((tokens) => (
              <button
                key={tokens}
                onClick={() => handleTokensChange(tokens)}
                disabled={updateSettingsMutation.isPending}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  currentTokens === tokens
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {tokens}
              </button>
            ))}
          </div>
        </div>

        {/* Max Duration - Requirements 6.14 */}
        <div>
          <label className="block text-sm text-gray-700 mb-2">
            Maximum Duration
          </label>
          <p className="text-xs text-gray-500 mb-3">
            Maximum time demo mode can be active ({MIN_DEMO_DURATION_MINUTES}-{MAX_DEMO_DURATION_MINUTES} minutes).
          </p>
          <div className="flex flex-wrap gap-2">
            {DURATION_OPTIONS.map((duration) => (
              <button
                key={duration}
                onClick={() => handleDurationChange(duration)}
                disabled={updateSettingsMutation.isPending}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  currentDuration === duration
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {formatDuration(duration)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Usage History */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-4">Usage History (Last 3 Months)</h3>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 uppercase mb-1">Used This Month</div>
            <div className="font-medium text-gray-900">
              {history?.totalUsedThisMonth ?? 0} tokens
            </div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 uppercase mb-1">Total Duration</div>
            <div className="font-medium text-gray-900">
              {formatDuration(history?.totalDurationMinutesThisMonth ?? 0)}
            </div>
          </div>
        </div>

        {/* Token List */}
        {history?.tokens && history.tokens.length > 0 ? (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {history.tokens
              .filter(token => token.usedAt)
              .map((token) => (
                <div
                  key={token.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm"
                >
                  <div>
                    <div className="font-medium text-gray-900">
                      {formatDate(token.usedAt)}
                    </div>
                    <div className="text-xs text-gray-500">
                      Duration: {formatDuration(token.durationMinutes)}
                    </div>
                  </div>
                  <div className={`text-xs px-2 py-1 rounded ${
                    token.endedAt ? 'bg-gray-200 text-gray-600' : 'bg-purple-100 text-purple-700'
                  }`}>
                    {token.endedAt ? 'Completed' : 'Active'}
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic text-center py-4">
            No demo mode usage in the last 3 months.
          </p>
        )}
      </div>

      {/* Activation Dialog */}
      {showActivationDialog && (
        <DemoModeActivationDialog
          onClose={handleActivationClose}
          onActivated={handleActivated}
        />
      )}
    </div>
  );
}
