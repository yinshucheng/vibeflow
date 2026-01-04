/**
 * MCP Resources Module
 * 
 * Implements read-only resources for external AI agents.
 * 
 * Requirements: 9.3, 9.4, 10.1, 1.1, 1.2, 1.3, 1.4
 */

import type { MCPContext } from './auth';
import prisma from '../lib/prisma';
import { dailyStateService } from '../services/daily-state.service';
import { taskService } from '../services/task.service';
import { projectService } from '../services/project.service';
import { goalService } from '../services/goal.service';
import { pomodoroService } from '../services/pomodoro.service';
import { userService } from '../services/user.service';
import { efficiencyAnalysisService } from '../services/efficiency-analysis.service';

// Resource URIs
export const RESOURCE_URIS = {
  CURRENT_CONTEXT: 'vibe://context/current',
  USER_GOALS: 'vibe://user/goals',
  USER_PRINCIPLES: 'vibe://user/principles',
  ACTIVE_PROJECTS: 'vibe://projects/active',
  TODAY_TASKS: 'vibe://tasks/today',
  // Extended resources for AI-Native Enhancement (Requirements 1.1-1.4)
  WORKSPACE_CONTEXT: 'vibe://context/workspace',
  POMODORO_HISTORY: 'vibe://history/pomodoros',
  PRODUCTIVITY_ANALYTICS: 'vibe://analytics/productivity',
  ACTIVE_BLOCKERS: 'vibe://blockers/active',
} as const;

/**
 * Resource schemas for documentation
 */
export interface CurrentContextResource {
  project: {
    id: string;
    title: string;
    deliverable: string;
  } | null;
  task: {
    id: string;
    title: string;
    priority: string;
    parentPath: string[];
  } | null;
  systemState: string;
  pomodoroRemaining: number | null;
}

export interface UserGoalsResource {
  longTerm: Array<{
    id: string;
    title: string;
    description: string;
    targetDate: string;
    status: string;
    linkedProjects: number;
  }>;
  shortTerm: Array<{
    id: string;
    title: string;
    description: string;
    targetDate: string;
    status: string;
    linkedProjects: number;
  }>;
}

export interface UserPrinciplesResource {
  codingStandards: string[];
  preferences: Record<string, unknown>;
}

export interface ActiveProjectsResource {
  projects: Array<{
    id: string;
    title: string;
    deliverable: string;
    status: string;
    taskCount: number;
    linkedGoals: string[];
  }>;
}

export interface TodayTasksResource {
  top3: Array<{
    id: string;
    title: string;
    priority: string;
    projectId: string;
    projectTitle: string;
    status: string;
  }>;
  others: Array<{
    id: string;
    title: string;
    priority: string;
    projectId: string;
    projectTitle: string;
    status: string;
  }>;
}

/**
 * Extended Resource Interfaces for AI-Native Enhancement
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */

// Requirement 1.1: Workspace context resource
export interface WorkspaceContextResource {
  currentFiles: string[];
  recentChanges: Array<{
    file: string;
    timestamp: string;
    changeType: 'created' | 'modified' | 'deleted';
  }>;
  activeBranch: string | null;
  workspaceRoot: string;
}

// Requirement 1.2: Pomodoro history resource
export interface PomodoroHistoryResource {
  sessions: Array<{
    id: string;
    taskId: string;
    taskTitle: string;
    projectId: string;
    projectTitle: string;
    duration: number;
    status: 'COMPLETED' | 'INTERRUPTED' | 'ABORTED';
    startTime: string;
    endTime: string | null;
  }>;
  summary: {
    totalSessions: number;
    completedSessions: number;
    totalMinutes: number;
    averageDuration: number;
  };
}

// Requirement 1.3: Productivity analytics resource
export interface ProductivityAnalyticsResource {
  dailyScore: number;
  weeklyScore: number;
  monthlyScore: number;
  peakHours: number[];
  trends: 'improving' | 'declining' | 'stable';
  insights: string[];
}

// Requirement 1.4: Active blockers resource
export interface ActiveBlockersResource {
  blockers: Array<{
    id: string;
    taskId: string;
    taskTitle: string;
    category: 'technical' | 'dependency' | 'unclear_requirements' | 'other';
    description: string;
    reportedAt: string;
    status: 'active' | 'resolved';
  }>;
}

/**
 * Register available resources
 */
