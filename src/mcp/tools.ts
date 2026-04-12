/**
 * MCP Tools Module
 *
 * Implements executable actions for external AI agents.
 * All operations are proxied through tRPC HTTP client to the remote server.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 9.5, 9.6, 9.7, 10.2
 */

import type { MCPContext } from './auth';
import { trpcClient } from './trpc-client';
import { TRPCClientError } from '@trpc/client';

/**
 * Tool definitions
 */
export const TOOLS = {
  COMPLETE_TASK: 'flow_complete_task',
  ADD_SUBTASK: 'flow_add_subtask',
  REPORT_BLOCKER: 'flow_report_blocker',
  START_POMODORO: 'flow_start_pomodoro',
  GET_TASK_CONTEXT: 'flow_get_task_context',
  // New AI-Native Enhancement tools (Requirements 4.1-4.4)
  BATCH_UPDATE_TASKS: 'flow_batch_update_tasks',
  CREATE_PROJECT_FROM_TEMPLATE: 'flow_create_project_from_template',
  ANALYZE_TASK_DEPENDENCIES: 'flow_analyze_task_dependencies',
  GENERATE_DAILY_SUMMARY: 'flow_generate_daily_summary',
  // Natural Language Task Creation (Requirement 8.1)
  CREATE_TASK_FROM_NL: 'flow_create_task_from_nl',
  // Multi-task Pomodoro tools (Phase 6)
  SWITCH_TASK: 'flow_switch_task',
  START_TASKLESS_POMODORO: 'flow_start_taskless_pomodoro',
  QUICK_CREATE_INBOX_TASK: 'flow_quick_create_inbox_task',
  COMPLETE_CURRENT_TASK: 'flow_complete_current_task',
  // MCP Capability Enhancement - Task Management
  GET_TASK: 'flow_get_task',
  UPDATE_TASK: 'flow_update_task',
  DELETE_TASK: 'flow_delete_task',
  GET_BACKLOG_TASKS: 'flow_get_backlog_tasks',
  GET_OVERDUE_TASKS: 'flow_get_overdue_tasks',
  MOVE_TASK: 'flow_move_task',
  SET_PLAN_DATE: 'flow_set_plan_date',
  // MCP Capability Enhancement - Project Management
  CREATE_PROJECT: 'flow_create_project',
  UPDATE_PROJECT: 'flow_update_project',
  GET_PROJECT: 'flow_get_project',
  // MCP Capability Enhancement - Daily State
  GET_TOP3: 'flow_get_top3',
  SET_TOP3: 'flow_set_top3',
  // Record pomodoro retroactively
  RECORD_POMODORO: 'flow_record_pomodoro',
  // Screen Time temporary unblock
  REQUEST_TEMPORARY_UNBLOCK: 'flow_request_temporary_unblock',
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

// New AI-Native Enhancement tool inputs (Requirements 4.1-4.4)

// Requirement 4.1: Batch update tasks
interface BatchUpdateTasksInput {
  updates: Array<{
    task_id: string;
    status?: 'TODO' | 'IN_PROGRESS' | 'DONE';
    priority?: 'P1' | 'P2' | 'P3';
    plan_date?: string; // ISO date string
  }>;
}

// Requirement 4.2: Create project from template
interface CreateProjectFromTemplateInput {
  template_id: string;
  project_name: string;
  goal_id?: string;
}

// Requirement 4.3: Analyze task dependencies
interface AnalyzeTaskDependenciesInput {
  project_id: string;
}

// Requirement 4.4: Generate daily summary
interface GenerateDailySummaryInput {
  date?: string; // ISO date string, defaults to today
}

// Requirement 8.1: Create task from natural language
interface CreateTaskFromNLInput {
  description: string;           // Natural language task description
  project_id?: string;           // Optional project ID (if known)
  confirm?: boolean;             // If true, create task immediately; if false, return parsed result
}

// Multi-task Pomodoro tools (Phase 6)
interface SwitchTaskInput {
  pomodoro_id: string;
  new_task_id: string | null;
}

interface StartTasklessPomodoroInput {
  label?: string;
}

interface QuickCreateInboxTaskInput {
  title: string;
}

interface CompleteCurrentTaskInput {
  pomodoro_id: string;
  next_task_id?: string | null;
}

// MCP Capability Enhancement - Task Management
interface GetTaskInput {
  task_id: string;
}

interface UpdateTaskInput {
  task_id: string;
  title?: string;
  description?: string;
  priority?: 'P1' | 'P2' | 'P3';
  estimated_minutes?: number;
  plan_date?: string | null;
}

interface DeleteTaskInput {
  task_id: string;
  archive?: boolean;
}

interface GetBacklogTasksInput {
  project_id?: string;
  limit?: number;
}

interface GetOverdueTasksInput {
  project_id?: string;
  include_today?: boolean;
}

interface MoveTaskInput {
  task_id: string;
  target_project_id: string;
}

interface SetPlanDateInput {
  task_id: string;
  plan_date: string | null;
}

// MCP Capability Enhancement - Project Management
interface CreateProjectInput {
  title: string;
  deliverable: string;
  goal_id?: string;
}

interface UpdateProjectInput {
  project_id: string;
  title?: string;
  deliverable?: string;
  status?: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
}

interface GetProjectInput {
  project_id: string;
  include_tasks?: boolean;
}

// MCP Capability Enhancement - Daily State
interface SetTop3Input {
  task_ids: string[];
}

// Record pomodoro retroactively
interface RecordPomodoroMCPInput {
  task_id?: string;
  duration: number;
  completed_at: string;
  summary?: string;
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
 * Convert TRPCClientError to a standard error object
 */
function trpcErrorToResult(error: unknown): { success: false; error: { code: string; message: string } } {
  if (error instanceof TRPCClientError) {
    return {
      success: false,
      error: {
        code: error.data?.code || 'INTERNAL_ERROR',
        message: error.message,
      },
    };
  }
  return {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
    },
  };
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
      // New AI-Native Enhancement tools (Requirements 4.1-4.4)
      {
        name: TOOLS.BATCH_UPDATE_TASKS,
        description: 'Update multiple tasks in a single operation. Supports updating status, priority, and plan date.',
        inputSchema: {
          type: 'object',
          properties: {
            updates: {
              type: 'array',
              description: 'Array of task updates to apply',
              items: {
                type: 'object',
                properties: {
                  task_id: {
                    type: 'string',
                    description: 'The UUID of the task to update',
                  },
                  status: {
                    type: 'string',
                    enum: ['TODO', 'IN_PROGRESS', 'DONE'],
                    description: 'New status for the task',
                  },
                  priority: {
                    type: 'string',
                    enum: ['P1', 'P2', 'P3'],
                    description: 'New priority for the task',
                  },
                  plan_date: {
                    type: 'string',
                    description: 'New plan date in ISO format (YYYY-MM-DD)',
                  },
                },
                required: ['task_id'],
              },
            },
          },
          required: ['updates'],
        },
      },
      {
        name: TOOLS.CREATE_PROJECT_FROM_TEMPLATE,
        description: 'Create a new project with predefined tasks from a template',
        inputSchema: {
          type: 'object',
          properties: {
            template_id: {
              type: 'string',
              description: 'The UUID of the project template to use',
            },
            project_name: {
              type: 'string',
              description: 'Name for the new project',
            },
            goal_id: {
              type: 'string',
              description: 'Optional goal ID to link the project to',
            },
          },
          required: ['template_id', 'project_name'],
        },
      },
      {
        name: TOOLS.ANALYZE_TASK_DEPENDENCIES,
        description: 'Analyze task dependencies within a project and suggest optimal execution order',
        inputSchema: {
          type: 'object',
          properties: {
            project_id: {
              type: 'string',
              description: 'The UUID of the project to analyze',
            },
          },
          required: ['project_id'],
        },
      },
      {
        name: TOOLS.GENERATE_DAILY_SUMMARY,
        description: 'Generate a comprehensive summary of daily work including completed tasks, pomodoro stats, and suggestions',
        inputSchema: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description: 'Date in ISO format (YYYY-MM-DD). Defaults to today.',
            },
          },
          required: [],
        },
      },
      // Natural Language Task Creation (Requirement 8.1)
      {
        name: TOOLS.CREATE_TASK_FROM_NL,
        description: 'Create a task from natural language description. Parses priority, date, and time estimates from the text. Use confirm=false to preview parsed result before creation.',
        inputSchema: {
          type: 'object',
          properties: {
            description: {
              type: 'string',
              description: 'Natural language task description (e.g., "urgent: fix login bug tomorrow 2 hours")',
            },
            project_id: {
              type: 'string',
              description: 'Optional project ID. If not provided, will attempt to infer from description or prompt for selection.',
            },
            confirm: {
              type: 'boolean',
              description: 'If true, create task immediately. If false (default), return parsed result for confirmation.',
            },
          },
          required: ['description'],
        },
      },
      // Multi-task Pomodoro tools (Phase 6)
      {
        name: TOOLS.SWITCH_TASK,
        description: 'Switch to a different task during an active pomodoro session',
        inputSchema: {
          type: 'object',
          properties: {
            pomodoro_id: { type: 'string', description: 'The UUID of the active pomodoro' },
            new_task_id: { type: ['string', 'null'], description: 'The UUID of the task to switch to, or null for taskless' },
          },
          required: ['pomodoro_id', 'new_task_id'],
        },
      },
      {
        name: TOOLS.START_TASKLESS_POMODORO,
        description: 'Start a pomodoro session without associating it with a specific task',
        inputSchema: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Optional label for the taskless pomodoro' },
          },
          required: [],
        },
      },
      {
        name: TOOLS.QUICK_CREATE_INBOX_TASK,
        description: 'Quickly create a task in the inbox (first active project)',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'The title of the task to create' },
          },
          required: ['title'],
        },
      },
      {
        name: TOOLS.COMPLETE_CURRENT_TASK,
        description: 'Complete the current task during an active pomodoro and optionally switch to another task',
        inputSchema: {
          type: 'object',
          properties: {
            pomodoro_id: { type: 'string', description: 'The UUID of the active pomodoro' },
            next_task_id: { type: ['string', 'null'], description: 'Optional task to switch to after completing current task' },
          },
          required: ['pomodoro_id'],
        },
      },
      // MCP Capability Enhancement - Task Management
      {
        name: TOOLS.GET_TASK,
        description: 'Get detailed information about a specific task including subtasks, pomodoro history, and blockers',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: 'The UUID of the task' },
          },
          required: ['task_id'],
        },
      },
      {
        name: TOOLS.UPDATE_TASK,
        description: 'Update task properties like title, description, priority, estimated time, or plan date',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: 'The UUID of the task to update' },
            title: { type: 'string', description: 'New title for the task' },
            description: { type: 'string', description: 'New description for the task' },
            priority: { type: 'string', enum: ['P1', 'P2', 'P3'], description: 'New priority level' },
            estimated_minutes: { type: 'number', description: 'Estimated time in minutes' },
            plan_date: { type: ['string', 'null'], description: 'Plan date in ISO format (YYYY-MM-DD) or null to clear' },
          },
          required: ['task_id'],
        },
      },
      {
        name: TOOLS.DELETE_TASK,
        description: 'Delete or archive a task (soft delete by default)',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: 'The UUID of the task to delete' },
            archive: { type: 'boolean', description: 'If true (default), soft delete. If false, hard delete.' },
          },
          required: ['task_id'],
        },
      },
      {
        name: TOOLS.GET_BACKLOG_TASKS,
        description: 'Get tasks without a plan date (backlog)',
        inputSchema: {
          type: 'object',
          properties: {
            project_id: { type: 'string', description: 'Optional project ID to filter by' },
            limit: { type: 'number', description: 'Maximum number of tasks to return (default: 50)' },
          },
          required: [],
        },
      },
      {
        name: TOOLS.GET_OVERDUE_TASKS,
        description: 'Get tasks that are past their plan date',
        inputSchema: {
          type: 'object',
          properties: {
            project_id: { type: 'string', description: 'Optional project ID to filter by' },
            include_today: { type: 'boolean', description: 'Include tasks planned for today (default: false)' },
          },
          required: [],
        },
      },
      {
        name: TOOLS.MOVE_TASK,
        description: 'Move a task to a different project',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: 'The UUID of the task to move' },
            target_project_id: { type: 'string', description: 'The UUID of the target project' },
          },
          required: ['task_id', 'target_project_id'],
        },
      },
      {
        name: TOOLS.SET_PLAN_DATE,
        description: 'Set or clear the plan date for a task',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: 'The UUID of the task' },
            plan_date: { type: ['string', 'null'], description: 'Plan date in ISO format (YYYY-MM-DD) or null to clear' },
          },
          required: ['task_id', 'plan_date'],
        },
      },
      // MCP Capability Enhancement - Project Management
      {
        name: TOOLS.CREATE_PROJECT,
        description: 'Create a new project',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Project title' },
            deliverable: { type: 'string', description: 'Project deliverable description' },
            goal_id: { type: 'string', description: 'Optional goal ID to link the project to' },
          },
          required: ['title', 'deliverable'],
        },
      },
      {
        name: TOOLS.UPDATE_PROJECT,
        description: 'Update project properties',
        inputSchema: {
          type: 'object',
          properties: {
            project_id: { type: 'string', description: 'The UUID of the project to update' },
            title: { type: 'string', description: 'New title for the project' },
            deliverable: { type: 'string', description: 'New deliverable description' },
            status: { type: 'string', enum: ['ACTIVE', 'COMPLETED', 'ARCHIVED'], description: 'New status' },
          },
          required: ['project_id'],
        },
      },
      {
        name: TOOLS.GET_PROJECT,
        description: 'Get detailed information about a project including tasks and progress',
        inputSchema: {
          type: 'object',
          properties: {
            project_id: { type: 'string', description: 'The UUID of the project' },
            include_tasks: { type: 'boolean', description: 'Include task list (default: true)' },
          },
          required: ['project_id'],
        },
      },
      // MCP Capability Enhancement - Daily State
      {
        name: TOOLS.GET_TOP3,
        description: 'Get the current Top 3 priority tasks for today',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: TOOLS.SET_TOP3,
        description: 'Set the Top 3 priority tasks for today',
        inputSchema: {
          type: 'object',
          properties: {
            task_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of 1-3 task IDs to set as Top 3',
            },
          },
          required: ['task_ids'],
        },
      },
      {
        name: TOOLS.RECORD_POMODORO,
        description: 'Record a pomodoro retroactively (for forgotten sessions)',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: 'Optional task ID to associate with the pomodoro' },
            duration: { type: 'number', description: 'Duration in minutes (10-120)' },
            completed_at: { type: 'string', description: 'Completion time in ISO 8601 format' },
            summary: { type: 'string', description: 'Optional summary of what was done' },
          },
          required: ['duration', 'completed_at'],
        },
      },
      {
        name: TOOLS.REQUEST_TEMPORARY_UNBLOCK,
        description: '临时解除 Screen Time 应用屏蔽。用户必须提供理由和时长。每天限 3 次，每次最长 15 分钟。',
        inputSchema: {
          type: 'object',
          properties: {
            reason_text: { type: 'string', description: '用户说明的临时解锁理由' },
            duration: { type: 'number', description: '请求的解锁时长（分钟，1-15）' },
          },
          required: ['reason_text', 'duration'],
        },
      },
    ],
  };
}

