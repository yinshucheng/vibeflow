/**
 * Settings Lock Service
 * 
 * Manages settings lock mechanism for sensitive settings during work hours.
 * In production mode, certain settings are locked during work hours to prevent
 * users from bypassing focus restrictions in moments of weakness.
 * 
 * Requirements: 3.5, 3.6, 8.1, 8.4, 8.5, 8.6
 */

import { isWithinWorkHours as checkWorkHours, parseTimeToMinutes, getCurrentTimeMinutes } from './idle.service';
import type { WorkTimeSlot } from '@/components/settings/work-time-settings';

// Settings that are subject to lock during work hours (Requirements 8.4)
export const LOCKABLE_SETTINGS = [
  'distractionApps',
  'enforcementMode',
  'skipTokenDailyLimit',
  'skipTokenMaxDelay',
  'workTimeSlots',
] as const;

export type LockableSetting = typeof LOCKABLE_SETTINGS[number];

// Lock status for a setting
export interface SettingLockStatus {
  key: string;
  isLocked: boolean;
  reason?: string;
  unlockTime?: Date | null; // When the setting will be unlocked (null = end of work hours)
}

// Result of checking if a setting can be modified
export interface CanModifyResult {
  allowed: boolean;
  reason?: string;
  unlockTime?: Date | null;
}

// Settings lock configuration
export interface SettingsLockConfig {
  isDevelopmentMode: boolean;
  workTimeSlots: WorkTimeSlot[];
}

/**
 * Check if the application is running in development mode
 * Requirements: 8.1
 */
export function isDevelopmentMode(): boolean {
  return process.env.NODE_ENV === 'development' || process.env.DEV_MODE === 'true';
}

/**
 * Check if a setting key is a lockable setting
 */
export function isLockableSetting(key: string): key is LockableSetting {
  return LOCKABLE_SETTINGS.includes(key as LockableSetting);
}

/**
 * Check if currently within work hours based on work time slots
 * Requirements: 3.5, 3.6
 */
export function isWithinWorkHours(workTimeSlots: WorkTimeSlot[]): boolean {
  return checkWorkHours(workTimeSlots);
}

/**
 * Get the next unlock time (end of current work slot)
 * Returns null if not within work hours or no enabled slots
 */
export function getNextUnlockTime(workTimeSlots: WorkTimeSlot[]): Date | null {
  const enabledSlots = workTimeSlots.filter(slot => slot.enabled);
  if (enabledSlots.length === 0) {
    return null;
  }

  const currentMinutes = getCurrentTimeMinutes();
  
  // Find the current active slot
  for (const slot of enabledSlots) {
    const startMinutes = parseTimeToMinutes(slot.startTime);
    const endMinutes = parseTimeToMinutes(slot.endTime);
    
    if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
      // We're in this slot, return the end time
      const now = new Date();
      const endHours = Math.floor(endMinutes / 60);
      const endMins = endMinutes % 60;
      
      const unlockTime = new Date(now);
      unlockTime.setHours(endHours, endMins, 0, 0);
      
      return unlockTime;
    }
  }
  
  return null;
}

/**
 * Format unlock time for display
 */
export function formatUnlockTime(unlockTime: Date | null): string {
  if (!unlockTime) {
    return 'outside work hours';
  }
  
  return unlockTime.toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true 
  });
}

/**
 * Check if a setting can be modified
 * 
 * Rules (Requirements 3.5, 3.6, 8.4, 8.5, 8.6):
 * - Development mode: Always allowed
 * - Production mode + within work hours: Locked settings cannot be modified
 * - Production mode + outside work hours: All settings can be modified
 */
export function canModifySetting(
  settingKey: string,
  config: SettingsLockConfig
): CanModifyResult {
  // Development mode: always allow (Requirements 3.5, 8.6)
  if (config.isDevelopmentMode) {
    return { allowed: true };
  }

  // Non-lockable settings: always allow
  if (!isLockableSetting(settingKey)) {
    return { allowed: true };
  }

  // Production mode: check work hours (Requirements 3.6, 8.5)
  const withinWorkHours = isWithinWorkHours(config.workTimeSlots);
  
  if (withinWorkHours) {
    const unlockTime = getNextUnlockTime(config.workTimeSlots);
    return {
      allowed: false,
      reason: `This setting is locked during work hours. You can modify it after ${formatUnlockTime(unlockTime)}.`,
      unlockTime,
    };
  }

  // Outside work hours: allow
  return { allowed: true };
}

/**
 * Get lock status for all lockable settings
 */
export function getAllSettingsLockStatus(config: SettingsLockConfig): SettingLockStatus[] {
  return LOCKABLE_SETTINGS.map(key => {
    const result = canModifySetting(key, config);
    return {
      key,
      isLocked: !result.allowed,
      reason: result.reason,
      unlockTime: result.unlockTime,
    };
  });
}

/**
 * Get lock status for a specific setting
 */
export function getSettingLockStatus(
  settingKey: string,
  config: SettingsLockConfig
): SettingLockStatus {
  const result = canModifySetting(settingKey, config);
  return {
    key: settingKey,
    isLocked: !result.allowed,
    reason: result.reason,
    unlockTime: result.unlockTime,
  };
}

/**
 * Get human-readable name for a lockable setting
 */
export function getSettingDisplayName(settingKey: LockableSetting): string {
  const displayNames: Record<LockableSetting, string> = {
    distractionApps: 'Distraction Apps',
    enforcementMode: 'Enforcement Mode',
    skipTokenDailyLimit: 'Skip Token Daily Limit',
    skipTokenMaxDelay: 'Skip Token Max Delay',
    workTimeSlots: 'Work Time Slots',
  };
  return displayNames[settingKey] || settingKey;
}

// Settings Lock Service singleton
export const settingsLockService = {
  isDevelopmentMode,
  isLockableSetting,
  isWithinWorkHours,
  getNextUnlockTime,
  formatUnlockTime,
  canModifySetting,
  getAllSettingsLockStatus,
  getSettingLockStatus,
  getSettingDisplayName,
  LOCKABLE_SETTINGS,
};

export default settingsLockService;
