/**
 * Tray Integration Service
 *
 * Handles integration between the web application and desktop tray.
 * Formats time data and sends state updates to the desktop app via IPC.
 *
 * Requirements: 1.7, 8.7, 5.1-5.5
 */

import { TimeFormatter } from '@/lib/time-formatter';
import type { SystemState } from '@/server/socket';

/** Max minutes after pomodoro completion to consider user as "resting" */
export const RESTING_WINDOW_MINUTES = 30;

// Tray menu state interface (matches desktop app)
interface TrayMenuState {
  // Existing fields
  pomodoroActive: boolean;
  pomodoroTimeRemaining?: string; // MM:SS format
  currentTask?: string;
  isWithinWorkHours: boolean;
  skipTokensRemaining: number;
  enforcementMode: 'strict' | 'gentle';
  appMode?: 'FOCUS' | 'REST' | 'LOCKED' | 'PLANNING';
  isInDemoMode?: boolean;

  // New fields for enhanced functionality
  systemState: 'READY' | 'RESTING' | 'FOCUS' | 'OVER_REST';
  restTimeRemaining?: string; // MM:SS format for rest countdown (pre-formatted)
  overRestDuration?: string; // Formatted duration for over-rest display (e.g., "15 min")
  dailyProgress?: string; // e.g., "3/8"
  isInSleepTime?: boolean;
}

// Pomodoro data for tray updates
interface PomodoroData {
  id: string;
  taskId: string | null; // nullable for taskless pomodoros
  duration: number; // minutes
  startTime: Date;
  task?: {
    title: string;
  } | null;
}

// Rest period data
interface RestData {
  startTime: Date;
  duration: number; // minutes
  isOverRest: boolean;
}

export class TrayIntegrationService {
  private isElectronApp(): boolean {
    const isElectron = typeof window !== 'undefined' &&
           'vibeflow' in window &&
           window.vibeflow?.platform?.isElectron === true;
    return isElectron;
  }

