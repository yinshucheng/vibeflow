/**
 * SettingsLockIndicator Component
 * 
 * Displays lock status for settings that are locked during work hours.
 * Shows a lock icon and unlock time when settings are locked.
 * 
 * Requirements: 8.2, 8.3
 */

'use client';

import { useSettingsLock, type LockableSetting } from '@/hooks/use-settings-lock';
import { getSettingDisplayName } from '@/services/settings-lock.service';

interface SettingsLockIndicatorProps {
  settingKey: LockableSetting;
  showLabel?: boolean;
  className?: string;
}

/**
 * Individual lock indicator for a specific setting
 */
export function SettingsLockIndicator({ 
  settingKey, 
  showLabel = false,
  className = '' 
}: SettingsLockIndicatorProps) {
  const { getStatus, isLoading } = useSettingsLock();
  
  if (isLoading) {
    return null;
  }
  
  const status = getStatus(settingKey);
  
  if (!status.isLocked) {
    return null;
  }
  
  return (
    <div className={`inline-flex items-center gap-1.5 text-amber-600 ${className}`}>
      <span className="text-sm" title={status.reason}>🔒</span>
      {showLabel && (
        <span className="text-xs">
          Locked until {status.unlockTime?.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
          }) || 'end of work hours'}
        </span>
      )}
    </div>
  );
}

interface SettingsLockBannerProps {
  className?: string;
}

/**
 * Banner showing overall lock status for the settings page
 */
export function SettingsLockBanner({ className = '' }: SettingsLockBannerProps) {
  const { 
    hasLockedSettings, 
    isDevelopmentMode, 
    isWithinWorkHours,
    formattedUnlockTime,
    isLoading 
  } = useSettingsLock();
  
  if (isLoading) {
    return null;
  }
  
  // Show dev mode indicator
  if (isDevelopmentMode) {
    return (
      <div className={`p-3 bg-blue-50 border border-blue-200 rounded-lg ${className}`}>
        <div className="flex items-center gap-2">
          <span className="text-blue-600">🔧</span>
          <div>
            <p className="text-sm font-medium text-blue-800">Development Mode</p>
            <p className="text-xs text-blue-600">
              All settings can be modified at any time in development mode.
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  // Show lock status in production mode
  if (hasLockedSettings && isWithinWorkHours) {
    return (
      <div className={`p-3 bg-amber-50 border border-amber-200 rounded-lg ${className}`}>
        <div className="flex items-center gap-2">
          <span className="text-amber-600">🔒</span>
          <div>
            <p className="text-sm font-medium text-amber-800">Settings Locked</p>
            <p className="text-xs text-amber-600">
              Some settings are locked during work hours to help you stay focused.
              They will be unlocked {formattedUnlockTime}.
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  return null;
}

interface LockedSettingsListProps {
  className?: string;
}

/**
 * List of all locked settings with their unlock times
 */
export function LockedSettingsList({ className = '' }: LockedSettingsListProps) {
  const { getAllStatus, hasLockedSettings, isLoading } = useSettingsLock();
  
  if (isLoading || !hasLockedSettings) {
    return null;
  }
  
  const allStatus = getAllStatus();
  const lockedSettings = allStatus.filter(s => s.isLocked);
  
  if (lockedSettings.length === 0) {
    return null;
  }
  
  return (
    <div className={`p-4 bg-gray-50 rounded-lg ${className}`}>
      <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
        <span>🔒</span>
        Locked Settings
      </h4>
      <ul className="space-y-1">
        {lockedSettings.map(status => (
          <li key={status.key} className="text-sm text-gray-600 flex items-center gap-2">
            <span className="text-amber-500">•</span>
            <span>{getSettingDisplayName(status.key as LockableSetting)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface SettingsLockWrapperProps {
  settingKey: LockableSetting;
  children: React.ReactNode;
  className?: string;
}

/**
 * Wrapper component that disables children when setting is locked
 */
export function SettingsLockWrapper({ 
  settingKey, 
  children, 
  className = '' 
}: SettingsLockWrapperProps) {
  const { getStatus, isLoading } = useSettingsLock();
  
  if (isLoading) {
    return <>{children}</>;
  }
  
  const status = getStatus(settingKey);
  
  if (!status.isLocked) {
    return <>{children}</>;
  }
  
  return (
    <div className={`relative ${className}`}>
      {/* Overlay to prevent interaction */}
      <div className="absolute inset-0 bg-gray-100/50 rounded-lg z-10 cursor-not-allowed" />
      
      {/* Lock indicator */}
      <div className="absolute top-2 right-2 z-20">
        <SettingsLockIndicator settingKey={settingKey} showLabel />
      </div>
      
      {/* Disabled content */}
      <div className="opacity-60 pointer-events-none">
        {children}
      </div>
    </div>
  );
}
