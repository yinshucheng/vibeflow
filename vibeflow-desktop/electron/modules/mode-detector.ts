/**
 * Mode Detector Module
 * 
 * Centralized module for detecting and managing application run modes.
 * Provides consistent mode detection across the desktop application.
 * 
 * Requirements: 2.3, 2.5, 10.1-10.8
 */

import { app } from 'electron';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Application run mode
 * Requirements: 10.1-10.8
 */
export type AppMode = 'development' | 'staging' | 'production';

/**
 * Mode detection result with metadata
 */
export interface ModeDetectionResult {
  /** The detected application mode */
  mode: AppMode;
  /** The source that determined the mode */
  source: ModeSource;
  /** Whether the app is packaged */
  isPackaged: boolean;
  /** Whether demo mode is currently active */
  isInDemoMode: boolean;
}

/**
 * Source of mode detection
 */
export type ModeSource = 
  | 'env_vibeflow_mode'
  | 'env_node_env'
  | 'cli_dev_flag'
  | 'cli_staging_flag'
  | 'app_packaged'
  | 'default';

/**
 * Mode detector configuration
 */
export interface ModeDetectorConfig {
  /** Whether demo mode is active (bypasses some restrictions) */
  isInDemoMode: boolean;
}

/**
 * Mode display information
 */
export interface ModeDisplayInfo {
  /** Display name for the mode */
  displayName: string;
  /** Short label for UI indicators */
  shortLabel: string;
  /** Description of the mode */
  description: string;
  /** Whether to show a visible indicator */
  showIndicator: boolean;
  /** Color for the indicator (CSS color) */
  indicatorColor: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Display information for each mode
 */
export const MODE_DISPLAY_INFO: Record<AppMode, ModeDisplayInfo> = {
  development: {
    displayName: 'Development Mode',
    shortLabel: 'DEV',
    description: 'Development mode - all restrictions disabled',
    showIndicator: true,
    indicatorColor: '#22c55e', // green
  },
  staging: {
    displayName: 'Staging Mode',
    shortLabel: 'STAGING',
    description: 'Staging mode - production-like with force quit option',
    showIndicator: true,
    indicatorColor: '#f59e0b', // amber
  },
  production: {
    displayName: 'Production Mode',
    shortLabel: 'PROD',
    description: 'Production mode - full enforcement enabled',
    showIndicator: false,
    indicatorColor: '#3b82f6', // blue
  },
};

/**
 * Demo mode display information
 */
export const DEMO_MODE_DISPLAY_INFO: ModeDisplayInfo = {
  displayName: 'Demo Mode',
  shortLabel: 'DEMO',
  description: 'Demo mode - all enforcement temporarily disabled',
  showIndicator: true,
  indicatorColor: '#a855f7', // purple
};

// ============================================================================
// Mode Detection Functions
// ============================================================================

/**
 * Detect the current application mode
 * 
 * Priority:
 * 1. VIBEFLOW_MODE environment variable (highest priority)
 * 2. NODE_ENV environment variable
 * 3. Command line arguments (--dev, --staging)
 * 4. app.isPackaged check
 * 5. Default to development
 * 
 * Requirements: 2.3, 2.5, 10.1-10.8
 */
export function detectAppMode(): AppMode {
  const result = detectAppModeWithSource();
  return result.mode;
}

/**
 * Detect the current application mode with source information
 * 
 * Requirements: 2.3, 2.5, 10.1-10.8
 */
export function detectAppModeWithSource(): { mode: AppMode; source: ModeSource } {
  // 1. Environment variable override (highest priority)
  // Requirements: 10.7, 10.8
  const envMode = process.env.VIBEFLOW_MODE;
  if (envMode && isValidAppMode(envMode)) {
    return { mode: envMode as AppMode, source: 'env_vibeflow_mode' };
  }
  
  // 2. NODE_ENV check
  // Requirements: 2.3
  if (process.env.NODE_ENV === 'development') {
    return { mode: 'development', source: 'env_node_env' };
  }
  
  // 3. Command line arguments
  // Requirements: 2.5
  if (process.argv.includes('--dev')) {
    return { mode: 'development', source: 'cli_dev_flag' };
  }
  if (process.argv.includes('--staging')) {
    return { mode: 'staging', source: 'cli_staging_flag' };
  }
  
  // 4. Packaged app check - packaged apps are production
  // Requirements: 10.4
  if (app.isPackaged) {
    return { mode: 'production', source: 'app_packaged' };
  }
  
  // 5. Default to development
  return { mode: 'development', source: 'default' };
}

/**
 * Validate if a string is a valid app mode
 */
export function isValidAppMode(mode: string): mode is AppMode {
  return mode === 'development' || mode === 'staging' || mode === 'production';
}

/**
 * Check if the app is in development mode
 * Requirements: 2.1
 */
export function isDevelopmentMode(): boolean {
  return detectAppMode() === 'development';
}

/**
 * Check if the app is in production mode
 * Requirements: 1.6
 */
export function isProductionMode(): boolean {
  return detectAppMode() === 'production';
}

/**
 * Check if the app is in staging mode
 * Requirements: 10.3
 */
export function isStagingMode(): boolean {
  return detectAppMode() === 'staging';
}

/**
 * Check if the app is packaged (running from .app/.dmg)
 * Requirements: 10.4
 */
export function isAppPackaged(): boolean {
  return app.isPackaged;
}

// ============================================================================
// Mode Detector Class
// ============================================================================

/**
 * ModeDetector - Centralized mode detection and management
 * 
 * This class provides:
 * - Consistent mode detection across the application
 * - Demo mode state management
 * - Mode display information for UI
 * - Event notifications for mode changes
 */
export class ModeDetector {
  private config: ModeDetectorConfig;
  private modeChangeListeners: Array<(result: ModeDetectionResult) => void> = [];
  
