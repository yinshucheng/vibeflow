'use client';

/**
 * Daily Cap Modal Component
 * 
 * Shows "Day Complete" celebration and override confirmation dialog.
 * Requirements: 12.2, 12.4
 */

import { useState } from 'react';
import { Button } from '@/components/ui';
import { trpc } from '@/lib/trpc';

interface DailyCapModalProps {
  onClose: () => void;
  onOverride: () => void;
}

export function DailyCapModal({ onClose, onOverride }: DailyCapModalProps) {
  const [showOverrideConfirm, setShowOverrideConfirm] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const utils = trpc.useUtils();
  
  // Get override frequency for warnings
  const { data: overrideFrequency } = trpc.dailyState.getOverrideFrequency.useQuery({ days: 7 });

  // Override mutation
  const overrideMutation = trpc.dailyState.overrideCap.useMutation({
    onSuccess: () => {
      utils.dailyState.getToday.invalidate();
      onOverride();
    },
  });

  const handleOverride = async () => {
    if (!acknowledged) return;
    
    try {
      await overrideMutation.mutateAsync({ confirmation: true });
    } catch (error) {
      console.error('Failed to override cap:', error);
    }
  };

  // Show warning if user frequently overrides
  const showFrequencyWarning = (overrideFrequency?.daysWithOverrides ?? 0) >= 3;

  if (showOverrideConfirm) {
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
            Override Daily Limit?
          </h2>

          {/* Warning Message */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <p className="text-amber-800 text-sm">
              You&apos;ve reached your daily limit. Continuing to work may lead to burnout 
              and decreased productivity tomorrow.
            </p>
            
            {showFrequencyWarning && (
              <p className="text-amber-900 font-medium text-sm mt-2">
                ⚠️ You&apos;ve overridden your limit {overrideFrequency?.totalOverrides} times 
                in the past week. Consider adjusting your daily cap or taking more breaks.
              </p>
            )}
          </div>

          {/* Acknowledgment Checkbox */}
          <label className="flex items-start gap-3 mb-6 cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-sm text-gray-700">
              I understand I&apos;m exceeding my daily limit and accept the potential 
              impact on my well-being and productivity.
            </span>
          </label>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowOverrideConfirm(false)}
            >
              Go Back
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={handleOverride}
              disabled={!acknowledged || overrideMutation.isPending}
              isLoading={overrideMutation.isPending}
            >
              Override Limit
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8">
        {/* Celebration Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-24 h-24 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-lg">
            <span className="text-5xl">🏆</span>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">
          Day Complete!
        </h2>

        {/* Subtitle */}
        <p className="text-center text-gray-600 mb-6">
          You&apos;ve reached your daily goal. Time to rest and recharge!
        </p>

        {/* Achievement Stats */}
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-center gap-2 text-green-700">
            <span className="text-2xl">✨</span>
            <span className="font-medium">
              Sustainable productivity achieved
            </span>
          </div>
        </div>

        {/* Motivational Message */}
        <div className="text-center mb-6">
          <p className="text-gray-600 text-sm">
            &quot;The key to sustainable productivity is knowing when to stop. 
            Rest now, and come back stronger tomorrow.&quot;
          </p>
          <p className="text-gray-400 text-xs mt-2">— The Murakami Method</p>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Button
            variant="primary"
            size="lg"
            className="w-full bg-green-600 hover:bg-green-700"
            onClick={onClose}
          >
            🌙 End My Day
          </Button>
          
          <button
            type="button"
            onClick={() => setShowOverrideConfirm(true)}
            className="w-full text-sm text-gray-500 hover:text-gray-700 py-2"
          >
            I need to continue working...
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Day Complete Celebration Component
 * 
 * Standalone celebration component that can be shown anywhere.
 */
export function DayCompleteCelebration({ 
  pomodoroCount, 
  onDismiss 
}: { 
  pomodoroCount: number; 
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      {/* Confetti Effect */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(30)].map((_, i) => (
          <div
            key={i}
            className="absolute animate-confetti"
            style={{
              left: `${Math.random() * 100}%`,
              top: '-5%',
              animationDelay: `${Math.random() * 1}s`,
              animationDuration: `${2 + Math.random() * 2}s`,
            }}
          >
            <div
              className="w-4 h-4"
              style={{
                backgroundColor: ['#22c55e', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0'][
                  Math.floor(Math.random() * 5)
                ],
                transform: `rotate(${Math.random() * 360}deg)`,
                borderRadius: Math.random() > 0.5 ? '50%' : '0',
              }}
            />
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-8 text-center animate-scale-in">
        <div className="text-6xl mb-4">🎊</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Amazing Work!
        </h2>
        <p className="text-gray-600 mb-4">
          You completed <span className="font-bold text-green-600">{pomodoroCount}</span> focus sessions today!
        </p>
        <Button
          variant="primary"
          onClick={onDismiss}
          className="bg-green-600 hover:bg-green-700"
        >
          Thank you! 🙏
        </Button>
      </div>

      <style jsx global>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
        
        @keyframes scale-in {
          0% {
            transform: scale(0.8);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        
        .animate-confetti {
          animation: confetti-fall linear forwards;
        }
        
        .animate-scale-in {
          animation: scale-in 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
