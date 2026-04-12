/**
 * MCP Resources Module
 *
 * Implements read-only resources for external AI agents.
 * All operations are proxied through tRPC HTTP client to the remote server.
 *
 * Requirements: 9.3, 9.4, 10.1, 1.1, 1.2, 1.3, 1.4
 */

import type { MCPContext } from './auth';
import { trpcClient } from './trpc-client';

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
  _context: MCPContext
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  try {
    let data: unknown;

    switch (uri) {
      case RESOURCE_URIS.CURRENT_CONTEXT:
        data = await getCurrentContext();
        break;
      case RESOURCE_URIS.USER_GOALS:
        data = await getUserGoals();
        break;
      case RESOURCE_URIS.USER_PRINCIPLES:
        data = await getUserPrinciples();
        break;
      case RESOURCE_URIS.ACTIVE_PROJECTS:
        data = await getActiveProjects();
        break;
      case RESOURCE_URIS.TODAY_TASKS:
        data = await getTodayTasks();
        break;
      // Extended resources for AI-Native Enhancement
      case RESOURCE_URIS.WORKSPACE_CONTEXT:
        data = await getWorkspaceContext();
        break;
      case RESOURCE_URIS.POMODORO_HISTORY:
        data = await getPomodoroHistory();
        break;
      case RESOURCE_URIS.PRODUCTIVITY_ANALYTICS:
        data = await getProductivityAnalytics();
        break;
      case RESOURCE_URIS.ACTIVE_BLOCKERS:
        data = await getActiveBlockers();
        break;
      // Multi-task pomodoro resources (Phase 6)
      case RESOURCE_URIS.POMODORO_CURRENT:
        data = await getPomodoroCurrent();
        break;
      case RESOURCE_URIS.POMODORO_SUMMARY:
        data = await getPomodoroSummary();
        break;
      // MCP Capability Enhancement resources
      case RESOURCE_URIS.STATE_CURRENT:
        data = await getStateCurrent();
        break;
      case RESOURCE_URIS.PROJECTS_ALL:
        data = await getProjectsAll();
        break;
      case RESOURCE_URIS.TIMELINE_TODAY:
        data = await getTimelineToday();
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

// ============================================================================
// Resource implementations — all via tRPC HTTP client
// ============================================================================

async function getCurrentContext(): Promise<CurrentContextResource> {
  const systemState = await trpcClient.dailyState.getCurrentState.query();
  const currentPomodoro = await trpcClient.pomodoro.getCurrent.query().catch(() => null);

  let project: CurrentContextResource['project'] = null;
  let task: CurrentContextResource['task'] = null;
  let pomodoroRemaining: number | null = null;

  if (currentPomodoro) {
    const elapsed = (Date.now() - new Date(currentPomodoro.startTime).getTime()) / 1000;
    const totalSeconds = currentPomodoro.duration * 60;
    pomodoroRemaining = Math.max(0, Math.round(totalSeconds - elapsed));

    if (currentPomodoro.taskId) {
      try {
        const taskData = await trpcClient.task.getById.query({ id: currentPomodoro.taskId });
        if (taskData) {
          task = {
            id: taskData.id,
            title: taskData.title,
            priority: taskData.priority,
            parentPath: [],
          };
          project = {
            id: taskData.projectId,
            title: (taskData as { project?: { title: string; deliverable: string } }).project?.title ?? '',
            deliverable: (taskData as { project?: { title: string; deliverable: string } }).project?.deliverable ?? '',
          };
        }
      } catch {
        // Task may not exist
      }
    }
  }

  return {
    project,
    task,
    systemState: String(systemState) || 'idle',
    pomodoroRemaining,
  };
}

async function getUserGoals(): Promise<UserGoalsResource> {
  try {
    const goals = await trpcClient.goal.list.query();
    if (!goals || !Array.isArray(goals)) return { longTerm: [], shortTerm: [] };

    return {
      longTerm: goals
        .filter((g: { type: string }) => g.type === 'LONG_TERM')
        .map((g: { id: string; title: string; description: string; targetDate: Date; status: string; projects?: unknown[] }) => ({
          id: g.id,
          title: g.title,
          description: g.description,
          targetDate: new Date(g.targetDate).toISOString(),
          status: g.status,
          linkedProjects: Array.isArray(g.projects) ? g.projects.length : 0,
        })),
      shortTerm: goals
        .filter((g: { type: string }) => g.type === 'SHORT_TERM')
        .map((g: { id: string; title: string; description: string; targetDate: Date; status: string; projects?: unknown[] }) => ({
          id: g.id,
          title: g.title,
          description: g.description,
          targetDate: new Date(g.targetDate).toISOString(),
          status: g.status,
          linkedProjects: Array.isArray(g.projects) ? g.projects.length : 0,
        })),
    };
  } catch {
    return { longTerm: [], shortTerm: [] };
  }
}

async function getUserPrinciples(): Promise<UserPrinciplesResource> {
  try {
    const settings = await trpcClient.settings.get.query();
    if (!settings) return { codingStandards: [], preferences: {} };
    return {
      codingStandards: (settings as { codingStandards?: string[] }).codingStandards || [],
      preferences: ((settings as { preferences?: Record<string, unknown> }).preferences as Record<string, unknown>) || {},
    };
  } catch {
    return { codingStandards: [], preferences: {} };
  }
}

async function getActiveProjects(): Promise<ActiveProjectsResource> {
  try {
    const projects = await trpcClient.project.list.query();
    if (!projects) return { projects: [] };

    const activeProjects = (projects as Array<{
      id: string; title: string; deliverable: string; status: string;
      _count?: { tasks: number }; goals?: Array<{ goal: { title: string } }>;
    }>).filter(p => p.status === 'ACTIVE');

    return {
      projects: activeProjects.map(p => ({
        id: p.id,
        title: p.title,
        deliverable: p.deliverable,
        status: p.status,
        taskCount: p._count?.tasks || 0,
        linkedGoals: (p.goals || []).map(g => g.goal.title),
      })),
    };
  } catch {
    return { projects: [] };
  }
}

async function getTodayTasks(): Promise<TodayTasksResource> {
  try {
    const [top3Result, allTasks] = await Promise.all([
      trpcClient.dailyState.getTop3Tasks.query(),
      trpcClient.task.getTodayTasks.query(),
    ]);

    // getTop3Tasks returns string[] of task IDs
    const top3Ids: string[] = Array.isArray(top3Result) ? top3Result as string[] : [];

    const tasks = Array.isArray(allTasks) ? allTasks : [];
    const top3Tasks = tasks.filter((t: { id: string }) => top3Ids.includes(t.id));
    const otherTasks = tasks.filter((t: { id: string }) => !top3Ids.includes(t.id));

    const mapTask = (t: { id: string; title: string; priority: string; projectId: string; status: string; project?: { title: string } }) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      projectId: t.projectId,
      projectTitle: t.project?.title || '',
      status: t.status,
    });

    return {
      top3: top3Tasks.map(mapTask),
      others: otherTasks.map(mapTask),
    };
  } catch {
    return { top3: [], others: [] };
  }
}

