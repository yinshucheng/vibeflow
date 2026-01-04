/**
 * Progress Analyzer Service
 * 
 * Provides productivity scoring, peak hours identification, goal completion prediction,
 * trend detection, and improvement suggestions.
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

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

// Productivity trend types (Requirements: 7.4)
export type ProductivityTrend = 'improving' | 'declining' | 'stable';

// Productivity score interface (Requirements: 7.1)
export interface ProductivityScore {
  daily: number;    // 0-100
  weekly: number;   // 0-100
  monthly: number;  // 0-100
  trend: ProductivityTrend;
}

// Peak hours analysis interface (Requirements: 7.2)
export interface PeakHoursAnalysis {
  peakHours: number[];           // Most productive hours (0-23)
  peakDays: number[];            // Most productive days of week (0-6)
  averageByHour: Record<number, number>;  // Average productivity by hour
}

// Goal prediction interface (Requirements: 7.3)
export interface GoalPrediction {
  goalId: string;
  goalTitle: string;
  deadline: Date;
  currentProgress: number;       // 0-100
  predictedCompletion: Date | null;
  completionLikelihood: number;  // 0-100
  requiredVelocity: number;      // Pomodoros per day needed
  currentVelocity: number;       // Current pomodoros per day
  isAtRisk: boolean;
}

// Productivity insight interface (Requirements: 7.5)
export interface ProductivityInsight {
  type: 'improvement' | 'decline' | 'pattern' | 'suggestion';
  message: string;
  severity: 'info' | 'warning' | 'critical';
  data?: Record<string, unknown>;
}

// Trend detection result interface (Requirements: 7.4)
export interface TrendDetectionResult {
  trend: ProductivityTrend;
  changePercentage: number;
  insights: ProductivityInsight[];
}

// Daily reset hour (same as other services)
const DAILY_RESET_HOUR = 4;

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
 * Calculate productivity score based on goal achievement and completion rate
 * Requirements: 7.1
 * 
 * Property 9: Productivity Score Bounds
 * - Score must be within [0, 100]
 * - Score is calculated based on:
 *   - Goal achievement rate (40%)
 *   - Completion rate (30%)
 *   - Consistency (30%)
 */
export function calculateProductivityScore(
  completedPomodoros: number,
  targetPomodoros: number,
  totalStarted: number,
  daysWithActivity: number,
  totalDays: number
): number {
  // Goal achievement component (40% weight)
  const goalAchievement = targetPomodoros > 0 
    ? Math.min(1, completedPomodoros / targetPomodoros) 
    : 0;
  
  // Completion rate component (30% weight) - completed vs started
  const completionRate = totalStarted > 0 
    ? completedPomodoros / totalStarted 
    : 0;
  
  // Consistency component (30% weight) - days with activity vs total days
  const consistency = totalDays > 0 
    ? daysWithActivity / totalDays 
    : 0;
  
  // Weighted score calculation
  const rawScore = (goalAchievement * 0.4 + completionRate * 0.3 + consistency * 0.3) * 100;
  
  // Ensure bounds [0, 100]
  return Math.max(0, Math.min(100, Math.round(rawScore * 10) / 10));
}

/**
 * Detect trend using linear regression
 * Requirements: 7.4
 * 
 * Property 9: Productivity Score Bounds
 * - Trend must be one of {improving, declining, stable}
 */
export function detectTrend(dailyScores: number[]): ProductivityTrend {
  if (dailyScores.length < 3) return 'stable';
  
  // Calculate linear regression slope
  const n = dailyScores.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += dailyScores[i];
    sumXY += i * dailyScores[i];
    sumX2 += i * i;
  }
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  
  // Normalize slope relative to average score
  const avgScore = sumY / n;
  const normalizedSlope = avgScore > 0 ? (slope / avgScore) * 100 : 0;
  
  // Thresholds for trend detection
  // Improving: slope > 2% per day
  // Declining: slope < -2% per day
  // Stable: between -2% and 2%
  if (normalizedSlope > 2) return 'improving';
  if (normalizedSlope < -2) return 'declining';
  return 'stable';
}



