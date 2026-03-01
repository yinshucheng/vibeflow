import fc from 'fast-check';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient, GoalType, GoalStatus, ProjectStatus, TaskStatus, Priority } from '@prisma/client';
import { handleResourceRead, RESOURCE_URIS } from '@/mcp/resources';
import type { MCPContext } from '@/mcp/auth';

/**
 * Feature: vibeflow-foundation
 * Property 12: MCP Resource Schema Consistency
 * Validates: Requirements 9.3, 9.4, 10.1, 10.3
 *
 * For any MCP resource request:
 * - Response SHALL be valid JSON matching the defined schema
 * - `vibe://context/current` returns CurrentContext schema
 * - `vibe://user/goals` returns UserGoals schema
 * - `vibe://tasks/today` returns TodayTasks schema
 */

const prisma = new PrismaClient();

let testUserId: string;
let dbAvailable = false;

// Helper to compute "today" with the 4 AM daily reset boundary
// (mirrors getTodayDate() in daily-state.service.ts)
function getServiceTodayDate(): Date {
  const now = new Date();
  const today = new Date(now);
  if (now.getHours() < 4) {
    today.setDate(today.getDate() - 1);
  }
  today.setHours(0, 0, 0, 0);
  return today;
}

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
  return `mcp-pbt-${timestamp}-${random}@test.vibeflow.local`;
}

// Schema validators for MCP resources
function isValidCurrentContextSchema(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  
  // Check required fields exist
  if (!('project' in obj)) return false;
  if (!('task' in obj)) return false;
  if (!('systemState' in obj)) return false;
  if (!('pomodoroRemaining' in obj)) return false;
  
  // systemState must be a string
  if (typeof obj.systemState !== 'string') return false;
  
  // pomodoroRemaining must be number or null
  if (obj.pomodoroRemaining !== null && typeof obj.pomodoroRemaining !== 'number') return false;
  
  // project must be null or valid object
  if (obj.project !== null) {
    if (typeof obj.project !== 'object') return false;
    const project = obj.project as Record<string, unknown>;
    if (typeof project.id !== 'string') return false;
    if (typeof project.title !== 'string') return false;
    if (typeof project.deliverable !== 'string') return false;
  }
  
  // task must be null or valid object
  if (obj.task !== null) {
    if (typeof obj.task !== 'object') return false;
    const task = obj.task as Record<string, unknown>;
    if (typeof task.id !== 'string') return false;
    if (typeof task.title !== 'string') return false;
    if (typeof task.priority !== 'string') return false;
    if (!Array.isArray(task.parentPath)) return false;
  }
  
  return true;
}

function isValidUserGoalsSchema(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  
  // Check required fields exist
  if (!('longTerm' in obj) || !Array.isArray(obj.longTerm)) return false;
  if (!('shortTerm' in obj) || !Array.isArray(obj.shortTerm)) return false;
  
  // Validate each goal in longTerm
  for (const goal of obj.longTerm as unknown[]) {
    if (!isValidGoalSchema(goal)) return false;
  }
  
  // Validate each goal in shortTerm
  for (const goal of obj.shortTerm as unknown[]) {
    if (!isValidGoalSchema(goal)) return false;
  }
  
  return true;
}

function isValidGoalSchema(goal: unknown): boolean {
  if (typeof goal !== 'object' || goal === null) return false;
  const obj = goal as Record<string, unknown>;
  
  if (typeof obj.id !== 'string') return false;
  if (typeof obj.title !== 'string') return false;
  if (typeof obj.description !== 'string') return false;
  if (typeof obj.targetDate !== 'string') return false;
  if (typeof obj.status !== 'string') return false;
  if (typeof obj.linkedProjects !== 'number') return false;
  
  return true;
}

function isValidUserPrinciplesSchema(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  
  // Check required fields exist
  if (!('codingStandards' in obj) || !Array.isArray(obj.codingStandards)) return false;
  if (!('preferences' in obj) || typeof obj.preferences !== 'object') return false;
  
  // All codingStandards must be strings
  for (const standard of obj.codingStandards as unknown[]) {
    if (typeof standard !== 'string') return false;
  }
  
  return true;
}

function isValidActiveProjectsSchema(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  
  // Check required fields exist
  if (!('projects' in obj) || !Array.isArray(obj.projects)) return false;
  
  // Validate each project
  for (const project of obj.projects as unknown[]) {
    if (!isValidProjectSchema(project)) return false;
  }
  
  return true;
}

function isValidProjectSchema(project: unknown): boolean {
  if (typeof project !== 'object' || project === null) return false;
  const obj = project as Record<string, unknown>;
  
  if (typeof obj.id !== 'string') return false;
  if (typeof obj.title !== 'string') return false;
  if (typeof obj.deliverable !== 'string') return false;
  if (typeof obj.status !== 'string') return false;
  if (typeof obj.taskCount !== 'number') return false;
  if (!Array.isArray(obj.linkedGoals)) return false;
  
  return true;
}

