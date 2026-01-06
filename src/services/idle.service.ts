/**
 * Idle Detection Service
 * 
 * Tracks user idle time during work hours and triggers alerts when
 * the user has been idle for too long without an active pomodoro.
 * 
 * Requirements: 5.5, 5.9, 5.10
 */

import type { WorkTimeSlot, IdleAlertAction } from '@/services/user.service';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Idle detection configuration
 */
export interface IdleConfig {
  workTimeSlots: WorkTimeSlot[];
  maxIdleMinutes: number;
  idleAlertActions: IdleAlertAction[];
}

/**
 * Idle state tracking
 */
export interface IdleState {
  isIdle: boolean;
  idleStartTime: number | null;
  idleSeconds: number;
  lastActivityTime: number;
  isWithinWorkHours: boolean;
  isPomodoroActive: boolean;
  alertTriggered: boolean;
}

/**
 * Idle alert event payload
 */
export interface IdleAlertEvent {
  idleSeconds: number;
  threshold: number;
  actions: IdleAlertAction[];
  timestamp: number;
}

/**
 * Idle alert callback type
 */
export type IdleAlertCallback = (event: IdleAlertEvent) => void;

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
 * Requirements: 5.10
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
 * Validate work time slot format
 */
export function isValidTimeFormat(time: string): boolean {
  const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  return regex.test(time);
}

/**
 * Check if two work time slots overlap
 */
export function doSlotsOverlap(slot1: WorkTimeSlot, slot2: WorkTimeSlot): boolean {
  if (!slot1.enabled || !slot2.enabled) return false;
  
  const start1 = parseTimeToMinutes(slot1.startTime);
  const end1 = parseTimeToMinutes(slot1.endTime);
  const start2 = parseTimeToMinutes(slot2.startTime);
  const end2 = parseTimeToMinutes(slot2.endTime);
  
  // Slots overlap if one starts before the other ends
  return start1 < end2 && start2 < end1;
}

/**
 * Validate all work time slots for overlaps
 */
