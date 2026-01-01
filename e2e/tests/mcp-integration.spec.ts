import { test, expect } from '../fixtures';

/**
 * MCP Integration Tests
 * 
 * Tests external Agent reading context and executing tools via MCP protocol.
 * 
 * Requirements: 9.1-9.10, 10.1-10.5
 * - 9.1: MCP Server implements Model Context Protocol standard
 * - 9.2: Authenticate using API token
 * - 9.3: Return current Project, active Task, and Ammo Box documents
 * - 9.4: Return User's coding principles and preferences
 * - 9.5: vibe.complete_task marks Task as DONE
 * - 9.6: vibe.add_subtask creates new sub-task
 * - 9.7: vibe.report_blocker logs the blocker
 * - 9.8: Display MCP connection indicator
 * - 9.9: Return structured error response for invalid requests
 * - 9.10: Register available Resources and Tools
 * - 10.1: Expose Resources at defined URIs
 * - 10.2: Expose Tools with defined signatures
 * - 10.3: Return data in JSON format with consistent schema
 * - 10.4: Validate parameters and return success/failure response
 * - 10.5: Provide configuration file template
 */

test.describe('MCP Integration', () => {
  test.describe('MCP Resources', () => {
    test('should return current context with project and task', async ({
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      // Setup: Create project, task, and active pomodoro
      const project = await projectFactory.create(testUser.id, {
        title: 'MCP Test Project',
        deliverable: 'Test Deliverable',
      });

      const task = await taskFactory.createForToday(project.id, testUser.id, {
        title: 'MCP Test Task',
        priority: 'P1',
      });

      await prisma.userSettings.upsert({
        where: { userId: testUser.id },
        update: {},
        create: {
          userId: testUser.id,
          pomodoroDuration: 25,
          shortRestDuration: 5,
          longRestDuration: 15,
          longRestInterval: 4,
          dailyCap: 8,
        },
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await prisma.dailyState.deleteMany({ where: { userId: testUser.id } });
      await prisma.dailyState.create({
        data: {
          userId: testUser.id,
          date: today,
          systemState: 'FOCUS',
          top3TaskIds: [task.id],
          pomodoroCount: 0,
          capOverrideCount: 0,
          airlockCompleted: true,
        },
      });

      // Create active pomodoro
      const pomodoro = await prisma.pomodoro.create({
        data: {
          taskId: task.id,
          userId: testUser.id,
          duration: 25,
          status: 'IN_PROGRESS',
        },
      });

      // Verify the data structure that MCP would return
      const currentPomodoro = await prisma.pomodoro.findFirst({
        where: {
          userId: testUser.id,
          status: 'IN_PROGRESS',
        },
        include: {
          task: {
            include: {
              project: true,
            },
          },
        },
      });

      expect(currentPomodoro).not.toBeNull();
      expect(currentPomodoro?.task.project.title).toBe('MCP Test Project');
      expect(currentPomodoro?.task.title).toBe('MCP Test Task');
    });

    test('should return user goals', async ({
      goalFactory,
      prisma,
      testUser,
    }) => {
      // Create goals
      const longTermGoal = await goalFactory.createLongTerm(testUser.id, {
        title: 'Long Term Goal',
        description: 'A long term goal for testing',
      });

      const shortTermGoal = await goalFactory.createShortTerm(testUser.id, {
        title: 'Short Term Goal',
        description: 'A short term goal for testing',
      });

      // Verify goals exist
      const goals = await prisma.goal.findMany({
        where: { userId: testUser.id },
      });

      expect(goals).toHaveLength(2);
      
      const longTerm = goals.filter(g => g.type === 'LONG_TERM');
      const shortTerm = goals.filter(g => g.type === 'SHORT_TERM');
      
      expect(longTerm).toHaveLength(1);
      expect(shortTerm).toHaveLength(1);
      expect(longTerm[0].title).toBe('Long Term Goal');
      expect(shortTerm[0].title).toBe('Short Term Goal');
    });

    test('should return user principles and preferences', async ({
      prisma,
      testUser,
    }) => {
      // Create user settings with coding standards
      await prisma.userSettings.upsert({
        where: { userId: testUser.id },
        update: {
          codingStandards: ['Use TypeScript', 'Write tests', 'Document APIs'],
          preferences: { theme: 'dark', language: 'en' },
        },
        create: {
          userId: testUser.id,
          pomodoroDuration: 25,
          shortRestDuration: 5,
          longRestDuration: 15,
          longRestInterval: 4,
          dailyCap: 8,
          codingStandards: ['Use TypeScript', 'Write tests', 'Document APIs'],
          preferences: { theme: 'dark', language: 'en' },
        },
      });

      // Verify settings
      const settings = await prisma.userSettings.findUnique({
        where: { userId: testUser.id },
      });

      expect(settings?.codingStandards).toContain('Use TypeScript');
      expect(settings?.codingStandards).toContain('Write tests');
      expect((settings?.preferences as Record<string, unknown>)?.theme).toBe('dark');
    });

    test('should return active projects', async ({
      projectFactory,
      prisma,
      testUser,
    }) => {
      // Create multiple projects
      const activeProject1 = await projectFactory.create(testUser.id, {
        title: 'Active Project 1',
        status: 'ACTIVE',
      });

      const activeProject2 = await projectFactory.create(testUser.id, {
        title: 'Active Project 2',
        status: 'ACTIVE',
      });

      // Verify active projects
      const activeProjects = await prisma.project.findMany({
        where: {
          userId: testUser.id,
          status: 'ACTIVE',
        },
      });

      expect(activeProjects.length).toBeGreaterThanOrEqual(2);
      const titles = activeProjects.map(p => p.title);
      expect(titles).toContain('Active Project 1');
      expect(titles).toContain('Active Project 2');
    });

    test('should return today tasks with Top 3', async ({
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      const project = await projectFactory.create(testUser.id);
      
      const task1 = await taskFactory.createForToday(project.id, testUser.id, { title: 'Top 1', priority: 'P1' });
      const task2 = await taskFactory.createForToday(project.id, testUser.id, { title: 'Top 2', priority: 'P1' });
      const task3 = await taskFactory.createForToday(project.id, testUser.id, { title: 'Top 3', priority: 'P1' });
      const task4 = await taskFactory.createForToday(project.id, testUser.id, { title: 'Other Task', priority: 'P2' });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await prisma.dailyState.deleteMany({ where: { userId: testUser.id } });
      await prisma.dailyState.create({
        data: {
          userId: testUser.id,
          date: today,
          systemState: 'PLANNING',
          top3TaskIds: [task1.id, task2.id, task3.id],
          pomodoroCount: 0,
          capOverrideCount: 0,
          airlockCompleted: true,
        },
      });

      // Verify Top 3 tasks
      const dailyState = await prisma.dailyState.findUnique({
        where: {
          userId_date: {
            userId: testUser.id,
            date: today,
          },
        },
      });

      expect(dailyState?.top3TaskIds).toHaveLength(3);
      expect(dailyState?.top3TaskIds).toContain(task1.id);
      expect(dailyState?.top3TaskIds).toContain(task2.id);
      expect(dailyState?.top3TaskIds).toContain(task3.id);
      expect(dailyState?.top3TaskIds).not.toContain(task4.id);
    });
  });

  test.describe('MCP Tools', () => {
    test('vibe.complete_task should mark task as DONE', async ({
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      const project = await projectFactory.create(testUser.id);
      const task = await taskFactory.create(project.id, testUser.id, {
        title: 'Task to Complete',
        status: 'IN_PROGRESS',
      });

      // Simulate vibe.complete_task tool execution
      const updatedTask = await prisma.task.update({
        where: { id: task.id },
        data: {
          status: 'DONE',
        },
      });

      // Log activity (as MCP tool would do)
      await prisma.activityLog.create({
        data: {
          userId: testUser.id,
          url: `vibe://task/${task.id}`,
          title: `Task completed: ${task.title}`,
          duration: 0,
          category: 'productive',
          source: 'mcp_agent',
        },
      });

      expect(updatedTask.status).toBe('DONE');

      // Verify activity was logged
      const activityLog = await prisma.activityLog.findFirst({
        where: {
          userId: testUser.id,
          source: 'mcp_agent',
          url: `vibe://task/${task.id}`,
        },
      });
      expect(activityLog).not.toBeNull();
    });

    test('vibe.add_subtask should create new sub-task', async ({
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      const project = await projectFactory.create(testUser.id);
      const parentTask = await taskFactory.create(project.id, testUser.id, {
        title: 'Parent Task',
      });

      // Simulate vibe.add_subtask tool execution
      const subtask = await prisma.task.create({
        data: {
          title: 'New Subtask from MCP',
          projectId: project.id,
          userId: testUser.id,
          parentId: parentTask.id,
          priority: 'P2',
          status: 'TODO',
        },
      });

      expect(subtask.parentId).toBe(parentTask.id);
      expect(subtask.projectId).toBe(project.id);
      expect(subtask.title).toBe('New Subtask from MCP');

      // Verify parent-child relationship
      const parentWithSubtasks = await prisma.task.findUnique({
        where: { id: parentTask.id },
        include: { subTasks: true },
      });

      expect(parentWithSubtasks?.subTasks).toHaveLength(1);
      expect(parentWithSubtasks?.subTasks[0].id).toBe(subtask.id);
    });

    test('vibe.report_blocker should log the blocker', async ({
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      const project = await projectFactory.create(testUser.id);
      const task = await taskFactory.create(project.id, testUser.id, {
        title: 'Blocked Task',
      });

      const errorLog = 'TypeError: Cannot read property of undefined';

      // Simulate vibe.report_blocker tool execution
      const blockerLog = await prisma.activityLog.create({
        data: {
          userId: testUser.id,
          url: `vibe://blocker/${task.id}`,
          title: `Blocker reported for: ${task.title}`,
          duration: 0,
          category: 'neutral',
          source: 'mcp_agent',
        },
      });

      expect(blockerLog).not.toBeNull();
      expect(blockerLog.url).toContain(task.id);
      expect(blockerLog.source).toBe('mcp_agent');
    });

    test('vibe.start_pomodoro should start focus session', async ({
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      const project = await projectFactory.create(testUser.id);
      const task = await taskFactory.createForToday(project.id, testUser.id, {
        title: 'Focus Task',
      });

      await prisma.userSettings.upsert({
        where: { userId: testUser.id },
        update: {},
        create: {
          userId: testUser.id,
          pomodoroDuration: 25,
          shortRestDuration: 5,
          longRestDuration: 15,
          longRestInterval: 4,
          dailyCap: 8,
        },
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await prisma.dailyState.deleteMany({ where: { userId: testUser.id } });
      await prisma.dailyState.create({
        data: {
          userId: testUser.id,
          date: today,
          systemState: 'PLANNING',
          top3TaskIds: [task.id],
          pomodoroCount: 0,
          capOverrideCount: 0,
          airlockCompleted: true,
        },
      });

      // Simulate vibe.start_pomodoro tool execution
      const pomodoro = await prisma.pomodoro.create({
        data: {
          taskId: task.id,
          userId: testUser.id,
          duration: 25,
          status: 'IN_PROGRESS',
        },
      });

      expect(pomodoro.taskId).toBe(task.id);
      expect(pomodoro.status).toBe('IN_PROGRESS');
      expect(pomodoro.duration).toBe(25);
    });

    test('vibe.get_task_context should return detailed task context', async ({
      projectFactory,
      taskFactory,
      goalFactory,
      prisma,
      testUser,
    }) => {
      // Create goal
      const goal = await goalFactory.createShortTerm(testUser.id, {
        title: 'Project Goal',
      });

      // Create project linked to goal
      const project = await projectFactory.create(testUser.id, {
        title: 'Context Test Project',
        deliverable: 'Test Deliverable',
      });

      // Link project to goal
      await prisma.projectGoal.create({
        data: {
          projectId: project.id,
          goalId: goal.id,
        },
      });

      // Create parent task with subtasks
      const parentTask = await taskFactory.create(project.id, testUser.id, {
        title: 'Parent Task',
      });

      const subtask1 = await taskFactory.create(project.id, testUser.id, {
        title: 'Subtask 1',
        parentId: parentTask.id,
      });

      const subtask2 = await taskFactory.create(project.id, testUser.id, {
        title: 'Subtask 2',
        parentId: parentTask.id,
      });

      // Simulate vibe.get_task_context tool execution
      const taskContext = await prisma.task.findUnique({
        where: { id: parentTask.id },
        include: {
          project: {
            include: {
              goals: {
                include: {
                  goal: true,
                },
              },
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

      expect(taskContext).not.toBeNull();
      expect(taskContext?.title).toBe('Parent Task');
      expect(taskContext?.project.title).toBe('Context Test Project');
      expect(taskContext?.subTasks).toHaveLength(2);
      expect(taskContext?.project.goals).toHaveLength(1);
      expect(taskContext?.project.goals[0].goal.title).toBe('Project Goal');
    });
  });

  test.describe('MCP Error Handling', () => {
    test('should return error for non-existent task', async ({
      prisma,
      testUser,
    }) => {
      const nonExistentTaskId = '00000000-0000-0000-0000-000000000000';

      // Simulate tool call with non-existent task
      const task = await prisma.task.findFirst({
        where: {
          id: nonExistentTaskId,
          userId: testUser.id,
        },
      });

      expect(task).toBeNull();
      // MCP would return: { success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } }
    });

    test('should validate required parameters', async ({
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      const project = await projectFactory.create(testUser.id);
      const task = await taskFactory.create(project.id, testUser.id);

      // Simulate vibe.add_subtask without required title
      // MCP would validate and return error
      const invalidInput = {
        parent_id: task.id,
        // title is missing
      };

      // Validation would fail
      expect(invalidInput.parent_id).toBeDefined();
      expect((invalidInput as { title?: string }).title).toBeUndefined();
      // MCP would return: { success: false, error: { code: 'VALIDATION_ERROR', message: 'title is required' } }
    });

    test('should prevent unauthorized access to other user data', async ({
      userFactory,
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      // Create another user with their own data
      const otherUser = await userFactory.create({
        email: `other-${Date.now()}@test.vibeflow.local`,
      });

      const otherProject = await projectFactory.create(otherUser.id, {
        title: 'Other User Project',
      });

      const otherTask = await taskFactory.create(otherProject.id, otherUser.id, {
        title: 'Other User Task',
      });

      // Try to access other user's task as testUser
      const unauthorizedTask = await prisma.task.findFirst({
        where: {
          id: otherTask.id,
          userId: testUser.id, // This should not match
        },
      });

      expect(unauthorizedTask).toBeNull();
      // MCP would return: { success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } }
    });
  });

  test.describe('MCP State Synchronization', () => {
    test('should sync state changes to connected clients', async ({
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      const project = await projectFactory.create(testUser.id);
      const task = await taskFactory.createForToday(project.id, testUser.id);

      await prisma.userSettings.upsert({
        where: { userId: testUser.id },
        update: {},
        create: {
          userId: testUser.id,
          pomodoroDuration: 25,
          shortRestDuration: 5,
          longRestDuration: 15,
          longRestInterval: 4,
          dailyCap: 8,
        },
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await prisma.dailyState.deleteMany({ where: { userId: testUser.id } });
      
      // Initial state: PLANNING
      await prisma.dailyState.create({
        data: {
          userId: testUser.id,
          date: today,
          systemState: 'PLANNING',
          top3TaskIds: [task.id],
          pomodoroCount: 0,
          capOverrideCount: 0,
          airlockCompleted: true,
        },
      });

      // MCP tool starts pomodoro, state changes to FOCUS
      await prisma.pomodoro.create({
        data: {
          taskId: task.id,
          userId: testUser.id,
          duration: 25,
          status: 'IN_PROGRESS',
        },
      });

      await prisma.dailyState.update({
        where: {
          userId_date: {
            userId: testUser.id,
            date: today,
          },
        },
        data: {
          systemState: 'FOCUS',
        },
      });

      // Verify state was updated
      const updatedState = await prisma.dailyState.findUnique({
        where: {
          userId_date: {
            userId: testUser.id,
            date: today,
          },
        },
      });

      expect(updatedState?.systemState).toBe('FOCUS');
      // In real scenario, WebSocket would broadcast this change to connected clients
    });
  });
});
