/**
 * Work Start Tracker
 * 
 * Tracks when users complete Airlock (LOCKED → PLANNING transition) to record work start times.
 * Used to analyze work avoidance patterns and improve discipline.
 * 
 * Requirements: 14.1, 14.2, 14.10
 */

import type { SystemState, WorkStartPayload } from '../types/index.js';

// ============================================================================
// Constants
// ============================================================================

const DAILY_RESET_HOUR = 4; // 04:00 AM
const STORAGE_KEY = 'workStartTracker';

// ============================================================================
// Types
// ============================================================================

export interface WorkStartInfo {
  date: string;                    // YYYY-MM-DD
  configuredStartTime: string;     // HH:mm
  actualStartTime: number;         // Unix timestamp
  delayMinutes: number;            // 0 if on-time or early, positive if late
  recorded: boolean;               // Whether the event has been sent to server
}

interface WorkStartTrackerStorage {
  todayWorkStart: WorkStartInfo | null;
  lastResetDate: string | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get today's date string (YYYY-MM-DD), accounting for 04:00 AM reset
 */
function getTodayDateString(): string {
  const now = new Date();
  const today = new Date(now);
  
  if (now.getHours() < DAILY_RESET_HOUR) {
    today.setDate(today.getDate() - 1);
  }
  
  return today.toISOString().split('T')[0];
}

/**
 * Parse time string (HH:mm) to minutes since midnight
 */
function parseTimeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Calculate delay in minutes between configured start time and actual start time
 * Requirements: 14.7, 14.8
 * 
 * @param configuredStartTime - The configured work start time in HH:mm format
 * @param actualStartTime - The actual timestamp when Airlock was completed
 * @returns Delay in minutes (0 if on-time or early, positive if late)
 */
export function calculateWorkStartDelay(
  configuredStartTime: string,
  actualStartTime: Date
): number {
  const configuredMinutes = parseTimeToMinutes(configuredStartTime);
  const actualMinutes = actualStartTime.getHours() * 60 + actualStartTime.getMinutes();
  
  // If actual start is before or at configured time, delay is 0
  if (actualMinutes <= configuredMinutes) {
    return 0;
  }
  
  return actualMinutes - configuredMinutes;
}

// ============================================================================
// Work Start Tracker Class
// ============================================================================

export class WorkStartTracker {
  private previousState: SystemState | null = null;
  private todayWorkStart: WorkStartInfo | null = null;
  private lastResetDate: string | null = null;
  private sendCallback: ((payload: WorkStartPayload) => void) | null = null;
  private configuredStartTime: string = '09:00'; // Default, will be updated from policy

  /**
   * Initialize the tracker
   */
  async initialize(): Promise<void> {
    await this.loadFromStorage();
    await this.checkDailyReset();
    console.log('[WorkStartTracker] Initialized');
  }

  /**
   * Load state from Chrome storage
   */
  private async loadFromStorage(): Promise<void> {
    try {
      const result = await chrome.storage.local.get([STORAGE_KEY]);
      const stored = result[STORAGE_KEY] as WorkStartTrackerStorage | undefined;
      
      if (stored) {
        this.todayWorkStart = stored.todayWorkStart;
        this.lastResetDate = stored.lastResetDate;
      }
    } catch (error) {
      console.error('[WorkStartTracker] Failed to load from storage:', error);
    }
  }

  /**
   * Save state to Chrome storage
   */
  private async saveToStorage(): Promise<void> {
    try {
      const data: WorkStartTrackerStorage = {
        todayWorkStart: this.todayWorkStart,
        lastResetDate: this.lastResetDate,
      };
      await chrome.storage.local.set({ [STORAGE_KEY]: data });
    } catch (error) {
      console.error('[WorkStartTracker] Failed to save to storage:', error);
    }
  }

  /**
   * Check if daily reset is needed
   */
  private async checkDailyReset(): Promise<void> {
    const today = getTodayDateString();
    
    if (this.lastResetDate !== today) {
      // New day, reset work start info
      this.todayWorkStart = null;
      this.lastResetDate = today;
      await this.saveToStorage();
      console.log('[WorkStartTracker] Daily reset performed for:', today);
    }
  }

