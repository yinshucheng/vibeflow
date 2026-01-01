/**
 * Sensor Reporter Module
 * 
 * Implements sensor capabilities for the desktop client:
 * - App usage tracking (Requirements: 4.1, 4.4)
 * - Idle detection (Requirements: 4.2)
 * - Active window/app change detection (Requirements: 4.3)
 * - System events (Requirements: 4.5)
 * 
 * Reports events to the server via the connection manager.
 */

import { powerMonitor } from 'electron';
import { getConnectionManager } from './connection-manager';
import { getFrontmostApp } from './app-controller';
import type {
  DesktopActivityPayload,
  DesktopIdlePayload,
  DesktopWindowChangePayload,
  ActivityCategory,
} from '../types';

// =============================================================================
// Types
// =============================================================================

/**
 * App usage tracking state
 */
interface AppUsageState {
  bundleId: string;
  name: string;
  startTime: number;
  isActive: boolean;
}

/**
 * Sensor reporter configuration
 */
export interface SensorReporterConfig {
  /** Interval for checking active app (ms) */
  appCheckIntervalMs: number;
  /** Interval for reporting app usage (ms) */
  usageReportIntervalMs: number;
  /** Idle threshold in seconds */
  idleThresholdSeconds: number;
  /** Interval for checking idle state (ms) */
  idleCheckIntervalMs: number;
  /** User ID for events */
  userId: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: SensorReporterConfig = {
  appCheckIntervalMs: 5000,      // Check active app every 5 seconds
  usageReportIntervalMs: 60000,  // Report usage every 60 seconds
  idleThresholdSeconds: 300,     // 5 minutes idle threshold
  idleCheckIntervalMs: 10000,    // Check idle every 10 seconds
  userId: '',
};

// =============================================================================
// App Categorization
// =============================================================================

/**
 * Known productive apps (bundle IDs)
 */
const PRODUCTIVE_APPS = new Set([
  'com.apple.dt.Xcode',
  'com.microsoft.VSCode',
  'com.jetbrains.intellij',
  'com.jetbrains.WebStorm',
  'com.jetbrains.pycharm',
  'com.sublimetext.4',
  'com.sublimetext.3',
  'com.googlecode.iterm2',
  'com.apple.Terminal',
  'com.github.atom',
  'com.figma.Desktop',
  'com.sketch',
  'com.adobe.Photoshop',
  'com.adobe.illustrator',
  'com.notion.id',
  'com.linear',
  'com.asana.app',
  'com.todoist.mac.Todoist',
  'md.obsidian',
  'com.electron.logseq',
]);

/**
 * Known distracting apps (bundle IDs)
 */
const DISTRACTING_APPS = new Set([
  'com.apple.Safari',
  'com.google.Chrome',
  'org.mozilla.firefox',
  'com.tinyspeck.slackmacgap',
  'com.hnc.Discord',
  'com.facebook.archon',
  'com.twitter.twitter-mac',
  'com.spotify.client',
  'com.apple.Music',
  'com.netflix.Netflix',
  'tv.twitch.TwitchApp',
  'com.valvesoftware.steam',
  'com.epicgames.EpicGamesLauncher',
]);

/**
 * Categorize an app by its bundle ID
 * Requirements: 4.4
 */
function categorizeApp(bundleId: string): ActivityCategory {
  if (PRODUCTIVE_APPS.has(bundleId)) {
    return 'productive';
  }
  if (DISTRACTING_APPS.has(bundleId)) {
    return 'distracting';
  }
  return 'neutral';
}

// =============================================================================
// Sensor Reporter Class
// =============================================================================

/**
 * SensorReporter - Tracks and reports desktop sensor events
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */
export class SensorReporter {
  private config: SensorReporterConfig;
  private isRunning: boolean = false;
  private appCheckTimer: ReturnType<typeof setInterval> | null = null;
  private usageReportTimer: ReturnType<typeof setInterval> | null = null;
  private idleCheckTimer: ReturnType<typeof setInterval> | null = null;
  
  // App usage tracking
  private currentApp: AppUsageState | null = null;
  private appUsageMap: Map<string, number> = new Map(); // bundleId -> duration in seconds
  
  // Idle tracking
  private lastIdleState: boolean = false;
  private lastIdleSeconds: number = 0;
  private lastActivityTime: number = Date.now();

