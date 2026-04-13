/**
 * MCP Bridge Router
 *
 * Provides tRPC procedures for MCP-specific operations that don't map
 * directly to existing routers. This bridges the gap between MCP tools/resources
 * and the server's service layer.
 */

import { z } from 'zod';
import { router, readProcedure, writeProcedure } from '../trpc';
import prisma from '../../lib/prisma';
import { taskService } from '../../services/task.service';
import { projectService } from '../../services/project.service';
import { activityLogService } from '../../services/activity-log.service';
import { mcpAuditService } from '../../services/mcp-audit.service';
import { efficiencyAnalysisService } from '../../services/efficiency-analysis.service';
import { nlParserService } from '../../services/nl-parser.service';
// dailyStateService not needed — setTop3 uses Prisma directly
import { screenTimeExemptionService } from '../../services/screen-time-exemption.service';
import { pomodoroService } from '../../services/pomodoro.service';
import { sleepTimeService } from '../../services/sleep-time.service';
import { overRestService } from '../../services/over-rest.service';
import { TRPCError } from '@trpc/server';

export const mcpBridgeRouter = router({
  /**
   * whoami: returns userId and email for the authenticated user
   */
  whoami: readProcedure
    .query(({ ctx }) => {
      return { userId: ctx.user.userId, email: ctx.user.email };
    }),

  /**
   * getTaskContext: rich query for a task with project, goals, parent, subtasks, recent pomodoros
   */
  getTaskContext: readProcedure
    .input(z.object({ taskId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const task = await prisma.task.findFirst({
        where: { id: input.taskId, userId: ctx.user.userId },
        include: {
          project: {
            include: {
              goals: { include: { goal: true } },
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
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
      }

      const parentPath: string[] = [];
      if (task.parent) {
        parentPath.push(task.parent.title);
      }

      return {
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
        relatedDocs: [],
      };
    }),

  /**
   * batchUpdateTasks: transactional batch update for status/priority/planDate
   */
  batchUpdateTasks: writeProcedure
    .input(z.object({
      updates: z.array(z.object({
        taskId: z.string().uuid(),
        status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional(),
        priority: z.enum(['P1', 'P2', 'P3']).optional(),
        planDate: z.string().optional(),
      })).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const failed: Array<{ taskId: string; error: string }> = [];
      let updatedCount = 0;

      await prisma.$transaction(async (tx) => {
        for (const update of input.updates) {
          const task = await tx.task.findFirst({
            where: { id: update.taskId, userId: ctx.user.userId },
          });

          if (!task) {
            failed.push({ taskId: update.taskId, error: 'Task not found or access denied' });
            continue;
          }

          const updateData: Record<string, unknown> = {};
          if (update.status) updateData.status = update.status;
          if (update.priority) updateData.priority = update.priority;
          if (update.planDate !== undefined) {
            updateData.planDate = update.planDate ? new Date(update.planDate) : null;
          }

          if (Object.keys(updateData).length > 0) {
            await tx.task.update({ where: { id: update.taskId }, data: updateData });
            updatedCount++;
          }
        }

        if (updatedCount === 0 && failed.length > 0) {
          throw new Error('All updates failed');
        }
      });

      return { updated: updatedCount, failed: failed.length > 0 ? failed : undefined };
    }),

  /**
   * createProjectFromTemplate: create a project with tasks from a template
   */
  createProjectFromTemplate: writeProcedure
    .input(z.object({
      templateId: z.string().uuid(),
      projectName: z.string().min(1),
      goalId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const template = await prisma.projectTemplate.findFirst({
        where: {
          id: input.templateId,
          OR: [{ isSystem: true }, { userId: ctx.user.userId }],
        },
      });

      if (!template) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Template not found or access denied' });
      }

      if (input.goalId) {
        const goal = await prisma.goal.findFirst({
          where: { id: input.goalId, userId: ctx.user.userId },
        });
        if (!goal) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Goal not found or access denied' });
        }
      }

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

      const result = await prisma.$transaction(async (tx) => {
        const project = await tx.project.create({
          data: {
            title: input.projectName,
            deliverable: structure.deliverable || `Project created from template: ${template.name}`,
            userId: ctx.user.userId,
            goals: input.goalId ? { create: { goalId: input.goalId } } : undefined,
          },
        });

        const createdTasks: Array<{ id: string; title: string }> = [];

        if (structure.tasks && Array.isArray(structure.tasks)) {
          let sortOrder = 0;
          for (const taskDef of structure.tasks) {
            const task = await tx.task.create({
              data: {
                title: taskDef.title,
                priority: taskDef.priority || 'P2',
                estimatedMinutes: taskDef.estimatedMinutes,
                projectId: project.id,
                userId: ctx.user.userId,
                sortOrder: sortOrder++,
              },
            });
            createdTasks.push({ id: task.id, title: task.title });

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
                    userId: ctx.user.userId,
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
        id: result.project.id,
        title: result.project.title,
        tasks: result.tasks,
      };
    }),

  /**
   * analyzeTaskDependencies: dependency graph + topological sort for a project
   */
  analyzeTaskDependencies: readProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, userId: ctx.user.userId },
        include: {
          tasks: {
            where: { status: { not: 'DONE' } },
            include: {
              parent: true,
              subTasks: { where: { status: { not: 'DONE' } } },
              blockers: { where: { status: 'active' } },
            },
            orderBy: [{ priority: 'asc' }, { sortOrder: 'asc' }],
          },
        },
      });

      if (!project) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found or access denied' });
      }

      const taskMap = new Map(project.tasks.map(t => [t.id, t]));

      const dependencies = project.tasks.map(task => {
        const dependsOn: string[] = [];
        const blockedBy: string[] = [];

        if (task.parentId && taskMap.has(task.parentId)) {
          dependsOn.push(task.parentId);
        }

        for (const blocker of task.blockers) {
          if (blocker.dependencyType === 'system' && blocker.dependencyIdentifier && taskMap.has(blocker.dependencyIdentifier)) {
            blockedBy.push(blocker.dependencyIdentifier);
          }
        }

        if (task.priority !== 'P1') {
          const higherPriorityTasks = project.tasks.filter(t =>
            t.id !== task.id && t.parentId === task.parentId && t.priority === 'P1' && t.status !== 'DONE'
          );
          for (const hpt of higherPriorityTasks) {
            if (!dependsOn.includes(hpt.id)) dependsOn.push(hpt.id);
          }
        }

        return { taskId: task.id, taskTitle: task.title, dependsOn, blockedBy };
      });

      // Topological sort
      const suggestedOrder: string[] = [];
      const visited = new Set<string>();
      const inProgress = new Set<string>();

      function visit(taskId: string): boolean {
        if (inProgress.has(taskId)) return false;
        if (visited.has(taskId)) return true;
        inProgress.add(taskId);
        const dep = dependencies.find(d => d.taskId === taskId);
        if (dep) {
          for (const depId of [...dep.dependsOn, ...dep.blockedBy]) {
            visit(depId);
          }
        }
        inProgress.delete(taskId);
        visited.add(taskId);
        suggestedOrder.push(taskId);
        return true;
      }

      const sortedTasks = [...project.tasks].sort((a, b) => {
        const priorityOrder = { P1: 0, P2: 1, P3: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      for (const task of sortedTasks) {
        visit(task.id);
      }

      const criticalPath = dependencies
        .filter(d => d.dependsOn.length > 0 || d.blockedBy.length > 0)
        .sort((a, b) => (b.dependsOn.length + b.blockedBy.length) - (a.dependsOn.length + a.blockedBy.length))
        .slice(0, 5)
        .map(d => d.taskId);

      return { dependencies, suggestedOrder, criticalPath };
    }),

  /**
   * generateDailySummary: completed tasks, pomodoro stats, efficiency, suggestions
   */
  generateDailySummary: readProcedure
    .input(z.object({ date: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      let targetDate: Date;
      if (input.date) {
        targetDate = new Date(input.date);
        targetDate.setHours(0, 0, 0, 0);
      } else {
        targetDate = new Date();
        if (targetDate.getHours() < 4) targetDate.setDate(targetDate.getDate() - 1);
        targetDate.setHours(0, 0, 0, 0);
      }

      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);

      const pomodoros = await prisma.pomodoro.findMany({
        where: {
          userId: ctx.user.userId,
          startTime: { gte: targetDate, lt: nextDay },
          status: 'COMPLETED',
        },
        include: { task: { select: { id: true, title: true } } },
      });

      const completedTasks = await prisma.task.findMany({
        where: {
          userId: ctx.user.userId,
          status: 'DONE',
          updatedAt: { gte: targetDate, lt: nextDay },
        },
        include: {
          pomodoros: {
            where: { status: 'COMPLETED', startTime: { gte: targetDate, lt: nextDay } },
          },
        },
      });

      const totalPomodoros = pomodoros.length;
      const focusMinutes = pomodoros.reduce((sum, p) => sum + p.duration, 0);

      const taskPomodoroMap = new Map<string, { title: string; count: number }>();
      for (const pomodoro of pomodoros) {
        if (!pomodoro.taskId) continue;
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

      const settings = await prisma.userSettings.findUnique({
        where: { userId: ctx.user.userId },
      });
      const expectedPomodoros = settings?.expectedPomodoroCount ?? 8;
      const efficiencyScore = Math.min(100, Math.round((totalPomodoros / expectedPomodoros) * 100));

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

      const analysisResult = await efficiencyAnalysisService.getHistoricalAnalysis(ctx.user.userId, 7);
      const analysis = analysisResult.success ? analysisResult.data : null;

      const tomorrowSuggestions: string[] = [];
      const incompleteTasks = await prisma.task.findMany({
        where: { userId: ctx.user.userId, status: { not: 'DONE' }, priority: 'P1' },
        take: 3,
        orderBy: [{ planDate: 'asc' }, { sortOrder: 'asc' }],
      });
      for (const task of incompleteTasks) {
        tomorrowSuggestions.push(`Continue: ${task.title}`);
      }
      if (analysis?.insights) {
        for (const insight of analysis.insights.slice(0, 2)) {
          if (insight.type === 'suggestion') tomorrowSuggestions.push(insight.message);
        }
      }
      if (analysis?.byTimePeriod && analysis.byTimePeriod.length > 0) {
        const bestPeriod = analysis.byTimePeriod.reduce((best, current) =>
          current.averagePomodoros > best.averagePomodoros ? current : best
        );
        if (bestPeriod.averagePomodoros > 0) {
          tomorrowSuggestions.push(`Schedule important work during ${bestPeriod.period} (your most productive time)`);
        }
      }

      return {
        date: targetDate.toISOString().split('T')[0],
        completedTasks: completedTasksList,
        totalPomodoros,
        focusMinutes,
        efficiencyScore,
        highlights,
        tomorrowSuggestions: tomorrowSuggestions.slice(0, 5),
      };
    }),

  /**
   * createBlocker: create a blocker for a task with activity log
   */
  createBlocker: writeProcedure
    .input(z.object({
      taskId: z.string().uuid(),
      errorLog: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const task = await prisma.task.findFirst({
        where: { id: input.taskId, userId: ctx.user.userId },
      });

      if (!task) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
      }

      const logResult = await activityLogService.create(ctx.user.userId, {
        url: `vibe://blocker/${input.taskId}`,
        title: `Blocker reported for: ${task.title}`,
        duration: 0,
        category: 'neutral',
        source: 'mcp_agent',
      });

      const blockerId = logResult.success ? logResult.data?.id : `blocker_${Date.now()}`;
      return { blockerId };
    }),

  /**
   * getActiveBlockers: get all active blockers for the user
   */
  getActiveBlockers: readProcedure
    .query(async ({ ctx }) => {
      const blockers = await prisma.blocker.findMany({
        where: { userId: ctx.user.userId, status: 'active' },
        include: { task: { select: { title: true } } },
        orderBy: { reportedAt: 'desc' },
      });

      return {
        blockers: blockers.map(b => ({
          id: b.id,
          taskId: b.taskId,
          taskTitle: b.task.title,
          category: b.category,
          description: b.description,
          reportedAt: b.reportedAt,
          status: b.status,
        })),
      };
    }),

  /**
   * getActivityLog: recent 24h activity log
   */
  getActivityLog: readProcedure
    .query(async ({ ctx }) => {
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      const recentActivity = await prisma.activityLog.findMany({
        where: { userId: ctx.user.userId, timestamp: { gte: oneDayAgo } },
        orderBy: { timestamp: 'desc' },
        take: 50,
      });

      const currentFiles: string[] = [];
      const recentChanges: Array<{ file: string; timestamp: Date; changeType: string }> = [];
      const seenUrls = new Set<string>();

      for (const activity of recentActivity) {
        const url = activity.url;
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          currentFiles.push(url);
          recentChanges.push({
            file: url,
            timestamp: activity.timestamp,
            changeType: 'modified',
          });
        }
      }

      return {
        currentFiles: currentFiles.slice(0, 20),
        recentChanges: recentChanges.slice(0, 20),
        activeBranch: null,
        workspaceRoot: 'vibeflow://workspace',
      };
    }),

  /**
   * getPomodoroHistory: 7-day pomodoro history with task info
   */
  getPomodoroHistory: readProcedure
    .query(async ({ ctx }) => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const pomodoros = await prisma.pomodoro.findMany({
        where: { userId: ctx.user.userId, startTime: { gte: sevenDaysAgo } },
        include: { task: { include: { project: true } } },
        orderBy: { startTime: 'desc' },
      });

      const sessions = pomodoros.map(p => ({
        id: p.id,
        taskId: p.taskId ?? '',
        taskTitle: p.task?.title ?? 'Taskless',
        projectId: p.task?.projectId ?? '',
        projectTitle: p.task?.project.title ?? '',
        duration: p.duration,
        status: p.status,
        startTime: p.startTime,
        endTime: p.endTime,
      }));

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
    }),

  /**
   * moveTask: move a task to a different project
   */
  moveTask: writeProcedure
    .input(z.object({
      taskId: z.string().uuid(),
      targetProjectId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [task, targetProject] = await Promise.all([
        prisma.task.findFirst({ where: { id: input.taskId, userId: ctx.user.userId } }),
        prisma.project.findFirst({ where: { id: input.targetProjectId, userId: ctx.user.userId } }),
      ]);

      if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
      if (!targetProject) throw new TRPCError({ code: 'NOT_FOUND', message: 'Target project not found' });

      const updated = await prisma.task.update({
        where: { id: input.taskId },
        data: { projectId: input.targetProjectId, parentId: null },
      });

      return {
        id: updated.id,
        title: updated.title,
        projectId: updated.projectId,
      };
    }),

  /**
   * setTop3: set top 3 task IDs and update their plan dates to today
   */
  setTop3: writeProcedure
    .input(z.object({
      taskIds: z.array(z.string().uuid()).min(1).max(3),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify all tasks exist and belong to user
      const tasks = await prisma.task.findMany({
        where: { id: { in: input.taskIds }, userId: ctx.user.userId },
      });
      if (tasks.length !== input.taskIds.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'One or more tasks not found' });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await prisma.dailyState.upsert({
        where: { userId_date: { userId: ctx.user.userId, date: today } },
        update: { top3TaskIds: input.taskIds },
        create: {
          userId: ctx.user.userId,
          date: today,
          systemState: 'IDLE',
          top3TaskIds: input.taskIds,
        },
      });

      // Also set planDate for these tasks to today
      await prisma.task.updateMany({
        where: { id: { in: input.taskIds } },
        data: { planDate: today },
      });

      return { taskIds: input.taskIds };
    }),

  /**
   * createTaskFromNl: natural language task parsing + creation
   */
  createTaskFromNl: writeProcedure
    .input(z.object({
      description: z.string().min(1),
      projectId: z.string().uuid().optional(),
      confirm: z.boolean().optional().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const parseResult = await nlParserService.parseTaskDescription(
        ctx.user.userId,
        input.description
      );

      if (!parseResult.success || !parseResult.data) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: parseResult.error?.message || 'Failed to parse task description',
        });
      }

      const parsed = parseResult.data;
      if (input.projectId) parsed.projectId = input.projectId;

      const candidatesResult = await nlParserService.getProjectCandidates(
        ctx.user.userId,
        parsed.title
      );
      const projectCandidates = candidatesResult.success ? candidatesResult.data : [];

      if (!input.confirm) {
        return {
          parsed: {
            title: parsed.title,
            priority: parsed.priority,
            projectId: parsed.projectId,
            planDate: parsed.planDate,
            estimatedMinutes: parsed.estimatedMinutes,
            confidence: parsed.confidence,
            ambiguities: parsed.ambiguities,
          },
          projectCandidates: projectCandidates ?? [],
          task: null,
        };
      }

      if (!parsed.projectId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Project ID is required to create task. Please provide projectId parameter.',
        });
      }

      const createResult = await nlParserService.confirmAndCreate(ctx.user.userId, parsed);
      if (!createResult.success || !createResult.data) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: createResult.error?.message || 'Failed to create task',
        });
      }

      const task = createResult.data;
      return {
        parsed: null,
        projectCandidates: [],
        task: {
          id: task.id,
          title: task.title,
          priority: task.priority,
          projectId: task.projectId,
          planDate: task.planDate,
          estimatedMinutes: task.estimatedMinutes,
        },
      };
    }),

  /**
   * requestTemporaryUnblock: Screen Time temporary unblock
   */
  requestTemporaryUnblock: writeProcedure
    .input(z.object({
      reasonText: z.string().min(1),
      duration: z.number().min(1).max(15),
    }))
    .mutation(async ({ ctx, input }) => {
      // Determine blocking reason
      let blockingReason: 'focus' | 'over_rest' | 'sleep' | null = null;

      const pomResult = await pomodoroService.getCurrent(ctx.user.userId);
      if (pomResult.success && pomResult.data) blockingReason = 'focus';

      if (!blockingReason) {
        const orResult = await overRestService.checkOverRestStatus(ctx.user.userId);
        if (orResult.success && orResult.data?.isOverRest && orResult.data?.shouldTriggerActions) {
          blockingReason = 'over_rest';
        }
      }

      if (!blockingReason) {
        const sleepResult = await sleepTimeService.isInSleepTime(ctx.user.userId);
        if (sleepResult.success && sleepResult.data) blockingReason = 'sleep';
      }

      if (!blockingReason) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '当前没有活跃的 Screen Time 阻断',
        });
      }

      const result = await screenTimeExemptionService.requestTemporaryUnblock(ctx.user.userId, {
        reasonText: input.reasonText,
        duration: input.duration,
        blockingReason,
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error?.message || 'Failed to request temporary unblock',
        });
      }

      return result.data;
    }),

  /**
   * logMcpAudit: fire-and-forget audit log for MCP tool calls
   */
  logMcpAudit: writeProcedure
    .input(z.object({
      agentId: z.string(),
      toolName: z.string(),
      input: z.record(z.unknown()),
      output: z.record(z.unknown()),
      success: z.boolean(),
      duration: z.number(),
    }))
    .mutation(async ({ ctx, input: auditInput }) => {
      await mcpAuditService.logToolCall(ctx.user.userId, {
        agentId: auditInput.agentId,
        toolName: auditInput.toolName,
        input: auditInput.input,
        output: auditInput.output,
        success: auditInput.success,
        duration: auditInput.duration,
      });
      return { logged: true };
    }),
});
