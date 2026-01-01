'use client';

/**
 * TimelineView Component
 * 
 * Displays a vertical timeline of events with color coding by type.
 * Requirements: 6.3, 6.7
 */

import { useMemo } from 'react';

// Timeline event type (compatible with Prisma model)
interface TimelineEvent {
  id: string;
  userId: string;
  type: string;
  startTime: Date;
  endTime: Date | null;
  duration: number;
  title: string;
  metadata: unknown;
  source: string;
  createdAt: Date;
}

// Event type configuration with colors and icons
// Requirements: 6.7 - Use color coding to distinguish event types
interface EventTypeConfig {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  borderStyle?: string; // For dashed borders (idle events)
  icon: string;
}

const EVENT_TYPE_CONFIG: Record<string, EventTypeConfig> = {
  pomodoro: {
    label: '番茄',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-300',
    icon: '🍅',
  },
  distraction: {
    label: '分心',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-300',
    icon: '⚠️',
  },
  break: {
    label: '休息',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-300',
    icon: '☕',
  },
  scheduled_task: {
    label: '计划任务',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    icon: '📋',
  },
  // Activity log with neutral category (default)
  activity_log: {
    label: '活动',
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-300',
    icon: '🌐',
  },
  // Activity log variants based on category
  'activity_log:productive': {
    label: '生产性活动',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-300',
    icon: '💻',
  },
  'activity_log:neutral': {
    label: '中性活动',
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-300',
    icon: '🌐',
  },
  'activity_log:distracting': {
    label: '分心活动',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-300',
    icon: '⚠️',
  },
  block: {
    label: '拦截',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-300',
    icon: '🚫',
  },
  // State change variants
  state_change: {
    label: '状态变更',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    icon: '🎯',
  },
  'state_change:FOCUS': {
    label: '进入专注',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    icon: '🎯',
  },
  'state_change:REST': {
    label: '进入休息',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-300',
    icon: '☕',
  },
  interruption: {
    label: '打断',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-300',
    icon: '⏸️',
  },
  idle: {
    label: '空闲',
    color: 'text-gray-400',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    borderStyle: 'border-dashed', // Dashed border for idle events as per design
    icon: '💤',
  },
};

// Get config for an event type
// Handles category-based variants for activity_log and state_change events
function getEventConfig(type: string, metadata?: Record<string, unknown> | null): EventTypeConfig {
  // Check for activity_log with category
  if (type === 'activity_log' && metadata?.category) {
    const categoryKey = `activity_log:${metadata.category}`;
    if (EVENT_TYPE_CONFIG[categoryKey]) {
      return EVENT_TYPE_CONFIG[categoryKey];
    }
  }
  
  // Check for state_change with toState
  if (type === 'state_change' && metadata?.toState) {
    const stateKey = `state_change:${metadata.toState}`;
    if (EVENT_TYPE_CONFIG[stateKey]) {
      return EVENT_TYPE_CONFIG[stateKey];
    }
  }
  
  return EVENT_TYPE_CONFIG[type] ?? {
    label: type,
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-300',
    icon: '📌',
  };
}

// Format time as HH:mm
function formatTime(date: Date): string {
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

// Format duration in seconds to human readable
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}秒`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours}小时`;
  }
  return `${hours}小时${remainingMinutes}分钟`;
}

// Timeline event with optional gap
interface TimelineEventWithGap extends TimelineEvent {
  gapBefore?: number;
}

interface TimelineViewProps {
  events: TimelineEventWithGap[];
  isLoading?: boolean;
  showGaps?: boolean;
  onEventClick?: (event: TimelineEvent) => void;
}

