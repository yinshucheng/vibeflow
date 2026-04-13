/**
 * F4.4 Chat Tools tests
 *
 * Tests for:
 * - Tool registration: Zod schema → tool() format, inputSchema correct
 * - Tool execute: userId from closure injection, not from AI parameters
 * - Tool execute: flow_complete_task → taskService.updateStatus called with correct userId
 * - Tool execute: flow_create_task_from_nl → nlParserService.parseTaskDescription called
 * - Tool execute: flow_start_pomodoro → pomodoroService.start called
 * - Confirmation mechanism: requiresConfirmation=true → not auto-executed
 * - Confirmation mechanism: handleToolConfirmation(confirm) → executes; (cancel) → does not
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock services before importing chat-tools
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
    abort: vi.fn(),
  },
}));

vi.mock('../../src/services/state-engine.service', () => ({
  stateEngineService: {
    send: vi.fn(),
  },
}));

vi.mock('../../src/services/nl-parser.service', () => ({
  nlParserService: {
    parseTaskDescription: vi.fn(),
    confirmAndCreate: vi.fn(),
  },
}));

vi.mock('../../src/services/project.service', () => ({
  projectService: { create: vi.fn(), update: vi.fn(), getById: vi.fn() },
}));

vi.mock('../../src/services/time-slice.service', () => ({
  timeSliceService: { switchTask: vi.fn() },
}));

vi.mock('../../src/services/activity-log.service', () => ({
  activityLogService: { create: vi.fn() },
}));

vi.mock('../../src/services/efficiency-analysis.service', () => ({
  efficiencyAnalysisService: { getHistoricalAnalysis: vi.fn() },
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
    task: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn(), delete: vi.fn(), count: vi.fn() },
    project: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    pomodoro: { findFirst: vi.fn(), findMany: vi.fn() },
    dailyState: { findUnique: vi.fn(), upsert: vi.fn() },
    goal: { findFirst: vi.fn() },
    projectTemplate: { findFirst: vi.fn() },
    userSettings: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { z } from 'zod';
import { taskService } from '../../src/services/task.service';
import { pomodoroService } from '../../src/services/pomodoro.service';
import { nlParserService } from '../../src/services/nl-parser.service';
import { stateEngineService } from '../../src/services/state-engine.service';
import {
  createChatTools,
  getChatToolDefinitions,
  toolRequiresConfirmation,
  storePendingConfirmation,
  handleToolConfirmation,
  getPendingConfirmation,
  clearPendingConfirmations,
} from '../../src/services/chat-tools.service';

const TEST_USER_ID = 'user-abc-123';
const OTHER_USER_ID = 'user-other-456';

beforeEach(() => {
  vi.clearAllMocks();
  clearPendingConfirmations();
});

// ---------------------------------------------------------------------------
// F4.1 Tool Registration
// ---------------------------------------------------------------------------

describe('getChatToolDefinitions', () => {
  it('should return 28 tool definitions (3 original + 24 from S1 + 1 screen time)', () => {
    const defs = getChatToolDefinitions();
    expect(defs).toHaveLength(28);
    const names = defs.map((d) => d.name);
    expect(names).toContain('flow_complete_task');
    expect(names).toContain('flow_create_task_from_nl');
    expect(names).toContain('flow_start_pomodoro');
  });

  it('each definition should have name, description, inputSchema, execute', () => {
    const defs = getChatToolDefinitions();
    for (const def of defs) {
      expect(def.name).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(def.inputSchema).toBeDefined();
      expect(typeof def.execute).toBe('function');
      expect(typeof def.requiresConfirmation).toBe('boolean');
    }
  });
});

describe('createChatTools', () => {
  it('should return a ToolSet with all 28 tools', () => {
    const toolSet = createChatTools(TEST_USER_ID);
    expect(Object.keys(toolSet)).toHaveLength(28);
    expect(toolSet).toHaveProperty('flow_complete_task');
    expect(toolSet).toHaveProperty('flow_create_task_from_nl');
    expect(toolSet).toHaveProperty('flow_start_pomodoro');
  });

  it('each tool should have execute function', () => {
    const toolSet = createChatTools(TEST_USER_ID);
    for (const [, t] of Object.entries(toolSet)) {
      expect(typeof t.execute).toBe('function');
    }
  });
});

// ---------------------------------------------------------------------------
// F4.2 Tool Execution — flow_complete_task
// ---------------------------------------------------------------------------

describe('flow_complete_task execute', () => {
  it('should call taskService.updateStatus with injected userId', async () => {
    vi.mocked(taskService.updateStatus).mockResolvedValue({
      success: true,
      data: { id: 'task-1', title: 'Test Task', status: 'DONE' } as never,
    });

    const toolSet = createChatTools(TEST_USER_ID);
    const result = await toolSet.flow_complete_task.execute!(
      { task_id: 'task-1', summary: 'Done!' },
      { toolCallId: 'call-1', messages: [], abortSignal: new AbortController().signal }
    );

    expect(taskService.updateStatus).toHaveBeenCalledWith('task-1', TEST_USER_ID, 'DONE', false);
    expect(result).toMatchObject({ success: true });
  });

  it('should use the injected userId, not any AI-provided userId', async () => {
    vi.mocked(taskService.updateStatus).mockResolvedValue({
      success: true,
      data: { id: 'task-1', title: 'Task', status: 'DONE' } as never,
    });

    const toolSet = createChatTools(TEST_USER_ID);
    // Even if some malicious AI tries to inject a different userId in params,
    // the service call should use the closure-captured userId
    await toolSet.flow_complete_task.execute!(
      { task_id: 'task-1', summary: 'hack attempt' },
      { toolCallId: 'call-2', messages: [], abortSignal: new AbortController().signal }
    );

    // The second argument to updateStatus must be TEST_USER_ID
    expect(vi.mocked(taskService.updateStatus).mock.calls[0][1]).toBe(TEST_USER_ID);
  });

  it('should return error when taskService fails', async () => {
    vi.mocked(taskService.updateStatus).mockResolvedValue({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Task not found' },
    });

    const toolSet = createChatTools(TEST_USER_ID);
    const result = await toolSet.flow_complete_task.execute!(
      { task_id: 'nonexistent', summary: '' },
      { toolCallId: 'call-3', messages: [], abortSignal: new AbortController().signal }
    );

    expect(result).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });
});

// ---------------------------------------------------------------------------
// F4.2 Tool Execution — flow_create_task_from_nl
// ---------------------------------------------------------------------------

describe('flow_create_task_from_nl execute', () => {
  it('should call nlParserService.parseTaskDescription with injected userId', async () => {
    vi.mocked(nlParserService.parseTaskDescription).mockResolvedValue({
      success: true,
      data: {
        title: 'Buy coffee',
        priority: 'P2',
        projectId: null,
        planDate: null,
        estimatedMinutes: null,
        confidence: 0.9,
        ambiguities: [],
      },
    });

    const toolSet = createChatTools(TEST_USER_ID);
    await toolSet.flow_create_task_from_nl.execute!(
      { description: 'buy coffee' },
      { toolCallId: 'call-4', messages: [], abortSignal: new AbortController().signal }
    );

    expect(nlParserService.parseTaskDescription).toHaveBeenCalledWith(TEST_USER_ID, 'buy coffee');
  });

  it('should return parsed result when confirm is false/missing', async () => {
    vi.mocked(nlParserService.parseTaskDescription).mockResolvedValue({
      success: true,
      data: {
        title: 'Buy coffee',
        priority: 'P2',
        projectId: 'proj-1',
        planDate: new Date('2026-03-01'),
        estimatedMinutes: 30,
        confidence: 0.95,
        ambiguities: [],
      },
    });

    const toolSet = createChatTools(TEST_USER_ID);
    const result = await toolSet.flow_create_task_from_nl.execute!(
      { description: 'buy coffee tomorrow 30 minutes' },
      { toolCallId: 'call-5', messages: [], abortSignal: new AbortController().signal }
    );

    expect(result).toMatchObject({
      success: true,
      data: {
        parsed: {
          title: 'Buy coffee',
          priority: 'P2',
          confidence: 0.95,
        },
      },
    });
    // confirmAndCreate should NOT have been called
    expect(nlParserService.confirmAndCreate).not.toHaveBeenCalled();
  });

  it('should create task when confirm is true', async () => {
    vi.mocked(nlParserService.parseTaskDescription).mockResolvedValue({
      success: true,
      data: {
        title: 'Buy coffee',
        priority: 'P2',
        projectId: 'proj-1',
        planDate: null,
        estimatedMinutes: null,
        confidence: 0.9,
        ambiguities: [],
      },
    });

    vi.mocked(nlParserService.confirmAndCreate).mockResolvedValue({
      success: true,
      data: {
        id: 'new-task-1',
        title: 'Buy coffee',
        priority: 'P2',
        projectId: 'proj-1',
      } as never,
    });

    const toolSet = createChatTools(TEST_USER_ID);
    const result = await toolSet.flow_create_task_from_nl.execute!(
      { description: 'buy coffee', confirm: true },
      { toolCallId: 'call-6', messages: [], abortSignal: new AbortController().signal }
    );

    expect(nlParserService.confirmAndCreate).toHaveBeenCalledWith(
      TEST_USER_ID,
      expect.objectContaining({ title: 'Buy coffee', projectId: 'proj-1' })
    );
    expect(result).toMatchObject({
      success: true,
      data: { task: { id: 'new-task-1', title: 'Buy coffee' } },
    });
  });
});

// ---------------------------------------------------------------------------
// F4.2 Tool Execution — flow_start_pomodoro
// ---------------------------------------------------------------------------

describe('flow_start_pomodoro execute', () => {
  it('should call pomodoroService.start with injected userId', async () => {
    vi.mocked(pomodoroService.start).mockResolvedValue({
      success: true,
      data: {
        id: 'pom-1',
        taskId: 'task-1',
        duration: 25,
        startTime: new Date(),
        status: 'IN_PROGRESS',
      } as never,
    });
    vi.mocked(stateEngineService.send).mockResolvedValue({ success: true, from: 'idle', to: 'focus', event: 'START_POMODORO' } as never);

    const toolSet = createChatTools(TEST_USER_ID);
    const result = await toolSet.flow_start_pomodoro.execute!(
      { task_id: 'task-1', duration: 25 },
      { toolCallId: 'call-7', messages: [], abortSignal: new AbortController().signal }
    );

    expect(pomodoroService.start).toHaveBeenCalledWith(TEST_USER_ID, {
      taskId: 'task-1',
      duration: 25,
    });
    expect(result).toMatchObject({
      success: true,
      data: { id: 'pom-1', duration: 25 },
    });
  });

  it('should return error when pomodoroService fails', async () => {
    vi.mocked(pomodoroService.start).mockResolvedValue({
      success: false,
      error: { code: 'CONFLICT', message: 'Pomodoro already in progress' },
    });

    const toolSet = createChatTools(TEST_USER_ID);
    const result = await toolSet.flow_start_pomodoro.execute!(
      { task_id: 'task-1' },
      { toolCallId: 'call-8', messages: [], abortSignal: new AbortController().signal }
    );

    expect(result).toMatchObject({ success: false, error: { code: 'CONFLICT' } });
  });
});

// ---------------------------------------------------------------------------
// F4.2 userId Injection — different users get different closures
// ---------------------------------------------------------------------------

describe('userId injection via closure', () => {
  it('two ToolSets for different users should call services with their respective userId', async () => {
    vi.mocked(taskService.updateStatus).mockResolvedValue({
      success: true,
      data: { id: 'task-1', title: 'Task', status: 'DONE' } as never,
    });

    const toolsA = createChatTools('user-A');
    const toolsB = createChatTools('user-B');

    await toolsA.flow_complete_task.execute!(
      { task_id: 'task-1', summary: 'a' },
      { toolCallId: 'c1', messages: [], abortSignal: new AbortController().signal }
    );
    await toolsB.flow_complete_task.execute!(
      { task_id: 'task-1', summary: 'b' },
      { toolCallId: 'c2', messages: [], abortSignal: new AbortController().signal }
    );

    const calls = vi.mocked(taskService.updateStatus).mock.calls;
    expect(calls[0][1]).toBe('user-A');
    expect(calls[1][1]).toBe('user-B');
  });
});

// ---------------------------------------------------------------------------
// F4.3 Tool Confirmation Mechanism
// ---------------------------------------------------------------------------

describe('toolRequiresConfirmation', () => {
  it('should return false for flow_complete_task (low risk)', () => {
    expect(toolRequiresConfirmation('flow_complete_task')).toBe(false);
  });

  it('should return false for flow_start_pomodoro (low risk)', () => {
    expect(toolRequiresConfirmation('flow_start_pomodoro')).toBe(false);
  });

  it('should return false for unknown tools', () => {
    expect(toolRequiresConfirmation('flow_nonexistent')).toBe(false);
  });
});

describe('storePendingConfirmation + handleToolConfirmation', () => {
  it('should store and retrieve a pending confirmation', () => {
    const pending = {
      toolCallId: 'tc-1',
      toolName: 'flow_complete_task',
      parameters: { task_id: 'task-1', summary: 'Done' },
      conversationId: 'conv-1',
      userId: TEST_USER_ID,
      createdAt: new Date(),
    };
    storePendingConfirmation(pending);

    const retrieved = getPendingConfirmation('tc-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.toolName).toBe('flow_complete_task');
    expect(retrieved!.userId).toBe(TEST_USER_ID);
  });

  it('handleToolConfirmation(confirm) should execute the tool', async () => {
    vi.mocked(taskService.updateStatus).mockResolvedValue({
      success: true,
      data: { id: 'task-1', title: 'Task', status: 'DONE' } as never,
    });

    storePendingConfirmation({
      toolCallId: 'tc-2',
      toolName: 'flow_complete_task',
      parameters: { task_id: 'task-1', summary: 'confirmed' },
      conversationId: 'conv-1',
      userId: TEST_USER_ID,
      createdAt: new Date(),
    });

    const result = await handleToolConfirmation(TEST_USER_ID, 'tc-2', 'confirm');

    expect(result.success).toBe(true);
    expect(taskService.updateStatus).toHaveBeenCalledWith('task-1', TEST_USER_ID, 'DONE', false);
    // Should be removed from pending
    expect(getPendingConfirmation('tc-2')).toBeUndefined();
  });

  it('handleToolConfirmation(cancel) should NOT execute the tool', async () => {
    storePendingConfirmation({
      toolCallId: 'tc-3',
      toolName: 'flow_complete_task',
      parameters: { task_id: 'task-1', summary: '' },
      conversationId: 'conv-1',
      userId: TEST_USER_ID,
      createdAt: new Date(),
    });

    const result = await handleToolConfirmation(TEST_USER_ID, 'tc-3', 'cancel');

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ cancelled: true });
    expect(taskService.updateStatus).not.toHaveBeenCalled();
    // Should be removed from pending
    expect(getPendingConfirmation('tc-3')).toBeUndefined();
  });

  it('handleToolConfirmation should reject wrong userId', async () => {
    storePendingConfirmation({
      toolCallId: 'tc-4',
      toolName: 'flow_complete_task',
      parameters: { task_id: 'task-1', summary: '' },
      conversationId: 'conv-1',
      userId: TEST_USER_ID,
      createdAt: new Date(),
    });

    const result = await handleToolConfirmation(OTHER_USER_ID, 'tc-4', 'confirm');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('AUTH_ERROR');
    expect(taskService.updateStatus).not.toHaveBeenCalled();
  });

  it('handleToolConfirmation should return NOT_FOUND for expired/unknown toolCallId', async () => {
    const result = await handleToolConfirmation(TEST_USER_ID, 'nonexistent', 'confirm');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// Tool Schema Compatibility — no nullable types (LLM provider compat)
// ---------------------------------------------------------------------------

describe('tool schema LLM provider compatibility', () => {
  it('should not use nullable types in tool schemas (Kimi/Moonshot rejects them)', () => {
    // Bug: Zod .nullable() generates JSON Schema "type": ["string", "null"]
    // which Kimi API rejects with "invalid scalar type [string null]".
    // All tool schemas should use .optional() instead of .nullable().
    const defs = getChatToolDefinitions();
    for (const def of defs) {
      const jsonSchema = JSON.stringify(def.inputSchema);
      // Check that no schema contains nullable union types like ["string","null"]
      expect(jsonSchema).not.toContain('"nullable":true');
      // Also verify through Zod's internal shape: walk the schema to find .nullable()
      if (def.inputSchema._def?.typeName === 'ZodObject') {
        const shape = (def.inputSchema as z.AnyZodObject).shape;
        for (const [fieldName, fieldSchema] of Object.entries(shape)) {
          const innerDef = (fieldSchema as { _def?: { typeName?: string } })._def;
          expect(
            innerDef?.typeName,
            `${def.name}.${fieldName} uses ZodNullable — change to .optional() for LLM provider compatibility`
          ).not.toBe('ZodNullable');
        }
      }
    }
  });
});
