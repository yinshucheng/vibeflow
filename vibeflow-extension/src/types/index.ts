// =============================================================================
// SHARED PROTOCOL TYPES (from @vibeflow/octopus-protocol)
// =============================================================================
// CRITICAL: All imports from the shared package MUST be `export type`.
// Extension compiles with plain `tsc` to JS files loaded directly by Chrome.
// Runtime imports to @vibeflow/octopus-protocol would fail in the browser.
// Type-only exports are erased during compilation.

// --- Enums / string unions ---
export type { EventType } from '@vibeflow/octopus-protocol';
export type { ClientType } from '@vibeflow/octopus-protocol';
export type { CommandType } from '@vibeflow/octopus-protocol';
export type { ActivityCategory } from '@vibeflow/octopus-protocol';
export type { NavigationType } from '@vibeflow/octopus-protocol';
export type { SearchEngine } from '@vibeflow/octopus-protocol';
export type { BrowserFocusState } from '@vibeflow/octopus-protocol';
export type { InteractionType } from '@vibeflow/octopus-protocol';
export type { ConnectionQuality } from '@vibeflow/octopus-protocol';
export type { CommandPriority } from '@vibeflow/octopus-protocol';
export type { EnforcementMode } from '@vibeflow/octopus-protocol';
export type { EntertainmentStopReason } from '@vibeflow/octopus-protocol';
export type { UIType } from '@vibeflow/octopus-protocol';

// --- Event stream types ---
export type { BaseEvent } from '@vibeflow/octopus-protocol';
export type { HeartbeatPayload, HeartbeatEvent } from '@vibeflow/octopus-protocol';
export type { BrowserActivityPayload, BrowserActivityEvent } from '@vibeflow/octopus-protocol';
export type { DomainBreakdownEntry } from '@vibeflow/octopus-protocol';
export type { BrowserSessionPayload, BrowserSessionEvent } from '@vibeflow/octopus-protocol';
export type { TabSwitchPayload, TabSwitchEvent } from '@vibeflow/octopus-protocol';
export type { BrowserFocusPayload, BrowserFocusEvent } from '@vibeflow/octopus-protocol';
export type { EntertainmentModePayload, EntertainmentModeEvent } from '@vibeflow/octopus-protocol';
export type { WorkStartPayload, WorkStartEvent } from '@vibeflow/octopus-protocol';
export type { OctopusEvent } from '@vibeflow/octopus-protocol';

// --- Command stream types ---
export type { BaseCommand } from '@vibeflow/octopus-protocol';
export type { SyncStatePayload, SyncStateCommand } from '@vibeflow/octopus-protocol';
export type { ExecuteActionPayload, ExecuteActionCommand } from '@vibeflow/octopus-protocol';
export type { UpdatePolicyPayload, UpdatePolicyCommand } from '@vibeflow/octopus-protocol';
export type { ShowUIPayload, ShowUICommand } from '@vibeflow/octopus-protocol';
export type { OctopusCommand } from '@vibeflow/octopus-protocol';

// --- Policy types ---
export type { DistractionApp } from '@vibeflow/octopus-protocol';
export type { TimeSlot } from '@vibeflow/octopus-protocol';
export type { SkipTokenConfig } from '@vibeflow/octopus-protocol';
export type { Policy } from '@vibeflow/octopus-protocol';

// --- Backward-compatible aliases for renamed types ---
export type { EventType as OctopusEventType } from '@vibeflow/octopus-protocol';
export type { CommandType as OctopusCommandType } from '@vibeflow/octopus-protocol';
export type { BaseEvent as OctopusBaseEvent } from '@vibeflow/octopus-protocol';
export type { BaseCommand as OctopusBaseCommand } from '@vibeflow/octopus-protocol';
export type { TimeSlot as OctopusTimeSlot } from '@vibeflow/octopus-protocol';
export type { Policy as OctopusPolicy } from '@vibeflow/octopus-protocol';

// =============================================================================
// EXTENSION-LOCAL TYPES (not shared)
// =============================================================================

// System state types matching the main VibeFlow application (3-state model)
// Legacy values (LOCKED, PLANNING, REST) may still arrive during transition — normalize to IDLE.
export type SystemState = 'IDLE' | 'FOCUS' | 'OVER_REST';

/** Normalize legacy 5-state values to 3-state model */
export function normalizeSystemState(raw: string): SystemState {
  const upper = raw.toUpperCase();
  switch (upper) {
    case 'FOCUS': return 'FOCUS';
    case 'OVER_REST': return 'OVER_REST';
    case 'IDLE':
    case 'LOCKED':
    case 'PLANNING':
    case 'REST':
    default:
      return 'IDLE';
  }
}

// Time context from server (mirrors progress-calculation.service TimeContext)
export type TimeContext = 'work_time' | 'sleep_time' | 'free_time' | 'adhoc_focus';

// Action types that can be executed by browser extension
export type BrowserActionType =
  | 'CLOSE_TAB'
  | 'REDIRECT_TAB'
  | 'INJECT_OVERLAY'
  | 'ADD_SESSION_WHITELIST';

// Work time slot for checking work hours (Extension-local version with string times)
export interface WorkTimeSlot {
  id: string;
  startTime: string; // HH:mm format
  endTime: string;   // HH:mm format
  enabled: boolean;
}

