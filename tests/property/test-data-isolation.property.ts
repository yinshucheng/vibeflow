import fc from 'fast-check';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { TestDataTracker } from '../../e2e/fixtures/database.fixture';

/**
 * Feature: e2e-testing
 * Property 2: Test Data Isolation
 * Validates: Requirements 2.1, 2.3, 2.4
 *
 * For any test execution, the test data created during that test SHALL be
 * isolated from other tests, and cleanup SHALL remove all created data
 * without affecting other test data.
 */

const prisma = new PrismaClient();
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
  return `pbt-isolation-${timestamp}-${random}@test.vibeflow.local`;
}

describe('Property 2: Test Data Isolation', () => {
  beforeAll(async () => {
    dbAvailable = await checkDatabaseConnection();
    if (!dbAvailable) {
      console.warn('Database not available, skipping property tests');
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should isolate test data: cleanup removes only tracked data', { timeout: 15000 }, async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        // Generate random number of entities to create (1-5 for each type)
        fc.record({
          userCount: fc.integer({ min: 1, max: 3 }),
          projectsPerUser: fc.integer({ min: 1, max: 3 }),
          tasksPerProject: fc.integer({ min: 1, max: 3 }),
        }),
        async ({ userCount, projectsPerUser, tasksPerProject }) => {
          // Create a "background" user that should NOT be affected by cleanup
          const backgroundUser = await prisma.user.create({
            data: {
              email: generateTestEmail(),
              password: 'background_password',
            },
          });

          const backgroundProject = await prisma.project.create({
            data: {
              title: 'Background Project',
              deliverable: 'Should not be deleted',
              userId: backgroundUser.id,
            },
          });

          // Create a tracker for "test" data
          const tracker = new TestDataTracker(prisma);
          const trackedUserIds: string[] = [];
          const trackedProjectIds: string[] = [];
          const trackedTaskIds: string[] = [];

          // Create tracked test data
          for (let u = 0; u < userCount; u++) {
            const user = await prisma.user.create({
              data: {
                email: generateTestEmail(),
                password: 'test_password',
              },
            });
            tracker.trackUser(user.id);
            trackedUserIds.push(user.id);

            for (let p = 0; p < projectsPerUser; p++) {
              const project = await prisma.project.create({
                data: {
                  title: `Test Project ${u}-${p}`,
                  deliverable: `Deliverable ${u}-${p}`,
                  userId: user.id,
                },
              });
              tracker.trackProject(project.id);
              trackedProjectIds.push(project.id);

              for (let t = 0; t < tasksPerProject; t++) {
                const task = await prisma.task.create({
                  data: {
                    title: `Test Task ${u}-${p}-${t}`,
                    projectId: project.id,
                    userId: user.id,
                  },
                });
                tracker.trackTask(task.id);
                trackedTaskIds.push(task.id);
              }
            }
          }

          // Verify all tracked data exists before cleanup
          for (const userId of trackedUserIds) {
            const user = await prisma.user.findUnique({ where: { id: userId } });
            expect(user).not.toBeNull();
          }

          for (const projectId of trackedProjectIds) {
            const project = await prisma.project.findUnique({ where: { id: projectId } });
            expect(project).not.toBeNull();
          }

          for (const taskId of trackedTaskIds) {
            const task = await prisma.task.findUnique({ where: { id: taskId } });
            expect(task).not.toBeNull();
          }

          // Verify background data exists
          const bgUserBefore = await prisma.user.findUnique({ where: { id: backgroundUser.id } });
          const bgProjectBefore = await prisma.project.findUnique({ where: { id: backgroundProject.id } });
          expect(bgUserBefore).not.toBeNull();
          expect(bgProjectBefore).not.toBeNull();

          // Run cleanup
          await tracker.cleanup();

          // Verify all tracked data is removed
          for (const userId of trackedUserIds) {
            const user = await prisma.user.findUnique({ where: { id: userId } });
            expect(user).toBeNull();
          }

          for (const projectId of trackedProjectIds) {
            const project = await prisma.project.findUnique({ where: { id: projectId } });
            expect(project).toBeNull();
          }

          for (const taskId of trackedTaskIds) {
            const task = await prisma.task.findUnique({ where: { id: taskId } });
            expect(task).toBeNull();
          }

          // Verify background data is NOT affected
          const bgUserAfter = await prisma.user.findUnique({ where: { id: backgroundUser.id } });
          const bgProjectAfter = await prisma.project.findUnique({ where: { id: backgroundProject.id } });
          expect(bgUserAfter).not.toBeNull();
          expect(bgProjectAfter).not.toBeNull();
          expect(bgUserAfter?.email).toBe(backgroundUser.email);
          expect(bgProjectAfter?.title).toBe(backgroundProject.title);

          // Clean up background data manually
          await prisma.project.delete({ where: { id: backgroundProject.id } });
          await prisma.user.delete({ where: { id: backgroundUser.id } });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should ensure parallel test isolation: multiple trackers do not interfere', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        // Generate random data for two "parallel" test contexts
        fc.record({
          context1Users: fc.integer({ min: 1, max: 2 }),
          context2Users: fc.integer({ min: 1, max: 2 }),
        }),
        async ({ context1Users, context2Users }) => {
          // Simulate two parallel test contexts with separate trackers
          const tracker1 = new TestDataTracker(prisma);
          const tracker2 = new TestDataTracker(prisma);

          const context1UserIds: string[] = [];
          const context2UserIds: string[] = [];

          // Create data for context 1
          for (let i = 0; i < context1Users; i++) {
            const user = await prisma.user.create({
              data: {
                email: generateTestEmail(),
                password: 'context1_password',
              },
            });
            tracker1.trackUser(user.id);
            context1UserIds.push(user.id);
          }

          // Create data for context 2
          for (let i = 0; i < context2Users; i++) {
            const user = await prisma.user.create({
              data: {
                email: generateTestEmail(),
                password: 'context2_password',
              },
            });
            tracker2.trackUser(user.id);
            context2UserIds.push(user.id);
          }

          // Verify all data exists
          for (const userId of [...context1UserIds, ...context2UserIds]) {
            const user = await prisma.user.findUnique({ where: { id: userId } });
            expect(user).not.toBeNull();
          }

          // Cleanup context 1 only
          await tracker1.cleanup();

          // Verify context 1 data is removed
          for (const userId of context1UserIds) {
            const user = await prisma.user.findUnique({ where: { id: userId } });
            expect(user).toBeNull();
          }

          // Verify context 2 data is NOT affected
          for (const userId of context2UserIds) {
            const user = await prisma.user.findUnique({ where: { id: userId } });
            expect(user).not.toBeNull();
          }

          // Cleanup context 2
          await tracker2.cleanup();

          // Verify context 2 data is now removed
          for (const userId of context2UserIds) {
            const user = await prisma.user.findUnique({ where: { id: userId } });
            expect(user).toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle cleanup of hierarchical data correctly', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        // Generate random hierarchy depth
        fc.record({
          subtaskDepth: fc.integer({ min: 1, max: 3 }),
        }),
        async ({ subtaskDepth }) => {
          const tracker = new TestDataTracker(prisma);

          // Create user
          const user = await prisma.user.create({
            data: {
              email: generateTestEmail(),
              password: 'test_password',
            },
          });
          tracker.trackUser(user.id);

          // Create project
          const project = await prisma.project.create({
            data: {
              title: 'Hierarchical Test Project',
              deliverable: 'Test deliverable',
              userId: user.id,
            },
          });
          tracker.trackProject(project.id);

          // Create parent task
          const parentTask = await prisma.task.create({
            data: {
              title: 'Parent Task',
              projectId: project.id,
              userId: user.id,
            },
          });
          tracker.trackTask(parentTask.id);

          // Create nested subtasks
          let currentParentId = parentTask.id;
          const subtaskIds: string[] = [];
          
          for (let i = 0; i < subtaskDepth; i++) {
            const subtask = await prisma.task.create({
              data: {
                title: `Subtask Level ${i + 1}`,
                projectId: project.id,
                userId: user.id,
                parentId: currentParentId,
              },
            });
            tracker.trackTask(subtask.id);
            subtaskIds.push(subtask.id);
            currentParentId = subtask.id;
          }

          // Verify all tasks exist
          const allTaskIds = [parentTask.id, ...subtaskIds];
          for (const taskId of allTaskIds) {
            const task = await prisma.task.findUnique({ where: { id: taskId } });
            expect(task).not.toBeNull();
          }

          // Run cleanup
          await tracker.cleanup();

          // Verify all hierarchical data is removed
          for (const taskId of allTaskIds) {
            const task = await prisma.task.findUnique({ where: { id: taskId } });
            expect(task).toBeNull();
          }

          const projectAfter = await prisma.project.findUnique({ where: { id: project.id } });
          expect(projectAfter).toBeNull();

          const userAfter = await prisma.user.findUnique({ where: { id: user.id } });
          expect(userAfter).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
