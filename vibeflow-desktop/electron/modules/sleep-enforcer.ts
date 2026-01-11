/**
 * Sleep Enforcer Module
 * 
 * Enforces sleep time by closing configured apps during the sleep window.
 * Handles snooze functionality and periodic re-checking.
 * Uses the unified AppMonitor for consistent app closing behavior with warnings.
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 */

import { BrowserWindow, ipcMain } from 'electron';
import type { PolicySleepEnforcementApp } from '../types';
import { getNotificationManager } from './notification-manager';
import { AppMonitor, createSleepTimeMonitor } from './app-monitor';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Sleep enforcer configuration from policy
 */
export interface SleepEnforcerConfig {
  enabled: boolean;
  startTime: string; // HH:mm format
  endTime: string;   // HH:mm format
  enforcementApps: PolicySleepEnforcementApp[];
  isCurrentlyActive: boolean;
  isSnoozed: boolean;
  snoozeEndTime?: number;
}

/**
 * Sleep enforcer state
 */
export interface SleepEnforcerState {
  isMonitoring: boolean;
  isInSleepTime: boolean;
  isSnoozed: boolean;
  snoozeEndTime: number | null;
  lastEnforcementTime: number | null;
  closedAppsCount: number;
}

/**
 * Snooze request callback type
 */
export type SnoozeRequestCallback = (durationMinutes: number) => Promise<boolean>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse time string (HH:mm) to minutes since midnight
 */
export function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Get current time as minutes since midnight
 */
export function getCurrentTimeMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Check if current time is within sleep window
 * Handles overnight windows (e.g., 23:00 - 07:00)
 * Requirements: 11.1
 */
export function isTimeInSleepWindow(
  startTime: string,
  endTime: string,
  currentTimeMinutes?: number
): boolean {
  const currentTime = currentTimeMinutes ?? getCurrentTimeMinutes();
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  
  // Handle overnight window (e.g., 23:00 - 07:00)
  if (startMinutes > endMinutes) {
    // Sleep time spans midnight
    return currentTime >= startMinutes || currentTime < endMinutes;
  }
  
  // Normal window (e.g., 22:00 - 06:00 where start < end)
  return currentTime >= startMinutes && currentTime < endMinutes;
}

// ============================================================================
// Sleep Enforcer Class
// ============================================================================

/**
 * SleepEnforcer - Manages sleep time enforcement
 * 
 * This class handles:
 * - Detecting when sleep time starts/ends
 * - Closing configured apps during sleep time
 * - Showing sleep reminder notifications
 * - Periodic re-checking (every 5 minutes) to close reopened apps
 * - Snooze functionality
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 */
export class SleepEnforcer {
  private config: SleepEnforcerConfig;
  private state: SleepEnforcerState;
  private checkInterval: NodeJS.Timeout | null = null;
  private appMonitor: AppMonitor | null = null;
  private mainWindow: BrowserWindow | null = null;
  private snoozeRequestCallback: SnoozeRequestCallback | null = null;
  
  // Check sleep time status every 5 minutes
  private readonly CHECK_INTERVAL_MS = 5 * 60 * 1000;
  // Monitor for reopened apps every 10 seconds during sleep time
  private readonly APP_MONITOR_INTERVAL_MS = 10 * 1000;
  // Warning delay before closing apps (5 seconds)
  private readonly WARNING_DELAY_MS = 5 * 1000;
  // Initial check delay after sleep time starts
  private readonly INITIAL_CHECK_DELAY_MS = 1000;
  
  constructor(config?: Partial<SleepEnforcerConfig>) {
    this.config = {
      enabled: config?.enabled ?? false,
      startTime: config?.startTime ?? '23:00',
      endTime: config?.endTime ?? '07:00',
      enforcementApps: config?.enforcementApps ?? [],
      isCurrentlyActive: config?.isCurrentlyActive ?? false,
      isSnoozed: config?.isSnoozed ?? false,
      snoozeEndTime: config?.snoozeEndTime,
    };
    
    this.state = {
      isMonitoring: false,
      isInSleepTime: false,
      isSnoozed: false,
      snoozeEndTime: null,
      lastEnforcementTime: null,
      closedAppsCount: 0,
    };
  }
  
  /**
   * Set the main window reference
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }
  
  /**
   * Set the snooze request callback (to communicate with server)
   */
  setSnoozeRequestCallback(callback: SnoozeRequestCallback): void {
    this.snoozeRequestCallback = callback;
  }
  
