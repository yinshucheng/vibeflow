import { test, expect } from '../fixtures';

/**
 * Fixture verification tests
 * 
 * This test suite verifies that all E2E fixtures are properly configured
 * and working correctly before running the main test suite.
 * 
 * Checkpoint: Task 3 - Fixtures 完成
 */

test.describe('Fixture Verification', () => {
  test('database fixture provides working Prisma client', async ({ prisma }) => {
    // Verify Prisma client is connected and can query
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    expect(result).toBeDefined();
  });

  test('tracker fixture tracks and cleans up data', async ({ prisma, tracker }) => {
    // Create a test user directly
    const user = await prisma.user.create({
      data: {
        email: `tracker-test-${Date.now()}@test.vibeflow.local`,
        password: 'test_password',
      },
    });
    
    // Track the user
    tracker.trackUser(user.id);
    
    // Verify user exists
    const foundUser = await prisma.user.findUnique({
      where: { id: user.id },
    });
    expect(foundUser).not.toBeNull();
    expect(foundUser?.email).toBe(user.email);
    
    // Cleanup will happen automatically after test via tracker
  });

  test('userFactory creates valid users', async ({ userFactory, prisma }) => {
    const user = await userFactory.create({
      email: `factory-test-${Date.now()}@test.vibeflow.local`,
    });
    
    expect(user).toBeDefined();
    expect(user.id).toBeDefined();
    expect(user.email).toContain('@test.vibeflow.local');
    
    // Verify user exists in database
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
    });
    expect(dbUser).not.toBeNull();
  });

  test('userFactory creates users with settings', async ({ userFactory, prisma }) => {
    const user = await userFactory.createWithSettings({
      settings: {
        pomodoroDuration: 30,
        dailyCap: 10,
      },
    });
    
    expect(user).toBeDefined();
    expect(user.settings).not.toBeNull();
    expect(user.settings?.pomodoroDuration).toBe(30);
    expect(user.settings?.dailyCap).toBe(10);
  });

  test('projectFactory creates valid projects', async ({ userFactory, projectFactory, prisma }) => {
    const user = await userFactory.create();
    const project = await projectFactory.create(user.id, {
      title: 'Test Project',
      deliverable: 'Test Deliverable',
    });
    
    expect(project).toBeDefined();
    expect(project.id).toBeDefined();
    expect(project.title).toBe('Test Project');
    expect(project.deliverable).toBe('Test Deliverable');
    expect(project.userId).toBe(user.id);
    
    // Verify project exists in database
    const dbProject = await prisma.project.findUnique({
      where: { id: project.id },
    });
    expect(dbProject).not.toBeNull();
  });

  test('taskFactory creates valid tasks', async ({ userFactory, projectFactory, taskFactory, prisma }) => {
    const user = await userFactory.create();
    const project = await projectFactory.create(user.id);
    const task = await taskFactory.create(project.id, user.id, {
      title: 'Test Task',
      priority: 'P1',
    });
    
    expect(task).toBeDefined();
    expect(task.id).toBeDefined();
    expect(task.title).toBe('Test Task');
    expect(task.priority).toBe('P1');
    expect(task.projectId).toBe(project.id);
    expect(task.userId).toBe(user.id);
    
    // Verify task exists in database
    const dbTask = await prisma.task.findUnique({
      where: { id: task.id },
    });
    expect(dbTask).not.toBeNull();
  });

  test('taskFactory creates tasks with subtasks', async ({ userFactory, projectFactory, taskFactory }) => {
    const user = await userFactory.create();
    const project = await projectFactory.create(user.id);
    const { parent, subtasks } = await taskFactory.createWithSubtasks(
      project.id,
      user.id,
      3,
      { title: 'Parent Task' }
    );
    
    expect(parent).toBeDefined();
    expect(parent.title).toBe('Parent Task');
    expect(subtasks).toHaveLength(3);
    
    for (const subtask of subtasks) {
      expect(subtask.parentId).toBe(parent.id);
    }
  });

  test('goalFactory creates valid goals', async ({ userFactory, goalFactory, prisma }) => {
    const user = await userFactory.create();
    const goal = await goalFactory.create(user.id, {
      title: 'Test Goal',
      type: 'SHORT_TERM',
    });
    
    expect(goal).toBeDefined();
    expect(goal.id).toBeDefined();
    expect(goal.title).toBe('Test Goal');
    expect(goal.type).toBe('SHORT_TERM');
    expect(goal.userId).toBe(user.id);
    
    // Verify goal exists in database
    const dbGoal = await prisma.goal.findUnique({
      where: { id: goal.id },
    });
    expect(dbGoal).not.toBeNull();
  });

  test('goalFactory creates long-term and short-term goals', async ({ userFactory, goalFactory }) => {
    const user = await userFactory.create();
    
    const longTermGoal = await goalFactory.createLongTerm(user.id, {
      title: 'Long Term Goal',
    });
    expect(longTermGoal.type).toBe('LONG_TERM');
    
    const shortTermGoal = await goalFactory.createShortTerm(user.id, {
      title: 'Short Term Goal',
    });
    expect(shortTermGoal.type).toBe('SHORT_TERM');
  });

  test('testUser fixture provides authenticated user', async ({ testUser }) => {
    expect(testUser).toBeDefined();
    expect(testUser.id).toBeDefined();
    expect(testUser.email).toContain('@test.vibeflow.local');
  });

  test('authenticatedPage has dev auth header configured', async ({ authenticatedPage, testUser }) => {
    // Navigate to a page that requires auth
    const response = await authenticatedPage.goto('/');
    
    // The page should load successfully (not redirect to login)
    expect(response?.status()).toBeLessThan(400);
  });

  test('createAuthenticatedContext creates new authenticated contexts', async ({ createAuthenticatedContext }) => {
    const context1 = await createAuthenticatedContext();
    const context2 = await createAuthenticatedContext('custom@test.vibeflow.local');
    
    expect(context1).toBeDefined();
    expect(context2).toBeDefined();
    
    // Contexts should be different
    expect(context1).not.toBe(context2);
  });

  test('db fixture provides combined database utilities', async ({ db }) => {
    expect(db).toBeDefined();
    expect(db.prisma).toBeDefined();
    expect(db.tracker).toBeDefined();
    expect(typeof db.cleanup).toBe('function');
    expect(typeof db.cleanupAll).toBe('function');
  });
});

test.describe('Data Isolation Verification', () => {
  test('test data is isolated between tests - part 1', async ({ userFactory, prisma }) => {
    // Create a user with a specific email pattern
    const user = await userFactory.create({
      email: `isolation-test-1-${Date.now()}@test.vibeflow.local`,
    });
    
    // Store the ID for verification
    expect(user.id).toBeDefined();
    
    // Verify only our user exists with this pattern
    const users = await prisma.user.findMany({
      where: {
        email: {
          contains: 'isolation-test-1',
        },
      },
    });
    expect(users.length).toBe(1);
  });

  test('test data is isolated between tests - part 2', async ({ userFactory, prisma }) => {
    // Create a different user
    const user = await userFactory.create({
      email: `isolation-test-2-${Date.now()}@test.vibeflow.local`,
    });
    
    expect(user.id).toBeDefined();
    
    // Verify only our user exists with this pattern
    const users = await prisma.user.findMany({
      where: {
        email: {
          contains: 'isolation-test-2',
        },
      },
    });
    expect(users.length).toBe(1);
  });
});