export function registerResources() {
  return {
    resources: [
      {
        uri: RESOURCE_URIS.CURRENT_CONTEXT,
        name: 'Current Context',
        description: 'Current working context including active project, task, and system state',
        mimeType: 'application/json',
      },
      {
        uri: RESOURCE_URIS.USER_GOALS,
        name: 'User Goals',
        description: 'User\'s long-term and short-term goals',
        mimeType: 'application/json',
      },
      {
        uri: RESOURCE_URIS.USER_PRINCIPLES,
        name: 'User Principles',
        description: 'User\'s coding standards and preferences',
        mimeType: 'application/json',
      },
      {
        uri: RESOURCE_URIS.ACTIVE_PROJECTS,
        name: 'Active Projects',
        description: 'List of active projects',
        mimeType: 'application/json',
      },
      {
        uri: RESOURCE_URIS.TODAY_TASKS,
        name: 'Today\'s Tasks',
        description: 'Today\'s planned tasks including Top 3',
        mimeType: 'application/json',
      },
      // Extended resources for AI-Native Enhancement
      {
        uri: RESOURCE_URIS.WORKSPACE_CONTEXT,
        name: 'Workspace Context',
        description: 'Current workspace files, recent changes, and active branches (Requirement 1.1)',
        mimeType: 'application/json',
      },
      {
        uri: RESOURCE_URIS.POMODORO_HISTORY,
        name: 'Pomodoro History',
        description: 'Last 7 days of Pomodoro session history with task associations (Requirement 1.2)',
        mimeType: 'application/json',
      },
      {
        uri: RESOURCE_URIS.PRODUCTIVITY_ANALYTICS,
        name: 'Productivity Analytics',
        description: 'Productivity metrics and patterns (Requirement 1.3)',
        mimeType: 'application/json',
      },
      {
        uri: RESOURCE_URIS.ACTIVE_BLOCKERS,
        name: 'Active Blockers',
        description: 'Currently reported blockers and their status (Requirement 1.4)',
        mimeType: 'application/json',
      },
    ],
  };
}

/**
 * Handle resource read requests
 */
export async function handleResourceRead(
  uri: string,
  context: MCPContext
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  try {
    let data: unknown;

    switch (uri) {
      case RESOURCE_URIS.CURRENT_CONTEXT:
        data = await getCurrentContext(context.userId);
        break;
      case RESOURCE_URIS.USER_GOALS:
        data = await getUserGoals(context.userId);
        break;
      case RESOURCE_URIS.USER_PRINCIPLES:
        data = await getUserPrinciples(context.userId);
        break;
      case RESOURCE_URIS.ACTIVE_PROJECTS:
        data = await getActiveProjects(context.userId);
        break;
      case RESOURCE_URIS.TODAY_TASKS:
        data = await getTodayTasks(context.userId);
        break;
      // Extended resources for AI-Native Enhancement
      case RESOURCE_URIS.WORKSPACE_CONTEXT:
        data = await getWorkspaceContext(context.userId);
        break;
      case RESOURCE_URIS.POMODORO_HISTORY:
        data = await getPomodoroHistory(context.userId);
        break;
      case RESOURCE_URIS.PRODUCTIVITY_ANALYTICS:
        data = await getProductivityAnalytics(context.userId);
        break;
      case RESOURCE_URIS.ACTIVE_BLOCKERS:
        data = await getActiveBlockers(context.userId);
        break;
      default:
        data = {
          error: {
            code: 'NOT_FOUND',
            message: `Unknown resource: ${uri}`,
          },
        };
    }

    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(data, null, 2),
      }],
    };
  } catch (error) {
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({
          error: {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Failed to read resource',
          },
        }),
      }],
    };
  }
}

/**
 * Get current working context
 * Requirements: 9.3
 */
async function getCurrentContext(userId: string): Promise<CurrentContextResource> {
  // Get current system state
  const stateResult = await dailyStateService.getCurrentState(userId);
  const systemState = stateResult.success ? stateResult.data : 'LOCKED';

  // Get current pomodoro if any
  const pomodoroResult = await pomodoroService.getCurrent(userId);
  const currentPomodoro = pomodoroResult.success ? pomodoroResult.data : null;

  let project: CurrentContextResource['project'] = null;
  let task: CurrentContextResource['task'] = null;
  let pomodoroRemaining: number | null = null;

  if (currentPomodoro) {
    // Calculate remaining time
    const elapsed = (Date.now() - new Date(currentPomodoro.startTime).getTime()) / 1000;
    const totalSeconds = currentPomodoro.duration * 60;
    pomodoroRemaining = Math.max(0, Math.round(totalSeconds - elapsed));

    // Get task details
    const taskData = await prisma.task.findUnique({
      where: { id: currentPomodoro.taskId },
      include: {
        project: true,
        parent: {
          include: {
            parent: true,
          },
        },
      },
    });

    if (taskData) {
      // Build parent path
      const parentPath: string[] = [];
      // Only go one level deep since we only include parent.parent
      if (taskData.parent) {
        parentPath.unshift(taskData.parent.title);
        if (taskData.parent.parent) {
          parentPath.unshift(taskData.parent.parent.title);
        }
      }

      task = {
        id: taskData.id,
        title: taskData.title,
        priority: taskData.priority,
        parentPath,
      };

      project = {
        id: taskData.project.id,
        title: taskData.project.title,
        deliverable: taskData.project.deliverable,
      };
    }
  }

  return {
    project,
    task,
    systemState: systemState?.toString() || 'LOCKED',
    pomodoroRemaining,
  };
}

