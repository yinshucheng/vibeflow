/**
 * Screen Time Service
 *
 * TypeScript interface for iOS Screen Time / Family Controls API.
 * This service provides the bridge between React Native and native iOS code.
 *
 * Note: The actual native implementation requires Swift code in
 * vibeflow-ios/ios/ScreenTimeBridge/ directory.
 *
 * Requirements: 6.1, 6.2, 6.3
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BlockedApp, BlockingState, AuthorizationStatus } from '@/types';

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
// SCREEN TIME BRIDGE INTERFACE
// =============================================================================

/**
 * Interface for the native Screen Time bridge module
 * This will be implemented in Swift and exposed via React Native
 */
export interface ScreenTimeBridge {
  /**
   * Request Screen Time authorization from the user
   * @returns Authorization status after request
   */
  requestAuthorization(): Promise<AuthorizationStatus>;

  /**
   * Get current authorization status
   * @returns Current authorization status
   */
  getAuthorizationStatus(): Promise<AuthorizationStatus>;

  /**
   * Enable app blocking for specified apps
   * @param apps List of apps to block
   */
  enableBlocking(apps: BlockedApp[]): Promise<void>;

  /**
   * Disable all app blocking
   */
  disableBlocking(): Promise<void>;

  /**
   * Check if blocking is currently enabled
   * @returns true if blocking is active
   */
  isBlockingEnabled(): Promise<boolean>;
}

// =============================================================================
// MOCK IMPLEMENTATION (for development/testing)
// =============================================================================

/**
 * Mock implementation of Screen Time bridge for development
 * Replace with actual native module in production
 */
class MockScreenTimeBridge implements ScreenTimeBridge {
  private authorized: AuthorizationStatus = 'notDetermined';
  private blocking = false;

  async requestAuthorization(): Promise<AuthorizationStatus> {
    // In development, simulate authorization granted
    this.authorized = 'authorized';
    console.log('[MockScreenTime] Authorization requested, returning: authorized');
    return this.authorized;
  }

  async getAuthorizationStatus(): Promise<AuthorizationStatus> {
    return this.authorized;
  }

  async enableBlocking(apps: BlockedApp[]): Promise<void> {
    if (this.authorized !== 'authorized') {
      console.warn('[MockScreenTime] Cannot enable blocking - not authorized');
      return;
    }
    this.blocking = true;
    console.log('[MockScreenTime] Blocking enabled for apps:', apps.map(a => a.name).join(', '));
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
// SCREEN TIME SERVICE
// =============================================================================

export interface ScreenTimeService {
  /**
   * Initialize the service and check authorization
   */
  initialize(): Promise<void>;

  /**
   * Request Screen Time authorization
   * @returns Authorization status
   */
  requestAuthorization(): Promise<AuthorizationStatus>;

  /**
   * Get current authorization status
   */
  getAuthorizationStatus(): Promise<AuthorizationStatus>;

  /**
   * Enable blocking for the given apps
   * @param apps Apps to block
   * @param pomodoroId Associated pomodoro ID
   */
  enableBlocking(apps: BlockedApp[], pomodoroId: string): Promise<void>;

  /**
   * Disable all blocking
   */
  disableBlocking(): Promise<void>;

  /**
   * Check if blocking is currently active
   */
  isBlockingActive(): Promise<boolean>;

  /**
   * Get the current blocking state
   */
  getBlockingState(): Promise<BlockingState | null>;

  /**
   * Persist blocking state for app restart recovery
   */
  persistBlockingState(state: BlockingState): Promise<void>;

  /**
   * Load persisted blocking state
   */
  loadBlockingState(): Promise<BlockingState | null>;

  /**
   * Clear persisted blocking state
   */
  clearBlockingState(): Promise<void>;
}

/**
 * Create the Screen Time service
 * @param bridge Native bridge implementation (or mock for development)
 */
function createScreenTimeService(bridge: ScreenTimeBridge): ScreenTimeService {
  let currentState: BlockingState | null = null;

  return {
    async initialize(): Promise<void> {
      // Load persisted state on startup
      const persistedState = await this.loadBlockingState();
      
      if (persistedState && persistedState.isActive) {
        // Restore blocking if it was active before app restart
        const status = await bridge.getAuthorizationStatus();
        if (status === 'authorized') {
          await bridge.enableBlocking(persistedState.blockedApps);
          currentState = persistedState;
          console.log('[ScreenTimeService] Restored blocking state from persistence');
        } else {
          // Clear invalid state
          await this.clearBlockingState();
        }
      }
    },

    async requestAuthorization(): Promise<AuthorizationStatus> {
      return bridge.requestAuthorization();
    },

    async getAuthorizationStatus(): Promise<AuthorizationStatus> {
      return bridge.getAuthorizationStatus();
    },

    async enableBlocking(apps: BlockedApp[], pomodoroId: string): Promise<void> {
      const status = await bridge.getAuthorizationStatus();
      
      if (status !== 'authorized') {
        console.warn('[ScreenTimeService] Cannot enable blocking - not authorized');
        return;
      }

      await bridge.enableBlocking(apps);
      
      currentState = {
        isActive: true,
        blockedApps: apps,
        pomodoroId,
        activatedAt: Date.now(),
      };

      // Persist for app restart recovery
      await this.persistBlockingState(currentState);
    },

    async disableBlocking(): Promise<void> {
      await bridge.disableBlocking();
      
      currentState = {
        isActive: false,
        blockedApps: [],
        pomodoroId: null,
        activatedAt: null,
      };

      await this.clearBlockingState();
    },

    async isBlockingActive(): Promise<boolean> {
      return bridge.isBlockingEnabled();
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

// Use mock bridge for development
// TODO: Replace with actual native module when available
const bridge = new MockScreenTimeBridge();

export const screenTimeService = createScreenTimeService(bridge);

// =============================================================================
// EXPORTS
// =============================================================================

export { BLOCKING_STATE_KEY };
