/**
 * Permissions Module (macOS)
 * 
 * Handles checking and requesting system permissions required for
 * the VibeFlow desktop application to control other applications.
 * 
 * Requirements: 1.5, 9.1, 9.2, 9.3
 */

import { systemPreferences, shell, dialog, BrowserWindow } from 'electron';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Permission types that VibeFlow may need
 */
export type PermissionType = 'accessibility' | 'notifications';

/**
 * Permission status
 */
export interface PermissionStatus {
  granted: boolean;
  canRequest: boolean;
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  accessibility: PermissionStatus;
  notifications: PermissionStatus;
  allGranted: boolean;
}

/**
 * Permission guide step
 */
export interface PermissionGuideStep {
  title: string;
  description: string;
  action?: () => void;
}

// ============================================================================
// Permission Descriptions
// ============================================================================

/**
 * Human-readable descriptions for each permission
 * Requirements: 9.2
 */
export const PERMISSION_DESCRIPTIONS: Record<PermissionType, {
  name: string;
  reason: string;
  instructions: string;
}> = {
  accessibility: {
    name: 'Accessibility',
    reason: 'VibeFlow needs Accessibility permission to detect and control distraction apps during focus sessions. This allows the app to hide or close apps like social media, games, and messaging apps when you should be focusing.',
    instructions: 'Go to System Preferences > Security & Privacy > Privacy > Accessibility, then add VibeFlow to the list of allowed apps.',
  },
  notifications: {
    name: 'Notifications',
    reason: 'VibeFlow needs Notification permission to alert you when it\'s time to start a focus session or when you\'ve been idle too long.',
    instructions: 'Go to System Preferences > Notifications, find VibeFlow, and enable notifications.',
  },
};

// ============================================================================
// Permission Checking Functions
// ============================================================================

/**
 * Check if Accessibility permission is granted
 * Requirements: 9.1, 9.3
 * 
 * @param prompt - If true, will prompt the user to grant permission
 * @returns true if permission is granted
 */
export function checkAccessibilityPermission(prompt = false): boolean {
  if (process.platform !== 'darwin') {
    // Non-macOS platforms don't need this permission
    return true;
  }
  
  return systemPreferences.isTrustedAccessibilityClient(prompt);
}

/**
 * Check if Notifications permission is granted
 * Note: Electron doesn't have a direct API for this, but notifications
 * will work if the user hasn't explicitly denied them
 */
export function checkNotificationsPermission(): boolean {
  // On macOS, we can't directly check notification permission
  // We assume it's granted unless the user has explicitly denied it
  return true;
}

/**
 * Check all required permissions
 * Requirements: 9.1
 */
export function checkAllPermissions(): PermissionCheckResult {
  const accessibility: PermissionStatus = {
    granted: checkAccessibilityPermission(false),
    canRequest: process.platform === 'darwin',
  };
  
  const notifications: PermissionStatus = {
    granted: checkNotificationsPermission(),
    canRequest: true,
  };
  
  return {
    accessibility,
    notifications,
    allGranted: accessibility.granted && notifications.granted,
  };
}

// ============================================================================
// Permission Request Functions
// ============================================================================

/**
 * Request Accessibility permission
 * Requirements: 9.1, 9.2
 * 
 * This will show the system prompt asking the user to grant permission.
 * If already denied, it will open System Preferences.
 */
export function requestAccessibilityPermission(): boolean {
  if (process.platform !== 'darwin') {
    return true;
  }
  
  // First check if already granted
  if (checkAccessibilityPermission(false)) {
    return true;
  }
  
  // Try to prompt for permission (this shows the system dialog)
  const granted = systemPreferences.isTrustedAccessibilityClient(true);
  
  if (!granted) {
    // Open System Preferences to the Accessibility pane
    openAccessibilityPreferences();
  }
  
  return granted;
}

/**
 * Open System Preferences to the Accessibility pane
 */
export function openAccessibilityPreferences(): void {
  if (process.platform === 'darwin') {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
  }
}

/**
 * Open System Preferences to the Notifications pane
 */
export function openNotificationsPreferences(): void {
  if (process.platform === 'darwin') {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.notifications');
  }
}

// ============================================================================
// Permission Guide Functions
// ============================================================================

/**
 * Show a dialog explaining why a permission is needed
 * Requirements: 9.2
 */
