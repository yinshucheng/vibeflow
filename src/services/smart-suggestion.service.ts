/**
 * Smart Suggestion Service
 * 
 * Provides intelligent task suggestions based on priority, deadline proximity,
 * goal alignment, and historical productivity patterns.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.5, 9.1, 9.2, 9.3, 9.4, 9.5
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';
import { calculateEstimatedPomodoros } from './task.service';
import { efficiencyAnalysisService } from './efficiency-analysis.service';
import type { WorkTimeSlot } from './user.service';
import { isWithinWorkHours } from './idle.service';

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

// Task suggestion interface (Requirements: 3.1, 3.2, 9.2)
export interface TaskSuggestion {
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectTitle: string;
  priority: string;
  reason: string;                    // Suggestion reason (Requirement 9.2)
  estimatedPomodoros: number | null;
  deadlineProximity: 'urgent' | 'soon' | 'normal' | 'none';
  goalAlignment: number;             // 0-1 alignment with goals
  score: number;                     // Internal scoring for ranking
}

// Suggestion context interface
export interface SuggestionContext {
  trigger: 'pomodoro_complete' | 'idle_detected' | 'daily_planning' | 'manual';
  currentState: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening';
  dayOfWeek: number;
}

// Airlock suggestions result interface (Requirements: 9.1, 9.3, 9.4)
export interface AirlockSuggestionsResult {
  suggestions: TaskSuggestion[];
  workloadWarning: string | null;    // Requirement 9.4
  dayOfWeekPattern: string;          // Requirement 9.3
}

// Validation schemas
export const RecordSuggestionFeedbackSchema = z.object({
  suggestionId: z.string().min(1),
  taskId: z.string().uuid().optional(),
  action: z.enum(['accepted', 'dismissed', 'modified']),
  context: z.object({
    trigger: z.enum(['pomodoro_complete', 'idle_detected', 'daily_planning', 'manual']),
  }).optional(),
});

export type RecordSuggestionFeedbackInput = z.infer<typeof RecordSuggestionFeedbackSchema>;

// Daily reset hour (same as other services)
const DAILY_RESET_HOUR = 4;

// Priority weights for scoring (Requirement 3.2)
const PRIORITY_WEIGHTS: Record<string, number> = {
  P1: 100,
  P2: 60,
  P3: 30,
};

// Deadline proximity weights (Requirement 3.2)
const DEADLINE_WEIGHTS = {
  urgent: 150,   // Overdue
  soon: 100,     // Today
  normal: 50,    // Within 3 days
  none: 0,       // No deadline or far away
};

// Day names for pattern messages
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
 * Get time of day based on current hour
 */
function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/**
 * Calculate days between two dates
 */
function daysBetween(date1: Date, date2: Date): number {
  const oneDay = 24 * 60 * 60 * 1000;
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);
  return Math.round((d2.getTime() - d1.getTime()) / oneDay);
}

/**
 * Determine deadline proximity category
 */
function getDeadlineProximity(planDate: Date | null): 'urgent' | 'soon' | 'normal' | 'none' {
  if (!planDate) return 'none';
  
  const today = getTodayDate();
  const daysUntilDue = daysBetween(today, planDate);
  
  if (daysUntilDue < 0) return 'urgent';  // Overdue
  if (daysUntilDue === 0) return 'soon';  // Today
  if (daysUntilDue <= 3) return 'normal'; // Within 3 days
  return 'none';
}

/**
 * Calculate goal alignment score for a task
 * Returns 0-1 based on whether the task's project is linked to active goals
 */
async function calculateGoalAlignment(projectId: string, userId?: string): Promise<number> {
  const projectGoals = await prisma.projectGoal.findMany({
    where: {
      projectId,
      ...(userId ? { goal: { userId } } : {}),
    },
    include: {
      goal: {
        select: { status: true },
      },
    },
  });
  
  // Count active goals linked to this project
  const activeGoals = projectGoals.filter(pg => pg.goal.status === 'ACTIVE');
  
  if (activeGoals.length === 0) return 0;
  if (activeGoals.length === 1) return 0.5;
  return 1.0; // Multiple active goals = high alignment
}

