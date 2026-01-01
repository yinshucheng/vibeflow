/**
 * MCP Resources Module
 * 
 * Implements read-only resources for external AI agents.
 * 
 * Requirements: 9.3, 9.4, 10.1
 */

import type { MCPContext } from './auth';
import prisma from '../lib/prisma';
import { dailyStateService } from '../services/daily-state.service';
import { taskService } from '../services/task.service';
import { projectService } from '../services/project.service';
import { goalService } from '../services/goal.service';
import { pomodoroService } from '../services/pomodoro.service';
import { userService } from '../services/user.service';

// Resource URIs
export const RESOURCE_URIS = {
  CURRENT_CONTEXT: 'vibe://context/current',
  USER_GOALS: 'vibe://user/goals',
  USER_PRINCIPLES: 'vibe://user/principles',
  ACTIVE_PROJECTS: 'vibe://projects/active',
  TODAY_TASKS: 'vibe://tasks/today',
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
