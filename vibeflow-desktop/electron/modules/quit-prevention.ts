/**
 * Quit Prevention Module
 * 
 * Prevents accidental or intentional quit attempts during work hours in production mode.
 * Implements mode detection logic and work hours checking for quit behavior.
 * 
 * Requirements: 1.6, 2.1, 4.6, 4.7
 */

import { app, dialog, BrowserWindow, ipcMain } from 'electron';
import type { WorkTimeSlot } from '../types';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Application run mode
 * Requirements: 10.1-10.8
 */
export type AppMode = 'development' | 'staging' | 'production';

/**
 * Quit prevention configuration
 */
export interface QuitPreventionConfig {
  /** Whether quit prevention is enabled */
  enabled: boolean;
  /** Whether to require confirmation during work hours */
  requireConfirmationInWorkHours: boolean;
  /** Whether to consume skip token on confirmed quit */
  consumeSkipTokenOnQuit: boolean;
  /** Work time slots for determining work hours */
  workTimeSlots: WorkTimeSlot[];
  /** Whether user is in demo mode (bypasses quit prevention) */
  isInDemoMode: boolean;
  /** Whether there's an active pomodoro session */
  hasActivePomodoro: boolean;
}

/**
 * Quit attempt record
 */
export interface QuitAttempt {
  timestamp: Date;
  wasBlocked: boolean;
  reason: 'work_hours' | 'active_pomodoro' | 'user_confirmed' | 'allowed';
  skipTokenConsumed: boolean;
  mode: AppMode;
}

/**
 * Can quit result
 */
export interface CanQuitResult {
  allowed: boolean;
  reason?: string;
  requiresConfirmation?: boolean;
  canConsumeSkipToken?: boolean;
}

/**
 * Quit confirmation result
 */
export interface QuitConfirmationResult {
  confirmed: boolean;
  consumeSkipToken: boolean;
}

/**
 * Skip token consumer callback type
 */
export type SkipTokenConsumer = () => Promise<{ success: boolean; remaining: number }>;

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_QUIT_PREVENTION_CONFIG: QuitPreventionConfig = {
  enabled: true,
  requireConfirmationInWorkHours: true,
  consumeSkipTokenOnQuit: true,
  workTimeSlots: [],
  isInDemoMode: false,
  hasActivePomodoro: false,
};

// ============================================================================
// Mode Detection Logic
// ============================================================================

/**
 * Detect the current application mode
 * 
 * Priority:
 * 1. VIBEFLOW_MODE environment variable
 * 2. NODE_ENV environment variable
 * 3. Command line arguments (--dev, --staging)
 * 4. app.isPackaged check
 * 5. Default to development
 * 
 * Requirements: 2.3, 2.5, 10.1-10.8
 */
