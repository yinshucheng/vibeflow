/**
 * Auto-Launch Manager Module
 * 
 * Manages auto-launch (start on login) functionality for VibeFlow desktop application.
 * Handles enabling/disabling auto-launch and checking current status.
 * 
 * Requirements: 1.6
 */

import { app } from 'electron';
import AutoLaunch from 'auto-launch';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Auto-launch configuration options
 */
export interface AutoLaunchConfig {
  name: string;
  isHidden: boolean;
  useLaunchAgent: boolean; // macOS specific
}

/**
 * Auto-launch status result
 */
export interface AutoLaunchStatus {
  isEnabled: boolean;
  isSupported: boolean;
  error?: string;
}

/**
 * Auto-launch operation result
 */
export interface AutoLaunchResult {
  success: boolean;
  isEnabled: boolean;
  error?: string;
}

// ============================================================================
// Auto-Launch Manager Class
// ============================================================================

/**
 * AutoLaunchManager - Manages auto-launch functionality
 * 
 * This class handles:
 * - Enabling/disabling auto-launch on system startup
 * - Checking current auto-launch status
 * - Platform-specific configuration (macOS Launch Agent)
 */
export class AutoLaunchManager {
  private autoLauncher: AutoLaunch | null = null;
  private config: AutoLaunchConfig;
  private initialized: boolean = false;

  constructor(config?: Partial<AutoLaunchConfig>) {
    this.config = {
      name: config?.name ?? 'VibeFlow',
      isHidden: config?.isHidden ?? true,
      useLaunchAgent: config?.useLaunchAgent ?? true,
    };
  }

  /**
   * Initialize the auto-launcher
   * Must be called after app is ready
   */
  initialize(): void {
    if (this.initialized) {
      return;
    }

    try {
      this.autoLauncher = new AutoLaunch({
        name: this.config.name,
        path: app.getPath('exe'),
        isHidden: this.config.isHidden,
        mac: {
          useLaunchAgent: this.config.useLaunchAgent,
        },
      });
      this.initialized = true;
      console.log('[AutoLaunchManager] Initialized successfully');
    } catch (error) {
      console.error('[AutoLaunchManager] Failed to initialize:', error);
    }
  }

  /**
   * Check if auto-launch is supported on this platform
   */
  isSupported(): boolean {
    // Auto-launch is supported on macOS, Windows, and Linux
    return ['darwin', 'win32', 'linux'].includes(process.platform);
  }

  /**
   * Get current auto-launch status
   */
  async getStatus(): Promise<AutoLaunchStatus> {
    if (!this.initialized || !this.autoLauncher) {
      return {
        isEnabled: false,
        isSupported: this.isSupported(),
        error: 'Auto-launch manager not initialized',
      };
    }

    try {
      const isEnabled = await this.autoLauncher.isEnabled();
      return {
        isEnabled,
        isSupported: true,
      };
    } catch (error) {
      console.error('[AutoLaunchManager] Failed to get status:', error);
      return {
        isEnabled: false,
        isSupported: true,
        error: String(error),
      };
    }
  }

  /**
   * Enable auto-launch
   * Requirements: 1.6
   */
  async enable(): Promise<AutoLaunchResult> {
    if (!this.initialized || !this.autoLauncher) {
      return {
        success: false,
        isEnabled: false,
        error: 'Auto-launch manager not initialized',
      };
    }

    try {
      // Check if already enabled
      const currentStatus = await this.autoLauncher.isEnabled();
      if (currentStatus) {
        console.log('[AutoLaunchManager] Already enabled');
        return {
          success: true,
          isEnabled: true,
        };
      }

      await this.autoLauncher.enable();
      console.log('[AutoLaunchManager] Enabled successfully');
      
      return {
        success: true,
        isEnabled: true,
      };
    } catch (error) {
      console.error('[AutoLaunchManager] Failed to enable:', error);
      return {
        success: false,
        isEnabled: false,
        error: String(error),
      };
    }
  }

  /**
   * Disable auto-launch
   */
  async disable(): Promise<AutoLaunchResult> {
    if (!this.initialized || !this.autoLauncher) {
      return {
        success: false,
        isEnabled: false,
        error: 'Auto-launch manager not initialized',
      };
    }

    try {
      // Check if already disabled
      const currentStatus = await this.autoLauncher.isEnabled();
      if (!currentStatus) {
        console.log('[AutoLaunchManager] Already disabled');
        return {
          success: true,
          isEnabled: false,
        };
      }

      await this.autoLauncher.disable();
      console.log('[AutoLaunchManager] Disabled successfully');
      
      return {
        success: true,
        isEnabled: false,
      };
    } catch (error) {
      console.error('[AutoLaunchManager] Failed to disable:', error);
      return {
        success: false,
        isEnabled: await this.isEnabled(),
        error: String(error),
      };
    }
  }

  /**
   * Toggle auto-launch state
   */
  async toggle(): Promise<AutoLaunchResult> {
    const status = await this.getStatus();
    if (status.isEnabled) {
      return this.disable();
    } else {
      return this.enable();
    }
  }

  /**
   * Check if auto-launch is currently enabled
   */
  async isEnabled(): Promise<boolean> {
    if (!this.initialized || !this.autoLauncher) {
      return false;
    }

    try {
      return await this.autoLauncher.isEnabled();
    } catch {
      return false;
    }
  }

  /**
   * Sync auto-launch state with a desired value
   * Useful for syncing with user settings
   */
  async syncWithSetting(shouldBeEnabled: boolean): Promise<AutoLaunchResult> {
    const currentStatus = await this.isEnabled();
    
    if (currentStatus === shouldBeEnabled) {
      return {
        success: true,
        isEnabled: currentStatus,
      };
    }

    if (shouldBeEnabled) {
      return this.enable();
    } else {
      return this.disable();
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let autoLaunchManagerInstance: AutoLaunchManager | null = null;

/**
 * Get or create the auto-launch manager singleton
 */
export function getAutoLaunchManager(config?: Partial<AutoLaunchConfig>): AutoLaunchManager {
  if (!autoLaunchManagerInstance) {
    autoLaunchManagerInstance = new AutoLaunchManager(config);
  }
  return autoLaunchManagerInstance;
}

/**
 * Reset the auto-launch manager singleton (for testing)
 */
export function resetAutoLaunchManager(): void {
  autoLaunchManagerInstance = null;
}

export default AutoLaunchManager;
