/**
 * App Monitor Module
 * 
 * Unified service for monitoring and closing distraction apps.
 * Used by both SleepEnforcer and FocusEnforcer to provide consistent
 * behavior with warning notifications before closing apps.
 * 
 * Features:
 * - Monitors for running distraction apps at configurable intervals
 * - Shows warning notification listing apps that will be closed
 * - Waits a brief period after notification
 * - Then closes the apps
 */

import type { PolicySleepEnforcementApp, DistractionApp } from '../types';
import { getRunningApps, quitApp, hideApp, isAppRunning } from './app-controller';
import { getNotificationManager } from './notification-manager';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * App to monitor - unified type for both sleep and focus enforcement
 */
export interface MonitoredApp {
  name: string;
  bundleId: string;
  action: 'force_quit' | 'hide_window';
}

/**
 * App monitor configuration
 */
export interface AppMonitorConfig {
  /** Apps to monitor and close */
  apps: MonitoredApp[];
  /** Interval between checks in milliseconds */
  checkIntervalMs: number;
  /** Delay between warning notification and closing apps (ms) */
  warningDelayMs: number;
  /** Context for notifications (e.g., "睡眠时间" or "专注时间") */
  context: string;
  /** Emoji for notification title */
  emoji: string;
}

/**
 * Result of an enforcement action
 */
export interface EnforcementResult {
  closedApps: string[];
  failedApps: string[];
  timestamp: number;
}

/**
 * Callback for enforcement events
 */
export type EnforcementCallback = (result: EnforcementResult) => void;

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Partial<AppMonitorConfig> = {
  checkIntervalMs: 10 * 1000, // 10 seconds
  warningDelayMs: 5 * 1000,   // 5 seconds warning before closing
  context: '专注时间',
  emoji: '⚠️',
};

// ============================================================================
// App Monitor Class
// ============================================================================

/**
 * AppMonitor - Unified service for monitoring and closing distraction apps
 */
export class AppMonitor {
  private config: AppMonitorConfig;
  private monitorInterval: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;
  private isPaused: boolean = false;
  private isEnforcing: boolean = false;
  private enforcementCallbacks: Set<EnforcementCallback> = new Set();
  private lastEnforcementTime: number | null = null;
  private totalClosedCount: number = 0;

