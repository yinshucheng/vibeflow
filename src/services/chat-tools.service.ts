/**
 * Chat Tool Framework (F4 + S1)
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
import { projectService } from './project.service';
import { timeSliceService } from './time-slice.service';
import { activityLogService } from './activity-log.service';
import { efficiencyAnalysisService } from './efficiency-analysis.service';
import { dailyStateService } from './daily-state.service';
import { broadcastStateChange } from './socket-broadcast.service';
import { screenTimeExemptionService } from './screen-time-exemption.service';
import { pomodoroService as pomodoroServiceDirect } from './pomodoro.service';
import { sleepTimeService } from './sleep-time.service';
import { overRestService } from './over-rest.service';
import prisma from '../lib/prisma';

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

// S1.1 Task management schemas
const updateTaskSchema = z.object({
  task_id: z.string().describe('The UUID of the task to update'),
  title: z.string().optional().describe('New title for the task'),
  description: z.string().optional().describe('New description for the task'),
  priority: z.enum(['P1', 'P2', 'P3']).optional().describe('New priority level'),
  estimated_minutes: z.number().optional().describe('Estimated time in minutes'),
  plan_date: z.string().nullable().optional().describe('Plan date in ISO format (YYYY-MM-DD) or null to clear'),
});

const getTaskSchema = z.object({
  task_id: z.string().describe('The UUID of the task'),
});

const addSubtaskSchema = z.object({
  parent_id: z.string().describe('The UUID of the parent task'),
  title: z.string().describe('The title of the new subtask'),
  priority: z.enum(['P1', 'P2', 'P3']).optional().describe('Priority level (default: P2)'),
});

const getTop3Schema = z.object({});

const setTop3Schema = z.object({
  task_ids: z.array(z.string()).describe('Array of 1-3 task IDs to set as Top 3'),
});

const quickCreateInboxTaskSchema = z.object({
  title: z.string().describe('The title of the task to create'),
});

// S1.2 Pomodoro control schemas
const switchTaskSchema = z.object({
  pomodoro_id: z.string().describe('The UUID of the active pomodoro'),
  new_task_id: z.string().nullable().describe('The UUID of the task to switch to, or null for taskless'),
});

const completeCurrentTaskSchema = z.object({
  pomodoro_id: z.string().describe('The UUID of the active pomodoro'),
  next_task_id: z.string().nullable().optional().describe('Optional task to switch to after completing current task'),
});

const startTasklessPomodoroSchema = z.object({
  label: z.string().optional().describe('Optional label for the taskless pomodoro'),
});

const recordPomodoroSchema = z.object({
  task_id: z.string().optional().describe('Optional task ID to associate with the pomodoro'),
  duration: z.number().describe('Duration in minutes (10-120)'),
  completed_at: z.string().describe('Completion time in ISO 8601 format'),
  summary: z.string().optional().describe('Optional summary of what was done'),
});

// S1.3 Batch & planning schemas
const getOverdueTasksSchema = z.object({
  project_id: z.string().optional().describe('Optional project ID to filter by'),
  include_today: z.boolean().optional().describe('Include tasks planned for today (default: false)'),
});

const getBacklogTasksSchema = z.object({
  project_id: z.string().optional().describe('Optional project ID to filter by'),
  limit: z.number().optional().describe('Maximum number of tasks to return (default: 50)'),
});

const batchUpdateTasksSchema = z.object({
  updates: z.array(z.object({
    task_id: z.string().describe('The UUID of the task to update'),
    status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional().describe('New status for the task'),
    priority: z.enum(['P1', 'P2', 'P3']).optional().describe('New priority for the task'),
    plan_date: z.string().optional().describe('New plan date in ISO format (YYYY-MM-DD)'),
  })).describe('Array of task updates to apply'),
});

const setPlanDateSchema = z.object({
  task_id: z.string().describe('The UUID of the task'),
  plan_date: z.string().nullable().describe('Plan date in ISO format (YYYY-MM-DD) or null to clear'),
});

const moveTaskSchema = z.object({
  task_id: z.string().describe('The UUID of the task to move'),
  target_project_id: z.string().describe('The UUID of the target project'),
});

// S1.4 Project management schemas
const createProjectSchema = z.object({
  title: z.string().describe('Project title'),
  deliverable: z.string().describe('Project deliverable description'),
  goal_id: z.string().optional().describe('Optional goal ID to link the project to'),
});

const updateProjectSchema = z.object({
  project_id: z.string().describe('The UUID of the project to update'),
  title: z.string().optional().describe('New title for the project'),
  deliverable: z.string().optional().describe('New deliverable description'),
  status: z.enum(['ACTIVE', 'COMPLETED', 'ARCHIVED']).optional().describe('New status'),
});

const getProjectSchema = z.object({
  project_id: z.string().describe('The UUID of the project'),
  include_tasks: z.boolean().optional().describe('Include task list (default: true)'),
});

const createProjectFromTemplateSchema = z.object({
  template_id: z.string().describe('The UUID of the project template to use'),
  project_name: z.string().describe('Name for the new project'),
  goal_id: z.string().optional().describe('Optional goal ID to link the project to'),
});

const analyzeTaskDependenciesSchema = z.object({
  project_id: z.string().describe('The UUID of the project to analyze'),
});

// S1.5 Other schemas
const reportBlockerSchema = z.object({
  task_id: z.string().describe('The UUID of the task with the blocker'),
  error_log: z.string().describe('The error log or description of the blocker'),
});

const deleteTaskSchema = z.object({
  task_id: z.string().describe('The UUID of the task to delete'),
  archive: z.boolean().optional().describe('If true (default), soft delete. If false, hard delete.'),
});

const getTaskContextSchema = z.object({
  task_id: z.string().describe('The UUID of the task'),
});

const generateDailySummarySchema = z.object({
  date: z.string().optional().describe('Date in ISO format (YYYY-MM-DD). Defaults to today.'),
});

// ---------------------------------------------------------------------------
// Execute helpers — reusable logic shared by definition registry + tool factory
// ---------------------------------------------------------------------------

async function executeCompleteTask(userId: string, params: Record<string, unknown>): Promise<ChatToolResult> {
  const { task_id, summary } = params as z.infer<typeof completeTaskSchema>;
  const result = await taskService.updateStatus(task_id, userId, 'DONE', false);
  if (!result.success) {
    return { success: false, error: result.error ?? { code: 'INTERNAL_ERROR', message: 'Failed to complete task' } };
  }
  return { success: true, data: { id: result.data?.id, title: result.data?.title, status: result.data?.status, summary } };
}

async function executeCreateTaskFromNL(userId: string, params: Record<string, unknown>): Promise<ChatToolResult> {
  const { description, project_id, confirm } = params as z.infer<typeof createTaskFromNLSchema>;
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
          title: parsed.title, priority: parsed.priority, projectId: parsed.projectId,
          planDate: parsed.planDate?.toISOString().split('T')[0] ?? null,
          estimatedMinutes: parsed.estimatedMinutes, confidence: parsed.confidence, ambiguities: parsed.ambiguities,
        },
      },
    };
  }
  const createResult = await nlParserService.confirmAndCreate(userId, parsed);
  if (!createResult.success || !createResult.data) {
    return { success: false, error: createResult.error ?? { code: 'INTERNAL_ERROR', message: 'Failed to create task' } };
  }
  return { success: true, data: { task: { id: createResult.data.id, title: createResult.data.title, priority: createResult.data.priority, projectId: createResult.data.projectId } } };
}

async function executeStartPomodoro(userId: string, params: Record<string, unknown>): Promise<ChatToolResult> {
  const { task_id, duration } = params as z.infer<typeof startPomodoroSchema>;
  const result = await pomodoroService.start(userId, { taskId: task_id, duration });
  if (!result.success) {
    return { success: false, error: result.error ?? { code: 'INTERNAL_ERROR', message: 'Failed to start pomodoro' } };
  }
  // Transition to FOCUS state and broadcast SYNC_STATE to all devices (BUG-4)
  await dailyStateService.updateSystemState(userId, 'focus');
  return { success: true, data: { id: result.data?.id, taskId: result.data?.taskId, duration: result.data?.duration, startTime: result.data?.startTime, status: result.data?.status } };
}

// S1.1 Task management execute helpers

async function executeUpdateTask(userId: string, params: Record<string, unknown>): Promise<ChatToolResult> {
  const { task_id, title, description, priority, estimated_minutes, plan_date } = params as z.infer<typeof updateTaskSchema>;
  const task = await prisma.task.findFirst({ where: { id: task_id, userId } });
  if (!task) {
    return { success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } };
  }
  const updateData: Record<string, unknown> = {};
  if (title !== undefined) updateData.title = title;
  if (description !== undefined) updateData.description = description;
  if (priority !== undefined) updateData.priority = priority;
  if (estimated_minutes !== undefined) updateData.estimatedMinutes = estimated_minutes;
  if (plan_date !== undefined) updateData.planDate = plan_date ? new Date(plan_date) : null;
  if (Object.keys(updateData).length === 0) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } };
  }
  const updated = await prisma.task.update({ where: { id: task_id }, data: updateData });
  return { success: true, data: { id: updated.id, title: updated.title, priority: updated.priority, status: updated.status, planDate: updated.planDate?.toISOString().split('T')[0] ?? null } };
}

async function executeGetTask(userId: string, params: Record<string, unknown>): Promise<ChatToolResult> {
  const { task_id } = params as z.infer<typeof getTaskSchema>;
  const task = await prisma.task.findFirst({
    where: { id: task_id, userId },
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
    data: {
      id: task.id, title: task.title, priority: task.priority, status: task.status,
      planDate: task.planDate?.toISOString().split('T')[0] ?? null,
      estimatedMinutes: task.estimatedMinutes, projectId: task.projectId, projectTitle: task.project.title,
      parentId: task.parentId, subtasks: task.subTasks, pomodoroCount: task.pomodoros.length, blockers: task.blockers,
      createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString(),
    },
  };
}

async function executeAddSubtask(userId: string, params: Record<string, unknown>): Promise<ChatToolResult> {
  const { parent_id, title, priority } = params as z.infer<typeof addSubtaskSchema>;
  const parentTask = await prisma.task.findFirst({ where: { id: parent_id, userId } });
  if (!parentTask) {
    return { success: false, error: { code: 'NOT_FOUND', message: 'Parent task not found' } };
  }
  const result = await taskService.create(userId, { title, projectId: parentTask.projectId, parentId: parent_id, priority: priority || 'P2' });
  if (!result.success) {
    return { success: false, error: result.error ?? { code: 'INTERNAL_ERROR', message: 'Failed to create subtask' } };
  }
  return { success: true, data: { id: result.data?.id, title: result.data?.title, priority: result.data?.priority, parentId: result.data?.parentId, projectId: result.data?.projectId } };
}

async function executeGetTop3(userId: string): Promise<ChatToolResult> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dailyState = await prisma.dailyState.findUnique({ where: { userId_date: { userId, date: today } } });
  if (!dailyState || !dailyState.top3TaskIds || dailyState.top3TaskIds.length === 0) {
    return { success: true, data: { tasks: [] } };
  }
  const tasks = await prisma.task.findMany({
    where: { id: { in: dailyState.top3TaskIds }, userId },
    include: { project: { select: { id: true, title: true } } },
  });
  const sorted = dailyState.top3TaskIds
    .map((id, index) => { const t = tasks.find(t => t.id === id); return t ? { id: t.id, title: t.title, priority: t.priority, status: t.status, projectId: t.projectId, projectTitle: t.project.title, order: index + 1 } : null; })
    .filter(Boolean);
  return { success: true, data: { tasks: sorted } };
}

async function executeSetTop3(userId: string, params: Record<string, unknown>): Promise<ChatToolResult> {
  const { task_ids } = params as z.infer<typeof setTop3Schema>;
  if (task_ids.length === 0 || task_ids.length > 3) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'task_ids must contain 1-3 items' } };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tasks = await prisma.task.findMany({
    where: { id: { in: task_ids }, userId },
    include: { project: { select: { id: true, title: true } } },
  });
  if (tasks.length !== task_ids.length) {
    return { success: false, error: { code: 'NOT_FOUND', message: 'One or more tasks not found' } };
  }
  await prisma.dailyState.upsert({
    where: { userId_date: { userId, date: today } },
    update: { top3TaskIds: task_ids },
    create: { userId, date: today, systemState: 'PLANNING', top3TaskIds: task_ids },
  });
  await prisma.task.updateMany({ where: { id: { in: task_ids } }, data: { planDate: today } });
  const sorted = task_ids.map((id, index) => { const t = tasks.find(t => t.id === id); return t ? { id: t.id, title: t.title, priority: t.priority, projectTitle: t.project.title, order: index + 1 } : null; }).filter(Boolean);
  return { success: true, data: { tasks: sorted } };
}

async function executeQuickCreateInboxTask(userId: string, params: Record<string, unknown>): Promise<ChatToolResult> {
  const { title } = params as z.infer<typeof quickCreateInboxTaskSchema>;
  if (!title?.trim()) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'title is required' } };
  }
  const result = await taskService.quickCreateInboxTask(userId, title.trim());
  if (!result.success) {
    return { success: false, error: result.error ?? { code: 'INTERNAL_ERROR', message: 'Failed to create task' } };
  }
  return { success: true, data: { id: result.data?.id, title: result.data?.title, projectId: result.data?.projectId } };
}

// S1.2 Pomodoro control execute helpers

async function executeSwitchTask(userId: string, params: Record<string, unknown>): Promise<ChatToolResult> {
  const { pomodoro_id, new_task_id } = params as z.infer<typeof switchTaskSchema>;
  const pomodoro = await prisma.pomodoro.findFirst({
    where: { id: pomodoro_id, userId, status: 'IN_PROGRESS' },
    include: { timeSlices: { where: { endTime: null }, take: 1 } },
  });
  if (!pomodoro) {
    return { success: false, error: { code: 'NOT_FOUND', message: 'Active pomodoro not found' } };
  }
  const currentSliceId = pomodoro.timeSlices[0]?.id ?? null;
  const result = await timeSliceService.switchTask(pomodoro_id, currentSliceId, new_task_id);
  if (!result.success) {
    return { success: false, error: result.error ?? { code: 'INTERNAL_ERROR', message: 'Failed to switch task' } };
  }
  return { success: true, data: { id: result.data?.id, taskId: result.data?.taskId, startTime: result.data?.startTime } };
}

async function executeCompleteCurrentTask(userId: string, params: Record<string, unknown>): Promise<ChatToolResult> {
  const { pomodoro_id, next_task_id } = params as z.infer<typeof completeCurrentTaskSchema>;
  const result = await pomodoroService.completeTaskInPomodoro(pomodoro_id, userId, next_task_id);
  if (!result.success) {
    return { success: false, error: result.error ?? { code: 'INTERNAL_ERROR', message: 'Failed to complete current task' } };
  }
  return { success: true, data: result.data };
}

async function executeStartTasklessPomodoro(userId: string, params: Record<string, unknown>): Promise<ChatToolResult> {
  const { label } = params as z.infer<typeof startTasklessPomodoroSchema>;
  const result = await pomodoroService.startTaskless(userId, label);
  if (!result.success) {
    return { success: false, error: result.error ?? { code: 'INTERNAL_ERROR', message: 'Failed to start taskless pomodoro' } };
  }
  return { success: true, data: { id: result.data?.id, label: result.data?.label, startTime: result.data?.startTime, isTaskless: true } };
}

async function executeRecordPomodoro(userId: string, params: Record<string, unknown>): Promise<ChatToolResult> {
  const { task_id, duration, completed_at, summary } = params as z.infer<typeof recordPomodoroSchema>;
  const result = await pomodoroService.record(userId, { taskId: task_id ?? null, duration, completedAt: new Date(completed_at), summary });
  if (!result.success) {
    return { success: false, error: result.error ?? { code: 'INTERNAL_ERROR', message: 'Failed to record pomodoro' } };
  }
  return { success: true, data: { id: result.data?.id, taskId: result.data?.taskId, duration: result.data?.duration, startTime: result.data?.startTime?.toISOString(), endTime: result.data?.endTime?.toISOString(), summary: result.data?.summary } };
}

// S1.3 Batch & planning execute helpers

async function executeGetOverdueTasks(userId: string, params: Record<string, unknown>): Promise<ChatToolResult> {
  const { project_id, include_today } = params as z.infer<typeof getOverdueTasksSchema>;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const where: Record<string, unknown> = { userId, status: { not: 'DONE' }, planDate: include_today ? { lte: today } : { lt: today } };
  if (project_id) where.projectId = project_id;
  const tasks = await prisma.task.findMany({ where, orderBy: [{ planDate: 'asc' }, { priority: 'asc' }], include: { project: { select: { id: true, title: true } } } });
  return { success: true, data: { tasks: tasks.map(t => ({ id: t.id, title: t.title, priority: t.priority, status: t.status, planDate: t.planDate?.toISOString().split('T')[0] ?? null, projectId: t.projectId, projectTitle: t.project.title })) } };
}

async function executeGetBacklogTasks(userId: string, params: Record<string, unknown>): Promise<ChatToolResult> {
  const { project_id, limit } = params as z.infer<typeof getBacklogTasksSchema>;
  const where: Record<string, unknown> = { userId, planDate: null, status: { not: 'DONE' } };
  if (project_id) where.projectId = project_id;
  const tasks = await prisma.task.findMany({ where, take: limit || 50, orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }], include: { project: { select: { id: true, title: true } } } });
  return { success: true, data: { tasks: tasks.map(t => ({ id: t.id, title: t.title, priority: t.priority, status: t.status, projectId: t.projectId, projectTitle: t.project.title, createdAt: t.createdAt.toISOString() })) } };
}

async function executeBatchUpdateTasks(userId: string, params: Record<string, unknown>): Promise<ChatToolResult> {
  const { updates } = params as z.infer<typeof batchUpdateTasksSchema>;
  if (!updates || updates.length === 0) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: 'updates array is required and must not be empty' } };
  }
  const failed: Array<{ taskId: string; error: string }> = [];
  let updatedCount = 0;
  try {
    await prisma.$transaction(async (tx) => {
      for (const update of updates) {
        const task = await tx.task.findFirst({ where: { id: update.task_id, userId } });
        if (!task) { failed.push({ taskId: update.task_id, error: 'Task not found or access denied' }); continue; }
        const updateData: Record<string, unknown> = {};
        if (update.status) updateData.status = update.status;
        if (update.priority) updateData.priority = update.priority;
        if (update.plan_date !== undefined) updateData.planDate = update.plan_date ? new Date(update.plan_date) : null;
        if (Object.keys(updateData).length > 0) {
          await tx.task.update({ where: { id: update.task_id }, data: updateData });
          updatedCount++;
        }
      }
      if (updatedCount === 0 && failed.length > 0) throw new Error('All updates failed');
    });
    return { success: true, data: { updated: updatedCount, failed: failed.length > 0 ? failed : undefined } };
  } catch (error) {
    if (error instanceof Error && error.message === 'All updates failed') {
      return { success: false, error: { code: 'VALIDATION_ERROR', message: 'All task updates failed' } };
    }
    return { success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Batch update failed' } };
  }
}

async function executeSetPlanDate(userId: string, params: Record<string, unknown>): Promise<ChatToolResult> {
  const { task_id, plan_date } = params as z.infer<typeof setPlanDateSchema>;
  const task = await prisma.task.findFirst({ where: { id: task_id, userId } });
  if (!task) {
    return { success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } };
  }
  const updated = await prisma.task.update({ where: { id: task_id }, data: { planDate: plan_date ? new Date(plan_date) : null } });
  return { success: true, data: { id: updated.id, title: updated.title, planDate: updated.planDate?.toISOString().split('T')[0] ?? null } };
}

async function executeMoveTask(userId: string, params: Record<string, unknown>): Promise<ChatToolResult> {
  const { task_id, target_project_id } = params as z.infer<typeof moveTaskSchema>;
  const [task, targetProject] = await Promise.all([
    prisma.task.findFirst({ where: { id: task_id, userId } }),
    prisma.project.findFirst({ where: { id: target_project_id, userId } }),
  ]);
  if (!task) return { success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } };
  if (!targetProject) return { success: false, error: { code: 'NOT_FOUND', message: 'Target project not found' } };
  const updated = await prisma.task.update({ where: { id: task_id }, data: { projectId: target_project_id, parentId: null }, include: { project: { select: { title: true } } } });
  return { success: true, data: { id: updated.id, title: updated.title, projectId: updated.projectId, projectTitle: updated.project.title } };
}

// S1.4 Project management execute helpers

async function executeCreateProject(userId: string, params: Record<string, unknown>): Promise<ChatToolResult> {
  const { title, deliverable, goal_id } = params as z.infer<typeof createProjectSchema>;
  const project = await prisma.project.create({
    data: { title, deliverable, userId, goals: goal_id ? { create: { goalId: goal_id } } : undefined },
  });
  return { success: true, data: { id: project.id, title: project.title, deliverable: project.deliverable, status: project.status } };
}

async function executeUpdateProject(userId: string, params: Record<string, unknown>): Promise<ChatToolResult> {
  const { project_id, title, deliverable, status } = params as z.infer<typeof updateProjectSchema>;
  const project = await prisma.project.findFirst({ where: { id: project_id, userId } });
  if (!project) return { success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } };
  const updateData: Record<string, unknown> = {};
  if (title !== undefined) updateData.title = title;
  if (deliverable !== undefined) updateData.deliverable = deliverable;
  if (status !== undefined) updateData.status = status;
  if (Object.keys(updateData).length === 0) return { success: false, error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } };
  const updated = await prisma.project.update({ where: { id: project_id }, data: updateData });
  return { success: true, data: { id: updated.id, title: updated.title, deliverable: updated.deliverable, status: updated.status } };
}

async function executeGetProject(userId: string, params: Record<string, unknown>): Promise<ChatToolResult> {
  const { project_id, include_tasks } = params as z.infer<typeof getProjectSchema>;
  const includeTasks = include_tasks !== false;
  const project = await prisma.project.findFirst({
    where: { id: project_id, userId },
    include: {
      tasks: includeTasks ? { where: { parentId: null }, orderBy: [{ status: 'asc' }, { priority: 'asc' }, { sortOrder: 'asc' }], select: { id: true, title: true, status: true, priority: true, planDate: true } } : false,
      goals: { include: { goal: { select: { id: true, title: true } } } },
    },
  });
  if (!project) return { success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } };
  const taskCount = await prisma.task.count({ where: { projectId: project.id } });
  const completedCount = await prisma.task.count({ where: { projectId: project.id, status: 'DONE' } });
  return {
    success: true,
    data: {
      id: project.id, title: project.title, deliverable: project.deliverable, status: project.status,
      taskCount, completedTaskCount: completedCount, progress: taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0,
      tasks: includeTasks && 'tasks' in project ? (project.tasks as Array<{ planDate: Date | null; id: string; title: string; status: string; priority: string }>).map(t => ({ ...t, planDate: t.planDate?.toISOString().split('T')[0] ?? null })) : undefined,
      linkedGoals: project.goals.map(g => ({ id: g.goal.id, title: g.goal.title })),
      createdAt: project.createdAt.toISOString(),
    },
  };
}

async function executeCreateProjectFromTemplate(userId: string, params: Record<string, unknown>): Promise<ChatToolResult> {
  const { template_id, project_name, goal_id } = params as z.infer<typeof createProjectFromTemplateSchema>;
  const template = await prisma.projectTemplate.findFirst({ where: { id: template_id, OR: [{ isSystem: true }, { userId }] } });
  if (!template) return { success: false, error: { code: 'NOT_FOUND', message: 'Template not found or access denied' } };
  if (goal_id) {
    const goal = await prisma.goal.findFirst({ where: { id: goal_id, userId } });
    if (!goal) return { success: false, error: { code: 'NOT_FOUND', message: 'Goal not found or access denied' } };
  }
  try {
    const structure = template.structure as { deliverable?: string; tasks?: Array<{ title: string; priority?: 'P1' | 'P2' | 'P3'; estimatedMinutes?: number; subtasks?: Array<{ title: string; priority?: 'P1' | 'P2' | 'P3'; estimatedMinutes?: number }> }> };
    const result = await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({ data: { title: project_name, deliverable: structure.deliverable || `Project created from template: ${template.name}`, userId, goals: goal_id ? { create: { goalId: goal_id } } : undefined } });
      const createdTasks: Array<{ id: string; title: string }> = [];
      if (structure.tasks && Array.isArray(structure.tasks)) {
        let sortOrder = 0;
        for (const taskDef of structure.tasks) {
          const task = await tx.task.create({ data: { title: taskDef.title, priority: taskDef.priority || 'P2', estimatedMinutes: taskDef.estimatedMinutes, projectId: project.id, userId, sortOrder: sortOrder++ } });
          createdTasks.push({ id: task.id, title: task.title });
          if (taskDef.subtasks && Array.isArray(taskDef.subtasks)) {
            let subSortOrder = 0;
            for (const subtaskDef of taskDef.subtasks) {
              const subtask = await tx.task.create({ data: { title: subtaskDef.title, priority: subtaskDef.priority || 'P2', estimatedMinutes: subtaskDef.estimatedMinutes, projectId: project.id, parentId: task.id, userId, sortOrder: subSortOrder++ } });
              createdTasks.push({ id: subtask.id, title: subtask.title });
            }
          }
        }
      }
      return { project, tasks: createdTasks };
    });
    return { success: true, data: { id: result.project.id, title: result.project.title, tasks: result.tasks } };
  } catch (error) {
    return { success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to create project from template' } };
  }
}

async function executeAnalyzeTaskDependencies(userId: string, params: Record<string, unknown>): Promise<ChatToolResult> {
  const { project_id } = params as z.infer<typeof analyzeTaskDependenciesSchema>;
  const project = await prisma.project.findFirst({
    where: { id: project_id, userId },
    include: {
      tasks: {
        where: { status: { not: 'DONE' } },
        include: { parent: true, subTasks: { where: { status: { not: 'DONE' } } }, blockers: { where: { status: 'active' } } },
        orderBy: [{ priority: 'asc' }, { sortOrder: 'asc' }],
      },
    },
  });
  if (!project) return { success: false, error: { code: 'NOT_FOUND', message: 'Project not found or access denied' } };

  const taskMap = new Map(project.tasks.map(t => [t.id, t]));
  const dependencies: Array<{ taskId: string; taskTitle: string; dependsOn: string[]; blockedBy: string[] }> = [];

  for (const task of project.tasks) {
    const dependsOn: string[] = [];
    const blockedBy: string[] = [];
    if (task.parentId && taskMap.has(task.parentId)) dependsOn.push(task.parentId);
    for (const blocker of task.blockers) {
      if (blocker.dependencyType === 'system' && blocker.dependencyIdentifier && taskMap.has(blocker.dependencyIdentifier)) {
        blockedBy.push(blocker.dependencyIdentifier);
      }
    }
    if (task.priority !== 'P1') {
      for (const hpt of project.tasks.filter(t => t.id !== task.id && t.parentId === task.parentId && t.priority === 'P1' && t.status !== 'DONE')) {
        if (!dependsOn.includes(hpt.id)) dependsOn.push(hpt.id);
      }
    }
    dependencies.push({ taskId: task.id, taskTitle: task.title, dependsOn, blockedBy });
  }

  // Topological sort
  const suggestedOrder: string[] = [];
  const visited = new Set<string>();
  const inProgress = new Set<string>();
  function visit(taskId: string): boolean {
    if (inProgress.has(taskId)) return false;
    if (visited.has(taskId)) return true;
    inProgress.add(taskId);
    const dep = dependencies.find(d => d.taskId === taskId);
    if (dep) { for (const depId of [...dep.dependsOn, ...dep.blockedBy]) visit(depId); }
    inProgress.delete(taskId);
    visited.add(taskId);
    suggestedOrder.push(taskId);
    return true;
  }
  const sortedTasks = [...project.tasks].sort((a, b) => { const p = { P1: 0, P2: 1, P3: 2 }; return p[a.priority] - p[b.priority]; });
  for (const task of sortedTasks) visit(task.id);
  const criticalPath = dependencies.filter(d => d.dependsOn.length > 0 || d.blockedBy.length > 0).sort((a, b) => (b.dependsOn.length + b.blockedBy.length) - (a.dependsOn.length + a.blockedBy.length)).slice(0, 5).map(d => d.taskId);
  return { success: true, data: { dependencies, suggestedOrder, criticalPath } };
}

// S1.5 Other execute helpers

async function executeReportBlocker(userId: string, params: Record<string, unknown>): Promise<ChatToolResult> {
  const { task_id, error_log } = params as z.infer<typeof reportBlockerSchema>;
  const task = await prisma.task.findFirst({ where: { id: task_id, userId } });
  if (!task) return { success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } };
  const logResult = await activityLogService.create(userId, { url: `vibe://blocker/${task_id}`, title: `Blocker reported for: ${task.title}`, duration: 0, category: 'neutral', source: 'mcp_agent' });
  const blockerId = logResult.success ? logResult.data?.id : `blocker_${Date.now()}`;
  return { success: true, data: { blocker_id: blockerId } };
}

async function executeDeleteTask(userId: string, params: Record<string, unknown>): Promise<ChatToolResult> {
  const { task_id, archive } = params as z.infer<typeof deleteTaskSchema>;
  const task = await prisma.task.findFirst({ where: { id: task_id, userId } });
  if (!task) return { success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } };
  const doArchive = archive !== false;
  if (doArchive) {
    await prisma.task.update({ where: { id: task_id }, data: { status: 'DONE' } });
  } else {
    await prisma.task.delete({ where: { id: task_id } });
  }
  return { success: true, data: { id: task_id, archived: doArchive } };
}

async function executeGetTaskContext(userId: string, params: Record<string, unknown>): Promise<ChatToolResult> {
  const { task_id } = params as z.infer<typeof getTaskContextSchema>;
  const task = await prisma.task.findFirst({
    where: { id: task_id, userId },
    include: {
      project: { include: { goals: { include: { goal: true } } } },
      parent: true,
      subTasks: true,
      pomodoros: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });
  if (!task) return { success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } };
  const parentPath: string[] = [];
  if (task.parent) parentPath.push(task.parent.title);
  return {
    success: true,
    data: {
      task: {
        id: task.id, title: task.title, priority: task.priority, status: task.status, planDate: task.planDate, parentPath,
        subTasks: task.subTasks.map(st => ({ id: st.id, title: st.title, status: st.status })),
        recentPomodoros: task.pomodoros.map(p => ({ id: p.id, duration: p.duration, status: p.status, startTime: p.startTime })),
      },
      project: {
        id: task.project.id, title: task.project.title, deliverable: task.project.deliverable, status: task.project.status,
        linkedGoals: task.project.goals.map(g => ({ id: g.goal.id, title: g.goal.title, type: g.goal.type })),
      },
      relatedDocs: [],
    },
  };
}

async function executeGenerateDailySummary(userId: string, params: Record<string, unknown>): Promise<ChatToolResult> {
  const { date } = params as z.infer<typeof generateDailySummarySchema>;
  try {
    let targetDate: Date;
    if (date) {
      targetDate = new Date(date);
      targetDate.setHours(0, 0, 0, 0);
    } else {
      targetDate = new Date();
      if (targetDate.getHours() < 4) targetDate.setDate(targetDate.getDate() - 1);
      targetDate.setHours(0, 0, 0, 0);
    }
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const pomodoros = await prisma.pomodoro.findMany({ where: { userId, startTime: { gte: targetDate, lt: nextDay }, status: 'COMPLETED' }, include: { task: { select: { id: true, title: true } } } });
    const completedTasks = await prisma.task.findMany({ where: { userId, status: 'DONE', updatedAt: { gte: targetDate, lt: nextDay } }, include: { pomodoros: { where: { status: 'COMPLETED', startTime: { gte: targetDate, lt: nextDay } } } } });

    const totalPomodoros = pomodoros.length;
    const focusMinutes = pomodoros.reduce((sum, p) => sum + p.duration, 0);
    const taskPomodoroMap = new Map<string, { title: string; count: number }>();
    for (const p of pomodoros) {
      if (!p.taskId) continue;
      const existing = taskPomodoroMap.get(p.taskId);
      if (existing) existing.count++;
      else taskPomodoroMap.set(p.taskId, { title: p.task?.title ?? 'Unknown', count: 1 });
    }
    const completedTasksList = Array.from(taskPomodoroMap.values()).map(t => ({ title: t.title, pomodoros: t.count })).sort((a, b) => b.pomodoros - a.pomodoros);
    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    const expectedPomodoros = settings?.expectedPomodoroCount ?? 8;
    const efficiencyScore = Math.min(100, Math.round((totalPomodoros / expectedPomodoros) * 100));
    const highlights: string[] = [];
    if (completedTasks.length > 0) highlights.push(`Completed ${completedTasks.length} task${completedTasks.length > 1 ? 's' : ''}`);
    if (totalPomodoros >= expectedPomodoros) highlights.push(`Met daily goal of ${expectedPomodoros} pomodoros!`);
    if (focusMinutes >= 120) highlights.push(`${Math.round(focusMinutes / 60)} hours of focused work`);

    const analysisResult = await efficiencyAnalysisService.getHistoricalAnalysis(userId, 7);
    const analysis = analysisResult.success ? analysisResult.data : null;
    const tomorrowSuggestions: string[] = [];
    const incompleteTasks = await prisma.task.findMany({ where: { userId, status: { not: 'DONE' }, priority: 'P1' }, take: 3, orderBy: [{ planDate: 'asc' }, { sortOrder: 'asc' }] });
    for (const t of incompleteTasks) tomorrowSuggestions.push(`Continue: ${t.title}`);
    if (analysis?.insights) {
      for (const insight of analysis.insights.slice(0, 2)) {
        if (insight.type === 'suggestion') tomorrowSuggestions.push(insight.message);
      }
    }
    if (analysis?.byTimePeriod && analysis.byTimePeriod.length > 0) {
      const bestPeriod = analysis.byTimePeriod.reduce((best, current) => current.averagePomodoros > best.averagePomodoros ? current : best);
      if (bestPeriod.averagePomodoros > 0) tomorrowSuggestions.push(`Schedule important work during ${bestPeriod.period} (your most productive time)`);
    }

    return {
      success: true,
      data: {
        date: targetDate.toISOString().split('T')[0], completedTasks: completedTasksList,
        totalPomodoros, focusMinutes, efficiencyScore, highlights, tomorrowSuggestions: tomorrowSuggestions.slice(0, 5),
      },
    };
  } catch (error) {
    return { success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to generate daily summary' } };
  }
}

// ---------------------------------------------------------------------------
// Temporary Unblock Tool (Screen Time)
// ---------------------------------------------------------------------------

const requestTemporaryUnblockSchema = z.object({
  reason_text: z.string().min(1).max(500).describe("用户说明的临时解锁理由"),
  duration: z.number().int().min(1).max(15).describe("解锁时长（分钟，1-15）。用户指定则用用户的值；未指定则根据理由智能判断：快速操作3-5分钟，短通话5-8分钟，较长操作10-15分钟"),
});

async function executeRequestTemporaryUnblock(
  userId: string,
  params: Record<string, unknown>
): Promise<ChatToolResult> {
  try {
    const { reason_text, duration } = requestTemporaryUnblockSchema.parse(params);

    // Determine current blocking reason
    let blockingReason: 'focus' | 'over_rest' | 'sleep' | null = null;

    // Check active pomodoro (focus)
    const pomResult = await pomodoroServiceDirect.getCurrent(userId);
    if (pomResult.success && pomResult.data) {
      blockingReason = 'focus';
    }

    // Check over rest
    if (!blockingReason) {
      const overRestResult = await overRestService.checkOverRestStatus(userId);
      if (overRestResult.success && overRestResult.data?.isOverRest && overRestResult.data?.shouldTriggerActions) {
        blockingReason = 'over_rest';
      }
    }

    // Check sleep time
    if (!blockingReason) {
      const sleepResult = await sleepTimeService.isInSleepTime(userId);
      if (sleepResult.success && sleepResult.data) {
        blockingReason = 'sleep';
      }
    }

    if (!blockingReason) {
      return {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: '当前没有活跃的 Screen Time 阻断，无需解锁' },
      };
    }

    const result = await screenTimeExemptionService.requestTemporaryUnblock(userId, {
      reasonText: reason_text,
      duration,
      blockingReason,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Gather today's unblock stats for AI to relay to user
    const remainingResult = await screenTimeExemptionService.getRemainingUnblocks(userId);
    const historyResult = await screenTimeExemptionService.getExemptionHistory(userId, 1);

    const todayExemptions = historyResult.success && historyResult.data ? historyResult.data : [];
    const todayTotalMinutes = todayExemptions.reduce((sum, e) => sum + e.duration, 0);
    const todayCount = todayExemptions.length;
    const remaining = remainingResult.success && remainingResult.data ? remainingResult.data.remaining : 0;
    const limit = remainingResult.success && remainingResult.data ? remainingResult.data.limit : 3;

    // Map blocking reason to user-friendly label
    const reasonLabels: Record<string, string> = {
      focus: '番茄钟专注中',
      over_rest: '休息超时',
      sleep: '睡眠时间',
    };

    return {
      success: true,
      data: {
        message: `临时解锁已生效，${result.data!.duration} 分钟后自动恢复阻断`,
        blockingReason: result.data!.blockingReason,
        blockingReasonLabel: reasonLabels[result.data!.blockingReason] ?? result.data!.blockingReason,
        duration: result.data!.duration,
        expiresAt: result.data!.expiresAt.toISOString(),
        todayStats: {
          unblockCount: todayCount,
          totalMinutes: todayTotalMinutes,
          remainingUnblocks: remaining,
          dailyLimit: limit,
          reasons: todayExemptions.map(e => ({
            reason: e.reasonText,
            duration: e.duration,
            time: e.grantedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          })),
        },
      },
    };
  } catch (error) {
    return {
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to request temporary unblock' },
    };
  }
}

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
    // F4 original 3 tools
    { name: 'flow_complete_task', description: 'Mark a task as completed with an optional summary', inputSchema: completeTaskSchema, requiresConfirmation: false, execute: executeCompleteTask },
    { name: 'flow_create_task_from_nl', description: 'Create a task from natural language description. Parses priority, date, and time estimates from the text. Use confirm=false to preview parsed result before creation.', inputSchema: createTaskFromNLSchema, requiresConfirmation: false, execute: executeCreateTaskFromNL },
    { name: 'flow_start_pomodoro', description: 'Start a new Pomodoro focus session for a task', inputSchema: startPomodoroSchema, requiresConfirmation: false, execute: executeStartPomodoro },

    // S1.1 Task management tools (6)
    { name: 'flow_update_task', description: 'Update task properties like title, description, priority, estimated time, or plan date', inputSchema: updateTaskSchema, requiresConfirmation: false, execute: executeUpdateTask },
    { name: 'flow_get_task', description: 'Get detailed information about a specific task including subtasks, pomodoro history, and blockers', inputSchema: getTaskSchema, requiresConfirmation: false, execute: executeGetTask },
    { name: 'flow_add_subtask', description: 'Add a new subtask under an existing task', inputSchema: addSubtaskSchema, requiresConfirmation: false, execute: executeAddSubtask },
    { name: 'flow_get_top3', description: 'Get the current Top 3 priority tasks for today', inputSchema: getTop3Schema, requiresConfirmation: false, execute: (userId) => executeGetTop3(userId) },
    { name: 'flow_set_top3', description: 'Set the Top 3 priority tasks for today', inputSchema: setTop3Schema, requiresConfirmation: false, execute: executeSetTop3 },
    { name: 'flow_quick_create_inbox_task', description: 'Quickly create a task in the inbox (first active project)', inputSchema: quickCreateInboxTaskSchema, requiresConfirmation: false, execute: executeQuickCreateInboxTask },

    // S1.2 Pomodoro control tools (4)
    { name: 'flow_switch_task', description: 'Switch to a different task during an active pomodoro session', inputSchema: switchTaskSchema, requiresConfirmation: false, execute: executeSwitchTask },
    { name: 'flow_complete_current_task', description: 'Complete the current task during an active pomodoro and optionally switch to another task', inputSchema: completeCurrentTaskSchema, requiresConfirmation: false, execute: executeCompleteCurrentTask },
    { name: 'flow_start_taskless_pomodoro', description: 'Start a pomodoro session without associating it with a specific task', inputSchema: startTasklessPomodoroSchema, requiresConfirmation: false, execute: executeStartTasklessPomodoro },
    { name: 'flow_record_pomodoro', description: 'Record a pomodoro retroactively (for forgotten sessions)', inputSchema: recordPomodoroSchema, requiresConfirmation: false, execute: executeRecordPomodoro },

    // S1.3 Batch & planning tools (5)
    { name: 'flow_get_overdue_tasks', description: 'Get tasks that are past their plan date', inputSchema: getOverdueTasksSchema, requiresConfirmation: false, execute: executeGetOverdueTasks },
    { name: 'flow_get_backlog_tasks', description: 'Get tasks without a plan date (backlog)', inputSchema: getBacklogTasksSchema, requiresConfirmation: false, execute: executeGetBacklogTasks },
    { name: 'flow_batch_update_tasks', description: 'Update multiple tasks in a single operation. Supports updating status, priority, and plan date.', inputSchema: batchUpdateTasksSchema, requiresConfirmation: true, execute: executeBatchUpdateTasks },
    { name: 'flow_set_plan_date', description: 'Set or clear the plan date for a task', inputSchema: setPlanDateSchema, requiresConfirmation: false, execute: executeSetPlanDate },
    { name: 'flow_move_task', description: 'Move a task to a different project', inputSchema: moveTaskSchema, requiresConfirmation: true, execute: executeMoveTask },

    // S1.4 Project management tools (5)
    { name: 'flow_create_project', description: 'Create a new project', inputSchema: createProjectSchema, requiresConfirmation: false, execute: executeCreateProject },
    { name: 'flow_update_project', description: 'Update project properties', inputSchema: updateProjectSchema, requiresConfirmation: true, execute: executeUpdateProject },
    { name: 'flow_get_project', description: 'Get detailed information about a project including tasks and progress', inputSchema: getProjectSchema, requiresConfirmation: false, execute: executeGetProject },
    { name: 'flow_create_project_from_template', description: 'Create a new project with predefined tasks from a template', inputSchema: createProjectFromTemplateSchema, requiresConfirmation: false, execute: executeCreateProjectFromTemplate },
    { name: 'flow_analyze_task_dependencies', description: 'Analyze task dependencies within a project and suggest optimal execution order', inputSchema: analyzeTaskDependenciesSchema, requiresConfirmation: false, execute: executeAnalyzeTaskDependencies },

    // S1.5 Other tools (4)
    { name: 'flow_report_blocker', description: 'Report a blocker or error encountered while working on a task', inputSchema: reportBlockerSchema, requiresConfirmation: false, execute: executeReportBlocker },
    { name: 'flow_delete_task', description: 'Delete or archive a task (soft delete by default)', inputSchema: deleteTaskSchema, requiresConfirmation: true, execute: executeDeleteTask },
    { name: 'flow_get_task_context', description: 'Get detailed context about a specific task including its project and related documents', inputSchema: getTaskContextSchema, requiresConfirmation: false, execute: executeGetTaskContext },
    { name: 'flow_generate_daily_summary', description: 'Generate a comprehensive summary of daily work including completed tasks, pomodoro stats, and suggestions', inputSchema: generateDailySummarySchema, requiresConfirmation: false, execute: executeGenerateDailySummary },

    // Screen Time temporary unblock
    { name: 'flow_request_temporary_unblock', description: '临时解除 Screen Time 应用屏蔽。用户提供理由，时长由你根据理由智能决定（用户指定时长则尊重）。每天限 3 次，每次最长 15 分钟。', inputSchema: requestTemporaryUnblockSchema, requiresConfirmation: true, execute: executeRequestTemporaryUnblock },
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
  const defs = getChatToolDefinitions();
  const toolSet: ToolSet = {};

  for (const def of defs) {
    // eslint-disable-next-line
    toolSet[def.name] = tool({
      description: def.description,
      inputSchema: def.inputSchema,
      execute: async (params: Record<string, unknown>) => {
        return def.execute(userId, params);
      },
    } as any);
  }

  return toolSet;
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
// Exported schemas for test validation
// ---------------------------------------------------------------------------

export const CHAT_TOOL_SCHEMAS = {
  flow_complete_task: completeTaskSchema,
  flow_create_task_from_nl: createTaskFromNLSchema,
  flow_start_pomodoro: startPomodoroSchema,
  flow_update_task: updateTaskSchema,
  flow_get_task: getTaskSchema,
  flow_add_subtask: addSubtaskSchema,
  flow_get_top3: getTop3Schema,
  flow_set_top3: setTop3Schema,
  flow_quick_create_inbox_task: quickCreateInboxTaskSchema,
  flow_switch_task: switchTaskSchema,
  flow_complete_current_task: completeCurrentTaskSchema,
  flow_start_taskless_pomodoro: startTasklessPomodoroSchema,
  flow_record_pomodoro: recordPomodoroSchema,
  flow_get_overdue_tasks: getOverdueTasksSchema,
  flow_get_backlog_tasks: getBacklogTasksSchema,
  flow_batch_update_tasks: batchUpdateTasksSchema,
  flow_set_plan_date: setPlanDateSchema,
  flow_move_task: moveTaskSchema,
  flow_create_project: createProjectSchema,
  flow_update_project: updateProjectSchema,
  flow_get_project: getProjectSchema,
  flow_create_project_from_template: createProjectFromTemplateSchema,
  flow_analyze_task_dependencies: analyzeTaskDependenciesSchema,
  flow_report_blocker: reportBlockerSchema,
  flow_delete_task: deleteTaskSchema,
  flow_get_task_context: getTaskContextSchema,
  flow_generate_daily_summary: generateDailySummarySchema,
  flow_request_temporary_unblock: requestTemporaryUnblockSchema,
} as const;

// ---------------------------------------------------------------------------
// High-risk tools that require user confirmation before execution
// ---------------------------------------------------------------------------

export const HIGH_RISK_TOOLS: ReadonlySet<string> = new Set(
  getChatToolDefinitions()
    .filter((t) => t.requiresConfirmation)
    .map((t) => t.name)
);

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
  HIGH_RISK_TOOLS,
};