/**
 * Handle tool calls with audit logging
 * Requirement 4.5: Log all tool calls for audit purposes
 */
export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  context: MCPContext
): Promise<ToolResponse> {
  const startTime = Date.now();
  let result: unknown;
  let success = true;

  try {
    switch (name) {
      case TOOLS.COMPLETE_TASK:
        result = await completeTask(args as unknown as CompleteTaskInput);
        break;
      case TOOLS.ADD_SUBTASK:
        result = await addSubtask(args as unknown as AddSubtaskInput);
        break;
      case TOOLS.REPORT_BLOCKER:
        result = await reportBlocker(args as unknown as ReportBlockerInput);
        break;
      case TOOLS.START_POMODORO:
        result = await startPomodoro(args as unknown as StartPomodoroInput);
        break;
      case TOOLS.GET_TASK_CONTEXT:
        result = await getTaskContext(args as unknown as GetTaskContextInput);
        break;
      // New AI-Native Enhancement tools (Requirements 4.1-4.4)
      case TOOLS.BATCH_UPDATE_TASKS:
        result = await batchUpdateTasks(args as unknown as BatchUpdateTasksInput);
        break;
      case TOOLS.CREATE_PROJECT_FROM_TEMPLATE:
        result = await createProjectFromTemplate(args as unknown as CreateProjectFromTemplateInput);
        break;
      case TOOLS.ANALYZE_TASK_DEPENDENCIES:
        result = await analyzeTaskDependencies(args as unknown as AnalyzeTaskDependenciesInput);
        break;
      case TOOLS.GENERATE_DAILY_SUMMARY:
        result = await generateDailySummary(args as unknown as GenerateDailySummaryInput);
        break;
      // Natural Language Task Creation (Requirement 8.1)
      case TOOLS.CREATE_TASK_FROM_NL:
        result = await createTaskFromNL(args as unknown as CreateTaskFromNLInput);
        break;
      // Multi-task Pomodoro tools (Phase 6)
      case TOOLS.SWITCH_TASK:
        result = await switchTask(args as unknown as SwitchTaskInput);
        break;
      case TOOLS.START_TASKLESS_POMODORO:
        result = await startTasklessPomodoro(args as unknown as StartTasklessPomodoroInput);
        break;
      case TOOLS.QUICK_CREATE_INBOX_TASK:
        result = await quickCreateInboxTask(args as unknown as QuickCreateInboxTaskInput);
        break;
      case TOOLS.COMPLETE_CURRENT_TASK:
        result = await completeCurrentTask(args as unknown as CompleteCurrentTaskInput);
        break;
      // MCP Capability Enhancement - Task Management
      case TOOLS.GET_TASK:
        result = await getTask(args as unknown as GetTaskInput);
        break;
      case TOOLS.UPDATE_TASK:
        result = await updateTask(args as unknown as UpdateTaskInput);
        break;
      case TOOLS.DELETE_TASK:
        result = await deleteTask(args as unknown as DeleteTaskInput);
        break;
      case TOOLS.GET_BACKLOG_TASKS:
        result = await getBacklogTasks(args as unknown as GetBacklogTasksInput);
        break;
      case TOOLS.GET_OVERDUE_TASKS:
        result = await getOverdueTasks(args as unknown as GetOverdueTasksInput);
        break;
      case TOOLS.MOVE_TASK:
        result = await moveTask(args as unknown as MoveTaskInput);
        break;
      case TOOLS.SET_PLAN_DATE:
        result = await setPlanDate(args as unknown as SetPlanDateInput);
        break;
      // MCP Capability Enhancement - Project Management
      case TOOLS.CREATE_PROJECT:
        result = await createProject(args as unknown as CreateProjectInput);
        break;
      case TOOLS.UPDATE_PROJECT:
        result = await updateProject(args as unknown as UpdateProjectInput);
        break;
      case TOOLS.GET_PROJECT:
        result = await getProject(args as unknown as GetProjectInput);
        break;
      // MCP Capability Enhancement - Daily State
      case TOOLS.GET_TOP3:
        result = await getTop3();
        break;
      case TOOLS.SET_TOP3:
        result = await setTop3(args as unknown as SetTop3Input);
        break;
      case TOOLS.RECORD_POMODORO:
        result = await recordPomodoro(args as unknown as RecordPomodoroMCPInput);
        break;
      case TOOLS.REQUEST_TEMPORARY_UNBLOCK:
        result = await requestTemporaryUnblock(args as { reason_text: string; duration: number });
        break;
      default:
        success = false;
        result = {
          success: false,
          error: { code: 'NOT_FOUND', message: `Unknown tool: ${name}` },
        };
    }

    // Check if the result indicates failure
    if (typeof result === 'object' && result !== null && 'success' in result) {
      success = (result as { success: boolean }).success;
    }

    // Log the tool call for audit (fire-and-forget)
    const duration = Date.now() - startTime;
    trpcClient.mcpBridge.logMcpAudit.mutate({
      agentId: context.agentId || 'unknown',
      toolName: name,
      input: args,
      output: (result as Record<string, unknown>) || {},
      success,
      duration,
    }).catch(() => {
      // Fire-and-forget: ignore audit logging errors
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorResult = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Tool execution failed',
      },
    };

    // Log failed tool call (fire-and-forget)
    trpcClient.mcpBridge.logMcpAudit.mutate({
      agentId: context.agentId || 'unknown',
      toolName: name,
      input: args,
      output: errorResult,
      success: false,
      duration,
    }).catch(() => {
      // Fire-and-forget
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(errorResult),
      }],
    };
  }
}