  /**
   * Convert date value to Date object (handles string from API)
   */
  private toDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
  }

  /**
   * Update tray with pomodoro state
   * Formats time data before sending to tray
   */
  updatePomodoroState(pomodoro: PomodoroData | null): void {
    if (!this.isElectronApp()) return;

    if (pomodoro) {
      // Calculate remaining time
      const startTime = this.toDate(pomodoro.startTime);
      const elapsedMs = Date.now() - startTime.getTime();
      const totalMs = pomodoro.duration * 60 * 1000;
      const remainingMs = Math.max(0, totalMs - elapsedMs);
      const remainingSeconds = Math.ceil(remainingMs / 1000);

      // Format time using TimeFormatter
      const formattedTime = TimeFormatter.formatTime(remainingSeconds);

      // Get task title - handle both task object and direct title
      const taskTitle = pomodoro.task?.title || pomodoro.taskId || undefined;

      const trayState: Partial<TrayMenuState> = {
        pomodoroActive: true,
        pomodoroTimeRemaining: formattedTime,
        currentTask: taskTitle,
        systemState: 'FOCUS',
      };

      console.log('[TrayIntegration] Sending pomodoro state:', { formattedTime, taskTitle });
      this.sendTrayUpdate(trayState);
    } else {
      // No active pomodoro
      const trayState: Partial<TrayMenuState> = {
        pomodoroActive: false,
        pomodoroTimeRemaining: undefined,
        currentTask: undefined,
      };

      this.sendTrayUpdate(trayState);
    }
  }

  /**
   * Update tray with system state
   * Handles non-pomodoro states like PLANNING, LOCKED, etc.
   */
  updateSystemState(state: SystemState, restData?: RestData, dailyProgress?: string, isInSleepTime?: boolean, lastPomodoroEndTime?: Date | string | null): void {
    if (!this.isElectronApp()) return;

    const trayState: Partial<TrayMenuState> = {
      systemState: isInSleepTime ? 'READY' : this.mapSystemStateToTrayState(state, lastPomodoroEndTime),
      dailyProgress,
      isInSleepTime,
    };

    // Handle rest-specific data
    if (restData) {
      const restStartTime = this.toDate(restData.startTime);
      if (restData.isOverRest) {
        // Calculate over-rest duration
        const overRestMs = Date.now() - restStartTime.getTime();
        const overRestSeconds = Math.floor(overRestMs / 1000);
        trayState.overRestDuration = TimeFormatter.formatOverRestDuration(overRestSeconds);
        trayState.restTimeRemaining = undefined;
      } else {
        // Calculate remaining rest time
        const elapsedMs = Date.now() - restStartTime.getTime();
        const totalMs = restData.duration * 60 * 1000;
        const remainingMs = Math.max(0, totalMs - elapsedMs);
        const remainingSeconds = Math.ceil(remainingMs / 1000);
        trayState.restTimeRemaining = TimeFormatter.formatTime(remainingSeconds);
        trayState.overRestDuration = undefined;
      }
    } else {
      // Clear rest-related data
      trayState.restTimeRemaining = undefined;
      trayState.overRestDuration = undefined;
    }

    this.sendTrayUpdate(trayState);
  }

  /**
   * Update tray with user settings data
   * Updates enforcement mode, skip tokens, etc.
   */
  updateUserSettings(settings: {
    enforcementMode?: 'strict' | 'gentle';
    skipTokensRemaining?: number;
    isInDemoMode?: boolean;
  }): void {
    if (!this.isElectronApp()) return;

    const trayState: Partial<TrayMenuState> = {
      enforcementMode: settings.enforcementMode,
      skipTokensRemaining: settings.skipTokensRemaining,
      isInDemoMode: settings.isInDemoMode,
    };

    this.sendTrayUpdate(trayState);
  }

  /**
   * Handle pomodoro completion and update tray state
   * Requirements: 7.1-7.3, 7.8
   */
  handlePomodoroCompletion(data: {
    wasInOverRest: boolean;
    newState: SystemState;
    restData?: RestData;
    lastPomodoroEndTime?: Date | string | null;
  }): void {
    if (!this.isElectronApp()) return;

    // Clear pomodoro-related state
    const trayState: Partial<TrayMenuState> = {
      pomodoroActive: false,
      pomodoroTimeRemaining: undefined,
      currentTask: undefined,
      systemState: this.mapSystemStateToTrayState(data.newState, data.lastPomodoroEndTime),
    };

    // Handle rest or over-rest state
    if (data.restData) {
      const restStartTime = this.toDate(data.restData.startTime);
      if (data.restData.isOverRest || data.newState === 'over_rest') {
        // Calculate over-rest duration
        const overRestMs = Date.now() - restStartTime.getTime();
        const overRestSeconds = Math.floor(overRestMs / 1000);
        trayState.overRestDuration = TimeFormatter.formatOverRestDuration(overRestSeconds);
        trayState.restTimeRemaining = undefined;
      } else {
        // Calculate remaining rest time
        const elapsedMs = Date.now() - restStartTime.getTime();
        const totalMs = data.restData.duration * 60 * 1000;
        const remainingMs = Math.max(0, totalMs - elapsedMs);
        const remainingSeconds = Math.ceil(remainingMs / 1000);
        trayState.restTimeRemaining = TimeFormatter.formatTime(remainingSeconds);
        trayState.overRestDuration = undefined;
      }
    } else {
      // Clear rest-related data
      trayState.restTimeRemaining = undefined;
      trayState.overRestDuration = undefined;
    }

    // Send immediate update to tray (Requirements: 7.2, 7.8)
    this.sendTrayUpdate(trayState);
  }

  /**
   * Send a complete state update to tray
   * Used for initial sync or major state changes
   */
  syncCompleteState(data: {
    pomodoro?: PomodoroData | null;
    systemState: SystemState;
    restData?: RestData;
    lastPomodoroEndTime?: Date | string | null;
    settings?: {
      enforcementMode: 'strict' | 'gentle';
      skipTokensRemaining: number;
      isInDemoMode: boolean;
    };
  }): void {
    if (!this.isElectronApp()) return;

    const trayState: Partial<TrayMenuState> = {
      systemState: this.mapSystemStateToTrayState(data.systemState, data.lastPomodoroEndTime),
      enforcementMode: data.settings?.enforcementMode ?? 'strict',
      skipTokensRemaining: data.settings?.skipTokensRemaining ?? 0,
      isInDemoMode: data.settings?.isInDemoMode ?? false,
    };

    // Handle pomodoro data
    if (data.pomodoro) {
      const pomodoroStartTime = this.toDate(data.pomodoro.startTime);
      const elapsedMs = Date.now() - pomodoroStartTime.getTime();
      const totalMs = data.pomodoro.duration * 60 * 1000;
      const remainingMs = Math.max(0, totalMs - elapsedMs);
      const remainingSeconds = Math.ceil(remainingMs / 1000);

      trayState.pomodoroActive = true;
      trayState.pomodoroTimeRemaining = TimeFormatter.formatTime(remainingSeconds);
      trayState.currentTask = data.pomodoro.task?.title;
    } else {
      trayState.pomodoroActive = false;
      trayState.pomodoroTimeRemaining = undefined;
      trayState.currentTask = undefined;
    }

    // Handle rest data
    if (data.restData) {
      const restStartTime = this.toDate(data.restData.startTime);
      if (data.restData.isOverRest) {
        const overRestMs = Date.now() - restStartTime.getTime();
        const overRestSeconds = Math.floor(overRestMs / 1000);
        trayState.overRestDuration = TimeFormatter.formatOverRestDuration(overRestSeconds);
        trayState.restTimeRemaining = undefined;
      } else {
        const elapsedMs = Date.now() - restStartTime.getTime();
        const totalMs = data.restData.duration * 60 * 1000;
        const remainingMs = Math.max(0, totalMs - elapsedMs);
        const remainingSeconds = Math.ceil(remainingMs / 1000);
        trayState.restTimeRemaining = TimeFormatter.formatTime(remainingSeconds);
        trayState.overRestDuration = undefined;
      }
    }

    this.sendTrayUpdate(trayState);
  }

  /**
   * Handle edge cases like 0 seconds, very long durations
   */
  private handleEdgeCases(seconds: number): string {
    // Handle negative values (shouldn't happen but be safe)
    if (seconds < 0) {
      return '00:00';
    }

    // Handle very long durations (over 99:59)
    if (seconds >= 6000) { // 100 minutes
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const remainingSeconds = seconds % 60;
      
      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
      }
    }

    // Use standard MM:SS format
    return TimeFormatter.formatTime(seconds);
  }

  /**
   * Map system state to tray state format.
   * @param state System state from backend
   * @param lastPomodoroEndTime If present and within rest window, maps idle→RESTING
   */
  private mapSystemStateToTrayState(
    state: SystemState,
    lastPomodoroEndTime?: Date | string | null,
  ): TrayMenuState['systemState'] {
    switch (state) {
      case 'idle': {
        // If a pomodoro was recently completed, show RESTING
        if (lastPomodoroEndTime) {
          const endTime = lastPomodoroEndTime instanceof Date
            ? lastPomodoroEndTime.getTime()
            : new Date(lastPomodoroEndTime).getTime();
          const elapsedMinutes = (Date.now() - endTime) / 60000;
          // Consider "resting" if within the resting window of pomodoro completion
          if (elapsedMinutes < RESTING_WINDOW_MINUTES) {
            return 'RESTING';
          }
        }
        return 'READY';
      }
      case 'focus':
        return 'FOCUS';
      case 'over_rest':
        return 'OVER_REST';
      default:
        return 'READY';
    }
  }

  /**
   * Send update to tray via Electron IPC
   */
  private sendTrayUpdate(state: Partial<TrayMenuState>): void {
    try {
      if (window.vibeflow?.tray?.updateMenu) {
        window.vibeflow.tray.updateMenu(state);
      }
    } catch (error) {
      console.warn('Failed to update tray menu:', error);
    }
  }
}

// Export singleton instance
export const trayIntegrationService = new TrayIntegrationService();

export default trayIntegrationService;