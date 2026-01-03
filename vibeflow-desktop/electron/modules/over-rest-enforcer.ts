/**
 * Over Rest Enforcer Module
 * 
 * Handles enforcement during over rest state:
 * - Closes distraction apps (Arc, WeChat, etc.)
 * - Brings VibeFlow window to front
 * - Shows persistent notification reminding user to start pomodoro
 * - Only enforces when user is actively using the computer (not idle)
 * 
 * Requirements: 15.2, 15.3, 16.1-16.5
 */

import { BrowserWindow, powerMonitor } from 'electron';
import type { PolicyOverRest, PolicySleepEnforcementApp } from '../types';
import { AppMonitor, createFocusTimeMonitor } from './app-monitor';
import { getNotificationManager } from './notification-manager';

// ============================================================================
// Constants
// ============================================================================

/** System idle threshold in seconds - skip enforcement if user is idle longer than this */
const IDLE_THRESHOLD_SECONDS = 60;

// ============================================================================
// Types
// ============================================================================

export interface OverRestEnforcerConfig {
  /** Apps to close during over rest */
  enforcementApps: PolicySleepEnforcementApp[];
  /** Minutes over rest */
  overRestMinutes: number;
  /** Whether to bring window to front */
  bringToFront: boolean;
}

export interface OverRestEnforcerState {
  isEnforcing: boolean;
  overRestMinutes: number;
  lastEnforcementTime: number | null;
  closedAppsCount: number;
  isSystemIdle: boolean;
}

// ============================================================================
// Over Rest Enforcer Class
// ============================================================================

class OverRestEnforcer {
  private mainWindow: BrowserWindow | null = null;
  private appMonitor: AppMonitor | null = null;
  private isEnforcing: boolean = false;
  private overRestMinutes: number = 0;
  private lastEnforcementTime: number | null = null;
  private closedAppsCount: number = 0;
  private bringToFrontInterval: NodeJS.Timeout | null = null;
  private isSystemIdle: boolean = false;

  /**
   * Check if the system is currently idle
   * Returns true if user has been inactive for more than IDLE_THRESHOLD_SECONDS
   */
  private checkSystemIdle(): boolean {
    try {
      const idleSeconds = powerMonitor.getSystemIdleTime();
      this.isSystemIdle = idleSeconds >= IDLE_THRESHOLD_SECONDS;
      return this.isSystemIdle;
    } catch (error) {
      console.error('[OverRestEnforcer] Error checking idle state:', error);
      return false; // Assume not idle on error
    }
  }

  /**
   * Set the main window reference
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Start over rest enforcement
   */
  start(config: OverRestEnforcerConfig): void {
    if (this.isEnforcing) {
      console.log('[OverRestEnforcer] Already enforcing, updating config');
      this.updateConfig(config);
      return;
    }

    console.log('[OverRestEnforcer] Starting enforcement:', {
      overRestMinutes: config.overRestMinutes,
      appsCount: config.enforcementApps.length,
      bringToFront: config.bringToFront,
    });

    this.isEnforcing = true;
    this.overRestMinutes = config.overRestMinutes;

    // Create app monitor for closing distraction apps
    if (config.enforcementApps.length > 0) {
      const distractionApps = config.enforcementApps.map(app => ({
        bundleId: app.bundleId,
        name: app.name,
        action: 'force_quit' as const,
        isPreset: false,
      }));

      this.appMonitor = createFocusTimeMonitor(distractionApps, {
        checkIntervalMs: 10 * 1000, // Check every 10 seconds
        warningDelayMs: 5 * 1000,   // 5 second warning
        context: '超时休息',
        emoji: '⚠️',
        shouldSkipEnforcement: () => this.checkSystemIdle(), // Skip when system is idle
      });

      // Subscribe to enforcement events
      this.appMonitor.onEnforcement((result) => {
        console.log('[OverRestEnforcer] Apps closed:', result.closedApps);
        this.closedAppsCount += result.closedApps.length;
        this.lastEnforcementTime = result.timestamp;

        // Notify renderer about enforcement
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('overRest:appsEnforced', {
            closedApps: result.closedApps,
            failedApps: result.failedApps,
            timestamp: result.timestamp,
          });
        }
      });

      this.appMonitor.start();
    }

