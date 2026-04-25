/**
 * Screen Time Native Module
 *
 * Expo Modules API bridge to iOS FamilyControls + ManagedSettings.
 * Phase 1: category-based blocking (.all()).
 * Phase 2: FamilyActivityPicker token-based fine-grained blocking.
 */

import { requireNativeModule } from 'expo-modules-core';

export interface SelectionSummary {
  appCount: number;
  categoryCount: number;
  hasSelection: boolean;
}

export interface TestScheduleResult {
  success: boolean;
  endTime: number; // Unix timestamp ms
  durationSeconds: number;
}

interface ScreenTimeNativeModule {
  // Phase 1 (retained)
  requestAuthorization(): Promise<string>;
  getAuthorizationStatus(): Promise<string>;
  enableBlocking(useSelection: boolean): Promise<void>;
  disableBlocking(): Promise<void>;
  isBlockingEnabled(): Promise<boolean>;
  // Phase 2 (new)
  presentActivityPicker(type: 'distraction' | 'work'): Promise<SelectionSummary>;
  getSelectionSummary(type: 'distraction' | 'work'): Promise<SelectionSummary>;
  setBlockingReason(reason: string): Promise<void>;
  registerSleepSchedule(
    startHour: number, startMinute: number,
    endHour: number, endMinute: number
  ): Promise<void>;
  clearSleepSchedule(): Promise<void>;
  // Test/Debug: one-shot schedule at exact time
  registerTestSchedule(durationSeconds: number): Promise<TestScheduleResult>;
  cancelTestSchedule(): Promise<void>;
  getActiveSchedules(): Promise<string[]>;
  getExtensionLogs(): Promise<string[]>;
  clearExtensionLogs(): Promise<void>;
  forceDisableBlocking(): Promise<void>;
  // Offline automation
  registerPomodoroEndSchedule(endTimeMs: number): Promise<void>;
  cancelPomodoroEndSchedule(): Promise<void>;
  registerTempUnblockExpirySchedule(endTimeMs: number, restoreReason: string): Promise<void>;
  cancelTempUnblockExpirySchedule(): Promise<void>;
  updateBlockingContext(contextJson: string): Promise<void>;
}

let nativeModule: ScreenTimeNativeModule | null = null;

try {
  nativeModule = requireNativeModule('ScreenTime') as ScreenTimeNativeModule;
} catch {
  console.warn('[ScreenTime] Native module not available — using mock');
}

const EMPTY_SUMMARY: SelectionSummary = { appCount: 0, categoryCount: 0, hasSelection: false };

export function isNativeModuleAvailable(): boolean {
  return nativeModule !== null;
}

export async function requestAuthorization(): Promise<string> {
  if (!nativeModule) return 'notDetermined';
  return nativeModule.requestAuthorization();
}

export async function getAuthorizationStatus(): Promise<string> {
  if (!nativeModule) return 'notDetermined';
  return nativeModule.getAuthorizationStatus();
}

export async function enableBlocking(useSelection: boolean): Promise<void> {
  if (!nativeModule) {
    console.log(`[ScreenTime] Mock: enableBlocking(useSelection=${useSelection}) called`);
    return;
  }
  return nativeModule.enableBlocking(useSelection);
}

export async function disableBlocking(): Promise<void> {
  if (!nativeModule) {
    console.log('[ScreenTime] Mock: disableBlocking called');
    return;
  }
  return nativeModule.disableBlocking();
}

export async function isBlockingEnabled(): Promise<boolean> {
  if (!nativeModule) return false;
  return nativeModule.isBlockingEnabled();
}

export async function presentActivityPicker(type: 'distraction' | 'work'): Promise<SelectionSummary> {
  if (!nativeModule) {
    console.log(`[ScreenTime] Mock: presentActivityPicker(${type}) called`);
    return EMPTY_SUMMARY;
  }
  return nativeModule.presentActivityPicker(type);
}

export async function getSelectionSummary(type: 'distraction' | 'work'): Promise<SelectionSummary> {
  if (!nativeModule) {
    return EMPTY_SUMMARY;
  }
  return nativeModule.getSelectionSummary(type);
}

export async function setBlockingReason(reason: string): Promise<void> {
  if (!nativeModule) {
    console.log(`[ScreenTime] Mock: setBlockingReason(${reason}) called`);
    return;
  }
  return nativeModule.setBlockingReason(reason);
}

export async function registerSleepSchedule(
  startHour: number, startMinute: number,
  endHour: number, endMinute: number
): Promise<void> {
  if (!nativeModule) {
    console.log(`[ScreenTime] Mock: registerSleepSchedule(${startHour}:${startMinute}-${endHour}:${endMinute}) called`);
    return;
  }
  return nativeModule.registerSleepSchedule(startHour, startMinute, endHour, endMinute);
}

export async function clearSleepSchedule(): Promise<void> {
  if (!nativeModule) {
    console.log('[ScreenTime] Mock: clearSleepSchedule called');
    return;
  }
  return nativeModule.clearSleepSchedule();
}

// =============================================================================
// TEST/DEBUG: One-shot Schedule (for verifying DeviceActivityMonitor callbacks)
// =============================================================================

