import fc from 'fast-check';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient, TaskStatus, Priority } from '@prisma/client';
import { handleToolCall, TOOLS } from '@/mcp/tools';
import type { MCPContext } from '@/mcp/auth';

/**
 * Feature: vibeflow-foundation
 * Property 13: MCP Tool Execution Correctness
 * Validates: Requirements 9.5, 9.6, 9.9, 10.2, 10.4
 *
 * For any MCP tool invocation:
 * - `vibe.complete_task(id, summary)` marks task as DONE and stores summary
 * - `vibe.add_subtask(parent_id, title)` creates task with correct parentId
 * - Invalid parameters return structured error response
 * - Successful execution returns success: true with affected entity
 */

const prisma = new PrismaClient();

let testUserId: string;
let testUserEmail: string;
let dbAvailable = false;

// Helper to check database connectivity
async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$connect();
    return true;
  } catch {
    return false;
  }
}

// Generate unique email for test users
function generateTestEmail(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `mcp-tools-pbt-${timestamp}-${random}@test.vibeflow.local`;
}

// Create a valid MCPContext for testing
function createTestContext(): MCPContext {
  return {
    userId: testUserId,
    email: testUserEmail,
    isAuthenticated: true,
  };
}

// Parse tool response to get the result object
function parseToolResponse(response: { content: Array<{ type: string; text: string }> }): unknown {
  return JSON.parse(response.content[0].text);
}