/**
 * Generate suggestion reason based on task properties (Requirement 9.2)
 */
function generateSuggestionReason(
  task: { priority: string; planDate: Date | null },
  deadlineProximity: 'urgent' | 'soon' | 'normal' | 'none',
  goalAlignment: number,
  isTop3: boolean
): string {
  const reasons: string[] = [];
  
  if (isTop3) {
    reasons.push('Selected as Top 3 priority');
  }
  
  if (deadlineProximity === 'urgent') {
    reasons.push('Overdue - needs immediate attention');
  } else if (deadlineProximity === 'soon') {
    reasons.push('Due today');
  } else if (deadlineProximity === 'normal') {
    reasons.push('Due within 3 days');
  }
  
  if (task.priority === 'P1') {
    reasons.push('High priority');
  }
  
  if (goalAlignment >= 0.5) {
    reasons.push('Aligned with active goals');
  }
  
  if (reasons.length === 0) {
    return 'Available task';
  }
  
  return reasons.join(' • ');
}

/**
 * Calculate comprehensive suggestion score (Requirements: 3.2, 9.3)
 */
function calculateSuggestionScore(
  task: { priority: string; planDate: Date | null },
  goalAlignment: number,
  isTop3: boolean,
  dayOfWeekBonus: number = 0
): number {
  let score = 0;
  
  // Priority weight (Requirement 3.2)
  score += PRIORITY_WEIGHTS[task.priority] || 30;
  
  // Deadline weight (Requirement 3.2)
  const deadlineProximity = getDeadlineProximity(task.planDate);
  score += DEADLINE_WEIGHTS[deadlineProximity];
  
  // Goal alignment weight (Requirement 3.2)
  score += goalAlignment * 40;
  
  // Top 3 bonus
  if (isTop3) {
    score += 200;
  }
  
  // Day of week pattern bonus (Requirement 9.3)
  score += dayOfWeekBonus;
  
  return score;
}