export function detectAppMode(): AppMode {
  // 1. Environment variable override (highest priority)
  const envMode = process.env.VIBEFLOW_MODE;
  if (envMode && isValidAppMode(envMode)) {
    return envMode as AppMode;
  }
  
  // 2. NODE_ENV check
  if (process.env.NODE_ENV === 'development') {
    return 'development';
  }
  
  // 3. Command line arguments
  if (process.argv.includes('--dev')) {
    return 'development';
  }
  if (process.argv.includes('--staging')) {
    return 'staging';
  }
  
  // 4. Packaged app check - packaged apps are production
  if (app.isPackaged) {
    return 'production';
  }
  
  // 5. Default to development
  return 'development';
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

// ============================================================================
// Work Hours Detection
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
 * Check if current time is within any enabled work time slot
 * Requirements: 1.6
 */
export function isWithinWorkHours(
  slots: WorkTimeSlot[],
  currentTimeMinutes?: number
): boolean {
  const currentTime = currentTimeMinutes ?? getCurrentTimeMinutes();
  
  return slots.some((slot) => {
    if (!slot.enabled) return false;
    
    const startMinutes = parseTimeToMinutes(slot.startTime);
    const endMinutes = parseTimeToMinutes(slot.endTime);
    
    // Handle normal case (start < end)
    return currentTime >= startMinutes && currentTime < endMinutes;
  });
}

// ============================================================================
// Quit Prevention Class
// ============================================================================

/**
 * QuitPrevention - Manages quit prevention logic for the desktop app
 * 
 * Property 1: Mode-Based Quit Behavior
 * For any quit attempt:
 * - If in development mode, quit SHALL be allowed regardless of work hours or pomodoro state
 * - If in production mode AND within work hours, quit SHALL be blocked unless explicitly confirmed
 * 
 * Requirements: 1.6, 2.1
 */
export class QuitPrevention {
  private config: QuitPreventionConfig;
  private quitAttempts: QuitAttempt[] = [];
  private mainWindow: BrowserWindow | null = null;
  private skipTokenConsumer: SkipTokenConsumer | null = null;
  private isQuitting: boolean = false;
  
  constructor(config?: Partial<QuitPreventionConfig>) {
    this.config = { ...DEFAULT_QUIT_PREVENTION_CONFIG, ...config };
  }
  
  /**
   * Set the main window reference
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }
  
  /**
   * Set the skip token consumer callback
   */
  setSkipTokenConsumer(consumer: SkipTokenConsumer): void {
    this.skipTokenConsumer = consumer;
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<QuitPreventionConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * Get current configuration
   */
  getConfig(): QuitPreventionConfig {
    return { ...this.config };
  }
  
  /**
   * Get quit attempt history
   */
  getQuitAttempts(): QuitAttempt[] {
    return [...this.quitAttempts];
  }
  
  /**
   * Clear quit attempt history
   */
  clearQuitAttempts(): void {
    this.quitAttempts = [];
  }
  
  /**
   * Check if quit is allowed
   * 
   * Property 1: Mode-Based Quit Behavior
   * - Development mode: always allowed
   * - Production mode + work hours: requires confirmation
   * - Production mode + outside work hours: allowed
   * - Demo mode: always allowed
   * - Staging mode: allowed with keyboard shortcut (Cmd+Shift+Q)
   * 
   * Requirements: 1.6, 2.1
   */
  canQuit(): CanQuitResult {
    const mode = detectAppMode();
    
    // Development mode: always allow quit
    // Requirements: 2.1
    if (mode === 'development') {
      return { allowed: true, reason: 'development_mode' };
    }
    
    // Demo mode: always allow quit
    // Requirements: 6.9
    if (this.config.isInDemoMode) {
      return { allowed: true, reason: 'demo_mode' };
    }
    
    // Quit prevention disabled: allow quit
    if (!this.config.enabled) {
      return { allowed: true, reason: 'quit_prevention_disabled' };
    }
    
    // Check if within work hours
    const withinWorkHours = isWithinWorkHours(this.config.workTimeSlots);
    
    // Outside work hours: allow quit
    if (!withinWorkHours) {
      return { allowed: true, reason: 'outside_work_hours' };
    }
    
    // Production mode + work hours: requires confirmation
    // Requirements: 1.6, 4.6
    if (mode === 'production') {
      return {
        allowed: false,
        reason: 'Quit is blocked during work hours. Use the confirmation dialog to quit.',
        requiresConfirmation: true,
        canConsumeSkipToken: this.config.consumeSkipTokenOnQuit,
      };
    }
    
    // Staging mode + work hours: allow with warning
    // Requirements: 10.6
    if (mode === 'staging') {
      return {
        allowed: false,
        reason: 'Staging mode: Use Cmd+Shift+Q to force quit during work hours.',
        requiresConfirmation: true,
        canConsumeSkipToken: false,
      };
    }
    
    // Default: allow
    return { allowed: true };
  }
  
  /**
   * Show quit confirmation dialog
   * 
   * Requirements: 4.6, 4.7
   */
  async showQuitConfirmation(): Promise<QuitConfirmationResult> {
    if (!this.mainWindow) {
      return { confirmed: false, consumeSkipToken: false };
    }
    
    const canQuitResult = this.canQuit();
    
    // If quit is allowed, no confirmation needed
    if (canQuitResult.allowed) {
      return { confirmed: true, consumeSkipToken: false };
    }
    
    // Build dialog message
    let message = 'You are trying to quit VibeFlow during work hours.';
    if (this.config.hasActivePomodoro) {
      message += '\n\nYou have an active pomodoro session.';
    }
    
    const buttons = ['Cancel', 'Quit Anyway'];
    let detail = 'Quitting during work hours may affect your focus tracking.';
    
    if (canQuitResult.canConsumeSkipToken && this.skipTokenConsumer) {
      detail += '\n\nQuitting will consume one skip token.';
    }
    
    const result = await dialog.showMessageBox(this.mainWindow, {
      type: 'warning',
      title: 'Confirm Quit',
      message,
      detail,
      buttons,
      defaultId: 0,
      cancelId: 0,
    });
    
    const confirmed = result.response === 1; // "Quit Anyway" button
    
    return {
      confirmed,
      consumeSkipToken: confirmed && canQuitResult.canConsumeSkipToken === true,
    };
  }
  
  /**
   * Handle quit attempt
   * 
   * This method should be called when the app is about to quit.
   * Returns true if quit should proceed, false if it should be prevented.
   * 
   * Requirements: 1.6, 4.6, 4.7
   */
  async handleQuitAttempt(): Promise<boolean> {
    // Prevent re-entry during quit handling
    if (this.isQuitting) {
      return true;
    }
    
    const mode = detectAppMode();
    const canQuitResult = this.canQuit();
    
    // Record the attempt
    const attempt: QuitAttempt = {
      timestamp: new Date(),
      wasBlocked: false,
      reason: 'allowed',
      skipTokenConsumed: false,
      mode,
    };
    
    // If quit is allowed, proceed
    if (canQuitResult.allowed) {
      attempt.reason = 'allowed';
      this.quitAttempts.push(attempt);
      return true;
    }
    
    // Show confirmation dialog
    const confirmResult = await this.showQuitConfirmation();
    
    if (!confirmResult.confirmed) {
      // User cancelled
      attempt.wasBlocked = true;
      attempt.reason = 'work_hours';
      this.quitAttempts.push(attempt);
      return false;
    }
    
    // User confirmed quit
    attempt.reason = 'user_confirmed';
    
    // Consume skip token if configured
    if (confirmResult.consumeSkipToken && this.skipTokenConsumer) {
      try {
        const tokenResult = await this.skipTokenConsumer();
        attempt.skipTokenConsumed = tokenResult.success;
      } catch (error) {
        console.error('[QuitPrevention] Failed to consume skip token:', error);
      }
    }
    
    this.quitAttempts.push(attempt);
    this.isQuitting = true;
    return true;
  }
  
  /**
   * Force quit the application (bypasses all checks)
   * 
   * This should only be used for emergency situations or admin override.
   */
  forceQuit(): void {
    this.isQuitting = true;
    app.quit();
  }
  
  /**
   * Reset the quitting state (for testing)
   */
  resetQuittingState(): void {
    this.isQuitting = false;
  }
  
  /**
   * Check if currently in the process of quitting
   */
  isCurrentlyQuitting(): boolean {
    return this.isQuitting;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let quitPreventionInstance: QuitPrevention | null = null;

/**
 * Get or create the quit prevention singleton
 */
export function getQuitPrevention(config?: Partial<QuitPreventionConfig>): QuitPrevention {
  if (!quitPreventionInstance) {
    quitPreventionInstance = new QuitPrevention(config);
  } else if (config) {
    quitPreventionInstance.updateConfig(config);
  }
  return quitPreventionInstance;
}

/**
 * Reset the quit prevention singleton (for testing)
 */
export function resetQuitPrevention(): void {
  quitPreventionInstance = null;
}

// ============================================================================
// Export Service
// ============================================================================

// ============================================================================
// IPC Setup
// ============================================================================

/**
 * Setup IPC handlers for quit prevention
 */
export function setupQuitPreventionIpc(): void {
  const quitPrevention = getQuitPrevention();
  
  // Get current mode
  ipcMain.handle('quitPrevention:getMode', () => {
    return detectAppMode();
  });
  
  // Check if quit is allowed
  ipcMain.handle('quitPrevention:canQuit', () => {
    return quitPrevention.canQuit();
  });
  
  // Get configuration
  ipcMain.handle('quitPrevention:getConfig', () => {
    return quitPrevention.getConfig();
  });
  
  // Update configuration
  ipcMain.handle('quitPrevention:updateConfig', (_, config: Partial<QuitPreventionConfig>) => {
    quitPrevention.updateConfig(config);
    return quitPrevention.getConfig();
  });
  
  // Get quit attempt history
  ipcMain.handle('quitPrevention:getQuitAttempts', () => {
    return quitPrevention.getQuitAttempts();
  });
  
  // Request quit (will show confirmation if needed)
  ipcMain.handle('quitPrevention:requestQuit', async () => {
    const canProceed = await quitPrevention.handleQuitAttempt();
    if (canProceed) {
      app.quit();
    }
    return { proceeded: canProceed };
  });
  
  // Force quit (bypasses all checks)
  ipcMain.handle('quitPrevention:forceQuit', () => {
    quitPrevention.forceQuit();
    return { success: true };
  });
  
  // Check mode helpers
  ipcMain.handle('quitPrevention:isDevelopmentMode', () => {
    return isDevelopmentMode();
  });
  
  ipcMain.handle('quitPrevention:isProductionMode', () => {
    return isProductionMode();
  });
  
  ipcMain.handle('quitPrevention:isStagingMode', () => {
    return isStagingMode();
  });
  
  // Check work hours
  ipcMain.handle('quitPrevention:isWithinWorkHours', () => {
    const config = quitPrevention.getConfig();
    return isWithinWorkHours(config.workTimeSlots);
  });
}

// ============================================================================
// Export Service
// ============================================================================

export const quitPreventionService = {
  getQuitPrevention,
  resetQuitPrevention,
  setupQuitPreventionIpc,
  detectAppMode,
  isValidAppMode,
  isDevelopmentMode,
  isProductionMode,
  isStagingMode,
  isWithinWorkHours,
  parseTimeToMinutes,
  getCurrentTimeMinutes,
  DEFAULT_QUIT_PREVENTION_CONFIG,
};

export default quitPreventionService;
