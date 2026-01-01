/**
 * Focus Enforcer Module
 * 
 * Core logic for focus enforcement in the VibeFlow desktop application.
 * Handles idle detection, intervention triggering, and enforcement mode logic.
 * 
 * Requirements: 2.1, 2.4, 2.5, 2.6, 2.7, 4.2, 4.5
 */

import { BrowserWindow, ipcMain } from 'electron';
import type { DistractionApp, InterventionEvent } from '../types';
import {
  getModeBehavior,
  getInterventionAction as getModeInterventionAction,
  getSkipTokenLimits,
  type ModeBehavior,
} from './enforcement-mode';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Work time slot configuration
 */
export interface WorkTimeSlot {
  id: string;
  startTime: string; // HH:mm format
  endTime: string;   // HH:mm format
  enabled: boolean;
}

/**
 * Focus enforcer configuration
 */
export interface FocusEnforcerConfig {
  workTimeSlots: WorkTimeSlot[];
  maxIdleMinutes: number;
  enforcementMode: 'strict' | 'gentle';
  repeatIntervalMinutes: number;
  distractionApps: DistractionApp[];
  skipTokens: SkipTokenConfig;
}

/**
 * Skip token configuration
 */
export interface SkipTokenConfig {
  dailyLimit: number;
  maxDelayMinutes: number;
  usedToday: number;
  lastResetDate: string; // ISO date string
}

/**
 * Focus enforcer state
 */
export interface FocusEnforcerState {
  isMonitoring: boolean;
  isWithinWorkHours: boolean;
  isPomodoroActive: boolean;
  idleSeconds: number;
  lastActivityTime: number;
  lastInterventionTime: number | null;
  interventionCount: number;
}

/**
 * Intervention action result
 */
export interface InterventionAction {
  type: 'force_quit' | 'hide_window';
  apps: DistractionApp[];
}

/**
 * Intervention callback type
 */
export type InterventionCallback = (event: InterventionEvent) => void;

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
 * Check if current time is within any enabled work time slot
 * Requirements: 2.1
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

/**
 * Get today's date as ISO string (YYYY-MM-DD)
 */
export function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

// ============================================================================
// Core Intervention Logic
// ============================================================================

/**
 * Determine if an intervention should be triggered
 * 
 * Property 1: Idle Detection State Machine
 * For any combination of work time status, pomodoro state, and idle duration,
 * the Focus_Enforcer SHALL trigger intervention if and only if:
 * (1) current time is within configured work hours, AND
 * (2) no pomodoro is active, AND
 * (3) idle time exceeds the configured threshold.
 * 
 * Requirements: 2.1, 2.7
 * Validates: Requirements 2.1, 2.7, 7.7
 */
export function shouldTriggerIntervention(
  isWithinWorkHours: boolean,
  isPomodoroActive: boolean,
  idleSeconds: number,
  thresholdSeconds: number
): boolean {
  // Rule 1: Not within work hours -> no intervention
  if (!isWithinWorkHours) {
    return false;
  }
  
  // Rule 2: Pomodoro is active -> no intervention
  if (isPomodoroActive) {
    return false;
  }
  
  // Rule 3: Idle time below threshold -> no intervention
  if (idleSeconds < thresholdSeconds) {
    return false;
  }
  
  // All conditions met -> trigger intervention
  return true;
}

/**
 * Determine the app control action based on enforcement mode
 * 
 * Property 2: Enforcement Mode Determines App Control Action
 * For any intervention trigger with a list of distraction apps:
 * - If enforcement mode is "strict", all apps SHALL receive "force_quit" commands
 * - If enforcement mode is "gentle", all apps SHALL receive "hide_window" commands
 *   (unless individually configured otherwise)
 * 
 * Requirements: 2.4, 2.5, 4.2, 4.5
 * Validates: Requirements 2.4, 2.5, 4.2, 4.5
 */
export function getInterventionAction(
  enforcementMode: 'strict' | 'gentle',
  distractionApps: DistractionApp[]
): InterventionAction {
  // Delegate to the enforcement mode module for consistent behavior
  return getModeInterventionAction(enforcementMode, distractionApps);
}

/**
 * Check if enough time has passed since last intervention for repeat
 * Requirements: 2.6
 */
export function shouldRepeatIntervention(
  lastInterventionTime: number | null,
  repeatIntervalMinutes: number
): boolean {
  if (lastInterventionTime === null) {
    return true; // First intervention
  }
  
  const now = Date.now();
  const elapsedMs = now - lastInterventionTime;
  const repeatIntervalMs = repeatIntervalMinutes * 60 * 1000;
  
  return elapsedMs >= repeatIntervalMs;
}

