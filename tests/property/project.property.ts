import fc from 'fast-check';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient, ProjectStatus, TaskStatus, Priority } from '@prisma/client';
import { projectService } from '@/services/project.service';

/**
 * Feature: vibeflow-foundation
 * Property 1: Project Round-Trip Consistency
 * Validates: Requirements 1.1, 1.2, 1.4
 *
 * For any valid Project with title and deliverable, creating it and then
 * retrieving it by ID SHALL return an equivalent Project with the same
 * title, deliverable, and ACTIVE status.
 */

/**
 * Feature: vibeflow-foundation
 * Property 14: Project Archive Cascade
 * Validates: Requirements 1.5
 *
 * For any Project with associated Tasks, archiving the Project SHALL:
 * - Set Project status to ARCHIVED
 * - Set all associated Tasks to archived state (DONE)
 * - Preserve Task data for historical reference
 */

const prisma = new PrismaClient();

// Test user for property tests
let testUserId: string;
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

describe('Property 1: Project Round-Trip Consistency', () => {
  beforeAll(async () => {
    dbAvailable = await checkDatabaseConnection();
    if (!dbAvailable) {
      console.warn('Database not available, skipping property tests');
      return;
    }

    // Create a test user for the property tests
    const testUser = await prisma.user.create({
      data: {
        email: `test-${Date.now()}@vibeflow.test`,
        password: 'hashed_password_placeholder',
      },
    });
    testUserId = testUser.id;
  });

  afterAll(async () => {
    if (!dbAvailable) return;

    // Clean up: delete all projects created by test user, then delete user
    if (testUserId) {
      await prisma.project.deleteMany({ where: { userId: testUserId } });
      await prisma.user.delete({ where: { id: testUserId } });
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    if (!dbAvailable) return;
    // Clean up projects before each test run
    await prisma.project.deleteMany({ where: { userId: testUserId } });
  });

  it('should maintain round-trip consistency for any valid project', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        // Generate valid project data
        fc.record({
          title: fc.string({ minLength: 1, maxLength: 255 }).filter((s) => s.trim().length > 0),
          deliverable: fc.string({ minLength: 1, maxLength: 1000 }).filter((s) => s.trim().length > 0),
        }),
        async ({ title, deliverable }) => {
          // Create the project
          const createdProject = await prisma.project.create({
            data: {
              title,
              deliverable,
              userId: testUserId,
            },
          });

          // Retrieve the project by ID
          const retrievedProject = await prisma.project.findUnique({
            where: { id: createdProject.id },
          });

          // Verify round-trip consistency
          expect(retrievedProject).not.toBeNull();
          expect(retrievedProject!.title).toBe(title);
          expect(retrievedProject!.deliverable).toBe(deliverable);
          expect(retrievedProject!.status).toBe(ProjectStatus.ACTIVE);
          expect(retrievedProject!.id).toBe(createdProject.id);

          // Clean up this specific project
          await prisma.project.delete({ where: { id: createdProject.id } });
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: vibeflow-foundation
 * Property 14: Project Archive Cascade
 * Validates: Requirements 1.5
 *
 * For any Project with associated Tasks, archiving the Project SHALL:
 * - Set Project status to ARCHIVED
 * - Set all associated Tasks to archived state (DONE)
 * - Preserve Task data for historical reference
 */
describe('Property 14: Project Archive Cascade', () => {
  let archiveTestUserId: string;
  let archiveDbAvailable = false;

  beforeAll(async () => {
    archiveDbAvailable = await checkDatabaseConnection();
    if (!archiveDbAvailable) {
      console.warn('Database not available, skipping property tests');
      return;
    }

    // Create a test user for the property tests
    const testUser = await prisma.user.create({
      data: {
        email: `test-archive-${Date.now()}@vibeflow.test`,
        password: 'hashed_password_placeholder',
      },
    });
    archiveTestUserId = testUser.id;
  });

  afterAll(async () => {
    if (!archiveDbAvailable) return;

    // Clean up: delete all tasks and projects created by test user, then delete user
    if (archiveTestUserId) {
      await prisma.task.deleteMany({ where: { userId: archiveTestUserId } });
      await prisma.project.deleteMany({ where: { userId: archiveTestUserId } });
      await prisma.user.delete({ where: { id: archiveTestUserId } });
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    if (!archiveDbAvailable) return;
    // Clean up tasks and projects before each test run
    await prisma.task.deleteMany({ where: { userId: archiveTestUserId } });
    await prisma.project.deleteMany({ where: { userId: archiveTestUserId } });
  });

  it('should archive project and cascade to all associated tasks', async () => {
    if (!archiveDbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    // Generator for task data
    const taskDataArb = fc.record({
      title: fc.string({ minLength: 1, maxLength: 255 }).filter((s) => s.trim().length > 0),
      priority: fc.constantFrom(Priority.P1, Priority.P2, Priority.P3),
      status: fc.constantFrom(TaskStatus.TODO, TaskStatus.IN_PROGRESS),
    });

    await fc.assert(
      fc.asyncProperty(
        // Generate project data
        fc.record({
          title: fc.string({ minLength: 1, maxLength: 255 }).filter((s) => s.trim().length > 0),
          deliverable: fc.string({ minLength: 1, maxLength: 1000 }).filter((s) => s.trim().length > 0),
        }),
        // Generate 1-5 tasks for the project
        fc.array(taskDataArb, { minLength: 1, maxLength: 5 }),
        async (projectData, tasksData) => {
          // Create the project
          const project = await prisma.project.create({
            data: {
              title: projectData.title,
              deliverable: projectData.deliverable,
              userId: archiveTestUserId,
            },
          });

          // Create tasks for the project with various statuses
          const createdTasks = await Promise.all(
            tasksData.map((taskData, index) =>
              prisma.task.create({
                data: {
                  title: taskData.title,
                  priority: taskData.priority,
                  status: taskData.status,
                  sortOrder: index,
                  projectId: project.id,
                  userId: archiveTestUserId,
                },
              })
            )
          );

          // Store original task data for verification
          const originalTaskData = createdTasks.map((t) => ({
            id: t.id,
            title: t.title,
            priority: t.priority,
          }));

          // Archive the project using the service
          const archiveResult = await projectService.archive(project.id, archiveTestUserId);

          // Verify archive was successful
          expect(archiveResult.success).toBe(true);

          // Verify project status is ARCHIVED
          const archivedProject = await prisma.project.findUnique({
            where: { id: project.id },
          });
          expect(archivedProject).not.toBeNull();
          expect(archivedProject!.status).toBe(ProjectStatus.ARCHIVED);

          // Verify all tasks are set to DONE (archived state)
          const archivedTasks = await prisma.task.findMany({
            where: { projectId: project.id },
          });
          expect(archivedTasks.length).toBe(createdTasks.length);
          for (const task of archivedTasks) {
            expect(task.status).toBe(TaskStatus.DONE);
          }

          // Verify task data is preserved for historical reference
          for (const originalTask of originalTaskData) {
            const preservedTask = archivedTasks.find((t) => t.id === originalTask.id);
            expect(preservedTask).not.toBeNull();
            expect(preservedTask!.title).toBe(originalTask.title);
            expect(preservedTask!.priority).toBe(originalTask.priority);
          }

          // Clean up
          await prisma.task.deleteMany({ where: { projectId: project.id } });
          await prisma.project.delete({ where: { id: project.id } });
        }
      ),
      { numRuns: 100 }
    );
  });
});
