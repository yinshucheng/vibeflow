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
import { stateEngineService } from '../services/state-engine.service';
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
  // Multi-task pomodoro resources (Phase 6)
  POMODORO_CURRENT: 'vibe://pomodoro/current',
  POMODORO_SUMMARY: 'vibe://pomodoro/summary',
  // MCP Capability Enhancement resources
  STATE_CURRENT: 'vibe://state/current',
  PROJECTS_ALL: 'vibe://projects/all',
  TIMELINE_TODAY: 'vibe://timeline/today',
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

// Phase 6: Multi-task pomodoro resources
export interface PomodoroCurrentResource {
  id: string;
  status: string;
  duration: number;
  elapsed: number;
  remaining: number;
  isTaskless: boolean;
  label: string | null;
  taskSwitchCount: number;
  taskStack: Array<{
    taskId: string | null;
    taskTitle: string;
    accumulatedSeconds: number;
    isActive: boolean;
  }>;
  currentTask: {
    id: string;
    title: string;
    projectTitle: string;
  } | null;
}

export interface PomodoroSummaryResource {
  pomodoroId: string;
  totalDuration: number;
  taskSwitchCount: number;
  isTaskless: boolean;
  timeDistribution: Array<{
    taskId: string | null;
    taskTitle: string;
    seconds: number;
    percentage: number;
  }>;
}

// MCP Capability Enhancement resources
export interface StateCurrentResource {
  systemState: string;
  pomodoroCount: number;
  adjustedGoal: number | null;
  top3TaskIds: string[];
}

export interface ProjectsAllResource {
  projects: Array<{
    id: string;
    title: string;
    status: string;
    taskCount: number;
  }>;
}

