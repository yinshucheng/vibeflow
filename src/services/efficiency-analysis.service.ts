/**
 * Efficiency Analysis Service
 * 
 * Provides historical efficiency analysis, time period breakdowns, 
 * productivity heatmaps, and smart goal suggestions.
 * 
 * Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.1.1-24.1.6, 25.1-25.4
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';

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

// Time period types (Requirements: 24.1.1)
export type TimePeriod = 'morning' | 'afternoon' | 'evening';

// Time period stats interface (Requirements: 24.1.1, 24.1.2, 24.1.3)
export interface TimePeriodStats {
  period: TimePeriod;
  averagePomodoros: number;
  completionRate: number; // completed vs started
  totalMinutes: number;
  pomodoroCount: number;
}

// Efficiency insight interface (Requirements: 24.1.4, 24.1.5)
export interface EfficiencyInsight {
  type: 'best_period' | 'pattern' | 'suggestion' | 'warning';
  message: string;
  data?: Record<string, unknown>;
}

// Hourly heatmap data interface (Requirements: 24.1.6)
export interface HourlyHeatmapData {
  hour: number; // 0-23
  dayOfWeek: number; // 0-6 (Sunday-Saturday)
  productivity: number; // 0-100 normalized score
  pomodoroCount: number;
}

// Historical analysis interface (Requirements: 24.1-24.5)
export interface HistoricalAnalysis {
  // Overall stats (Requirements: 24.1, 24.2, 24.3)
  averageDailyPomodoros: number;
  goalAchievementRate: number; // percentage of days goal was met
  averageRestDuration: number; // average time between pomodoros in minutes
  
  // By time period (Requirements: 24.1.1-24.1.5)
  byTimePeriod: TimePeriodStats[];
  
  // Insights (Requirements: 24.1.4, 24.1.5)
  insights: EfficiencyInsight[];
  
  // Heatmap data (Requirements: 24.1.6)
  hourlyHeatmap: HourlyHeatmapData[];
  
  // Suggested goal (Requirements: 25.1, 25.2)
  suggestedDailyGoal: number;
  
  // Day patterns (Requirements: 24.5)
  dayOfWeekStats: DayOfWeekStats[];
}

// Day of week stats for pattern detection (Requirements: 24.5)
export interface DayOfWeekStats {
  dayOfWeek: number; // 0-6
  dayName: string;
  averagePomodoros: number;
  totalDays: number;
}

// Goal realism check result (Requirements: 25.3, 25.4)
export interface GoalRealismCheck {
  realistic: boolean;
  reason?: string;
  historicalAverage: number;
  successRate: number;
}

// Validation schemas
export const GetHistoricalAnalysisSchema = z.object({
  days: z.number().int().min(7).max(365).default(30),
});

export type GetHistoricalAnalysisInput = z.infer<typeof GetHistoricalAnalysisSchema>;

// Daily reset hour (same as other services)
const DAILY_RESET_HOUR = 4;

// Time period boundaries (Requirements: 24.1.1)
const TIME_PERIODS = {
  morning: { start: 0, end: 12 }, // Before 12:00
  afternoon: { start: 12, end: 18 }, // 12:00-18:00
  evening: { start: 18, end: 24 }, // After 18:00
} as const;

// Day names for pattern detection
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Get the time period for a given hour
 * Requirements: 24.1.1
 */
function getTimePeriod(hour: number): TimePeriod {
  if (hour < TIME_PERIODS.morning.end) {
    return 'morning';
  } else if (hour < TIME_PERIODS.afternoon.end) {
    return 'afternoon';
  } else {
    return 'evening';
  }
}

/**
 * Get date range for analysis
 */
function getDateRange(days: number): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);
  
  // Adjust for daily reset hour
  if (now.getHours() < DAILY_RESET_HOUR) {
    end.setDate(end.getDate() - 1);
  }
  end.setHours(23, 59, 59, 999);
  
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  start.setHours(0, 0, 0, 0);
  
  return { start, end };
}

/**
 * Calculate the 75th percentile of an array of numbers
 * Requirements: 25.2
 */
function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const index = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  
  if (lower === upper) {
    return sorted[lower];
  }
  
  const fraction = index - lower;
  return sorted[lower] + fraction * (sorted[upper] - sorted[lower]);
}