  /**
   * Update configuration from policy
   * Requirements: 11.1
   */
  updateConfig(config: Partial<SleepEnforcerConfig>): void {
    const wasEnabled = this.config.enabled;
    const wasInSleepTime = this.state.isInSleepTime;
    
    this.config = { ...this.config, ...config };
    
    // Update snooze state from policy
    if (config.isSnoozed !== undefined) {
      this.state.isSnoozed = config.isSnoozed;
    }
    if (config.snoozeEndTime !== undefined) {
      this.state.snoozeEndTime = config.snoozeEndTime ?? null;
    }
    
    // Check if we need to start/stop monitoring
    if (this.config.enabled && !wasEnabled) {
      this.start();
    } else if (!this.config.enabled && wasEnabled) {
      this.stop();
    }
    
    // If policy says we're in sleep time and we weren't before, enforce immediately
    if (this.config.isCurrentlyActive && !wasInSleepTime && !this.state.isSnoozed) {
      this.state.isInSleepTime = true;
      // Start app monitoring (which will handle enforcement with warnings)
      this.startAppMonitoring();
    }
    
    // If we're in sleep time but app monitoring isn't running, start it
    if (this.config.isCurrentlyActive && !this.state.isSnoozed && !this.appMonitor) {
      this.startAppMonitoring();
    }
    
    console.log('[SleepEnforcer] Config updated:', {
      enabled: this.config.enabled,
      startTime: this.config.startTime,
      endTime: this.config.endTime,
      appsCount: this.config.enforcementApps.length,
      isCurrentlyActive: this.config.isCurrentlyActive,
      isSnoozed: this.state.isSnoozed,
    });
  }
  
  /**
   * Get current configuration
   */
  getConfig(): SleepEnforcerConfig {
    return { ...this.config };
  }
  
  /**
   * Get current state
   */
  getState(): SleepEnforcerState {
    return { ...this.state };
  }
  
  /**
   * Start sleep time monitoring
   * Requirements: 11.1
   */
  start(): void {
    if (this.state.isMonitoring) {
      console.log('[SleepEnforcer] Already monitoring, skipping start');
      return;
    }

    if (!this.config.enabled) {
      console.log('[SleepEnforcer] Not starting - sleep time is disabled');
      return;
    }

    console.log('[SleepEnforcer] Starting sleep time monitoring, config:', {
      startTime: this.config.startTime,
      endTime: this.config.endTime,
      isCurrentlyActive: this.config.isCurrentlyActive,
      appsCount: this.config.enforcementApps.length,
    });
    this.state.isMonitoring = true;
    
    // Initial check
    this.checkSleepTime();
    
    // Set up periodic checks for sleep time status
    this.checkInterval = setInterval(() => {
      this.checkSleepTime();
    }, this.CHECK_INTERVAL_MS);
    
    // Start app monitoring if already in sleep time
    if (this.state.isInSleepTime && !this.state.isSnoozed) {
      this.startAppMonitoring();
    }
  }
  
  /**
   * Start app monitoring using the unified AppMonitor
   */
  private startAppMonitoring(): void {
    if (this.appMonitor?.isActive()) {
      console.log('[SleepEnforcer] App monitoring already active, skipping');
      return; // Already monitoring
    }

    console.log('[SleepEnforcer] Starting app monitoring, apps:', this.config.enforcementApps.map(a => a.name).join(', '));
    
    // Create or update the app monitor
    this.appMonitor = createSleepTimeMonitor(this.config.enforcementApps, {
      checkIntervalMs: this.APP_MONITOR_INTERVAL_MS,
      warningDelayMs: this.WARNING_DELAY_MS,
    });
    
    // Subscribe to enforcement events
    this.appMonitor.onEnforcement((result) => {
      this.state.closedAppsCount += result.closedApps.length;
      this.state.lastEnforcementTime = result.timestamp;
      
      // Notify renderer about enforcement
      this.sendToRenderer('sleep:enforced', {
        closedCount: result.closedApps.length,
        totalClosedCount: this.state.closedAppsCount,
        timestamp: result.timestamp,
        closedApps: result.closedApps,
      });
    });
    
    // Start monitoring
    this.appMonitor.start();
  }
  
  /**
   * Stop app monitoring
   */
  private stopAppMonitoring(): void {
    if (this.appMonitor) {
      console.log('[SleepEnforcer] Stopping app monitoring');
      this.appMonitor.stop();
      this.appMonitor = null;
    }
  }
  
