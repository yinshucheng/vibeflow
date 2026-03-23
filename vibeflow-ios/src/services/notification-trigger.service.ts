/**
 * Notification Trigger Service
 *
 * Monitors state changes from server sync and triggers appropriate notifications.
 * This service listens to the Zustand store and sends notifications when:
 * - A pomodoro completes (state changes from FOCUS to IDLE)
 * - Rest period ends (state changes from IDLE to FOCUS, i.e. new pomodoro started)
 *
 * All notifications are read-only reminders with no action buttons.
 *
 * Requirements: 8.2, 8.3, 8.4
 */

import { useAppStore, type AppState } from '@/store';
import { notificationService } from './notification.service';
import type { DailyStateData, ActivePomodoroData } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

export interface NotificationTriggerConfig {
  enabled?: boolean;
}

interface PreviousState {
  dailyState: DailyStateData['state'] | null;
  activePomodoro: ActivePomodoroData | null;
  completedPomodoros: number;
}

// =============================================================================
// NOTIFICATION TRIGGER SERVICE
// =============================================================================

class NotificationTriggerService {
  private isInitialized = false;
  private unsubscribe: (() => void) | null = null;
  private previousState: PreviousState = {
    dailyState: null,
    activePomodoro: null,
    completedPomodoros: 0,
  };

  /**
   * Initialize the notification trigger service.
   * Sets up a subscription to the Zustand store to monitor state changes.
   */
  async initialize(config?: NotificationTriggerConfig): Promise<void> {
    if (this.isInitialized) {
      console.warn('[NotificationTrigger] Already initialized');
      return;
    }

    // Initialize the notification service first
    await notificationService.initialize();

    // Request notification permission
    const hasPermission = await notificationService.requestPermission();
    if (!hasPermission) {
      console.warn('[NotificationTrigger] Notification permission denied');
    }

    // Subscribe to store changes
    this.setupStoreSubscription();
    this.isInitialized = true;

    console.log('[NotificationTrigger] Initialized');
  }

  /**
   * Cleanup the notification trigger service.
   */
  cleanup(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    this.previousState = {
      dailyState: null,
      activePomodoro: null,
      completedPomodoros: 0,
    };

    this.isInitialized = false;
    console.log('[NotificationTrigger] Cleaned up');
  }

  /**
   * Check if the service is initialized.
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  /**
   * Set up subscription to Zustand store for state changes.
   */
  private setupStoreSubscription(): void {
    // Initialize previous state from current store state
    const currentState = useAppStore.getState();
    this.previousState = {
      dailyState: currentState.dailyState?.state ?? null,
      activePomodoro: currentState.activePomodoro,
      completedPomodoros: currentState.dailyState?.completedPomodoros ?? 0,
    };

    // Subscribe to store changes
    this.unsubscribe = useAppStore.subscribe((state) => {
      this.handleStateChange(state);
    });
  }

  /**
   * Handle state changes and trigger notifications as needed.
   */
  private handleStateChange(state: AppState): void {
    const currentDailyState = state.dailyState?.state ?? null;
    const currentPomodoro = state.activePomodoro;
    const currentCompletedPomodoros = state.dailyState?.completedPomodoros ?? 0;

    // Check for pomodoro completion
    // Requirements: 8.2 - WHEN a pomodoro completes on server
    this.checkPomodoroCompletion(
      currentDailyState,
      currentPomodoro,
      currentCompletedPomodoros
    );

    // Check for rest period end
    // Requirements: 8.3 - WHEN rest period ends on server
    this.checkRestPeriodEnd(currentDailyState);

    // Update previous state
    this.previousState = {
      dailyState: currentDailyState,
      activePomodoro: currentPomodoro,
      completedPomodoros: currentCompletedPomodoros,
    };
  }

  /**
   * Check if a pomodoro has completed and trigger notification.
   * A pomodoro is considered complete when:
   * - State changes from FOCUS to IDLE, OR
   * - Active pomodoro becomes null while in FOCUS state, OR
   * - Completed pomodoro count increases
   *
   * Requirements: 8.2
   */
  private checkPomodoroCompletion(
    currentDailyState: DailyStateData['state'] | null,
    currentPomodoro: ActivePomodoroData | null,
    currentCompletedPomodoros: number
  ): void {
    const previousDailyState = this.previousState.dailyState;
    const previousPomodoro = this.previousState.activePomodoro;
    const previousCompletedPomodoros = this.previousState.completedPomodoros;

    // Skip if this is the initial state load
    if (previousDailyState === null) {
      return;
    }

    // Condition 1: State changed from FOCUS to IDLE (pomodoro completed)
    const stateChangedToIdle =
      previousDailyState === 'FOCUS' && currentDailyState === 'IDLE';

    // Condition 2: Pomodoro count increased (most reliable indicator)
    const pomodoroCountIncreased =
      currentCompletedPomodoros > previousCompletedPomodoros;

    // Condition 3: Active pomodoro ended while in FOCUS
    const pomodoroEndedInFocus =
      previousPomodoro !== null &&
      currentPomodoro === null &&
      previousDailyState === 'FOCUS';

    if (stateChangedToIdle || pomodoroCountIncreased || pomodoroEndedInFocus) {
      console.log('[NotificationTrigger] Pomodoro completed, sending notification');
      this.triggerPomodoroCompleteNotification();
    }
  }

  /**
   * Check if rest period has ended and trigger notification.
   * In 3-state model, rest is a sub-phase of IDLE. Rest ends when user starts
   * a new pomodoro (IDLE → FOCUS).
   *
   * Requirements: 8.3
   */
  private checkRestPeriodEnd(
    currentDailyState: DailyStateData['state'] | null
  ): void {
    const previousDailyState = this.previousState.dailyState;

    // Skip if this is the initial state load
    if (previousDailyState === null) {
      return;
    }

    // Check if state changed from IDLE to FOCUS (user started new pomodoro after rest)
    const restEnded =
      previousDailyState === 'IDLE' && currentDailyState === 'FOCUS';

    if (restEnded) {
      console.log('[NotificationTrigger] Rest period ended, sending notification');
      this.triggerRestCompleteNotification();
    }
  }

  /**
   * Trigger pomodoro complete notification.
   * Requirements: 8.2, 8.4 - Read-only notification, no action buttons
   */
  private async triggerPomodoroCompleteNotification(): Promise<void> {
    try {
      await notificationService.showPomodoroComplete();
    } catch (error) {
      console.error('[NotificationTrigger] Failed to show pomodoro notification:', error);
    }
  }

  /**
   * Trigger rest complete notification.
   * Requirements: 8.3, 8.4 - Read-only notification, no action buttons
   */
  private async triggerRestCompleteNotification(): Promise<void> {
    try {
      await notificationService.showRestComplete();
    } catch (error) {
      console.error('[NotificationTrigger] Failed to show rest notification:', error);
    }
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const notificationTriggerService = new NotificationTriggerService();
