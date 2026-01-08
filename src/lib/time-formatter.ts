/**
 * Time Formatting Utilities
 *
 * Utility functions for formatting time displays in the VibeFlow application.
 * Used for consistent time formatting across pomodoro countdowns, rest periods,
 * and over-rest duration displays.
 *
 * Requirements: 1.7, 8.7
 */

export class TimeFormatter {
  /**
   * Format seconds to MM:SS display format
   * Used for pomodoro and rest countdowns in tray display
   *
   * @param seconds Total seconds to format (non-negative)
   * @returns Formatted string like "25:00", "03:45", or "00:30"
   */
  static formatTime(seconds: number): string {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = safeSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  /**
   * Format duration for over-rest display
   * Used for showing how long the user has been in over-rest state
   *
   * @param seconds Total seconds of over-rest duration
   * @returns Formatted string like "15s", "5 min", or "2h 30m"
   */
  static formatOverRestDuration(seconds: number): string {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    
    if (safeSeconds < 60) {
      return `${safeSeconds}s`;
    } else if (safeSeconds < 3600) {
      const minutes = Math.floor(safeSeconds / 60);
      return `${minutes} min`;
    } else {
      const hours = Math.floor(safeSeconds / 3600);
      const minutes = Math.floor((safeSeconds % 3600) / 60);
      if (minutes === 0) {
        return `${hours}h`;
      }
      return `${hours}h ${minutes}m`;
    }
  }

  /**
   * Format duration for general use (human-readable)
   * Used for displaying durations in a more readable format
   *
   * @param seconds Total seconds to format
   * @returns Formatted string like "2 minutes", "1 hour 30 minutes", etc.
   */
  static formatDuration(seconds: number): string {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    
    if (safeSeconds < 60) {
      return safeSeconds === 1 ? '1 second' : `${safeSeconds} seconds`;
    } else if (safeSeconds < 3600) {
      const minutes = Math.floor(safeSeconds / 60);
      return minutes === 1 ? '1 minute' : `${minutes} minutes`;
    } else {
      const hours = Math.floor(safeSeconds / 3600);
      const minutes = Math.floor((safeSeconds % 3600) / 60);
      
      let result = hours === 1 ? '1 hour' : `${hours} hours`;
      if (minutes > 0) {
        result += minutes === 1 ? ' 1 minute' : ` ${minutes} minutes`;
      }
      return result;
    }
  }

  /**
   * Parse MM:SS format back to seconds
   * Utility function for testing and validation
   *
   * @param timeString Time string in MM:SS format
   * @returns Total seconds, or null if invalid format
   */
  static parseTime(timeString: string): number | null {
    const match = timeString.match(/^(\d+):(\d{2})$/);
    if (!match) {
      return null;
    }
    
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    
    if (seconds >= 60) {
      return null;
    }
    
    return minutes * 60 + seconds;
  }

  /**
   * Validate MM:SS format
   * Used to ensure time strings are properly formatted
   *
   * @param timeString Time string to validate
   * @returns true if valid MM:SS format
   */
  static isValidTimeFormat(timeString: string): boolean {
    return this.parseTime(timeString) !== null;
  }
}