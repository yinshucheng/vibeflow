/**
 * Octopus Architecture - Policy Types
 *
 * Policy configuration distributed to clients.
 */

import type { EnforcementMode } from './enums';

// =============================================================================
// POLICY TYPES
// =============================================================================

/**
 * Time slot for work time configuration
 * Requirements: 10.5
 */
export interface TimeSlot {
  /** 0-6 (Sunday = 0) */
  dayOfWeek: number;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

/**
 * Skip token configuration
 * Requirements: 10.5
 */
export interface SkipTokenConfig {
  remaining: number;
  maxPerDay: number;
  delayMinutes: number;
}

/**
 * Distraction app configuration
 * Requirements: 10.5
 */
export interface DistractionApp {
  bundleId: string;
  name: string;
  action: 'force_quit' | 'hide_window';
}

/**
 * Ad-hoc focus session configuration for policy
 * Requirements: 2.3, 13.1, 13.2
 */
export interface AdhocFocusSession {
  /** Whether an ad-hoc focus session is currently active */
  active: boolean;
  /** Unix timestamp when the session ends */
  endTime: number;
  /** Whether this session overrides sleep time enforcement */
  overridesSleepTime?: boolean;
  /** Whether this session overrides work hours (enables OVER_REST outside work hours) */
  overridesWorkHours?: boolean;
}

/**
 * Sleep enforcement app configuration for policy
 * Requirements: 11.1
 */
export interface SleepEnforcementAppPolicy {
  bundleId: string;
  name: string;
}

/**
 * Sleep time configuration for policy
 * Requirements: 9.4, 11.1, 11.2
 */
export interface SleepTimePolicy {
  /** Whether sleep time enforcement is enabled */
  enabled: boolean;
  /** Sleep start time in "HH:mm" format */
  startTime: string;
  /** Sleep end time in "HH:mm" format */
  endTime: string;
  /** Apps to close during sleep time */
  enforcementApps: SleepEnforcementAppPolicy[];
  /** Whether currently within the sleep time window */
  isCurrentlyActive: boolean;
  /** Whether sleep enforcement is currently snoozed */
  isSnoozed: boolean;
  /** Unix timestamp when snooze ends (if snoozed) */
  snoozeEndTime?: number;
}

/**
 * Over rest configuration for policy
 * Requirements: 15.2, 15.3, 16.1-16.5
 */
export interface OverRestPolicy {
  /** Whether user is currently in over rest state */
  isOverRest: boolean;
  /** Minutes over the normal rest duration */
  overRestMinutes: number;
  /** Apps to close during over rest */
  enforcementApps: SleepEnforcementAppPolicy[];
  /** Whether to bring app to front */
  bringToFront: boolean;
}

/**
 * REST enforcement policy - blocks work apps during rest periods
 */
export interface RestEnforcementPolicy {
  /** Whether REST enforcement is currently active */
  isActive: boolean;
  /** Work apps to close/hide during REST */
  workApps: SleepEnforcementAppPolicy[];
  /** Enforcement actions: 'close' | 'hide' */
  actions: string[];
  /** Grace info for client display */
  grace: {
    available: boolean;
    remaining: number;
    durationMinutes: number;
  };
}

/**
 * Work time policy -- blocks distraction apps during configured work hours.
 * Suppressed during legitimate rest periods after pomodoro completion.
 */
export interface WorkTimePolicy {
  /** Whether work time blocking is enabled (has enabled slots) */
  enabled: boolean;
  /** Whether current time is within a work time slot */
  isCurrentlyActive: boolean;
  /** Whether user is in legitimate rest period after completing a pomodoro */
  isInRestPeriod: boolean;
  /** Enabled work time slots in "HH:mm" format, for DeviceActivity registration */
  slots: { startTime: string; endTime: string }[];
}

/**
 * Policy object distributed to clients
 * Requirements: 10.5, 10.6
 */
export interface Policy {
  version: number;
  blacklist: string[];
  whitelist: string[];
  enforcementMode: EnforcementMode;
  workTimeSlots: TimeSlot[];
  skipTokens: SkipTokenConfig;
  distractionApps: DistractionApp[];
  /** Unix timestamp */
  updatedAt: number;
  /** Ad-hoc focus session configuration (optional) */
  adhocFocusSession?: AdhocFocusSession;
  /** Sleep time configuration (optional) */
  sleepTime?: SleepTimePolicy;
  /** Over rest configuration (optional) */
  overRest?: OverRestPolicy;
  /** Temporary unblock configuration (optional) */
  temporaryUnblock?: { active: boolean; endTime: number };
  /** REST enforcement configuration (optional) */
  restEnforcement?: RestEnforcementPolicy;
  /** Work time blocking configuration (optional) */
  workTime?: WorkTimePolicy;
  /** Health limit notification (optional) */
  healthLimit?: {
    type: '2hours' | 'daily';
    message: string;
    /** Whether to repeat the notification at intervals */
    repeating?: boolean;
    /** Interval in minutes between repeated notifications */
    intervalMinutes?: number;
  };
}