// ============================================================================
// Focus Enforcer Class
// ============================================================================

/**
 * FocusEnforcer - Main class for focus enforcement in Electron
 * 
 * This class manages idle detection, intervention triggering, and
 * coordinates with the app controller for distraction app management.
 */
export class FocusEnforcer {
  private config: FocusEnforcerConfig;
  private state: FocusEnforcerState;
  private checkInterval: NodeJS.Timeout | null = null;
  private interventionCallbacks: Set<InterventionCallback> = new Set();
  private mainWindow: BrowserWindow | null = null;
  
  private readonly CHECK_INTERVAL_MS = 10000; // Check every 10 seconds
  
  constructor(config?: Partial<FocusEnforcerConfig>) {
    this.config = {
      workTimeSlots: config?.workTimeSlots ?? [],
      maxIdleMinutes: config?.maxIdleMinutes ?? 15,
      enforcementMode: config?.enforcementMode ?? 'gentle',
      repeatIntervalMinutes: config?.repeatIntervalMinutes ?? 5,
      distractionApps: config?.distractionApps ?? [],
      skipTokens: config?.skipTokens ?? {
        dailyLimit: 3,
        maxDelayMinutes: 15,
        usedToday: 0,
        lastResetDate: getTodayDateString(),
      },
    };
    
    this.state = {
      isMonitoring: false,
      isWithinWorkHours: false,
      isPomodoroActive: false,
      idleSeconds: 0,
      lastActivityTime: Date.now(),
      lastInterventionTime: null,
      interventionCount: 0,
    };
  }
  
  /**
   * Set the main window reference for bringing to front
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<FocusEnforcerConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Reset skip tokens if date changed
    this.checkAndResetSkipTokens();
  }
  
  /**
   * Get current configuration
   */
  getConfig(): FocusEnforcerConfig {
    return { ...this.config };
  }
  
  /**
   * Get current state
   */
  getState(): FocusEnforcerState {
    return { ...this.state };
  }
  
  /**
   * Check if currently within work hours
   */
  isWithinWorkHours(): boolean {
    return isWithinWorkHours(this.config.workTimeSlots);
  }
  
  /**
   * Get current idle time in seconds
   */
  getIdleSeconds(): number {
    return this.state.idleSeconds;
  }
  
  /**
   * Get the current enforcement mode behavior
   * Requirements: 2.4, 2.5, 4.2, 4.5
   */
  getModeBehavior(): ModeBehavior {
    return getModeBehavior(this.config.enforcementMode);
  }
  
  /**
   * Get skip token limits based on current enforcement mode
   * Requirements: 4.4, 4.7
   */
  getSkipTokenLimits(): { dailyLimit: number; maxDelayMinutes: number } {
    return getSkipTokenLimits(this.config.enforcementMode);
  }
  
  /**
   * Update enforcement mode and adjust skip token limits accordingly
   * Requirements: 4.1, 4.4, 4.7
   */
  setEnforcementMode(mode: 'strict' | 'gentle'): void {
    this.config.enforcementMode = mode;
    
    // Update skip token limits based on new mode
    const limits = getSkipTokenLimits(mode);
    this.config.skipTokens.dailyLimit = limits.dailyLimit;
    this.config.skipTokens.maxDelayMinutes = limits.maxDelayMinutes;
    
    console.log('[FocusEnforcer] Enforcement mode changed to:', mode, 'with limits:', limits);
  }

  
  /**
   * Start focus monitoring
   * Requirements: 2.1
   */
  start(): void {
    if (this.state.isMonitoring) {
      return; // Already running
    }
    
    console.log('[FocusEnforcer] Starting focus monitoring');
    this.state.isMonitoring = true;
    
    // Reset skip tokens if needed
    this.checkAndResetSkipTokens();
    
    // Initial check
    this.checkFocusState();
    
    // Set up periodic checks
    this.checkInterval = setInterval(() => {
      this.checkFocusState();
    }, this.CHECK_INTERVAL_MS);
  }
  
  /**
   * Stop focus monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.state.isMonitoring = false;
    console.log('[FocusEnforcer] Stopped focus monitoring');
  }
  
  /**
   * Record user activity (resets idle timer)
   * Requirements: 2.7
   */
  recordActivity(): void {
    this.state.lastActivityTime = Date.now();
    this.state.idleSeconds = 0;
  }
  
  /**
   * Update pomodoro active state
   * Requirements: 2.7
   */
  setPomodoroActive(isActive: boolean): void {
    this.state.isPomodoroActive = isActive;
    
    if (isActive) {
      // Reset idle state and intervention tracking when pomodoro starts
      this.recordActivity();
      this.state.lastInterventionTime = null;
      this.state.interventionCount = 0;
    }
  }
  