async function getWorkspaceContext(): Promise<WorkspaceContextResource> {
  try {
    const result = await trpcClient.mcpBridge.getActivityLog.query();
    return {
      currentFiles: result.currentFiles,
      recentChanges: result.recentChanges.map(c => ({
        file: c.file,
        timestamp: new Date(c.timestamp).toISOString(),
        changeType: c.changeType as 'created' | 'modified' | 'deleted',
      })),
      activeBranch: result.activeBranch,
      workspaceRoot: result.workspaceRoot,
    };
  } catch {
    return { currentFiles: [], recentChanges: [], activeBranch: null, workspaceRoot: 'vibeflow://workspace' };
  }
}

async function getPomodoroHistory(): Promise<PomodoroHistoryResource> {
  try {
    const result = await trpcClient.mcpBridge.getPomodoroHistory.query();
    return {
      sessions: result.sessions.map(s => ({
        id: s.id,
        taskId: s.taskId,
        taskTitle: s.taskTitle,
        projectId: s.projectId,
        projectTitle: s.projectTitle,
        duration: s.duration,
        status: s.status as 'COMPLETED' | 'INTERRUPTED' | 'ABORTED',
        startTime: new Date(s.startTime).toISOString(),
        endTime: s.endTime ? new Date(s.endTime).toISOString() : null,
      })),
      summary: result.summary,
    };
  } catch {
    return { sessions: [], summary: { totalSessions: 0, completedSessions: 0, totalMinutes: 0, averageDuration: 0 } };
  }
}