export const smartSuggestionService = {
  /**
   * Get next task suggestions (Requirements: 3.1, 3.2)
   * Considers priority, deadline proximity, and goal alignment
   */
  async getNextTaskSuggestion(
    userId: string,
    context: SuggestionContext,
    maxSuggestions: number = 5
  ): Promise<ServiceResult<TaskSuggestion[]>> {
    try {
      const today = getTodayDate();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      // Get user settings for pomodoro duration
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
      });
      const pomodoroDuration = settings?.pomodoroDuration ?? 25;
      
      // Get today's daily state for Top 3 tasks
      const dailyState = await prisma.dailyState.findUnique({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
      });
      const top3TaskIds = dailyState?.top3TaskIds ?? [];
      
      // Get incomplete tasks
      const tasks = await prisma.task.findMany({
        where: {
          userId,
          status: { not: 'DONE' },
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
          { priority: 'asc' },
          { planDate: 'asc' },
          { sortOrder: 'asc' },
        ],
      });
      
      // Get historical day of week pattern for bonus scoring (Requirement 9.3)
      const analysisResult = await efficiencyAnalysisService.getHistoricalAnalysis(userId, 30);
      const dayOfWeekStats = analysisResult.success ? analysisResult.data?.dayOfWeekStats ?? [] : [];
      const currentDayStats = dayOfWeekStats.find(d => d.dayOfWeek === context.dayOfWeek);
      const avgPomodorosForDay = currentDayStats?.averagePomodoros ?? 0;
      
      // Build suggestions with scores
      const suggestionsPromises = tasks.map(async (task) => {
        const goalAlignment = await calculateGoalAlignment(task.projectId, userId);
        const isTop3 = top3TaskIds.includes(task.id);
        const deadlineProximity = getDeadlineProximity(task.planDate);
        
        // Day of week bonus: if user is typically productive on this day, boost scores
        const dayOfWeekBonus = avgPomodorosForDay > 4 ? 20 : 0;
        
        const score = calculateSuggestionScore(
          task,
          goalAlignment,
          isTop3,
          dayOfWeekBonus
        );
        
        const reason = generateSuggestionReason(task, deadlineProximity, goalAlignment, isTop3);
        const estimatedPomodoros = calculateEstimatedPomodoros(task.estimatedMinutes, pomodoroDuration);
        
        return {
          taskId: task.id,
          taskTitle: task.title,
          projectId: task.project.id,
          projectTitle: task.project.title,
          priority: task.priority,
          reason,
          estimatedPomodoros,
          deadlineProximity,
          goalAlignment,
          score,
        };
      });
      
      const suggestions = await Promise.all(suggestionsPromises);
      
      // Sort by score descending and take top N
      suggestions.sort((a, b) => b.score - a.score);
      const topSuggestions = suggestions.slice(0, maxSuggestions);
      
      return { success: true, data: topSuggestions };
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

  /**
   * Check idle and suggest tasks (Requirement 3.3)
   * Triggers when user has been idle for more than 5 minutes during work hours
   */
  async checkIdleAndSuggest(
    userId: string,
    idleMinutes: number
  ): Promise<ServiceResult<TaskSuggestion[] | null>> {
    try {
      // Only trigger if idle for more than 5 minutes
      if (idleMinutes < 5) {
        return { success: true, data: null };
      }
      
      // Check if within work hours
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
      });
      const workTimeSlots = (settings?.workTimeSlots as unknown as WorkTimeSlot[]) || [];
      
      if (!isWithinWorkHours(workTimeSlots)) {
        return { success: true, data: null };
      }
      
      // Get suggestions
      const context: SuggestionContext = {
        trigger: 'idle_detected',
        currentState: 'IDLE',
        timeOfDay: getTimeOfDay(),
        dayOfWeek: new Date().getDay(),
      };
      
      const suggestionsResult = await this.getNextTaskSuggestion(userId, context, 3);
      
      return suggestionsResult;
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to check idle and suggest',
        },
      };
    }
  },

  /**
   * Get Airlock suggestions (Requirements: 9.1, 9.2, 9.3, 9.4)
   * Returns Top 3 task suggestions with workload warning and day pattern
   */
  async getAirlockSuggestions(
    userId: string
  ): Promise<ServiceResult<AirlockSuggestionsResult>> {
    try {
      const today = getTodayDate();
      const dayOfWeek = today.getDay();
      
      // Get user settings
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
      });
      const pomodoroDuration = settings?.pomodoroDuration ?? 25;
      const expectedPomodoroCount = settings?.expectedPomodoroCount ?? 8;
      
      // Get historical analysis for day of week pattern (Requirement 9.3)
      const analysisResult = await efficiencyAnalysisService.getHistoricalAnalysis(userId, 30);
      const dayOfWeekStats = analysisResult.success ? analysisResult.data?.dayOfWeekStats ?? [] : [];
      const currentDayStats = dayOfWeekStats.find(d => d.dayOfWeek === dayOfWeek);
      const avgPomodorosForDay = currentDayStats?.averagePomodoros ?? 0;
      const dayName = DAY_NAMES[dayOfWeek];
      
      // Generate day of week pattern message (Requirement 9.3)
      let dayOfWeekPattern = '';
      if (avgPomodorosForDay > 0) {
        if (avgPomodorosForDay >= expectedPomodoroCount) {
          dayOfWeekPattern = `${dayName}s are typically productive for you (avg ${avgPomodorosForDay.toFixed(1)} pomodoros)`;
        } else if (avgPomodorosForDay >= expectedPomodoroCount * 0.7) {
          dayOfWeekPattern = `${dayName}s are moderately productive (avg ${avgPomodorosForDay.toFixed(1)} pomodoros)`;
        } else {
          dayOfWeekPattern = `${dayName}s tend to be less productive (avg ${avgPomodorosForDay.toFixed(1)} pomodoros)`;
        }
      } else {
        dayOfWeekPattern = `No historical data for ${dayName}s yet`;
      }
      
      // Get task suggestions
      const context: SuggestionContext = {
        trigger: 'daily_planning',
        currentState: 'IDLE',
        timeOfDay: getTimeOfDay(),
        dayOfWeek,
      };
      
      const suggestionsResult = await this.getNextTaskSuggestion(userId, context, 3);
      if (!suggestionsResult.success || !suggestionsResult.data) {
        return {
          success: false,
          error: suggestionsResult.error,
        };
      }
      
      const suggestions = suggestionsResult.data;
      
      // Calculate total estimated workload (Requirement 9.4)
      let totalEstimatedPomodoros = 0;
      for (const suggestion of suggestions) {
        if (suggestion.estimatedPomodoros) {
          totalEstimatedPomodoros += suggestion.estimatedPomodoros;
        }
      }
      
      // Generate workload warning if exceeds typical capacity (Requirement 9.4)
      let workloadWarning: string | null = null;
      if (totalEstimatedPomodoros > expectedPomodoroCount) {
        workloadWarning = `Suggested tasks total ${totalEstimatedPomodoros} pomodoros, which exceeds your daily target of ${expectedPomodoroCount}. Consider prioritizing or deferring some tasks.`;
      } else if (totalEstimatedPomodoros > avgPomodorosForDay && avgPomodorosForDay > 0) {
        workloadWarning = `Suggested workload (${totalEstimatedPomodoros} pomodoros) is higher than your typical ${dayName} average (${avgPomodorosForDay.toFixed(1)}).`;
      }
      
      return {
        success: true,
        data: {
          suggestions,
          workloadWarning,
          dayOfWeekPattern,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get airlock suggestions',
        },
      };
    }
  },

  /**
   * Record suggestion feedback (Requirements: 3.5, 9.5)
   * Stores user feedback for learning and improving future suggestions
   */
  async recordSuggestionFeedback(
    userId: string,
    data: RecordSuggestionFeedbackInput
  ): Promise<ServiceResult<void>> {
    try {
      const validated = RecordSuggestionFeedbackSchema.parse(data);
      
      await prisma.suggestionFeedback.create({
        data: {
          userId,
          suggestionId: validated.suggestionId,
          taskId: validated.taskId,
          action: validated.action,
          context: validated.context ?? undefined,
        },
      });
      
      return { success: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid feedback data',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to record suggestion feedback',
        },
      };
    }
  },

  /**
   * Get suggestion feedback history for analysis
   */
  async getSuggestionFeedbackHistory(
    userId: string,
    options?: {
      action?: 'accepted' | 'dismissed' | 'modified';
      limit?: number;
    }
  ): Promise<ServiceResult<Array<{
    id: string;
    suggestionId: string;
    taskId: string | null;
    action: string;
    context: unknown;
    createdAt: Date;
  }>>> {
    try {
      const feedbacks = await prisma.suggestionFeedback.findMany({
        where: {
          userId,
          ...(options?.action && { action: options.action }),
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: options?.limit ?? 100,
      });
      
      return { success: true, data: feedbacks };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get suggestion feedback history',
        },
      };
    }
  },

  /**
   * Get suggestion acceptance rate for analytics
   */
  async getSuggestionAcceptanceRate(
    userId: string,
    days: number = 30
  ): Promise<ServiceResult<{
    totalSuggestions: number;
    accepted: number;
    dismissed: number;
    modified: number;
    acceptanceRate: number;
  }>> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const feedbacks = await prisma.suggestionFeedback.findMany({
        where: {
          userId,
          createdAt: { gte: startDate },
        },
      });
      
      const accepted = feedbacks.filter(f => f.action === 'accepted').length;
      const dismissed = feedbacks.filter(f => f.action === 'dismissed').length;
      const modified = feedbacks.filter(f => f.action === 'modified').length;
      const total = feedbacks.length;
      
      return {
        success: true,
        data: {
          totalSuggestions: total,
          accepted,
          dismissed,
          modified,
          acceptanceRate: total > 0 ? (accepted / total) * 100 : 0,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get suggestion acceptance rate',
        },
      };
    }
  },
};

export default smartSuggestionService;
