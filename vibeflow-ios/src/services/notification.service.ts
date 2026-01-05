/**
 * Notification Service
 *
 * Handles local push notifications for the iOS app.
 * Notifications are read-only reminders with no action buttons.
 *
 * Requirements: 8.1, 8.2, 8.3
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// =============================================================================
// CONSTANTS
// =============================================================================

const STORAGE_KEY = '@vibeflow/notifications_enabled';

/**
 * Notification content for different events
 */
export const NOTIFICATION_CONTENT = {
  pomodoroComplete: {
    title: '番茄钟完成！',
    body: '恭喜完成一个番茄钟，休息一下吧',
  },
  restComplete: {
    title: '休息结束',
    body: '准备开始下一个番茄钟',
  },
} as const;

// =============================================================================
// TYPES
// =============================================================================

export type NotificationType = keyof typeof NOTIFICATION_CONTENT;

export interface NotificationServiceConfig {
  enabled?: boolean;
}

// =============================================================================
// NOTIFICATION HANDLER CONFIGURATION
// =============================================================================

/**
 * Configure how notifications are handled when app is in foreground
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// =============================================================================
// NOTIFICATION SERVICE
// =============================================================================

class NotificationService {
  private isEnabled: boolean = true;
  private hasPermission: boolean = false;

  /**
   * Initialize the notification service
   */
  async initialize(): Promise<void> {
    // Load enabled state from storage
    await this.loadEnabledState();

    // Check current permission status
    const { status } = await Notifications.getPermissionsAsync();
    this.hasPermission = status === 'granted';
  }

  /**
   * Request notification permission from the user
   * Requirements: 8.1
   */
  async requestPermission(): Promise<boolean> {
    // Check if already granted
    const { status: existingStatus } = await Notifications.getPermissionsAsync();

    if (existingStatus === 'granted') {
      this.hasPermission = true;
      return true;
    }

    // Request permission
    const { status } = await Notifications.requestPermissionsAsync();
    this.hasPermission = status === 'granted';

    return this.hasPermission;
  }

  /**
   * Check if notification permission is granted
   */
  async checkPermission(): Promise<boolean> {
    const { status } = await Notifications.getPermissionsAsync();
    this.hasPermission = status === 'granted';
    return this.hasPermission;
  }

  /**
   * Get current permission status
   */
  getHasPermission(): boolean {
    return this.hasPermission;
  }

  /**
   * Show pomodoro complete notification
   * Requirements: 8.2
   */
  async showPomodoroComplete(): Promise<void> {
    if (!this.isEnabled || !this.hasPermission) {
      return;
    }

    await this.scheduleNotification('pomodoroComplete');
  }

  /**
   * Show rest complete notification
   * Requirements: 8.3
   */
  async showRestComplete(): Promise<void> {
    if (!this.isEnabled || !this.hasPermission) {
      return;
    }

    await this.scheduleNotification('restComplete');
  }

  /**
   * Schedule a local notification
   * Requirements: 8.4 - No action buttons, just informational
   */
  private async scheduleNotification(type: NotificationType): Promise<void> {
    const content = NOTIFICATION_CONTENT[type];

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: content.title,
          body: content.body,
          sound: true,
          // No action buttons - read-only notification
          data: { type },
        },
        trigger: null, // Immediate notification
      });
    } catch (error) {
      console.error(`[NotificationService] Failed to schedule notification:`, error);
    }
  }

  /**
   * Enable or disable notifications
   */
  async setNotificationsEnabled(enabled: boolean): Promise<void> {
    this.isEnabled = enabled;
    await this.saveEnabledState();
  }

  /**
   * Check if notifications are enabled
   */
  isNotificationsEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Cancel all pending notifications
   */
  async cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  /**
   * Get all pending notifications
   */
  async getPendingNotifications(): Promise<Notifications.NotificationRequest[]> {
    return Notifications.getAllScheduledNotificationsAsync();
  }

  /**
   * Load enabled state from AsyncStorage
   */
  private async loadEnabledState(): Promise<void> {
    try {
      const value = await AsyncStorage.getItem(STORAGE_KEY);
      if (value !== null) {
        this.isEnabled = value === 'true';
      }
    } catch (error) {
      console.error('[NotificationService] Failed to load enabled state:', error);
    }
  }

  /**
   * Save enabled state to AsyncStorage
   */
  private async saveEnabledState(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, String(this.isEnabled));
    } catch (error) {
      console.error('[NotificationService] Failed to save enabled state:', error);
    }
  }

  /**
   * Add a listener for notification responses (when user taps notification)
   * Requirements: 8.5 - Opens to main status screen
   */
  addNotificationResponseListener(
    callback: (response: Notifications.NotificationResponse) => void
  ): Notifications.EventSubscription {
    return Notifications.addNotificationResponseReceivedListener(callback);
  }

  /**
   * Add a listener for received notifications (when app is in foreground)
   */
  addNotificationReceivedListener(
    callback: (notification: Notifications.Notification) => void
  ): Notifications.EventSubscription {
    return Notifications.addNotificationReceivedListener(callback);
  }

  /**
   * Remove a notification listener
   */
  removeNotificationListener(subscription: Notifications.EventSubscription): void {
    subscription.remove();
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const notificationService = new NotificationService();