export async function showPermissionExplanation(
  permission: PermissionType,
  parentWindow?: BrowserWindow | null
): Promise<boolean> {
  const info = PERMISSION_DESCRIPTIONS[permission];
  
  const result = await dialog.showMessageBox(parentWindow ?? undefined as unknown as BrowserWindow, {
    type: 'info',
    title: `${info.name} Permission Required`,
    message: `VibeFlow needs ${info.name} permission`,
    detail: `${info.reason}\n\n${info.instructions}`,
    buttons: ['Grant Permission', 'Later'],
    defaultId: 0,
    cancelId: 1,
  });
  
  return result.response === 0;
}

/**
 * Show the permission setup guide
 * Requirements: 9.1, 9.2
 * 
 * This guides the user through granting all required permissions.
 */
export async function showPermissionSetupGuide(
  parentWindow?: BrowserWindow | null
): Promise<PermissionCheckResult> {
  const permissions = checkAllPermissions();
  
  // If all permissions are granted, no need to show guide
  if (permissions.allGranted) {
    return permissions;
  }
  
  // Check Accessibility permission
  if (!permissions.accessibility.granted) {
    const shouldRequest = await showPermissionExplanation('accessibility', parentWindow);
    
    if (shouldRequest) {
      requestAccessibilityPermission();
      
      // Show a follow-up dialog
      await dialog.showMessageBox(parentWindow ?? undefined as unknown as BrowserWindow, {
        type: 'info',
        title: 'Permission Setup',
        message: 'Please grant Accessibility permission',
        detail: 'After granting permission in System Preferences, you may need to restart VibeFlow for the changes to take effect.',
        buttons: ['OK'],
      });
    }
  }
  
  // Return updated permission status
  return checkAllPermissions();
}

/**
 * Show a warning when a feature is unavailable due to missing permissions
 * Requirements: 9.3
 */
export async function showPermissionMissingWarning(
  permission: PermissionType,
  featureName: string,
  parentWindow?: BrowserWindow | null
): Promise<'grant' | 'ignore'> {
  const info = PERMISSION_DESCRIPTIONS[permission];
  
  const result = await dialog.showMessageBox(parentWindow ?? undefined as unknown as BrowserWindow, {
    type: 'warning',
    title: 'Permission Required',
    message: `${featureName} requires ${info.name} permission`,
    detail: `This feature is disabled because VibeFlow doesn't have ${info.name} permission.\n\n${info.reason}`,
    buttons: ['Grant Permission', 'Ignore'],
    defaultId: 0,
    cancelId: 1,
  });
  
  if (result.response === 0) {
    if (permission === 'accessibility') {
      requestAccessibilityPermission();
    } else if (permission === 'notifications') {
      openNotificationsPreferences();
    }
    return 'grant';
  }
  
  return 'ignore';
}

// ============================================================================
// Feature Availability Functions
// ============================================================================

/**
 * Check if app control features are available
 * Requirements: 9.3
 * 
 * Property 9: Permission-Based Feature Availability
 * For any app control operation (quit/hide distraction apps):
 * - If Accessibility permission is granted, operation SHALL be attempted
 * - If Accessibility permission is not granted, operation SHALL be skipped and user notified
 */
export function isAppControlAvailable(): boolean {
  return checkAccessibilityPermission(false);
}

/**
 * Get a list of features that are unavailable due to missing permissions
 */
export function getUnavailableFeatures(): string[] {
  const unavailable: string[] = [];
  
  if (!checkAccessibilityPermission(false)) {
    unavailable.push('Distraction app control (quit/hide apps)');
    unavailable.push('Running apps detection');
  }
  
  return unavailable;
}

// ============================================================================
// Export Service
// ============================================================================

export const permissionsService = {
  // Checking
  checkAccessibilityPermission,
  checkNotificationsPermission,
  checkAllPermissions,
  
  // Requesting
  requestAccessibilityPermission,
  openAccessibilityPreferences,
  openNotificationsPreferences,
  
  // Guide
  showPermissionExplanation,
  showPermissionSetupGuide,
  showPermissionMissingWarning,
  
  // Feature availability
  isAppControlAvailable,
  getUnavailableFeatures,
  
  // Constants
  PERMISSION_DESCRIPTIONS,
};

export default permissionsService;
