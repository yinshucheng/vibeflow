/**
 * F4.4 Property test for Chat Tool userId injection.
 *
 * Verifies:
 * - For any userId + any tool call, execute() always uses the injected userId
 *   (not a userId from the AI parameters).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

// Mock services before importing chat-tools
vi.mock('../../src/services/task.service', () => ({
  taskService: { updateStatus: vi.fn(), create: vi.fn(), quickCreateInboxTask: vi.fn() },
}));

vi.mock('../../src/services/pomodoro.service', () => ({
  pomodoroService: { start: vi.fn(), startTaskless: vi.fn(), completeTaskInPomodoro: vi.fn(), record: vi.fn() },
}));

vi.mock('../../src/services/nl-parser.service', () => ({
  nlParserService: { parseTaskDescription: vi.fn(), confirmAndCreate: vi.fn() },
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

import { taskService } from '../../src/services/task.service';
import { pomodoroService } from '../../src/services/pomodoro.service';
import { nlParserService } from '../../src/services/nl-parser.service';
import { createChatTools, getChatToolDefinitions } from '../../src/services/chat-tools.service';

beforeEach(() => {
  vi.clearAllMocks();

  // Default mock implementations that always succeed
  vi.mocked(taskService.updateStatus).mockResolvedValue({
    success: true,
    data: { id: 'task-1', title: 'Task', status: 'DONE' } as never,
  });

  vi.mocked(pomodoroService.start).mockResolvedValue({
    success: true,
    data: { id: 'pom-1', taskId: 'task-1', duration: 25, startTime: new Date(), status: 'IN_PROGRESS' } as never,
  });

  vi.mocked(nlParserService.parseTaskDescription).mockResolvedValue({
    success: true,
    data: {
      title: 'Parsed task',
      priority: 'P2',
      projectId: null,
      planDate: null,
      estimatedMinutes: null,
      confidence: 0.9,
      ambiguities: [],
    },
  });
});

describe('userId injection property', () => {
  it('flow_complete_task: any userId → execute uses injected userId', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (userId, taskId) => {
          vi.clearAllMocks();
          vi.mocked(taskService.updateStatus).mockResolvedValue({
            success: true,
            data: { id: taskId, title: 'T', status: 'DONE' } as never,
          });

          const tools = createChatTools(userId);
          await tools.flow_complete_task.execute!(
            { task_id: taskId, summary: 'done' },
            { toolCallId: 'c', messages: [], abortSignal: new AbortController().signal }
          );

          // The userId passed to taskService must be the injected one
          expect(vi.mocked(taskService.updateStatus).mock.calls[0][1]).toBe(userId);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('flow_start_pomodoro: any userId → execute uses injected userId', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (userId, taskId) => {
          vi.clearAllMocks();
          vi.mocked(pomodoroService.start).mockResolvedValue({
            success: true,
            data: { id: 'p', taskId, duration: 25, startTime: new Date(), status: 'IN_PROGRESS' } as never,
          });

          const tools = createChatTools(userId);
          await tools.flow_start_pomodoro.execute!(
            { task_id: taskId },
            { toolCallId: 'c', messages: [], abortSignal: new AbortController().signal }
          );

          expect(vi.mocked(pomodoroService.start).mock.calls[0][0]).toBe(userId);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('flow_create_task_from_nl: any userId → execute uses injected userId', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (userId, desc) => {
          vi.clearAllMocks();
          vi.mocked(nlParserService.parseTaskDescription).mockResolvedValue({
            success: true,
            data: {
              title: desc,
              priority: 'P2',
              projectId: null,
              planDate: null,
              estimatedMinutes: null,
              confidence: 0.9,
              ambiguities: [],
            },
          });

          const tools = createChatTools(userId);
          await tools.flow_create_task_from_nl.execute!(
            { description: desc },
            { toolCallId: 'c', messages: [], abortSignal: new AbortController().signal }
          );

          expect(vi.mocked(nlParserService.parseTaskDescription).mock.calls[0][0]).toBe(userId);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('all tools: getChatToolDefinitions().execute(userId, ...) always passes the given userId to services', async () => {
    const defs = getChatToolDefinitions();

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (userId) => {
          vi.clearAllMocks();

          // Set up mocks
          vi.mocked(taskService.updateStatus).mockResolvedValue({
            success: true,
            data: { id: 't', title: 'T', status: 'DONE' } as never,
          });
          vi.mocked(pomodoroService.start).mockResolvedValue({
            success: true,
            data: { id: 'p', taskId: 't', duration: 25, startTime: new Date(), status: 'IN_PROGRESS' } as never,
          });
          vi.mocked(nlParserService.parseTaskDescription).mockResolvedValue({
            success: true,
            data: { title: 'T', priority: 'P2', projectId: null, planDate: null, estimatedMinutes: null, confidence: 0.9, ambiguities: [] },
          });

          // Execute each definition's execute with the userId
          for (const def of defs) {
            let params: Record<string, unknown>;
            switch (def.name) {
              case 'flow_complete_task':
                params = { task_id: 'test-task', summary: 'done' };
                break;
              case 'flow_create_task_from_nl':
                params = { description: 'test task' };
                break;
              case 'flow_start_pomodoro':
                params = { task_id: 'test-task' };
                break;
              default:
                continue;
            }

            await def.execute(userId, params);
          }

          // All service calls should have received the injected userId
          if (vi.mocked(taskService.updateStatus).mock.calls.length > 0) {
            expect(vi.mocked(taskService.updateStatus).mock.calls[0][1]).toBe(userId);
          }
          if (vi.mocked(pomodoroService.start).mock.calls.length > 0) {
            expect(vi.mocked(pomodoroService.start).mock.calls[0][0]).toBe(userId);
          }
          if (vi.mocked(nlParserService.parseTaskDescription).mock.calls.length > 0) {
            expect(vi.mocked(nlParserService.parseTaskDescription).mock.calls[0][0]).toBe(userId);
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});
