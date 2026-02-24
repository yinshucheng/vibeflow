/**
 * Screen Time Service
 *
 * TypeScript interface for iOS Screen Time / Family Controls API.
 * Uses Expo native module when available, falls back to mock for development.
 *
 * Requirements: 6.1, 6.2, 6.3
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ScreenTimeNative from '../../modules/screen-time';
import type { BlockedApp, BlockingState, BlockingReason, AuthorizationStatus } from '@/types';

// =============================================================================
// CONSTANTS
// =============================================================================

const BLOCKING_STATE_KEY = '@vibeflow/blocking_state';

/**
 * Default apps to block during focus sessions
 */
export const DEFAULT_BLOCKED_APPS: BlockedApp[] = [
  { bundleId: 'com.tencent.xin', name: '微信' },
  { bundleId: 'com.sina.weibo', name: '微博' },
  { bundleId: 'com.ss.iphone.ugc.Aweme', name: '抖音' },
  { bundleId: 'com.xingin.discover', name: '小红书' },
  { bundleId: 'tv.danmaku.bilianime', name: 'B站' },
];

// =============================================================================
// MOCK BRIDGE (for simulator / development)
// =============================================================================

class MockScreenTimeBridge {
  private authorized: AuthorizationStatus = 'notDetermined';
  private blocking = false;

  async requestAuthorization(): Promise<AuthorizationStatus> {
    this.authorized = 'authorized';
    console.log('[MockScreenTime] Authorization requested, returning: authorized');
    return this.authorized;
  }

  async getAuthorizationStatus(): Promise<AuthorizationStatus> {
    return this.authorized;
  }

  async enableBlocking(): Promise<void> {
    if (this.authorized !== 'authorized') {
      console.warn('[MockScreenTime] Cannot enable blocking - not authorized');
      return;
    }
    this.blocking = true;
    console.log('[MockScreenTime] Blocking enabled (category-based)');
  }

  async disableBlocking(): Promise<void> {
    this.blocking = false;
    console.log('[MockScreenTime] Blocking disabled');
  }

  async isBlockingEnabled(): Promise<boolean> {
    return this.blocking;
  }
}

// =============================================================================
// BRIDGE SELECTION
// =============================================================================

const useNative = ScreenTimeNative.isNativeModuleAvailable();
const mockBridge = useNative ? null : new MockScreenTimeBridge();

if (useNative) {
  console.log('[ScreenTimeService] Using native ScreenTime module');
} else {
  console.log('[ScreenTimeService] Native module unavailable, using mock');
}

// =============================================================================
// SCREEN TIME SERVICE INTERFACE
// =============================================================================

export interface ScreenTimeService {
  initialize(): Promise<void>;
  requestAuthorization(): Promise<AuthorizationStatus>;
  getAuthorizationStatus(): Promise<AuthorizationStatus>;
  enableBlocking(apps: BlockedApp[], pomodoroId: string, reason: BlockingReason): Promise<void>;
  disableBlocking(): Promise<void>;
  isBlockingActive(): Promise<boolean>;
  getBlockingState(): Promise<BlockingState | null>;
  persistBlockingState(state: BlockingState): Promise<void>;
  loadBlockingState(): Promise<BlockingState | null>;
  clearBlockingState(): Promise<void>;
}

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

function createScreenTimeService(): ScreenTimeService {
  let currentState: BlockingState | null = null;

  async function bridgeRequestAuth(): Promise<AuthorizationStatus> {
    if (useNative) {
      return ScreenTimeNative.requestAuthorization() as Promise<AuthorizationStatus>;
    }
    return mockBridge!.requestAuthorization();
  }

  async function bridgeGetAuthStatus(): Promise<AuthorizationStatus> {
    if (useNative) {
      return ScreenTimeNative.getAuthorizationStatus() as Promise<AuthorizationStatus>;
    }
    return mockBridge!.getAuthorizationStatus();
  }

  async function bridgeEnableBlocking(): Promise<void> {
    if (useNative) {
      return ScreenTimeNative.enableBlocking();
    }
    return mockBridge!.enableBlocking();
  }

  async function bridgeDisableBlocking(): Promise<void> {
    if (useNative) {
      return ScreenTimeNative.disableBlocking();
    }
    return mockBridge!.disableBlocking();
  }

  async function bridgeIsBlockingEnabled(): Promise<boolean> {
    if (useNative) {
      return ScreenTimeNative.isBlockingEnabled();
    }
    return mockBridge!.isBlockingEnabled();
  }

  return {
    async initialize(): Promise<void> {
      const persistedState = await this.loadBlockingState();

      if (persistedState && persistedState.isActive) {
        const status = await bridgeGetAuthStatus();
        if (status === 'authorized') {
          await bridgeEnableBlocking();
          currentState = persistedState;
          console.log('[ScreenTimeService] Restored blocking state from persistence');
        } else {
          await this.clearBlockingState();
        }
      }
    },

    async requestAuthorization(): Promise<AuthorizationStatus> {
      return bridgeRequestAuth();
    },

    async getAuthorizationStatus(): Promise<AuthorizationStatus> {
      return bridgeGetAuthStatus();
    },

    async enableBlocking(apps: BlockedApp[], pomodoroId: string, reason: BlockingReason): Promise<void> {
      const status = await bridgeGetAuthStatus();

      if (status !== 'authorized') {
        console.warn('[ScreenTimeService] Cannot enable blocking - not authorized');
        return;
      }

      // Phase 1: category-based blocking via native module
      await bridgeEnableBlocking();

      currentState = {
        isActive: true,
        blockedApps: apps,
        pomodoroId,
        activatedAt: Date.now(),
        reason,
      };

      await this.persistBlockingState(currentState);
    },

    async disableBlocking(): Promise<void> {
      await bridgeDisableBlocking();

      currentState = {
        isActive: false,
        blockedApps: [],
        pomodoroId: null,
        activatedAt: null,
        reason: null,
      };

      await this.clearBlockingState();
    },

    async isBlockingActive(): Promise<boolean> {
      return bridgeIsBlockingEnabled();
    },

    async getBlockingState(): Promise<BlockingState | null> {
      return currentState;
    },

    async persistBlockingState(state: BlockingState): Promise<void> {
      try {
        await AsyncStorage.setItem(BLOCKING_STATE_KEY, JSON.stringify(state));
      } catch (error) {
        console.error('[ScreenTimeService] Failed to persist blocking state:', error);
      }
    },

    async loadBlockingState(): Promise<BlockingState | null> {
      try {
        const json = await AsyncStorage.getItem(BLOCKING_STATE_KEY);
        if (!json) return null;
        return JSON.parse(json) as BlockingState;
      } catch (error) {
        console.error('[ScreenTimeService] Failed to load blocking state:', error);
        return null;
      }
    },

    async clearBlockingState(): Promise<void> {
      try {
        await AsyncStorage.removeItem(BLOCKING_STATE_KEY);
      } catch (error) {
        console.error('[ScreenTimeService] Failed to clear blocking state:', error);
      }
    },
  };
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const screenTimeService = createScreenTimeService();

// =============================================================================
// EXPORTS
// =============================================================================

export { BLOCKING_STATE_KEY };
