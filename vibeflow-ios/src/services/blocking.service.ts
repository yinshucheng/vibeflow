/**
 * Blocking Service
 *
 * Manages app blocking state based on server-synced pomodoro status.
 * Automatically enables/disables blocking when pomodoro state changes.
 * Read-only listener - all state changes come from server.
 *
 * Requirements: 6.2, 6.3, 6.8
 */

import { useAppStore } from '@/store/app.store';
import {
  screenTimeService,
  DEFAULT_BLOCKED_APPS,
} from './screen-time.service';
import type { BlockedApp, AuthorizationStatus } from '@/types';

// =============================================================================
// BLOCKING SERVICE INTERFACE
// =============================================================================

export interface BlockingService {
  /**
   * Initialize the blocking service
   * - Request authorization if needed
   * - Restore blocking state if app was restarted during active pomodoro
   */
  initialize(): Promise<void>;

  /**
   * Start listening to pomodoro state changes
   * Automatically enables/disables blocking based on state
   */
  startListening(): () => void;

  /**
   * Get current authorization status
   */
  getAuthorizationStatus(): Promise<AuthorizationStatus>;

  /**
   * Request Screen Time authorization
   */
  requestAuthorization(): Promise<AuthorizationStatus>;

  /**
   * Check if blocking is currently active
   */
  isBlockingActive(): Promise<boolean>;

  /**
   * Get the list of apps to block
   * Uses server policy if available, otherwise defaults
   */
  getBlockedApps(): BlockedApp[];

  /**
   * Manually enable blocking (for testing/recovery)
   */
  enableBlocking(): Promise<void>;

  /**
   * Manually disable blocking (for testing/recovery)
   */
  disableBlocking(): Promise<void>;
}

// =============================================================================
// BLOCKING SERVICE IMPLEMENTATION
// =============================================================================

function createBlockingService(): BlockingService {
  let unsubscribe: (() => void) | null = null;
  let lastPomodoroId: string | null = null;

  /**
   * Get the list of apps to block from policy or defaults
   */
  function getBlockedApps(): BlockedApp[] {
    const policy = useAppStore.getState().policy;
    if (policy && policy.distractionApps.length > 0) {
      return policy.distractionApps;
    }
    return DEFAULT_BLOCKED_APPS;
  }

  /**
   * Handle pomodoro state changes
   */
  async function handlePomodoroChange(): Promise<void> {
    const { activePomodoro, isBlockingActive } = useAppStore.getState();
    const status = await screenTimeService.getAuthorizationStatus();

    // Skip if not authorized
    if (status !== 'authorized') {
      return;
    }

    if (activePomodoro && activePomodoro.status === 'active') {
      // Pomodoro is active - enable blocking if not already
      if (!isBlockingActive || lastPomodoroId !== activePomodoro.id) {
        const apps = getBlockedApps();
        await screenTimeService.enableBlocking(apps, activePomodoro.id);
        useAppStore.getState().setBlockingActive(true);
        lastPomodoroId = activePomodoro.id;
        console.log('[BlockingService] Blocking enabled for pomodoro:', activePomodoro.id);
      }
    } else {
      // No active pomodoro - disable blocking if active
      if (isBlockingActive) {
        await screenTimeService.disableBlocking();
        useAppStore.getState().setBlockingActive(false);
        lastPomodoroId = null;
        console.log('[BlockingService] Blocking disabled');
      }
    }
  }

  return {
    async initialize(): Promise<void> {
      // Initialize screen time service (restores persisted state)
      await screenTimeService.initialize();

      // Check if we need to sync blocking state with store
      const isBlocking = await screenTimeService.isBlockingActive();
      const blockingState = await screenTimeService.getBlockingState();

      if (isBlocking && blockingState) {
        useAppStore.getState().setBlockingActive(true);
        useAppStore.getState().setBlockedApps(blockingState.blockedApps);
        lastPomodoroId = blockingState.pomodoroId;
      }

      console.log('[BlockingService] Initialized, blocking active:', isBlocking);
    },

    startListening(): () => void {
      // Subscribe to store changes
      // Track previous state for comparison
      let prevPomodoro = useAppStore.getState().activePomodoro;

      unsubscribe = useAppStore.subscribe((state) => {
        const currentPomodoro = state.activePomodoro;
        
        // Only trigger if pomodoro id or status changed
        if (
          prevPomodoro?.id !== currentPomodoro?.id ||
          prevPomodoro?.status !== currentPomodoro?.status
        ) {
          prevPomodoro = currentPomodoro;
          handlePomodoroChange();
        }
      });

      // Initial check
      handlePomodoroChange();

      // Return cleanup function
      return () => {
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
      };
    },

    async getAuthorizationStatus(): Promise<AuthorizationStatus> {
      return screenTimeService.getAuthorizationStatus();
    },

    async requestAuthorization(): Promise<AuthorizationStatus> {
      const status = await screenTimeService.requestAuthorization();
      
      // Update store with authorization status
      useAppStore.getState().setScreenTimeAuthorized(status === 'authorized');
      
      return status;
    },

    async isBlockingActive(): Promise<boolean> {
      return screenTimeService.isBlockingActive();
    },

    getBlockedApps,

    async enableBlocking(): Promise<void> {
      const { activePomodoro } = useAppStore.getState();
      const pomodoroId = activePomodoro?.id ?? 'manual';
      const apps = getBlockedApps();
      
      await screenTimeService.enableBlocking(apps, pomodoroId);
      useAppStore.getState().setBlockingActive(true);
    },

    async disableBlocking(): Promise<void> {
      await screenTimeService.disableBlocking();
      useAppStore.getState().setBlockingActive(false);
    },
  };
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const blockingService = createBlockingService();
