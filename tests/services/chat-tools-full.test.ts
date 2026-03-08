/**
 * S1.6 Chat Tools Full Binding Tests
 *
 * Tests for every Chat Tool execute:
 * - Calls the correct service method
 * - userId is injected from closure (not AI parameters)
 * - Zod schema validates input correctly
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock all service dependencies before importing
// ---------------------------------------------------------------------------

vi.mock('../../src/services/task.service', () => ({
  taskService: {
    updateStatus: vi.fn(),
    create: vi.fn(),
    quickCreateInboxTask: vi.fn(),
  },
}));

vi.mock('../../src/services/pomodoro.service', () => ({
  pomodoroService: {
    start: vi.fn(),
    startTaskless: vi.fn(),
    completeTaskInPomodoro: vi.fn(),
    record: vi.fn(),
  },
}));

vi.mock('../../src/services/nl-parser.service', () => ({
  nlParserService: {
    parseTaskDescription: vi.fn(),
    confirmAndCreate: vi.fn(),
  },
}));

vi.mock('../../src/services/project.service', () => ({
  projectService: {
    create: vi.fn(),
    update: vi.fn(),
    getById: vi.fn(),
  },
}));

vi.mock('../../src/services/time-slice.service', () => ({
  timeSliceService: {
    switchTask: vi.fn(),
  },
}));

vi.mock('../../src/services/activity-log.service', () => ({
  activityLogService: {
    create: vi.fn(),
  },
}));

vi.mock('../../src/services/efficiency-analysis.service', () => ({
  efficiencyAnalysisService: {
    getHistoricalAnalysis: vi.fn(),
  },
}));

vi.mock('../../src/services/screen-time-exemption.service', () => ({
  screenTimeExemptionService: { requestTemporaryUnblock: vi.fn(), getActiveExemption: vi.fn(), getRemainingUnblocks: vi.fn() },
}));
vi.mock('../../src/services/sleep-time.service', () => ({
  sleepTimeService: { isInSleepTime: vi.fn() },
}));
vi.mock('../../src/services/over-rest.service', () => ({
  overRestService: { checkOverRestStatus: vi.fn() },
}));

vi.mock('../../src/lib/prisma', () => ({
  default: {
    task: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    project: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    pomodoro: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    dailyState: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    goal: {
      findFirst: vi.fn(),
    },
    projectTemplate: {
      findFirst: vi.fn(),
    },
    userSettings: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { taskService } from '../../src/services/task.service';
import { pomodoroService } from '../../src/services/pomodoro.service';
import { timeSliceService } from '../../src/services/time-slice.service';
import { activityLogService } from '../../src/services/activity-log.service';
import { efficiencyAnalysisService } from '../../src/services/efficiency-analysis.service';
import {
  createChatTools,
  getChatToolDefinitions,
  CHAT_TOOL_SCHEMAS,
  clearPendingConfirmations,
  toolRequiresConfirmation,
} from '../../src/services/chat-tools.service';
import prisma from '../../src/lib/prisma';

// Cast prisma to access mocked methods
const mockPrisma = vi.mocked(prisma, true);

const TEST_USER_ID = 'test-user-full-001';
const TOOL_CALL_CTX = { toolCallId: 'tc-1', messages: [] as never[], abortSignal: new AbortController().signal };

beforeEach(() => {
  vi.clearAllMocks();
  clearPendingConfirmations();
});

// ---------------------------------------------------------------------------
// Registry completeness
// ---------------------------------------------------------------------------

describe('getChatToolDefinitions — full registry', () => {
  it('should return 27 tool definitions', () => {
    const defs = getChatToolDefinitions();
    expect(defs).toHaveLength(28);
  });

  it('each definition should have name, description, inputSchema, execute, requiresConfirmation', () => {
    for (const def of getChatToolDefinitions()) {
      expect(def.name).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(def.inputSchema).toBeDefined();
      expect(typeof def.execute).toBe('function');
      expect(typeof def.requiresConfirmation).toBe('boolean');
    }
  });
});

describe('createChatTools — full ToolSet', () => {
  it('should return a ToolSet with all 28 tools', () => {
    const toolSet = createChatTools(TEST_USER_ID);
    expect(Object.keys(toolSet)).toHaveLength(28);
  });

  it('each tool should have execute function', () => {
    const toolSet = createChatTools(TEST_USER_ID);
    for (const [, t] of Object.entries(toolSet)) {
      expect(typeof t.execute).toBe('function');
    }
  });
});

// ---------------------------------------------------------------------------
// S1.1 Task management tools
// ---------------------------------------------------------------------------

describe('S1.1 Task management tools', () => {
  describe('flow_update_task', () => {
    it('should update task via prisma with injected userId', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ id: 'task-1', userId: TEST_USER_ID } as never);
      mockPrisma.task.update.mockResolvedValue({ id: 'task-1', title: 'Updated', priority: 'P1', status: 'TODO', planDate: null } as never);

      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_update_task.execute!({ task_id: 'task-1', title: 'Updated', priority: 'P1' }, TOOL_CALL_CTX);

      expect(mockPrisma.task.findFirst).toHaveBeenCalledWith({ where: { id: 'task-1', userId: TEST_USER_ID } });
      expect(result).toMatchObject({ success: true });
    });

    it('should return NOT_FOUND when task does not exist', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_update_task.execute!({ task_id: 'bad', title: 'x' }, TOOL_CALL_CTX);
      expect(result).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    });
  });

  describe('flow_get_task', () => {
    it('should fetch task with relations using injected userId', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({
        id: 'task-1', title: 'My Task', priority: 'P2', status: 'TODO', planDate: null,
        estimatedMinutes: 60, projectId: 'proj-1', parentId: null,
        project: { id: 'proj-1', title: 'Project' }, parent: null,
        subTasks: [], pomodoros: [], blockers: [],
        createdAt: new Date(), updatedAt: new Date(),
      } as never);

      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_get_task.execute!({ task_id: 'task-1' }, TOOL_CALL_CTX);

      expect(mockPrisma.task.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'task-1', userId: TEST_USER_ID } }));
      expect(result).toMatchObject({ success: true });
    });
  });

  describe('flow_add_subtask', () => {
    it('should create subtask under parent task with injected userId', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ id: 'parent-1', userId: TEST_USER_ID, projectId: 'proj-1' } as never);
      vi.mocked(taskService.create).mockResolvedValue({
        success: true,
        data: { id: 'sub-1', title: 'Sub', priority: 'P2', parentId: 'parent-1', projectId: 'proj-1' } as never,
      });

      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_add_subtask.execute!({ parent_id: 'parent-1', title: 'Sub' }, TOOL_CALL_CTX);

      expect(mockPrisma.task.findFirst).toHaveBeenCalledWith({ where: { id: 'parent-1', userId: TEST_USER_ID } });
      expect(taskService.create).toHaveBeenCalledWith(TEST_USER_ID, expect.objectContaining({ parentId: 'parent-1', title: 'Sub' }));
      expect(result).toMatchObject({ success: true });
    });

    it('should return NOT_FOUND when parent does not exist', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_add_subtask.execute!({ parent_id: 'bad', title: 'Sub' }, TOOL_CALL_CTX);
      expect(result).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    });
  });

  describe('flow_get_top3', () => {
    it('should return top 3 tasks from daily state', async () => {
      mockPrisma.dailyState.findUnique.mockResolvedValue({ top3TaskIds: ['t1', 't2'] } as never);
      mockPrisma.task.findMany.mockResolvedValue([
        { id: 't1', title: 'Task 1', priority: 'P1', status: 'TODO', projectId: 'p1', project: { id: 'p1', title: 'Proj' } },
        { id: 't2', title: 'Task 2', priority: 'P2', status: 'TODO', projectId: 'p1', project: { id: 'p1', title: 'Proj' } },
      ] as never);

      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_get_top3.execute!({}, TOOL_CALL_CTX);

      expect(result).toMatchObject({ success: true });
    });

    it('should return empty when no daily state', async () => {
      mockPrisma.dailyState.findUnique.mockResolvedValue(null);
      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_get_top3.execute!({}, TOOL_CALL_CTX);
      expect(result).toMatchObject({ success: true, data: { tasks: [] } });
    });
  });

  describe('flow_set_top3', () => {
    it('should set top 3 tasks for today', async () => {
      mockPrisma.task.findMany.mockResolvedValue([
        { id: 't1', title: 'T1', priority: 'P1', project: { id: 'p1', title: 'P' } },
      ] as never);
      mockPrisma.dailyState.upsert.mockResolvedValue({} as never);
      mockPrisma.task.updateMany.mockResolvedValue({ count: 1 });

      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_set_top3.execute!({ task_ids: ['t1'] }, TOOL_CALL_CTX);

      expect(mockPrisma.dailyState.upsert).toHaveBeenCalled();
      expect(result).toMatchObject({ success: true });
    });

    it('should reject more than 3 tasks', async () => {
      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_set_top3.execute!({ task_ids: ['a', 'b', 'c', 'd'] }, TOOL_CALL_CTX);
      expect(result).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    });
  });

  describe('flow_quick_create_inbox_task', () => {
    it('should create inbox task with injected userId', async () => {
      vi.mocked(taskService.quickCreateInboxTask).mockResolvedValue({
        success: true,
        data: { id: 'new-1', title: 'Quick Task', projectId: 'proj-1' } as never,
      });

      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_quick_create_inbox_task.execute!({ title: 'Quick Task' }, TOOL_CALL_CTX);

      expect(taskService.quickCreateInboxTask).toHaveBeenCalledWith(TEST_USER_ID, 'Quick Task');
      expect(result).toMatchObject({ success: true });
    });
  });
});

// ---------------------------------------------------------------------------
// S1.2 Pomodoro control tools
// ---------------------------------------------------------------------------

describe('S1.2 Pomodoro control tools', () => {
  describe('flow_switch_task', () => {
    it('should switch task during active pomodoro with injected userId', async () => {
      mockPrisma.pomodoro.findFirst.mockResolvedValue({
        id: 'pom-1', userId: TEST_USER_ID, status: 'IN_PROGRESS',
        timeSlices: [{ id: 'slice-1', endTime: null }],
      } as never);
      vi.mocked(timeSliceService.switchTask).mockResolvedValue({
        success: true,
        data: { id: 'slice-2', taskId: 'task-2', startTime: new Date() } as never,
      });

      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_switch_task.execute!({ pomodoro_id: 'pom-1', new_task_id: 'task-2' }, TOOL_CALL_CTX);

      expect(mockPrisma.pomodoro.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'pom-1', userId: TEST_USER_ID, status: 'IN_PROGRESS' } }));
      expect(timeSliceService.switchTask).toHaveBeenCalledWith('pom-1', 'slice-1', 'task-2');
      expect(result).toMatchObject({ success: true });
    });

    it('should return NOT_FOUND when no active pomodoro', async () => {
      mockPrisma.pomodoro.findFirst.mockResolvedValue(null);
      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_switch_task.execute!({ pomodoro_id: 'bad', new_task_id: 'x' }, TOOL_CALL_CTX);
      expect(result).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    });
  });

  describe('flow_complete_current_task', () => {
    it('should complete current task in pomodoro with injected userId', async () => {
      vi.mocked(pomodoroService.completeTaskInPomodoro).mockResolvedValue({
        success: true,
        data: { completedTaskId: 'task-1', nextTaskId: null } as never,
      });

      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_complete_current_task.execute!({ pomodoro_id: 'pom-1' }, TOOL_CALL_CTX);

      expect(pomodoroService.completeTaskInPomodoro).toHaveBeenCalledWith('pom-1', TEST_USER_ID, undefined);
      expect(result).toMatchObject({ success: true });
    });
  });

  describe('flow_start_taskless_pomodoro', () => {
    it('should start taskless pomodoro with injected userId', async () => {
      vi.mocked(pomodoroService.startTaskless).mockResolvedValue({
        success: true,
        data: { id: 'pom-1', label: 'Misc', startTime: new Date() } as never,
      });

      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_start_taskless_pomodoro.execute!({ label: 'Misc' }, TOOL_CALL_CTX);

      expect(pomodoroService.startTaskless).toHaveBeenCalledWith(TEST_USER_ID, 'Misc');
      expect(result).toMatchObject({ success: true, data: expect.objectContaining({ isTaskless: true }) });
    });
  });

  describe('flow_record_pomodoro', () => {
    it('should record pomodoro with injected userId', async () => {
      vi.mocked(pomodoroService.record).mockResolvedValue({
        success: true,
        data: { id: 'pom-1', taskId: 'task-1', duration: 25, startTime: new Date(), endTime: new Date(), summary: 'Done' } as never,
      });

      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_record_pomodoro.execute!(
        { duration: 25, completed_at: '2026-01-01T12:00:00Z', task_id: 'task-1', summary: 'Done' },
        TOOL_CALL_CTX,
      );

      expect(pomodoroService.record).toHaveBeenCalledWith(TEST_USER_ID, expect.objectContaining({ taskId: 'task-1', duration: 25 }));
      expect(result).toMatchObject({ success: true });
    });
  });
});

// ---------------------------------------------------------------------------
// S1.3 Batch & planning tools
// ---------------------------------------------------------------------------

describe('S1.3 Batch & planning tools', () => {
  describe('flow_get_overdue_tasks', () => {
    it('should fetch overdue tasks with injected userId', async () => {
      mockPrisma.task.findMany.mockResolvedValue([
        { id: 't1', title: 'Late', priority: 'P1', status: 'TODO', planDate: new Date('2025-01-01'), projectId: 'p1', project: { id: 'p1', title: 'Proj' } },
      ] as never);

      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_get_overdue_tasks.execute!({}, TOOL_CALL_CTX);

      expect(mockPrisma.task.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: TEST_USER_ID }) }));
      expect(result).toMatchObject({ success: true });
    });
  });

  describe('flow_get_backlog_tasks', () => {
    it('should fetch backlog tasks with injected userId', async () => {
      mockPrisma.task.findMany.mockResolvedValue([]);

      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_get_backlog_tasks.execute!({}, TOOL_CALL_CTX);

      expect(mockPrisma.task.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: TEST_USER_ID, planDate: null }) }));
      expect(result).toMatchObject({ success: true });
    });
  });

  describe('flow_batch_update_tasks', () => {
    it('should batch update tasks in transaction', async () => {
      mockPrisma.$transaction.mockImplementation(async (fn: unknown) => {
        await (fn as (tx: typeof mockPrisma) => Promise<void>)(mockPrisma);
      });
      mockPrisma.task.findFirst.mockResolvedValue({ id: 't1', userId: TEST_USER_ID } as never);
      mockPrisma.task.update.mockResolvedValue({ id: 't1' } as never);

      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_batch_update_tasks.execute!(
        { updates: [{ task_id: 't1', status: 'DONE' }] },
        TOOL_CALL_CTX,
      );

      expect(result).toMatchObject({ success: true });
    });

    it('should reject empty updates array', async () => {
      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_batch_update_tasks.execute!({ updates: [] }, TOOL_CALL_CTX);
      expect(result).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    });
  });

  describe('flow_set_plan_date', () => {
    it('should set plan date with injected userId', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ id: 't1', userId: TEST_USER_ID } as never);
      mockPrisma.task.update.mockResolvedValue({ id: 't1', title: 'T', planDate: new Date('2026-03-01') } as never);

      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_set_plan_date.execute!({ task_id: 't1', plan_date: '2026-03-01' }, TOOL_CALL_CTX);

      expect(mockPrisma.task.findFirst).toHaveBeenCalledWith({ where: { id: 't1', userId: TEST_USER_ID } });
      expect(result).toMatchObject({ success: true });
    });

    it('should clear plan date with null', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ id: 't1', userId: TEST_USER_ID } as never);
      mockPrisma.task.update.mockResolvedValue({ id: 't1', title: 'T', planDate: null } as never);

      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_set_plan_date.execute!({ task_id: 't1', plan_date: null }, TOOL_CALL_CTX);

      expect(mockPrisma.task.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { planDate: null } });
      expect(result).toMatchObject({ success: true });
    });
  });

  describe('flow_move_task', () => {
    it('should move task to target project with injected userId', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ id: 't1', userId: TEST_USER_ID } as never);
      mockPrisma.project.findFirst.mockResolvedValue({ id: 'p2', userId: TEST_USER_ID } as never);
      mockPrisma.task.update.mockResolvedValue({ id: 't1', title: 'T', projectId: 'p2', project: { title: 'Target' } } as never);

      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_move_task.execute!({ task_id: 't1', target_project_id: 'p2' }, TOOL_CALL_CTX);

      expect(result).toMatchObject({ success: true });
    });

    it('should return NOT_FOUND for missing target project', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ id: 't1', userId: TEST_USER_ID } as never);
      mockPrisma.project.findFirst.mockResolvedValue(null);

      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_move_task.execute!({ task_id: 't1', target_project_id: 'bad' }, TOOL_CALL_CTX);
      expect(result).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    });
  });
});

// ---------------------------------------------------------------------------
// S1.4 Project management tools
// ---------------------------------------------------------------------------

describe('S1.4 Project management tools', () => {
  describe('flow_create_project', () => {
    it('should create project with injected userId', async () => {
      mockPrisma.project.create.mockResolvedValue({ id: 'proj-1', title: 'New', deliverable: 'Del', status: 'ACTIVE' } as never);

      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_create_project.execute!({ title: 'New', deliverable: 'Del' }, TOOL_CALL_CTX);

      expect(mockPrisma.project.create).toHaveBeenCalledWith({ data: expect.objectContaining({ title: 'New', userId: TEST_USER_ID }) });
      expect(result).toMatchObject({ success: true });
    });
  });

  describe('flow_update_project', () => {
    it('should update project with injected userId', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({ id: 'proj-1', userId: TEST_USER_ID } as never);
      mockPrisma.project.update.mockResolvedValue({ id: 'proj-1', title: 'Updated', deliverable: 'D', status: 'ACTIVE' } as never);

      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_update_project.execute!({ project_id: 'proj-1', title: 'Updated' }, TOOL_CALL_CTX);

      expect(mockPrisma.project.findFirst).toHaveBeenCalledWith({ where: { id: 'proj-1', userId: TEST_USER_ID } });
      expect(result).toMatchObject({ success: true });
    });

    it('should return NOT_FOUND for missing project', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(null);
      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_update_project.execute!({ project_id: 'bad', title: 'x' }, TOOL_CALL_CTX);
      expect(result).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    });
  });

  describe('flow_get_project', () => {
    it('should get project details with task counts', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({
        id: 'proj-1', title: 'P', deliverable: 'D', status: 'ACTIVE',
        tasks: [], goals: [], createdAt: new Date(),
      } as never);
      mockPrisma.task.count.mockResolvedValueOnce(10).mockResolvedValueOnce(3);

      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_get_project.execute!({ project_id: 'proj-1' }, TOOL_CALL_CTX);

      expect(result).toMatchObject({ success: true, data: expect.objectContaining({ progress: 30 }) });
    });
  });

  describe('flow_create_project_from_template', () => {
    it('should create project from template with injected userId', async () => {
      mockPrisma.projectTemplate.findFirst.mockResolvedValue({ id: 'tmpl-1', name: 'Tmpl', structure: { deliverable: 'D', tasks: [] } } as never);
      mockPrisma.$transaction.mockImplementation(async (fn: unknown) => {
        return (fn as (tx: typeof mockPrisma) => Promise<{ project: { id: string; title: string }; tasks: never[] }>)(mockPrisma);
      });
      mockPrisma.project.create.mockResolvedValue({ id: 'proj-new', title: 'From Template' } as never);

      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_create_project_from_template.execute!(
        { template_id: 'tmpl-1', project_name: 'From Template' },
        TOOL_CALL_CTX,
      );

      expect(result).toMatchObject({ success: true });
    });

    it('should return NOT_FOUND for missing template', async () => {
      mockPrisma.projectTemplate.findFirst.mockResolvedValue(null);
      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_create_project_from_template.execute!({ template_id: 'bad', project_name: 'X' }, TOOL_CALL_CTX);
      expect(result).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    });
  });

  describe('flow_analyze_task_dependencies', () => {
    it('should analyze dependencies for a project', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({
        id: 'proj-1', userId: TEST_USER_ID,
        tasks: [
          { id: 't1', title: 'A', priority: 'P1', status: 'TODO', parentId: null, subTasks: [], blockers: [] },
          { id: 't2', title: 'B', priority: 'P2', status: 'TODO', parentId: null, subTasks: [], blockers: [] },
        ],
      } as never);

      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_analyze_task_dependencies.execute!({ project_id: 'proj-1' }, TOOL_CALL_CTX);

      expect(result).toMatchObject({ success: true, data: expect.objectContaining({ dependencies: expect.any(Array), suggestedOrder: expect.any(Array) }) });
    });
  });
});

// ---------------------------------------------------------------------------
// S1.5 Other tools
// ---------------------------------------------------------------------------

describe('S1.5 Other tools', () => {
  describe('flow_report_blocker', () => {
    it('should report blocker with injected userId', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ id: 't1', title: 'Task', userId: TEST_USER_ID } as never);
      vi.mocked(activityLogService.create).mockResolvedValue({ success: true, data: { id: 'log-1' } as never });

      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_report_blocker.execute!({ task_id: 't1', error_log: 'Something broke' }, TOOL_CALL_CTX);

      expect(activityLogService.create).toHaveBeenCalledWith(TEST_USER_ID, expect.objectContaining({ url: 'vibe://blocker/t1' }));
      expect(result).toMatchObject({ success: true });
    });
  });

  describe('flow_delete_task', () => {
    it('should soft-delete (archive) by default', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ id: 't1', userId: TEST_USER_ID } as never);
      mockPrisma.task.update.mockResolvedValue({ id: 't1' } as never);

      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_delete_task.execute!({ task_id: 't1' }, TOOL_CALL_CTX);

      expect(mockPrisma.task.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { status: 'DONE' } });
      expect(result).toMatchObject({ success: true, data: { archived: true } });
    });

    it('should hard-delete when archive=false', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ id: 't1', userId: TEST_USER_ID } as never);
      mockPrisma.task.delete.mockResolvedValue({ id: 't1' } as never);

      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_delete_task.execute!({ task_id: 't1', archive: false }, TOOL_CALL_CTX);

      expect(mockPrisma.task.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
      expect(result).toMatchObject({ success: true, data: { archived: false } });
    });

    it('should require confirmation', () => {
      expect(toolRequiresConfirmation('flow_delete_task')).toBe(true);
    });
  });

  describe('flow_get_task_context', () => {
    it('should get task context with relations', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({
        id: 't1', title: 'T', priority: 'P2', status: 'TODO', planDate: null,
        project: { id: 'p1', title: 'P', deliverable: 'D', status: 'ACTIVE', goals: [] },
        parent: null, subTasks: [], pomodoros: [],
      } as never);

      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_get_task_context.execute!({ task_id: 't1' }, TOOL_CALL_CTX);

      expect(result).toMatchObject({ success: true, data: expect.objectContaining({ task: expect.any(Object), project: expect.any(Object) }) });
    });
  });

  describe('flow_generate_daily_summary', () => {
    it('should generate summary with injected userId', async () => {
      mockPrisma.pomodoro.findMany.mockResolvedValue([]);
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.userSettings.findUnique.mockResolvedValue({ expectedPomodoroCount: 8 } as never);
      vi.mocked(efficiencyAnalysisService.getHistoricalAnalysis).mockResolvedValue({ success: true, data: { insights: [], byTimePeriod: [] } as never });

      const tools = createChatTools(TEST_USER_ID);
      const result = await tools.flow_generate_daily_summary.execute!({}, TOOL_CALL_CTX);

      expect(result).toMatchObject({ success: true, data: expect.objectContaining({ totalPomodoros: 0, focusMinutes: 0 }) });
    });
  });
});

// ---------------------------------------------------------------------------
// userId injection — cross-tool verification
// ---------------------------------------------------------------------------

describe('userId injection — all tools use closure userId', () => {
  it('different users get different closures for flow_update_task', async () => {
    mockPrisma.task.findFirst.mockResolvedValue({ id: 't1', userId: 'user-A' } as never);
    mockPrisma.task.update.mockResolvedValue({ id: 't1', title: 'x', priority: 'P2', status: 'TODO', planDate: null } as never);

    const toolsA = createChatTools('user-A');
    const toolsB = createChatTools('user-B');

    await toolsA.flow_update_task.execute!({ task_id: 't1', title: 'x' }, TOOL_CALL_CTX);
    await toolsB.flow_update_task.execute!({ task_id: 't1', title: 'y' }, TOOL_CALL_CTX);

    const calls = mockPrisma.task.findFirst.mock.calls as Array<[{ where: { userId: string } }]>;
    expect(calls[0][0].where.userId).toBe('user-A');
    expect(calls[1][0].where.userId).toBe('user-B');
  });
});

// ---------------------------------------------------------------------------
// Zod schema validation
// ---------------------------------------------------------------------------

describe('Zod schema validation', () => {
  it('all schemas should accept valid input', () => {
    const validInputs: Record<string, Record<string, unknown>> = {
      flow_complete_task: { task_id: 'abc' },
      flow_create_task_from_nl: { description: 'test' },
      flow_start_pomodoro: { task_id: 'abc' },
      flow_update_task: { task_id: 'abc', title: 'new' },
      flow_get_task: { task_id: 'abc' },
      flow_add_subtask: { parent_id: 'abc', title: 'sub' },
      flow_get_top3: {},
      flow_set_top3: { task_ids: ['a', 'b'] },
      flow_quick_create_inbox_task: { title: 'quick' },
      flow_switch_task: { pomodoro_id: 'abc', new_task_id: 'def' },
      flow_complete_current_task: { pomodoro_id: 'abc' },
      flow_start_taskless_pomodoro: {},
      flow_record_pomodoro: { duration: 25, completed_at: '2026-01-01T12:00:00Z' },
      flow_get_overdue_tasks: {},
      flow_get_backlog_tasks: {},
      flow_batch_update_tasks: { updates: [{ task_id: 'a' }] },
      flow_set_plan_date: { task_id: 'a', plan_date: '2026-01-01' },
      flow_move_task: { task_id: 'a', target_project_id: 'b' },
      flow_create_project: { title: 'P', deliverable: 'D' },
      flow_update_project: { project_id: 'a' },
      flow_get_project: { project_id: 'a' },
      flow_create_project_from_template: { template_id: 'a', project_name: 'P' },
      flow_analyze_task_dependencies: { project_id: 'a' },
      flow_report_blocker: { task_id: 'a', error_log: 'err' },
      flow_delete_task: { task_id: 'a' },
      flow_get_task_context: { task_id: 'a' },
      flow_generate_daily_summary: {},
    };

    for (const [name, input] of Object.entries(validInputs)) {
      const schema = CHAT_TOOL_SCHEMAS[name as keyof typeof CHAT_TOOL_SCHEMAS];
      expect(schema, `Schema not found for ${name}`).toBeDefined();
      const parseResult = schema.safeParse(input);
      expect(parseResult.success, `Schema validation failed for ${name}: ${JSON.stringify(parseResult)}`).toBe(true);
    }
  });

  it('schemas should reject invalid required fields', () => {
    // flow_complete_task requires task_id (string)
    const result1 = CHAT_TOOL_SCHEMAS.flow_complete_task.safeParse({});
    expect(result1.success).toBe(false);

    // flow_add_subtask requires parent_id and title
    const result2 = CHAT_TOOL_SCHEMAS.flow_add_subtask.safeParse({ parent_id: 'x' }); // missing title
    expect(result2.success).toBe(false);

    // flow_batch_update_tasks.updates must be array of objects
    const result3 = CHAT_TOOL_SCHEMAS.flow_batch_update_tasks.safeParse({ updates: 'not-array' });
    expect(result3.success).toBe(false);

    // flow_record_pomodoro requires duration and completed_at
    const result4 = CHAT_TOOL_SCHEMAS.flow_record_pomodoro.safeParse({ duration: 25 }); // missing completed_at
    expect(result4.success).toBe(false);

    // flow_create_project requires title and deliverable
    const result5 = CHAT_TOOL_SCHEMAS.flow_create_project.safeParse({ title: 'X' }); // missing deliverable
    expect(result5.success).toBe(false);
  });
});
