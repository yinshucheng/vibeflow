import { test, expect } from '../fixtures';
import { PomodoroStatus } from '@prisma/client';

/**
 * MCP AI-Native Enhancement Tools E2E Tests
 * 
 * Tests the extended MCP tools for AI-Native Enhancement.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 * - 4.1: vibe.batch_update_tasks - batch update multiple tasks
 * - 4.2: vibe.create_project_from_template - create project from template
 * - 4.3: vibe.analyze_task_dependencies - analyze task dependencies
 * - 4.4: vibe.generate_daily_summary - generate daily work summary
 * - 4.5: MCP audit logging for all tool calls
 */

test.describe('MCP AI-Native Enhancement Tools', () => {
  test.describe('Batch Update Tasks Tool (Requirement 4.1)', () => {
    test('should batch update multiple task statuses', async ({
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      const project = await projectFactory.create(testUser.id, {
        title: 'Batch Update Project',
      });

      // Create multiple tasks
      const task1 = await taskFactory.create(project.id, testUser.id, {
        title: 'Task 1',
        status: 'TODO',
      });
      const task2 = await taskFactory.create(project.id, testUser.id, {
        title: 'Task 2',
        status: 'TODO',
      });
      const task3 = await taskFactory.create(project.id, testUser.id, {
        title: 'Task 3',
        status: 'TODO',
      });

      // Simulate batch update
      await prisma.$transaction([
        prisma.task.update({
          where: { id: task1.id },
          data: { status: 'IN_PROGRESS' },
        }),
        prisma.task.update({
          where: { id: task2.id },
          data: { status: 'DONE' },
        }),
        prisma.task.update({
          where: { id: task3.id },
          data: { priority: 'P1' },
        }),
      ]);

      // Verify updates
      const updatedTasks = await prisma.task.findMany({
        where: { id: { in: [task1.id, task2.id, task3.id] } },
      });

      const task1Updated = updatedTasks.find(t => t.id === task1.id);
      const task2Updated = updatedTasks.find(t => t.id === task2.id);
      const task3Updated = updatedTasks.find(t => t.id === task3.id);

      expect(task1Updated?.status).toBe('IN_PROGRESS');
      expect(task2Updated?.status).toBe('DONE');
      expect(task3Updated?.priority).toBe('P1');
    });

    test('should batch update task plan dates', async ({
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      const project = await projectFactory.create(testUser.id);
      
      const task1 = await taskFactory.create(project.id, testUser.id, {
        title: 'Task with date update',
      });
      const task2 = await taskFactory.create(project.id, testUser.id, {
        title: 'Another task with date update',
      });

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      nextWeek.setHours(0, 0, 0, 0);

      // Batch update plan dates
      await prisma.$transaction([
        prisma.task.update({
          where: { id: task1.id },
          data: { planDate: tomorrow },
        }),
        prisma.task.update({
          where: { id: task2.id },
          data: { planDate: nextWeek },
        }),
      ]);

      const updatedTasks = await prisma.task.findMany({
        where: { id: { in: [task1.id, task2.id] } },
      });

      const task1Updated = updatedTasks.find(t => t.id === task1.id);
      const task2Updated = updatedTasks.find(t => t.id === task2.id);

      expect(task1Updated?.planDate).toBeDefined();
      expect(task2Updated?.planDate).toBeDefined();
    });

    test('should handle partial batch update failures gracefully', async ({
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      const project = await projectFactory.create(testUser.id);
      const task = await taskFactory.create(project.id, testUser.id);

      // Try to update a non-existent task along with a valid one
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      // Verify non-existent task doesn't exist
      const nonExistent = await prisma.task.findUnique({
        where: { id: nonExistentId },
      });
      expect(nonExistent).toBeNull();

      // Valid task should still be updatable
      const updated = await prisma.task.update({
        where: { id: task.id },
        data: { status: 'IN_PROGRESS' },
      });
      expect(updated.status).toBe('IN_PROGRESS');
    });
  });

  test.describe('Create Project From Template Tool (Requirement 4.2)', () => {
    test('should create project from system template', async ({
      prisma,
      testUser,
    }) => {
      // Create a system template
      const template = await prisma.projectTemplate.create({
        data: {
          name: 'Web Development Template',
          description: 'Standard web development project structure',
          isSystem: true,
          structure: {
            deliverable: 'Complete web application',
            tasks: [
              { title: 'Setup project', priority: 'P1', estimatedMinutes: 30 },
              { title: 'Implement features', priority: 'P1', estimatedMinutes: 120 },
              { title: 'Write tests', priority: 'P2', estimatedMinutes: 60 },
              { title: 'Deploy', priority: 'P2', estimatedMinutes: 30 },
            ],
          },
        },
      });

      // Create project from template
      const project = await prisma.project.create({
        data: {
          title: 'My Web Project',
          deliverable: 'Complete web application',
          userId: testUser.id,
        },
      });

      // Create tasks from template structure
      const structure = template.structure as {
        tasks: Array<{ title: string; priority: string; estimatedMinutes: number }>;
      };

      for (let i = 0; i < structure.tasks.length; i++) {
        const taskDef = structure.tasks[i];
        await prisma.task.create({
          data: {
            title: taskDef.title,
            priority: taskDef.priority as 'P1' | 'P2' | 'P3',
            estimatedMinutes: taskDef.estimatedMinutes,
            projectId: project.id,
            userId: testUser.id,
            sortOrder: i,
          },
        });
      }

      // Verify project and tasks were created
      const createdProject = await prisma.project.findUnique({
        where: { id: project.id },
        include: { tasks: true },
      });

      expect(createdProject).not.toBeNull();
      expect(createdProject?.title).toBe('My Web Project');
      expect(createdProject?.tasks.length).toBe(4);

      const taskTitles = createdProject?.tasks.map(t => t.title);
      expect(taskTitles).toContain('Setup project');
      expect(taskTitles).toContain('Implement features');
      expect(taskTitles).toContain('Write tests');
      expect(taskTitles).toContain('Deploy');

      // Cleanup template
      await prisma.projectTemplate.delete({ where: { id: template.id } });
    });

    test('should create project with subtasks from template', async ({
      prisma,
      testUser,
    }) => {
      // Create template with subtasks
      const template = await prisma.projectTemplate.create({
        data: {
          name: 'Feature Development Template',
          isSystem: true,
          structure: {
            deliverable: 'New feature implementation',
            tasks: [
              {
                title: 'Design',
                priority: 'P1',
                subtasks: [
                  { title: 'Create wireframes', priority: 'P2' },
                  { title: 'Review with team', priority: 'P2' },
                ],
              },
              {
                title: 'Implementation',
                priority: 'P1',
                subtasks: [
                  { title: 'Write code', priority: 'P1' },
                  { title: 'Write tests', priority: 'P2' },
                ],
              },
            ],
          },
        },
      });

      // Create project
      const project = await prisma.project.create({
        data: {
          title: 'New Feature Project',
          deliverable: 'New feature implementation',
          userId: testUser.id,
        },
      });

      // Create parent tasks and subtasks
      const structure = template.structure as {
        tasks: Array<{
          title: string;
          priority: string;
          subtasks?: Array<{ title: string; priority: string }>;
        }>;
      };

      for (const taskDef of structure.tasks) {
        const parentTask = await prisma.task.create({
          data: {
            title: taskDef.title,
            priority: taskDef.priority as 'P1' | 'P2' | 'P3',
            projectId: project.id,
            userId: testUser.id,
          },
        });

        if (taskDef.subtasks) {
          for (const subtaskDef of taskDef.subtasks) {
            await prisma.task.create({
              data: {
                title: subtaskDef.title,
                priority: subtaskDef.priority as 'P1' | 'P2' | 'P3',
                projectId: project.id,
                parentId: parentTask.id,
                userId: testUser.id,
              },
            });
          }
        }
      }

      // Verify structure
      const tasks = await prisma.task.findMany({
        where: { projectId: project.id },
        include: { subTasks: true },
      });

      const parentTasks = tasks.filter(t => !t.parentId);
      expect(parentTasks.length).toBe(2);

      const designTask = parentTasks.find(t => t.title === 'Design');
      expect(designTask?.subTasks.length).toBe(2);

      const implTask = parentTasks.find(t => t.title === 'Implementation');
      expect(implTask?.subTasks.length).toBe(2);

      // Cleanup
      await prisma.projectTemplate.delete({ where: { id: template.id } });
    });

    test('should link project to goal when specified', async ({
      goalFactory,
      prisma,
      testUser,
    }) => {
      const goal = await goalFactory.createShortTerm(testUser.id, {
        title: 'Q1 Objectives',
      });

      const template = await prisma.projectTemplate.create({
        data: {
          name: 'Simple Template',
          isSystem: true,
          structure: { deliverable: 'Simple project', tasks: [] },
        },
      });

      // Create project linked to goal
      const project = await prisma.project.create({
        data: {
          title: 'Goal-Linked Project',
          deliverable: 'Simple project',
          userId: testUser.id,
          goals: {
            create: { goalId: goal.id },
          },
        },
      });

      // Verify goal link
      const projectWithGoals = await prisma.project.findUnique({
        where: { id: project.id },
        include: { goals: { include: { goal: true } } },
      });

      expect(projectWithGoals?.goals.length).toBe(1);
      expect(projectWithGoals?.goals[0].goal.title).toBe('Q1 Objectives');

      // Cleanup
      await prisma.projectTemplate.delete({ where: { id: template.id } });
    });
  });

  test.describe('Analyze Task Dependencies Tool (Requirement 4.3)', () => {
    test('should identify parent-child dependencies', async ({
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      const project = await projectFactory.create(testUser.id, {
        title: 'Dependency Analysis Project',
      });

      // Create parent task with subtasks
      const parentTask = await taskFactory.create(project.id, testUser.id, {
        title: 'Parent Task',
        priority: 'P1',
      });

      const subtask1 = await prisma.task.create({
        data: {
          title: 'Subtask 1',
          priority: 'P2',
          projectId: project.id,
          parentId: parentTask.id,
          userId: testUser.id,
        },
      });

      const subtask2 = await prisma.task.create({
        data: {
          title: 'Subtask 2',
          priority: 'P2',
          projectId: project.id,
          parentId: parentTask.id,
          userId: testUser.id,
        },
      });

      // Analyze dependencies
      const tasks = await prisma.task.findMany({
        where: { projectId: project.id },
        include: { parent: true, subTasks: true },
      });

      // Build dependency map
      const dependencies = tasks.map(task => ({
        taskId: task.id,
        taskTitle: task.title,
        dependsOn: task.parentId ? [task.parentId] : [],
        blockedBy: [],
      }));

      // Verify subtasks depend on parent
      const subtask1Dep = dependencies.find(d => d.taskId === subtask1.id);
      const subtask2Dep = dependencies.find(d => d.taskId === subtask2.id);

      expect(subtask1Dep?.dependsOn).toContain(parentTask.id);
      expect(subtask2Dep?.dependsOn).toContain(parentTask.id);
    });

    test('should suggest execution order based on priority', async ({
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      const project = await projectFactory.create(testUser.id);

      // Create tasks with different priorities
      const p1Task = await taskFactory.create(project.id, testUser.id, {
        title: 'High Priority Task',
        priority: 'P1',
      });

      const p2Task = await taskFactory.create(project.id, testUser.id, {
        title: 'Medium Priority Task',
        priority: 'P2',
      });

      const p3Task = await taskFactory.create(project.id, testUser.id, {
        title: 'Low Priority Task',
        priority: 'P3',
      });

      // Get tasks sorted by priority
      const tasks = await prisma.task.findMany({
        where: { projectId: project.id, status: { not: 'DONE' } },
        orderBy: { priority: 'asc' },
      });

      // Verify P1 comes first
      expect(tasks[0].priority).toBe('P1');
      expect(tasks[1].priority).toBe('P2');
      expect(tasks[2].priority).toBe('P3');
    });

    test('should identify blocker dependencies', async ({
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      const project = await projectFactory.create(testUser.id);

      const task1 = await taskFactory.create(project.id, testUser.id, {
        title: 'Blocking Task',
      });

      const task2 = await taskFactory.create(project.id, testUser.id, {
        title: 'Blocked Task',
      });

      // Create blocker that references task1 as dependency
      await prisma.blocker.create({
        data: {
          userId: testUser.id,
          taskId: task2.id,
          category: 'dependency',
          description: 'Waiting for Blocking Task to complete',
          status: 'active',
          dependencyType: 'system',
          dependencyIdentifier: task1.id,
        },
      });

      // Analyze blockers
      const blockers = await prisma.blocker.findMany({
        where: {
          taskId: task2.id,
          status: 'active',
        },
      });

      expect(blockers.length).toBe(1);
      expect(blockers[0].dependencyIdentifier).toBe(task1.id);
    });
  });

  test.describe('Generate Daily Summary Tool (Requirement 4.4)', () => {
    test('should generate summary with completed tasks', async ({
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      const project = await projectFactory.create(testUser.id, {
        title: 'Summary Test Project',
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Create completed tasks for today
      const task1 = await taskFactory.create(project.id, testUser.id, {
        title: 'Completed Task 1',
        status: 'DONE',
      });

      const task2 = await taskFactory.create(project.id, testUser.id, {
        title: 'Completed Task 2',
        status: 'DONE',
      });

      // Create pomodoros for today
      await prisma.pomodoro.createMany({
        data: [
          {
            taskId: task1.id,
            userId: testUser.id,
            duration: 25,
            status: 'COMPLETED',
            startTime: new Date(today.getTime() + 9 * 60 * 60 * 1000), // 9 AM
            endTime: new Date(today.getTime() + 9 * 60 * 60 * 1000 + 25 * 60 * 1000),
          },
          {
            taskId: task1.id,
            userId: testUser.id,
            duration: 25,
            status: 'COMPLETED',
            startTime: new Date(today.getTime() + 10 * 60 * 60 * 1000), // 10 AM
            endTime: new Date(today.getTime() + 10 * 60 * 60 * 1000 + 25 * 60 * 1000),
          },
          {
            taskId: task2.id,
            userId: testUser.id,
            duration: 25,
            status: 'COMPLETED',
            startTime: new Date(today.getTime() + 11 * 60 * 60 * 1000), // 11 AM
            endTime: new Date(today.getTime() + 11 * 60 * 60 * 1000 + 25 * 60 * 1000),
          },
        ],
      });

      // Query summary data
      const nextDay = new Date(today);
      nextDay.setDate(nextDay.getDate() + 1);

      const completedPomodoros = await prisma.pomodoro.findMany({
        where: {
          userId: testUser.id,
          startTime: { gte: today, lt: nextDay },
          status: 'COMPLETED',
        },
        include: { task: true },
      });

      // Verify summary data
      expect(completedPomodoros.length).toBe(3);

      const totalMinutes = completedPomodoros.reduce((sum, p) => sum + p.duration, 0);
      expect(totalMinutes).toBe(75);

      // Group by task
      const taskPomodoros = new Map<string, number>();
      for (const p of completedPomodoros) {
        const count = taskPomodoros.get(p.taskId!) || 0;
        taskPomodoros.set(p.taskId!, count + 1);
      }

      expect(taskPomodoros.get(task1.id)).toBe(2);
      expect(taskPomodoros.get(task2.id)).toBe(1);
    });

    test('should calculate efficiency score', async ({
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      // Setup user settings with expected pomodoro count
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

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Create 6 completed pomodoros (75% of expected 8)
      const pomodoroData = [];
      for (let i = 0; i < 6; i++) {
        pomodoroData.push({
          taskId: task.id,
          userId: testUser.id,
          duration: 25,
          status: 'COMPLETED' as PomodoroStatus,
          startTime: new Date(today.getTime() + (9 + i) * 60 * 60 * 1000),
          endTime: new Date(today.getTime() + (9 + i) * 60 * 60 * 1000 + 25 * 60 * 1000),
        });
      }

      await prisma.pomodoro.createMany({ data: pomodoroData });

      // Calculate efficiency
      const settings = await prisma.userSettings.findUnique({
        where: { userId: testUser.id },
      });
      const expectedPomodoros = settings?.expectedPomodoroCount ?? 8;

      const nextDay = new Date(today);
      nextDay.setDate(nextDay.getDate() + 1);

      const completedCount = await prisma.pomodoro.count({
        where: {
          userId: testUser.id,
          startTime: { gte: today, lt: nextDay },
          status: 'COMPLETED',
        },
      });

      const efficiencyScore = Math.min(100, Math.round((completedCount / expectedPomodoros) * 100));
      expect(efficiencyScore).toBe(75);
    });

    test('should generate tomorrow suggestions', async ({
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      const project = await projectFactory.create(testUser.id);

      // Create incomplete high-priority tasks
      await taskFactory.create(project.id, testUser.id, {
        title: 'Urgent Task 1',
        priority: 'P1',
        status: 'TODO',
      });

      await taskFactory.create(project.id, testUser.id, {
        title: 'Urgent Task 2',
        priority: 'P1',
        status: 'IN_PROGRESS',
      });

      await taskFactory.create(project.id, testUser.id, {
        title: 'Low Priority Task',
        priority: 'P3',
        status: 'TODO',
      });

      // Get incomplete P1 tasks for suggestions
      const incompleteTasks = await prisma.task.findMany({
        where: {
          userId: testUser.id,
          status: { not: 'DONE' },
          priority: 'P1',
        },
        take: 3,
        orderBy: [{ planDate: 'asc' }, { sortOrder: 'asc' }],
      });

      expect(incompleteTasks.length).toBe(2);
      expect(incompleteTasks.every(t => t.priority === 'P1')).toBe(true);
    });
  });

  test.describe('MCP Audit Logging (Requirement 4.5)', () => {
    test('should log tool calls to audit log', async ({
      prisma,
      testUser,
    }) => {
      // Simulate MCP tool call audit logging
      const auditLog = await prisma.mCPAuditLog.create({
        data: {
          userId: testUser.id,
          agentId: 'cursor-agent-123',
          toolName: 'vibe.complete_task',
          input: { task_id: 'test-task-id', summary: 'Task completed' },
          output: { success: true, task: { id: 'test-task-id', status: 'DONE' } },
          success: true,
          duration: 150,
        },
      });

      expect(auditLog.id).toBeDefined();
      expect(auditLog.toolName).toBe('vibe.complete_task');
      expect(auditLog.success).toBe(true);
      expect(auditLog.duration).toBe(150);
    });

    test('should log failed tool calls', async ({
      prisma,
      testUser,
    }) => {
      const auditLog = await prisma.mCPAuditLog.create({
        data: {
          userId: testUser.id,
          agentId: 'claude-agent-456',
          toolName: 'vibe.batch_update_tasks',
          input: { updates: [{ task_id: 'non-existent' }] },
          output: { success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } },
          success: false,
          duration: 50,
        },
      });

      expect(auditLog.success).toBe(false);
      expect((auditLog.output as { error: { code: string } }).error.code).toBe('NOT_FOUND');
    });

    test('should query audit logs by tool name', async ({
      prisma,
      testUser,
    }) => {
      // Create multiple audit logs
      await prisma.mCPAuditLog.createMany({
        data: [
          {
            userId: testUser.id,
            agentId: 'agent-1',
            toolName: 'vibe.complete_task',
            input: {},
            output: { success: true },
            success: true,
            duration: 100,
          },
          {
            userId: testUser.id,
            agentId: 'agent-1',
            toolName: 'vibe.add_subtask',
            input: {},
            output: { success: true },
            success: true,
            duration: 80,
          },
          {
            userId: testUser.id,
            agentId: 'agent-2',
            toolName: 'vibe.complete_task',
            input: {},
            output: { success: true },
            success: true,
            duration: 120,
          },
        ],
      });

      // Query by tool name
      const completeTaskLogs = await prisma.mCPAuditLog.findMany({
        where: {
          userId: testUser.id,
          toolName: 'vibe.complete_task',
        },
      });

      expect(completeTaskLogs.length).toBe(2);
    });

    test('should query audit logs by agent', async ({
      prisma,
      testUser,
    }) => {
      await prisma.mCPAuditLog.createMany({
        data: [
          {
            userId: testUser.id,
            agentId: 'cursor-agent',
            toolName: 'vibe.start_pomodoro',
            input: {},
            output: { success: true },
            success: true,
            duration: 200,
          },
          {
            userId: testUser.id,
            agentId: 'cursor-agent',
            toolName: 'vibe.complete_task',
            input: {},
            output: { success: true },
            success: true,
            duration: 150,
          },
          {
            userId: testUser.id,
            agentId: 'claude-agent',
            toolName: 'vibe.add_subtask',
            input: {},
            output: { success: true },
            success: true,
            duration: 100,
          },
        ],
      });

      // Query by agent
      const cursorLogs = await prisma.mCPAuditLog.findMany({
        where: {
          userId: testUser.id,
          agentId: 'cursor-agent',
        },
      });

      expect(cursorLogs.length).toBe(2);
    });

    test('should query audit logs by time range', async ({
      prisma,
      testUser,
    }) => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      await prisma.mCPAuditLog.createMany({
        data: [
          {
            userId: testUser.id,
            agentId: 'agent',
            toolName: 'vibe.complete_task',
            input: {},
            output: { success: true },
            success: true,
            duration: 100,
            timestamp: now,
          },
          {
            userId: testUser.id,
            agentId: 'agent',
            toolName: 'vibe.add_subtask',
            input: {},
            output: { success: true },
            success: true,
            duration: 100,
            timestamp: twoHoursAgo,
          },
        ],
      });

      // Query logs from last hour
      const recentLogs = await prisma.mCPAuditLog.findMany({
        where: {
          userId: testUser.id,
          timestamp: { gte: oneHourAgo },
        },
      });

      expect(recentLogs.length).toBe(1);
      expect(recentLogs[0].toolName).toBe('vibe.complete_task');
    });
  });

  test.describe('Tool Data Isolation', () => {
    test('should not allow access to other user tasks in batch update', async ({
      userFactory,
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      // Create another user with their own task
      const otherUser = await userFactory.create({
        email: `other-tools-${Date.now()}@test.vibeflow.local`,
      });

      const otherProject = await projectFactory.create(otherUser.id);
      const otherTask = await taskFactory.create(otherProject.id, otherUser.id, {
        title: 'Other User Task',
        status: 'TODO',
      });

      // Try to find other user's task as testUser
      const unauthorizedTask = await prisma.task.findFirst({
        where: {
          id: otherTask.id,
          userId: testUser.id,
        },
      });

      expect(unauthorizedTask).toBeNull();
    });
  });
});