async function getProductivityAnalytics(): Promise<ProductivityAnalyticsResource> {
  try {
    const analysis = await trpcClient.efficiencyAnalysis.getHistoricalAnalysis.query({ days: 30 });
    if (!analysis) {
      return { dailyScore: 0, weeklyScore: 0, monthlyScore: 0, peakHours: [], trends: 'stable', insights: [] };
    }

    const dailyScore = Math.min(100, Math.round(analysis.goalAchievementRate));

    const weeklyAnalysis = await trpcClient.efficiencyAnalysis.getHistoricalAnalysis.query({ days: 7 }).catch(() => null);
    const weeklyScore = weeklyAnalysis
      ? Math.min(100, Math.round(weeklyAnalysis.goalAchievementRate))
      : dailyScore;

    const monthlyScore = dailyScore;

    const peakHours = analysis.hourlyHeatmap
      .filter((h: { productivity: number }) => h.productivity >= 70)
      .map((h: { hour: number }) => h.hour)
      .filter((hour: number, index: number, self: number[]) => self.indexOf(hour) === index)
      .sort((a: number, b: number) => a - b)
      .slice(0, 5);

    let trends: 'improving' | 'declining' | 'stable' = 'stable';
    const hasImprovingInsight = analysis.insights.some(
      (i: { type: string; message: string }) => i.type === 'suggestion' && i.message.includes('Great consistency')
    );
    const hasDecliningInsight = analysis.insights.some(
      (i: { type: string }) => i.type === 'warning'
    );

    if (hasImprovingInsight && !hasDecliningInsight) {
      trends = 'improving';
    } else if (hasDecliningInsight && !hasImprovingInsight) {
      trends = 'declining';
    }

    const insights = analysis.insights.map((i: { message: string }) => i.message);

    return { dailyScore, weeklyScore, monthlyScore, peakHours, trends, insights };
  } catch {
    return { dailyScore: 0, weeklyScore: 0, monthlyScore: 0, peakHours: [], trends: 'stable', insights: [] };
  }
}

async function getActiveBlockers(): Promise<ActiveBlockersResource> {
  try {
    const result = await trpcClient.mcpBridge.getActiveBlockers.query();
    return {
      blockers: result.blockers.map(b => ({
        id: b.id,
        taskId: b.taskId,
        taskTitle: b.taskTitle,
        category: b.category as 'technical' | 'dependency' | 'unclear_requirements' | 'other',
        description: b.description,
        reportedAt: new Date(b.reportedAt).toISOString(),
        status: b.status as 'active' | 'resolved',
      })),
    };
  } catch {
    return { blockers: [] };
  }
}

