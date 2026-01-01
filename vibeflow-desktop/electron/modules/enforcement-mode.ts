/**
 * Enforcement Mode Module
 * 
 * Handles strict and gentle enforcement mode behaviors for the Focus Enforcer.
 * 
 * Requirements: 2.4, 2.5, 4.2, 4.5
 */

import type { DistractionApp, InterventionAction } from '../types';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Enforcement mode type
 */
export type EnforcementMode = 'strict' | 'gentle';

/**
 * Mode-specific configuration
 */
export interface EnforcementModeConfig {
  mode: EnforcementMode;
  // Strict mode settings (Requirements: 4.4)
  strictSkipTokenLimit: number;      // Default: 1
  strictMaxDelayMinutes: number;     // Default: 5
  // Gentle mode settings (Requirements: 4.7)
  gentleSkipTokenLimit: number;      // Default: 3-5
  gentleMaxDelayMinutes: number;     // Default: 15
  // Warning settings for gentle mode
  warningDurationSeconds: number;    // How long to show warning before action
}

/**
 * Mode behavior result
 */
export interface ModeBehavior {
  showWarningFirst: boolean;
  warningDurationSeconds: number;
  appAction: 'force_quit' | 'hide_window';
  skipTokenLimit: number;
  maxDelayMinutes: number;
  allowContinue: boolean;  // Whether user can choose to continue (gentle mode)
}

/**
 * Browser blocking behavior
 */