// ============================================================================
// Tool implementations — all via tRPC HTTP client
// ============================================================================

async function completeTask(input: CompleteTaskInput) {
  if (!input.task_id || !input.summary) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'task_id and summary are required' } };
  }

  try {
    const result = await trpcClient.task.updateStatus.mutate({
      id: input.task_id,
      status: 'DONE',
      cascadeToSubtasks: false,
    });
    return {
      success: true,
      task: { id: result!.id, title: result!.title, status: result!.status, summary: input.summary },
    };
  } catch (error) {
    return trpcErrorToResult(error);
  }
}

async function addSubtask(input: AddSubtaskInput) {
  if (!input.parent_id || !input.title) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'parent_id and title are required' } };
  }

  try {
    // Get parent task to find projectId
    const parentTask = await trpcClient.task.getById.query({ id: input.parent_id });
    if (!parentTask) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Parent task not found' } };
    }

    const result = await trpcClient.task.create.mutate({
      title: input.title,
      projectId: parentTask.projectId,
      parentId: input.parent_id,
      priority: input.priority || 'P2',
    });

    return {
      success: true,
      task: { id: result!.id, title: result!.title, priority: result!.priority, parentId: result!.parentId, projectId: result!.projectId },
    };
  } catch (error) {
    return trpcErrorToResult(error);
  }
}

