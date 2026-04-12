/**
 * Pomodoro Scheduler Service
 * 
 * Handles automatic completion of expired pomodoro sessions
 * and state transitions for all users.
 */

import { pomodoroService } from './pomodoro.service';
import { socketServer } from '@/server/socket';
import prisma from '@/lib/prisma';

class PomodoroSchedulerService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly CHECK_INTERVAL = 30000; // Check every 30 seconds

  /**
   * Start the scheduler to check for expired pomodoros
   */
  start(): void {
    if (this.intervalId) {
      console.warn('Pomodoro scheduler is already running');
      return;
    }

    console.log('Starting pomodoro scheduler...');
    this.intervalId = setInterval(() => {
      this.checkExpiredPomodoros().catch(error => {
        console.error('Error in pomodoro scheduler:', error);
      });
    }, this.CHECK_INTERVAL);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Pomodoro scheduler stopped');
    }
  }

  /**
   * Check for expired pomodoros across all users and complete them
   */
  private async checkExpiredPomodoros(): Promise<void> {
    try {
      // Get all users with in-progress pomodoros
      const usersWithActivePomodoros = await prisma.pomodoro.findMany({
        where: {
          status: 'IN_PROGRESS',
        },
        select: {
          userId: true,
        },
        distinct: ['userId'],
      });

      for (const { userId } of usersWithActivePomodoros) {
        try {
          const result = await pomodoroService.completeExpiredPomodoros(userId);
          
          if (result.success && result.data && result.data > 0) {
            console.log(`Auto-completed ${result.data} expired pomodoro(s) for user ${userId}`);

            // StateEngine (called inside completeExpiredPomodoros) already handles
            // broadcastFullState + broadcastPolicyUpdate. Only send Browser Sentinel
            // command here as it's not managed by StateEngine.
            socketServer.sendExecuteCommand(userId, {
              action: 'POMODORO_COMPLETE',
              params: { autoCompleted: true },
            });
          }
        } catch (error) {
          console.error(`Failed to check expired pomodoros for user ${userId}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to check expired pomodoros:', error);
    }
  }

  /**
   * Manually trigger a check for expired pomodoros (for testing)
   */
  async triggerCheck(): Promise<void> {
    await this.checkExpiredPomodoros();
  }

  /**
   * Get scheduler status
   */
  isRunning(): boolean {
    return this.intervalId !== null;
  }
}

// Export singleton instance
export const pomodoroSchedulerService = new PomodoroSchedulerService();