export interface TimelineTodayResource {
  activities: Array<{
    type: 'pomodoro';
    startTime: string;
    endTime: string | null;
    taskTitle: string;
    duration: number;
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
      // Multi-task pomodoro resources (Phase 6)
      {
        uri: RESOURCE_URIS.POMODORO_CURRENT,
        name: 'Current Pomodoro',
        description: 'Current pomodoro session with task stack and time slices',
        mimeType: 'application/json',
      },
      {
        uri: RESOURCE_URIS.POMODORO_SUMMARY,
        name: 'Pomodoro Summary',
        description: 'Summary of the most recent completed pomodoro with time distribution',
        mimeType: 'application/json',
      },
      // MCP Capability Enhancement resources
      {
        uri: RESOURCE_URIS.STATE_CURRENT,
        name: 'Current State',
        description: 'Current system state including pomodoro count and daily goal',
        mimeType: 'application/json',
      },
      {
        uri: RESOURCE_URIS.PROJECTS_ALL,
        name: 'All Projects',
        description: 'All projects with task counts',
        mimeType: 'application/json',
      },
      {
        uri: RESOURCE_URIS.TIMELINE_TODAY,
        name: 'Today Timeline',
        description: 'Timeline of today activities (pomodoros and completed tasks)',
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
      // Multi-task pomodoro resources (Phase 6)
      case RESOURCE_URIS.POMODORO_CURRENT:
        data = await getPomodoroCurrent(context.userId);
        break;
      case RESOURCE_URIS.POMODORO_SUMMARY:
        data = await getPomodoroSummary(context.userId);
        break;
      // MCP Capability Enhancement resources
      case RESOURCE_URIS.STATE_CURRENT:
        data = await getStateCurrent(context.userId);
        break;
      case RESOURCE_URIS.PROJECTS_ALL:
        data = await getProjectsAll(context.userId);
        break;
      case RESOURCE_URIS.TIMELINE_TODAY:
        data = await getTimelineToday(context.userId);
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
  const systemState = await stateEngineService.getState(userId);

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

    // Get task details (only if taskId exists)
    if (currentPomodoro.taskId) {
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
  }

  return {
    project,
    task,
    systemState: systemState?.toString() || 'idle',
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
    taskId: p.taskId ?? '',
    taskTitle: p.task?.title ?? 'Taskless',
    projectId: p.task?.projectId ?? '',
    projectTitle: p.task?.project.title ?? '',
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

/**
 * Get current pomodoro with task stack
 * Phase 6: Multi-task pomodoro
 */
async function getPomodoroCurrent(userId: string): Promise<PomodoroCurrentResource | null> {
  const result = await pomodoroService.getCurrent(userId);
  if (!result.success || !result.data) return null;

  const pomodoro = result.data;
  const elapsed = Math.floor((Date.now() - new Date(pomodoro.startTime).getTime()) / 1000);
  const totalSeconds = pomodoro.duration * 60;

  // Get time slices for task stack
  const timeSlices = await prisma.taskTimeSlice.findMany({
    where: { pomodoroId: pomodoro.id },
    include: { task: { select: { id: true, title: true, project: { select: { title: true } } } } },
    orderBy: { startTime: 'asc' },
  });

  // Build task stack with accumulated time
  const taskMap = new Map<string | null, { taskTitle: string; seconds: number }>();
  let currentTaskId: string | null = null;

  for (const slice of timeSlices) {
    const key = slice.taskId;
    const duration = slice.endTime
      ? Math.floor((slice.endTime.getTime() - slice.startTime.getTime()) / 1000)
      : Math.floor((Date.now() - slice.startTime.getTime()) / 1000);

    if (!slice.endTime) currentTaskId = key;

    const existing = taskMap.get(key) || { taskTitle: slice.task?.title || 'Taskless', seconds: 0 };
    existing.seconds += duration;
    taskMap.set(key, existing);
  }

  const taskStack = Array.from(taskMap.entries()).map(([taskId, data]) => ({
    taskId,
    taskTitle: data.taskTitle,
    accumulatedSeconds: data.seconds,
    isActive: taskId === currentTaskId,
  }));

  const currentSlice = timeSlices.find(s => !s.endTime);
  const currentTask = currentSlice?.task ? {
    id: currentSlice.task.id,
    title: currentSlice.task.title,
    projectTitle: currentSlice.task.project.title,
  } : null;

  return {
    id: pomodoro.id,
    status: pomodoro.status,
    duration: pomodoro.duration,
    elapsed,
    remaining: Math.max(0, totalSeconds - elapsed),
    isTaskless: pomodoro.isTaskless ?? false,
    label: pomodoro.label ?? null,
    taskSwitchCount: pomodoro.taskSwitchCount ?? 0,
    taskStack,
    currentTask,
  };
}

/**
 * Get summary of most recent completed pomodoro
 * Phase 6: Multi-task pomodoro
 */
async function getPomodoroSummary(userId: string): Promise<PomodoroSummaryResource | null> {
  const pomodoro = await prisma.pomodoro.findFirst({
    where: { userId, status: 'COMPLETED' },
    orderBy: { endTime: 'desc' },
    include: { timeSlices: { include: { task: { select: { title: true } } } } },
  });

  if (!pomodoro) return null;

  const totalDuration = pomodoro.endTime && pomodoro.startTime
    ? Math.floor((pomodoro.endTime.getTime() - pomodoro.startTime.getTime()) / 1000)
    : pomodoro.duration * 60;

  // Calculate time distribution
  const taskMap = new Map<string | null, { title: string; seconds: number }>();
  for (const slice of pomodoro.timeSlices) {
    const key = slice.taskId;
    const duration = slice.durationSeconds ?? 0;
    const existing = taskMap.get(key) || { title: slice.task?.title || 'Taskless', seconds: 0 };
    existing.seconds += duration;
    taskMap.set(key, existing);
  }

  const timeDistribution = Array.from(taskMap.entries()).map(([taskId, data]) => ({
    taskId,
    taskTitle: data.title,
    seconds: data.seconds,
    percentage: totalDuration > 0 ? Math.round((data.seconds / totalDuration) * 100) : 0,
  }));

  return {
    pomodoroId: pomodoro.id,
    totalDuration,
    taskSwitchCount: pomodoro.taskSwitchCount ?? 0,
    isTaskless: pomodoro.isTaskless ?? false,
    timeDistribution,
  };
}

/**
 * Get current system state
 * MCP Capability Enhancement
 */
async function getStateCurrent(userId: string): Promise<StateCurrentResource> {
  const currentState = await stateEngineService.getState(userId);
  const today = new Date().toISOString().split('T')[0];

  const dailyState = await prisma.dailyState.findUnique({
    where: { userId_date: { userId, date: new Date(today) } },
  });

  const completedPomodoros = await prisma.pomodoro.count({
    where: { userId, status: 'COMPLETED', startTime: { gte: new Date(today) } },
  });

  return {
    systemState: currentState,
    pomodoroCount: completedPomodoros,
    adjustedGoal: dailyState?.adjustedGoal ?? null,
    top3TaskIds: dailyState?.top3TaskIds ?? [],
  };
}

/**
 * Get all projects with task counts
 * MCP Capability Enhancement
 */
async function getProjectsAll(userId: string): Promise<ProjectsAllResource> {
  const projects = await prisma.project.findMany({
    where: { userId },
    include: { _count: { select: { tasks: true } } },
    orderBy: { updatedAt: 'desc' },
  });

  return {
    projects: projects.map(p => ({
      id: p.id,
      title: p.title,
      status: p.status,
      taskCount: p._count.tasks,
    })),
  };
}

/**
 * Get today's activity timeline
 * MCP Capability Enhancement
 */
async function getTimelineToday(userId: string): Promise<TimelineTodayResource> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const pomodoros = await prisma.pomodoro.findMany({
    where: { userId, startTime: { gte: today } },
    include: { task: { select: { title: true } } },
    orderBy: { startTime: 'asc' },
  });

  const activities = pomodoros.map(p => ({
    type: 'pomodoro' as const,
    startTime: p.startTime.toISOString(),
    endTime: p.endTime?.toISOString() ?? null,
    taskTitle: p.task?.title ?? (p.label || 'Taskless'),
    duration: p.duration,
  }));

  return { activities };
}
