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
import type { SelectionSummary, BlockingContext } from '../../modules/screen-time';
import type { BlockingState, BlockingReason, AuthorizationStatus } from '@/types';

// =============================================================================
// CONSTANTS
// =============================================================================

const BLOCKING_STATE_KEY = '@vibeflow/blocking_state';

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

  async enableBlocking(useSelection: boolean): Promise<void> {
    if (this.authorized !== 'authorized') {
      console.warn('[MockScreenTime] Cannot enable blocking - not authorized');
      return;
    }
    this.blocking = true;
    console.log(`[MockScreenTime] Blocking enabled (useSelection=${useSelection})`);
  }

  async disableBlocking(): Promise<void> {
    this.blocking = false;
    console.log('[MockScreenTime] Blocking disabled');
  }

  async isBlockingEnabled(): Promise<boolean> {
    return this.blocking;
  }

  async getSelectionSummary(_type: 'distraction' | 'work'): Promise<SelectionSummary> {
    return { appCount: 0, categoryCount: 0, hasSelection: false };
  }

  async setBlockingReason(reason: string): Promise<void> {
    console.log(`[MockScreenTime] Blocking reason set: ${reason}`);
  }

  async registerSleepSchedule(
    startHour: number, startMinute: number,
    endHour: number, endMinute: number
  ): Promise<void> {
    console.log(`[MockScreenTime] Sleep schedule registered: ${startHour}:${startMinute}-${endHour}:${endMinute}`);
  }

  async clearSleepSchedule(): Promise<void> {
    console.log('[MockScreenTime] Sleep schedule cleared');
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
  enableBlocking(reason: BlockingReason): Promise<void>;
  disableBlocking(): Promise<void>;
  isBlockingActive(): Promise<boolean>;
  getBlockingState(): Promise<BlockingState | null>;
  getSelectionSummary(type: 'distraction' | 'work'): Promise<SelectionSummary>;
  registerSleepSchedule(startTime: string, endTime: string): Promise<void>;
  clearSleepSchedule(): Promise<void>;
  persistBlockingState(state: BlockingState): Promise<void>;
  loadBlockingState(): Promise<BlockingState | null>;
  clearBlockingState(): Promise<void>;
  // Offline automation
  registerPomodoroEndSchedule(endTimeMs: number): Promise<boolean>;
  cancelPomodoroEndSchedule(): Promise<void>;
  registerTempUnblockExpirySchedule(endTimeMs: number, restoreReason: string): Promise<boolean>;
  cancelTempUnblockExpirySchedule(): Promise<void>;
  updateBlockingContext(context: BlockingContext): Promise<void>;
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function bridgeEnableBlocking(useSelection: boolean): Promise<any> {
    if (useNative) {
      return ScreenTimeNative.enableBlocking(useSelection);
    }
    return mockBridge!.enableBlocking(useSelection);
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

  async function bridgeGetSelectionSummary(type: 'distraction' | 'work'): Promise<SelectionSummary> {
    if (useNative) {
      return ScreenTimeNative.getSelectionSummary(type);
    }
    return mockBridge!.getSelectionSummary(type);
  }

  async function bridgeSetBlockingReason(reason: string): Promise<void> {
    if (useNative) {
      return ScreenTimeNative.setBlockingReason(reason);
    }
    return mockBridge!.setBlockingReason(reason);
  }

  async function bridgeRegisterSleepSchedule(
    startHour: number, startMinute: number,
    endHour: number, endMinute: number
  ): Promise<void> {
    if (useNative) {
      return ScreenTimeNative.registerSleepSchedule(startHour, startMinute, endHour, endMinute);
    }
    return mockBridge!.registerSleepSchedule(startHour, startMinute, endHour, endMinute);
  }

  async function bridgeClearSleepSchedule(): Promise<void> {
    if (useNative) {
      return ScreenTimeNative.clearSleepSchedule();
    }
    return mockBridge!.clearSleepSchedule();
  }

  /**
   * Parse "HH:mm" time string to hour/minute components
   */
  function parseTime(time: string): { hour: number; minute: number } {
    const [hourStr, minuteStr] = time.split(':');
    return {
      hour: parseInt(hourStr, 10),
      minute: parseInt(minuteStr, 10),
    };
  }

  return {
    async initialize(): Promise<void> {
      const persistedState = await this.loadBlockingState();
      console.log('[ScreenTimeService] Persisted state:', persistedState ? `active=${persistedState.isActive}, reason=${persistedState.reason}` : 'none');

      if (persistedState && persistedState.isActive) {
        const status = await bridgeGetAuthStatus();
        console.log('[ScreenTimeService] Auth status:', status);
        if (status === 'authorized') {
          const summary = await bridgeGetSelectionSummary('distraction');
          console.log('[ScreenTimeService] Selection summary:', JSON.stringify(summary));
          const nativeResult = await bridgeEnableBlocking(summary.hasSelection);
          console.log('[ScreenTimeService] enableBlocking result:', JSON.stringify(nativeResult));
          currentState = persistedState;
          console.log('[ScreenTimeService] Restored blocking state from persistence');
        } else {
          console.log('[ScreenTimeService] Not authorized, clearing blocking state');
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

    async enableBlocking(reason: BlockingReason): Promise<void> {
      const status = await bridgeGetAuthStatus();

      if (status !== 'authorized') {
        console.warn('[ScreenTimeService] Cannot enable blocking - not authorized');
        return;
      }

      // Check if user has configured distraction app selection
      const summary = await bridgeGetSelectionSummary('distraction');
      await bridgeEnableBlocking(summary.hasSelection);
      await bridgeSetBlockingReason(reason);

      currentState = {
        isActive: true,
        selectionSummary: summary,
        pomodoroId: null,
        activatedAt: Date.now(),
        reason,
      };

      await this.persistBlockingState(currentState);
    },

    async disableBlocking(): Promise<void> {
      await bridgeDisableBlocking();

      currentState = {
        isActive: false,
        selectionSummary: null,
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

    async getSelectionSummary(type: 'distraction' | 'work'): Promise<SelectionSummary> {
      return bridgeGetSelectionSummary(type);
    },

    async registerSleepSchedule(startTime: string, endTime: string): Promise<void> {
      try {
        const start = parseTime(startTime);
        const end = parseTime(endTime);
        await bridgeRegisterSleepSchedule(start.hour, start.minute, end.hour, end.minute);
        console.log(`[ScreenTimeService] Sleep schedule registered: ${startTime}-${endTime}`);
      } catch (error) {
        console.error('[ScreenTimeService] Failed to register sleep schedule:', error);
      }
    },

    async clearSleepSchedule(): Promise<void> {
      try {
        await bridgeClearSleepSchedule();
        console.log('[ScreenTimeService] Sleep schedule cleared');
      } catch (error) {
        console.error('[ScreenTimeService] Failed to clear sleep schedule:', error);
      }
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
        const parsed = JSON.parse(json);
        // Migrate old format: blockedApps → selectionSummary
        if ('blockedApps' in parsed && !('selectionSummary' in parsed)) {
          return {
            isActive: parsed.isActive,
            selectionSummary: null,
            pomodoroId: parsed.pomodoroId,
            activatedAt: parsed.activatedAt,
            reason: parsed.reason,
          };
        }
        return parsed as BlockingState;
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

    // Offline automation

    async registerPomodoroEndSchedule(endTimeMs: number): Promise<boolean> {
      const remaining = endTimeMs - Date.now();
      // D1: Use 15.5min threshold (30s margin) to avoid TOCTOU with Swift's 15min check
      if (remaining < 15.5 * 60 * 1000) {
        console.log(`[ScreenTimeService] Pomodoro end too soon (${Math.round(remaining / 1000)}s < 15.5min), skipping schedule`);
        return false;
      }
      try {
        if (useNative) {
          await ScreenTimeNative.registerPomodoroEndSchedule(endTimeMs);
        } else {
          console.log(`[ScreenTimeService] Mock: registerPomodoroEndSchedule(${endTimeMs})`);
        }
        console.log(`[ScreenTimeService] Pomodoro end schedule registered, fires in ${Math.round(remaining / 1000)}s`);
        return true;
      } catch (error) {
        console.warn('[ScreenTimeService] Failed to register pomodoro end schedule:', error);
        return false;
      }
    },

    async cancelPomodoroEndSchedule(): Promise<void> {
      try {
        if (useNative) {
          await ScreenTimeNative.cancelPomodoroEndSchedule();
        } else {
          console.log('[ScreenTimeService] Mock: cancelPomodoroEndSchedule');
        }
      } catch (error) {
        console.warn('[ScreenTimeService] Failed to cancel pomodoro end schedule:', error);
      }
    },

    async registerTempUnblockExpirySchedule(endTimeMs: number, restoreReason: string): Promise<boolean> {
      const remaining = endTimeMs - Date.now();
      // D1: Use 15.5min threshold (30s margin) to avoid TOCTOU with Swift's 15min check
      if (remaining < 15.5 * 60 * 1000) {
        console.log(`[ScreenTimeService] Temp unblock expiry too soon (${Math.round(remaining / 1000)}s < 15.5min), skipping schedule`);
        return false;
      }
      try {
        if (useNative) {
          await ScreenTimeNative.registerTempUnblockExpirySchedule(endTimeMs, restoreReason);
        } else {
          console.log(`[ScreenTimeService] Mock: registerTempUnblockExpirySchedule(${endTimeMs}, ${restoreReason})`);
        }
        console.log(`[ScreenTimeService] Temp unblock expiry schedule registered, fires in ${Math.round(remaining / 1000)}s, restore=${restoreReason}`);
        return true;
      } catch (error) {
        console.warn('[ScreenTimeService] Failed to register temp unblock expiry schedule:', error);
        return false;
      }
    },

    async cancelTempUnblockExpirySchedule(): Promise<void> {
      try {
        if (useNative) {
          await ScreenTimeNative.cancelTempUnblockExpirySchedule();
        } else {
          console.log('[ScreenTimeService] Mock: cancelTempUnblockExpirySchedule');
        }
      } catch (error) {
        console.warn('[ScreenTimeService] Failed to cancel temp unblock expiry schedule:', error);
      }
    },

    async updateBlockingContext(context: BlockingContext): Promise<void> {
      try {
        if (useNative) {
          await ScreenTimeNative.updateBlockingContext(context);
        } else {
          console.log('[ScreenTimeService] Mock: updateBlockingContext', context);
        }
      } catch (error) {
        console.warn('[ScreenTimeService] Failed to update blocking context:', error);
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
