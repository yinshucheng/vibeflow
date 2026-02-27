/**
 * Daily Reset Scheduler Service
 * 
 * Manages scheduled tasks that run at 04:00 AM daily, including:
 * - Entertainment quota reset (Requirements: 5.7)
 * - Daily state reset
 * 
 * This service uses a simple interval-based approach to check for reset time
 * and execute the necessary reset operations.
 */

import { entertainmentService } from './entertainment.service';
import { mcpEventService } from './mcp-event.service';

// ============================================================================
// Constants
// ============================================================================

const DAILY_RESET_HOUR = 4; // 04:00 AM
const CHECK_INTERVAL_MS = 60 * 1000; // Check every minute

// ============================================================================
// Types
// ============================================================================

interface SchedulerState {
  isRunning: boolean;
  lastResetDate: string | null;
  intervalId: ReturnType<typeof setInterval> | null;
}

// ============================================================================
// Scheduler State
// ============================================================================

const state: SchedulerState = {
  isRunning: false,
  lastResetDate: null,
  intervalId: null,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get today's date string in YYYY-MM-DD format
 * Accounts for 04:00 AM reset time
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
 * Check if it's time for daily reset
 */
function isResetTime(): boolean {
  const now = new Date();
  return now.getHours() === DAILY_RESET_HOUR && now.getMinutes() === 0;
}

/**
 * Check if reset has already been performed today
 */
function hasResetToday(): boolean {
  const todayString = getTodayDateString();
  return state.lastResetDate === todayString;
}

// ============================================================================
// Reset Operations
// ============================================================================

/**
 * Perform all daily reset operations
 * Requirements: 5.7
 */
async function performDailyReset(): Promise<void> {
  const todayString = getTodayDateString();
  
  // Skip if already reset today
  if (state.lastResetDate === todayString) {
    console.log('[DailyResetScheduler] Already reset today, skipping');
    return;
  }
  
  console.log('[DailyResetScheduler] Starting daily reset...');
  
  try {
    // Reset entertainment quotas (Requirements: 5.7)
    const entertainmentResult = await entertainmentService.resetDailyQuotas();
    if (entertainmentResult.success) {
      console.log(`[DailyResetScheduler] Entertainment reset: ended ${entertainmentResult.data?.endedSessions} sessions, reset ${entertainmentResult.data?.resetUsers} users`);
    } else {
      console.error('[DailyResetScheduler] Entertainment reset failed:', entertainmentResult.error);
    }
    
    // S4.2: Publish daily_state.daily_reset event
    mcpEventService.publish({
      type: 'daily_state.daily_reset',
      userId: 'system', // system-level event, not user-specific
      payload: { date: todayString },
    }).catch((err) => console.error('[MCP Event] daily_state.daily_reset publish error:', err));

    // Mark reset as complete for today
    state.lastResetDate = todayString;

    console.log('[DailyResetScheduler] Daily reset complete');
  } catch (error) {
    console.error('[DailyResetScheduler] Daily reset failed:', error);
  }
}

/**
 * Check if reset is needed and perform it
 */
async function checkAndPerformReset(): Promise<void> {
  // Check if it's reset time and we haven't reset today
  if (isResetTime() && !hasResetToday()) {
    await performDailyReset();
  }
}

// ============================================================================
// Scheduler Service
// ============================================================================

export const dailyResetSchedulerService = {
  /**
   * Start the daily reset scheduler
   * Should be called once during server startup
   */
  start(): void {
    if (state.isRunning) {
      console.log('[DailyResetScheduler] Scheduler already running');
      return;
    }
    
    console.log('[DailyResetScheduler] Starting scheduler...');
    
    // Check immediately on startup in case we missed a reset
    const now = new Date();
    const todayString = getTodayDateString();
    
    // If it's past reset time and we haven't reset today, do it now
    if (now.getHours() >= DAILY_RESET_HOUR && !hasResetToday()) {
      console.log('[DailyResetScheduler] Missed reset time, performing reset now');
      performDailyReset().catch(console.error);
    }
    
    // Start the interval checker
    state.intervalId = setInterval(() => {
      checkAndPerformReset().catch(console.error);
    }, CHECK_INTERVAL_MS);
    
    state.isRunning = true;
    
    const nextReset = entertainmentService.getNextResetTime();
    console.log(`[DailyResetScheduler] Scheduler started. Next reset at ${nextReset.toISOString()}`);
  },
  
  /**
   * Stop the daily reset scheduler
   */
  stop(): void {
    if (!state.isRunning) {
      console.log('[DailyResetScheduler] Scheduler not running');
      return;
    }
    
    if (state.intervalId) {
      clearInterval(state.intervalId);
      state.intervalId = null;
    }
    
    state.isRunning = false;
    console.log('[DailyResetScheduler] Scheduler stopped');
  },
  
  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return state.isRunning;
  },
  
  /**
   * Get the last reset date
   */
  getLastResetDate(): string | null {
    return state.lastResetDate;
  },
  
  /**
   * Manually trigger a reset (for testing or admin purposes)
   */
  async triggerReset(): Promise<{ success: boolean; message: string }> {
    try {
      await performDailyReset();
      return { success: true, message: 'Daily reset completed successfully' };
    } catch (error) {
      return { 
        success: false, 
        message: error instanceof Error ? error.message : 'Reset failed' 
      };
    }
  },
  
  /**
   * Get scheduler status
   */
  getStatus(): {
    isRunning: boolean;
    lastResetDate: string | null;
    nextResetTime: string;
    millisecondsUntilReset: number;
  } {
    return {
      isRunning: state.isRunning,
      lastResetDate: state.lastResetDate,
      nextResetTime: entertainmentService.getNextResetTime().toISOString(),
      millisecondsUntilReset: entertainmentService.getMillisecondsUntilReset(),
    };
  },
};

export default dailyResetSchedulerService;
