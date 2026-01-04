'use client';

/**
 * Demo Mode Activation Dialog
 * 
 * Dialog for activating demo mode with confirmation phrase input.
 * Displays remaining tokens, max duration, and requires deliberate action.
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui';
import { trpc } from '@/lib/trpc';
import { DEFAULT_CONFIRMATION_PHRASE } from '@/services/demo-mode.service';

interface DemoModeActivationDialogProps {
  onClose: () => void;
  onActivated: () => void;
}

export function DemoModeActivationDialog({
  onClose,
  onActivated,
}: DemoModeActivationDialogProps) {
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  // Get activation eligibility - Requirements 7.2, 7.3, 7.4
  const { data: canActivate, isLoading: isCheckingEligibility } = 
    trpc.demoMode.canActivateDemoMode.useQuery();

  // Get demo mode config
  const { data: config } = trpc.demoMode.getConfig.useQuery();

  // Activate mutation
  const activateMutation = trpc.demoMode.activateDemoMode.useMutation({
    onSuccess: () => {
      utils.demoMode.getDemoModeState.invalidate();
      utils.demoMode.getRemainingTokens.invalidate();
      utils.demoMode.canActivateDemoMode.invalidate();
      onActivated();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleActivate = useCallback(async () => {
    setError(null);
    
    if (!confirmPhrase.trim()) {
      setError('Please enter the confirmation phrase');
      return;
    }

    try {
      await activateMutation.mutateAsync({
        confirmPhrase: confirmPhrase.trim(),
      });
    } catch {
      // Error handled in onError callback
    }
  }, [confirmPhrase, activateMutation]);

  const isConfirmPhraseCorrect = 
    confirmPhrase.toLowerCase().trim() === DEFAULT_CONFIRMATION_PHRASE.toLowerCase();

  // Format next reset date
  const formatResetDate = (date: Date | string | undefined) => {
    if (!date) return 'next month';
    const d = new Date(date);
    return d.toLocaleDateString(undefined, { 
      month: 'long', 
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Loading state
  if (isCheckingEligibility) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8">
          <div className="flex justify-center">
            <div className="animate-spin h-8 w-8 border-4 border-purple-600 border-t-transparent rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  // Cannot activate - show reason
  if (canActivate && !canActivate.canActivate) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8">
          {/* Warning Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center">
              <span className="text-3xl">⚠️</span>
            </div>
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-center text-gray-900 mb-4">
            Cannot Activate Demo Mode
          </h2>

          {/* Reason */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <p className="text-amber-800 text-sm text-center">
              {canActivate.reason}
            </p>
            
            {canActivate.remainingTokens === 0 && (
              <p className="text-amber-700 text-sm text-center mt-2">
                Tokens reset on {formatResetDate(canActivate.nextResetDate)}
              </p>
            )}
          </div>

          {/* Close Button */}
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 animate-scale-in">
        {/* Demo Mode Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center">
            <span className="text-3xl">🎭</span>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-center text-gray-900 mb-2">
          Activate Demo Mode
        </h2>

        {/* Description */}
        <p className="text-center text-gray-600 mb-6 text-sm">
          Demo mode temporarily disables all enforcement features for product presentations.
        </p>

        {/* Token Info - Requirements 7.2 */}
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-purple-700 text-sm font-medium">
              Remaining Tokens
            </span>
            <span className="text-purple-900 font-bold">
              {canActivate?.remainingTokens ?? 0} / {config?.tokensPerMonth ?? 3}
            </span>
          </div>
        </div>

        {/* Duration Info - Requirements 7.3 */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <div className="flex justify-between items-center">
            <span className="text-gray-700 text-sm font-medium">
              Maximum Duration
            </span>
            <span className="text-gray-900 font-bold">
              {config?.maxDurationMinutes ?? 90} minutes
            </span>
          </div>
        </div>

        {/* Confirmation Phrase Input - Requirements 7.1 */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Type &quot;{DEFAULT_CONFIRMATION_PHRASE}&quot; to confirm
          </label>
          <input
            type="text"
            value={confirmPhrase}
            onChange={(e) => {
              setConfirmPhrase(e.target.value);
              setError(null);
            }}
            placeholder={DEFAULT_CONFIRMATION_PHRASE}
            className={`
              w-full px-4 py-3 border rounded-lg 
              focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
              ${isConfirmPhraseCorrect 
                ? 'border-green-300 bg-green-50' 
                : 'border-gray-200'
              }
            `}
            autoComplete="off"
          />
          {isConfirmPhraseCorrect && (
            <p className="text-green-600 text-xs mt-1 flex items-center gap-1">
              <span>✓</span> Confirmation phrase correct
            </p>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-red-700 text-sm text-center">{error}</p>
          </div>
        )}

        {/* Warning */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">
          <p className="text-amber-700 text-xs text-center">
            ⚠️ All focus enforcement will be disabled during demo mode.
            This action consumes one demo token.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="lg"
            className="flex-1"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            className="flex-1 bg-purple-600 hover:bg-purple-700"
            onClick={handleActivate}
            disabled={!isConfirmPhraseCorrect || activateMutation.isPending}
            isLoading={activateMutation.isPending}
          >
            🎭 Activate
          </Button>
        </div>

        {/* Token Reset Info - Requirements 7.4 */}
        <p className="text-center text-xs text-gray-500 mt-4">
          Tokens reset on {formatResetDate(config?.nextResetDate)}
        </p>
      </div>

      {/* CSS for animations */}
      <style jsx global>{`
        @keyframes scale-in {
          0% {
            transform: scale(0.9);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        
        .animate-scale-in {
          animation: scale-in 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