// MCP tools now use tRPC HTTP client instead of direct Prisma access.
// These property tests set up data via Prisma but MCP reads via HTTP,
// so they cannot work without a running tRPC server with the same DB.
// TODO: Rewrite as integration tests that use the tRPC server.
describe.skip('Property 13: MCP Tool Execution Correctness', () => {
  beforeAll(async () => {
    dbAvailable = await checkDatabaseConnection();
    if (!dbAvailable) {
      console.warn('Database not available, skipping property tests');
      return;
    }

    // Create a test user for the property tests
    testUserEmail = generateTestEmail();
    const testUser = await prisma.user.create({
      data: {
        email: testUserEmail,
        password: 'hashed_password_placeholder',
      },
    });
    testUserId = testUser.id;

    // Create user settings
    await prisma.userSettings.create({
      data: {
        userId: testUserId,
        pomodoroDuration: 25,
        shortRestDuration: 5,
        longRestDuration: 15,
        longRestInterval: 4,
        dailyCap: 8,
      },
    });
  });

  afterAll(async () => {
    if (!dbAvailable) return;

    // Clean up all test data
    if (testUserId) {
      await prisma.activityLog.deleteMany({ where: { userId: testUserId } });
      await prisma.pomodoro.deleteMany({ where: { userId: testUserId } });
      await prisma.task.deleteMany({ where: { userId: testUserId } });
      await prisma.projectGoal.deleteMany({
        where: { project: { userId: testUserId } },
      });
      await prisma.project.deleteMany({ where: { userId: testUserId } });
      await prisma.goal.deleteMany({ where: { userId: testUserId } });
      await prisma.dailyState.deleteMany({ where: { userId: testUserId } });
      await prisma.userSettings.deleteMany({ where: { userId: testUserId } });
      await prisma.user.delete({ where: { id: testUserId } });
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    if (!dbAvailable) return;
    // Clean up dynamic data before each test
    await prisma.activityLog.deleteMany({ where: { userId: testUserId } });
    await prisma.pomodoro.deleteMany({ where: { userId: testUserId } });
    await prisma.task.deleteMany({ where: { userId: testUserId } });
    await prisma.projectGoal.deleteMany({
      where: { project: { userId: testUserId } },
    });
    await prisma.project.deleteMany({ where: { userId: testUserId } });
  });


  /**
   * Property 13.1: vibe.complete_task marks task as DONE and stores summary
   * Validates: Requirements 9.5
   */
  it('vibe.complete_task marks task as DONE and returns success with task', { timeout: 15000 }, async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    const context = createTestContext();

    await fc.assert(
      fc.asyncProperty(
        // Generate valid task title
        fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
        // Generate valid summary
        fc.string({ minLength: 1, maxLength: 500 }).filter((s) => s.trim().length > 0),
        // Generate priority
        fc.constantFrom('P1', 'P2', 'P3') as fc.Arbitrary<'P1' | 'P2' | 'P3'>,
        async (taskTitle, summary, priority) => {
          // Create a project for the task
          const project = await prisma.project.create({
            data: {
              title: 'Test Project',
              deliverable: 'Test Deliverable',
              status: 'ACTIVE',
              userId: testUserId,
            },
          });

          // Create a task to complete
          const task = await prisma.task.create({
            data: {
              title: taskTitle,
              priority: priority as Priority,
              status: 'TODO' as TaskStatus,
              sortOrder: 0,
              projectId: project.id,
              userId: testUserId,
            },
          });

          // Call the complete_task tool
          const response = await handleToolCall(
            TOOLS.COMPLETE_TASK,
            { task_id: task.id, summary },
            context
          );

          // Parse the response
          const result = parseToolResponse(response) as {
            success: boolean;
            task?: { id: string; status: string; summary: string };
            error?: { code: string; message: string };
          };

          // Verify success response
          expect(result.success).toBe(true);
          expect(result.task).toBeDefined();
          expect(result.task?.id).toBe(task.id);
          expect(result.task?.status).toBe('DONE');
          expect(result.task?.summary).toBe(summary);

          // Verify task is actually marked as DONE in database
          const updatedTask = await prisma.task.findUnique({
            where: { id: task.id },
          });
          expect(updatedTask?.status).toBe('DONE');

          // Clean up
          await prisma.activityLog.deleteMany({ where: { userId: testUserId } });
          await prisma.task.delete({ where: { id: task.id } });
          await prisma.project.delete({ where: { id: project.id } });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.2: vibe.add_subtask creates task with correct parentId
   * Validates: Requirements 9.6
   */
  it('vibe.add_subtask creates task with correct parentId and projectId', { timeout: 15000 }, async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    const context = createTestContext();

    await fc.assert(
      fc.asyncProperty(
        // Generate valid subtask title
        fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
        // Generate optional priority
        fc.option(fc.constantFrom('P1', 'P2', 'P3') as fc.Arbitrary<'P1' | 'P2' | 'P3'>, { nil: undefined }),
        async (subtaskTitle, priority) => {
          // Create a project
          const project = await prisma.project.create({
            data: {
              title: 'Test Project',
              deliverable: 'Test Deliverable',
              status: 'ACTIVE',
              userId: testUserId,
            },
          });

          // Create a parent task
          const parentTask = await prisma.task.create({
            data: {
              title: 'Parent Task',
              priority: 'P2' as Priority,
              status: 'TODO' as TaskStatus,
              sortOrder: 0,
              projectId: project.id,
              userId: testUserId,
            },
          });

          // Call the add_subtask tool
          const args: Record<string, unknown> = {
            parent_id: parentTask.id,
            title: subtaskTitle,
          };
          if (priority !== undefined) {
            args.priority = priority;
          }

          const response = await handleToolCall(TOOLS.ADD_SUBTASK, args, context);

          // Parse the response
          const result = parseToolResponse(response) as {
            success: boolean;
            task?: { id: string; title: string; parentId: string; projectId: string; priority: string };
            error?: { code: string; message: string };
          };

          // Verify success response
          expect(result.success).toBe(true);
          expect(result.task).toBeDefined();
          expect(result.task?.title).toBe(subtaskTitle);
          expect(result.task?.parentId).toBe(parentTask.id);
          expect(result.task?.projectId).toBe(project.id);
          expect(result.task?.priority).toBe(priority ?? 'P2');

          // Verify subtask is actually created in database with correct relationships
          const createdSubtask = await prisma.task.findUnique({
            where: { id: result.task?.id },
          });
          expect(createdSubtask).not.toBeNull();
          expect(createdSubtask?.parentId).toBe(parentTask.id);
          expect(createdSubtask?.projectId).toBe(project.id);

          // Clean up
          await prisma.task.deleteMany({ where: { projectId: project.id } });
          await prisma.project.delete({ where: { id: project.id } });
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * Property 13.3: Invalid parameters return structured error response
   * Validates: Requirements 9.9, 10.4
   */
  it('invalid parameters return structured error response with code and message', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    const context = createTestContext();

    await fc.assert(
      fc.asyncProperty(
        // Generate invalid task_id (non-existent UUID or invalid format)
        fc.oneof(
          fc.uuid(), // Valid UUID format but non-existent
          fc.string({ minLength: 0, maxLength: 10 }), // Invalid format
          fc.constant(''), // Empty string
          fc.constant(null) // Null value
        ),
        async (invalidTaskId) => {
          // Call complete_task with invalid task_id
          const response = await handleToolCall(
            TOOLS.COMPLETE_TASK,
            { task_id: invalidTaskId, summary: 'Test summary' },
            context
          );

          // Parse the response
          const result = parseToolResponse(response) as {
            success: boolean;
            error?: { code: string; message: string };
          };

          // Verify error response structure
          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
          expect(typeof result.error?.code).toBe('string');
          expect(typeof result.error?.message).toBe('string');
          expect(result.error?.code.length).toBeGreaterThan(0);
          expect(result.error?.message.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.4: Missing required parameters return validation error
   * Validates: Requirements 9.9, 10.4
   */
  it('missing required parameters return VALIDATION_ERROR', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    const context = createTestContext();

    // Test complete_task without task_id
    const response1 = await handleToolCall(
      TOOLS.COMPLETE_TASK,
      { summary: 'Test summary' },
      context
    );
    const result1 = parseToolResponse(response1) as {
      success: boolean;
      error?: { code: string; message: string };
    };
    expect(result1.success).toBe(false);
    expect(result1.error?.code).toBe('VALIDATION_ERROR');

    // Test complete_task without summary
    const response2 = await handleToolCall(
      TOOLS.COMPLETE_TASK,
      { task_id: 'some-id' },
      context
    );
    const result2 = parseToolResponse(response2) as {
      success: boolean;
      error?: { code: string; message: string };
    };
    expect(result2.success).toBe(false);
    expect(result2.error?.code).toBe('VALIDATION_ERROR');

    // Test add_subtask without parent_id
    const response3 = await handleToolCall(
      TOOLS.ADD_SUBTASK,
      { title: 'Test title' },
      context
    );
    const result3 = parseToolResponse(response3) as {
      success: boolean;
      error?: { code: string; message: string };
    };
    expect(result3.success).toBe(false);
    expect(result3.error?.code).toBe('VALIDATION_ERROR');

    // Test add_subtask without title
    const response4 = await handleToolCall(
      TOOLS.ADD_SUBTASK,
      { parent_id: 'some-id' },
      context
    );
    const result4 = parseToolResponse(response4) as {
      success: boolean;
      error?: { code: string; message: string };
    };
    expect(result4.success).toBe(false);
    expect(result4.error?.code).toBe('VALIDATION_ERROR');
  });

  /**
   * Property 13.5: vibe.report_blocker logs blocker and returns blocker_id
   * Validates: Requirements 9.7, 10.2
   */
  it('vibe.report_blocker logs blocker and returns success with blocker_id', { timeout: 15000 }, async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    const context = createTestContext();

    await fc.assert(
      fc.asyncProperty(
        // Generate valid error log
        fc.string({ minLength: 1, maxLength: 1000 }).filter((s) => s.trim().length > 0),
        async (errorLog) => {
          // Create a project and task
          const project = await prisma.project.create({
            data: {
              title: 'Test Project',
              deliverable: 'Test Deliverable',
              status: 'ACTIVE',
              userId: testUserId,
            },
          });

          const task = await prisma.task.create({
            data: {
              title: 'Test Task',
              priority: 'P2' as Priority,
              status: 'TODO' as TaskStatus,
              sortOrder: 0,
              projectId: project.id,
              userId: testUserId,
            },
          });

          // Call the report_blocker tool
          const response = await handleToolCall(
            TOOLS.REPORT_BLOCKER,
            { task_id: task.id, error_log: errorLog },
            context
          );

          // Parse the response
          const result = parseToolResponse(response) as {
            success: boolean;
            blocker_id?: string;
            error?: { code: string; message: string };
          };

          // Verify success response
          expect(result.success).toBe(true);
          expect(result.blocker_id).toBeDefined();
          expect(typeof result.blocker_id).toBe('string');
          expect(result.blocker_id?.length).toBeGreaterThan(0);

          // Clean up
          await prisma.activityLog.deleteMany({ where: { userId: testUserId } });
          await prisma.task.delete({ where: { id: task.id } });
          await prisma.project.delete({ where: { id: project.id } });
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * Property 13.6: vibe.start_pomodoro starts a pomodoro session
   * Validates: Requirements 10.2
   */
  it('vibe.start_pomodoro starts pomodoro and returns success with pomodoro data', { timeout: 15000 }, async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    const context = createTestContext();

    await fc.assert(
      fc.asyncProperty(
        // Generate optional duration (10-120 minutes per requirements)
        fc.option(fc.integer({ min: 10, max: 120 }), { nil: undefined }),
        async (duration) => {
          // Clean up any existing in-progress pomodoros
          await prisma.pomodoro.deleteMany({
            where: { userId: testUserId, status: 'IN_PROGRESS' },
          });

          // Create a project and task
          const project = await prisma.project.create({
            data: {
              title: 'Test Project',
              deliverable: 'Test Deliverable',
              status: 'ACTIVE',
              userId: testUserId,
            },
          });

          const task = await prisma.task.create({
            data: {
              title: 'Test Task',
              priority: 'P2' as Priority,
              status: 'TODO' as TaskStatus,
              sortOrder: 0,
              projectId: project.id,
              userId: testUserId,
            },
          });

          // Call the start_pomodoro tool
          const args: Record<string, unknown> = { task_id: task.id };
          if (duration !== undefined) {
            args.duration = duration;
          }

          const response = await handleToolCall(TOOLS.START_POMODORO, args, context);

          // Parse the response
          const result = parseToolResponse(response) as {
            success: boolean;
            pomodoro?: {
              id: string;
              taskId: string;
              duration: number;
              status: string;
              startTime: string;
            };
            error?: { code: string; message: string };
          };

          // Verify success response
          expect(result.success).toBe(true);
          expect(result.pomodoro).toBeDefined();
          expect(result.pomodoro?.taskId).toBe(task.id);
          expect(result.pomodoro?.status).toBe('IN_PROGRESS');
          if (duration !== undefined) {
            expect(result.pomodoro?.duration).toBe(duration);
          } else {
            // Default duration should be 25 (from user settings)
            expect(result.pomodoro?.duration).toBe(25);
          }

          // Verify pomodoro is actually created in database
          const createdPomodoro = await prisma.pomodoro.findUnique({
            where: { id: result.pomodoro?.id },
          });
          expect(createdPomodoro).not.toBeNull();
          expect(createdPomodoro?.status).toBe('IN_PROGRESS');

          // Clean up
          await prisma.pomodoro.deleteMany({ where: { userId: testUserId } });
          await prisma.task.delete({ where: { id: task.id } });
          await prisma.project.delete({ where: { id: project.id } });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.7: vibe.get_task_context returns detailed task context
   * Validates: Requirements 10.2
   */
  it('vibe.get_task_context returns task with project and related data', { timeout: 15000 }, async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    const context = createTestContext();

    await fc.assert(
      fc.asyncProperty(
        // Generate task title
        fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
        // Generate project title
        fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
        // Generate deliverable
        fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0),
        async (taskTitle, projectTitle, deliverable) => {
          // Create a project
          const project = await prisma.project.create({
            data: {
              title: projectTitle,
              deliverable: deliverable,
              status: 'ACTIVE',
              userId: testUserId,
            },
          });

          // Create a task
          const task = await prisma.task.create({
            data: {
              title: taskTitle,
              priority: 'P1' as Priority,
              status: 'IN_PROGRESS' as TaskStatus,
              sortOrder: 0,
              projectId: project.id,
              userId: testUserId,
            },
          });

          // Call the get_task_context tool
          const response = await handleToolCall(
            TOOLS.GET_TASK_CONTEXT,
            { task_id: task.id },
            context
          );

          // Parse the response
          const result = parseToolResponse(response) as {
            success: boolean;
            task?: {
              id: string;
              title: string;
              priority: string;
              status: string;
            };
            project?: {
              id: string;
              title: string;
              deliverable: string;
              status: string;
            };
            relatedDocs?: string[];
            error?: { code: string; message: string };
          };

          // Verify success response
          expect(result.success).toBe(true);
          expect(result.task).toBeDefined();
          expect(result.project).toBeDefined();
          expect(result.relatedDocs).toBeDefined();

          // Verify task data
          expect(result.task?.id).toBe(task.id);
          expect(result.task?.title).toBe(taskTitle);
          expect(result.task?.priority).toBe('P1');
          expect(result.task?.status).toBe('IN_PROGRESS');

          // Verify project data
          expect(result.project?.id).toBe(project.id);
          expect(result.project?.title).toBe(projectTitle);
          expect(result.project?.deliverable).toBe(deliverable);
          expect(result.project?.status).toBe('ACTIVE');

          // relatedDocs should be an array (even if empty)
          expect(Array.isArray(result.relatedDocs)).toBe(true);

          // Clean up
          await prisma.task.delete({ where: { id: task.id } });
          await prisma.project.delete({ where: { id: project.id } });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13.8: Unknown tool returns NOT_FOUND error
   * Validates: Requirements 9.9
   */
  it('unknown tool name returns NOT_FOUND error', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    const context = createTestContext();

    await fc.assert(
      fc.asyncProperty(
        // Generate random tool names that are not in TOOLS
        fc.string({ minLength: 1, maxLength: 50 }).filter(
          (s) => !Object.values(TOOLS).includes(s as typeof TOOLS[keyof typeof TOOLS])
        ),
        async (unknownTool) => {
          const response = await handleToolCall(unknownTool, {}, context);

          // Parse the response
          const result = parseToolResponse(response) as {
            success: boolean;
            error?: { code: string; message: string };
          };

          // Verify error response
          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error?.code).toBe('NOT_FOUND');
          expect(result.error?.message).toContain(unknownTool);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: MCP Tool Audit Completeness
   * Feature: ai-native-enhancement
   * Validates: Requirements 4.5
   *
   * For any MCP tool call, the audit service SHALL log:
   * - agentId, toolName, input, output, success status, and duration
   */
  it('all MCP tool calls are logged to audit with complete information', { timeout: 15000 }, async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    const context = createTestContext();

    await fc.assert(
      fc.asyncProperty(
        // Generate valid task title
        fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
        // Generate valid summary
        fc.string({ minLength: 1, maxLength: 500 }).filter((s) => s.trim().length > 0),
        async (taskTitle, summary) => {
          // Clean up audit logs before test
          await prisma.mCPAuditLog.deleteMany({ where: { userId: testUserId } });

          // Create a project and task
          const project = await prisma.project.create({
            data: {
              title: 'Test Project',
              deliverable: 'Test Deliverable',
              status: 'ACTIVE',
              userId: testUserId,
            },
          });

          const task = await prisma.task.create({
            data: {
              title: taskTitle,
              priority: 'P2' as Priority,
              status: 'TODO' as TaskStatus,
              sortOrder: 0,
              projectId: project.id,
              userId: testUserId,
            },
          });

          // Call the complete_task tool
          await handleToolCall(
            TOOLS.COMPLETE_TASK,
            { task_id: task.id, summary },
            context
          );

          // Verify audit log was created
          const auditLogs = await prisma.mCPAuditLog.findMany({
            where: { userId: testUserId },
            orderBy: { timestamp: 'desc' },
            take: 1,
          });

          expect(auditLogs.length).toBe(1);
          const auditLog = auditLogs[0];

          // Verify all required fields are present
          expect(auditLog.agentId).toBeDefined();
          expect(auditLog.toolName).toBe(TOOLS.COMPLETE_TASK);
          expect(auditLog.input).toBeDefined();
          expect(auditLog.output).toBeDefined();
          expect(typeof auditLog.success).toBe('boolean');
          expect(auditLog.duration).toBeGreaterThanOrEqual(0);
          expect(auditLog.timestamp).toBeDefined();

          // Verify input contains the correct data
          const inputData = auditLog.input as { task_id: string; summary: string };
          expect(inputData.task_id).toBe(task.id);
          expect(inputData.summary).toBe(summary);

          // Clean up
          await prisma.mCPAuditLog.deleteMany({ where: { userId: testUserId } });
          await prisma.activityLog.deleteMany({ where: { userId: testUserId } });
          await prisma.task.delete({ where: { id: task.id } });
          await prisma.project.delete({ where: { id: project.id } });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6: Batch Update Atomicity
   * Feature: ai-native-enhancement
   * Validates: Requirements 4.1
   *
   * For any batch update operation:
   * - All valid updates in a batch are applied atomically
   * - If all updates fail, no changes are made
   * - Partial success returns updated count and failed list
   */
  it('batch update tasks applies all valid updates atomically', { timeout: 15000 }, async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    const context = createTestContext();

    await fc.assert(
      fc.asyncProperty(
        // Generate number of tasks to create (2-5)
        fc.integer({ min: 2, max: 5 }),
        // Generate new status
        fc.constantFrom('TODO', 'IN_PROGRESS', 'DONE') as fc.Arbitrary<'TODO' | 'IN_PROGRESS' | 'DONE'>,
        // Generate new priority
        fc.constantFrom('P1', 'P2', 'P3') as fc.Arbitrary<'P1' | 'P2' | 'P3'>,
        async (taskCount, newStatus, newPriority) => {
          // Create a project
          const project = await prisma.project.create({
            data: {
              title: 'Test Project',
              deliverable: 'Test Deliverable',
              status: 'ACTIVE',
              userId: testUserId,
            },
          });

          // Create multiple tasks
          const tasks = await Promise.all(
            Array.from({ length: taskCount }, (_, i) =>
              prisma.task.create({
                data: {
                  title: `Task ${i + 1}`,
                  priority: 'P2' as Priority,
                  status: 'TODO' as TaskStatus,
                  sortOrder: i,
                  projectId: project.id,
                  userId: testUserId,
                },
              })
            )
          );

          // Build batch update request
          const updates = tasks.map((task) => ({
            task_id: task.id,
            status: newStatus,
            priority: newPriority,
          }));

          // Call batch update
          const response = await handleToolCall(
            TOOLS.BATCH_UPDATE_TASKS,
            { updates },
            context
          );

          // Parse the response
          const result = parseToolResponse(response) as {
            success: boolean;
            updated?: number;
            failed?: Array<{ taskId: string; error: string }>;
            error?: { code: string; message: string };
          };

          // Verify success response
          expect(result.success).toBe(true);
          expect(result.updated).toBe(taskCount);

          // Verify all tasks were updated in database
          const updatedTasks = await prisma.task.findMany({
            where: { projectId: project.id },
          });

          for (const task of updatedTasks) {
            expect(task.status).toBe(newStatus);
            expect(task.priority).toBe(newPriority);
          }

          // Clean up
          await prisma.mCPAuditLog.deleteMany({ where: { userId: testUserId } });
          await prisma.task.deleteMany({ where: { projectId: project.id } });
          await prisma.project.delete({ where: { id: project.id } });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6b: Batch Update with Invalid Tasks
   * Feature: ai-native-enhancement
   * Validates: Requirements 4.1
   *
   * When batch update contains invalid task IDs:
   * - Valid updates are still applied
   * - Failed updates are reported in the response
   */
  it('batch update with invalid tasks reports failures while applying valid updates', { timeout: 15000 }, async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    const context = createTestContext();

    await fc.assert(
      fc.asyncProperty(
        // Generate new status
        fc.constantFrom('TODO', 'IN_PROGRESS', 'DONE') as fc.Arbitrary<'TODO' | 'IN_PROGRESS' | 'DONE'>,
        async (newStatus) => {
          // Create a project and one valid task
          const project = await prisma.project.create({
            data: {
              title: 'Test Project',
              deliverable: 'Test Deliverable',
              status: 'ACTIVE',
              userId: testUserId,
            },
          });

          const validTask = await prisma.task.create({
            data: {
              title: 'Valid Task',
              priority: 'P2' as Priority,
              status: 'TODO' as TaskStatus,
              sortOrder: 0,
              projectId: project.id,
              userId: testUserId,
            },
          });

          // Build batch update with one valid and one invalid task
          const updates = [
            { task_id: validTask.id, status: newStatus },
            { task_id: '00000000-0000-0000-0000-000000000000', status: newStatus }, // Invalid UUID
          ];

          // Call batch update
          const response = await handleToolCall(
            TOOLS.BATCH_UPDATE_TASKS,
            { updates },
            context
          );

          // Parse the response
          const result = parseToolResponse(response) as {
            success: boolean;
            updated?: number;
            failed?: Array<{ taskId: string; error: string }>;
            error?: { code: string; message: string };
          };

          // Verify partial success
          expect(result.success).toBe(true);
          expect(result.updated).toBe(1);
          expect(result.failed).toBeDefined();
          expect(result.failed?.length).toBe(1);
          expect(result.failed?.[0].taskId).toBe('00000000-0000-0000-0000-000000000000');

          // Verify valid task was updated
          const updatedTask = await prisma.task.findUnique({
            where: { id: validTask.id },
          });
          expect(updatedTask?.status).toBe(newStatus);

          // Clean up
          await prisma.mCPAuditLog.deleteMany({ where: { userId: testUserId } });
          await prisma.task.delete({ where: { id: validTask.id } });
          await prisma.project.delete({ where: { id: project.id } });
        }
      ),
      { numRuns: 100 }
    );
  });
});