/**
 * Get user goals
 * Requirements: 9.4, 10.1
 */
async function getUserGoals(userId: string): Promise<UserGoalsResource> {
  const result = await goalService.getByUser(userId);
  
  if (!result.success || !result.data) {
    return { longTerm: [], shortTerm: [] };
  }

  const goals = result.data;
  
  return {
    longTerm: goals
      .filter(g => g.type === 'LONG_TERM')
      .map(g => ({
        id: g.id,
        title: g.title,
        description: g.description,
        targetDate: g.targetDate.toISOString(),
        status: g.status,
        linkedProjects: g.projects.length,
      })),
    shortTerm: goals
      .filter(g => g.type === 'SHORT_TERM')
      .map(g => ({
        id: g.id,
        title: g.title,
        description: g.description,
        targetDate: g.targetDate.toISOString(),
        status: g.status,
        linkedProjects: g.projects.length,
      })),
  };
}

/**
 * Get user principles and preferences
 * Requirements: 9.4
 */
async function getUserPrinciples(userId: string): Promise<UserPrinciplesResource> {
  const result = await userService.getSettings(userId);
  
  if (!result.success || !result.data) {
    return { codingStandards: [], preferences: {} };
  }

  const settings = result.data;
  
  return {
    codingStandards: settings.codingStandards || [],
    preferences: (settings.preferences as Record<string, unknown>) || {},
  };
}

/**
 * Get active projects
 * Requirements: 10.1
 */
async function getActiveProjects(userId: string): Promise<ActiveProjectsResource> {
  const result = await projectService.getByUser(userId);
  
  if (!result.success || !result.data) {
    return { projects: [] };
  }

  const projects = result.data.filter(p => p.status === 'ACTIVE');
  
  return {
    projects: projects.map(p => ({
      id: p.id,
      title: p.title,
      deliverable: p.deliverable,
      status: p.status,
      taskCount: (p as { _count?: { tasks: number } })._count?.tasks || 0,
      linkedGoals: ((p as { goals?: Array<{ goal: { title: string } }> }).goals || [])
        .map(g => g.goal.title),
    })),
  };
}

/**
 * Get today's tasks
 * Requirements: 10.1
 */
async function getTodayTasks(userId: string): Promise<TodayTasksResource> {
  // Get Top 3 task IDs
  const top3Result = await dailyStateService.getTop3Tasks(userId);
  const top3Ids = top3Result.success ? top3Result.data || [] : [];

  // Get today's tasks
  const tasksResult = await taskService.getTodayTasks(userId);
  const allTasks = tasksResult.success ? tasksResult.data || [] : [];

  // Separate Top 3 from others
  const top3Tasks = allTasks.filter(t => top3Ids.includes(t.id));
  const otherTasks = allTasks.filter(t => !top3Ids.includes(t.id));

  const mapTask = (t: typeof allTasks[0]) => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    projectId: t.projectId,
    projectTitle: (t as { project?: { title: string } }).project?.title || '',
    status: t.status,
  });

  return {
    top3: top3Tasks.map(mapTask),
    others: otherTasks.map(mapTask),
  };
}

/**
 * Get workspace context
 * Requirements: 1.1
 * 
 * Note: Since VibeFlow is a web application, workspace context is derived from
 * activity logs and recent task/project activity rather than file system access.
 * The AI agent can use this to understand what the user has been working on.
 */
async function getWorkspaceContext(userId: string): Promise<WorkspaceContextResource> {
  // Get recent activity from activity logs (last 24 hours)
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);

  const recentActivity = await prisma.activityLog.findMany({
    where: {
      userId,
      timestamp: {
        gte: oneDayAgo,
      },
    },
    orderBy: {
      timestamp: 'desc',
    },
    take: 50,
  });

  // Extract unique URLs/files from activity
  const currentFiles: string[] = [];
  const recentChanges: WorkspaceContextResource['recentChanges'] = [];
  const seenUrls = new Set<string>();

  for (const activity of recentActivity) {
    const url = activity.url;
    if (url && !seenUrls.has(url)) {
      seenUrls.add(url);
      currentFiles.push(url);
      recentChanges.push({
        file: url,
        timestamp: activity.timestamp.toISOString(),
        changeType: 'modified', // Activity logs represent visits/modifications
      });
    }
  }

  // Get active branch from most recent task context if available
  // Since we don't have direct git integration, we return null
  const activeBranch: string | null = null;

  // Workspace root is the VibeFlow application context
  const workspaceRoot = 'vibeflow://workspace';

  return {
    currentFiles: currentFiles.slice(0, 20), // Limit to 20 most recent
    recentChanges: recentChanges.slice(0, 20),
    activeBranch,
    workspaceRoot,
  };
}