async function reportBlocker(input: ReportBlockerInput) {
  if (!input.task_id || !input.error_log) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'task_id and error_log are required' } };
  }

  try {
    const result = await trpcClient.mcpBridge.createBlocker.mutate({
      taskId: input.task_id,
      errorLog: input.error_log,
    });
    return { success: true, blocker_id: result.blockerId };
  } catch (error) {
    return trpcErrorToResult(error);
  }
}

async function startPomodoro(input: StartPomodoroInput) {
  if (!input.task_id) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'task_id is required' } };
  }

  try {
    const result = await trpcClient.pomodoro.start.mutate({
      taskId: input.task_id,
      duration: input.duration,
    });
    return {
      success: true,
      pomodoro: { id: result!.id, taskId: result!.taskId, duration: result!.duration, startTime: result!.startTime, status: result!.status },
    };
  } catch (error) {
    return trpcErrorToResult(error);
  }
}

async function getTaskContext(input: GetTaskContextInput) {
  if (!input.task_id) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'task_id is required' } };
  }

  try {
    const result = await trpcClient.mcpBridge.getTaskContext.query({ taskId: input.task_id });
    return { success: true, ...result };
  } catch (error) {
    return trpcErrorToResult(error);
  }
}

async function batchUpdateTasks(input: BatchUpdateTasksInput) {
  if (!input.updates || !Array.isArray(input.updates) || input.updates.length === 0) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'updates array is required and must not be empty' } };
  }

  try {
    const result = await trpcClient.mcpBridge.batchUpdateTasks.mutate({
      updates: input.updates.map(u => ({
        taskId: u.task_id,
        status: u.status,
        priority: u.priority,
        planDate: u.plan_date,
      })),
    });
    return { success: true, updated: result.updated, failed: result.failed };
  } catch (error) {
    return trpcErrorToResult(error);
  }
}

