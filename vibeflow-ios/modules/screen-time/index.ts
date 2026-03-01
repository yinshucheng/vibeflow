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

interface ScreenTimeNativeModule {
  // Phase 1 (retained)
  requestAuthorization(): Promise<string>;
  getAuthorizationStatus(): Promise<string>;
  enableBlocking(): Promise<void>;
  disableBlocking(): Promise<void>;
  isBlockingEnabled(): Promise<boolean>;
  // Phase 2 (new)
  presentActivityPicker(type: 'distraction' | 'work'): Promise<SelectionSummary>;
  getSelectionSummary(type: 'distraction' | 'work'): Promise<SelectionSummary>;
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

export async function enableBlocking(): Promise<void> {
  if (!nativeModule) {
    console.log('[ScreenTime] Mock: enableBlocking called');
    return;
  }
  return nativeModule.enableBlocking();
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