export interface BrowserBlockingBehavior {
  closeTabImmediately: boolean;
  showWarningOverlay: boolean;
  warningDurationSeconds: number;
  allowProceed: boolean;  // Whether user can proceed (consumes skip token)
  redirectToDashboard: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_ENFORCEMENT_CONFIG: EnforcementModeConfig = {
  mode: 'gentle',
  strictSkipTokenLimit: 1,
  strictMaxDelayMinutes: 5,
  gentleSkipTokenLimit: 3,
  gentleMaxDelayMinutes: 15,
  warningDurationSeconds: 10,
};

// ============================================================================
// Enforcement Mode Logic
// ============================================================================

/**
 * Get the behavior configuration for a given enforcement mode
 * 
 * Property 2: Enforcement Mode Determines App Control Action
 * - If enforcement mode is "strict", all apps SHALL receive "force_quit" commands
 * - If enforcement mode is "gentle", all apps SHALL receive "hide_window" commands
 * 
 * Requirements: 2.4, 2.5, 4.2, 4.5
 */
export function getModeBehavior(
  mode: EnforcementMode,
  config: EnforcementModeConfig = DEFAULT_ENFORCEMENT_CONFIG
): ModeBehavior {
  if (mode === 'strict') {
    // Strict mode: immediate action, limited skip tokens
    // Requirements: 2.4, 4.2, 4.4
    return {
      showWarningFirst: false,
      warningDurationSeconds: 0,
      appAction: 'force_quit',
      skipTokenLimit: config.strictSkipTokenLimit,
      maxDelayMinutes: config.strictMaxDelayMinutes,
      allowContinue: false,
    };
  }
  
  // Gentle mode: show warning first, more skip tokens
  // Requirements: 2.5, 4.5, 4.7
  return {
    showWarningFirst: true,
    warningDurationSeconds: config.warningDurationSeconds,
    appAction: 'hide_window',
    skipTokenLimit: config.gentleSkipTokenLimit,
    maxDelayMinutes: config.gentleMaxDelayMinutes,
    allowContinue: true,
  };
}

/**
 * Get browser blocking behavior based on enforcement mode
 * 
 * Property 6: Browser Blocking Behavior by Mode
 * - If enforcement mode is "strict", the tab SHALL be closed immediately
 * - If enforcement mode is "gentle", a warning overlay SHALL be shown first
 * 
 * Requirements: 4.3, 4.6, 6.1, 6.7
 */
export function getBrowserBlockingBehavior(
  mode: EnforcementMode,
  config: EnforcementModeConfig = DEFAULT_ENFORCEMENT_CONFIG
): BrowserBlockingBehavior {
  if (mode === 'strict') {
    // Strict mode: close tab immediately, no option to continue
    // Requirements: 4.3, 6.1
    return {
      closeTabImmediately: true,
      showWarningOverlay: false,
      warningDurationSeconds: 0,
      allowProceed: false,
      redirectToDashboard: true,
    };
  }
  
  // Gentle mode: show warning overlay with countdown
  // Requirements: 4.6, 6.7
  return {
    closeTabImmediately: false,
    showWarningOverlay: true,
    warningDurationSeconds: config.warningDurationSeconds,
    allowProceed: true,  // Can proceed by consuming skip token
    redirectToDashboard: true,
  };
}

/**
 * Get the intervention action for distraction apps based on mode
 * 
 * Requirements: 2.4, 2.5
 */
export function getInterventionAction(
  mode: EnforcementMode,
  distractionApps: DistractionApp[]
): InterventionAction {
  const behavior = getModeBehavior(mode);
  
  if (mode === 'strict') {
    // Strict mode: force quit all apps regardless of individual settings
    // Requirements: 2.4, 4.2
    return {
      type: 'force_quit',
      apps: distractionApps.map(app => ({
        ...app,
        action: 'force_quit' as const,
      })),
    };
  }
  
  // Gentle mode: use individual app settings (default to hide_window)
  // Requirements: 2.5, 4.5
  return {
    type: behavior.appAction,
    apps: distractionApps.map(app => ({
      ...app,
      action: app.action || 'hide_window',
    })),
  };
}

/**
 * Get skip token limits based on enforcement mode
 * 
 * Requirements: 4.4, 4.7
 */
export function getSkipTokenLimits(
  mode: EnforcementMode,
  config: EnforcementModeConfig = DEFAULT_ENFORCEMENT_CONFIG
): { dailyLimit: number; maxDelayMinutes: number } {
  if (mode === 'strict') {
    // Strict mode: 1 token per day, max 5 minute delay
    // Requirements: 4.4
    return {
      dailyLimit: config.strictSkipTokenLimit,
      maxDelayMinutes: config.strictMaxDelayMinutes,
    };
  }
  
  // Gentle mode: 3-5 tokens per day, max 15 minute delay
  // Requirements: 4.7
  return {
    dailyLimit: config.gentleSkipTokenLimit,
    maxDelayMinutes: config.gentleMaxDelayMinutes,
  };
}

/**
 * Check if a mode switch is allowed
 * Mode switching is not allowed during work hours in production mode
 * 
 * Requirements: 4.8
 */
export function canSwitchMode(
  isDevelopmentMode: boolean,
  isWithinWorkHours: boolean
): { allowed: boolean; reason?: string } {
  // Development mode: always allow
  if (isDevelopmentMode) {
    return { allowed: true };
  }
  
  // Production mode: only allow outside work hours
  if (isWithinWorkHours) {
    return {
      allowed: false,
      reason: 'Enforcement mode cannot be changed during work hours. Please try again outside your configured work time.',
    };
  }
  
  return { allowed: true };
}

/**
 * Validate enforcement mode value
 */
export function isValidEnforcementMode(mode: string): mode is EnforcementMode {
  return mode === 'strict' || mode === 'gentle';
}

/**
 * Get display name for enforcement mode
 */
export function getModeDisplayName(mode: EnforcementMode): string {
  return mode === 'strict' ? 'Strict Mode' : 'Gentle Mode';
}

/**
 * Get description for enforcement mode
 */
export function getModeDescription(mode: EnforcementMode): string {
  if (mode === 'strict') {
    return 'Distraction apps will be force quit immediately. Limited skip tokens (1/day, max 5 min delay). Browser tabs closed without warning.';
  }
  return 'Distraction apps will be hidden with a warning first. More skip tokens (3-5/day, max 15 min delay). Browser shows warning overlay before closing.';
}

// ============================================================================
// Export Service
// ============================================================================

export const enforcementModeService = {
  getModeBehavior,
  getBrowserBlockingBehavior,
  getInterventionAction,
  getSkipTokenLimits,
  canSwitchMode,
  isValidEnforcementMode,
  getModeDisplayName,
  getModeDescription,
  DEFAULT_ENFORCEMENT_CONFIG,
};

export default enforcementModeService;