export function TimelineView({
  events,
  isLoading = false,
  showGaps = true,
  onEventClick,
}: TimelineViewProps) {
  // Sort events by start time
  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => 
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
  }, [events]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse flex gap-4">
            <div className="w-16 h-4 bg-gray-200 rounded" />
            <div className="flex-1 h-20 bg-gray-100 rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  if (sortedEvents.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-4">📭</div>
        <p className="text-gray-500">当天没有活动记录</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical timeline line */}
      <div className="absolute left-[4.5rem] top-0 bottom-0 w-0.5 bg-gray-200" />

      {/* Events */}
      <div className="space-y-2">
        {sortedEvents.map((event) => {
          const startTime = new Date(event.startTime);
          const endTime = event.endTime ? new Date(event.endTime) : null;
          const rawMetadata = event.metadata;
          const metadata = (rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)) 
            ? rawMetadata as Record<string, unknown>
            : null;
          
          // Get config with metadata for category-based coloring
          const config = getEventConfig(event.type, metadata);

          return (
            <div key={event.id}>
              {/* Gap indicator */}
              {showGaps && event.gapBefore && event.gapBefore > 60 && (
                <div className="flex items-center gap-4 py-2 ml-[4.5rem]">
                  <div className="flex-1 border-t-2 border-dashed border-gray-200" />
                  <span className="text-xs text-gray-400 px-2">
                    间隔 {formatDuration(event.gapBefore)}
                  </span>
                  <div className="flex-1 border-t-2 border-dashed border-gray-200" />
                </div>
              )}

              {/* Event item */}
              <div
                className={`
                  flex gap-4 group
                  ${onEventClick ? 'cursor-pointer' : ''}
                `}
                onClick={() => onEventClick?.(event)}
              >
                {/* Time column */}
                <div className="w-16 flex-shrink-0 text-right">
                  <span className="text-sm font-medium text-gray-600">
                    {formatTime(startTime)}
                  </span>
                </div>

                {/* Timeline dot */}
                <div className="relative flex-shrink-0">
                  <div className={`
                    w-3 h-3 rounded-full border-2 bg-white z-10 relative
                    ${config.borderColor}
                    ${config.borderStyle ?? ''}
                    group-hover:scale-125 transition-transform
                  `} />
                </div>

                {/* Event content */}
                <div className={`
                  flex-1 p-3 rounded-lg border transition-shadow
                  ${config.bgColor} ${config.borderColor}
                  ${config.borderStyle ?? ''}
                  ${onEventClick ? 'group-hover:shadow-md' : ''}
                `}>
                  {/* Header */}
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{config.icon}</span>
                      <span className={`text-sm font-medium ${config.color}`}>
                        {config.label}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">
                      {formatDuration(event.duration)}
                    </span>
                  </div>

                  {/* Title */}
                  <p className="text-sm text-gray-800 font-medium">
                    {event.title}
                  </p>

                  {/* Time range */}
                  {endTime && (
                    <p className="text-xs text-gray-500 mt-1">
                      {formatTime(startTime)} - {formatTime(endTime)}
                    </p>
                  )}

                  {/* Metadata (if any) */}
                  {metadata && Object.keys(metadata).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-200/50">
                      {typeof metadata.status === 'string' && (
                        <span className={`
                          inline-block px-2 py-0.5 text-xs rounded-full
                          ${metadata.status === 'COMPLETED' 
                            ? 'bg-green-100 text-green-700' 
                            : metadata.status === 'INTERRUPTED'
                              ? 'bg-yellow-100 text-yellow-700'
                              : metadata.status === 'ABORTED'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-gray-100 text-gray-700'
                          }
                        `}>
                          {metadata.status === 'COMPLETED' ? '已完成' :
                           metadata.status === 'INTERRUPTED' ? '被打断' :
                           metadata.status === 'ABORTED' ? '已放弃' :
                           metadata.status}
                        </span>
                      )}
                      {typeof metadata.category === 'string' && (
                        <span className={`
                          inline-block px-2 py-0.5 text-xs rounded-full ml-1
                          ${metadata.category === 'productive' 
                            ? 'bg-green-100 text-green-700' 
                            : metadata.category === 'distracting'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-700'
                          }
                        `}>
                          {metadata.category === 'productive' ? '生产性' :
                           metadata.category === 'distracting' ? '分心' :
                           '中性'}
                        </span>
                      )}
                      {typeof metadata.url === 'string' && (
                        <p className="text-xs text-gray-400 mt-1 truncate">
                          {metadata.url}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default TimelineView;
