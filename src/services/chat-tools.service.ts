/**
 * Chat Tool Framework (F4)
 *
 * Converts MCP Tool definitions into Vercel AI SDK tool() format for use with
 * streamText(). userId is injected via closure — never trusted from AI parameters.
 *
 * Key design decisions:
 *   - Each tool's execute() captures userId from the calling context
 *   - requiresConfirmation flag controls auto-execute vs. user-confirm flow
 *   - Tool results use a standardised { success, data?, error? } shape
 */

import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { taskService } from './task.service';
import { pomodoroService } from './pomodoro.service';
import { nlParserService } from './nl-parser.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatToolDefinition {
  name: string;
  description: string;
  /** Zod schema for the tool input */
  inputSchema: z.ZodTypeAny;
  /** Whether the user must confirm before execution */
  requiresConfirmation: boolean;
  /** The execute function — userId is injected, NOT part of the schema */
  execute: (userId: string, params: Record<string, unknown>) => Promise<ChatToolResult>;
}

export interface ChatToolResult {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string };
}

/** Pending tool call awaiting user confirmation */
export interface PendingToolConfirmation {
  toolCallId: string;
  toolName: string;
  parameters: Record<string, unknown>;
  conversationId: string;
  userId: string;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Zod Schemas (reused by both the definition registry and the tool factory)
// ---------------------------------------------------------------------------

const completeTaskSchema = z.object({
  task_id: z.string().describe('The UUID of the task to complete'),
  summary: z.string().optional().describe('A brief summary of what was accomplished'),
});

const createTaskFromNLSchema = z.object({
  description: z.string().describe('Natural language task description (e.g., "urgent: fix login bug tomorrow 2 hours")'),
  project_id: z.string().optional().describe('Optional project ID. If not provided, will attempt to infer from description.'),
  confirm: z.boolean().optional().describe('If true, create task immediately. If false (default), return parsed result for confirmation.'),
});

const startPomodoroSchema = z.object({
  task_id: z.string().describe('The UUID of the task to focus on'),
  duration: z.number().optional().describe('Duration in minutes (default: user setting or 25)'),
});

// ---------------------------------------------------------------------------
// Tool Registry — the single source of truth for Chat-available tools
// ---------------------------------------------------------------------------

/**
 * Build the tool definition registry. Each entry maps a tool name to its
 * metadata + execute handler. The execute handler always takes userId as the
 * first argument (injected from the authenticated session).
 */
export function getChatToolDefinitions(): ChatToolDefinition[] {
  return [
    {
      name: 'flow_complete_task',
      description: 'Mark a task as completed with an optional summary',
      inputSchema: completeTaskSchema,
      requiresConfirmation: false,
      execute: async (userId, params) => {
        const { task_id, summary } = params as z.infer<typeof completeTaskSchema>;
        const result = await taskService.updateStatus(task_id, userId, 'DONE', false);
        if (!result.success) {
          return { success: false, error: result.error ?? { code: 'INTERNAL_ERROR', message: 'Failed to complete task' } };
        }
        return {
          success: true,
          data: {
            id: result.data?.id,
            title: result.data?.title,
            status: result.data?.status,
            summary,
          },
        };
      },
    },
    {
      name: 'flow_create_task_from_nl',
      description:
        'Create a task from natural language description. Parses priority, date, and time estimates from the text. Use confirm=false to preview parsed result before creation.',
      inputSchema: createTaskFromNLSchema,
      requiresConfirmation: false,
      execute: async (userId, params) => {
        const { description, project_id, confirm } = params as z.infer<typeof createTaskFromNLSchema>;

        const parseResult = await nlParserService.parseTaskDescription(userId, description);
        if (!parseResult.success || !parseResult.data) {
          return {
            success: false,
            error: parseResult.error ?? { code: 'PARSE_ERROR', message: 'Failed to parse task description' },
          };
        }

        const parsed = parseResult.data;
        if (project_id) {
          parsed.projectId = project_id;
        }

        if (!confirm) {
          return {
            success: true,
            data: {
              parsed: {
                title: parsed.title,
                priority: parsed.priority,
                projectId: parsed.projectId,
                planDate: parsed.planDate?.toISOString().split('T')[0] ?? null,
                estimatedMinutes: parsed.estimatedMinutes,
                confidence: parsed.confidence,
                ambiguities: parsed.ambiguities,
              },
            },
          };
        }

        const createResult = await nlParserService.confirmAndCreate(userId, parsed);
        if (!createResult.success || !createResult.data) {
          return {
            success: false,
            error: createResult.error ?? { code: 'INTERNAL_ERROR', message: 'Failed to create task' },
          };
        }

        return {
          success: true,
          data: {
            task: {
              id: createResult.data.id,
              title: createResult.data.title,
              priority: createResult.data.priority,
              projectId: createResult.data.projectId,
            },
          },
        };
      },
    },
    {
      name: 'flow_start_pomodoro',
      description: 'Start a new Pomodoro focus session for a task',
      inputSchema: startPomodoroSchema,
      requiresConfirmation: false,
      execute: async (userId, params) => {
        const { task_id, duration } = params as z.infer<typeof startPomodoroSchema>;
        const result = await pomodoroService.start(userId, {
          taskId: task_id,
          duration,
        });
        if (!result.success) {
          return { success: false, error: result.error ?? { code: 'INTERNAL_ERROR', message: 'Failed to start pomodoro' } };
        }
        return {
          success: true,
          data: {
            id: result.data?.id,
            taskId: result.data?.taskId,
            duration: result.data?.duration,
            startTime: result.data?.startTime,
            status: result.data?.status,
          },
        };
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Vercel AI SDK Tool Factory
// ---------------------------------------------------------------------------

/**
 * Create a Vercel AI SDK ToolSet for use with streamText().
 * Each tool's execute() closure captures `userId` from the server context —
 * the AI model cannot override it via parameters.
 */
export function createChatTools(userId: string): ToolSet {
  return {
    flow_complete_task: tool<z.infer<typeof completeTaskSchema>, ChatToolResult>({
      description: 'Mark a task as completed with an optional summary',
      inputSchema: completeTaskSchema,
      execute: async ({ task_id, summary }) => {
        const result = await taskService.updateStatus(task_id, userId, 'DONE', false);
        if (!result.success) {
          return { success: false, error: result.error ?? { code: 'INTERNAL_ERROR', message: 'Failed to complete task' } };
        }
        return {
          success: true,
          data: { id: result.data?.id, title: result.data?.title, status: result.data?.status, summary },
        };
      },
    }),

    flow_create_task_from_nl: tool<z.infer<typeof createTaskFromNLSchema>, ChatToolResult>({
      description: 'Create a task from natural language description. Parses priority, date, and time estimates from the text.',
      inputSchema: createTaskFromNLSchema,
      execute: async ({ description, project_id, confirm }) => {
        const parseResult = await nlParserService.parseTaskDescription(userId, description);
        if (!parseResult.success || !parseResult.data) {
          return { success: false, error: parseResult.error ?? { code: 'PARSE_ERROR', message: 'Failed to parse task description' } };
        }
        const parsed = parseResult.data;
        if (project_id) parsed.projectId = project_id;

        if (!confirm) {
          return {
            success: true,
            data: {
              parsed: {
                title: parsed.title,
                priority: parsed.priority,
                projectId: parsed.projectId,
                planDate: parsed.planDate?.toISOString().split('T')[0] ?? null,
                estimatedMinutes: parsed.estimatedMinutes,
                confidence: parsed.confidence,
                ambiguities: parsed.ambiguities,
              },
            },
          };
        }

        const createResult = await nlParserService.confirmAndCreate(userId, parsed);
        if (!createResult.success || !createResult.data) {
          return { success: false, error: createResult.error ?? { code: 'INTERNAL_ERROR', message: 'Failed to create task' } };
        }
        return {
          success: true,
          data: {
            task: { id: createResult.data.id, title: createResult.data.title, priority: createResult.data.priority, projectId: createResult.data.projectId },
          },
        };
      },
    }),

    flow_start_pomodoro: tool<z.infer<typeof startPomodoroSchema>, ChatToolResult>({
      description: 'Start a new Pomodoro focus session for a task',
      inputSchema: startPomodoroSchema,
      execute: async ({ task_id, duration }) => {
        const result = await pomodoroService.start(userId, { taskId: task_id, duration });
        if (!result.success) {
          return { success: false, error: result.error ?? { code: 'INTERNAL_ERROR', message: 'Failed to start pomodoro' } };
        }
        return {
          success: true,
          data: { id: result.data?.id, taskId: result.data?.taskId, duration: result.data?.duration, startTime: result.data?.startTime, status: result.data?.status },
        };
      },
    }),
  };
}

// ---------------------------------------------------------------------------
// Confirmation Mechanism
// ---------------------------------------------------------------------------

/** In-memory store for pending tool confirmations (keyed by toolCallId) */
const pendingConfirmations = new Map<string, PendingToolConfirmation>();

/** TTL for pending confirmations (5 minutes) */
const CONFIRMATION_TTL_MS = 5 * 60 * 1000;

/**
 * Check if a tool requires user confirmation.
 */
export function toolRequiresConfirmation(toolName: string): boolean {
  const defs = getChatToolDefinitions();
  const def = defs.find((d) => d.name === toolName);
  return def?.requiresConfirmation ?? false;
}

/**
 * Store a pending confirmation for a tool call that requires user approval.
 */
export function storePendingConfirmation(confirmation: PendingToolConfirmation): void {
  pendingConfirmations.set(confirmation.toolCallId, confirmation);

  // Auto-expire after TTL
  setTimeout(() => {
    pendingConfirmations.delete(confirmation.toolCallId);
  }, CONFIRMATION_TTL_MS);
}

/**
 * Handle a user's confirmation or cancellation of a pending tool call.
 *
 * Returns the tool execution result if confirmed, or a cancellation ack.
 */
export async function handleToolConfirmation(
  userId: string,
  toolCallId: string,
  action: 'confirm' | 'cancel'
): Promise<ChatToolResult> {
  const pending = pendingConfirmations.get(toolCallId);

  if (!pending) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Tool call not found or expired' },
    };
  }

  // Security: verify the userId matches
  if (pending.userId !== userId) {
    return {
      success: false,
      error: { code: 'AUTH_ERROR', message: 'User mismatch' },
    };
  }

  // Remove from pending regardless of action
  pendingConfirmations.delete(toolCallId);

  if (action === 'cancel') {
    return {
      success: true,
      data: { cancelled: true, toolCallId },
    };
  }

  // Execute the tool
  const defs = getChatToolDefinitions();
  const def = defs.find((d) => d.name === pending.toolName);
  if (!def) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: `Tool ${pending.toolName} not found` },
    };
  }

  return def.execute(userId, pending.parameters);
}

/**
 * Get a pending confirmation by toolCallId (for testing / inspection).
 */
export function getPendingConfirmation(toolCallId: string): PendingToolConfirmation | undefined {
  return pendingConfirmations.get(toolCallId);
}

/**
 * Clear all pending confirmations (for testing).
 */
export function clearPendingConfirmations(): void {
  pendingConfirmations.clear();
}

// ---------------------------------------------------------------------------
// Singleton export (following the project's service pattern)
// ---------------------------------------------------------------------------

export const chatToolsService = {
  createChatTools,
  getChatToolDefinitions,
  toolRequiresConfirmation,
  storePendingConfirmation,
  handleToolConfirmation,
  getPendingConfirmation,
  clearPendingConfirmations,
};
