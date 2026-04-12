/**
 * Progress Calculation Service
 * 
 * Calculates daily progress, pressure indicators, and predictions for the dashboard.
 * 
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 17.1, 17.2, 17.3, 17.4, 19.1-19.7, 22.1-22.4
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';
import { focusSessionService } from './focus-session.service';
import { sleepTimeService, parseTimeToMinutes, getCurrentTimeMinutes } from './sleep-time.service';
import { isWithinWorkHours, parseTimeToMinutes as parseIdleTimeToMinutes } from './idle.service';
import { calculateEstimatedPomodoros } from './task.service';
import type { WorkTimeSlot } from './user.service';

// Service result type
export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

// Time context types (Requirements: 15.4)
export type TimeContext = 'work_time' | 'adhoc_focus' | 'sleep_time' | 'free_time';

// Expected state types (Requirements: 15.1, 15.2, 15.3)
export type ExpectedState = 'in_pomodoro' | 'normal_rest' | 'over_rest';

// Pressure level types (Requirements: 19.1-19.7)
export type PressureLevel = 'on_track' | 'moderate' | 'high' | 'critical';

// Current status interface (Requirements: 15.1-15.5)
export interface CurrentStatus {
  timeContext: TimeContext;
  expectedState: ExpectedState;
  overRestMinutes?: number;
  focusSessionRemaining?: number;
  sleepTimeRemaining?: number;
}

// Daily progress interface (Requirements: 17.1-17.4, 19.1-19.7)
export interface DailyProgress {
  completedPomodoros: number;
  targetPomodoros: number;
  completionPercentage: number;
  remainingPomodoros: number;
  
  // Time calculations (Requirements: 18.1-18.6)
  remainingWorkMinutes: number;
  maxPossiblePomodoros: number;
  requiredPace: string;
  
  // Pressure indicator (Requirements: 19.1-19.7)
  pressureLevel: PressureLevel;
  pressureMessage: string;
  
  // Goal at risk (Requirements: 19.1.1-19.1.7)
  isGoalAtRisk: boolean;
  additionalMinutesNeeded: number;
  suggestedGoalReduction: number;
}

// Task suggestion interface (Requirements: 22.1, 22.2, 22.3, 22.4)
export interface TaskSuggestion {
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectTitle: string;
  estimatedMinutes: number | null;
  estimatedPomodoros: number | null;
  priority: string;
  planDate: Date | null;
  reason: string;
}

// Pressure level messages (Requirements: 19.3-19.6)
const PRESSURE_MESSAGES: Record<PressureLevel, string> = {
  on_track: 'Plenty of time',
  moderate: 'Stay focused',
  high: 'Pick up the pace',
  critical: 'Goal at risk',
};

// Daily reset hour (same as daily-state.service.ts)
const DAILY_RESET_HOUR = 4;

/**
 * Get today's date normalized to midnight
 * Accounts for the 04:00 AM reset time
 */
function getTodayDate(): Date {
  const now = new Date();
  const today = new Date(now);
  
  if (now.getHours() < DAILY_RESET_HOUR) {
    today.setDate(today.getDate() - 1);
  }
  
  today.setHours(0, 0, 0, 0);
  return today;
}


/**
 * Calculate remaining work minutes for today based on work time slots
 * Requirements: 18.1
 */
function calculateRemainingWorkMinutes(workTimeSlots: WorkTimeSlot[]): number {
  const now = new Date();
  const currentMinutes = getCurrentTimeMinutes();
  let remainingMinutes = 0;
  
  for (const slot of workTimeSlots) {
    if (!slot.enabled) continue;
    
    const startMinutes = parseIdleTimeToMinutes(slot.startTime);
    const endMinutes = parseIdleTimeToMinutes(slot.endTime);
    
    if (currentMinutes < startMinutes) {
      // Slot hasn't started yet - count full duration
      remainingMinutes += endMinutes - startMinutes;
    } else if (currentMinutes < endMinutes) {
      // Currently in this slot - count remaining time
      remainingMinutes += endMinutes - currentMinutes;
    }
    // If currentMinutes >= endMinutes, slot has passed - don't count
  }
  
  return remainingMinutes;
}