  /**
   * Stop sleep time monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.stopAppMonitoring();
    this.state.isMonitoring = false;
    this.state.isInSleepTime = false;
    console.log('[SleepEnforcer] Stopped sleep time monitoring');
  }
  
  /**
   * Check current sleep time status and enforce if needed
   * Requirements: 11.1, 11.2
   */
  private checkSleepTime(): void {
    if (!this.config.enabled) {
      return;
    }
    
    const wasInSleepTime = this.state.isInSleepTime;
    const isNowInSleepTime = isTimeInSleepWindow(
      this.config.startTime,
      this.config.endTime
    );
    
    this.state.isInSleepTime = isNowInSleepTime;
    
    // Check if snooze has expired
    if (this.state.isSnoozed && this.state.snoozeEndTime) {
      if (Date.now() >= this.state.snoozeEndTime) {
        console.log('[SleepEnforcer] Snooze expired');
        this.state.isSnoozed = false;
        this.state.snoozeEndTime = null;
        
        // Resume app monitoring after snooze expires
        if (isNowInSleepTime) {
          this.startAppMonitoring();
        }
      }
    }
    
    // Sleep time just started
    if (isNowInSleepTime && !wasInSleepTime) {
      console.log('[SleepEnforcer] Sleep time started');
      this.onSleepTimeStart();
    }
    // Sleep time ended
    else if (!isNowInSleepTime && wasInSleepTime) {
      console.log('[SleepEnforcer] Sleep time ended');
      this.onSleepTimeEnd();
    }
    // Still in sleep time - ensure app monitoring is running
    else if (isNowInSleepTime && !this.state.isSnoozed && !this.appMonitor?.isActive()) {
      this.startAppMonitoring();
    }
  }
  
  /**
   * Handle sleep time start
   * Requirements: 11.2, 11.3
   */
  private onSleepTimeStart(): void {
    // Show notification that sleep time has started
    this.showSleepTimeNotification();
    
    // Start app monitoring (which handles enforcement with warnings)
    if (!this.state.isSnoozed) {
      setTimeout(() => {
        this.startAppMonitoring();
      }, this.INITIAL_CHECK_DELAY_MS);
    }
    
    // Notify renderer
    this.sendToRenderer('sleep:started', {
      startTime: this.config.startTime,
      endTime: this.config.endTime,
      enforcementApps: this.config.enforcementApps,
    });
  }
  
  /**
   * Handle sleep time end
   */
  private onSleepTimeEnd(): void {
    this.state.closedAppsCount = 0;
    this.state.lastEnforcementTime = null;
    
    // Clear any active snooze
    this.state.isSnoozed = false;
    this.state.snoozeEndTime = null;
    
    // Stop app monitoring
    this.stopAppMonitoring();
    
    // Notify renderer
    this.sendToRenderer('sleep:ended', {});
  }
  
  /**
   * Show sleep time notification
   * Requirements: 11.3
   */
  private showSleepTimeNotification(): void {
    const notificationManager = getNotificationManager();
    
    const appNames = this.config.enforcementApps.map(app => app.name).join('、');
    
    notificationManager.show({
      title: '🌙 睡眠时间到了',
      body: `现在是休息时间 (${this.config.startTime} - ${this.config.endTime})。以下应用将被关闭: ${appNames}`,
      type: 'warning',
      urgency: 'critical',
      silent: false,
    }, {
      onClick: () => {
        // Bring window to front when notification is clicked
        notificationManager.bringWindowToFront();
      },
    });
  }
  
  /**
   * Force enforcement now (for manual trigger or policy update)
   * This triggers the app monitor to check and enforce immediately
   */
  async forceEnforce(): Promise<void> {
    if (this.state.isInSleepTime && !this.state.isSnoozed) {
      // If app monitor is running, it will handle enforcement
      // If not, start it
      if (!this.appMonitor?.isActive()) {
        this.startAppMonitoring();
      }
    }
  }
  
