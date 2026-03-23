/**
 * ContextProviderService
 * 
 * Provides comprehensive context for AI agents, aggregating data from
 * tasks, projects, coding principles, activity logs, and pomodoro status.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';
import { pomodoroService } from './pomodoro.service';
import { stateEngineService } from './state-engine.service';
import { screenTimeExemptionService } from './screen-time-exemption.service';
import { sleepTimeService } from './sleep-time.service';
import { overRestService } from './over-rest.service';

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

// Current task context (Requirement 6.1)
export interface CurrentTaskContext {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  estimatedMinutes: number | null;
  actualMinutes: number;
  projectId: string;
  projectTitle: string;
}

// Current project context (Requirement 6.1)
export interface CurrentProjectContext {
  id: string;
  title: string;
  deliverable: string;
  linkedGoals: Array<{ id: string; title: string }>;
}

// Recent activity entry (Requirement 6.2)
export interface RecentActivityEntry {
  type: 'pomodoro' | 'task_update' | 'blocker' | 'activity_log';
  description: string;
  timestamp: Date;
}

// Pomodoro status (Requirement 6.4)
export interface PomodoroStatusContext {
  isActive: boolean;
  remainingMinutes: number;
  taskId?: string;
  taskTitle: string;
  duration: number;
  startTime: Date;
}

// Today's progress
export interface TodayProgressContext {
  completedPomodoros: number;
  targetPomodoros: number;
  completedTasks: number;
  totalTasks: number;
}

// Full AI context (Requirements 6.1-6.4)
export interface AIContext {
  // Requirement 6.1: Current task and project
  currentTask: CurrentTaskContext | null;
  currentProject: CurrentProjectContext | null;
  
  // Requirement 6.3: Coding principles
  codingPrinciples: string[];
  
  // Requirement 6.2: Recent activity (last 2 hours)
  recentActivity: RecentActivityEntry[];
  
  // Requirement 6.4: Pomodoro status (only in FOCUS state)
  pomodoroStatus: PomodoroStatusContext | null;
  
  // System state
  systemState: string;
  
  // Today's progress
  todayProgress: TodayProgressContext;
  
  // Screen Time blocking context
  screenTimeBlocking?: {
    isBlocked: boolean;
    blockingReason: string | null;
    hasActiveUnblock: boolean;
    unblockExpiresAt?: string;
    remainingUnblocks: number;
    dailyUnblockLimit: number;
  };

  // Timestamp for context freshness
  generatedAt: Date;
}

// Input schemas
export const GetRecentActivitySchema = z.object({
  hours: z.number().min(1).max(24).default(2),
});

export type GetRecentActivityInput = z.infer<typeof GetRecentActivitySchema>;


export const contextProviderService = {
  /**
   * Get full AI context for a user
   * Requirements: 6.1, 6.2, 6.3, 6.4
   */
  async getFullContext(userId: string): Promise<ServiceResult<AIContext>> {
    try {
      // Get current system state
      const systemState = await stateEngineService.getState(userId);

      // Get current pomodoro (Requirement 6.4)
      const pomodoroResult = await pomodoroService.getCurrent(userId);
      let pomodoroStatus: PomodoroStatusContext | null = null;
      let currentTask: CurrentTaskContext | null = null;
      let currentProject: CurrentProjectContext | null = null;

      if (pomodoroResult.success && pomodoroResult.data) {
        const pomodoro = pomodoroResult.data;
        const startTime = new Date(pomodoro.createdAt);
        const elapsedMinutes = Math.floor((Date.now() - startTime.getTime()) / 60000);
        const remainingMinutes = Math.max(0, pomodoro.duration - elapsedMinutes);

        pomodoroStatus = {
          isActive: true,
          remainingMinutes,
          taskId: pomodoro.taskId ?? undefined,
          taskTitle: pomodoro.task?.title ?? 'Taskless',
          duration: pomodoro.duration,
          startTime,
        };

        // Get current task details (Requirement 6.1)
        if (pomodoro.taskId) {
          const taskResult = await this.getCurrentTaskContext(userId, pomodoro.taskId);
          if (taskResult.success && taskResult.data) {
            currentTask = taskResult.data;

            // Get current project details
            const projectResult = await this.getCurrentProjectContext(userId, currentTask.projectId);
            if (projectResult.success && projectResult.data) {
              currentProject = projectResult.data;
            }
          }
        }
      }

      // Get coding principles (Requirement 6.3)
      const principlesResult = await this.getCodingPrinciples(userId);
      const codingPrinciples = principlesResult.success && principlesResult.data 
        ? principlesResult.data 
        : [];

      // Get recent activity (Requirement 6.2)
      const activityResult = await this.getRecentActivity(userId, 2);
      const recentActivity = activityResult.success && activityResult.data 
        ? activityResult.data 
        : [];

      // Get today's progress
      const progressResult = await this.getTodayProgress(userId);
      const todayProgress = progressResult.success && progressResult.data
        ? progressResult.data
        : { completedPomodoros: 0, targetPomodoros: 8, completedTasks: 0, totalTasks: 0 };

      // Get Screen Time blocking context
      let screenTimeBlocking: AIContext['screenTimeBlocking'];
      try {
        // Determine current blocking reason
        let blockingReason: string | null = null;
        if (pomodoroStatus?.isActive) {
          blockingReason = 'focus';
        } else {
          const overRestResult = await overRestService.checkOverRestStatus(userId);
          if (overRestResult.success && overRestResult.data?.isOverRest && overRestResult.data?.shouldTriggerActions) {
            blockingReason = 'over_rest';
          } else {
            const sleepResult = await sleepTimeService.isInSleepTime(userId);
            if (sleepResult.success && sleepResult.data) {
              blockingReason = 'sleep';
            }
          }
        }

        const activeResult = await screenTimeExemptionService.getActiveExemption(userId);
        const remainingResult = await screenTimeExemptionService.getRemainingUnblocks(userId);

        screenTimeBlocking = {
          isBlocked: blockingReason !== null,
          blockingReason,
          hasActiveUnblock: !!(activeResult.success && activeResult.data?.active),
          unblockExpiresAt: activeResult.success && activeResult.data?.active
            ? activeResult.data.expiresAt.toISOString()
            : undefined,
          remainingUnblocks: remainingResult.success && remainingResult.data
            ? remainingResult.data.remaining
            : 0,
          dailyUnblockLimit: remainingResult.success && remainingResult.data
            ? remainingResult.data.limit
            : 3,
        };
      } catch {
        // Non-critical — don't fail the whole context
      }

      return {
        success: true,
        data: {
          currentTask,
          currentProject,
          codingPrinciples,
          recentActivity,
          pomodoroStatus,
          systemState,
          todayProgress,
          screenTimeBlocking,
          generatedAt: new Date(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get full context',
        },
      };
    }
  },

  /**
   * Get current task context
   * Requirement 6.1
   */
  async getCurrentTaskContext(
    userId: string,
    taskId: string
  ): Promise<ServiceResult<CurrentTaskContext>> {
    try {
      const task = await prisma.task.findFirst({
        where: { id: taskId, userId },
        include: {
          project: {
            select: { id: true, title: true },
          },
          pomodoros: {
            where: { status: 'COMPLETED' },
            select: { duration: true },
          },
        },
      });

      if (!task) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Task not found',
          },
        };
      }

      // Calculate actual minutes from completed pomodoros
      const actualMinutes = task.pomodoros.reduce((sum, p) => sum + p.duration, 0);

      return {
        success: true,
        data: {
          id: task.id,
          title: task.title,
          description: null, // Task model doesn't have description field
          priority: task.priority,
          status: task.status,
          estimatedMinutes: task.estimatedMinutes,
          actualMinutes,
          projectId: task.project.id,
          projectTitle: task.project.title,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get current task context',
        },
      };
    }
  },

  /**
   * Get current project context
   * Requirement 6.1
   */
  async getCurrentProjectContext(
    userId: string,
    projectId: string
  ): Promise<ServiceResult<CurrentProjectContext>> {
    try {
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId },
        include: {
          goals: {
            include: {
              goal: {
                select: { id: true, title: true },
              },
            },
          },
        },
      });

      if (!project) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Project not found',
          },
        };
      }

      return {
        success: true,
        data: {
          id: project.id,
          title: project.title,
          deliverable: project.deliverable,
          linkedGoals: project.goals.map((pg) => ({
            id: pg.goal.id,
            title: pg.goal.title,
          })),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get current project context',
        },
      };
    }
  },

  /**
   * Get coding principles from user settings
   * Requirement 6.3
   */
  async getCodingPrinciples(userId: string): Promise<ServiceResult<string[]>> {
    try {
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
        select: { codingStandards: true },
      });

      return {
        success: true,
        data: settings?.codingStandards ?? [],
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get coding principles',
        },
      };
    }
  },

  /**
   * Get recent activity from the last N hours
   * Requirement 6.2
   */
  async getRecentActivity(
    userId: string,
    hours: number = 2
  ): Promise<ServiceResult<RecentActivityEntry[]>> {
    try {
      const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
      const activities: RecentActivityEntry[] = [];

      // Get recent pomodoros
      const pomodoros = await prisma.pomodoro.findMany({
        where: {
          userId,
          createdAt: { gte: cutoffTime },
        },
        include: {
          task: { select: { title: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      for (const pomodoro of pomodoros) {
        const statusText = pomodoro.status === 'COMPLETED'
          ? 'Completed'
          : pomodoro.status === 'IN_PROGRESS'
            ? 'Started'
            : pomodoro.status;

        activities.push({
          type: 'pomodoro',
          description: `${statusText} ${pomodoro.duration}min pomodoro on "${pomodoro.task?.title ?? 'Taskless'}"`,
          timestamp: pomodoro.createdAt,
        });
      }

      // Get recent task updates (tasks updated in the time window)
      const tasks = await prisma.task.findMany({
        where: {
          userId,
          updatedAt: { gte: cutoffTime },
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      });

      for (const task of tasks) {
        // Only include if status is DONE (completed tasks)
        if (task.status === 'DONE') {
          activities.push({
            type: 'task_update',
            description: `Completed task "${task.title}"`,
            timestamp: task.updatedAt,
          });
        }
      }

      // Get recent blockers
      const blockers = await prisma.blocker.findMany({
        where: {
          userId,
          reportedAt: { gte: cutoffTime },
        },
        include: {
          task: { select: { title: true } },
        },
        orderBy: { reportedAt: 'desc' },
        take: 10,
      });

      for (const blocker of blockers) {
        activities.push({
          type: 'blocker',
          description: `Reported blocker on "${blocker.task.title}": ${blocker.description.substring(0, 100)}`,
          timestamp: blocker.reportedAt,
        });
      }

      // Get recent activity logs
      const activityLogs = await prisma.activityLog.findMany({
        where: {
          userId,
          timestamp: { gte: cutoffTime },
        },
        orderBy: { timestamp: 'desc' },
        take: 20,
      });

      for (const log of activityLogs) {
        activities.push({
          type: 'activity_log',
          description: `[${log.category}] ${log.title || log.url} (${Math.round(log.duration / 60)}min)`,
          timestamp: log.timestamp,
        });
      }

      // Sort all activities by timestamp descending
      activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      // Return top 50 activities
      return {
        success: true,
        data: activities.slice(0, 50),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get recent activity',
        },
      };
    }
  },

  /**
   * Get today's progress
   */
  async getTodayProgress(userId: string): Promise<ServiceResult<TodayProgressContext>> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Get completed pomodoros today
      const completedPomodoros = await prisma.pomodoro.count({
        where: {
          userId,
          status: 'COMPLETED',
          createdAt: {
            gte: today,
            lt: tomorrow,
          },
        },
      });

      // Get user's daily cap (target)
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
        select: { dailyCap: true },
      });
      const targetPomodoros = settings?.dailyCap ?? 8;

      // Get completed tasks today
      const completedTasks = await prisma.task.count({
        where: {
          userId,
          status: 'DONE',
          updatedAt: {
            gte: today,
            lt: tomorrow,
          },
        },
      });

      // Get total tasks planned for today
      const totalTasks = await prisma.task.count({
        where: {
          userId,
          planDate: {
            gte: today,
            lt: tomorrow,
          },
        },
      });

      return {
        success: true,
        data: {
          completedPomodoros,
          targetPomodoros,
          completedTasks,
          totalTasks,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get today progress',
        },
      };
    }
  },


  /**
   * Serialize AI context to Markdown format optimized for LLM consumption
   * Requirement 6.5
   */
  serializeToMarkdown(context: AIContext): string {
    const sections: string[] = [];

    // System state header
    sections.push(`## Current State: ${context.systemState.toUpperCase()}`);
    sections.push('');

    // Current task section (Requirement 6.1)
    if (context.currentTask) {
      sections.push('## Current Task');
      sections.push(`- **Title**: ${context.currentTask.title}`);
      sections.push(`- **Priority**: ${context.currentTask.priority}`);
      sections.push(`- **Status**: ${context.currentTask.status}`);
      sections.push(`- **Estimated**: ${context.currentTask.estimatedMinutes ?? 'Not set'} minutes`);
      sections.push(`- **Actual**: ${context.currentTask.actualMinutes} minutes`);
      sections.push(`- **Project**: ${context.currentTask.projectTitle}`);
      sections.push('');
    }

    // Current project section (Requirement 6.1)
    if (context.currentProject) {
      sections.push('## Current Project');
      sections.push(`- **Title**: ${context.currentProject.title}`);
      sections.push(`- **Deliverable**: ${context.currentProject.deliverable}`);
      if (context.currentProject.linkedGoals.length > 0) {
        sections.push(`- **Linked Goals**: ${context.currentProject.linkedGoals.map(g => g.title).join(', ')}`);
      }
      sections.push('');
    }

    // Active pomodoro section (Requirement 6.4)
    if (context.pomodoroStatus?.isActive) {
      sections.push('## Active Pomodoro');
      sections.push(`- **Task**: ${context.pomodoroStatus.taskTitle}`);
      sections.push(`- **Duration**: ${context.pomodoroStatus.duration} minutes`);
      sections.push(`- **Remaining**: ${context.pomodoroStatus.remainingMinutes} minutes`);
      sections.push(`- **Started**: ${this.formatTime(context.pomodoroStatus.startTime)}`);
      sections.push('');
    }

    // Coding principles section (Requirement 6.3)
    if (context.codingPrinciples.length > 0) {
      sections.push('## Coding Principles');
      for (const principle of context.codingPrinciples) {
        sections.push(`- ${principle}`);
      }
      sections.push('');
    }

    // Today's progress section
    sections.push("## Today's Progress");
    sections.push(`- **Pomodoros**: ${context.todayProgress.completedPomodoros}/${context.todayProgress.targetPomodoros}`);
    sections.push(`- **Tasks Completed**: ${context.todayProgress.completedTasks}`);
    if (context.todayProgress.totalTasks > 0) {
      sections.push(`- **Tasks Planned**: ${context.todayProgress.totalTasks}`);
    }
    sections.push('');

    // Recent activity section (Requirement 6.2)
    if (context.recentActivity.length > 0) {
      sections.push('## Recent Activity (Last 2 Hours)');
      const recentItems = context.recentActivity.slice(0, 10);
      for (const activity of recentItems) {
        sections.push(`- [${activity.type}] ${activity.description} (${this.formatTime(activity.timestamp)})`);
      }
      sections.push('');
    }

    // Screen Time blocking section
    if (context.screenTimeBlocking) {
      const st = context.screenTimeBlocking;
      sections.push('## Screen Time');
      sections.push(`- **Blocked**: ${st.isBlocked ? `Yes (${st.blockingReason})` : 'No'}`);
      if (st.hasActiveUnblock) {
        sections.push(`- **Temporary Unblock**: Active (expires ${st.unblockExpiresAt})`);
      }
      sections.push(`- **Remaining Unblocks Today**: ${st.remainingUnblocks}/${st.dailyUnblockLimit}`);
      sections.push('');
    }

    // Context metadata
    sections.push('---');
    sections.push(`*Context generated at ${this.formatTime(context.generatedAt)}*`);

    return sections.join('\n');
  },

  /**
   * Format a date to a human-readable time string
   */
  formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  },

  /**
   * Get context as markdown string (convenience method)
   * Requirement 6.5
   */
  async getContextAsMarkdown(userId: string): Promise<ServiceResult<string>> {
    const contextResult = await this.getFullContext(userId);
    
    if (!contextResult.success || !contextResult.data) {
      return {
        success: false,
        error: contextResult.error,
      };
    }

    return {
      success: true,
      data: this.serializeToMarkdown(contextResult.data),
    };
  },
};

export default contextProviderService;
