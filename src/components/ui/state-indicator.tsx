'use client';

/**
 * StateIndicator Component
 * 
 * Displays the current system state with visual indicators.
 * Requirements: 5.7 - Display current System_State visually (color coding, icons)
 */

import { type SystemState, getStateDisplayInfo } from '@/machines/vibeflow.machine';

interface StateIndicatorProps {
  state: SystemState;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** Optional time remaining to display (e.g., "2:30" for rest countdown) */
  timeRemaining?: string;
}

const sizeClasses = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-3 py-1',
  lg: 'text-base px-4 py-2',
};

const colorClasses: Record<string, string> = {
  gray: 'bg-gray-100 text-gray-700 border-gray-300',
  blue: 'bg-blue-100 text-blue-700 border-blue-300',
  green: 'bg-green-100 text-green-700 border-green-300',
  purple: 'bg-purple-100 text-purple-700 border-purple-300',
};

export function StateIndicator({
  state,
  showLabel = true,
  size = 'md',
  timeRemaining,
}: StateIndicatorProps) {
  const displayInfo = getStateDisplayInfo(state);

  return (
    <div
      className={`
        inline-flex items-center gap-1.5 rounded-full border font-medium
        ${sizeClasses[size]}
        ${colorClasses[displayInfo.color]}
      `}
      title={displayInfo.description}
    >
      <span>{displayInfo.icon}</span>
      {showLabel && (
        <span>
          {displayInfo.label}
          {timeRemaining && ` (${timeRemaining})`}
        </span>
      )}
    </div>
  );
}

/**
 * StateIndicatorSkeleton - Loading state for StateIndicator
 */
export function StateIndicatorSkeleton({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div 
      className={`
        inline-flex items-center gap-1.5 rounded-full border font-medium
        bg-gray-100 text-gray-400 border-gray-200 animate-pulse
        ${sizeClasses[size]}
      `}
    >
      <span className="w-4 h-4 bg-gray-200 rounded" />
      <span className="w-16 h-4 bg-gray-200 rounded" />
    </div>
  );
}