  /**
   * Set the callback for sending work start events
   */
  setSendCallback(callback: (payload: WorkStartPayload) => void): void {
    this.sendCallback = callback;
  }

  /**
   * Update the configured work start time from policy
   */
  setConfiguredStartTime(time: string): void {
    this.configuredStartTime = time;
    console.log('[WorkStartTracker] Configured start time set to:', time);
  }

  /**
   * Handle state change and detect LOCKED → PLANNING transition
   * Requirements: 14.1, 14.2, 14.10
   */
  async handleStateChange(newState: SystemState): Promise<void> {
    await this.checkDailyReset();
    
    // Detect LOCKED → PLANNING transition (Airlock completion)
    if (this.previousState === 'LOCKED' && newState === 'PLANNING') {
      await this.recordWorkStart();
    }
    
    this.previousState = newState;
  }

  /**
   * Record work start when Airlock is completed
   * Requirements: 14.1, 14.2
   */
  private async recordWorkStart(): Promise<void> {
    // Only record once per day
    if (this.todayWorkStart) {
      console.log('[WorkStartTracker] Work start already recorded for today');
      return;
    }

    const now = new Date();
    const today = getTodayDateString();
    const delayMinutes = calculateWorkStartDelay(this.configuredStartTime, now);

    const workStartInfo: WorkStartInfo = {
      date: today,
      configuredStartTime: this.configuredStartTime,
      actualStartTime: now.getTime(),
      delayMinutes,
      recorded: false,
    };

    this.todayWorkStart = workStartInfo;
    await this.saveToStorage();

    console.log('[WorkStartTracker] Work start recorded:', workStartInfo);

    // Send event to server
    await this.sendWorkStartEvent(workStartInfo);
  }

  /**
   * Send work start event to server
   * Requirements: 14.9, 14.10
   */
  private async sendWorkStartEvent(info: WorkStartInfo): Promise<void> {
    if (!this.sendCallback) {
      console.warn('[WorkStartTracker] No send callback set, cannot send work start event');
      return;
    }

    const payload: WorkStartPayload = {
      date: info.date,
      configuredStartTime: info.configuredStartTime,
      actualStartTime: info.actualStartTime,
      delayMinutes: info.delayMinutes,
      trigger: 'first_pomodoro',
    };

    try {
      this.sendCallback(payload);
      
      // Mark as recorded
      if (this.todayWorkStart) {
        this.todayWorkStart.recorded = true;
        await this.saveToStorage();
      }
      
      console.log('[WorkStartTracker] Work start event sent:', payload);
    } catch (error) {
      console.error('[WorkStartTracker] Failed to send work start event:', error);
    }
  }

  /**
   * Get today's work start info
   */
  getTodayWorkStart(): WorkStartInfo | null {
    return this.todayWorkStart;
  }

  /**
   * Check if work start has been recorded today
   */
  hasRecordedToday(): boolean {
    return this.todayWorkStart !== null;
  }

  /**
   * Retry sending work start event if it wasn't recorded
   */
  async retrySendIfNeeded(): Promise<void> {
    if (this.todayWorkStart && !this.todayWorkStart.recorded) {
      console.log('[WorkStartTracker] Retrying to send work start event');
      await this.sendWorkStartEvent(this.todayWorkStart);
    }
  }

  /**
   * Set the previous state (for initialization)
   */
  setPreviousState(state: SystemState): void {
    this.previousState = state;
  }
}

// Singleton instance
let workStartTrackerInstance: WorkStartTracker | null = null;

/**
 * Get the singleton WorkStartTracker instance
 */
export function getWorkStartTracker(): WorkStartTracker {
  if (!workStartTrackerInstance) {
    workStartTrackerInstance = new WorkStartTracker();
  }
  return workStartTrackerInstance;
}

export default getWorkStartTracker;
