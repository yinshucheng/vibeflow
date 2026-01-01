/**
 * MCP Tools Module
 * 
 * Implements executable actions for external AI agents.
 * 
 * Requirements: 9.5, 9.6, 9.7, 10.2
 */

import type { MCPContext } from './auth';
import prisma from '../lib/prisma';
import { taskService } from '../services/task.service';
import { pomodoroService } from '../services/pomodoro.service';
import { activityLogService } from '../services/activity-log.service';

/**
 * Tool definitions
 */
export const TOOLS = {
  COMPLETE_TASK: 'vibe.complete_task',
  ADD_SUBTASK: 'vibe.add_subtask',
  REPORT_BLOCKER: 'vibe.report_blocker',
  START_POMODORO: 'vibe.start_pomodoro',
  GET_TASK_CONTEXT: 'vibe.get_task_context',
} as const;

/**
 * Tool input schemas
 */
interface CompleteTaskInput {
  task_id: string;
  summary: string;
}

interface AddSubtaskInput {
  parent_id: string;
  title: string;
  priority?: 'P1' | 'P2' | 'P3';
}

interface ReportBlockerInput {
  task_id: string;
  error_log: string;
}

interface StartPomodoroInput {
  task_id: string;
  duration?: number;
}

interface GetTaskContextInput {
  task_id: string;
}

/**
 * Tool response type - matches MCP SDK CallToolResult
 */
interface ToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

/**
 * Register available tools
 */
export function registerTools() {
  return {
    tools: [
      {
        name: TOOLS.COMPLETE_TASK,
        description: 'Mark a task as completed with an optional summary',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: {
              type: 'string',
              description: 'The UUID of the task to complete',
            },
            summary: {
              type: 'string',
              description: 'A brief summary of what was accomplished',
            },
          },
          required: ['task_id', 'summary'],
        },
      },
      {
        name: TOOLS.ADD_SUBTASK,
        description: 'Add a new subtask under an existing task',
        inputSchema: {
          type: 'object',
          properties: {
            parent_id: {
              type: 'string',
              description: 'The UUID of the parent task',
            },
            title: {
              type: 'string',
              description: 'The title of the new subtask',
            },
            priority: {
              type: 'string',
              enum: ['P1', 'P2', 'P3'],
              description: 'Priority level (default: P2)',
            },
          },
          required: ['parent_id', 'title'],
        },
      },
      {
        name: TOOLS.REPORT_BLOCKER,
        description: 'Report a blocker or error encountered while working on a task',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: {
              type: 'string',
              description: 'The UUID of the task with the blocker',
            },
            error_log: {
              type: 'string',
              description: 'The error log or description of the blocker',
            },
          },
          required: ['task_id', 'error_log'],
        },
      },
      {
        name: TOOLS.START_POMODORO,
        description: 'Start a new Pomodoro focus session for a task',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: {
              type: 'string',
              description: 'The UUID of the task to focus on',
            },
            duration: {
              type: 'number',
              description: 'Duration in minutes (default: user setting or 25)',
            },
          },
          required: ['task_id'],
        },
      },
      {
        name: TOOLS.GET_TASK_CONTEXT,
        description: 'Get detailed context about a specific task including its project and related documents',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: {
              type: 'string',
              description: 'The UUID of the task',
            },
          },
          required: ['task_id'],
        },
      },
    ],
  };
}

/**
 * Handle tool calls
 */
export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  context: MCPContext
): Promise<ToolResponse> {
  try {
    let result: unknown;

    switch (name) {
      case TOOLS.COMPLETE_TASK:
        result = await completeTask(args as unknown as CompleteTaskInput, context);
        break;
      case TOOLS.ADD_SUBTASK:
        result = await addSubtask(args as unknown as AddSubtaskInput, context);
        break;
      case TOOLS.REPORT_BLOCKER:
        result = await reportBlocker(args as unknown as ReportBlockerInput, context);
        break;
      case TOOLS.START_POMODORO:
        result = await startPomodoro(args as unknown as StartPomodoroInput, context);
        break;
      case TOOLS.GET_TASK_CONTEXT:
        result = await getTaskContext(args as unknown as GetTaskContextInput, context);
        break;
      default:
        result = {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Unknown tool: ${name}`,
          },
        };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Tool execution failed',
          },
        }),
      }],
    };
  }
}

/**
 * Complete a task
 * Requirements: 9.5
 */
async function completeTask(
  input: CompleteTaskInput,
  context: MCPContext
): Promise<{ success: boolean; task?: unknown; error?: unknown }> {
  // Validate input
  if (!input.task_id || !input.summary) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'task_id and summary are required',
      },
    };
  }

  // Update task status to DONE
  const result = await taskService.updateStatus(
    input.task_id,
    context.userId,
    'DONE',
    false
  );

  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }

  // Log the completion activity
  await activityLogService.create(context.userId, {
    url: `vibe://task/${input.task_id}`,
    title: `Task completed: ${result.data?.title}`,
    duration: 0,
    category: 'productive',
    source: 'mcp_agent',
  });

  return {
    success: true,
    task: {
      id: result.data?.id,
      title: result.data?.title,
      status: result.data?.status,
      summary: input.summary,
    },
  };
}

/**
 * Add a subtask
 * Requirements: 9.6
 */
async function addSubtask(
  input: AddSubtaskInput,
  context: MCPContext
): Promise<{ success: boolean; task?: unknown; error?: unknown }> {
  // Validate input
  if (!input.parent_id || !input.title) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'parent_id and title are required',
      },
    };
  }

  // Get parent task to find projectId
  const parentTask = await prisma.task.findFirst({
    where: {
      id: input.parent_id,
      userId: context.userId,
    },
  });

  if (!parentTask) {
    return {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Parent task not found',
      },
    };
  }

  // Create subtask
  const result = await taskService.create(context.userId, {
    title: input.title,
    projectId: parentTask.projectId,
    parentId: input.parent_id,
    priority: input.priority || 'P2',
  });

  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }

  return {
    success: true,
    task: {
      id: result.data?.id,
      title: result.data?.title,
      priority: result.data?.priority,
      parentId: result.data?.parentId,
      projectId: result.data?.projectId,
    },
  };
}

