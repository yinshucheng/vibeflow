/**
 * Notification Manager Module
 * 
 * Manages system notifications for VibeFlow desktop application.
 * Handles intervention notifications, pomodoro completion alerts, and other system messages.
 * 
 * Requirements: 2.2, 2.3
 */

import { Notification, BrowserWindow, app } from 'electron';
import * as path from 'path';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Notification types for different scenarios
 */
export type NotificationType = 
  | 'intervention'
  | 'pomodoro_complete'
  | 'break_complete'
  | 'reminder'
  | 'warning'
  | 'info';

/**
 * Notification options
 */
export interface NotificationOptions {
  title: string;
  body: string;
  type?: NotificationType;
  silent?: boolean;
  urgency?: 'normal' | 'critical' | 'low';
  timeoutMs?: number;
  actions?: NotificationAction[];
}

/**
 * Notification action button
 */
export interface NotificationAction {
  type: string;
  text: string;
}

/**
 * Notification callback handlers
 */
export interface NotificationCallbacks {
  onClick?: () => void;
  onClose?: () => void;
  onAction?: (actionType: string) => void;
}

// ============================================================================
// Notification Manager Class
// ============================================================================

/**
 * NotificationManager - Manages system notifications
 * 
 * This class handles:
 * - Creating and displaying system notifications
 * - Managing notification sounds
 * - Handling notification click events
 * - Bringing window to front on notification interaction
 */
export class NotificationManager {
  private mainWindow: BrowserWindow | null = null;
  private notificationHistory: Array<{
    timestamp: number;
    type: NotificationType;
    title: string;
  }> = [];
  private readonly MAX_HISTORY = 50;

  /**
   * Set the main window reference
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Check if notifications are supported
   */
  isSupported(): boolean {
    return Notification.isSupported();
  }

  /**
   * Show a notification
   * Requirements: 2.3
   */
  show(options: NotificationOptions, callbacks?: NotificationCallbacks): void {
    if (!this.isSupported()) {
      console.warn('[NotificationManager] Notifications not supported on this platform');
      return;
    }

    const notification = new Notification({
      title: options.title,
      body: options.body,
      silent: options.silent ?? false,
      urgency: options.urgency ?? 'normal',
      icon: this.getNotificationIcon(options.type),
      timeoutType: options.timeoutMs ? 'default' : 'never',
    });

    // Handle click event
    notification.on('click', () => {
      this.bringWindowToFront();
      callbacks?.onClick?.();
    });

    // Handle close event
    notification.on('close', () => {
      callbacks?.onClose?.();
    });

    // Handle action events (macOS)
    notification.on('action', (_event, index) => {
      if (options.actions && options.actions[index]) {
        callbacks?.onAction?.(options.actions[index].type);
      }
    });

    // Show the notification
    notification.show();

    // Record in history
    this.recordNotification(options.type ?? 'info', options.title);

    console.log('[NotificationManager] Notification shown:', options.title);
  }

  /**
   * Show an intervention notification
   * Requirements: 2.2, 2.3
   */
  showIntervention(idleMinutes: number, skipTokensRemaining: number): void {
    const title = '⏰ Time to Focus!';
    const body = skipTokensRemaining > 0
      ? `You've been idle for ${idleMinutes} minutes. Start a pomodoro to get back on track! (${skipTokensRemaining} skips remaining)`
      : `You've been idle for ${idleMinutes} minutes. Start a pomodoro to get back on track!`;

    this.show(
      {
        title,
        body,
        type: 'intervention',
        urgency: 'critical',
        silent: false,
      },
      {
        onClick: () => {
          this.bringWindowToFront();
          this.mainWindow?.webContents.send('notification:interventionClicked');
        },
      }
    );

    // Also bring window to front immediately
    this.bringWindowToFront();
  }

  /**
   * Show a pomodoro completion notification
   */
  showPomodoroComplete(taskName?: string): void {
    const title = '🎉 Pomodoro Complete!';
    const body = taskName
      ? `Great work on "${taskName}"! Time for a break.`
      : 'Great work! Time for a break.';

    this.show(
      {
        title,
        body,
        type: 'pomodoro_complete',
        urgency: 'normal',
        silent: false,
      },
      {
        onClick: () => {
          this.bringWindowToFront();
        },
      }
    );
  }

  /**
   * Show a break completion notification
   */
  showBreakComplete(): void {
    this.show(
      {
        title: '☕ Break Over!',
        body: 'Ready to start another pomodoro?',
        type: 'break_complete',
        urgency: 'normal',
        silent: false,
      },
      {
        onClick: () => {
          this.bringWindowToFront();
        },
      }
    );
  }

  /**
   * Show a reminder notification
   */
  showReminder(message: string): void {
    this.show({
      title: '📝 Reminder',
      body: message,
      type: 'reminder',
      urgency: 'normal',
    });
  }

  /**
   * Show a warning notification
   */
  showWarning(title: string, message: string): void {
    this.show({
      title: `⚠️ ${title}`,
      body: message,
      type: 'warning',
      urgency: 'critical',
    });
  }

  /**
   * Bring the main window to the foreground
   * Requirements: 2.2
   */
  bringWindowToFront(): void {
    if (!this.mainWindow) {
      console.warn('[NotificationManager] No main window reference');
      return;
    }

    // Restore if minimized
    if (this.mainWindow.isMinimized()) {
      this.mainWindow.restore();
    }

    // Show if hidden
    if (!this.mainWindow.isVisible()) {
      this.mainWindow.show();
    }

    // Focus the window
    this.mainWindow.focus();

    // On macOS, also show in dock and bring app to front
    if (process.platform === 'darwin') {
      app.dock?.show();
      app.focus({ steal: true });
    }

    // Set always on top temporarily to ensure visibility
    this.mainWindow.setAlwaysOnTop(true);
    setTimeout(() => {
      this.mainWindow?.setAlwaysOnTop(false);
    }, 1000);

    console.log('[NotificationManager] Window brought to front');
  }

  /**
   * Set window always on top (for intervention mode)
   */
  setWindowAlwaysOnTop(alwaysOnTop: boolean): void {
    if (this.mainWindow) {
      this.mainWindow.setAlwaysOnTop(alwaysOnTop, 'floating');
      console.log('[NotificationManager] Window always on top:', alwaysOnTop);
    }
  }

  /**
   * Get notification history
   */
  getHistory(): Array<{ timestamp: number; type: NotificationType; title: string }> {
    return [...this.notificationHistory];
  }

  /**
   * Clear notification history
   */
  clearHistory(): void {
    this.notificationHistory = [];
  }

  /**
   * Get the appropriate icon for notification type
   */
  private getNotificationIcon(_type?: NotificationType): string | undefined {
    // Try to load icon from assets
    const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon.png');
    return iconPath;
  }

  /**
   * Record notification in history
   */
  private recordNotification(type: NotificationType, title: string): void {
    this.notificationHistory.push({
      timestamp: Date.now(),
      type,
      title,
    });

    // Trim history if too long
    if (this.notificationHistory.length > this.MAX_HISTORY) {
      this.notificationHistory = this.notificationHistory.slice(-this.MAX_HISTORY);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let notificationManagerInstance: NotificationManager | null = null;

/**
 * Get or create the notification manager singleton
 */
export function getNotificationManager(): NotificationManager {
  if (!notificationManagerInstance) {
    notificationManagerInstance = new NotificationManager();
  }
  return notificationManagerInstance;
}

/**
 * Reset the notification manager singleton (for testing)
 */
export function resetNotificationManager(): void {
  notificationManagerInstance = null;
}

export default NotificationManager;
