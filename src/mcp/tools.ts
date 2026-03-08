/**
 * MCP Tools Module
 * 
 * Implements executable actions for external AI agents.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 9.5, 9.6, 9.7, 10.2
 */

import type { MCPContext } from './auth';
import prisma from '../lib/prisma';
import { taskService } from '../services/task.service';
import { pomodoroService } from '../services/pomodoro.service';
import { activityLogService } from '../services/activity-log.service';
import { mcpAuditService } from '../services/mcp-audit.service';
import { efficiencyAnalysisService } from '../services/efficiency-analysis.service';
import { nlParserService } from '../services/nl-parser.service';
import { timeSliceService } from '../services/time-slice.service';

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
      // New AI-Native Enhancement tools (Requirements 4.1-4.4)
      case TOOLS.BATCH_UPDATE_TASKS:
        result = await batchUpdateTasks(args as unknown as BatchUpdateTasksInput, context);
        break;
      case TOOLS.CREATE_PROJECT_FROM_TEMPLATE:
        result = await createProjectFromTemplate(args as unknown as CreateProjectFromTemplateInput, context);
        break;
      case TOOLS.ANALYZE_TASK_DEPENDENCIES:
        result = await analyzeTaskDependencies(args as unknown as AnalyzeTaskDependenciesInput, context);
        break;
      case TOOLS.GENERATE_DAILY_SUMMARY:
        result = await generateDailySummary(args as unknown as GenerateDailySummaryInput, context);
        break;
      // Natural Language Task Creation (Requirement 8.1)
      case TOOLS.CREATE_TASK_FROM_NL:
        result = await createTaskFromNL(args as unknown as CreateTaskFromNLInput, context);
        break;
      // Multi-task Pomodoro tools (Phase 6)
      case TOOLS.SWITCH_TASK:
        result = await switchTask(args as unknown as SwitchTaskInput, context);
        break;
      case TOOLS.START_TASKLESS_POMODORO:
        result = await startTasklessPomodoro(args as unknown as StartTasklessPomodoroInput, context);
        break;
      case TOOLS.QUICK_CREATE_INBOX_TASK:
        result = await quickCreateInboxTask(args as unknown as QuickCreateInboxTaskInput, context);
        break;
      case TOOLS.COMPLETE_CURRENT_TASK:
        result = await completeCurrentTask(args as unknown as CompleteCurrentTaskInput, context);
        break;
      // MCP Capability Enhancement - Task Management
      case TOOLS.GET_TASK:
        result = await getTask(args as unknown as GetTaskInput, context);
        break;
      case TOOLS.UPDATE_TASK:
        result = await updateTask(args as unknown as UpdateTaskInput, context);
        break;
      case TOOLS.DELETE_TASK:
        result = await deleteTask(args as unknown as DeleteTaskInput, context);
        break;
      case TOOLS.GET_BACKLOG_TASKS:
        result = await getBacklogTasks(args as unknown as GetBacklogTasksInput, context);
        break;
      case TOOLS.GET_OVERDUE_TASKS:
        result = await getOverdueTasks(args as unknown as GetOverdueTasksInput, context);
        break;
      case TOOLS.MOVE_TASK:
        result = await moveTask(args as unknown as MoveTaskInput, context);
        break;
      case TOOLS.SET_PLAN_DATE:
        result = await setPlanDate(args as unknown as SetPlanDateInput, context);
        break;
      // MCP Capability Enhancement - Project Management
      case TOOLS.CREATE_PROJECT:
        result = await createProject(args as unknown as CreateProjectInput, context);
        break;
      case TOOLS.UPDATE_PROJECT:
        result = await updateProject(args as unknown as UpdateProjectInput, context);
        break;
      case TOOLS.GET_PROJECT:
        result = await getProject(args as unknown as GetProjectInput, context);
        break;
      // MCP Capability Enhancement - Daily State
      case TOOLS.GET_TOP3:
        result = await getTop3(context);
        break;
      case TOOLS.SET_TOP3:
        result = await setTop3(args as unknown as SetTop3Input, context);
        break;
      case TOOLS.RECORD_POMODORO:
        result = await recordPomodoro(args as unknown as RecordPomodoroMCPInput, context);
        break;
      case TOOLS.REQUEST_TEMPORARY_UNBLOCK: {
        const { screenTimeExemptionService } = await import('../services/screen-time-exemption.service');
        const { pomodoroService: pomSvc } = await import('../services/pomodoro.service');
        const { sleepTimeService: sleepSvc } = await import('../services/sleep-time.service');
        const { overRestService: orSvc } = await import('../services/over-rest.service');

        // Determine blocking reason
        let blockingReason: 'focus' | 'over_rest' | 'sleep' | null = null;
        const pomResult = await pomSvc.getCurrent(context.userId);
        if (pomResult.success && pomResult.data) blockingReason = 'focus';
        if (!blockingReason) {
          const orResult = await orSvc.checkOverRestStatus(context.userId);
          if (orResult.success && orResult.data?.isOverRest && orResult.data?.shouldTriggerActions) blockingReason = 'over_rest';
        }
        if (!blockingReason) {
          const sleepResult = await sleepSvc.isInSleepTime(context.userId);
          if (sleepResult.success && sleepResult.data) blockingReason = 'sleep';
        }

        if (!blockingReason) {
          result = { success: false, error: { code: 'VALIDATION_ERROR', message: '当前没有活跃的 Screen Time 阻断' } };
        } else {
          const input = args as { reason_text: string; duration: number };
          result = await screenTimeExemptionService.requestTemporaryUnblock(context.userId, {
            reasonText: input.reason_text,
            duration: input.duration,
            blockingReason,
          });
        }
        break;
      }
      default:
        success = false;
        result = {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Unknown tool: ${name}`,
          },
        };
    }

    // Check if the result indicates failure
    if (typeof result === 'object' && result !== null && 'success' in result) {
      success = (result as { success: boolean }).success;
    }

    // Log the tool call for audit (Requirement 4.5)
    const duration = Date.now() - startTime;
    await mcpAuditService.logToolCall(context.userId, {
      agentId: context.agentId || 'unknown',
      toolName: name,
      input: args,
      output: result as Record<string, unknown>,
      success,
      duration,
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

    // Log failed tool call for audit (Requirement 4.5)
    await mcpAuditService.logToolCall(context.userId, {
      agentId: context.agentId || 'unknown',
      toolName: name,
      input: args,
      output: errorResult,
      success: false,
      duration,
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(errorResult),
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

/**
 * Batch update multiple tasks in a single operation
 * Requirement 4.1: Support batch updates for status, priority, and plan date
 */
async function batchUpdateTasks(
  input: BatchUpdateTasksInput,
  context: MCPContext
): Promise<{
  success: boolean;
  updated?: number;
  failed?: Array<{ taskId: string; error: string }>;
  error?: unknown;
}> {
  // Validate input
  if (!input.updates || !Array.isArray(input.updates) || input.updates.length === 0) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'updates array is required and must not be empty',
      },
    };
  }

  const failed: Array<{ taskId: string; error: string }> = [];
  let updatedCount = 0;

  // Process updates atomically using a transaction
  try {
    await prisma.$transaction(async (tx) => {
      for (const update of input.updates) {
        if (!update.task_id) {
          failed.push({ taskId: 'unknown', error: 'task_id is required' });
          continue;
        }

        // Verify task exists and belongs to user
        const task = await tx.task.findFirst({
          where: {
            id: update.task_id,
            userId: context.userId,
          },
        });

        if (!task) {
          failed.push({ taskId: update.task_id, error: 'Task not found or access denied' });
          continue;
        }

        // Build update data
        const updateData: {
          status?: 'TODO' | 'IN_PROGRESS' | 'DONE';
          priority?: 'P1' | 'P2' | 'P3';
          planDate?: Date | null;
        } = {};

        if (update.status) {
          updateData.status = update.status;
        }

        if (update.priority) {
          updateData.priority = update.priority;
        }

        if (update.plan_date !== undefined) {
          updateData.planDate = update.plan_date ? new Date(update.plan_date) : null;
        }

        // Only update if there's something to update
        if (Object.keys(updateData).length > 0) {
          await tx.task.update({
            where: { id: update.task_id },
            data: updateData,
          });
          updatedCount++;
        }
      }

      // If all updates failed, throw to rollback transaction
      if (updatedCount === 0 && failed.length > 0) {
        throw new Error('All updates failed');
      }
    });

    return {
      success: true,
      updated: updatedCount,
      failed: failed.length > 0 ? failed : undefined,
    };
  } catch (error) {
    // If transaction failed, return error
    if (error instanceof Error && error.message === 'All updates failed') {
      return {
        success: false,
        updated: 0,
        failed,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'All task updates failed',
        },
      };
    }

    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Batch update failed',
      },
    };
  }
}

/**
 * Create a project from a predefined template
 * Requirement 4.2: Support scaffolding new projects with predefined structures
 */
async function createProjectFromTemplate(
  input: CreateProjectFromTemplateInput,
  context: MCPContext
): Promise<{
  success: boolean;
  project?: {
    id: string;
    title: string;
    tasks: Array<{ id: string; title: string }>;
  };
  error?: unknown;
}> {
  // Validate input
  if (!input.template_id || !input.project_name) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'template_id and project_name are required',
      },
    };
  }

  // Get template
  const template = await prisma.projectTemplate.findFirst({
    where: {
      id: input.template_id,
      OR: [
        { isSystem: true },
        { userId: context.userId },
      ],
    },
  });

  if (!template) {
    return {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Template not found or access denied',
      },
    };
  }

  // Validate goal if provided
  if (input.goal_id) {
    const goal = await prisma.goal.findFirst({
      where: {
        id: input.goal_id,
        userId: context.userId,
      },
    });

    if (!goal) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Goal not found or access denied',
        },
      };
    }
  }

  try {
    // Parse template structure
    const structure = template.structure as {
      deliverable?: string;
      tasks?: Array<{
        title: string;
        priority?: 'P1' | 'P2' | 'P3';
        estimatedMinutes?: number;
        subtasks?: Array<{
          title: string;
          priority?: 'P1' | 'P2' | 'P3';
          estimatedMinutes?: number;
        }>;
      }>;
    };

    // Create project with tasks in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create project
      const project = await tx.project.create({
        data: {
          title: input.project_name,
          deliverable: structure.deliverable || `Project created from template: ${template.name}`,
          userId: context.userId,
          goals: input.goal_id
            ? {
                create: { goalId: input.goal_id },
              }
            : undefined,
        },
      });

      const createdTasks: Array<{ id: string; title: string }> = [];

      // Create tasks from template
      if (structure.tasks && Array.isArray(structure.tasks)) {
        let sortOrder = 0;

        for (const taskDef of structure.tasks) {
          const task = await tx.task.create({
            data: {
              title: taskDef.title,
              priority: taskDef.priority || 'P2',
              estimatedMinutes: taskDef.estimatedMinutes,
              projectId: project.id,
              userId: context.userId,
              sortOrder: sortOrder++,
            },
          });

          createdTasks.push({ id: task.id, title: task.title });

          // Create subtasks if defined
          if (taskDef.subtasks && Array.isArray(taskDef.subtasks)) {
            let subSortOrder = 0;

            for (const subtaskDef of taskDef.subtasks) {
              const subtask = await tx.task.create({
                data: {
                  title: subtaskDef.title,
                  priority: subtaskDef.priority || 'P2',
                  estimatedMinutes: subtaskDef.estimatedMinutes,
                  projectId: project.id,
                  parentId: task.id,
                  userId: context.userId,
                  sortOrder: subSortOrder++,
                },
              });

              createdTasks.push({ id: subtask.id, title: subtask.title });
            }
          }
        }
      }

      return { project, tasks: createdTasks };
    });

    return {
      success: true,
      project: {
        id: result.project.id,
        title: result.project.title,
        tasks: result.tasks,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create project from template',
      },
    };
  }
}

/**
 * Analyze task dependencies within a project
 * Requirement 4.3: Identify dependencies and suggest optimal execution order
 */
async function analyzeTaskDependencies(
  input: AnalyzeTaskDependenciesInput,
  context: MCPContext
): Promise<{
  success: boolean;
  dependencies?: Array<{
    taskId: string;
    taskTitle: string;
    dependsOn: string[];
    blockedBy: string[];
  }>;
  suggestedOrder?: string[];
  criticalPath?: string[];
  error?: unknown;
}> {
  // Validate input
  if (!input.project_id) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'project_id is required',
      },
    };
  }

  // Verify project exists and belongs to user
  const project = await prisma.project.findFirst({
    where: {
      id: input.project_id,
      userId: context.userId,
    },
    include: {
      tasks: {
        where: { status: { not: 'DONE' } },
        include: {
          parent: true,
          subTasks: {
            where: { status: { not: 'DONE' } },
          },
          blockers: {
            where: { status: 'active' },
          },
        },
        orderBy: [
          { priority: 'asc' },
          { sortOrder: 'asc' },
        ],
      },
    },
  });

  if (!project) {
    return {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Project not found or access denied',
      },
    };
  }

  // Build dependency graph
  const dependencies: Array<{
    taskId: string;
    taskTitle: string;
    dependsOn: string[];
    blockedBy: string[];
  }> = [];

  const taskMap = new Map<string, typeof project.tasks[0]>();
  for (const task of project.tasks) {
    taskMap.set(task.id, task);
  }

  // Analyze dependencies based on:
  // 1. Parent-child relationships (children depend on parent being defined)
  // 2. Active blockers
  // 3. Priority ordering (P1 tasks should be done before P2/P3)
  for (const task of project.tasks) {
    const dependsOn: string[] = [];
    const blockedBy: string[] = [];

    // Parent dependency: subtasks depend on parent task context
    if (task.parentId && taskMap.has(task.parentId)) {
      dependsOn.push(task.parentId);
    }

    // Blocker dependencies
    for (const blocker of task.blockers) {
      if (blocker.dependencyType === 'system' && blocker.dependencyIdentifier) {
        // Check if the dependency identifier is a task ID in this project
        if (taskMap.has(blocker.dependencyIdentifier)) {
          blockedBy.push(blocker.dependencyIdentifier);
        }
      }
    }

    // Higher priority tasks should be done first (implicit dependency)
    // P1 tasks block P2/P3 tasks of the same parent
    if (task.priority !== 'P1') {
      const higherPriorityTasks = project.tasks.filter(t =>
        t.id !== task.id &&
        t.parentId === task.parentId &&
        t.priority === 'P1' &&
        t.status !== 'DONE'
      );
      for (const hpt of higherPriorityTasks) {
        if (!dependsOn.includes(hpt.id)) {
          dependsOn.push(hpt.id);
        }
      }
    }

    dependencies.push({
      taskId: task.id,
      taskTitle: task.title,
      dependsOn,
      blockedBy,
    });
  }

  // Calculate suggested execution order using topological sort
  const suggestedOrder: string[] = [];
  const visited = new Set<string>();
  const inProgress = new Set<string>();

  function visit(taskId: string): boolean {
    if (inProgress.has(taskId)) {
      // Cycle detected, skip
      return false;
    }
    if (visited.has(taskId)) {
      return true;
    }

    inProgress.add(taskId);

    const dep = dependencies.find(d => d.taskId === taskId);
    if (dep) {
      for (const depId of [...dep.dependsOn, ...dep.blockedBy]) {
        if (!visit(depId)) {
          // Continue even if cycle detected
        }
      }
    }

    inProgress.delete(taskId);
    visited.add(taskId);
    suggestedOrder.push(taskId);
    return true;
  }

  // Sort by priority first, then visit
  const sortedTasks = [...project.tasks].sort((a, b) => {
    const priorityOrder = { P1: 0, P2: 1, P3: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  for (const task of sortedTasks) {
    visit(task.id);
  }

  // Critical path: tasks with most dependencies or blockers
  const criticalPath = dependencies
    .filter(d => d.dependsOn.length > 0 || d.blockedBy.length > 0)
    .sort((a, b) => (b.dependsOn.length + b.blockedBy.length) - (a.dependsOn.length + a.blockedBy.length))
    .slice(0, 5)
    .map(d => d.taskId);

  return {
    success: true,
    dependencies,
    suggestedOrder,
    criticalPath,
  };
}

/**
 * Generate a comprehensive daily summary
 * Requirement 4.4: Return completed tasks, pomodoro stats, efficiency score, and suggestions
 */
async function generateDailySummary(
  input: GenerateDailySummaryInput,
  context: MCPContext
): Promise<{
  success: boolean;
  date?: string;
  completedTasks?: Array<{ title: string; pomodoros: number }>;
  totalPomodoros?: number;
  focusMinutes?: number;
  efficiencyScore?: number;
  highlights?: string[];
  tomorrowSuggestions?: string[];
  error?: unknown;
}> {
  try {
    // Parse date or use today
    let targetDate: Date;
    if (input.date) {
      targetDate = new Date(input.date);
      targetDate.setHours(0, 0, 0, 0);
    } else {
      targetDate = new Date();
      // Account for 4 AM reset
      if (targetDate.getHours() < 4) {
        targetDate.setDate(targetDate.getDate() - 1);
      }
      targetDate.setHours(0, 0, 0, 0);
    }

    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Get completed pomodoros for the day
    const pomodoros = await prisma.pomodoro.findMany({
      where: {
        userId: context.userId,
        startTime: {
          gte: targetDate,
          lt: nextDay,
        },
        status: 'COMPLETED',
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    // Get tasks completed on this day
    const completedTasks = await prisma.task.findMany({
      where: {
        userId: context.userId,
        status: 'DONE',
        updatedAt: {
          gte: targetDate,
          lt: nextDay,
        },
      },
      include: {
        pomodoros: {
          where: {
            status: 'COMPLETED',
            startTime: {
              gte: targetDate,
              lt: nextDay,
            },
          },
        },
      },
    });

    // Calculate stats
    const totalPomodoros = pomodoros.length;
    const focusMinutes = pomodoros.reduce((sum, p) => sum + p.duration, 0);

    // Group pomodoros by task
    const taskPomodoroMap = new Map<string, { title: string; count: number }>();
    for (const pomodoro of pomodoros) {
      if (!pomodoro.taskId) continue; // Skip taskless pomodoros
      const existing = taskPomodoroMap.get(pomodoro.taskId);
      if (existing) {
        existing.count++;
      } else {
        taskPomodoroMap.set(pomodoro.taskId, {
          title: pomodoro.task?.title ?? 'Unknown',
          count: 1,
        });
      }
    }

    const completedTasksList = Array.from(taskPomodoroMap.values())
      .map(t => ({ title: t.title, pomodoros: t.count }))
      .sort((a, b) => b.pomodoros - a.pomodoros);

    // Get user settings for efficiency calculation
    const settings = await prisma.userSettings.findUnique({
      where: { userId: context.userId },
    });
    const expectedPomodoros = settings?.expectedPomodoroCount ?? 8;

    // Calculate efficiency score (0-100)
    const efficiencyScore = Math.min(100, Math.round((totalPomodoros / expectedPomodoros) * 100));

    // Generate highlights
    const highlights: string[] = [];
    if (completedTasks.length > 0) {
      highlights.push(`Completed ${completedTasks.length} task${completedTasks.length > 1 ? 's' : ''}`);
    }
    if (totalPomodoros >= expectedPomodoros) {
      highlights.push(`Met daily goal of ${expectedPomodoros} pomodoros!`);
    }
    if (focusMinutes >= 120) {
      highlights.push(`${Math.round(focusMinutes / 60)} hours of focused work`);
    }

    // Get efficiency analysis for suggestions
    const analysisResult = await efficiencyAnalysisService.getHistoricalAnalysis(context.userId, 7);
    const analysis = analysisResult.success ? analysisResult.data : null;

    // Generate tomorrow suggestions
    const tomorrowSuggestions: string[] = [];

    // Get incomplete high-priority tasks
    const incompleteTasks = await prisma.task.findMany({
      where: {
        userId: context.userId,
        status: { not: 'DONE' },
        priority: 'P1',
      },
      take: 3,
      orderBy: [
        { planDate: 'asc' },
        { sortOrder: 'asc' },
      ],
    });

    for (const task of incompleteTasks) {
      tomorrowSuggestions.push(`Continue: ${task.title}`);
    }

    // Add insight-based suggestions
    if (analysis?.insights) {
      for (const insight of analysis.insights.slice(0, 2)) {
        if (insight.type === 'suggestion') {
          tomorrowSuggestions.push(insight.message);
        }
      }
    }

    // Add best time period suggestion
    if (analysis?.byTimePeriod && analysis.byTimePeriod.length > 0) {
      const bestPeriod = analysis.byTimePeriod.reduce((best, current) =>
        current.averagePomodoros > best.averagePomodoros ? current : best
      );
      if (bestPeriod.averagePomodoros > 0) {
        tomorrowSuggestions.push(`Schedule important work during ${bestPeriod.period} (your most productive time)`);
      }
    }

    return {
      success: true,
      date: targetDate.toISOString().split('T')[0],
      completedTasks: completedTasksList,
      totalPomodoros,
      focusMinutes,
      efficiencyScore,
      highlights,
      tomorrowSuggestions: tomorrowSuggestions.slice(0, 5),
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate daily summary',
      },
    };
  }
}

/**
 * Create a task from natural language description
 * Requirement 8.1: Parse and extract task title, priority, project, and date from natural language
 */
async function createTaskFromNL(
  input: CreateTaskFromNLInput,
  context: MCPContext
): Promise<{
  success: boolean;
  parsed?: {
    title: string;
    priority: string;
    projectId: string | null;
    planDate: string | null;
    estimatedMinutes: number | null;
    confidence: number;
    ambiguities: string[];
  };
  projectCandidates?: Array<{ id: string; title: string; score: number }>;
  task?: {
    id: string;
    title: string;
    priority: string;
    projectId: string;
    planDate: string | null;
    estimatedMinutes: number | null;
  };
  error?: unknown;
}> {
  // Validate input
  if (!input.description || input.description.trim().length === 0) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'description is required',
      },
    };
  }

  try {
    // Parse the natural language description
    const parseResult = await nlParserService.parseTaskDescription(
      context.userId,
      input.description
    );

    if (!parseResult.success || !parseResult.data) {
      return {
        success: false,
        error: parseResult.error || {
          code: 'PARSE_ERROR',
          message: 'Failed to parse task description',
        },
      };
    }

    const parsed = parseResult.data;

    // Override project ID if provided
    if (input.project_id) {
      parsed.projectId = input.project_id;
    }

    // Get project candidates for disambiguation
    const candidatesResult = await nlParserService.getProjectCandidates(
      context.userId,
      parsed.title
    );
    const projectCandidates = candidatesResult.success ? candidatesResult.data : [];

    // If confirm is false or not set, return parsed result for confirmation
    if (!input.confirm) {
      return {
        success: true,
        parsed: {
          title: parsed.title,
          priority: parsed.priority,
          projectId: parsed.projectId,
          planDate: parsed.planDate?.toISOString().split('T')[0] ?? null,
          estimatedMinutes: parsed.estimatedMinutes,
          confidence: parsed.confidence,
          ambiguities: parsed.ambiguities,
        },
        projectCandidates: projectCandidates ?? [],
      };
    }

    // Confirm mode: create the task
    if (!parsed.projectId) {
      return {
        success: false,
        parsed: {
          title: parsed.title,
          priority: parsed.priority,
          projectId: null,
          planDate: parsed.planDate?.toISOString().split('T')[0] ?? null,
          estimatedMinutes: parsed.estimatedMinutes,
          confidence: parsed.confidence,
          ambiguities: ['Project ID is required. Please provide project_id or select from candidates.'],
        },
        projectCandidates: projectCandidates ?? [],
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Project ID is required to create task. Please provide project_id parameter.',
        },
      };
    }

    // Create the task
    const createResult = await nlParserService.confirmAndCreate(
      context.userId,
      parsed
    );

    if (!createResult.success || !createResult.data) {
      return {
        success: false,
        error: createResult.error || {
          code: 'CREATE_ERROR',
          message: 'Failed to create task',
        },
      };
    }

    const task = createResult.data;

    return {
      success: true,
      task: {
        id: task.id,
        title: task.title,
        priority: task.priority,
        projectId: task.projectId,
        planDate: task.planDate?.toISOString().split('T')[0] ?? null,
        estimatedMinutes: task.estimatedMinutes,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create task from natural language',
      },
    };
  }
}

/**
 * Switch task during an active pomodoro
 * Phase 6: Multi-task Pomodoro
 */
async function switchTask(
  input: SwitchTaskInput,
  context: MCPContext
): Promise<{ success: boolean; slice?: unknown; error?: unknown }> {
  if (!input.pomodoro_id) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'pomodoro_id is required' } };
  }

  // Get current pomodoro and its active slice
  const pomodoro = await prisma.pomodoro.findFirst({
    where: { id: input.pomodoro_id, userId: context.userId, status: 'IN_PROGRESS' },
    include: { timeSlices: { where: { endTime: null }, take: 1 } },
  });

  if (!pomodoro) {
    return { success: false, error: { code: 'NOT_FOUND', message: 'Active pomodoro not found' } };
  }

  const currentSliceId = pomodoro.timeSlices[0]?.id ?? null;
  const result = await timeSliceService.switchTask(input.pomodoro_id, currentSliceId, input.new_task_id);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return { success: true, slice: { id: result.data?.id, taskId: result.data?.taskId, startTime: result.data?.startTime } };
}

/**
 * Start a taskless pomodoro
 * Phase 6: Multi-task Pomodoro
 */
async function startTasklessPomodoro(
  input: StartTasklessPomodoroInput,
  context: MCPContext
): Promise<{ success: boolean; pomodoro?: unknown; error?: unknown }> {
  const result = await pomodoroService.startTaskless(context.userId, input.label);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    pomodoro: { id: result.data?.id, label: result.data?.label, startTime: result.data?.startTime, isTaskless: true },
  };
}

/**
 * Quick create a task in inbox
 * Phase 6: Multi-task Pomodoro
 */
async function quickCreateInboxTask(
  input: QuickCreateInboxTaskInput,
  context: MCPContext
): Promise<{ success: boolean; task?: unknown; error?: unknown }> {
  if (!input.title?.trim()) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'title is required' } };
  }

  const result = await taskService.quickCreateInboxTask(context.userId, input.title.trim());

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return { success: true, task: { id: result.data?.id, title: result.data?.title, projectId: result.data?.projectId } };
}

/**
 * Complete current task during an active pomodoro
 * Phase 6: Multi-task Pomodoro
 */
async function completeCurrentTask(
  input: CompleteCurrentTaskInput,
  context: MCPContext
): Promise<{ success: boolean; completedTask?: unknown; error?: unknown }> {
  if (!input.pomodoro_id) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'pomodoro_id is required' } };
  }

  const result = await pomodoroService.completeTaskInPomodoro(
    input.pomodoro_id,
    context.userId,
    input.next_task_id
  );

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return { success: true, completedTask: result.data };
}

// ============================================================================
// MCP Capability Enhancement - Task Management Tools
// ============================================================================

/**
 * Get detailed task information
 */
async function getTask(
  input: GetTaskInput,
  context: MCPContext
): Promise<{ success: boolean; task?: unknown; error?: unknown }> {
  if (!input.task_id) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'task_id is required' } };
  }

  const task = await prisma.task.findFirst({
    where: { id: input.task_id, userId: context.userId },
    include: {
      project: { select: { id: true, title: true } },
      parent: { select: { id: true, title: true } },
      subTasks: { select: { id: true, title: true, status: true }, orderBy: { sortOrder: 'asc' } },
      pomodoros: { where: { status: 'COMPLETED' }, select: { id: true } },
      blockers: { where: { status: 'active' }, select: { id: true, description: true, status: true } },
    },
  });

  if (!task) {
    return { success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } };
  }

  return {
    success: true,
    task: {
      id: task.id,
      title: task.title,
      priority: task.priority,
      status: task.status,
      planDate: task.planDate?.toISOString().split('T')[0] ?? null,
      estimatedMinutes: task.estimatedMinutes,
      projectId: task.projectId,
      projectTitle: task.project.title,
      parentId: task.parentId,
      subtasks: task.subTasks,
      pomodoroCount: task.pomodoros.length,
      blockers: task.blockers,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    },
  };
}

/**
 * Update task properties
 */
async function updateTask(
  input: UpdateTaskInput,
  context: MCPContext
): Promise<{ success: boolean; task?: unknown; error?: unknown }> {
  if (!input.task_id) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'task_id is required' } };
  }

  const task = await prisma.task.findFirst({
    where: { id: input.task_id, userId: context.userId },
  });

  if (!task) {
    return { success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } };
  }

  const updateData: Record<string, unknown> = {};
  if (input.title !== undefined) updateData.title = input.title;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.priority !== undefined) updateData.priority = input.priority;
  if (input.estimated_minutes !== undefined) updateData.estimatedMinutes = input.estimated_minutes;
  if (input.plan_date !== undefined) {
    updateData.planDate = input.plan_date ? new Date(input.plan_date) : null;
  }

  if (Object.keys(updateData).length === 0) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } };
  }

  const updated = await prisma.task.update({
    where: { id: input.task_id },
    data: updateData,
  });

  return {
    success: true,
    task: {
      id: updated.id,
      title: updated.title,
      priority: updated.priority,
      status: updated.status,
      planDate: updated.planDate?.toISOString().split('T')[0] ?? null,
    },
  };
}

/**
 * Delete or archive a task
 */
async function deleteTask(
  input: DeleteTaskInput,
  context: MCPContext
): Promise<{ success: boolean; error?: unknown }> {
  if (!input.task_id) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'task_id is required' } };
  }

  const task = await prisma.task.findFirst({
    where: { id: input.task_id, userId: context.userId },
  });

  if (!task) {
    return { success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } };
  }

  const archive = input.archive !== false; // default true

  if (archive) {
    await prisma.task.update({
      where: { id: input.task_id },
      data: { status: 'DONE' },
    });
  } else {
    await prisma.task.delete({ where: { id: input.task_id } });
  }

  return { success: true };
}

/**
 * Get backlog tasks (no plan date)
 */
async function getBacklogTasks(
  input: GetBacklogTasksInput,
  context: MCPContext
): Promise<{ success: boolean; tasks?: unknown[]; error?: unknown }> {
  const where: Record<string, unknown> = {
    userId: context.userId,
    planDate: null,
    status: { not: 'DONE' },
  };

  if (input.project_id) {
    where.projectId = input.project_id;
  }

  const tasks = await prisma.task.findMany({
    where,
    take: input.limit || 50,
    orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    include: { project: { select: { id: true, title: true } } },
  });

  return {
    success: true,
    tasks: tasks.map(t => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      projectId: t.projectId,
      projectTitle: t.project.title,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}

/**
 * Get overdue tasks
 */
async function getOverdueTasks(
  input: GetOverdueTasksInput,
  context: MCPContext
): Promise<{ success: boolean; tasks?: unknown[]; error?: unknown }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const where: Record<string, unknown> = {
    userId: context.userId,
    status: { not: 'DONE' },
    planDate: input.include_today ? { lte: today } : { lt: today },
  };

  if (input.project_id) {
    where.projectId = input.project_id;
  }

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ planDate: 'asc' }, { priority: 'asc' }],
    include: { project: { select: { id: true, title: true } } },
  });

  return {
    success: true,
    tasks: tasks.map(t => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      planDate: t.planDate?.toISOString().split('T')[0] ?? null,
      projectId: t.projectId,
      projectTitle: t.project.title,
    })),
  };
}

/**
 * Move task to another project
 */
async function moveTask(
  input: MoveTaskInput,
  context: MCPContext
): Promise<{ success: boolean; task?: unknown; error?: unknown }> {
  if (!input.task_id || !input.target_project_id) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'task_id and target_project_id are required' } };
  }

  const [task, targetProject] = await Promise.all([
    prisma.task.findFirst({ where: { id: input.task_id, userId: context.userId } }),
    prisma.project.findFirst({ where: { id: input.target_project_id, userId: context.userId } }),
  ]);

  if (!task) {
    return { success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } };
  }
  if (!targetProject) {
    return { success: false, error: { code: 'NOT_FOUND', message: 'Target project not found' } };
  }

  const updated = await prisma.task.update({
    where: { id: input.task_id },
    data: { projectId: input.target_project_id, parentId: null },
    include: { project: { select: { title: true } } },
  });

  return {
    success: true,
    task: {
      id: updated.id,
      title: updated.title,
      projectId: updated.projectId,
      projectTitle: updated.project.title,
    },
  };
}

/**
 * Set plan date for a task
 */
async function setPlanDate(
  input: SetPlanDateInput,
  context: MCPContext
): Promise<{ success: boolean; task?: unknown; error?: unknown }> {
  if (!input.task_id) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'task_id is required' } };
  }

  const task = await prisma.task.findFirst({
    where: { id: input.task_id, userId: context.userId },
  });

  if (!task) {
    return { success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } };
  }

  const updated = await prisma.task.update({
    where: { id: input.task_id },
    data: { planDate: input.plan_date ? new Date(input.plan_date) : null },
  });

  return {
    success: true,
    task: {
      id: updated.id,
      title: updated.title,
      planDate: updated.planDate?.toISOString().split('T')[0] ?? null,
    },
  };
}

// ============================================================================
// MCP Capability Enhancement - Project Management Tools
// ============================================================================

/**
 * Create a new project
 */
async function createProject(
  input: CreateProjectInput,
  context: MCPContext
): Promise<{ success: boolean; project?: unknown; error?: unknown }> {
  if (!input.title || !input.deliverable) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'title and deliverable are required' } };
  }

  const project = await prisma.project.create({
    data: {
      title: input.title,
      deliverable: input.deliverable,
      userId: context.userId,
      goals: input.goal_id ? { create: { goalId: input.goal_id } } : undefined,
    },
  });

  return {
    success: true,
    project: { id: project.id, title: project.title, deliverable: project.deliverable, status: project.status },
  };
}

/**
 * Update project properties
 */
async function updateProject(
  input: UpdateProjectInput,
  context: MCPContext
): Promise<{ success: boolean; project?: unknown; error?: unknown }> {
  if (!input.project_id) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'project_id is required' } };
  }

  const project = await prisma.project.findFirst({
    where: { id: input.project_id, userId: context.userId },
  });

  if (!project) {
    return { success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } };
  }

  const updateData: Record<string, unknown> = {};
  if (input.title !== undefined) updateData.title = input.title;
  if (input.deliverable !== undefined) updateData.deliverable = input.deliverable;
  if (input.status !== undefined) updateData.status = input.status;

  if (Object.keys(updateData).length === 0) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } };
  }

  const updated = await prisma.project.update({
    where: { id: input.project_id },
    data: updateData,
  });

  return {
    success: true,
    project: { id: updated.id, title: updated.title, deliverable: updated.deliverable, status: updated.status },
  };
}

/**
 * Get project details
 */
async function getProject(
  input: GetProjectInput,
  context: MCPContext
): Promise<{ success: boolean; project?: unknown; error?: unknown }> {
  if (!input.project_id) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'project_id is required' } };
  }

  const includeTasks = input.include_tasks !== false;

  const project = await prisma.project.findFirst({
    where: { id: input.project_id, userId: context.userId },
    include: {
      tasks: includeTasks ? {
        where: { parentId: null },
        orderBy: [{ status: 'asc' }, { priority: 'asc' }, { sortOrder: 'asc' }],
        select: { id: true, title: true, status: true, priority: true, planDate: true },
      } : false,
      goals: { include: { goal: { select: { id: true, title: true } } } },
    },
  });

  if (!project) {
    return { success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } };
  }

  const taskCount = await prisma.task.count({ where: { projectId: project.id } });
  const completedCount = await prisma.task.count({ where: { projectId: project.id, status: 'DONE' } });

  return {
    success: true,
    project: {
      id: project.id,
      title: project.title,
      deliverable: project.deliverable,
      status: project.status,
      taskCount,
      completedTaskCount: completedCount,
      progress: taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0,
      tasks: includeTasks ? project.tasks.map(t => ({
        ...t,
        planDate: t.planDate?.toISOString().split('T')[0] ?? null,
      })) : undefined,
      linkedGoals: project.goals.map(g => ({ id: g.goal.id, title: g.goal.title })),
      createdAt: project.createdAt.toISOString(),
    },
  };
}

// ============================================================================
// MCP Capability Enhancement - Daily State Tools
// ============================================================================

/**
 * Get Top 3 tasks for today
 */
async function getTop3(
  context: MCPContext
): Promise<{ success: boolean; tasks?: unknown[]; error?: unknown }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get daily state with top3TaskIds
  const dailyState = await prisma.dailyState.findUnique({
    where: { userId_date: { userId: context.userId, date: today } },
  });

  if (!dailyState || !dailyState.top3TaskIds || dailyState.top3TaskIds.length === 0) {
    return { success: true, tasks: [] };
  }

  // Fetch the tasks
  const tasks = await prisma.task.findMany({
    where: { id: { in: dailyState.top3TaskIds }, userId: context.userId },
    include: { project: { select: { id: true, title: true } } },
  });

  // Sort by the order in top3TaskIds
  const sortedTasks = dailyState.top3TaskIds
    .map((id, index) => {
      const task = tasks.find(t => t.id === id);
      return task ? { ...task, order: index + 1 } : null;
    })
    .filter(Boolean);

  return {
    success: true,
    tasks: sortedTasks.map(t => ({
      id: t!.id,
      title: t!.title,
      priority: t!.priority,
      status: t!.status,
      projectId: t!.projectId,
      projectTitle: t!.project.title,
      order: t!.order,
    })),
  };
}

/**
 * Set Top 3 tasks for today
 */
async function setTop3(
  input: SetTop3Input,
  context: MCPContext
): Promise<{ success: boolean; tasks?: unknown[]; error?: unknown }> {
  if (!input.task_ids || !Array.isArray(input.task_ids) || input.task_ids.length === 0) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'task_ids array is required (1-3 items)' } };
  }

  if (input.task_ids.length > 3) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'Maximum 3 tasks allowed' } };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Verify all tasks exist and belong to user
  const tasks = await prisma.task.findMany({
    where: { id: { in: input.task_ids }, userId: context.userId },
    include: { project: { select: { id: true, title: true } } },
  });

  if (tasks.length !== input.task_ids.length) {
    return { success: false, error: { code: 'NOT_FOUND', message: 'One or more tasks not found' } };
  }

  // Update or create daily state with top3TaskIds
  await prisma.dailyState.upsert({
    where: { userId_date: { userId: context.userId, date: today } },
    update: { top3TaskIds: input.task_ids },
    create: {
      userId: context.userId,
      date: today,
      systemState: 'PLANNING',
      top3TaskIds: input.task_ids,
    },
  });

  // Also set planDate for these tasks to today
  await prisma.task.updateMany({
    where: { id: { in: input.task_ids } },
    data: { planDate: today },
  });

  // Return tasks in order
  const sortedTasks = input.task_ids.map((id, index) => {
    const task = tasks.find(t => t.id === id);
    return task ? { ...task, order: index + 1 } : null;
  }).filter(Boolean);

  return {
    success: true,
    tasks: sortedTasks.map(t => ({
      id: t!.id,
      title: t!.title,
      priority: t!.priority,
      projectTitle: t!.project.title,
      order: t!.order,
    })),
  };
}

/**
 * Record a pomodoro retroactively
 */
async function recordPomodoro(
  input: RecordPomodoroMCPInput,
  context: MCPContext
): Promise<{ success: boolean; pomodoro?: unknown; error?: unknown }> {
  if (!input.duration || !input.completed_at) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'duration and completed_at are required' } };
  }

  const result = await pomodoroService.record(context.userId, {
    taskId: input.task_id ?? null,
    duration: input.duration,
    completedAt: new Date(input.completed_at),
    summary: input.summary,
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    pomodoro: {
      id: result.data?.id,
      taskId: result.data?.taskId,
      duration: result.data?.duration,
      startTime: result.data?.startTime?.toISOString(),
      endTime: result.data?.endTime?.toISOString(),
      summary: result.data?.summary,
    },
  };
}