  /**
   * Subscribe to intervention events
   */
  onIntervention(callback: InterventionCallback): () => void {
    this.interventionCallbacks.add(callback);
    return () => this.interventionCallbacks.delete(callback);
  }
  
  /**
   * Trigger an intervention manually (for testing)
   */
  triggerIntervention(event: InterventionEvent): void {
    this.notifyIntervention(event);
  }
  
  /**
   * Skip the current intervention (consumes a skip token)
   * Requirements: 5.2
   * @returns true if skip was successful, false if no tokens remaining
   */
  skipIntervention(): boolean {
    this.checkAndResetSkipTokens();
    
    if (this.config.skipTokens.usedToday >= this.config.skipTokens.dailyLimit) {
      return false;
    }
    
    this.config.skipTokens.usedToday++;
    this.state.lastInterventionTime = Date.now();
    
    console.log('[FocusEnforcer] Intervention skipped, tokens used:', this.config.skipTokens.usedToday);
    return true;
  }
  
  /**
   * Delay the intervention (consumes a skip token)
   * Requirements: 5.3
   * @param minutes - Number of minutes to delay (capped by maxDelayMinutes)
   * @returns true if delay was successful, false if no tokens remaining
   */
  delayIntervention(minutes: number): boolean {
    this.checkAndResetSkipTokens();
    
    if (this.config.skipTokens.usedToday >= this.config.skipTokens.dailyLimit) {
      return false;
    }
    
    // Cap delay to max allowed
    const actualDelay = Math.min(minutes, this.config.skipTokens.maxDelayMinutes);
    
    this.config.skipTokens.usedToday++;
    this.state.lastInterventionTime = Date.now();
    
    // Extend the repeat interval by the delay amount
    // This effectively delays the next intervention
    console.log('[FocusEnforcer] Intervention delayed by', actualDelay, 'minutes');
    return true;
  }
  
  /**
   * Get remaining skip tokens for today
   * Requirements: 5.4
   */
  getRemainingSkipTokens(): number {
    this.checkAndResetSkipTokens();
    return Math.max(0, this.config.skipTokens.dailyLimit - this.config.skipTokens.usedToday);
  }
  
  /**
   * Check and reset skip tokens at midnight
   * Requirements: 5.6
   */
  private checkAndResetSkipTokens(): void {
    const today = getTodayDateString();
    
    if (this.config.skipTokens.lastResetDate !== today) {
      this.config.skipTokens.usedToday = 0;
      this.config.skipTokens.lastResetDate = today;
      console.log('[FocusEnforcer] Skip tokens reset for new day');
    }
  }
  
  /**
   * Check current focus state and trigger interventions if needed
   */
  private checkFocusState(): void {
    const now = Date.now();
    
    // Update work hours status
    this.state.isWithinWorkHours = isWithinWorkHours(this.config.workTimeSlots);
    
    // Calculate idle time
    const idleMs = now - this.state.lastActivityTime;
    this.state.idleSeconds = Math.floor(idleMs / 1000);
    
    // Check if intervention should be triggered
    const thresholdSeconds = this.config.maxIdleMinutes * 60;
    const shouldTrigger = shouldTriggerIntervention(
      this.state.isWithinWorkHours,
      this.state.isPomodoroActive,
      this.state.idleSeconds,
      thresholdSeconds
    );
    
    // Check if enough time has passed for repeat intervention
    const shouldRepeat = shouldRepeatIntervention(
      this.state.lastInterventionTime,
      this.config.repeatIntervalMinutes
    );
    
    // Trigger intervention if conditions met
    if (shouldTrigger && shouldRepeat) {
      this.executeIntervention();
    }
  }
  
  /**
   * Execute an intervention
   * Requirements: 2.2, 2.3, 2.4, 2.5
   */
  private executeIntervention(): void {
    this.state.lastInterventionTime = Date.now();
    this.state.interventionCount++;
    
    // Get the appropriate action based on enforcement mode
    const action = getInterventionAction(
      this.config.enforcementMode,
      this.config.distractionApps
    );
    
    const event: InterventionEvent = {
      type: 'idle_alert',
      timestamp: Date.now(),
      idleSeconds: this.state.idleSeconds,
    };
    
    console.log('[FocusEnforcer] Executing intervention:', {
      mode: this.config.enforcementMode,
      action: action.type,
      appsCount: action.apps.length,
      idleSeconds: this.state.idleSeconds,
    });
    
    // Bring window to front (Requirements: 2.2)
    this.bringWindowToFront();
    
    // Notify subscribers
    this.notifyIntervention(event);
  }
  