/**
 * Calculate maximum possible pomodoros given remaining time
 * Requirements: 18.2
 */
function calculateMaxPossiblePomodoros(
  remainingMinutes: number,
  pomodoroDuration: number,
  shortRestDuration: number
): number {
  if (remainingMinutes <= 0) return 0;
  
  // Each pomodoro cycle = pomodoro + rest (except last one doesn't need rest)
  const cycleTime = pomodoroDuration + shortRestDuration;
  
  // Calculate how many full cycles fit
  const fullCycles = Math.floor(remainingMinutes / cycleTime);
  
  // Check if there's enough time for one more pomodoro without rest
  const remainingAfterCycles = remainingMinutes - (fullCycles * cycleTime);
  const extraPomodoro = remainingAfterCycles >= pomodoroDuration ? 1 : 0;
  
  return fullCycles + extraPomodoro;
}

/**
 * Calculate required pace to meet goal
 * Requirements: 18.5
 */
function calculateRequiredPace(
  remainingPomodoros: number,
  remainingMinutes: number
): string {
  if (remainingPomodoros <= 0) {
    return 'Goal achieved!';
  }
  
  if (remainingMinutes <= 0) {
    return 'No work time remaining';
  }
  
  const minutesPerPomodoro = Math.round(remainingMinutes / remainingPomodoros);
  
  if (minutesPerPomodoro < 30) {
    return `Need 1 pomodoro every ${minutesPerPomodoro} minutes`;
  } else if (minutesPerPomodoro < 60) {
    return `Need 1 pomodoro every ${minutesPerPomodoro} minutes`;
  } else {
    const hours = Math.floor(minutesPerPomodoro / 60);
    const mins = minutesPerPomodoro % 60;
    if (mins === 0) {
      return `Need 1 pomodoro every ${hours} hour${hours > 1 ? 's' : ''}`;
    }
    return `Need 1 pomodoro every ${hours}h ${mins}m`;
  }
}


/**
 * Calculate pressure level based on progress
 * Requirements: 19.1-19.7
 * 
 * Property 7: Pressure Level Calculation Consistency
 * - If remainingPomodoros <= 0, pressureLevel must be 'on_track'
 * - If remainingPomodoros > maxPossiblePomodoros, pressureLevel must be 'critical'
 * - pressureLevel must be monotonically increasing as the ratio increases
 */
export function calculatePressureLevel(
  remainingPomodoros: number,
  maxPossiblePomodoros: number,
  completionPercentage: number
): PressureLevel {
  // Already completed goal
  if (remainingPomodoros <= 0) {
    return 'on_track';
  }
  
  // Impossible to complete
  if (maxPossiblePomodoros <= 0 || remainingPomodoros > maxPossiblePomodoros) {
    return 'critical';
  }
  
  // Calculate pressure ratio (how much of remaining capacity is needed)
  const pressureRatio = remainingPomodoros / maxPossiblePomodoros;
  
  // Thresholds for pressure levels
  // on_track: using less than 50% of remaining capacity
  // moderate: using 50-75% of remaining capacity
  // high: using 75-100% of remaining capacity
  // critical: need more than available capacity
  
  if (pressureRatio <= 0.5) {
    return 'on_track';
  } else if (pressureRatio <= 0.75) {
    return 'moderate';
  } else if (pressureRatio <= 1.0) {
    return 'high';
  } else {
    return 'critical';
  }
}

/**
 * Get pressure message for a given level
 * Requirements: 19.3-19.6
 */
export function getPressureMessage(level: PressureLevel): string {
  return PRESSURE_MESSAGES[level];
}