  constructor(config: Partial<SensorReporterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SensorReporterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set user ID
   */
  setUserId(userId: string): void {
    this.config.userId = userId;
  }

  /**
   * Start sensor reporting
   * Requirements: 4.1, 4.2, 4.3
   */
  start(): void {
    if (this.isRunning) {
      console.log('[SensorReporter] Already running');
      return;
    }

    console.log('[SensorReporter] Starting sensor reporting');
    this.isRunning = true;

    // Start app tracking
    this.startAppTracking();

    // Start idle detection
    this.startIdleDetection();

    // Set up system event listeners
    this.setupSystemEventListeners();
  }

  /**
   * Stop sensor reporting
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    console.log('[SensorReporter] Stopping sensor reporting');
    this.isRunning = false;

    // Stop timers
    if (this.appCheckTimer) {
      clearInterval(this.appCheckTimer);
      this.appCheckTimer = null;
    }
    if (this.usageReportTimer) {
      clearInterval(this.usageReportTimer);
      this.usageReportTimer = null;
    }
    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }

    // Report final usage before stopping
    this.reportAppUsage();

    // Clear state
    this.currentApp = null;
    this.appUsageMap.clear();
  }

  /**
   * Start app usage tracking
   * Requirements: 4.1, 4.3, 4.4
   */
  private startAppTracking(): void {
    // Initial check
    this.checkActiveApp();

    // Periodic app check
    this.appCheckTimer = setInterval(() => {
      this.checkActiveApp();
    }, this.config.appCheckIntervalMs);

    // Periodic usage report
    this.usageReportTimer = setInterval(() => {
      this.reportAppUsage();
    }, this.config.usageReportIntervalMs);
  }

  /**
   * Check and track the currently active app
   * Requirements: 4.1, 4.3
   */
  private async checkActiveApp(): Promise<void> {
    try {
      const frontApp = await getFrontmostApp();
      
      if (!frontApp) {
        return;
      }

      const now = Date.now();

      // Check if app changed
      if (this.currentApp && this.currentApp.bundleId !== frontApp.bundleId) {
        // Calculate duration for previous app
        const duration = Math.floor((now - this.currentApp.startTime) / 1000);
        
        // Update usage map
        const existingDuration = this.appUsageMap.get(this.currentApp.bundleId) || 0;
        this.appUsageMap.set(this.currentApp.bundleId, existingDuration + duration);

        // Report window change event
        this.reportWindowChange(
          this.currentApp.bundleId,
          this.currentApp.name,
          frontApp.bundleId,
          frontApp.name,
          duration
        );
      }

      // Update current app
      this.currentApp = {
        bundleId: frontApp.bundleId,
        name: frontApp.name,
        startTime: now,
        isActive: true,
      };

    } catch (error) {
      console.error('[SensorReporter] Error checking active app:', error);
    }
  }

  /**
   * Report window/app change event
   * Requirements: 4.3
   */
  private reportWindowChange(
    fromBundleId: string,
    fromName: string,
    toBundleId: string,
    toName: string,
    timeOnPrevious: number
  ): void {
    const connectionManager = getConnectionManager();
    
    const payload: DesktopWindowChangePayload = {
      fromAppBundleId: fromBundleId,
      fromAppName: fromName,
      toAppBundleId: toBundleId,
      toAppName: toName,
      timeOnPreviousApp: timeOnPrevious,
    };

    connectionManager.sendEvent({
      eventType: 'DESKTOP_WINDOW_CHANGE',
      userId: this.config.userId,
      payload,
    });

    console.log('[SensorReporter] Window change reported:', fromName, '->', toName);
  }

  /**
   * Report accumulated app usage
   * Requirements: 4.1, 4.4
   */
  private reportAppUsage(): void {
    const connectionManager = getConnectionManager();

    // Add current app's duration to the map
    if (this.currentApp) {
      const now = Date.now();
      const duration = Math.floor((now - this.currentApp.startTime) / 1000);
      const existingDuration = this.appUsageMap.get(this.currentApp.bundleId) || 0;
      this.appUsageMap.set(this.currentApp.bundleId, existingDuration + duration);
      
      // Reset start time for next period
      this.currentApp.startTime = now;
    }

    // Report each app's usage
    for (const [bundleId, duration] of this.appUsageMap.entries()) {
      if (duration > 0) {
        const payload: DesktopActivityPayload = {
          source: 'desktop_app',
          identifier: bundleId,
          title: this.getAppName(bundleId),
          duration,
          category: categorizeApp(bundleId),
          metadata: {
            appBundleId: bundleId,
            isActive: this.currentApp?.bundleId === bundleId,
          },
        };

        connectionManager.sendEvent({
          eventType: 'DESKTOP_APP_USAGE',
          userId: this.config.userId,
          payload,
        });
      }
    }

    // Clear usage map for next period
    this.appUsageMap.clear();

    console.log('[SensorReporter] App usage reported');
  }

  /**
   * Get app name from bundle ID (cached from previous checks)
   */
  private getAppName(bundleId: string): string {
    if (this.currentApp?.bundleId === bundleId) {
      return this.currentApp.name;
    }
    // Return bundle ID as fallback
    return bundleId.split('.').pop() || bundleId;
  }

  /**
   * Start idle detection
   * Requirements: 4.2
   */
  private startIdleDetection(): void {
    this.idleCheckTimer = setInterval(() => {
      this.checkIdleState();
    }, this.config.idleCheckIntervalMs);
  }

  /**
   * Check and report idle state
   * Requirements: 4.2
   */
  private checkIdleState(): void {
    const idleSeconds = powerMonitor.getSystemIdleTime();
    const isIdle = idleSeconds >= this.config.idleThresholdSeconds;

    // Report if idle state changed or if idle time significantly changed
    if (isIdle !== this.lastIdleState || 
        (isIdle && Math.abs(idleSeconds - this.lastIdleSeconds) > 60)) {
      this.reportIdleState(idleSeconds, isIdle);
    }

    // Update last activity time if not idle
    if (!isIdle) {
      this.lastActivityTime = Date.now();
    }

    this.lastIdleState = isIdle;
    this.lastIdleSeconds = idleSeconds;
  }

  /**
   * Report idle state event
   * Requirements: 4.2
   */
  private reportIdleState(idleSeconds: number, isIdle: boolean): void {
    const connectionManager = getConnectionManager();

    const payload: DesktopIdlePayload = {
      idleSeconds,
      isIdle,
      lastActivityTime: this.lastActivityTime,
    };

    connectionManager.sendEvent({
      eventType: 'DESKTOP_IDLE',
      userId: this.config.userId,
      payload,
    });

    console.log('[SensorReporter] Idle state reported:', isIdle ? 'idle' : 'active', idleSeconds, 'seconds');
  }

  /**
   * Set up system event listeners
   * Requirements: 4.5
   */
  private setupSystemEventListeners(): void {
    // System sleep
    powerMonitor.on('suspend', () => {
      console.log('[SensorReporter] System suspended');
      // Report current usage before sleep
      this.reportAppUsage();
    });

    // System wake
    powerMonitor.on('resume', () => {
      console.log('[SensorReporter] System resumed');
      // Reset tracking state
      this.lastActivityTime = Date.now();
      if (this.currentApp) {
        this.currentApp.startTime = Date.now();
      }
    });

    // Screen lock
    powerMonitor.on('lock-screen', () => {
      console.log('[SensorReporter] Screen locked');
      // Report current usage
      this.reportAppUsage();
    });

    // Screen unlock
    powerMonitor.on('unlock-screen', () => {
      console.log('[SensorReporter] Screen unlocked');
      this.lastActivityTime = Date.now();
      if (this.currentApp) {
        this.currentApp.startTime = Date.now();
      }
    });
  }

  /**
   * Record user activity (called from focus enforcer)
   */
  recordActivity(): void {
    this.lastActivityTime = Date.now();
  }

  /**
   * Get current tracking state
   */
  getState(): {
    isRunning: boolean;
    currentApp: AppUsageState | null;
    lastIdleSeconds: number;
    isIdle: boolean;
  } {
    return {
      isRunning: this.isRunning,
      currentApp: this.currentApp ? { ...this.currentApp } : null,
      lastIdleSeconds: this.lastIdleSeconds,
      isIdle: this.lastIdleState,
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let sensorReporterInstance: SensorReporter | null = null;

/**
 * Get the sensor reporter singleton
 */
export function getSensorReporter(config?: Partial<SensorReporterConfig>): SensorReporter {
  if (!sensorReporterInstance) {
    sensorReporterInstance = new SensorReporter(config);
  } else if (config) {
    sensorReporterInstance.updateConfig(config);
  }
  return sensorReporterInstance;
}

/**
 * Reset the sensor reporter singleton (for testing)
 */
export function resetSensorReporter(): void {
  if (sensorReporterInstance) {
    sensorReporterInstance.stop();
    sensorReporterInstance = null;
  }
}

export default {
  getSensorReporter,
  resetSensorReporter,
  categorizeApp,
};