    // Bring window to front and keep it there (only when user is active)
    if (config.bringToFront) {
      // Only bring to front if user is not idle
      if (!this.checkSystemIdle()) {
        this.bringWindowToFront();
      }
      
      // Keep bringing to front every 30 seconds (only when user is active)
      this.bringToFrontInterval = setInterval(() => {
        if (!this.checkSystemIdle()) {
          this.bringWindowToFront();
        } else {
          console.log('[OverRestEnforcer] System idle, skipping bring to front');
        }
      }, 30 * 1000);
    }

    // Show initial notification (only when user is active)
    if (!this.checkSystemIdle()) {
      this.showOverRestNotification();
    }
  }

  /**
   * Stop over rest enforcement
   */
  stop(): void {
    if (!this.isEnforcing) {
      return;
    }

    console.log('[OverRestEnforcer] Stopping enforcement');

    this.isEnforcing = false;
    this.overRestMinutes = 0;

    // Stop app monitor
    if (this.appMonitor) {
      this.appMonitor.stop();
      this.appMonitor = null;
    }

    // Stop bring to front interval
    if (this.bringToFrontInterval) {
      clearInterval(this.bringToFrontInterval);
      this.bringToFrontInterval = null;
    }

    // Reset stats
    this.closedAppsCount = 0;
    this.lastEnforcementTime = null;
  }

  /**
   * Update enforcement configuration
   */
  updateConfig(config: OverRestEnforcerConfig): void {
    this.overRestMinutes = config.overRestMinutes;

    // Update app monitor if it exists
    if (this.appMonitor && config.enforcementApps.length > 0) {
      this.appMonitor.updateConfig({
        apps: config.enforcementApps.map(app => ({
          bundleId: app.bundleId,
          name: app.name,
          action: 'force_quit' as const,
        })),
      });
    }
  }

  /**
   * Get current state
   */
  getState(): OverRestEnforcerState {
    return {
      isEnforcing: this.isEnforcing,
      overRestMinutes: this.overRestMinutes,
      lastEnforcementTime: this.lastEnforcementTime,
      closedAppsCount: this.closedAppsCount,
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
   * Bring main window to front
   */
  private bringWindowToFront(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return;
    }

    // Show window if hidden
    if (!this.mainWindow.isVisible()) {
      this.mainWindow.show();
    }

    // Restore if minimized
    if (this.mainWindow.isMinimized()) {
      this.mainWindow.restore();
    }

    // Focus the window
    this.mainWindow.focus();

    // On macOS, also show dock icon
    if (process.platform === 'darwin') {
      const { app } = require('electron');
      app.dock?.show();
    }

    console.log('[OverRestEnforcer] Brought window to front');
  }

  /**
   * Show over rest notification
   */
  private showOverRestNotification(): void {
    const notificationManager = getNotificationManager();
    
    notificationManager.show({
      title: '⚠️ 超时休息',
      body: `您已经休息超过 ${this.overRestMinutes} 分钟了，是时候开始工作了！`,
      type: 'warning',
      urgency: 'critical',
      silent: false,
    });
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let overRestEnforcerInstance: OverRestEnforcer | null = null;

export function getOverRestEnforcer(): OverRestEnforcer {
  if (!overRestEnforcerInstance) {
    overRestEnforcerInstance = new OverRestEnforcer();
  }
  return overRestEnforcerInstance;
}

// ============================================================================
// Helper function to handle policy updates
// ============================================================================

export function handleOverRestPolicyUpdate(policy: PolicyOverRest | undefined): void {
  const enforcer = getOverRestEnforcer();

  if (policy?.isOverRest) {
    // Start or update enforcement
    enforcer.start({
      enforcementApps: policy.enforcementApps,
      overRestMinutes: policy.overRestMinutes,
      bringToFront: policy.bringToFront,
    });
  } else {
    // Stop enforcement if no longer over rest
    if (enforcer.isActive()) {
      enforcer.stop();
    }
  }
}

export default OverRestEnforcer;