export function validateWorkTimeSlots(slots: WorkTimeSlot[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const enabledSlots = slots.filter((s) => s.enabled);
  
  // Check time format and start < end for each slot
  for (const slot of slots) {
    if (!isValidTimeFormat(slot.startTime)) {
      errors.push(`Invalid start time format: ${slot.startTime}`);
    }
    if (!isValidTimeFormat(slot.endTime)) {
      errors.push(`Invalid end time format: ${slot.endTime}`);
    }
    if (slot.startTime >= slot.endTime) {
      errors.push(`Start time must be before end time: ${slot.startTime} - ${slot.endTime}`);
    }
  }
  
  // Check for overlaps among enabled slots
  const sortedSlots = [...enabledSlots].sort((a, b) =>
    a.startTime.localeCompare(b.startTime)
  );
  
  for (let i = 0; i < sortedSlots.length - 1; i++) {
    if (doSlotsOverlap(sortedSlots[i], sortedSlots[i + 1])) {
      errors.push(
        `Time slots overlap: ${sortedSlots[i].startTime}-${sortedSlots[i].endTime} ` +
        `and ${sortedSlots[i + 1].startTime}-${sortedSlots[i + 1].endTime}`
      );
    }
  }
  
  return { valid: errors.length === 0, errors };
}


// ============================================================================
// Idle Detection State Machine
// ============================================================================

/**
 * Determine if an idle alert should be triggered based on current state
 * Requirements: 5.5, 5.8, 5.10
 * 
 * Property 8: Idle Detection State Machine
 * - If currentTime is NOT within any enabled work time slot, idle alert SHALL NOT trigger
 * - If pomodoroState is IN_PROGRESS, idle alert SHALL NOT trigger
 * - If idleSeconds < threshold, idle alert SHALL NOT trigger
 * - Otherwise, idle alert SHALL trigger
 */
export function shouldTriggerIdleAlert(
  isWithinWorkHours: boolean,
  isPomodoroActive: boolean,
  idleSeconds: number,
  thresholdSeconds: number
): boolean {
  // Rule 1: Not within work hours -> no alert
  if (!isWithinWorkHours) {
    return false;
  }
  
  // Rule 2: Pomodoro is active -> no alert
  if (isPomodoroActive) {
    return false;
  }
  
  // Rule 3: Idle time below threshold -> no alert
  if (idleSeconds < thresholdSeconds) {
    return false;
  }
  
  // All conditions met -> trigger alert
  return true;
}

// ============================================================================
// Idle Service Class
// ============================================================================

/**
 * IdleService - Client-side idle detection and alert management
 * 
 * This service runs in the browser and tracks user activity to detect
 * when the user has been idle during work hours without an active pomodoro.
 */
export class IdleService {
  private config: IdleConfig;
  private state: IdleState;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private alertCallbacks: Set<IdleAlertCallback> = new Set();
  private readonly CHECK_INTERVAL_MS = 30000; // Check every 30 seconds
  
  constructor(config?: Partial<IdleConfig>) {
    this.config = {
      workTimeSlots: config?.workTimeSlots ?? [],
      maxIdleMinutes: config?.maxIdleMinutes ?? 15,
      idleAlertActions: config?.idleAlertActions ?? ['show_overlay'],
    };
    
    this.state = {
      isIdle: false,
      idleStartTime: null,
      idleSeconds: 0,
      lastActivityTime: Date.now(),
      isWithinWorkHours: false,
      isPomodoroActive: false,
      alertTriggered: false,
    };
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<IdleConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * Get current configuration
   */
  getConfig(): IdleConfig {
    return { ...this.config };
  }
  
  /**
   * Get current state
   */
  getState(): IdleState {
    return { ...this.state };
  }
  
  /**
   * Start idle detection
   */
  start(): void {
    if (this.checkInterval) {
      return; // Already running
    }
    
    console.log('[IdleService] Starting idle detection');
    
    // Initial check
    this.checkIdleState();
    
    // Set up periodic checks
    this.checkInterval = setInterval(() => {
      this.checkIdleState();
    }, this.CHECK_INTERVAL_MS);
  }
  
  /**
   * Stop idle detection
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('[IdleService] Stopped idle detection');
    }
  }
  
  /**
   * Record user activity (resets idle timer)
   * Requirements: 5.8
   */
  recordActivity(): void {
    this.state.lastActivityTime = Date.now();
    this.state.isIdle = false;
    this.state.idleStartTime = null;
    this.state.idleSeconds = 0;
    this.state.alertTriggered = false;
  }
  
  /**
   * Update pomodoro active state
   * Requirements: 5.8
   */
  setPomodoroActive(isActive: boolean): void {
    this.state.isPomodoroActive = isActive;
    
    if (isActive) {
      // Reset idle state when pomodoro starts
      this.recordActivity();
    }
  }
  
  /**
   * Subscribe to idle alerts
   */
  onIdleAlert(callback: IdleAlertCallback): () => void {
    this.alertCallbacks.add(callback);
    return () => this.alertCallbacks.delete(callback);
  }
  
  /**
   * Check current idle state and trigger alerts if needed
   */
  private checkIdleState(): void {
    const now = Date.now();
    
    // Update work hours status
    this.state.isWithinWorkHours = isWithinWorkHours(this.config.workTimeSlots);
    
    // Calculate idle time
    const idleMs = now - this.state.lastActivityTime;
    this.state.idleSeconds = Math.floor(idleMs / 1000);
    
    // Update idle state
    if (!this.state.isIdle && this.state.idleSeconds > 0) {
      this.state.isIdle = true;
      this.state.idleStartTime = this.state.lastActivityTime;
    }
    
    // Check if alert should be triggered
    const thresholdSeconds = this.config.maxIdleMinutes * 60;
    const shouldAlert = shouldTriggerIdleAlert(
      this.state.isWithinWorkHours,
      this.state.isPomodoroActive,
      this.state.idleSeconds,
      thresholdSeconds
    );
    
    // Trigger alert if conditions met and not already triggered
    if (shouldAlert && !this.state.alertTriggered) {
      this.triggerAlert();
    }
  }
  
  /**
   * Trigger idle alert
   */
  private triggerAlert(): void {
    this.state.alertTriggered = true;
    
    const event: IdleAlertEvent = {
      idleSeconds: this.state.idleSeconds,
      threshold: this.config.maxIdleMinutes * 60,
      actions: this.config.idleAlertActions,
      timestamp: Date.now(),
    };
    
    console.log('[IdleService] Triggering idle alert:', event);
    
    // Notify all subscribers
    this.alertCallbacks.forEach((callback) => {
      try {
        callback(event);
      } catch (error) {
        console.error('[IdleService] Error in alert callback:', error);
      }
    });
  }
  
  /**
   * Reset alert state (allows alert to trigger again)
   */
  resetAlert(): void {
    this.state.alertTriggered = false;
  }
  
  /**
   * Force check idle state (for testing or manual trigger)
   */
  forceCheck(): void {
    this.checkIdleState();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let idleServiceInstance: IdleService | null = null;

/**
 * Get or create the idle service singleton
 */
export function getIdleService(config?: Partial<IdleConfig>): IdleService {
  if (!idleServiceInstance) {
    idleServiceInstance = new IdleService(config);
  } else if (config) {
    idleServiceInstance.updateConfig(config);
  }
  return idleServiceInstance;
}

/**
 * Reset the idle service singleton (for testing)
 */
export function resetIdleService(): void {
  if (idleServiceInstance) {
    idleServiceInstance.stop();
    idleServiceInstance = null;
  }
}

export const idleService = {
  getService: getIdleService,
  reset: resetIdleService,
  isWithinWorkHours,
  shouldTriggerIdleAlert,
  validateWorkTimeSlots,
  parseTimeToMinutes,
  getCurrentTimeMinutes,
};

export default idleService;
