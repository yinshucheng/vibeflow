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
