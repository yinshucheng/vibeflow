'use client';

/**
 * Morning Airlock Wizard
 * 
 * Three-step wizard for daily planning ritual:
 * - Step 1: Review - Review yesterday's incomplete tasks (Defer/Delete)
 * - Step 2: Plan - Drag tasks from backlog to Today's list
 * - Step 3: Commit - Select Top N tasks (up to 3)
 * 
 * Features:
 * - Configurable mode: required, optional, disabled
 * - Can skip at any time (unless mode is required)
 * - Incremental updates when re-entering
 * - Quick navigation to specific steps
 * 
 * Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10
 */

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { AirlockStep1Review } from './step1-review';
import { AirlockStep2Plan } from './step2-plan';
import { AirlockStep3Commit } from './step3-commit';

export type AirlockStep = 1 | 2 | 3;
export type AirlockMode = 'required' | 'optional' | 'disabled';

function AirlockContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Check for step parameter in URL (for quick navigation)
  const stepParam = searchParams.get('step');
  const initialStep = stepParam ? (parseInt(stepParam) as AirlockStep) : 1;
  
  const [currentStep, setCurrentStep] = useState<AirlockStep>(
    [1, 2, 3].includes(initialStep) ? initialStep : 1
  );
  const [selectedTop3, setSelectedTop3] = useState<string[]>([]);
  
  // Get current system state and settings
  const { data: dailyState, isLoading: stateLoading } = trpc.dailyState.getToday.useQuery();
  const { data: settings, isLoading: settingsLoading } = trpc.settings.get.useQuery();
  
  // Skip airlock mutation
  const skipMutation = trpc.dailyState.skipAirlockForNewUser.useMutation({
    onSuccess: () => {
      router.push('/');
    },
  });
  
  const airlockCompleted = dailyState?.airlockCompleted ?? false;
  const airlockMode = (settings?.airlockMode as AirlockMode) ?? 'optional';
  
  // Initialize selectedTop3 from existing daily state
  useEffect(() => {
    if (dailyState?.top3TaskIds && dailyState.top3TaskIds.length > 0) {
      setSelectedTop3(dailyState.top3TaskIds);
    }
  }, [dailyState?.top3TaskIds]);

  // Show loading state
  const isLoading = stateLoading || settingsLoading;
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  const handleStepComplete = (step: AirlockStep) => {
    if (step < 3) {
      setCurrentStep((step + 1) as AirlockStep);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as AirlockStep);
    }
  };

  const handleTop3Change = (taskIds: string[]) => {
    setSelectedTop3(taskIds);
  };

  const handleSkip = () => {
    skipMutation.mutate();
  };

  const handleStepClick = (step: AirlockStep) => {
    setCurrentStep(step);
  };

  // Can skip if mode is not required
  const canSkip = airlockMode !== 'required';
  
  // Show re-entry mode indicator if airlock was already completed today
  const isReEntry = airlockCompleted;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/20 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🌅</span>
            <div>
              <h1 className="text-xl font-bold text-white">
                Morning Airlock
                {isReEntry && (
                  <span className="ml-2 text-xs font-normal text-white/50 bg-white/10 px-2 py-0.5 rounded">
                    Adjusting
                  </span>
                )}
              </h1>
              <p className="text-sm text-white/60">Start your day with intention</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Step Indicator - Clickable for quick navigation */}
            <div className="flex items-center gap-2">
              {[1, 2, 3].map((step) => (
                <button
                  key={step}
                  onClick={() => handleStepClick(step as AirlockStep)}
                  className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                    transition-all duration-300 cursor-pointer
                    ${currentStep === step 
                      ? 'bg-white text-indigo-900' 
                      : currentStep > step 
                        ? 'bg-green-500 text-white hover:bg-green-400' 
                        : 'bg-white/20 text-white/60 hover:bg-white/30'
                    }
                  `}
                  title={`Step ${step}: ${step === 1 ? 'Review' : step === 2 ? 'Plan' : 'Commit'}`}
                >
                  {currentStep > step ? '✓' : step}
                </button>
              ))}
            </div>

            {/* Skip Button */}
            {canSkip && (
              <button
                onClick={handleSkip}
                disabled={skipMutation.isPending}
                className="text-sm text-white/60 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                {skipMutation.isPending ? 'Skipping...' : 'Skip →'}
              </button>
            )}

            {/* Home Link */}
            {airlockCompleted && (
              <Link
                href="/"
                className="text-sm text-white/60 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
              >
                ← Back
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-24 pb-8 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Step Content */}
          <div className="min-h-[60vh]">
            {currentStep === 1 && (
              <AirlockStep1Review 
                onComplete={() => handleStepComplete(1)}
                canSkip={canSkip}
                onSkip={handleSkip}
              />
            )}
            {currentStep === 2 && (
              <AirlockStep2Plan 
                onComplete={() => handleStepComplete(2)}
                onBack={handleBack}
                canSkip={canSkip}
                onSkip={handleSkip}
              />
            )}
            {currentStep === 3 && (
              <AirlockStep3Commit 
                selectedTop3={selectedTop3}
                onTop3Change={handleTop3Change}
                onBack={handleBack}
                canSkip={canSkip}
                onSkip={handleSkip}
                isReEntry={isReEntry}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function AirlockLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 flex items-center justify-center">
      <div className="text-white text-xl">Loading...</div>
    </div>
  );
}

export default function AirlockPage() {
  return (
    <Suspense fallback={<AirlockLoading />}>
      <AirlockContent />
    </Suspense>
  );
}