/**
 * Register a test schedule that triggers after the specified duration.
 * Used to verify that DeviceActivityMonitor extension callbacks work correctly.
 *
 * - intervalDidStart: called immediately, enables blocking
 * - intervalDidEnd: called after durationSeconds, disables blocking
 *
 * @param durationSeconds - Number of seconds until the schedule ends
 * @returns Info about the registered schedule
 */
export async function registerTestSchedule(durationSeconds: number): Promise<TestScheduleResult> {
  if (!nativeModule) {
    console.log(`[ScreenTime] Mock: registerTestSchedule(${durationSeconds}s) called`);
    return {
      success: true,
      endTime: Date.now() + durationSeconds * 1000,
      durationSeconds,
    };
  }
  return nativeModule.registerTestSchedule(durationSeconds);
}

/**
 * Cancel a previously registered test schedule.
 */
export async function cancelTestSchedule(): Promise<void> {
  if (!nativeModule) {
    console.log('[ScreenTime] Mock: cancelTestSchedule called');
    return;
  }
  return nativeModule.cancelTestSchedule();
}

/**
 * Get list of currently active DeviceActivity schedules (for debugging).
 * Returns an array of activity names (e.g., ["sleepSchedule", "testSchedule"]).
 */
export async function getActiveSchedules(): Promise<string[]> {
  if (!nativeModule) {
    return [];
  }
  return nativeModule.getActiveSchedules();
}

/**
 * Get extension logs from App Group (for debugging).
 * Shows when intervalDidStart/intervalDidEnd were called.
 */
export async function getExtensionLogs(): Promise<string[]> {
  if (!nativeModule) {
    return [];
  }
  return nativeModule.getExtensionLogs();
}

/**
 * Clear extension logs.
 */
export async function clearExtensionLogs(): Promise<void> {
  if (!nativeModule) {
    return;
  }
  return nativeModule.clearExtensionLogs();
}

/**
 * Force disable all blocking (for testing/recovery).
 */
export async function forceDisableBlocking(): Promise<void> {
  if (!nativeModule) {
    return;
  }
  return nativeModule.forceDisableBlocking();
}

// =============================================================================
// OFFLINE AUTOMATION: Pomodoro End Schedule
// =============================================================================

/**
 * Register a one-shot schedule that fires when the pomodoro is expected to end.
 * The Extension reads BlockingContext to decide whether to disable or switch blocking.
 *
 * @param endTimeMs - Unix timestamp (ms) when the pomodoro ends
 * @throws INTERVAL_TOO_SHORT if remaining time < 15 minutes
 */
export async function registerPomodoroEndSchedule(endTimeMs: number): Promise<void> {
  if (!nativeModule) {
    console.log(`[ScreenTime] Mock: registerPomodoroEndSchedule(${endTimeMs}) called`);
    return;
  }
  return nativeModule.registerPomodoroEndSchedule(endTimeMs);
}

/**
 * Cancel a previously registered pomodoro end schedule.
 */
export async function cancelPomodoroEndSchedule(): Promise<void> {
  if (!nativeModule) {
    console.log('[ScreenTime] Mock: cancelPomodoroEndSchedule called');
    return;
  }
  return nativeModule.cancelPomodoroEndSchedule();
}

// =============================================================================
// OFFLINE AUTOMATION: Temp Unblock Expiry Schedule
// =============================================================================

/**
 * Register a one-shot schedule that fires when the temporary unblock expires.
 * The Extension will restore blocking with the specified reason.
 *
 * @param endTimeMs - Unix timestamp (ms) when the unblock expires
 * @param restoreReason - The blocking reason to restore (e.g., "focus", "sleep")
 * @throws INTERVAL_TOO_SHORT if remaining time < 15 minutes
 */
export async function registerTempUnblockExpirySchedule(
  endTimeMs: number,
  restoreReason: string
): Promise<void> {
  if (!nativeModule) {
    console.log(`[ScreenTime] Mock: registerTempUnblockExpirySchedule(${endTimeMs}, ${restoreReason}) called`);
    return;
  }
  return nativeModule.registerTempUnblockExpirySchedule(endTimeMs, restoreReason);
}

/**
 * Cancel a previously registered temp unblock expiry schedule.
 */
export async function cancelTempUnblockExpirySchedule(): Promise<void> {
  if (!nativeModule) {
    console.log('[ScreenTime] Mock: cancelTempUnblockExpirySchedule called');
    return;
  }
  return nativeModule.cancelTempUnblockExpirySchedule();
}

// =============================================================================
// OFFLINE AUTOMATION: Blocking Context
// =============================================================================

export interface BlockingContext {
  currentBlockingReason: string | null;
  sleepScheduleActive: boolean;
  sleepStartHour: number | null;
  sleepStartMinute: number | null;
  sleepEndHour: number | null;
  sleepEndMinute: number | null;
  overRestActive: boolean;
}

/**
 * Update the shared BlockingContext in App Group for the Extension to read.
 * Call this whenever blocking state is re-evaluated.
 */
export async function updateBlockingContext(context: BlockingContext): Promise<void> {
  if (!nativeModule) {
    console.log('[ScreenTime] Mock: updateBlockingContext called', context);
    return;
  }
  return nativeModule.updateBlockingContext(JSON.stringify(context));
}
