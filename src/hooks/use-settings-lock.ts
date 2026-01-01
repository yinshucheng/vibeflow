/**
 * useSettingsLock Hook
 * 
 * Provides settings lock status for components that need to check
 * if settings can be modified based on work hours and mode.
 * 
 * Requirements: 8.2, 8.3
 */

'use client';

import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import {
  isDevelopmentMode,
  canModifySetting,
  getSettingLockStatus,
  getAllSettingsLockStatus,
  getNextUnlockTime,
  formatUnlockTime,
  isWithinWorkHours,
  LOCKABLE_SETTINGS,
  type LockableSetting,
  type SettingLockStatus,
  type CanModifyResult,
  type SettingsLockConfig,
} from '@/services/settings-lock.service';
import type { WorkTimeSlot } from '@/components/settings/work-time-settings';

export interface UseSettingsLockResult {
  // Loading state
  isLoading: boolean;
  
  // Mode information
  isDevelopmentMode: boolean;
  isWithinWorkHours: boolean;
  
  // Lock status
  canModify: (settingKey: string) => CanModifyResult;
  getStatus: (settingKey: string) => SettingLockStatus;
  getAllStatus: () => SettingLockStatus[];
  
  // Unlock time
  nextUnlockTime: Date | null;
  formattedUnlockTime: string;
  
  // Helper to check if any lockable setting is locked
  hasLockedSettings: boolean;
}

export function useSettingsLock(): UseSettingsLockResult {
  const { data: settings, isLoading } = trpc.settings.get.useQuery();
  
  const config: SettingsLockConfig = useMemo(() => {
    const devMode = isDevelopmentMode();
    
    // Parse work time slots from settings
    let workTimeSlots: WorkTimeSlot[] = [];
    if (settings) {
      const s = settings as { workTimeSlots?: WorkTimeSlot[] | string };
      if (s.workTimeSlots) {
        if (typeof s.workTimeSlots === 'string') {
          try {
            const parsed = JSON.parse(s.workTimeSlots);
            if (Array.isArray(parsed)) {
              workTimeSlots = parsed;
            }
          } catch {
            // Use empty array if parsing fails
          }
        } else if (Array.isArray(s.workTimeSlots)) {
          workTimeSlots = s.workTimeSlots;
        }
      }
    }
    
    return {
      isDevelopmentMode: devMode,
      workTimeSlots,
    };
  }, [settings]);
  
  const withinWorkHours = useMemo(() => {
    return isWithinWorkHours(config.workTimeSlots);
  }, [config.workTimeSlots]);
  
  const nextUnlockTime = useMemo(() => {
    return getNextUnlockTime(config.workTimeSlots);
  }, [config.workTimeSlots]);
  
  const formattedUnlockTime = useMemo(() => {
    return formatUnlockTime(nextUnlockTime);
  }, [nextUnlockTime]);
  
  const hasLockedSettings = useMemo(() => {
    if (config.isDevelopmentMode) return false;
    return withinWorkHours;
  }, [config.isDevelopmentMode, withinWorkHours]);
  
  const canModify = (settingKey: string): CanModifyResult => {
    return canModifySetting(settingKey, config);
  };
  
  const getStatus = (settingKey: string): SettingLockStatus => {
    return getSettingLockStatus(settingKey, config);
  };
  
  const getAllStatus = (): SettingLockStatus[] => {
    return getAllSettingsLockStatus(config);
  };
  
  return {
    isLoading,
    isDevelopmentMode: config.isDevelopmentMode,
    isWithinWorkHours: withinWorkHours,
    canModify,
    getStatus,
    getAllStatus,
    nextUnlockTime,
    formattedUnlockTime,
    hasLockedSettings,
  };
}

// Re-export types and constants for convenience
export { LOCKABLE_SETTINGS };
export type { LockableSetting, SettingLockStatus, CanModifyResult };
