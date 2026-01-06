/**
 * Notification Service
 * 
 * Handles browser notifications, audio alerts, and tab title flashing
 * for pomodoro completion and other system events.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

// Sound types available for notifications
export type NotificationSoundType = 'bell' | 'chime' | 'gentle' | 'none';

// Notification configuration
export interface NotificationConfig {
  enabled: boolean;
  soundEnabled: boolean;
  soundType: NotificationSoundType;
  flashTab: boolean;
}

// Default configuration
const DEFAULT_CONFIG: NotificationConfig = {
  enabled: true,
  soundEnabled: true,
  soundType: 'bell',
  flashTab: true,
};

// Audio element cache
const audioCache: Map<NotificationSoundType, HTMLAudioElement> = new Map();

// Tab title flashing state
let flashInterval: ReturnType<typeof setInterval> | null = null;
let originalTitle: string = '';

/**
 * Request browser notification permission
 * Requirements: 4.1
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    console.warn('[NotificationService] Browser notifications not supported');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission === 'denied') {
    console.warn('[NotificationService] Notification permission denied');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (error) {
    console.error('[NotificationService] Error requesting permission:', error);
    return false;
  }
}

/**
 * Check if notifications are supported and permitted
 */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 
         'Notification' in window && 
         Notification.permission === 'granted';
}

/**
 * Get the audio file path for a sound type
 */
function getSoundPath(soundType: NotificationSoundType): string | null {
  if (soundType === 'none') return null;
  return `/sounds/${soundType}.mp3`;
}

/**
 * Preload audio files for faster playback
 */
export function preloadSounds(): void {
  if (typeof window === 'undefined') return;

  const soundTypes: NotificationSoundType[] = ['bell', 'chime', 'gentle'];
  
  soundTypes.forEach((type) => {
    const path = getSoundPath(type);
    if (path && !audioCache.has(type)) {
      const audio = new Audio(path);
      audio.preload = 'auto';
      audioCache.set(type, audio);
    }
  });
}

/**
 * Play notification sound
 * Requirements: 4.2, 4.4
 */
export function playSound(soundType: NotificationSoundType): void {
  if (typeof window === 'undefined' || soundType === 'none') return;

  try {
    let audio = audioCache.get(soundType);
    
    if (!audio) {
      const path = getSoundPath(soundType);
      if (!path) return;
      
      audio = new Audio(path);
      audioCache.set(soundType, audio);
    }

    // Reset and play
    audio.currentTime = 0;
    audio.play().catch((error) => {
      console.warn('[NotificationService] Error playing sound:', error);
    });
  } catch (error) {
    console.error('[NotificationService] Error playing sound:', error);
  }
}

/**
 * Start flashing the tab title
 * Requirements: 4.5
 */
export function startTabFlash(message: string): void {
  if (typeof window === 'undefined') return;

  // Stop any existing flash
  stopTabFlash();

  // Store original title
  originalTitle = document.title;

  // Start flashing
  let showMessage = true;
  flashInterval = setInterval(() => {
    document.title = showMessage ? message : originalTitle;
    showMessage = !showMessage;
  }, 1000);
}

/**
 * Stop flashing the tab title
 */
export function stopTabFlash(): void {
  if (flashInterval) {
    clearInterval(flashInterval);
    flashInterval = null;
  }
  
  if (originalTitle && typeof window !== 'undefined') {
    document.title = originalTitle;
    originalTitle = '';
  }
}

/**
 * Show browser notification
 * Requirements: 4.1
 */
export function showBrowserNotification(
  title: string,
  options?: NotificationOptions
): Notification | null {
  if (!isNotificationSupported()) {
    console.warn('[NotificationService] Notifications not available');
    return null;
  }

  try {
    const notification = new Notification(title, {
      icon: '/icons/pomodoro.png',
      badge: '/icons/pomodoro-badge.png',
      ...options,
    });

    // Auto-close after 10 seconds
    setTimeout(() => notification.close(), 10000);

    return notification;
  } catch (error) {
    console.error('[NotificationService] Error showing notification:', error);
    return null;
  }
}

/**
 * Notify pomodoro completion with all configured alerts
 * Requirements: 4.1, 4.2, 4.5
 */
export async function notifyPomodoroComplete(
  taskTitle: string,
  config: NotificationConfig = DEFAULT_CONFIG
): Promise<void> {
  // Show browser notification if enabled
  if (config.enabled) {
    showBrowserNotification('🍅 Pomodoro Complete!', {
      body: `Great work on "${taskTitle}"! Time for a break.`,
      tag: 'pomodoro-complete',
      requireInteraction: true,
    });
  }

  // Play sound if enabled
  if (config.soundEnabled && config.soundType !== 'none') {
    playSound(config.soundType);
  }

  // Flash tab title if enabled and tab is not focused
  if (config.flashTab && typeof document !== 'undefined' && document.hidden) {
    startTabFlash('🍅 Pomodoro Complete!');
    
    // Stop flashing when tab becomes visible
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        stopTabFlash();
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
}

/**
 * Notify idle alert
 * Requirements: 5.6
 */
export async function notifyIdleAlert(config: NotificationConfig = DEFAULT_CONFIG): Promise<void> {
  if (config.enabled) {
    showBrowserNotification('⏰ Time to Focus!', {
      body: 'You\'ve been idle during work hours. Ready to start a pomodoro?',
      tag: 'idle-alert',
      requireInteraction: true,
    });
  }

  if (config.soundEnabled && config.soundType !== 'none') {
    playSound(config.soundType);
  }
}

/**
 * Notification service singleton
 */
export const notificationService = {
  requestPermission: requestNotificationPermission,
  isSupported: isNotificationSupported,
  preloadSounds,
  playSound,
  startTabFlash,
  stopTabFlash,
  showNotification: showBrowserNotification,
  notifyPomodoroComplete,
  notifyIdleAlert,
};

export default notificationService;