/**
 * Get pomodoro history for the last 7 days
 * Requirements: 1.2
 */
async function getPomodoroHistory(userId: string): Promise<PomodoroHistoryResource> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const pomodoros = await prisma.pomodoro.findMany({
    where: {
      userId,
      startTime: {
        gte: sevenDaysAgo,
      },
    },
    include: {
      task: {
        include: {
          project: true,
        },
      },
    },
    orderBy: {
      startTime: 'desc',
    },
  });

  // Map to resource format
  const sessions: PomodoroHistoryResource['sessions'] = pomodoros.map(p => ({
    id: p.id,
    taskId: p.taskId,
    taskTitle: p.task.title,
    projectId: p.task.projectId,
    projectTitle: p.task.project.title,
    duration: p.duration,
    status: p.status as 'COMPLETED' | 'INTERRUPTED' | 'ABORTED',
    startTime: p.startTime.toISOString(),
    endTime: p.endTime?.toISOString() || null,
  }));

  // Calculate summary statistics
  const completedSessions = pomodoros.filter(p => p.status === 'COMPLETED');
  const totalMinutes = completedSessions.reduce((sum, p) => sum + p.duration, 0);
  const averageDuration = completedSessions.length > 0 
    ? Math.round(totalMinutes / completedSessions.length) 
    : 0;

  return {
    sessions,
    summary: {
      totalSessions: pomodoros.length,
      completedSessions: completedSessions.length,
      totalMinutes,
      averageDuration,
    },
  };
}

/**
 * Get productivity analytics
 * Requirements: 1.3
 */
async function getProductivityAnalytics(userId: string): Promise<ProductivityAnalyticsResource> {
  // Use efficiency analysis service to get comprehensive analytics
  const analysisResult = await efficiencyAnalysisService.getHistoricalAnalysis(userId, 30);

  if (!analysisResult.success || !analysisResult.data) {
    return {
      dailyScore: 0,
      weeklyScore: 0,
      monthlyScore: 0,
      peakHours: [],
      trends: 'stable',
      insights: [],
    };
  }

  const analysis = analysisResult.data;

  // Calculate daily score based on goal achievement
  const dailyScore = Math.min(100, Math.round(analysis.goalAchievementRate));

  // Calculate weekly score (average of last 7 days)
  const weeklyAnalysis = await efficiencyAnalysisService.getHistoricalAnalysis(userId, 7);
  const weeklyScore = weeklyAnalysis.success && weeklyAnalysis.data
    ? Math.min(100, Math.round(weeklyAnalysis.data.goalAchievementRate))
    : dailyScore;

  // Monthly score from the 30-day analysis
  const monthlyScore = dailyScore;

  // Extract peak hours from heatmap data
  const peakHours = analysis.hourlyHeatmap
    .filter(h => h.productivity >= 70) // Hours with 70%+ productivity
    .map(h => h.hour)
    .filter((hour, index, self) => self.indexOf(hour) === index) // Unique hours
    .sort((a, b) => a - b)
    .slice(0, 5); // Top 5 peak hours

  // Determine trend based on insights
  let trends: 'improving' | 'declining' | 'stable' = 'stable';
  const hasImprovingInsight = analysis.insights.some(
    i => i.type === 'suggestion' && i.message.includes('Great consistency')
  );
  const hasDecliningInsight = analysis.insights.some(
    i => i.type === 'warning'
  );

  if (hasImprovingInsight && !hasDecliningInsight) {
    trends = 'improving';
  } else if (hasDecliningInsight && !hasImprovingInsight) {
    trends = 'declining';
  }

  // Extract insight messages
  const insights = analysis.insights.map(i => i.message);

  return {
    dailyScore,
    weeklyScore,
    monthlyScore,
    peakHours,
    trends,
    insights,
  };
}

/**
 * Get active blockers
 * Requirements: 1.4
 */
async function getActiveBlockers(userId: string): Promise<ActiveBlockersResource> {
  const blockers = await prisma.blocker.findMany({
    where: {
      userId,
      status: 'active',
    },
    include: {
      task: {
        select: {
          title: true,
        },
      },
    },
    orderBy: {
      reportedAt: 'desc',
    },
  });

  return {
    blockers: blockers.map(b => ({
      id: b.id,
      taskId: b.taskId,
      taskTitle: b.task.title,
      category: b.category as 'technical' | 'dependency' | 'unclear_requirements' | 'other',
      description: b.description,
      reportedAt: b.reportedAt.toISOString(),
      status: b.status as 'active' | 'resolved',
    })),
  };
}