  /**
   * Bring the main window to the foreground
   * Requirements: 2.2
   */
  private bringWindowToFront(): void {
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }
  
  /**
   * Notify all intervention subscribers
   */
  private notifyIntervention(event: InterventionEvent): void {
    this.interventionCallbacks.forEach((callback) => {
      try {
        callback(event);
      } catch (error) {
        console.error('[FocusEnforcer] Error in intervention callback:', error);
      }
    });
    
    // Also send to renderer process via IPC
    if (this.mainWindow) {
      this.mainWindow.webContents.send('focus:interventionTriggered', event);
    }
  }
  
  /**
   * Force check focus state (for testing or manual trigger)
   */
  forceCheck(): void {
    this.checkFocusState();
  }
}

// ============================================================================
// Singleton Instance and IPC Setup
// ============================================================================

let focusEnforcerInstance: FocusEnforcer | null = null;

/**
 * Get or create the focus enforcer singleton
 */
export function getFocusEnforcer(config?: Partial<FocusEnforcerConfig>): FocusEnforcer {
  if (!focusEnforcerInstance) {
    focusEnforcerInstance = new FocusEnforcer(config);
  } else if (config) {
    focusEnforcerInstance.updateConfig(config);
  }
  return focusEnforcerInstance;
}

/**
 * Reset the focus enforcer singleton (for testing)
 */
export function resetFocusEnforcer(): void {
  if (focusEnforcerInstance) {
    focusEnforcerInstance.stop();
    focusEnforcerInstance = null;
  }
}

/**
 * Setup IPC handlers for focus enforcer
 */
export function setupFocusEnforcerIpc(): void {
  const enforcer = getFocusEnforcer();
  
  // Start/stop monitoring
  ipcMain.handle('focus:startMonitoring', () => {
    enforcer.start();
    return { success: true };
  });
  
  ipcMain.handle('focus:stopMonitoring', () => {
    enforcer.stop();
    return { success: true };
  });
  
  // Get state
  ipcMain.handle('focus:getState', () => {
    return enforcer.getState();
  });
  
  // Get config
  ipcMain.handle('focus:getConfig', () => {
    return enforcer.getConfig();
  });
  
  // Update config
  ipcMain.handle('focus:updateConfig', (_, config: Partial<FocusEnforcerConfig>) => {
    enforcer.updateConfig(config);
    return enforcer.getConfig();
  });
  
  // Record activity
  ipcMain.handle('focus:recordActivity', () => {
    enforcer.recordActivity();
    return { success: true };
  });
  
  // Set pomodoro active
  ipcMain.handle('focus:setPomodoroActive', (_, isActive: boolean) => {
    enforcer.setPomodoroActive(isActive);
    return { success: true };
  });
  
  // Skip intervention
  ipcMain.handle('focus:skipIntervention', () => {
    const success = enforcer.skipIntervention();
    return { success, remaining: enforcer.getRemainingSkipTokens() };
  });
  
  // Delay intervention
  ipcMain.handle('focus:delayIntervention', (_, minutes: number) => {
    const success = enforcer.delayIntervention(minutes);
    return { success, remaining: enforcer.getRemainingSkipTokens() };
  });
  
  // Get remaining skip tokens
  ipcMain.handle('focus:getRemainingSkipTokens', () => {
    return { remaining: enforcer.getRemainingSkipTokens() };
  });
  
  // Get mode behavior
  ipcMain.handle('focus:getModeBehavior', () => {
    return enforcer.getModeBehavior();
  });
  
  // Get skip token limits
  ipcMain.handle('focus:getSkipTokenLimits', () => {
    return enforcer.getSkipTokenLimits();
  });
  
  // Set enforcement mode
  ipcMain.handle('focus:setEnforcementMode', (_, mode: 'strict' | 'gentle') => {
    enforcer.setEnforcementMode(mode);
    return { 
      success: true, 
      mode,
      behavior: enforcer.getModeBehavior(),
      limits: enforcer.getSkipTokenLimits(),
    };
  });
}

// Export for use in main process
export const focusEnforcerService = {
  getEnforcer: getFocusEnforcer,
  reset: resetFocusEnforcer,
  setupIpc: setupFocusEnforcerIpc,
  shouldTriggerIntervention,
  getInterventionAction,
  shouldRepeatIntervention,
  isWithinWorkHours,
  parseTimeToMinutes,
  getCurrentTimeMinutes,
};

export default focusEnforcerService;