async function createProjectFromTemplate(input: CreateProjectFromTemplateInput) {
  if (!input.template_id || !input.project_name) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'template_id and project_name are required' } };
  }

  try {
    const result = await trpcClient.mcpBridge.createProjectFromTemplate.mutate({
      templateId: input.template_id,
      projectName: input.project_name,
      goalId: input.goal_id,
    });
    return { success: true, project: result };
  } catch (error) {
    return trpcErrorToResult(error);
  }
}

async function analyzeTaskDependencies(input: AnalyzeTaskDependenciesInput) {
  if (!input.project_id) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'project_id is required' } };
  }

  try {
    const result = await trpcClient.mcpBridge.analyzeTaskDependencies.query({ projectId: input.project_id });
    return { success: true, ...result };
  } catch (error) {
    return trpcErrorToResult(error);
  }
}

async function generateDailySummary(input: GenerateDailySummaryInput) {
  try {
    const result = await trpcClient.mcpBridge.generateDailySummary.query({ date: input.date });
    return { success: true, ...result };
  } catch (error) {
    return trpcErrorToResult(error);
  }
}

async function createTaskFromNL(input: CreateTaskFromNLInput) {
  if (!input.description || input.description.trim().length === 0) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'description is required' } };
  }

  try {
    const result = await trpcClient.mcpBridge.createTaskFromNl.mutate({
      description: input.description,
      projectId: input.project_id,
      confirm: input.confirm ?? false,
    });

    if (result.task) {
      return { success: true, task: result.task };
    }
    return { success: true, parsed: result.parsed, projectCandidates: result.projectCandidates };
  } catch (error) {
    return trpcErrorToResult(error);
  }
}