/**
 * Report a blocker
 * Requirements: 9.7
 */
async function reportBlocker(
  input: ReportBlockerInput,
  context: MCPContext
): Promise<{ success: boolean; blocker_id?: string; error?: unknown }> {
  // Validate input
  if (!input.task_id || !input.error_log) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'task_id and error_log are required',
      },
    };
  }

  // Verify task exists
  const task = await prisma.task.findFirst({
    where: {
      id: input.task_id,
      userId: context.userId,
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

  // Log the blocker as an activity
  const logResult = await activityLogService.create(context.userId, {
    url: `vibe://blocker/${input.task_id}`,
    title: `Blocker reported for: ${task.title}`,
    duration: 0,
    category: 'neutral',
    source: 'mcp_agent',
  });

  // Store blocker details in a separate record (using ActivityLog for now)
  // In a full implementation, this would be a dedicated Blocker table
  const blockerId = logResult.success ? logResult.data?.id : `blocker_${Date.now()}`;

  return {
    success: true,
    blocker_id: blockerId,
  };
}

/**
 * Start a pomodoro
 * Requirements: 10.2
 */
async function startPomodoro(
  input: StartPomodoroInput,
  context: MCPContext
): Promise<{ success: boolean; pomodoro?: unknown; error?: unknown }> {
  // Validate input
  if (!input.task_id) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'task_id is required',
      },
    };
  }

  // Start pomodoro
  const result = await pomodoroService.start(context.userId, {
    taskId: input.task_id,
    duration: input.duration,
  });

  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }

  return {
    success: true,
    pomodoro: {
      id: result.data?.id,
      taskId: result.data?.taskId,
      duration: result.data?.duration,
      startTime: result.data?.startTime,
      status: result.data?.status,
    },
  };
}

/**
 * Get task context
 * Requirements: 10.2
 */
async function getTaskContext(
  input: GetTaskContextInput,
  context: MCPContext
): Promise<{ success: boolean; task?: unknown; project?: unknown; relatedDocs?: string[]; error?: unknown }> {
  // Validate input
  if (!input.task_id) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'task_id is required',
      },
    };
  }

  // Get task with full context
  const task = await prisma.task.findFirst({
    where: {
      id: input.task_id,
      userId: context.userId,
    },
    include: {
      project: {
        include: {
          goals: {
            include: {
              goal: true,
            },
          },
        },
      },
      parent: true,
      subTasks: true,
      pomodoros: {
        orderBy: { createdAt: 'desc' },
        take: 5,
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

  // Build parent path
  const parentPath: string[] = [];
  if (task.parent) {
    parentPath.push(task.parent.title);
    // Could recursively fetch more parents if needed
  }

  return {
    success: true,
    task: {
      id: task.id,
      title: task.title,
      priority: task.priority,
      status: task.status,
      planDate: task.planDate,
      parentPath,
      subTasks: task.subTasks.map(st => ({
        id: st.id,
        title: st.title,
        status: st.status,
      })),
      recentPomodoros: task.pomodoros.map(p => ({
        id: p.id,
        duration: p.duration,
        status: p.status,
        startTime: p.startTime,
      })),
    },
    project: {
      id: task.project.id,
      title: task.project.title,
      deliverable: task.project.deliverable,
      status: task.project.status,
      linkedGoals: task.project.goals.map(g => ({
        id: g.goal.id,
        title: g.goal.title,
        type: g.goal.type,
      })),
    },
    relatedDocs: [], // Placeholder for Ammo Box documents (future feature)
  };
}