function isValidTodayTasksSchema(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  
  // Check required fields exist
  if (!('top3' in obj) || !Array.isArray(obj.top3)) return false;
  if (!('others' in obj) || !Array.isArray(obj.others)) return false;
  
  // Validate each task in top3
  for (const task of obj.top3 as unknown[]) {
    if (!isValidTaskSchema(task)) return false;
  }
  
  // Validate each task in others
  for (const task of obj.others as unknown[]) {
    if (!isValidTaskSchema(task)) return false;
  }
  
  return true;
}

function isValidTaskSchema(task: unknown): boolean {
  if (typeof task !== 'object' || task === null) return false;
  const obj = task as Record<string, unknown>;
  
  if (typeof obj.id !== 'string') return false;
  if (typeof obj.title !== 'string') return false;
  if (typeof obj.priority !== 'string') return false;
  if (typeof obj.projectId !== 'string') return false;
  if (typeof obj.projectTitle !== 'string') return false;
  if (typeof obj.status !== 'string') return false;
  
  return true;
}

describe('Property 12: MCP Resource Schema Consistency', () => {
  beforeAll(async () => {
    dbAvailable = await checkDatabaseConnection();
    if (!dbAvailable) {
      console.warn('Database not available, skipping property tests');
      return;
    }

    // Create a test user for the property tests
    const testUser = await prisma.user.create({
      data: {
        email: generateTestEmail(),
        password: 'hashed_password_placeholder',
      },
    });
    testUserId = testUser.id;

    // Create user settings
    await prisma.userSettings.create({
      data: {
        userId: testUserId,
        codingStandards: ['Use TypeScript', 'Follow ESLint rules'],
        preferences: { theme: 'dark', language: 'en' },
      },
    });
  });

  afterAll(async () => {
    if (!dbAvailable) return;

    // Clean up all test data
    if (testUserId) {
      await prisma.pomodoro.deleteMany({ where: { userId: testUserId } });
      await prisma.task.deleteMany({ where: { userId: testUserId } });
      await prisma.projectGoal.deleteMany({ 
        where: { project: { userId: testUserId } } 
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
    await prisma.pomodoro.deleteMany({ where: { userId: testUserId } });
    await prisma.task.deleteMany({ where: { userId: testUserId } });
    await prisma.projectGoal.deleteMany({ 
      where: { project: { userId: testUserId } } 
    });
    await prisma.project.deleteMany({ where: { userId: testUserId } });
    await prisma.goal.deleteMany({ where: { userId: testUserId } });
    await prisma.dailyState.deleteMany({ where: { userId: testUserId } });
  });

  it('vibe://context/current returns valid CurrentContext schema', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    const context: MCPContext = { userId: testUserId, email: 'test@vibeflow.local', isAuthenticated: true };
    
    await fc.assert(
      fc.asyncProperty(
        // Generate random system states
        fc.constantFrom('LOCKED', 'PLANNING', 'FOCUS', 'REST'),
        async (systemState) => {
          // Set up daily state (use 4AM boundary to match service logic)
          const today = getServiceTodayDate();

          await prisma.dailyState.upsert({
            where: {
              userId_date: {
                userId: testUserId,
                date: today,
              },
            },
            update: { systemState },
            create: {
              userId: testUserId,
              date: today,
              systemState,
              top3TaskIds: [],
              pomodoroCount: 0,
              capOverrideCount: 0,
              airlockCompleted: systemState !== 'LOCKED',
            },
          });

          // Request the resource
          const result = await handleResourceRead(RESOURCE_URIS.CURRENT_CONTEXT, context);
          
          // Verify response structure
          expect(result.contents).toBeDefined();
          expect(result.contents.length).toBe(1);
          expect(result.contents[0].uri).toBe(RESOURCE_URIS.CURRENT_CONTEXT);
          expect(result.contents[0].mimeType).toBe('application/json');
          
          // Parse and validate JSON
          const data = JSON.parse(result.contents[0].text);
          expect(isValidCurrentContextSchema(data)).toBe(true);
          
          // Verify systemState matches (case-insensitive since implementation may normalize)
          expect(data.systemState.toUpperCase()).toBe(systemState.toUpperCase());
        }
      ),
      { numRuns: 100 }
    );
  });

  it('vibe://user/goals returns valid UserGoals schema', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    const context: MCPContext = { userId: testUserId, email: 'test@vibeflow.local', isAuthenticated: true };
    
    // Generator for goal data
    const goalDataArb = fc.record({
      title: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
      description: fc.string({ minLength: 1, maxLength: 500 }).filter(s => s.trim().length > 0),
      type: fc.constantFrom('LONG_TERM', 'SHORT_TERM') as fc.Arbitrary<'LONG_TERM' | 'SHORT_TERM'>,
    });

    await fc.assert(
      fc.asyncProperty(
        // Generate 0-5 goals
        fc.array(goalDataArb, { minLength: 0, maxLength: 5 }),
        async (goalsData) => {
          // Clean up existing goals
          await prisma.goal.deleteMany({ where: { userId: testUserId } });
          
          // Create goals with appropriate target dates
          for (const goalData of goalsData) {
            const targetDate = new Date();
            if (goalData.type === 'LONG_TERM') {
              // 1-5 years from now
              targetDate.setFullYear(targetDate.getFullYear() + 2);
            } else {
              // 1 week to 6 months from now
              targetDate.setMonth(targetDate.getMonth() + 3);
            }
            
            await prisma.goal.create({
              data: {
                title: goalData.title,
                description: goalData.description,
                type: goalData.type as GoalType,
                targetDate,
                status: 'ACTIVE' as GoalStatus,
                userId: testUserId,
              },
            });
          }

          // Request the resource
          const result = await handleResourceRead(RESOURCE_URIS.USER_GOALS, context);
          
          // Verify response structure
          expect(result.contents).toBeDefined();
          expect(result.contents.length).toBe(1);
          expect(result.contents[0].uri).toBe(RESOURCE_URIS.USER_GOALS);
          expect(result.contents[0].mimeType).toBe('application/json');
          
          // Parse and validate JSON
          const data = JSON.parse(result.contents[0].text);
          expect(isValidUserGoalsSchema(data)).toBe(true);
          
          // Verify goal counts match
          const longTermCount = goalsData.filter(g => g.type === 'LONG_TERM').length;
          const shortTermCount = goalsData.filter(g => g.type === 'SHORT_TERM').length;
          expect(data.longTerm.length).toBe(longTermCount);
          expect(data.shortTerm.length).toBe(shortTermCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('vibe://user/principles returns valid UserPrinciples schema', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    const context: MCPContext = { userId: testUserId, email: 'test@vibeflow.local', isAuthenticated: true };
    
    await fc.assert(
      fc.asyncProperty(
        // Generate random coding standards
        fc.array(
          fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
          { minLength: 0, maxLength: 10 }
        ),
        // Generate random preferences
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
          fc.oneof(fc.string(), fc.integer(), fc.boolean()),
          { minKeys: 0, maxKeys: 5 }
        ),
        async (codingStandards, preferences) => {
          // Update user settings
          await prisma.userSettings.update({
            where: { userId: testUserId },
            data: {
              codingStandards,
              preferences,
            },
          });

          // Request the resource
          const result = await handleResourceRead(RESOURCE_URIS.USER_PRINCIPLES, context);
          
          // Verify response structure
          expect(result.contents).toBeDefined();
          expect(result.contents.length).toBe(1);
          expect(result.contents[0].uri).toBe(RESOURCE_URIS.USER_PRINCIPLES);
          expect(result.contents[0].mimeType).toBe('application/json');
          
          // Parse and validate JSON
          const data = JSON.parse(result.contents[0].text);
          expect(isValidUserPrinciplesSchema(data)).toBe(true);
          
          // Verify data matches
          expect(data.codingStandards).toEqual(codingStandards);
          expect(data.preferences).toEqual(preferences);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('vibe://projects/active returns valid ActiveProjects schema', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    const context: MCPContext = { userId: testUserId, email: 'test@vibeflow.local', isAuthenticated: true };
    
    // Generator for project data
    const projectDataArb = fc.record({
      title: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
      deliverable: fc.string({ minLength: 1, maxLength: 500 }).filter(s => s.trim().length > 0),
      status: fc.constantFrom('ACTIVE', 'COMPLETED', 'ARCHIVED') as fc.Arbitrary<'ACTIVE' | 'COMPLETED' | 'ARCHIVED'>,
    });

    await fc.assert(
      fc.asyncProperty(
        // Generate 0-5 projects
        fc.array(projectDataArb, { minLength: 0, maxLength: 5 }),
        async (projectsData) => {
          // Clean up existing projects
          await prisma.task.deleteMany({ where: { userId: testUserId } });
          await prisma.projectGoal.deleteMany({ 
            where: { project: { userId: testUserId } } 
          });
          await prisma.project.deleteMany({ where: { userId: testUserId } });
          
          // Create projects
          for (const projectData of projectsData) {
            await prisma.project.create({
              data: {
                title: projectData.title,
                deliverable: projectData.deliverable,
                status: projectData.status as ProjectStatus,
                userId: testUserId,
              },
            });
          }

          // Request the resource
          const result = await handleResourceRead(RESOURCE_URIS.ACTIVE_PROJECTS, context);
          
          // Verify response structure
          expect(result.contents).toBeDefined();
          expect(result.contents.length).toBe(1);
          expect(result.contents[0].uri).toBe(RESOURCE_URIS.ACTIVE_PROJECTS);
          expect(result.contents[0].mimeType).toBe('application/json');
          
          // Parse and validate JSON
          const data = JSON.parse(result.contents[0].text);
          expect(isValidActiveProjectsSchema(data)).toBe(true);
          
          // Verify only ACTIVE projects are returned
          const activeCount = projectsData.filter(p => p.status === 'ACTIVE').length;
          expect(data.projects.length).toBe(activeCount);
          
          // Verify all returned projects have ACTIVE status
          for (const project of data.projects) {
            expect(project.status).toBe('ACTIVE');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('vibe://tasks/today returns valid TodayTasks schema', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    const context: MCPContext = { userId: testUserId, email: 'test@vibeflow.local', isAuthenticated: true };
    
    await fc.assert(
      fc.asyncProperty(
        // Generate number of tasks (0-5)
        fc.integer({ min: 0, max: 5 }),
        // Generate number of top3 tasks (0-3)
        fc.integer({ min: 0, max: 3 }),
        async (taskCount, top3Count) => {
          // Clean up existing data
          await prisma.task.deleteMany({ where: { userId: testUserId } });
          await prisma.project.deleteMany({ where: { userId: testUserId } });
          await prisma.dailyState.deleteMany({ where: { userId: testUserId } });
          
          // Create a project for tasks
          const project = await prisma.project.create({
            data: {
              title: 'Test Project',
              deliverable: 'Test Deliverable',
              status: 'ACTIVE',
              userId: testUserId,
            },
          });
          
          // Create tasks with today's plan date (calendar date for taskService)
          const calendarToday = new Date();
          calendarToday.setHours(0, 0, 0, 0);
          // Service "today" uses 4AM boundary for dailyState
          const serviceToday = getServiceTodayDate();

          const createdTaskIds: string[] = [];
          for (let i = 0; i < taskCount; i++) {
            const task = await prisma.task.create({
              data: {
                title: `Task ${i + 1}`,
                priority: ['P1', 'P2', 'P3'][i % 3] as Priority,
                status: 'TODO' as TaskStatus,
                planDate: calendarToday,
                sortOrder: i,
                projectId: project.id,
                userId: testUserId,
              },
            });
            createdTaskIds.push(task.id);
          }

          // Select top3 tasks (up to available tasks)
          const actualTop3Count = Math.min(top3Count, taskCount);
          const top3TaskIds = createdTaskIds.slice(0, actualTop3Count);

          // Create daily state with top3 (use service date for 4AM boundary)
          await prisma.dailyState.create({
            data: {
              userId: testUserId,
              date: serviceToday,
              systemState: 'PLANNING',
              top3TaskIds,
              pomodoroCount: 0,
              capOverrideCount: 0,
              airlockCompleted: true,
            },
          });

          // Request the resource
          const result = await handleResourceRead(RESOURCE_URIS.TODAY_TASKS, context);
          
          // Verify response structure
          expect(result.contents).toBeDefined();
          expect(result.contents.length).toBe(1);
          expect(result.contents[0].uri).toBe(RESOURCE_URIS.TODAY_TASKS);
          expect(result.contents[0].mimeType).toBe('application/json');
          
          // Parse and validate JSON
          const data = JSON.parse(result.contents[0].text);
          expect(isValidTodayTasksSchema(data)).toBe(true);
          
          // Verify top3 count matches
          expect(data.top3.length).toBe(actualTop3Count);
          
          // Verify others count matches
          expect(data.others.length).toBe(taskCount - actualTop3Count);
          
          // Verify total tasks
          expect(data.top3.length + data.others.length).toBe(taskCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('unknown resource URI returns error response', async () => {
    if (!dbAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }

    const context: MCPContext = { userId: testUserId, email: 'test@vibeflow.local', isAuthenticated: true };
    
    await fc.assert(
      fc.asyncProperty(
        // Generate random invalid URIs
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => 
          !Object.values(RESOURCE_URIS).includes(s as typeof RESOURCE_URIS[keyof typeof RESOURCE_URIS])
        ),
        async (invalidUri) => {
          // Request the resource
          const result = await handleResourceRead(invalidUri, context);
          
          // Verify response structure
          expect(result.contents).toBeDefined();
          expect(result.contents.length).toBe(1);
          expect(result.contents[0].mimeType).toBe('application/json');
          
          // Parse and verify error response
          const data = JSON.parse(result.contents[0].text);
          expect(data.error).toBeDefined();
          expect(data.error.code).toBe('NOT_FOUND');
          expect(typeof data.error.message).toBe('string');
        }
      ),
      { numRuns: 100 }
    );
  });
});