  constructor(config: Partial<AppMonitorConfig> = {}) {
    this.config = {
      apps: config.apps ?? [],
      checkIntervalMs: config.checkIntervalMs ?? DEFAULT_CONFIG.checkIntervalMs!,
      warningDelayMs: config.warningDelayMs ?? DEFAULT_CONFIG.warningDelayMs!,
      context: config.context ?? DEFAULT_CONFIG.context!,
      emoji: config.emoji ?? DEFAULT_CONFIG.emoji!,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AppMonitorConfig>): void {
    this.config = { ...this.config, ...config };
    console.log(`[AppMonitor] Config updated:`, {
      appsCount: this.config.apps.length,
      checkIntervalMs: this.config.checkIntervalMs,
      warningDelayMs: this.config.warningDelayMs,
      context: this.config.context,
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): AppMonitorConfig {
    return { ...this.config };
  }

  /**
   * Start monitoring for distraction apps
   */
  start(): void {
    if (this.isMonitoring) {
      console.log('[AppMonitor] Already monitoring');
      return;
    }

    if (this.config.apps.length === 0) {
      console.log('[AppMonitor] No apps to monitor');
      return;
    }

    console.log(`[AppMonitor] Starting monitoring (every ${this.config.checkIntervalMs / 1000}s)`);
    this.isMonitoring = true;
    this.isPaused = false;

    // Initial check
    this.checkAndEnforce();

    // Set up periodic checks
    this.monitorInterval = setInterval(() => {
      if (!this.isPaused) {
        this.checkAndEnforce();
      }
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.isMonitoring = false;
    this.isPaused = false;
    this.totalClosedCount = 0;
    console.log('[AppMonitor] Stopped monitoring');
  }

  /**
   * Pause monitoring temporarily (e.g., during snooze)
   */
  pause(): void {
    this.isPaused = true;
    console.log('[AppMonitor] Monitoring paused');
  }

  /**
   * Resume monitoring after pause
   */
  resume(): void {
    this.isPaused = false;
    console.log('[AppMonitor] Monitoring resumed');
    // Immediately check when resuming
    this.checkAndEnforce();
  }

  /**
   * Check if currently monitoring
   */
  isActive(): boolean {
    return this.isMonitoring && !this.isPaused;
  }

  /**
   * Subscribe to enforcement events
   */
  onEnforcement(callback: EnforcementCallback): () => void {
    this.enforcementCallbacks.add(callback);
    return () => this.enforcementCallbacks.delete(callback);
  }

  /**
   * Get monitoring statistics
   */
  getStats(): { totalClosedCount: number; lastEnforcementTime: number | null } {
    return {
      totalClosedCount: this.totalClosedCount,
      lastEnforcementTime: this.lastEnforcementTime,
    };
  }

  /**
   * Check for running distraction apps and enforce if found
   */
  private async checkAndEnforce(): Promise<void> {
    // Prevent concurrent enforcement
    if (this.isEnforcing) {
      return;
    }

    try {
      this.isEnforcing = true;

      // Find running distraction apps
      const runningDistractionApps = await this.findRunningDistractionApps();

      if (runningDistractionApps.length === 0) {
        return; // No distraction apps running
      }

      console.log(`[AppMonitor] Found ${runningDistractionApps.length} distraction app(s) running`);

      // Show warning notification
      await this.showWarningNotification(runningDistractionApps);

      // Wait for warning delay
      await this.delay(this.config.warningDelayMs);

      // Check again if apps are still running (user might have closed them)
      const stillRunningApps = await this.filterStillRunning(runningDistractionApps);

      if (stillRunningApps.length === 0) {
        console.log('[AppMonitor] Apps were closed by user during warning period');
        return;
      }

      // Close the apps
      const result = await this.closeApps(stillRunningApps);

      // Update stats
      this.lastEnforcementTime = result.timestamp;
      this.totalClosedCount += result.closedApps.length;

      // Notify callbacks
      this.notifyEnforcement(result);

    } catch (error) {
      console.error('[AppMonitor] Error during enforcement:', error);
    } finally {
      this.isEnforcing = false;
    }
  }

  /**
   * Find running apps that match our distraction app list
   */
  private async findRunningDistractionApps(): Promise<MonitoredApp[]> {
    const runningApps = await getRunningApps();
    const runningBundleIds = new Set(runningApps.map(app => app.bundleId));

    return this.config.apps.filter(app => runningBundleIds.has(app.bundleId));
  }

  /**
   * Filter to only apps that are still running
   */
  private async filterStillRunning(apps: MonitoredApp[]): Promise<MonitoredApp[]> {
    const stillRunning: MonitoredApp[] = [];

    for (const app of apps) {
      const running = await isAppRunning(app.bundleId);
      if (running) {
        stillRunning.push(app);
      }
    }

    return stillRunning;
  }

  /**
   * Show warning notification before closing apps
   */
  private async showWarningNotification(apps: MonitoredApp[]): Promise<void> {
    const notificationManager = getNotificationManager();
    const appNames = apps.map(app => app.name).join('、');
    const delaySeconds = Math.round(this.config.warningDelayMs / 1000);

    notificationManager.show({
      title: `${this.config.emoji} ${this.config.context}`,
      body: `以下应用将在 ${delaySeconds} 秒后关闭：${appNames}`,
      type: 'warning',
      urgency: 'critical',
      silent: false,
    });

    console.log(`[AppMonitor] Warning notification shown for: ${appNames}`);
  }

  /**
   * Close the specified apps
   */
  private async closeApps(apps: MonitoredApp[]): Promise<EnforcementResult> {
    const closedApps: string[] = [];
    const failedApps: string[] = [];

    for (const app of apps) {
      try {
        let result;
        if (app.action === 'force_quit') {
          result = await quitApp(app.bundleId);
        } else {
          result = await hideApp(app.bundleId);
        }

        if (result.success) {
          closedApps.push(app.name);
          console.log(`[AppMonitor] Closed app: ${app.name} (${app.bundleId})`);
        } else {
          failedApps.push(app.name);
          console.error(`[AppMonitor] Failed to close app: ${app.name} - ${result.error}`);
        }
      } catch (error) {
        failedApps.push(app.name);
        console.error(`[AppMonitor] Error closing app ${app.name}:`, error);
      }
    }

    return {
      closedApps,
      failedApps,
      timestamp: Date.now(),
    };
  }

  /**
   * Notify all enforcement callbacks
   */
  private notifyEnforcement(result: EnforcementResult): void {
    this.enforcementCallbacks.forEach(callback => {
      try {
        callback(result);
      } catch (error) {
        console.error('[AppMonitor] Error in enforcement callback:', error);
      }
    });
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an AppMonitor configured for sleep time enforcement
 */
export function createSleepTimeMonitor(
  apps: PolicySleepEnforcementApp[],
  options?: Partial<AppMonitorConfig>
): AppMonitor {
  const monitoredApps: MonitoredApp[] = apps.map(app => ({
    name: app.name,
    bundleId: app.bundleId,
    action: 'force_quit' as const, // Sleep time always force quits
  }));

  return new AppMonitor({
    apps: monitoredApps,
    checkIntervalMs: options?.checkIntervalMs ?? 10 * 1000,
    warningDelayMs: options?.warningDelayMs ?? 5 * 1000,
    context: '睡眠时间',
    emoji: '🌙',
    ...options,
  });
}

/**
 * Create an AppMonitor configured for focus/pomodoro enforcement
 */
export function createFocusTimeMonitor(
  apps: DistractionApp[],
  options?: Partial<AppMonitorConfig>
): AppMonitor {
  const monitoredApps: MonitoredApp[] = apps.map(app => ({
    name: app.name,
    bundleId: app.bundleId,
    action: app.action,
  }));

  return new AppMonitor({
    apps: monitoredApps,
    checkIntervalMs: options?.checkIntervalMs ?? 10 * 1000,
    warningDelayMs: options?.warningDelayMs ?? 5 * 1000,
    context: '专注时间',
    emoji: '🎯',
    ...options,
  });
}

// ============================================================================
// Export
// ============================================================================

export const appMonitorService = {
  AppMonitor,
  createSleepTimeMonitor,
  createFocusTimeMonitor,
};

export default appMonitorService;
