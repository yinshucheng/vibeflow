/**
 * Octopus Architecture - Policy Types
 *
 * Policy = Config (user settings, low-frequency change) + State (runtime computed values).
 * Phase B1: Split from flat Policy to eliminate runtime state mixed into configuration.
 */
import type { EnforcementMode } from './enums';
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
 * Distraction app configuration
 * Requirements: 10.5
 */
export interface DistractionApp {
    bundleId: string;
    name: string;
    action: 'force_quit' | 'hide_window';
}
/**
 * Sleep enforcement app entry
 * Requirements: 11.1
 */
export interface SleepEnforcementAppPolicy {
    bundleId: string;
    name: string;
}
/** Skip token configuration (config portion — maxPerDay and delayMinutes) */
export interface SkipTokenConfig {
    maxPerDay: number;
    delayMinutes: number;
}
/** Sleep time configuration (config portion — schedule and enforcement apps) */
export interface SleepTimeConfig {
    enabled: boolean;
    /** Sleep start time in "HH:mm" format */
    startTime: string;
    /** Sleep end time in "HH:mm" format */
    endTime: string;
    /** Apps to close during sleep time */
    enforcementApps: SleepEnforcementAppPolicy[];
}
/** REST enforcement configuration (config portion — apps and actions) */
export interface RestEnforcementConfig {
    /** Work apps to close/hide during REST */
    workApps: SleepEnforcementAppPolicy[];
    /** Enforcement actions: 'close' | 'hide' */
    actions: string[];
    /** Grace period duration in minutes */
    graceDurationMinutes: number;
}
/**
 * PolicyConfig — Pure user configuration, changes only when user modifies settings.
 * Requirements: 10.5, 10.6
 */
export interface PolicyConfig {
    version: number;
    /** Unix timestamp of last config change */
    updatedAt: number;
    blacklist: string[];
    whitelist: string[];
    enforcementMode: EnforcementMode;
    workTimeSlots: TimeSlot[];
    skipTokens: SkipTokenConfig;
    distractionApps: DistractionApp[];
    /** Sleep time schedule and enforcement apps */
    sleepTime?: SleepTimeConfig;
    /** Apps to enforce during OVER_REST (from settings, separate from distractionApps) */
    overRestEnforcementApps?: DistractionApp[];
    /** REST enforcement config (apps and actions) */
    restEnforcement?: RestEnforcementConfig;
}
/**
 * PolicyState — Runtime computed values, recalculated on each state change.
 */
export interface PolicyState {
    /** Skip tokens remaining today */
    skipTokensRemaining: number;
    /** Whether currently within the sleep time window */
    isSleepTimeActive: boolean;
    /** Whether sleep enforcement is currently snoozed */
    isSleepSnoozed: boolean;
    /** Unix timestamp when snooze ends (if snoozed) */
    sleepSnoozeEndTime?: number;
    /** Whether user is currently in OVER_REST state */
    isOverRest: boolean;
    /** Minutes over the normal rest duration */
    overRestMinutes: number;
    /** Whether to bring app to front during OVER_REST */
    overRestBringToFront: boolean;
    /** Whether REST enforcement is currently active */
    isRestEnforcementActive: boolean;
    /** REST enforcement grace period info */
    restGrace?: {
        available: boolean;
        remaining: number;
    };
    /** Ad-hoc focus session (present only when active) */
    adhocFocusSession?: AdhocFocusSession;
    /** Temporary unblock (present only when active) */
    temporaryUnblock?: {
        active: boolean;
        endTime: number;
    };
    /** Health limit notification (present only when limit exceeded) */
    healthLimit?: {
        type: '2hours' | 'daily';
        message: string;
        repeating?: boolean;
        intervalMinutes?: number;
    };
}
/**
 * Policy = Config + State, distributed to clients via UPDATE_POLICY command.
 * Requirements: 10.5, 10.6
 */
export interface Policy {
    config: PolicyConfig;
    state: PolicyState;
}
/**
 * Ad-hoc focus session
 * Requirements: 2.3, 13.1, 13.2
 */
export interface AdhocFocusSession {
    active: boolean;
    endTime: number;
    overridesSleepTime?: boolean;
    overridesWorkHours?: boolean;
}
/** @deprecated Use SleepTimeConfig (config) + PolicyState sleep fields (state) */
export interface SleepTimePolicy {
    enabled: boolean;
    startTime: string;
    endTime: string;
    enforcementApps: SleepEnforcementAppPolicy[];
    isCurrentlyActive: boolean;
    isSnoozed: boolean;
    snoozeEndTime?: number;
}
/** @deprecated Use PolicyState.isOverRest + related fields */
export interface OverRestPolicy {
    isOverRest: boolean;
    overRestMinutes: number;
    enforcementApps: SleepEnforcementAppPolicy[];
    bringToFront: boolean;
}
/** @deprecated Use RestEnforcementConfig (config) + PolicyState (state) */
export interface RestEnforcementPolicy {
    isActive: boolean;
    workApps: SleepEnforcementAppPolicy[];
    actions: string[];
    grace: {
        available: boolean;
        remaining: number;
        durationMinutes: number;
    };
}
//# sourceMappingURL=policy.d.ts.map