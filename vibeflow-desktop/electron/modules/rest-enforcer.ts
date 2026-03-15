/**
 * Rest Enforcer Module
 *
 * Handles enforcement during REST state:
 * - Closes or hides work apps so the user actually rests
 * - Shows "time to rest" notification
 * - Skips enforcement when system is idle (user already away)
 * - Gentler than OVER_REST: no bringToFront, longer intervals
 *
 * Follows the same pattern as OverRestEnforcer.
 */

import { BrowserWindow, powerMonitor } from 'electron';
import type { PolicyRestEnforcement } from '../types';
import { AppMonitor, createRestTimeMonitor } from './app-monitor';
import { getNotificationManager } from './notification-manager';

// ============================================================================
// Constants
// ============================================================================

/** System idle threshold in seconds - skip enforcement if user is idle longer than this */
const IDLE_THRESHOLD_SECONDS = 60;

// ============================================================================
// Types
// ============================================================================

export interface RestEnforcerConfig {
  /** Work apps to close/hide during REST */
  workApps: Array<{ bundleId: string; name: string }>;
  /** Enforcement action: 'close' or 'hide' */
  action: 'close' | 'hide';
  /** Grace info for display */
  grace: {
    available: boolean;
    remaining: number;
    durationMinutes: number;
  };
}

export interface RestEnforcerState {
  isEnforcing: boolean;
  closedAppsCount: number;
  lastEnforcementTime: number | null;
  isSystemIdle: boolean;
}

// ============================================================================
// Rest Enforcer Class
// ============================================================================

class RestEnforcer {
  private mainWindow: BrowserWindow | null = null;
  private appMonitor: AppMonitor | null = null;
  private isEnforcing: boolean = false;
  private lastEnforcementTime: number | null = null;
  private closedAppsCount: number = 0;
  private isSystemIdle: boolean = false;

  /**
   * Check if the system is currently idle
   */
  private checkSystemIdle(): boolean {
    try {
      const idleSeconds = powerMonitor.getSystemIdleTime();
      this.isSystemIdle = idleSeconds >= IDLE_THRESHOLD_SECONDS;
      return this.isSystemIdle;
    } catch (error) {
      console.error('[RestEnforcer] Error checking idle state:', error);
      return false;
    }
  }

  /**
   * Set the main window reference
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Start rest enforcement
   */
  start(config: RestEnforcerConfig): void {
    if (this.isEnforcing) {
      console.log('[RestEnforcer] Already enforcing, updating config');
      this.updateConfig(config);
      return;
    }

    console.log('[RestEnforcer] Starting enforcement:', {
      appsCount: config.workApps.length,
      action: config.action,
      graceAvailable: config.grace.available,
    });

    this.isEnforcing = true;

    // Create app monitor for closing/hiding work apps
    if (config.workApps.length > 0) {
      const appsWithAction = config.workApps.map(app => ({
        bundleId: app.bundleId,
        name: app.name,
        action: config.action,
      }));

      this.appMonitor = createRestTimeMonitor(appsWithAction, {
        shouldSkipEnforcement: () => this.checkSystemIdle(),
      });

      // Subscribe to enforcement events
      this.appMonitor.onEnforcement((result) => {
        console.log('[RestEnforcer] Apps enforced:', result.closedApps);
        this.closedAppsCount += result.closedApps.length;
        this.lastEnforcementTime = result.timestamp;

        // Notify renderer about enforcement
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('restEnforcement:appsEnforced', {
            closedApps: result.closedApps,
            failedApps: result.failedApps,
            timestamp: result.timestamp,
          });
        }
      });

      this.appMonitor.start();
    }

    // Show notification (only when user is active)
    if (!this.checkSystemIdle()) {
      this.showRestNotification();
    }
  }

  /**
   * Stop rest enforcement
   */
  stop(): void {
    if (!this.isEnforcing) {
      return;
    }

    console.log('[RestEnforcer] Stopping enforcement');

    this.isEnforcing = false;

    // Stop app monitor
    if (this.appMonitor) {
      this.appMonitor.stop();
      this.appMonitor = null;
    }

    // Reset stats
    this.closedAppsCount = 0;
    this.lastEnforcementTime = null;
  }

  /**
   * Update enforcement configuration
   */
  updateConfig(config: RestEnforcerConfig): void {
    if (this.appMonitor && config.workApps.length > 0) {
      const action = config.action === 'hide' ? 'hide_window' as const : 'force_quit' as const;
      this.appMonitor.updateConfig({
        apps: config.workApps.map(app => ({
          bundleId: app.bundleId,
          name: app.name,
          action,
        })),
      });
    }
  }

  /**
   * Get current state
   */
  getState(): RestEnforcerState {
    return {
      isEnforcing: this.isEnforcing,
      closedAppsCount: this.closedAppsCount,
      lastEnforcementTime: this.lastEnforcementTime,
      isSystemIdle: this.isSystemIdle,
    };
  }

  /**
   * Check if currently enforcing
   */
  isActive(): boolean {
    return this.isEnforcing;
  }

  /**
   * Show rest time notification
   */
  private showRestNotification(): void {
    const notificationManager = getNotificationManager();

    notificationManager.show({
      title: '😴 休息时间',
      body: '该休息了！工作应用将被关闭，让自己放松一下。',
      type: 'info',
      urgency: 'normal',
      silent: false,
    });
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let restEnforcerInstance: RestEnforcer | null = null;

export function getRestEnforcer(): RestEnforcer {
  if (!restEnforcerInstance) {
    restEnforcerInstance = new RestEnforcer();
  }
  return restEnforcerInstance;
}

// ============================================================================
// Helper function to handle policy updates
// ============================================================================

export function handleRestEnforcementPolicyUpdate(
  restEnforcement: PolicyRestEnforcement | undefined
): void {
  const enforcer = getRestEnforcer();

  if (restEnforcement?.isActive) {
    // Determine action from policy actions array
    const action: 'close' | 'hide' = restEnforcement.actions.includes('hide') ? 'hide' : 'close';

    enforcer.start({
      workApps: restEnforcement.workApps,
      action,
      grace: restEnforcement.grace,
    });
  } else {
    // Stop enforcement if no longer active
    if (enforcer.isActive()) {
      enforcer.stop();
    }
  }
}

export default RestEnforcer;