async function switchTask(input: SwitchTaskInput) {
  if (!input.pomodoro_id) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'pomodoro_id is required' } };
  }

  try {
    // We need the current slice ID; get time slices first
    const slices = await trpcClient.timeSlice.getByPomodoro.query({ pomodoroId: input.pomodoro_id });
    const activeSlice = Array.isArray(slices) ? slices.find((s: { endTime: unknown }) => !s.endTime) : null;
    const currentSliceId = activeSlice?.id ?? null;

    const result = await trpcClient.timeSlice.switch.mutate({
      pomodoroId: input.pomodoro_id,
      currentSliceId,
      newTaskId: input.new_task_id,
    });

    return { success: true, slice: { id: result!.id, taskId: result!.taskId, startTime: result!.startTime } };
  } catch (error) {
    return trpcErrorToResult(error);
  }
}

async function startTasklessPomodoro(input: StartTasklessPomodoroInput) {
  try {
    const result = await trpcClient.pomodoro.startTaskless.mutate({
      label: input.label,
    });
    return {
      success: true,
      pomodoro: { id: result!.id, label: result!.label, startTime: result!.startTime, isTaskless: true },
    };
  } catch (error) {
    return trpcErrorToResult(error);
  }
}

async function quickCreateInboxTask(input: QuickCreateInboxTaskInput) {
  if (!input.title?.trim()) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'title is required' } };
  }

  try {
    const result = await trpcClient.task.quickCreateInbox.mutate({ title: input.title.trim() });
    return { success: true, task: { id: result!.id, title: result!.title, projectId: result!.projectId } };
  } catch (error) {
    return trpcErrorToResult(error);
  }
}