export const efficiencyAnalysisService = {
  /**
   * Get historical analysis for a user
   * Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.1.1-24.1.6, 25.1, 25.2
   */
  async getHistoricalAnalysis(
    userId: string,
    days: number = 30
  ): Promise<ServiceResult<HistoricalAnalysis>> {
    try {
      const { start, end } = getDateRange(days);
      
      // Get all completed pomodoros in the date range
      const pomodoros = await prisma.pomodoro.findMany({
        where: {
          userId,
          startTime: {
            gte: start,
            lte: end,
          },
        },
        orderBy: {
          startTime: 'asc',
        },
      });
      
      // Get user settings for goal comparison
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
      });
      const dailyGoal = settings?.expectedPomodoroCount ?? 8;
      
      // Get daily states for goal achievement tracking
      const dailyStates = await prisma.dailyState.findMany({
        where: {
          userId,
          date: {
            gte: start,
            lte: end,
          },
        },
      });
      
      // Calculate daily pomodoro counts
      const dailyPomodoroMap = new Map<string, number>();
      const completedPomodoros = pomodoros.filter(p => p.status === 'COMPLETED');
      
      for (const pomodoro of completedPomodoros) {
        const dateKey = pomodoro.startTime.toISOString().split('T')[0];
        dailyPomodoroMap.set(dateKey, (dailyPomodoroMap.get(dateKey) ?? 0) + 1);
      }
      
      // Calculate average daily pomodoros (Requirements: 24.1)
      const dailyCounts = Array.from(dailyPomodoroMap.values());
      const totalDays = Math.max(1, dailyCounts.length);
      const averageDailyPomodoros = dailyCounts.length > 0
        ? dailyCounts.reduce((sum, count) => sum + count, 0) / totalDays
        : 0;
      
      // Calculate goal achievement rate (Requirements: 24.2)
      let daysGoalMet = 0;
      const dateKeys = Array.from(dailyPomodoroMap.keys());
      for (const dateKey of dateKeys) {
        const dailyState = dailyStates.find(
          ds => ds.date.toISOString().split('T')[0] === dateKey
        );
        // Use type assertion since adjustedGoal exists in schema but may not be in Prisma types yet
        const targetForDay = (dailyState as { adjustedGoal?: number | null })?.adjustedGoal ?? dailyGoal;
        const completedForDay = dailyPomodoroMap.get(dateKey) ?? 0;
        
        if (completedForDay >= targetForDay) {
          daysGoalMet++;
        }
      }
      const goalAchievementRate = totalDays > 0 ? (daysGoalMet / totalDays) * 100 : 0;
      
      // Calculate average rest duration (Requirements: 24.3)
      let totalRestDuration = 0;
      let restCount = 0;
      
      for (let i = 1; i < completedPomodoros.length; i++) {
        const prev = completedPomodoros[i - 1];
        const curr = completedPomodoros[i];
        
        if (prev.endTime && curr.startTime) {
          // Only count rest if same day
          const prevDate = prev.endTime.toISOString().split('T')[0];
          const currDate = curr.startTime.toISOString().split('T')[0];
          
          if (prevDate === currDate) {
            const restMs = curr.startTime.getTime() - prev.endTime.getTime();
            const restMinutes = restMs / 1000 / 60;
            
            // Only count reasonable rest periods (< 2 hours)
            if (restMinutes > 0 && restMinutes < 120) {
              totalRestDuration += restMinutes;
              restCount++;
            }
          }
        }
      }
      const averageRestDuration = restCount > 0 ? totalRestDuration / restCount : 0;
      
      // Calculate time period stats (Requirements: 24.1.1-24.1.3)
      const byTimePeriod = await this.getEfficiencyByTimePeriod(userId, days);
      
      // Generate insights (Requirements: 24.1.4, 24.1.5)
      const insights = this.generateInsights(
        byTimePeriod.success ? byTimePeriod.data ?? [] : [],
        averageDailyPomodoros,
        goalAchievementRate,
        dailyGoal
      );
      
      // Get hourly heatmap (Requirements: 24.1.6)
      const heatmapResult = await this.getHourlyHeatmap(userId, days);
      const hourlyHeatmap = heatmapResult.success ? heatmapResult.data ?? [] : [];
      
      // Calculate suggested daily goal (Requirements: 25.1, 25.2)
      const suggestedDailyGoal = Math.round(calculatePercentile(dailyCounts, 75));
      
      // Calculate day of week stats (Requirements: 24.5)
      const dayOfWeekStats = this.calculateDayOfWeekStats(completedPomodoros);
      
      return {
        success: true,
        data: {
          averageDailyPomodoros: Math.round(averageDailyPomodoros * 10) / 10,
          goalAchievementRate: Math.round(goalAchievementRate * 10) / 10,
          averageRestDuration: Math.round(averageRestDuration * 10) / 10,
          byTimePeriod: byTimePeriod.success ? byTimePeriod.data ?? [] : [],
          insights,
          hourlyHeatmap,
          suggestedDailyGoal,
          dayOfWeekStats,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get historical analysis',
        },
      };
    }
  },

  /**
   * Get efficiency breakdown by time period
   * Requirements: 24.1.1, 24.1.2, 24.1.3
   */
  async getEfficiencyByTimePeriod(
    userId: string,
    days: number = 30
  ): Promise<ServiceResult<TimePeriodStats[]>> {
    try {
      const { start, end } = getDateRange(days);
      
      // Get all pomodoros in the date range
      const pomodoros = await prisma.pomodoro.findMany({
        where: {
          userId,
          startTime: {
            gte: start,
            lte: end,
          },
        },
      });
      
      // Group by time period
      const periodStats: Record<TimePeriod, {
        completed: number;
        total: number;
        totalMinutes: number;
        dailyCounts: Map<string, number>;
      }> = {
        morning: { completed: 0, total: 0, totalMinutes: 0, dailyCounts: new Map() },
        afternoon: { completed: 0, total: 0, totalMinutes: 0, dailyCounts: new Map() },
        evening: { completed: 0, total: 0, totalMinutes: 0, dailyCounts: new Map() },
      };
      
      for (const pomodoro of pomodoros) {
        const hour = pomodoro.startTime.getHours();
        const period = getTimePeriod(hour);
        const dateKey = pomodoro.startTime.toISOString().split('T')[0];
        
        periodStats[period].total++;
        
        if (pomodoro.status === 'COMPLETED') {
          periodStats[period].completed++;
          periodStats[period].totalMinutes += pomodoro.duration;
          
          const currentCount = periodStats[period].dailyCounts.get(dateKey) ?? 0;
          periodStats[period].dailyCounts.set(dateKey, currentCount + 1);
        }
      }
      
      // Calculate stats for each period
      const result: TimePeriodStats[] = (['morning', 'afternoon', 'evening'] as TimePeriod[]).map(period => {
        const stats = periodStats[period];
        const daysWithActivity = stats.dailyCounts.size;
        const totalCompleted = stats.completed;
        
        return {
          period,
          averagePomodoros: daysWithActivity > 0 
            ? Math.round((totalCompleted / daysWithActivity) * 10) / 10 
            : 0,
          completionRate: stats.total > 0 
            ? Math.round((stats.completed / stats.total) * 100 * 10) / 10 
            : 0,
          totalMinutes: stats.totalMinutes,
          pomodoroCount: stats.completed,
        };
      });
      
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get efficiency by time period',
        },
      };
    }
  },

  /**
   * Get hourly productivity heatmap
   * Requirements: 24.1.6
   */
  async getHourlyHeatmap(
    userId: string,
    days: number = 30
  ): Promise<ServiceResult<HourlyHeatmapData[]>> {
    try {
      const { start, end } = getDateRange(days);
      
      // Get all completed pomodoros in the date range
      const pomodoros = await prisma.pomodoro.findMany({
        where: {
          userId,
          status: 'COMPLETED',
          startTime: {
            gte: start,
            lte: end,
          },
        },
      });
      
      // Create a map for hour x dayOfWeek combinations
      const heatmapMap = new Map<string, { count: number; totalMinutes: number }>();
      
      // Initialize all combinations
      for (let hour = 0; hour < 24; hour++) {
        for (let day = 0; day < 7; day++) {
          heatmapMap.set(`${hour}-${day}`, { count: 0, totalMinutes: 0 });
        }
      }
      
      // Aggregate pomodoro data
      for (const pomodoro of pomodoros) {
        const hour = pomodoro.startTime.getHours();
        const dayOfWeek = pomodoro.startTime.getDay();
        const key = `${hour}-${dayOfWeek}`;
        
        const current = heatmapMap.get(key)!;
        current.count++;
        current.totalMinutes += pomodoro.duration;
      }
      
      // Find max count for normalization
      let maxCount = 0;
      const heatmapValues = Array.from(heatmapMap.values());
      for (const data of heatmapValues) {
        if (data.count > maxCount) {
          maxCount = data.count;
        }
      }
      
      // Convert to array with normalized productivity scores
      const result: HourlyHeatmapData[] = [];
      
      for (let hour = 0; hour < 24; hour++) {
        for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
          const key = `${hour}-${dayOfWeek}`;
          const data = heatmapMap.get(key)!;
          
          // Normalize productivity to 0-100 scale
          const productivity = maxCount > 0 
            ? Math.round((data.count / maxCount) * 100) 
            : 0;
          
          result.push({
            hour,
            dayOfWeek,
            productivity,
            pomodoroCount: data.count,
          });
        }
      }
      
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get hourly heatmap',
        },
      };
    }
  },

  /**
   * Get smart goal suggestion based on historical performance
   * Requirements: 25.1, 25.2
   */
  async getSuggestedGoal(userId: string): Promise<ServiceResult<number>> {
    try {
      const { start, end } = getDateRange(30);
      
      // Get completed pomodoros for the past 30 days
      const pomodoros = await prisma.pomodoro.findMany({
        where: {
          userId,
          status: 'COMPLETED',
          startTime: {
            gte: start,
            lte: end,
          },
        },
      });
      
      // Calculate daily counts
      const dailyCounts = new Map<string, number>();
      
      for (const pomodoro of pomodoros) {
        const dateKey = pomodoro.startTime.toISOString().split('T')[0];
        dailyCounts.set(dateKey, (dailyCounts.get(dateKey) ?? 0) + 1);
      }
      
      const counts = Array.from(dailyCounts.values());
      
      if (counts.length === 0) {
        // No history, return default
        return { success: true, data: 8 };
      }
      
      // Calculate 75th percentile (Requirements: 25.2)
      const suggestedGoal = Math.round(calculatePercentile(counts, 75));
      
      // Ensure minimum of 1
      return { success: true, data: Math.max(1, suggestedGoal) };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get suggested goal',
        },
      };
    }
  },

  /**
   * Check if a goal is realistic based on historical performance
   * Requirements: 25.3, 25.4
   */
  async isGoalRealistic(
    userId: string,
    goal: number
  ): Promise<ServiceResult<GoalRealismCheck>> {
    try {
      const { start, end } = getDateRange(14); // 2 weeks for recent performance
      
      // Get completed pomodoros
      const pomodoros = await prisma.pomodoro.findMany({
        where: {
          userId,
          status: 'COMPLETED',
          startTime: {
            gte: start,
            lte: end,
          },
        },
      });
      
      // Get daily states for goal tracking
      const dailyStates = await prisma.dailyState.findMany({
        where: {
          userId,
          date: {
            gte: start,
            lte: end,
          },
        },
      });
      
      // Get user settings for default goal
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
      });
      const defaultGoal = settings?.expectedPomodoroCount ?? 8;
      
      // Calculate daily counts
      const dailyCounts = new Map<string, number>();
      
      for (const pomodoro of pomodoros) {
        const dateKey = pomodoro.startTime.toISOString().split('T')[0];
        dailyCounts.set(dateKey, (dailyCounts.get(dateKey) ?? 0) + 1);
      }
      
      const counts = Array.from(dailyCounts.values());
      const historicalAverage = counts.length > 0
        ? counts.reduce((sum, c) => sum + c, 0) / counts.length
        : 0;
      
      // Calculate success rate (days where goal was met)
      let daysGoalMet = 0;
      let totalDays = 0;
      
      const dailyCountEntries = Array.from(dailyCounts.entries());
      for (const [dateKey, count] of dailyCountEntries) {
        const dailyState = dailyStates.find(
          ds => ds.date.toISOString().split('T')[0] === dateKey
        );
        // Use type assertion since adjustedGoal exists in schema but may not be in Prisma types yet
        const targetForDay = (dailyState as { adjustedGoal?: number | null })?.adjustedGoal ?? defaultGoal;
        
        totalDays++;
        if (count >= targetForDay) {
          daysGoalMet++;
        }
      }
      
      const successRate = totalDays > 0 ? (daysGoalMet / totalDays) * 100 : 0;
      
      // Determine if goal is realistic
      let realistic = true;
      let reason: string | undefined;
      
      // Requirements: 25.3 - warn if goal is significantly higher than average
      if (goal > historicalAverage * 1.5) {
        realistic = false;
        reason = `Goal of ${goal} is significantly higher than your historical average of ${Math.round(historicalAverage * 10) / 10} pomodoros per day`;
      }
      
      // Requirements: 25.4 - suggest adjustment if consistently failing
      if (successRate < 50 && goal >= defaultGoal) {
        realistic = false;
        reason = `You've only met your goal ${Math.round(successRate)}% of the time over the past 2 weeks. Consider reducing your target.`;
      }
      
      return {
        success: true,
        data: {
          realistic,
          reason,
          historicalAverage: Math.round(historicalAverage * 10) / 10,
          successRate: Math.round(successRate * 10) / 10,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to check goal realism',
        },
      };
    }
  },

  /**
   * Generate insights from efficiency data
   * Requirements: 24.1.4, 24.1.5
   */
  generateInsights(
    timePeriodStats: TimePeriodStats[],
    averageDailyPomodoros: number,
    goalAchievementRate: number,
    dailyGoal: number
  ): EfficiencyInsight[] {
    const insights: EfficiencyInsight[] = [];
    
    // Find best time period (Requirements: 24.1.4)
    if (timePeriodStats.length > 0) {
      const bestPeriod = timePeriodStats.reduce((best, current) => 
        current.averagePomodoros > best.averagePomodoros ? current : best
      );
      
      if (bestPeriod.averagePomodoros > 0) {
        const periodNames: Record<TimePeriod, string> = {
          morning: 'morning',
          afternoon: 'afternoon',
          evening: 'evening',
        };
        
        insights.push({
          type: 'best_period',
          message: `Your most productive time is ${periodNames[bestPeriod.period]} with an average of ${bestPeriod.averagePomodoros} pomodoros`,
          data: { period: bestPeriod.period, average: bestPeriod.averagePomodoros },
        });
        
        // Compare periods (Requirements: 24.1.5)
        const worstPeriod = timePeriodStats.reduce((worst, current) =>
          current.averagePomodoros < worst.averagePomodoros ? current : worst
        );
        
        if (bestPeriod.averagePomodoros > 0 && worstPeriod.averagePomodoros > 0) {
          const improvement = ((bestPeriod.averagePomodoros - worstPeriod.averagePomodoros) / worstPeriod.averagePomodoros) * 100;
          
          if (improvement > 30) {
            insights.push({
              type: 'pattern',
              message: `Your ${periodNames[bestPeriod.period]} efficiency is ${Math.round(improvement)}% higher than ${periodNames[worstPeriod.period]}`,
              data: { 
                bestPeriod: bestPeriod.period, 
                worstPeriod: worstPeriod.period,
                improvement: Math.round(improvement),
              },
            });
          }
        }
      }
    }
    
    // Goal achievement insight
    if (goalAchievementRate < 50) {
      insights.push({
        type: 'warning',
        message: `You're meeting your daily goal only ${Math.round(goalAchievementRate)}% of the time. Consider adjusting your target.`,
        data: { achievementRate: goalAchievementRate },
      });
    } else if (goalAchievementRate >= 80) {
      insights.push({
        type: 'suggestion',
        message: `Great consistency! You're meeting your goal ${Math.round(goalAchievementRate)}% of the time. You might be ready for a higher target.`,
        data: { achievementRate: goalAchievementRate },
      });
    }
    
    // Average vs goal insight
    if (averageDailyPomodoros > 0 && dailyGoal > 0) {
      const ratio = averageDailyPomodoros / dailyGoal;
      
      if (ratio < 0.7) {
        insights.push({
          type: 'warning',
          message: `Your average of ${Math.round(averageDailyPomodoros * 10) / 10} pomodoros is well below your goal of ${dailyGoal}`,
          data: { average: averageDailyPomodoros, goal: dailyGoal },
        });
      } else if (ratio > 1.2) {
        insights.push({
          type: 'suggestion',
          message: `You're consistently exceeding your goal! Consider raising it from ${dailyGoal} to ${Math.ceil(averageDailyPomodoros)}`,
          data: { average: averageDailyPomodoros, goal: dailyGoal },
        });
      }
    }
    
    return insights;
  },

  /**
   * Calculate day of week statistics for pattern detection
   * Requirements: 24.5
   */
  calculateDayOfWeekStats(pomodoros: { startTime: Date; status: string }[]): DayOfWeekStats[] {
    const dayStats: Record<number, { total: number; days: Set<string> }> = {};
    
    // Initialize all days
    for (let i = 0; i < 7; i++) {
      dayStats[i] = { total: 0, days: new Set() };
    }
    
    // Aggregate completed pomodoros by day of week
    for (const pomodoro of pomodoros) {
      if (pomodoro.status === 'COMPLETED') {
        const dayOfWeek = pomodoro.startTime.getDay();
        const dateKey = pomodoro.startTime.toISOString().split('T')[0];
        
        dayStats[dayOfWeek].total++;
        dayStats[dayOfWeek].days.add(dateKey);
      }
    }
    
    // Convert to array
    return Object.entries(dayStats).map(([day, stats]) => ({
      dayOfWeek: parseInt(day),
      dayName: DAY_NAMES[parseInt(day)],
      averagePomodoros: stats.days.size > 0 
        ? Math.round((stats.total / stats.days.size) * 10) / 10 
        : 0,
      totalDays: stats.days.size,
    }));
  },
};

export default efficiencyAnalysisService;
