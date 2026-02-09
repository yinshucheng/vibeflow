'use client';

/**
 * StateIndicator Component
 *
 * Notion-style state indicator with subtle colors.
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
  sm: 'text-xs px-1.5 py-0.5',
  md: 'text-xs px-2 py-0.5',
  lg: 'text-sm px-2.5 py-1',
};

// Notion-style subtle color mapping
const colorClasses: Record<string, string> = {
  gray: 'bg-notion-accent-gray-bg text-notion-accent-gray',
  blue: 'bg-notion-accent-blue-bg text-notion-accent-blue',
  green: 'bg-notion-accent-green-bg text-notion-accent-green',
  purple: 'bg-notion-accent-purple-bg text-notion-accent-purple',
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
        inline-flex items-center gap-1 rounded-notion-sm font-medium
        ${sizeClasses[size]}
        ${colorClasses[displayInfo.color]}
      `}
      title={displayInfo.description}
    >
      <span className="text-[10px]">{displayInfo.icon}</span>
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
        inline-flex items-center gap-1 rounded-notion-sm font-medium
        bg-notion-bg-tertiary animate-pulse
        ${sizeClasses[size]}
      `}
    >
      <span className="w-3 h-3 bg-notion-border-strong rounded-notion-sm" />
      <span className="w-12 h-3 bg-notion-border-strong rounded-notion-sm" />
    </div>
  );
}