async function completeCurrentTask(input: CompleteCurrentTaskInput) {
  if (!input.pomodoro_id) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'pomodoro_id is required' } };
  }

  try {
    const result = await trpcClient.pomodoro.completeTask.mutate({
      pomodoroId: input.pomodoro_id,
      nextTaskId: input.next_task_id,
    });
    return { success: true, completedTask: result };
  } catch (error) {
    return trpcErrorToResult(error);
  }
}

async function getTask(input: GetTaskInput) {
  if (!input.task_id) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'task_id is required' } };
  }

  try {
    const task = await trpcClient.task.getById.query({ id: input.task_id });
    if (!task) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } };
    }
    return { success: true, task };
  } catch (error) {
    return trpcErrorToResult(error);
  }
}

async function updateTask(input: UpdateTaskInput) {
  if (!input.task_id) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'task_id is required' } };
  }

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.estimated_minutes !== undefined) data.estimatedMinutes = input.estimated_minutes;
  if (input.plan_date !== undefined) {
    data.planDate = input.plan_date ? new Date(input.plan_date) : null;
  }
  // Note: description is not supported by task.update schema — we map what we can
  if (input.description !== undefined) data.status = undefined; // description not in UpdateTaskSchema

  if (Object.keys(data).filter(k => data[k] !== undefined).length === 0) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } };
  }

  try {
    const result = await trpcClient.task.update.mutate({
      id: input.task_id,
      data: data as { title?: string; priority?: 'P1' | 'P2' | 'P3'; planDate?: Date | null; estimatedMinutes?: number | null },
    });
    return {
      success: true,
      task: { id: result!.id, title: result!.title, priority: result!.priority, status: result!.status },
    };
  } catch (error) {
    return trpcErrorToResult(error);
  }
}

async function deleteTask(input: DeleteTaskInput) {
  if (!input.task_id) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'task_id is required' } };
  }

  const archive = input.archive !== false; // default true

  try {
    if (archive) {
      await trpcClient.task.updateStatus.mutate({ id: input.task_id, status: 'DONE' });
    } else {
      await trpcClient.task.delete.mutate({ id: input.task_id });
    }
    return { success: true };
  } catch (error) {
    return trpcErrorToResult(error);
  }
}