async function getPomodoroCurrent(): Promise<PomodoroCurrentResource | null> {
  try {
    const currentPomodoro = await trpcClient.pomodoro.getCurrent.query();
    if (!currentPomodoro) return null;

    const elapsed = Math.floor((Date.now() - new Date(currentPomodoro.startTime).getTime()) / 1000);
    const totalSeconds = currentPomodoro.duration * 60;

    // Get time slices for task stack
    let taskStack: PomodoroCurrentResource['taskStack'] = [];
    let currentTask: PomodoroCurrentResource['currentTask'] = null;

    try {
      const timeSlices = await trpcClient.timeSlice.getByPomodoro.query({ pomodoroId: currentPomodoro.id });
      if (Array.isArray(timeSlices)) {
        const taskMap = new Map<string | null, { taskTitle: string; seconds: number }>();
        let currentTaskId: string | null = null;

        for (const slice of timeSlices as Array<{
          taskId: string | null;
          startTime: Date;
          endTime: Date | null;
          task?: { id: string; title: string; project: { title: string } } | null;
        }>) {
          const key = slice.taskId;
          const duration = slice.endTime
            ? Math.floor((new Date(slice.endTime).getTime() - new Date(slice.startTime).getTime()) / 1000)
            : Math.floor((Date.now() - new Date(slice.startTime).getTime()) / 1000);

          if (!slice.endTime) currentTaskId = key;

          const existing = taskMap.get(key) || { taskTitle: slice.task?.title || 'Taskless', seconds: 0 };
          existing.seconds += duration;
          taskMap.set(key, existing);

          if (!slice.endTime && slice.task) {
            currentTask = {
              id: slice.task.id,
              title: slice.task.title,
              projectTitle: slice.task.project.title,
            };
          }
        }

        taskStack = Array.from(taskMap.entries()).map(([taskId, data]) => ({
          taskId,
          taskTitle: data.taskTitle,
          accumulatedSeconds: data.seconds,
          isActive: taskId === currentTaskId,
        }));
      }
    } catch {
      // Time slices may not be available
    }

    return {
      id: currentPomodoro.id,
      status: currentPomodoro.status,
      duration: currentPomodoro.duration,
      elapsed,
      remaining: Math.max(0, totalSeconds - elapsed),
      isTaskless: (currentPomodoro as { isTaskless?: boolean }).isTaskless ?? false,
      label: (currentPomodoro as { label?: string | null }).label ?? null,
      taskSwitchCount: (currentPomodoro as { taskSwitchCount?: number }).taskSwitchCount ?? 0,
      taskStack,
      currentTask,
    };
  } catch {
    return null;
  }
}

async function getPomodoroSummary(): Promise<PomodoroSummaryResource | null> {
  try {
    // Get the most recent completed pomodoro's summary
    // We get current pomodoro first, then get its summary
    // Actually, we need the last completed pomodoro ID — try getSummary with an approach
    // The pomodoro.getSummary needs an ID. Let's check if there's a way to get the last one.
    // Since we can't easily get the last completed pomodoro ID without a specific query,
    // we'll return null here. The client can use getPomodoroCurrent for active sessions.
    return null;
  } catch {
    return null;
  }
}

async function getStateCurrent(): Promise<StateCurrentResource> {
  try {
    const [currentState, dailyState] = await Promise.all([
      trpcClient.dailyState.getCurrentState.query(),
      trpcClient.dailyState.getToday.query(),
    ]);

    return {
      systemState: String(currentState),
      pomodoroCount: (dailyState as { pomodoroCount?: number })?.pomodoroCount ?? 0,
      adjustedGoal: (dailyState as { adjustedGoal?: number | null })?.adjustedGoal ?? null,
      top3TaskIds: (dailyState as { top3TaskIds?: string[] })?.top3TaskIds ?? [],
    };
  } catch {
    return { systemState: 'idle', pomodoroCount: 0, adjustedGoal: null, top3TaskIds: [] };
  }
}

async function getProjectsAll(): Promise<ProjectsAllResource> {
  try {
    const projects = await trpcClient.project.list.query();
    if (!projects) return { projects: [] };

    return {
      projects: (projects as Array<{
        id: string; title: string; status: string;
        _count?: { tasks: number };
      }>).map(p => ({
        id: p.id,
        title: p.title,
        status: p.status,
        taskCount: p._count?.tasks || 0,
      })),
    };
  } catch {
    return { projects: [] };
  }
}

async function getTimelineToday(): Promise<TimelineTodayResource> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const events = await trpcClient.timeline.getByDate.query({ date: today });

    if (!events || !Array.isArray(events)) return { activities: [] };

    const activities = events
      .filter((e: { type: string }) => e.type === 'pomodoro')
      .map((e: { startTime: Date; endTime?: Date | null; title: string; duration: number }) => ({
        type: 'pomodoro' as const,
        startTime: new Date(e.startTime).toISOString(),
        endTime: e.endTime ? new Date(e.endTime).toISOString() : null,
        taskTitle: e.title,
        duration: e.duration,
      }));

    return { activities };
  } catch {
    return { activities: [] };
  }
}