// Entertainment blacklist entry
export interface EntertainmentBlacklistEntry {
  domain: string;
  isPreset: boolean;
  enabled: boolean;
  addedAt: number;
}

// Entertainment whitelist entry
export interface EntertainmentWhitelistEntry {
  pattern: string;
  description?: string;
  isPreset: boolean;
  enabled: boolean;
  addedAt: number;
}

// Policy cache stored locally in the extension
export interface PolicyCache {
  globalState: SystemState;
  timeContext: TimeContext;
  blacklist: string[];
  whitelist: string[];
  sessionWhitelist: string[];
  lastSync: number;
  // Enhanced fields for focus enforcement (Requirements 4.1, 6.1)
  enforcementMode: 'strict' | 'gentle';
  workTimeSlots: WorkTimeSlot[];
  skipTokensRemaining: number;
  skipTokenDailyLimit: number;
  skipTokenMaxDelay: number;
  browserRedirectReplace: boolean;
  isAuthenticated: boolean;
  dashboardUrl: string;
  // Entertainment fields (Requirements 2.1, 2.3, 2.5, 2.6, 2.7)
  entertainmentBlacklist: EntertainmentBlacklistEntry[];
  entertainmentWhitelist: EntertainmentWhitelistEntry[];
  entertainmentQuotaMinutes: number;
  entertainmentCooldownMinutes: number;
  entertainmentModeActive: boolean;
}

// Activity log entry for tracking browser usage
export interface ActivityLog {
  url: string;
  title: string;
  startTime: number;
  duration: number;
  category: 'productive' | 'neutral' | 'distracting';
}

// Timeline event types (Requirements: 7.1, 7.2)
export type TimelineEventType =
  | 'pomodoro'
  | 'distraction'
  | 'break'
  | 'scheduled_task'
  | 'activity_log'
  | 'block'
  | 'state_change'
  | 'interruption'
  | 'idle';

// Timeline event entry for detailed activity tracking
export interface TimelineEvent {
  type: TimelineEventType;
  startTime: number; // timestamp
  endTime?: number; // timestamp
  duration: number; // seconds
  title: string;
  metadata?: Record<string, unknown>;
}

// Block event for tracking blocked site access (Requirements: 7.4)
export interface BlockEvent {
  url: string;
  timestamp: number;
  blockType: 'hard_block' | 'soft_block' | 'entertainment_block';
  userAction?: 'proceeded' | 'returned';
  pomodoroId?: string;
}

// Interruption event for tracking focus interruptions (Requirements: 7.4)
export interface InterruptionEvent {
  timestamp: number;
  duration: number; // seconds
  source: 'blocked_site' | 'tab_switch' | 'idle' | 'manual';
  pomodoroId: string;
  details?: {
    url?: string;
    idleSeconds?: number;
  };
}

// Server messages (Server -> Extension)
export type ServerMessage =
  | { type: 'SYNC_POLICY'; payload: PolicyCache }
  | { type: 'STATE_CHANGE'; payload: { state: SystemState; timeContext?: TimeContext } }
  | { type: 'EXECUTE'; payload: ExecuteCommand };

export type ExecuteCommand =
  | { action: 'INJECT_TOAST'; params: { msg: string; type: 'info' | 'warning' } }
  | { action: 'SHOW_OVERLAY'; params: { type: 'soft_block' | 'screensaver' } }
  | { action: 'REDIRECT'; params: { url: string } }
  | { action: 'POMODORO_COMPLETE'; params: { pomodoroId: string; taskTitle: string } }
  | { action: 'IDLE_ALERT'; params: { idleSeconds: number; threshold: number } };

// Client messages (Extension -> Server)
export type ClientMessage =
  | { type: 'ACTIVITY_LOG'; payload: ActivityLog[] }
  | { type: 'URL_CHECK'; payload: { url: string } }
  | { type: 'USER_RESPONSE'; payload: { questionId: string; response: boolean } }
  | { type: 'TIMELINE_EVENT'; payload: TimelineEvent }
  | { type: 'TIMELINE_EVENTS_BATCH'; payload: TimelineEvent[] }
  | { type: 'BLOCK_EVENT'; payload: BlockEvent }
  | { type: 'INTERRUPTION_EVENT'; payload: InterruptionEvent };

// Extension storage structure
export interface ExtensionStorage {
  serverUrl: string;
  isConnected: boolean;
  policyCache: PolicyCache;
  pendingActivityLogs: ActivityLog[];
  pendingTimelineEvents: TimelineEvent[];
  currentPomodoroId?: string;
}

// Connection status for the popup
export interface ConnectionStatus {
  connected: boolean;
  serverUrl: string;
  systemState: SystemState;
  pomodoroCount: number;
  dailyCap: number;
  currentTaskTitle: string | null;
  currentPomodoroId: string | null;
}

// URL check result
export type UrlCheckResult = 'allow' | 'block' | 'soft_block';

// Enhanced URL check result with mode information (Requirements 4.3, 6.1)
export interface EnhancedUrlCheckResult {
  action: UrlCheckResult;
  enforcementMode: 'strict' | 'gentle';
  isWithinWorkHours: boolean;
  isPomodoroActive: boolean;
  skipTokensRemaining: number;
  blockedUrl?: string;
}