async function getBacklogTasks(_input: GetBacklogTasksInput) {
  try {
    const tasks = await trpcClient.task.getBacklog.query();
    return { success: true, tasks };
  } catch (error) {
    return trpcErrorToResult(error);
  }
}

async function getOverdueTasks(_input: GetOverdueTasksInput) {
  try {
    const tasks = await trpcClient.task.getOverdue.query();
    return { success: true, tasks };
  } catch (error) {
    return trpcErrorToResult(error);
  }
}

async function moveTask(input: MoveTaskInput) {
  if (!input.task_id || !input.target_project_id) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'task_id and target_project_id are required' } };
  }

  try {
    const result = await trpcClient.mcpBridge.moveTask.mutate({
      taskId: input.task_id,
      targetProjectId: input.target_project_id,
    });
    return { success: true, task: result };
  } catch (error) {
    return trpcErrorToResult(error);
  }
}

async function setPlanDate(input: SetPlanDateInput) {
  if (!input.task_id) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'task_id is required' } };
  }

  try {
    const result = await trpcClient.task.setPlanDate.mutate({
      id: input.task_id,
      planDate: input.plan_date ? new Date(input.plan_date) : null,
    });
    return { success: true, task: { id: result!.id, title: result!.title } };
  } catch (error) {
    return trpcErrorToResult(error);
  }
}

async function createProject(input: CreateProjectInput) {
  if (!input.title || !input.deliverable) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'title and deliverable are required' } };
  }

  try {
    const result = await trpcClient.project.create.mutate({
      title: input.title,
      deliverable: input.deliverable,
      goalIds: input.goal_id ? [input.goal_id] : undefined,
    });
    return {
      success: true,
      project: { id: result!.id, title: result!.title, deliverable: result!.deliverable, status: result!.status },
    };
  } catch (error) {
    return trpcErrorToResult(error);
  }
}

async function updateProject(input: UpdateProjectInput) {
  if (!input.project_id) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'project_id is required' } };
  }

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.deliverable !== undefined) data.deliverable = input.deliverable;
  if (input.status !== undefined) data.status = input.status;

  if (Object.keys(data).length === 0) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } };
  }

  try {
    const result = await trpcClient.project.update.mutate({
      id: input.project_id,
      data: data as { title?: string; deliverable?: string; status?: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED' },
    });
    return {
      success: true,
      project: { id: result!.id, title: result!.title, deliverable: result!.deliverable, status: result!.status },
    };
  } catch (error) {
    return trpcErrorToResult(error);
  }
}

async function getProject(input: GetProjectInput) {
  if (!input.project_id) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'project_id is required' } };
  }

  try {
    const project = await trpcClient.project.getById.query({ id: input.project_id });
    if (!project) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } };
    }
    return { success: true, project };
  } catch (error) {
    return trpcErrorToResult(error);
  }
}

async function getTop3() {
  try {
    const result = await trpcClient.dailyState.getTop3Tasks.query();
    return { success: true, tasks: result };
  } catch (error) {
    return trpcErrorToResult(error);
  }
}

async function setTop3(input: SetTop3Input) {
  if (!input.task_ids || !Array.isArray(input.task_ids) || input.task_ids.length === 0) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'task_ids array is required (1-3 items)' } };
  }
  if (input.task_ids.length > 3) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'Maximum 3 tasks allowed' } };
  }

  try {
    const result = await trpcClient.mcpBridge.setTop3.mutate({ taskIds: input.task_ids });
    return { success: true, ...result };
  } catch (error) {
    return trpcErrorToResult(error);
  }
}

async function recordPomodoro(input: RecordPomodoroMCPInput) {
  if (!input.duration || !input.completed_at) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'duration and completed_at are required' } };
  }

  try {
    const result = await trpcClient.pomodoro.record.mutate({
      taskId: input.task_id ?? null,
      duration: input.duration,
      completedAt: new Date(input.completed_at),
      summary: input.summary,
    });
    return { success: true, pomodoro: result };
  } catch (error) {
    return trpcErrorToResult(error);
  }
}

async function requestTemporaryUnblock(input: { reason_text: string; duration: number }) {
  try {
    const result = await trpcClient.mcpBridge.requestTemporaryUnblock.mutate({
      reasonText: input.reason_text,
      duration: input.duration,
    });
    return { success: true, data: result };
  } catch (error) {
    return trpcErrorToResult(error);
  }
}