  constructor(config?: Partial<ModeDetectorConfig>) {
    this.config = {
      isInDemoMode: false,
      ...config,
    };
  }
  
  /**
   * Get the current mode detection result
   */
  getMode(): ModeDetectionResult {
    const { mode, source } = detectAppModeWithSource();
    return {
      mode,
      source,
      isPackaged: app.isPackaged,
      isInDemoMode: this.config.isInDemoMode,
    };
  }
  
  /**
   * Get the current app mode
   */
  getCurrentMode(): AppMode {
    return detectAppMode();
  }
  
  /**
   * Check if in development mode
   */
  isDevelopment(): boolean {
    return isDevelopmentMode();
  }
  
  /**
   * Check if in production mode
   */
  isProduction(): boolean {
    return isProductionMode();
  }
  
  /**
   * Check if in staging mode
   */
  isStaging(): boolean {
    return isStagingMode();
  }
  
  /**
   * Check if demo mode is active
   */
  isInDemoMode(): boolean {
    return this.config.isInDemoMode;
  }
  
  /**
   * Set demo mode state
   * Requirements: 6.5
   */
  setDemoMode(isActive: boolean): void {
    const wasInDemoMode = this.config.isInDemoMode;
    this.config.isInDemoMode = isActive;
    
    if (wasInDemoMode !== isActive) {
      this.notifyModeChange();
    }
  }
  
  /**
   * Get display information for the current mode
   */
  getDisplayInfo(): ModeDisplayInfo {
    // Demo mode takes precedence for display
    if (this.config.isInDemoMode) {
      return DEMO_MODE_DISPLAY_INFO;
    }
    
    const mode = detectAppMode();
    return MODE_DISPLAY_INFO[mode];
  }
  
  /**
   * Get the window title suffix based on current mode
   * Requirements: 2.4
   */
  getWindowTitleSuffix(): string {
    if (this.config.isInDemoMode) {
      return ' [DEMO MODE]';
    }
    
    const mode = detectAppMode();
    switch (mode) {
      case 'development':
        return ' [DEV MODE]';
      case 'staging':
        return ' [STAGING]';
      case 'production':
      default:
        return '';
    }
  }
  
  /**
   * Get the tray tooltip suffix based on current mode
   * Requirements: 10.5
   */
  getTrayTooltipSuffix(): string {
    if (this.config.isInDemoMode) {
      return ' (Demo Mode)';
    }
    
    const mode = detectAppMode();
    switch (mode) {
      case 'development':
        return ' (Development)';
      case 'staging':
        return ' (Staging)';
      case 'production':
      default:
        return '';
    }
  }
  
  /**
   * Check if quit is allowed without confirmation
   * Requirements: 1.6, 2.1
   */
  canQuitFreely(): boolean {
    // Development mode: always allow
    if (isDevelopmentMode()) {
      return true;
    }
    
    // Demo mode: always allow
    if (this.config.isInDemoMode) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Check if enforcement features should be active
   * Requirements: 6.9
   */
  shouldEnforce(): boolean {
    // Development mode: no enforcement
    if (isDevelopmentMode()) {
      return false;
    }
    
    // Demo mode: no enforcement
    if (this.config.isInDemoMode) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Register a listener for mode changes
   */
  onModeChange(listener: (result: ModeDetectionResult) => void): () => void {
    this.modeChangeListeners.push(listener);
    return () => {
      const index = this.modeChangeListeners.indexOf(listener);
      if (index !== -1) {
        this.modeChangeListeners.splice(index, 1);
      }
    };
  }
  
  /**
   * Notify all listeners of a mode change
   */
  private notifyModeChange(): void {
    const result = this.getMode();
    for (const listener of this.modeChangeListeners) {
      try {
        listener(result);
      } catch (error) {
        console.error('[ModeDetector] Error in mode change listener:', error);
      }
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let modeDetectorInstance: ModeDetector | null = null;

/**
 * Get or create the mode detector singleton
 */
export function getModeDetector(config?: Partial<ModeDetectorConfig>): ModeDetector {
  if (!modeDetectorInstance) {
    modeDetectorInstance = new ModeDetector(config);
  } else if (config) {
    // Update demo mode if provided
    if (config.isInDemoMode !== undefined) {
      modeDetectorInstance.setDemoMode(config.isInDemoMode);
    }
  }
  return modeDetectorInstance;
}

/**
 * Reset the mode detector singleton (for testing)
 */
export function resetModeDetector(): void {
  modeDetectorInstance = null;
}

// ============================================================================
// Export Service
// ============================================================================

export const modeDetectorService = {
  getModeDetector,
  resetModeDetector,
  detectAppMode,
  detectAppModeWithSource,
  isValidAppMode,
  isDevelopmentMode,
  isProductionMode,
  isStagingMode,
  isAppPackaged,
  MODE_DISPLAY_INFO,
  DEMO_MODE_DISPLAY_INFO,
};

export default modeDetectorService;