  /**
   * Request snooze from server
   * Requirements: 11.5
   * @param durationMinutes - Snooze duration in minutes (default: 30)
   * @returns true if snooze was granted, false otherwise
   */
  async requestSnooze(durationMinutes: number = 30): Promise<boolean> {
    if (!this.snoozeRequestCallback) {
      console.warn('[SleepEnforcer] No snooze request callback set');
      return false;
    }
    
    try {
      const granted = await this.snoozeRequestCallback(durationMinutes);
      
      if (granted) {
        this.state.isSnoozed = true;
        this.state.snoozeEndTime = Date.now() + (durationMinutes * 60 * 1000);
        
        console.log(`[SleepEnforcer] Snooze granted for ${durationMinutes} minutes`);
        
        // Pause app monitoring during snooze
        this.appMonitor?.pause();
        
        // Notify renderer
        this.sendToRenderer('sleep:snoozed', {
          durationMinutes,
          snoozeEndTime: this.state.snoozeEndTime,
        });
        
        // Show confirmation notification
        const notificationManager = getNotificationManager();
        notificationManager.show({
          title: '⏰ 睡眠提醒已暂停',
          body: `睡眠提醒将在 ${durationMinutes} 分钟后恢复`,
          type: 'info',
          silent: true,
        });
      } else {
        console.log('[SleepEnforcer] Snooze request denied');
        
        // Show denial notification
        const notificationManager = getNotificationManager();
        notificationManager.show({
          title: '❌ 无法暂停',
          body: '今晚的暂停次数已用完',
          type: 'warning',
          silent: false,
        });
      }
      
      return granted;
    } catch (error) {
      console.error('[SleepEnforcer] Snooze request failed:', error);
      return false;
    }
  }
  
  /**
   * Cancel active snooze
   */
  cancelSnooze(): void {
    if (this.state.isSnoozed) {
      this.state.isSnoozed = false;
      this.state.snoozeEndTime = null;
      
      console.log('[SleepEnforcer] Snooze cancelled');
      
      // Resume app monitoring if in sleep time
      if (this.state.isInSleepTime) {
        if (this.appMonitor) {
          this.appMonitor.resume();
        } else {
          this.startAppMonitoring();
        }
      }
      
      // Notify renderer
      this.sendToRenderer('sleep:snoozeCancelled', {});
    }
  }
  
  /**
   * Check if currently in sleep time
   */
  isInSleepTime(): boolean {
    return this.state.isInSleepTime;
  }
  
  /**
   * Check if currently snoozed
   */
  isSnoozed(): boolean {
    return this.state.isSnoozed;
  }
  
  /**
   * Send message to renderer process
   */
  private sendToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}

// ============================================================================
// Singleton Instance and IPC Setup
// ============================================================================

let sleepEnforcerInstance: SleepEnforcer | null = null;

/**
 * Get or create the sleep enforcer singleton
 */
export function getSleepEnforcer(config?: Partial<SleepEnforcerConfig>): SleepEnforcer {
  if (!sleepEnforcerInstance) {
    sleepEnforcerInstance = new SleepEnforcer(config);
  } else if (config) {
    sleepEnforcerInstance.updateConfig(config);
  }
  return sleepEnforcerInstance;
}

/**
 * Reset the sleep enforcer singleton (for testing)
 */
export function resetSleepEnforcer(): void {
  if (sleepEnforcerInstance) {
    sleepEnforcerInstance.stop();
    sleepEnforcerInstance = null;
  }
}

/**
 * Setup IPC handlers for sleep enforcer
 */
export function setupSleepEnforcerIpc(): void {
  const enforcer = getSleepEnforcer();
  
  // Get state
  ipcMain.handle('sleep:getState', () => {
    return enforcer.getState();
  });
  
  // Get config
  ipcMain.handle('sleep:getConfig', () => {
    return enforcer.getConfig();
  });
  
  // Request snooze
  ipcMain.handle('sleep:requestSnooze', async (_, durationMinutes?: number) => {
    const success = await enforcer.requestSnooze(durationMinutes);
    return { success, state: enforcer.getState() };
  });
  
  // Cancel snooze
  ipcMain.handle('sleep:cancelSnooze', () => {
    enforcer.cancelSnooze();
    return { success: true, state: enforcer.getState() };
  });
  
  // Check if in sleep time
  ipcMain.handle('sleep:isInSleepTime', () => {
    return enforcer.isInSleepTime();
  });
  
  // Force enforcement
  ipcMain.handle('sleep:forceEnforce', async () => {
    await enforcer.forceEnforce();
    return { success: true, state: enforcer.getState() };
  });
}

// Export for use in main process
export const sleepEnforcerService = {
  getEnforcer: getSleepEnforcer,
  reset: resetSleepEnforcer,
  setupIpc: setupSleepEnforcerIpc,
  isTimeInSleepWindow,
  parseTimeToMinutes,
  getCurrentTimeMinutes,
};

export default sleepEnforcerService;