export const progressCalculationService = {
  /**
   * Get current status (time context and expected state)
   * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5
   */
  async getCurrentStatus(userId: string): Promise<ServiceResult<CurrentStatus>> {
    try {
      // Get user settings for work time slots and rest duration
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
      });
      
      const workTimeSlots = (settings?.workTimeSlots as unknown as WorkTimeSlot[]) || [];
      const shortRestDuration = settings?.shortRestDuration ?? 5;
      const overRestGracePeriod = settings?.overRestGracePeriod ?? 5;
      
      // Check if in ad-hoc focus session
      const focusSessionResult = await focusSessionService.getActiveSession(userId);
      const activeFocusSession = focusSessionResult.success ? focusSessionResult.data : null;
      
      // Check if in sleep time
      const sleepTimeResult = await sleepTimeService.isInSleepTime(userId);
      const isInSleepTime = sleepTimeResult.success && sleepTimeResult.data === true;
      
      // Check if within work hours
      const withinWorkHours = isWithinWorkHours(workTimeSlots);
      
      // Determine time context (Requirements: 15.4)
      let timeContext: TimeContext;
      if (activeFocusSession) {
        timeContext = 'adhoc_focus';
      } else if (isInSleepTime) {
        timeContext = 'sleep_time';
      } else if (withinWorkHours) {
        timeContext = 'work_time';
      } else {
        timeContext = 'free_time';
      }
      
      // Get current pomodoro state
      const currentPomodoro = await prisma.pomodoro.findFirst({
        where: {
          userId,
          status: 'IN_PROGRESS',
        },
      });
      
      // Determine expected state (Requirements: 15.1, 15.2, 15.3)
      let expectedState: ExpectedState;
      let overRestMinutes: number | undefined;
      
      if (currentPomodoro) {
        expectedState = 'in_pomodoro';
      } else if (timeContext === 'work_time' || timeContext === 'adhoc_focus') {
        // Check last completed pomodoro to determine rest state
        const lastPomodoro = await prisma.pomodoro.findFirst({
          where: {
            userId,
            status: 'COMPLETED',
          },
          orderBy: {
            endTime: 'desc',
          },
        });
        
        if (lastPomodoro?.endTime) {
          const restDurationMs = Date.now() - lastPomodoro.endTime.getTime();
          const restDurationMinutes = Math.floor(restDurationMs / 1000 / 60);
          const totalRestAllowed = shortRestDuration + overRestGracePeriod;
          
          if (restDurationMinutes > totalRestAllowed) {
            expectedState = 'over_rest';
            overRestMinutes = restDurationMinutes - shortRestDuration;
          } else {
            expectedState = 'normal_rest';
          }
        } else {
          // No completed pomodoro - check how long work time has been active
          // If work time started more than grace period ago, user is over rest
          const currentMinutes = getCurrentTimeMinutes();
          let workStartMinutes: number | null = null;
          
          // Find the current active work slot
          for (const slot of workTimeSlots) {
            if (!slot.enabled) continue;
            const startMinutes = parseIdleTimeToMinutes(slot.startTime);
            const endMinutes = parseIdleTimeToMinutes(slot.endTime);
            
            if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
              workStartMinutes = startMinutes;
              break;
            }
          }
          
          // For ad-hoc focus session, use session start time
          if (timeContext === 'adhoc_focus' && activeFocusSession) {
            const sessionStartMs = activeFocusSession.startTime.getTime();
            const sessionStartDate = new Date(sessionStartMs);
            workStartMinutes = sessionStartDate.getHours() * 60 + sessionStartDate.getMinutes();
          }
          
          if (workStartMinutes !== null) {
            const minutesSinceWorkStart = currentMinutes - workStartMinutes;
            const totalRestAllowed = shortRestDuration + overRestGracePeriod;
            
            if (minutesSinceWorkStart > totalRestAllowed) {
              expectedState = 'over_rest';
              overRestMinutes = minutesSinceWorkStart - shortRestDuration;
            } else {
              expectedState = 'normal_rest';
            }
          } else {
            expectedState = 'normal_rest';
          }
        }
      } else {
        // Outside work time - default to normal rest
        expectedState = 'normal_rest';
      }
      
      // Calculate remaining times
      let focusSessionRemaining: number | undefined;
      let sleepTimeRemaining: number | undefined;
      
      if (activeFocusSession) {
        const remainingMs = activeFocusSession.plannedEndTime.getTime() - Date.now();
        focusSessionRemaining = Math.max(0, Math.floor(remainingMs / 1000 / 60));
      }
      
      if (isInSleepTime) {
        const sleepConfig = await sleepTimeService.getConfig(userId);
        if (sleepConfig.success && sleepConfig.data) {
          const endMinutes = parseTimeToMinutes(sleepConfig.data.endTime);
          const currentMinutes = getCurrentTimeMinutes();
          
          if (currentMinutes < endMinutes) {
            sleepTimeRemaining = endMinutes - currentMinutes;
          } else {
            // Overnight - calculate remaining until end time tomorrow
            sleepTimeRemaining = (24 * 60 - currentMinutes) + endMinutes;
          }
        }
      }
      
      return {
        success: true,
        data: {
          timeContext,
          expectedState,
          overRestMinutes,
          focusSessionRemaining,
          sleepTimeRemaining,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get current status',
        },
      };
    }
  },


  /**
   * Get daily progress with predictions
   * Requirements: 17.1, 17.2, 17.3, 17.4, 18.1-18.6, 19.1-19.7
   */
  async getDailyProgress(userId: string): Promise<ServiceResult<DailyProgress>> {
    try {
      const today = getTodayDate();
      
      // Get user settings
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
      });
      
      const pomodoroDuration = settings?.pomodoroDuration ?? 25;
      const shortRestDuration = settings?.shortRestDuration ?? 5;
      const workTimeSlots = (settings?.workTimeSlots as unknown as WorkTimeSlot[]) || [];
      const defaultTarget = settings?.expectedPomodoroCount ?? 8;
      
      // Get today's daily state for adjusted goal
      const dailyState = await prisma.dailyState.findUnique({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
      });
      
      // Use adjusted goal if set, otherwise use default (Requirements: 23.1-23.5)
      const targetPomodoros = dailyState?.adjustedGoal ?? defaultTarget;
      
      // Get completed pomodoros for today (Requirements: 17.1)
      const completedPomodoros = await prisma.pomodoro.count({
        where: {
          userId,
          status: 'COMPLETED',
          createdAt: {
            gte: today,
          },
        },
      });
      
      // Calculate progress (Requirements: 17.2, 17.3)
      const completionPercentage = targetPomodoros > 0 
        ? Math.min(100, Math.round((completedPomodoros / targetPomodoros) * 100))
        : 100;
      const remainingPomodoros = Math.max(0, targetPomodoros - completedPomodoros);
      
      // Calculate remaining work time (Requirements: 18.1)
      const remainingWorkMinutes = calculateRemainingWorkMinutes(workTimeSlots);
      
      // Calculate max possible pomodoros (Requirements: 18.2, 18.3)
      const maxPossiblePomodoros = calculateMaxPossiblePomodoros(
        remainingWorkMinutes,
        pomodoroDuration,
        shortRestDuration
      );
      
      // Calculate required pace (Requirements: 18.5)
      const requiredPace = calculateRequiredPace(remainingPomodoros, remainingWorkMinutes);
      
      // Calculate pressure level (Requirements: 19.1-19.7)
      const pressureLevel = calculatePressureLevel(
        remainingPomodoros,
        maxPossiblePomodoros,
        completionPercentage
      );
      const pressureMessage = getPressureMessage(pressureLevel);
      
      // Calculate goal risk suggestions (Requirements: 19.1.1-19.1.7)
      const isGoalAtRisk = pressureLevel === 'high' || pressureLevel === 'critical';
      
      // Calculate additional time needed (Requirements: 19.1.2)
      let additionalMinutesNeeded = 0;
      if (remainingPomodoros > maxPossiblePomodoros) {
        const shortfall = remainingPomodoros - maxPossiblePomodoros;
        additionalMinutesNeeded = shortfall * (pomodoroDuration + shortRestDuration);
      }
      
      // Calculate suggested goal reduction (Requirements: 19.1.4)
      let suggestedGoalReduction = 0;
      if (remainingPomodoros > maxPossiblePomodoros) {
        suggestedGoalReduction = remainingPomodoros - maxPossiblePomodoros;
      }
      
      return {
        success: true,
        data: {
          completedPomodoros,
          targetPomodoros,
          completionPercentage,
          remainingPomodoros,
          remainingWorkMinutes,
          maxPossiblePomodoros,
          requiredPace,
          pressureLevel,
          pressureMessage,
          isGoalAtRisk,
          additionalMinutesNeeded,
          suggestedGoalReduction,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get daily progress',
        },
      };
    }
  },


  /**
   * Adjust today's goal temporarily
   * Requirements: 23.1, 23.2, 23.3, 23.4, 23.5
   * 
   * Property 9: Today's Goal Adjustment Isolation
   * - Adjustment only affects DailyState.adjustedGoal
   * - Does NOT modify UserSettings.expectedPomodoroCount
   */
  async adjustTodayGoal(userId: string, newTarget: number): Promise<ServiceResult<void>> {
    try {
      // Validate new target
      if (newTarget < 0 || newTarget > 50) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Goal must be between 0 and 50 pomodoros',
          },
        };
      }
      
      const today = getTodayDate();
      
      // Update only DailyState.adjustedGoal (Requirements: 23.3)
      await prisma.dailyState.upsert({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
        update: {
          adjustedGoal: newTarget,
        },
        create: {
          userId,
          date: today,
          systemState: 'IDLE',
          top3TaskIds: [],
          pomodoroCount: 0,
          capOverrideCount: 0,
          airlockCompleted: false,
          adjustedGoal: newTarget,
        },
      });
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to adjust today\'s goal',
        },
      };
    }
  },

  /**
   * Get goal risk suggestions
   * Requirements: 19.1.1-19.1.7
   */
  async getGoalRiskSuggestions(userId: string): Promise<ServiceResult<{
    additionalMinutesNeeded: number;
    suggestedGoalReduction: number;
    suggestedFocusSessionDuration: number;
    tradeOffMessage: string;
    canMeetGoal: boolean;
  }>> {
    try {
      const progressResult = await this.getDailyProgress(userId);
      if (!progressResult.success || !progressResult.data) {
        return {
          success: false,
          error: progressResult.error,
        };
      }
      
      const progress = progressResult.data;
      
      // Get user settings for pomodoro duration
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
      });
      const pomodoroDuration = settings?.pomodoroDuration ?? 25;
      const shortRestDuration = settings?.shortRestDuration ?? 5;
      
      // Calculate suggested focus session duration (Requirements: 19.1.3)
      // Round up to nearest 15 minutes, min 30 minutes
      let suggestedFocusSessionDuration = Math.max(
        30,
        Math.ceil(progress.additionalMinutesNeeded / 15) * 15
      );
      // Cap at 4 hours (max focus session duration)
      suggestedFocusSessionDuration = Math.min(240, suggestedFocusSessionDuration);
      
      // Generate trade-off message (Requirements: 19.1.6)
      let tradeOffMessage = '';
      if (progress.additionalMinutesNeeded > 0 && progress.suggestedGoalReduction > 0) {
        const hours = Math.floor(progress.additionalMinutesNeeded / 60);
        const mins = progress.additionalMinutesNeeded % 60;
        const timeStr = hours > 0 
          ? `${hours}h ${mins}m` 
          : `${mins} minutes`;
        tradeOffMessage = `Add ${timeStr} of work time OR reduce goal by ${progress.suggestedGoalReduction} pomodoro${progress.suggestedGoalReduction > 1 ? 's' : ''}`;
      }
      
      // Check if goal can be met even with maximum effort (Requirements: 19.1.7)
      const canMeetGoal = progress.remainingPomodoros <= progress.maxPossiblePomodoros;
      
      return {
        success: true,
        data: {
          additionalMinutesNeeded: progress.additionalMinutesNeeded,
          suggestedGoalReduction: progress.suggestedGoalReduction,
          suggestedFocusSessionDuration,
          tradeOffMessage,
          canMeetGoal,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get goal risk suggestions',
        },
      };
    }
  },

  /**
   * Check if today's goal differs from default
   * Requirements: 23.4
   */
  async isTodayGoalAdjusted(userId: string): Promise<ServiceResult<{
    isAdjusted: boolean;
    adjustedGoal: number | null;
    defaultGoal: number;
  }>> {
    try {
      const today = getTodayDate();
      
      // Get default goal from settings
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
      });
      const defaultGoal = settings?.expectedPomodoroCount ?? 8;
      
      // Get today's daily state
      const dailyState = await prisma.dailyState.findUnique({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
      });
      
      const adjustedGoal = dailyState?.adjustedGoal ?? null;
      const isAdjusted = adjustedGoal !== null && adjustedGoal !== defaultGoal;
      
      return {
        success: true,
        data: {
          isAdjusted,
          adjustedGoal,
          defaultGoal,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to check goal adjustment',
        },
      };
    }
  },

  /**
   * Reset today's goal to default
   * Requirements: 23.5
   */
  async resetTodayGoal(userId: string): Promise<ServiceResult<void>> {
    try {
      const today = getTodayDate();
      
      await prisma.dailyState.updateMany({
        where: {
          userId,
          date: today,
        },
        data: {
          adjustedGoal: null,
        },
      });
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to reset today\'s goal',
        },
      };
    }
  },

  /**
   * Get task suggestions for today based on remaining work time
   * Requirements: 22.1, 22.2, 22.3, 22.4
   * 
   * Filters tasks by remaining time and sorts by priority and plan date.
   */
  async getTaskSuggestions(userId: string, maxSuggestions: number = 3): Promise<ServiceResult<TaskSuggestion[]>> {
    try {
      // Get user settings for pomodoro duration
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
      });
      const pomodoroDuration = settings?.pomodoroDuration ?? 25;
      const shortRestDuration = settings?.shortRestDuration ?? 5;
      const workTimeSlots = (settings?.workTimeSlots as unknown as WorkTimeSlot[]) || [];

      // Calculate remaining work time (Requirements: 22.1)
      const remainingWorkMinutes = calculateRemainingWorkMinutes(workTimeSlots);

      // Get today's date for filtering
      const today = getTodayDate();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Get incomplete tasks planned for today or with no plan date
      // Requirements: 22.2 - prioritize by priority (P1 > P2 > P3), plan date (today first)
      const tasks = await prisma.task.findMany({
        where: {
          userId,
          status: { not: 'DONE' },
          OR: [
            // Tasks planned for today
            {
              planDate: {
                gte: today,
                lt: tomorrow,
              },
            },
            // Tasks with no plan date (backlog)
            { planDate: null },
          ],
        },
        include: {
          project: {
            select: {
              id: true,
              title: true,
            },
          },
        },
        orderBy: [
          { priority: 'asc' }, // P1 < P2 < P3 in enum order
          { planDate: 'asc' }, // Today's tasks first (null comes after)
          { sortOrder: 'asc' },
        ],
      });

      const suggestions: TaskSuggestion[] = [];

      for (const task of tasks) {
        if (suggestions.length >= maxSuggestions) break;

        const estimatedMinutes = task.estimatedMinutes;
        const estimatedPomodoros = calculateEstimatedPomodoros(estimatedMinutes, pomodoroDuration);

        // Determine reason for suggestion
        let reason = '';
        const isPlannedForToday = task.planDate && task.planDate >= today && task.planDate < tomorrow;

        // Check if task fits within remaining time (Requirements: 22.4)
        const taskFitsInTime = estimatedMinutes == null || estimatedMinutes <= remainingWorkMinutes;

        if (task.priority === 'P1') {
          reason = 'High priority task';
        } else if (isPlannedForToday) {
          reason = 'Planned for today';
        } else if (estimatedMinutes && taskFitsInTime) {
          reason = `Fits in remaining time (${estimatedMinutes} min)`;
        } else if (estimatedMinutes && !taskFitsInTime) {
          // Requirements: 22.4 - indicate task may need to be split or deferred
          reason = `May need to split or defer (${estimatedMinutes} min estimated, ${remainingWorkMinutes} min remaining)`;
        } else {
          reason = 'Available task';
        }

        suggestions.push({
          taskId: task.id,
          taskTitle: task.title,
          projectId: task.project.id,
          projectTitle: task.project.title,
          estimatedMinutes,
          estimatedPomodoros,
          priority: task.priority,
          planDate: task.planDate,
          reason,
        });
      }

      return { success: true, data: suggestions };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get task suggestions',
        },
      };
    }
  },

  // Export helper functions for testing
  calculatePressureLevel,
  getPressureMessage,
};

export default progressCalculationService;
