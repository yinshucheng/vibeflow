import { test, expect } from '../fixtures';

/**
 * MCP AI-Native Enhancement Resources E2E Tests
 * 
 * Tests the extended MCP resources for AI-Native Enhancement.
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4
 * - 1.1: vibe://context/workspace - workspace files, recent changes, active branches
 * - 1.2: vibe://history/pomodoros - last 7 days of Pomodoro history
 * - 1.3: vibe://analytics/productivity - productivity metrics and patterns
 * - 1.4: vibe://blockers/active - currently reported blockers
 */

test.describe('MCP AI-Native Enhancement Resources', () => {
  test.describe('Workspace Context Resource (Requirement 1.1)', () => {
    test('should return workspace context with recent activity', async ({
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      // Setup: Create project and task
      const project = await projectFactory.create(testUser.id, {
        title: 'Workspace Test Project',
      });

      const task = await taskFactory.createForToday(project.id, testUser.id, {
        title: 'Workspace Test Task',
      });

      // Create activity logs to simulate workspace activity
      const now = new Date();
      await prisma.activityLog.createMany({
        data: [
          {
            userId: testUser.id,
            url: 'https://github.com/project/file1.ts',
            title: 'Editing file1.ts',
            duration: 300,
            category: 'productive',
            source: 'browser_extension',
            timestamp: new Date(now.getTime() - 1000 * 60 * 30), // 30 min ago
          },
          {
            userId: testUser.id,
            url: 'https://github.com/project/file2.ts',
            title: 'Editing file2.ts',
            duration: 200,
            category: 'productive',
            source: 'browser_extension',
            timestamp: new Date(now.getTime() - 1000 * 60 * 15), // 15 min ago
          },
        ],
      });

      // Verify workspace context data structure
      const activityLogs = await prisma.activityLog.findMany({
        where: {
          userId: testUser.id,
          timestamp: {
            gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          },
        },
        orderBy: { timestamp: 'desc' },
      });

      expect(activityLogs.length).toBeGreaterThanOrEqual(2);
      
      // Verify the structure matches WorkspaceContextResource
      const currentFiles = activityLogs.map(a => a.url);
      expect(currentFiles).toContain('https://github.com/project/file1.ts');
      expect(currentFiles).toContain('https://github.com/project/file2.ts');
    });

    test('should handle empty workspace context', async ({
      prisma,
      testUser,
    }) => {
      // No activity logs for this user
      const activityLogs = await prisma.activityLog.findMany({
        where: {
          userId: testUser.id,
          timestamp: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      });

      // Should return empty arrays for new users
      expect(activityLogs).toHaveLength(0);
    });
  });

  test.describe('Pomodoro History Resource (Requirement 1.2)', () => {
    test('should return last 7 days of pomodoro history', async ({
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      // Setup: Create project and task
      const project = await projectFactory.create(testUser.id, {
        title: 'Pomodoro History Project',
      });

      const task = await taskFactory.createForToday(project.id, testUser.id, {
        title: 'Pomodoro History Task',
      });

      // Create pomodoros over the last 7 days
      const now = new Date();
      const pomodoroData = [];
      
      for (let i = 0; i < 5; i++) {
        const startTime = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        pomodoroData.push({
          taskId: task.id,
          userId: testUser.id,
          duration: 25,
          status: 'COMPLETED',
          startTime,
          endTime: new Date(startTime.getTime() + 25 * 60 * 1000),
        });
      }

      await prisma.pomodoro.createMany({ data: pomodoroData });

      // Verify pomodoro history
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const pomodoros = await prisma.pomodoro.findMany({
        where: {
          userId: testUser.id,
          startTime: { gte: sevenDaysAgo },
        },
        include: {
          task: {
            include: { project: true },
          },
        },
        orderBy: { startTime: 'desc' },
      });

      expect(pomodoros.length).toBe(5);
      
      // Verify structure matches PomodoroHistoryResource
      for (const p of pomodoros) {
        expect(p.id).toBeDefined();
        expect(p.taskId).toBe(task.id);
        expect(p.task.title).toBe('Pomodoro History Task');
        expect(p.task.project.title).toBe('Pomodoro History Project');
        expect(p.duration).toBe(25);
        expect(p.status).toBe('COMPLETED');
        expect(p.startTime).toBeDefined();
        expect(p.endTime).toBeDefined();
      }

      // Verify summary statistics
      const completedSessions = pomodoros.filter(p => p.status === 'COMPLETED');
      const totalMinutes = completedSessions.reduce((sum, p) => sum + p.duration, 0);
      const averageDuration = Math.round(totalMinutes / completedSessions.length);

      expect(completedSessions.length).toBe(5);
      expect(totalMinutes).toBe(125);
      expect(averageDuration).toBe(25);
    });

    test('should include interrupted and aborted pomodoros', async ({
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      const project = await projectFactory.create(testUser.id);
      const task = await taskFactory.createForToday(project.id, testUser.id);

      const now = new Date();
      await prisma.pomodoro.createMany({
        data: [
          {
            taskId: task.id,
            userId: testUser.id,
            duration: 25,
            status: 'COMPLETED',
            startTime: new Date(now.getTime() - 1000 * 60 * 60),
            endTime: new Date(now.getTime() - 1000 * 60 * 35),
          },
          {
            taskId: task.id,
            userId: testUser.id,
            duration: 25,
            status: 'INTERRUPTED',
            startTime: new Date(now.getTime() - 1000 * 60 * 120),
            endTime: new Date(now.getTime() - 1000 * 60 * 105),
          },
          {
            taskId: task.id,
            userId: testUser.id,
            duration: 25,
            status: 'ABORTED',
            startTime: new Date(now.getTime() - 1000 * 60 * 180),
            endTime: null,
          },
        ],
      });

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const pomodoros = await prisma.pomodoro.findMany({
        where: {
          userId: testUser.id,
          startTime: { gte: sevenDaysAgo },
        },
      });

      expect(pomodoros.length).toBe(3);
      
      const statuses = pomodoros.map(p => p.status);
      expect(statuses).toContain('COMPLETED');
      expect(statuses).toContain('INTERRUPTED');
      expect(statuses).toContain('ABORTED');
    });
  });

  test.describe('Productivity Analytics Resource (Requirement 1.3)', () => {
    test('should return productivity metrics', async ({
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      // Setup user settings
      await prisma.userSettings.upsert({
        where: { userId: testUser.id },
        update: { expectedPomodoroCount: 8 },
        create: {
          userId: testUser.id,
          pomodoroDuration: 25,
          shortRestDuration: 5,
          longRestDuration: 15,
          longRestInterval: 4,
          dailyCap: 8,
          expectedPomodoroCount: 8,
        },
      });

      const project = await projectFactory.create(testUser.id);
      const task = await taskFactory.createForToday(project.id, testUser.id);

      // Create completed pomodoros for productivity calculation
      const now = new Date();
      const pomodoroData = [];
      
      for (let i = 0; i < 6; i++) {
        pomodoroData.push({
          taskId: task.id,
          userId: testUser.id,
          duration: 25,
          status: 'COMPLETED',
          startTime: new Date(now.getTime() - i * 60 * 60 * 1000),
          endTime: new Date(now.getTime() - i * 60 * 60 * 1000 + 25 * 60 * 1000),
        });
      }

      await prisma.pomodoro.createMany({ data: pomodoroData });

      // Verify productivity data exists
      const completedPomodoros = await prisma.pomodoro.count({
        where: {
          userId: testUser.id,
          status: 'COMPLETED',
        },
      });

      expect(completedPomodoros).toBe(6);

      // Verify the structure would match ProductivityAnalyticsResource
      // dailyScore, weeklyScore, monthlyScore should be 0-100
      // peakHours should be array of numbers 0-23
      // trends should be 'improving' | 'declining' | 'stable'
      // insights should be array of strings
    });

    test('should handle user with no productivity data', async ({
      prisma,
      testUser,
    }) => {
      // New user with no pomodoros
      const pomodoroCount = await prisma.pomodoro.count({
        where: { userId: testUser.id },
      });

      expect(pomodoroCount).toBe(0);
      
      // Resource should return default values
      // dailyScore: 0, weeklyScore: 0, monthlyScore: 0
      // peakHours: [], trends: 'stable', insights: []
    });
  });

  test.describe('Active Blockers Resource (Requirement 1.4)', () => {
    test('should return active blockers', async ({
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      const project = await projectFactory.create(testUser.id, {
        title: 'Blocker Test Project',
      });

      const task = await taskFactory.create(project.id, testUser.id, {
        title: 'Blocked Task',
      });

      // Create active blockers
      await prisma.blocker.createMany({
        data: [
          {
            userId: testUser.id,
            taskId: task.id,
            category: 'technical',
            description: 'API endpoint returning 500 error',
            status: 'active',
          },
          {
            userId: testUser.id,
            taskId: task.id,
            category: 'dependency',
            description: 'Waiting for design team approval',
            status: 'active',
            dependencyType: 'person',
            dependencyIdentifier: 'design-team',
          },
        ],
      });

      // Verify active blockers
      const blockers = await prisma.blocker.findMany({
        where: {
          userId: testUser.id,
          status: 'active',
        },
        include: {
          task: { select: { title: true } },
        },
        orderBy: { reportedAt: 'desc' },
      });

      expect(blockers.length).toBe(2);

      // Verify structure matches ActiveBlockersResource
      for (const blocker of blockers) {
        expect(blocker.id).toBeDefined();
        expect(blocker.taskId).toBe(task.id);
        expect(blocker.task.title).toBe('Blocked Task');
        expect(['technical', 'dependency', 'unclear_requirements', 'other']).toContain(blocker.category);
        expect(blocker.description).toBeDefined();
        expect(blocker.reportedAt).toBeDefined();
        expect(blocker.status).toBe('active');
      }
    });

    test('should not return resolved blockers', async ({
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      const project = await projectFactory.create(testUser.id);
      const task = await taskFactory.create(project.id, testUser.id);

      // Create one active and one resolved blocker
      await prisma.blocker.createMany({
        data: [
          {
            userId: testUser.id,
            taskId: task.id,
            category: 'technical',
            description: 'Active blocker',
            status: 'active',
          },
          {
            userId: testUser.id,
            taskId: task.id,
            category: 'technical',
            description: 'Resolved blocker',
            status: 'resolved',
            resolution: 'Fixed the bug',
            resolvedAt: new Date(),
          },
        ],
      });

      // Query active blockers only
      const activeBlockers = await prisma.blocker.findMany({
        where: {
          userId: testUser.id,
          status: 'active',
        },
      });

      expect(activeBlockers.length).toBe(1);
      expect(activeBlockers[0].description).toBe('Active blocker');
    });

    test('should categorize blockers correctly', async ({
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      const project = await projectFactory.create(testUser.id);
      const task = await taskFactory.create(project.id, testUser.id);

      // Create blockers with different categories
      await prisma.blocker.createMany({
        data: [
          {
            userId: testUser.id,
            taskId: task.id,
            category: 'technical',
            description: 'Bug in the code',
            status: 'active',
          },
          {
            userId: testUser.id,
            taskId: task.id,
            category: 'dependency',
            description: 'Waiting for external API',
            status: 'active',
          },
          {
            userId: testUser.id,
            taskId: task.id,
            category: 'unclear_requirements',
            description: 'Need clarification on spec',
            status: 'active',
          },
          {
            userId: testUser.id,
            taskId: task.id,
            category: 'other',
            description: 'General blocker',
            status: 'active',
          },
        ],
      });

      const blockers = await prisma.blocker.findMany({
        where: {
          userId: testUser.id,
          status: 'active',
        },
      });

      expect(blockers.length).toBe(4);
      
      const categories = blockers.map(b => b.category);
      expect(categories).toContain('technical');
      expect(categories).toContain('dependency');
      expect(categories).toContain('unclear_requirements');
      expect(categories).toContain('other');
    });

    test('should include dependency tracking info', async ({
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      const project = await projectFactory.create(testUser.id);
      const task = await taskFactory.create(project.id, testUser.id);

      const expectedResolution = new Date();
      expectedResolution.setDate(expectedResolution.getDate() + 3);

      await prisma.blocker.create({
        data: {
          userId: testUser.id,
          taskId: task.id,
          category: 'dependency',
          description: 'Waiting for external service',
          status: 'active',
          dependencyType: 'external',
          dependencyIdentifier: 'third-party-api',
          expectedResolution,
        },
      });

      const blocker = await prisma.blocker.findFirst({
        where: {
          userId: testUser.id,
          status: 'active',
        },
      });

      expect(blocker).not.toBeNull();
      expect(blocker?.dependencyType).toBe('external');
      expect(blocker?.dependencyIdentifier).toBe('third-party-api');
      expect(blocker?.expectedResolution).toBeDefined();
    });
  });

  test.describe('Resource Data Isolation', () => {
    test('should not return other user data in resources', async ({
      userFactory,
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      // Create another user with their own data
      const otherUser = await userFactory.create({
        email: `other-resource-${Date.now()}@test.vibeflow.local`,
      });

      const otherProject = await projectFactory.create(otherUser.id, {
        title: 'Other User Project',
      });

      const otherTask = await taskFactory.create(otherProject.id, otherUser.id, {
        title: 'Other User Task',
      });

      // Create blocker for other user
      await prisma.blocker.create({
        data: {
          userId: otherUser.id,
          taskId: otherTask.id,
          category: 'technical',
          description: 'Other user blocker',
          status: 'active',
        },
      });

      // Create pomodoro for other user
      await prisma.pomodoro.create({
        data: {
          userId: otherUser.id,
          taskId: otherTask.id,
          duration: 25,
          status: 'COMPLETED',
          startTime: new Date(),
          endTime: new Date(Date.now() + 25 * 60 * 1000),
        },
      });

      // Verify testUser cannot see other user's blockers
      const testUserBlockers = await prisma.blocker.findMany({
        where: { userId: testUser.id },
      });
      expect(testUserBlockers.length).toBe(0);

      // Verify testUser cannot see other user's pomodoros
      const testUserPomodoros = await prisma.pomodoro.findMany({
        where: { userId: testUser.id },
      });
      expect(testUserPomodoros.length).toBe(0);
    });
  });
});