export const progressAnalyzerService = {
  /**
   * Calculate productivity scores for daily, weekly, and monthly periods
   * Requirements: 7.1
   */
  async calculateProductivityScores(userId: string): Promise<ServiceResult<ProductivityScore>> {
    try {
      // Get user settings for target
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
      });
      const dailyTarget = settings?.expectedPomodoroCount ?? 8;
      
      // Calculate daily score (today)
      const todayRange = getDateRange(1);
      const todayPomodoros = await prisma.pomodoro.findMany({
        where: {
          userId,
          startTime: { gte: todayRange.start, lte: todayRange.end },
        },
      });
      
      const todayCompleted = todayPomodoros.filter(p => p.status === 'COMPLETED').length;
      const todayStarted = todayPomodoros.length;
      const dailyScore = calculateProductivityScore(
        todayCompleted,
        dailyTarget,
        todayStarted,
        todayCompleted > 0 ? 1 : 0,
        1
      );
      
      // Calculate weekly score (last 7 days)
      const weekRange = getDateRange(7);
      const weekPomodoros = await prisma.pomodoro.findMany({
        where: {
          userId,
          startTime: { gte: weekRange.start, lte: weekRange.end },
        },
      });
      
      const weekCompleted = weekPomodoros.filter(p => p.status === 'COMPLETED').length;
      const weekStarted = weekPomodoros.length;
      const weekDaysWithActivity = new Set(
        weekPomodoros
          .filter(p => p.status === 'COMPLETED')
          .map(p => p.startTime.toISOString().split('T')[0])
      ).size;
      
      const weeklyScore = calculateProductivityScore(
        weekCompleted,
        dailyTarget * 7,
        weekStarted,
        weekDaysWithActivity,
        7
      );
      
      // Calculate monthly score (last 30 days)
      const monthRange = getDateRange(30);
      const monthPomodoros = await prisma.pomodoro.findMany({
        where: {
          userId,
          startTime: { gte: monthRange.start, lte: monthRange.end },
        },
      });
      
      const monthCompleted = monthPomodoros.filter(p => p.status === 'COMPLETED').length;
      const monthStarted = monthPomodoros.length;
      const monthDaysWithActivity = new Set(
        monthPomodoros
          .filter(p => p.status === 'COMPLETED')
          .map(p => p.startTime.toISOString().split('T')[0])
      ).size;
      
      const monthlyScore = calculateProductivityScore(
        monthCompleted,
        dailyTarget * 30,
        monthStarted,
        monthDaysWithActivity,
        30
      );
      
      // Calculate trend from last 14 days of daily scores
      const trendResult = await this.detectProductivityTrend(userId, 14);
      const trend = trendResult.success ? trendResult.data?.trend ?? 'stable' : 'stable';
      
      return {
        success: true,
        data: {
          daily: dailyScore,
          weekly: weeklyScore,
          monthly: monthlyScore,
          trend,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to calculate productivity scores',
        },
      };
    }
  },

  /**
   * Identify peak productivity hours and days
   * Requirements: 7.2
   */
  async identifyPeakHours(userId: string, days: number = 30): Promise<ServiceResult<PeakHoursAnalysis>> {
    try {
      const { start, end } = getDateRange(days);
      
      // Get all completed pomodoros in the date range
      const pomodoros = await prisma.pomodoro.findMany({
        where: {
          userId,
          status: 'COMPLETED',
          startTime: { gte: start, lte: end },
        },
      });
      
      // Count pomodoros by hour
      const hourCounts: Record<number, number> = {};
      const hourDays: Record<number, Set<string>> = {};
      
      for (let h = 0; h < 24; h++) {
        hourCounts[h] = 0;
        hourDays[h] = new Set();
      }
      
      // Count pomodoros by day of week
      const dayCounts: Record<number, number> = {};
      const dayOccurrences: Record<number, Set<string>> = {};
      
      for (let d = 0; d < 7; d++) {
        dayCounts[d] = 0;
        dayOccurrences[d] = new Set();
      }
      
      for (const pomodoro of pomodoros) {
        const hour = pomodoro.startTime.getHours();
        const dayOfWeek = pomodoro.startTime.getDay();
        const dateKey = pomodoro.startTime.toISOString().split('T')[0];
        
        hourCounts[hour]++;
        hourDays[hour].add(dateKey);
        
        dayCounts[dayOfWeek]++;
        dayOccurrences[dayOfWeek].add(dateKey);
      }
      
      // Calculate average by hour (normalized by days with activity)
      const averageByHour: Record<number, number> = {};
      for (let h = 0; h < 24; h++) {
        const daysActive = hourDays[h].size;
        averageByHour[h] = daysActive > 0 
          ? Math.round((hourCounts[h] / daysActive) * 10) / 10 
          : 0;
      }
      
      // Find peak hours (top 3 hours with highest average)
      const sortedHours = Object.entries(averageByHour)
        .sort(([, a], [, b]) => b - a)
        .filter(([, avg]) => avg > 0)
        .slice(0, 3)
        .map(([hour]) => parseInt(hour));
      
      // Find peak days (top 2 days with highest average)
      const dayAverages: Array<{ day: number; avg: number }> = [];
      for (let d = 0; d < 7; d++) {
        const occurrences = dayOccurrences[d].size;
        const avg = occurrences > 0 ? dayCounts[d] / occurrences : 0;
        dayAverages.push({ day: d, avg });
      }
      
      const peakDays = dayAverages
        .sort((a, b) => b.avg - a.avg)
        .filter(d => d.avg > 0)
        .slice(0, 2)
        .map(d => d.day);
      
      return {
        success: true,
        data: {
          peakHours: sortedHours,
          peakDays,
          averageByHour,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to identify peak hours',
        },
      };
    }
  },


  /**
   * Predict goal completion likelihood based on current velocity
   * Requirements: 7.3
   */
  async predictGoalCompletion(userId: string, goalId: string): Promise<ServiceResult<GoalPrediction>> {
    try {
      // Get the goal with linked projects
      const goal = await prisma.goal.findFirst({
        where: { id: goalId, userId },
        include: {
          projects: {
            include: {
              project: {
                include: {
                  tasks: {
                    where: { status: { not: 'DONE' } },
                    select: { id: true, estimatedMinutes: true },
                  },
                },
              },
            },
          },
        },
      });
      
      if (!goal) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Goal not found',
          },
        };
      }
      
      // Calculate current progress based on completed projects
      const totalProjects = goal.projects.length;
      const completedProjects = goal.projects.filter(
        pg => pg.project.status === 'COMPLETED'
      ).length;
      const currentProgress = totalProjects > 0 
        ? (completedProjects / totalProjects) * 100 
        : 0;
      
      // Calculate remaining work (estimated pomodoros)
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
      });
      const pomodoroDuration = settings?.expectedPomodoroCount ?? 25;
      
      let remainingMinutes = 0;
      for (const pg of goal.projects) {
        if (pg.project.status !== 'COMPLETED') {
          for (const task of pg.project.tasks) {
            remainingMinutes += task.estimatedMinutes ?? 25; // Default 25 min per task
          }
        }
      }
      const remainingPomodoros = Math.ceil(remainingMinutes / pomodoroDuration);
      
      // Calculate current velocity (pomodoros per day over last 14 days)
      const velocityRange = getDateRange(14);
      const recentPomodoros = await prisma.pomodoro.count({
        where: {
          userId,
          status: 'COMPLETED',
          startTime: { gte: velocityRange.start, lte: velocityRange.end },
        },
      });
      const currentVelocity = Math.round((recentPomodoros / 14) * 10) / 10;
      
      // Calculate days until deadline
      const now = new Date();
      const deadline = new Date(goal.targetDate);
      const daysUntilDeadline = Math.max(0, Math.ceil(
        (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      ));
      
      // Calculate required velocity
      const requiredVelocity = daysUntilDeadline > 0 
        ? Math.round((remainingPomodoros / daysUntilDeadline) * 10) / 10 
        : remainingPomodoros;
      
      // Predict completion date based on current velocity
      let predictedCompletion: Date | null = null;
      if (currentVelocity > 0 && remainingPomodoros > 0) {
        const daysToComplete = Math.ceil(remainingPomodoros / currentVelocity);
        predictedCompletion = new Date(now);
        predictedCompletion.setDate(predictedCompletion.getDate() + daysToComplete);
      } else if (remainingPomodoros === 0) {
        predictedCompletion = now;
      }
      
      // Calculate completion likelihood (0-100)
      let completionLikelihood: number;
      if (remainingPomodoros === 0) {
        completionLikelihood = 100;
      } else if (currentVelocity === 0) {
        completionLikelihood = 0;
      } else if (daysUntilDeadline === 0) {
        completionLikelihood = 0;
      } else {
        // Likelihood based on velocity ratio
        const velocityRatio = currentVelocity / requiredVelocity;
        completionLikelihood = Math.min(100, Math.max(0, Math.round(velocityRatio * 100)));
      }
      
      // Determine if goal is at risk
      const isAtRisk = completionLikelihood < 70 || 
        (predictedCompletion !== null && predictedCompletion > deadline);
      
      return {
        success: true,
        data: {
          goalId,
          goalTitle: goal.title,
          deadline,
          currentProgress: Math.round(currentProgress * 10) / 10,
          predictedCompletion,
          completionLikelihood,
          requiredVelocity,
          currentVelocity,
          isAtRisk,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to predict goal completion',
        },
      };
    }
  },

  /**
   * Detect productivity trend over a period
   * Requirements: 7.4
   */
  async detectProductivityTrend(userId: string, days: number = 14): Promise<ServiceResult<TrendDetectionResult>> {
    try {
      const { start, end } = getDateRange(days);
      
      // Get user settings for target
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
      });
      const dailyTarget = settings?.expectedPomodoroCount ?? 8;
      
      // Get all pomodoros in the date range
      const pomodoros = await prisma.pomodoro.findMany({
        where: {
          userId,
          startTime: { gte: start, lte: end },
        },
        orderBy: { startTime: 'asc' },
      });
      
      // Group by day and calculate daily scores
      const dailyData: Map<string, { completed: number; started: number }> = new Map();
      
      for (const pomodoro of pomodoros) {
        const dateKey = pomodoro.startTime.toISOString().split('T')[0];
        const existing = dailyData.get(dateKey) ?? { completed: 0, started: 0 };
        existing.started++;
        if (pomodoro.status === 'COMPLETED') {
          existing.completed++;
        }
        dailyData.set(dateKey, existing);
      }
      
      // Calculate daily scores
      const dailyScores: number[] = [];
      const sortedDates = Array.from(dailyData.keys()).sort();
      
      for (const dateKey of sortedDates) {
        const data = dailyData.get(dateKey)!;
        const score = calculateProductivityScore(
          data.completed,
          dailyTarget,
          data.started,
          1,
          1
        );
        dailyScores.push(score);
      }
      
      // Detect trend
      const trend = detectTrend(dailyScores);
      
      // Calculate change percentage (first half vs second half)
      let changePercentage = 0;
      if (dailyScores.length >= 4) {
        const midpoint = Math.floor(dailyScores.length / 2);
        const firstHalf = dailyScores.slice(0, midpoint);
        const secondHalf = dailyScores.slice(midpoint);
        
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        
        if (firstAvg > 0) {
          changePercentage = Math.round(((secondAvg - firstAvg) / firstAvg) * 100 * 10) / 10;
        }
      }
      
      // Generate insights based on trend
      const insights: ProductivityInsight[] = [];
      
      if (trend === 'improving') {
        insights.push({
          type: 'improvement',
          message: `Your productivity has improved by ${Math.abs(changePercentage)}% over the past ${days} days`,
          severity: 'info',
          data: { changePercentage, days },
        });
      } else if (trend === 'declining') {
        insights.push({
          type: 'decline',
          message: `Your productivity has declined by ${Math.abs(changePercentage)}% over the past ${days} days`,
          severity: 'warning',
          data: { changePercentage, days },
        });
      }
      
      return {
        success: true,
        data: {
          trend,
          changePercentage,
          insights,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to detect productivity trend',
        },
      };
    }
  },


  /**
   * Generate improvement suggestions based on productivity analysis
   * Requirements: 7.5
   */
  async generateImprovementSuggestions(userId: string): Promise<ServiceResult<ProductivityInsight[]>> {
    try {
      const insights: ProductivityInsight[] = [];
      
      // Get productivity scores
      const scoresResult = await this.calculateProductivityScores(userId);
      if (!scoresResult.success || !scoresResult.data) {
        return { success: true, data: [] };
      }
      const scores = scoresResult.data;
      
      // Get peak hours analysis
      const peakHoursResult = await this.identifyPeakHours(userId, 30);
      const peakHours = peakHoursResult.success ? peakHoursResult.data : null;
      
      // Get trend detection
      const trendResult = await this.detectProductivityTrend(userId, 14);
      const trendData = trendResult.success ? trendResult.data : null;
      
      // Get user settings
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
      });
      const dailyTarget = settings?.expectedPomodoroCount ?? 8;
      
      // Suggestion 1: Low daily score
      if (scores.daily < 50) {
        insights.push({
          type: 'suggestion',
          message: 'Your daily productivity is below 50%. Try starting with your most important task first thing in the morning.',
          severity: 'warning',
          data: { dailyScore: scores.daily },
        });
      }
      
      // Suggestion 2: Declining trend
      if (trendData?.trend === 'declining') {
        insights.push({
          type: 'decline',
          message: `Your productivity has been declining. Consider taking a short break or reviewing your workload.`,
          severity: 'warning',
          data: { changePercentage: trendData.changePercentage },
        });
      }
      
      // Suggestion 3: Peak hours optimization
      if (peakHours && peakHours.peakHours.length > 0) {
        const peakHourStr = peakHours.peakHours
          .map(h => `${h}:00`)
          .join(', ');
        
        insights.push({
          type: 'pattern',
          message: `Your peak productivity hours are around ${peakHourStr}. Schedule your most challenging tasks during these times.`,
          severity: 'info',
          data: { peakHours: peakHours.peakHours },
        });
      }
      
      // Suggestion 4: Weekly vs daily comparison
      if (scores.weekly > scores.daily + 20) {
        insights.push({
          type: 'suggestion',
          message: 'Your weekly average is higher than today. You might be having a slow day - consider a short break to reset.',
          severity: 'info',
          data: { daily: scores.daily, weekly: scores.weekly },
        });
      }
      
      // Suggestion 5: Consistency improvement
      const { start, end } = getDateRange(7);
      const weekPomodoros = await prisma.pomodoro.findMany({
        where: {
          userId,
          status: 'COMPLETED',
          startTime: { gte: start, lte: end },
        },
      });
      
      const daysWithActivity = new Set(
        weekPomodoros.map(p => p.startTime.toISOString().split('T')[0])
      ).size;
      
      if (daysWithActivity < 5) {
        insights.push({
          type: 'suggestion',
          message: `You've been active only ${daysWithActivity} days this week. Consistency is key - try to maintain a regular schedule.`,
          severity: 'info',
          data: { daysWithActivity, totalDays: 7 },
        });
      }
      
      // Suggestion 6: Goal adjustment
      const avgDaily = weekPomodoros.length / 7;
      if (avgDaily < dailyTarget * 0.5) {
        insights.push({
          type: 'suggestion',
          message: `Your average of ${Math.round(avgDaily * 10) / 10} pomodoros/day is well below your target of ${dailyTarget}. Consider adjusting your daily goal to be more realistic.`,
          severity: 'warning',
          data: { average: avgDaily, target: dailyTarget },
        });
      } else if (avgDaily > dailyTarget * 1.3) {
        insights.push({
          type: 'suggestion',
          message: `You're consistently exceeding your goal! Consider raising your target from ${dailyTarget} to ${Math.ceil(avgDaily)}.`,
          severity: 'info',
          data: { average: avgDaily, target: dailyTarget },
        });
      }
      
      // Suggestion 7: Improving trend encouragement
      if (trendData?.trend === 'improving') {
        insights.push({
          type: 'improvement',
          message: `Great progress! Your productivity has improved by ${Math.abs(trendData.changePercentage)}%. Keep up the momentum!`,
          severity: 'info',
          data: { changePercentage: trendData.changePercentage },
        });
      }
      
      return { success: true, data: insights };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to generate improvement suggestions',
        },
      };
    }
  },
};

export default progressAnalyzerService;
