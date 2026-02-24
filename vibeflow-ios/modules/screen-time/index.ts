/**
 * Screen Time Native Module
 *
 * Expo Modules API bridge to iOS FamilyControls + ManagedSettings.
 * Uses category-based blocking (.socialNetworking, .entertainment).
 */

import { requireNativeModule } from 'expo-modules-core';

interface ScreenTimeNativeModule {
  requestAuthorization(): Promise<string>;
  getAuthorizationStatus(): Promise<string>;
  enableBlocking(): Promise<void>;
  disableBlocking(): Promise<void>;
  isBlockingEnabled(): Promise<boolean>;
}

let nativeModule: ScreenTimeNativeModule | null = null;

try {
  nativeModule = requireNativeModule('ScreenTime') as ScreenTimeNativeModule;
} catch {
  console.warn('[ScreenTime] Native module not available — using mock');
}

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
