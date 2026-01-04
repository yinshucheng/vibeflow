import { test, expect } from '../fixtures';

/**
 * MCP AI-Native Enhancement Event Subscription E2E Tests
 * 
 * Tests the MCP event subscription system for AI-Native Enhancement.
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.5
 * - 10.1: Event subscription for task status changes
 * - 10.2: Event subscription for Pomodoro lifecycle events
 * - 10.3: Event subscription for daily state transitions
 * - 10.5: Event history for the last 24 hours
 */

test.describe('MCP AI-Native Enhancement Event Subscription', () => {
  test.describe('Event Subscription (Requirements 10.1, 10.2, 10.3)', () => {
    test('should create event subscription for task events', async ({
      prisma,
      testUser,
    }) => {
      // Create subscription for task events
      const subscription = await prisma.mCPSubscription.create({
        data: {
          agentId: 'cursor-agent-123',
          userId: testUser.id,
          eventTypes: ['task.status_changed', 'task.created', 'task.updated', 'task.deleted'],
        },
      });

      expect(subscription.id).toBeDefined();
      expect(subscription.agentId).toBe('cursor-agent-123');
      expect(subscription.userId).toBe(testUser.id);
      expect(subscription.eventTypes).toContain('task.status_changed');
      expect(subscription.eventTypes).toContain('task.created');
      expect(subscription.eventTypes).toContain('task.updated');
      expect(subscription.eventTypes).toContain('task.deleted');
    });

    test('should create event subscription for pomodoro events', async ({
      prisma,
      testUser,
    }) => {
      // Create subscription for pomodoro lifecycle events
      const subscription = await prisma.mCPSubscription.create({
        data: {
          agentId: 'claude-agent-456',
          userId: testUser.id,
          eventTypes: ['pomodoro.started', 'pomodoro.paused', 'pomodoro.completed', 'pomodoro.aborted'],
        },
      });

      expect(subscription.eventTypes).toContain('pomodoro.started');
      expect(subscription.eventTypes).toContain('pomodoro.paused');
      expect(subscription.eventTypes).toContain('pomodoro.completed');
      expect(subscription.eventTypes).toContain('pomodoro.aborted');
    });

    test('should create event subscription for daily state events', async ({
      prisma,
      testUser,
    }) => {
      // Create subscription for daily state transitions
      const subscription = await prisma.mCPSubscription.create({
        data: {
          agentId: 'workflow-agent-789',
          userId: testUser.id,
          eventTypes: ['daily_state.changed'],
        },
      });

      expect(subscription.eventTypes).toContain('daily_state.changed');
    });

    test('should create subscription for blocker events', async ({
      prisma,
      testUser,
    }) => {
      const subscription = await prisma.mCPSubscription.create({
        data: {
          agentId: 'blocker-monitor-agent',
          userId: testUser.id,
          eventTypes: ['blocker.reported', 'blocker.resolved'],
        },
      });

      expect(subscription.eventTypes).toContain('blocker.reported');
      expect(subscription.eventTypes).toContain('blocker.resolved');
    });

    test('should create subscription for multiple event types', async ({
      prisma,
      testUser,
    }) => {
      // Create comprehensive subscription
      const subscription = await prisma.mCPSubscription.create({
        data: {
          agentId: 'comprehensive-agent',
          userId: testUser.id,
          eventTypes: [
            'task.status_changed',
            'task.created',
            'pomodoro.started',
            'pomodoro.completed',
            'daily_state.changed',
            'blocker.reported',
          ],
        },
      });

      expect(subscription.eventTypes.length).toBe(6);
    });

    test('should update existing subscription', async ({
      prisma,
      testUser,
    }) => {
      // Create initial subscription
      const subscription = await prisma.mCPSubscription.create({
        data: {
          agentId: 'updatable-agent',
          userId: testUser.id,
          eventTypes: ['task.created'],
        },
      });

      // Update subscription with more event types
      const updated = await prisma.mCPSubscription.update({
        where: { id: subscription.id },
        data: {
          eventTypes: ['task.created', 'task.updated', 'task.deleted'],
        },
      });

      expect(updated.eventTypes.length).toBe(3);
      expect(updated.eventTypes).toContain('task.updated');
      expect(updated.eventTypes).toContain('task.deleted');
    });

    test('should delete subscription', async ({
      prisma,
      testUser,
    }) => {
      const subscription = await prisma.mCPSubscription.create({
        data: {
          agentId: 'deletable-agent',
          userId: testUser.id,
          eventTypes: ['task.created'],
        },
      });

      await prisma.mCPSubscription.delete({
        where: { id: subscription.id },
      });

      const deleted = await prisma.mCPSubscription.findUnique({
        where: { id: subscription.id },
      });

      expect(deleted).toBeNull();
    });

    test('should enforce unique agent-user subscription', async ({
      prisma,
      testUser,
    }) => {
      // Create first subscription
      await prisma.mCPSubscription.create({
        data: {
          agentId: 'unique-agent',
          userId: testUser.id,
          eventTypes: ['task.created'],
        },
      });

      // Upsert should update existing subscription
      const upserted = await prisma.mCPSubscription.upsert({
        where: {
          agentId_userId: {
            agentId: 'unique-agent',
            userId: testUser.id,
          },
        },
        update: {
          eventTypes: ['task.created', 'task.updated'],
        },
        create: {
          agentId: 'unique-agent',
          userId: testUser.id,
          eventTypes: ['task.created', 'task.updated'],
        },
      });

      expect(upserted.eventTypes.length).toBe(2);

      // Verify only one subscription exists
      const subscriptions = await prisma.mCPSubscription.findMany({
        where: {
          agentId: 'unique-agent',
          userId: testUser.id,
        },
      });

      expect(subscriptions.length).toBe(1);
    });
  });

  test.describe('Event Publishing and Storage', () => {
    test('should store task status change event', async ({
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      const project = await projectFactory.create(testUser.id);
      const task = await taskFactory.create(project.id, testUser.id, {
        title: 'Event Test Task',
        status: 'TODO',
      });

      // Simulate task status change event
      const event = await prisma.mCPEvent.create({
        data: {
          userId: testUser.id,
          type: 'task.status_changed',
          payload: {
            taskId: task.id,
            taskTitle: task.title,
            previousStatus: 'TODO',
            newStatus: 'IN_PROGRESS',
          },
        },
      });

      expect(event.id).toBeDefined();
      expect(event.type).toBe('task.status_changed');
      expect((event.payload as { taskId: string }).taskId).toBe(task.id);
      expect((event.payload as { newStatus: string }).newStatus).toBe('IN_PROGRESS');
    });

    test('should store pomodoro lifecycle events', async ({
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      const project = await projectFactory.create(testUser.id);
      const task = await taskFactory.createForToday(project.id, testUser.id);

      // Create pomodoro
      const pomodoro = await prisma.pomodoro.create({
        data: {
          taskId: task.id,
          userId: testUser.id,
          duration: 25,
          status: 'IN_PROGRESS',
        },
      });

      // Store pomodoro.started event
      const startEvent = await prisma.mCPEvent.create({
        data: {
          userId: testUser.id,
          type: 'pomodoro.started',
          payload: {
            pomodoroId: pomodoro.id,
            taskId: task.id,
            duration: 25,
          },
        },
      });

      expect(startEvent.type).toBe('pomodoro.started');

      // Store pomodoro.completed event
      const completeEvent = await prisma.mCPEvent.create({
        data: {
          userId: testUser.id,
          type: 'pomodoro.completed',
          payload: {
            pomodoroId: pomodoro.id,
            taskId: task.id,
            duration: 25,
            actualDuration: 25,
          },
        },
      });

      expect(completeEvent.type).toBe('pomodoro.completed');
    });

    test('should store daily state change event', async ({
      prisma,
      testUser,
    }) => {
      const event = await prisma.mCPEvent.create({
        data: {
          userId: testUser.id,
          type: 'daily_state.changed',
          payload: {
            previousState: 'PLANNING',
            newState: 'FOCUS',
            timestamp: new Date().toISOString(),
          },
        },
      });

      expect(event.type).toBe('daily_state.changed');
      expect((event.payload as { newState: string }).newState).toBe('FOCUS');
    });

    test('should store blocker events', async ({
      projectFactory,
      taskFactory,
      prisma,
      testUser,
    }) => {
      const project = await projectFactory.create(testUser.id);
      const task = await taskFactory.create(project.id, testUser.id);

      // Store blocker.reported event
      const reportedEvent = await prisma.mCPEvent.create({
        data: {
          userId: testUser.id,
          type: 'blocker.reported',
          payload: {
            taskId: task.id,
            category: 'technical',
            description: 'API error',
          },
        },
      });

      expect(reportedEvent.type).toBe('blocker.reported');

      // Store blocker.resolved event
      const resolvedEvent = await prisma.mCPEvent.create({
        data: {
          userId: testUser.id,
          type: 'blocker.resolved',
          payload: {
            taskId: task.id,
            resolution: 'Fixed the API endpoint',
          },
        },
      });

      expect(resolvedEvent.type).toBe('blocker.resolved');
    });
  });

  test.describe('Event History (Requirement 10.5)', () => {
    test('should retrieve event history for last 24 hours', async ({
      prisma,
      testUser,
    }) => {
      const now = new Date();
      const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
      const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000);

      // Create events at different times
      await prisma.mCPEvent.createMany({
        data: [
          {
            userId: testUser.id,
            type: 'task.created',
            payload: { taskId: 'task-1' },
            timestamp: now,
          },
          {
            userId: testUser.id,
            type: 'task.updated',
            payload: { taskId: 'task-2' },
            timestamp: twelveHoursAgo,
          },
          {
            userId: testUser.id,
            type: 'task.deleted',
            payload: { taskId: 'task-3' },
            timestamp: twentyFiveHoursAgo, // Outside 24-hour window
          },
        ],
      });

      // Query events from last 24 hours
      const cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const recentEvents = await prisma.mCPEvent.findMany({
        where: {
          userId: testUser.id,
          timestamp: { gte: cutoffTime },
        },
        orderBy: { timestamp: 'desc' },
      });

      // Should only include events from last 24 hours
      expect(recentEvents.length).toBe(2);
      expect(recentEvents.map(e => e.type)).toContain('task.created');
      expect(recentEvents.map(e => e.type)).toContain('task.updated');
      expect(recentEvents.map(e => e.type)).not.toContain('task.deleted');
    });

    test('should filter event history by event type', async ({
      prisma,
      testUser,
    }) => {
      const now = new Date();

      await prisma.mCPEvent.createMany({
        data: [
          {
            userId: testUser.id,
            type: 'task.created',
            payload: { taskId: 'task-1' },
            timestamp: now,
          },
          {
            userId: testUser.id,
            type: 'pomodoro.started',
            payload: { pomodoroId: 'pom-1' },
            timestamp: now,
          },
          {
            userId: testUser.id,
            type: 'task.updated',
            payload: { taskId: 'task-2' },
            timestamp: now,
          },
          {
            userId: testUser.id,
            type: 'pomodoro.completed',
            payload: { pomodoroId: 'pom-1' },
            timestamp: now,
          },
        ],
      });

      // Filter by task events only
      const taskEvents = await prisma.mCPEvent.findMany({
        where: {
          userId: testUser.id,
          type: { in: ['task.created', 'task.updated', 'task.deleted'] },
        },
      });

      expect(taskEvents.length).toBe(2);
      expect(taskEvents.every(e => e.type.startsWith('task.'))).toBe(true);

      // Filter by pomodoro events only
      const pomodoroEvents = await prisma.mCPEvent.findMany({
        where: {
          userId: testUser.id,
          type: { in: ['pomodoro.started', 'pomodoro.completed'] },
        },
      });

      expect(pomodoroEvents.length).toBe(2);
      expect(pomodoroEvents.every(e => e.type.startsWith('pomodoro.'))).toBe(true);
    });

    test('should limit event history results', async ({
      prisma,
      testUser,
    }) => {
      const now = new Date();

      // Create many events
      const eventData = [];
      for (let i = 0; i < 20; i++) {
        eventData.push({
          userId: testUser.id,
          type: 'task.updated',
          payload: { taskId: `task-${i}` },
          timestamp: new Date(now.getTime() - i * 60 * 1000), // 1 minute apart
        });
      }

      await prisma.mCPEvent.createMany({ data: eventData });

      // Query with limit
      const limitedEvents = await prisma.mCPEvent.findMany({
        where: { userId: testUser.id },
        orderBy: { timestamp: 'desc' },
        take: 10,
      });

      expect(limitedEvents.length).toBe(10);
    });

    test('should order event history by timestamp descending', async ({
      prisma,
      testUser,
    }) => {
      const now = new Date();

      await prisma.mCPEvent.createMany({
        data: [
          {
            userId: testUser.id,
            type: 'task.created',
            payload: { order: 3 },
            timestamp: new Date(now.getTime() - 3 * 60 * 60 * 1000),
          },
          {
            userId: testUser.id,
            type: 'task.updated',
            payload: { order: 1 },
            timestamp: new Date(now.getTime() - 1 * 60 * 60 * 1000),
          },
          {
            userId: testUser.id,
            type: 'task.deleted',
            payload: { order: 2 },
            timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000),
          },
        ],
      });

      const events = await prisma.mCPEvent.findMany({
        where: { userId: testUser.id },
        orderBy: { timestamp: 'desc' },
      });

      // Most recent first
      expect((events[0].payload as { order: number }).order).toBe(1);
      expect((events[1].payload as { order: number }).order).toBe(2);
      expect((events[2].payload as { order: number }).order).toBe(3);
    });

    test('should query events since specific timestamp', async ({
      prisma,
      testUser,
    }) => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

      await prisma.mCPEvent.createMany({
        data: [
          {
            userId: testUser.id,
            type: 'task.created',
            payload: { taskId: 'recent' },
            timestamp: now,
          },
          {
            userId: testUser.id,
            type: 'task.updated',
            payload: { taskId: 'medium' },
            timestamp: new Date(now.getTime() - 3 * 60 * 60 * 1000),
          },
          {
            userId: testUser.id,
            type: 'task.deleted',
            payload: { taskId: 'old' },
            timestamp: new Date(now.getTime() - 5 * 60 * 60 * 1000),
          },
        ],
      });

      // Query events since 2 hours ago
      const recentEvents = await prisma.mCPEvent.findMany({
        where: {
          userId: testUser.id,
          timestamp: { gte: twoHoursAgo },
        },
      });

      expect(recentEvents.length).toBe(1);
      expect((recentEvents[0].payload as { taskId: string }).taskId).toBe('recent');

      // Query events since 4 hours ago
      const moreEvents = await prisma.mCPEvent.findMany({
        where: {
          userId: testUser.id,
          timestamp: { gte: fourHoursAgo },
        },
      });

      expect(moreEvents.length).toBe(2);
    });
  });

  test.describe('Event Data Isolation', () => {
    test('should not return other user events in history', async ({
      userFactory,
      prisma,
      testUser,
    }) => {
      // Create another user
      const otherUser = await userFactory.create({
        email: `other-events-${Date.now()}@test.vibeflow.local`,
      });

      // Create events for both users
      await prisma.mCPEvent.createMany({
        data: [
          {
            userId: testUser.id,
            type: 'task.created',
            payload: { owner: 'testUser' },
          },
          {
            userId: otherUser.id,
            type: 'task.created',
            payload: { owner: 'otherUser' },
          },
        ],
      });

      // Query testUser's events
      const testUserEvents = await prisma.mCPEvent.findMany({
        where: { userId: testUser.id },
      });

      expect(testUserEvents.length).toBe(1);
      expect((testUserEvents[0].payload as { owner: string }).owner).toBe('testUser');
    });

    test('should not return other user subscriptions', async ({
      userFactory,
      prisma,
      testUser,
    }) => {
      const otherUser = await userFactory.create({
        email: `other-subs-${Date.now()}@test.vibeflow.local`,
      });

      // Create subscriptions for both users
      await prisma.mCPSubscription.createMany({
        data: [
          {
            agentId: 'shared-agent',
            userId: testUser.id,
            eventTypes: ['task.created'],
          },
          {
            agentId: 'shared-agent',
            userId: otherUser.id,
            eventTypes: ['task.created'],
          },
        ],
      });

      // Query testUser's subscriptions
      const testUserSubs = await prisma.mCPSubscription.findMany({
        where: { userId: testUser.id },
      });

      expect(testUserSubs.length).toBe(1);
      expect(testUserSubs[0].userId).toBe(testUser.id);
    });
  });

  test.describe('Subscription Matching', () => {
    test('should find subscriptions matching event type', async ({
      prisma,
      testUser,
    }) => {
      // Create subscriptions with different event types
      await prisma.mCPSubscription.createMany({
        data: [
          {
            agentId: 'task-agent',
            userId: testUser.id,
            eventTypes: ['task.created', 'task.updated'],
          },
          {
            agentId: 'pomodoro-agent',
            userId: testUser.id,
            eventTypes: ['pomodoro.started', 'pomodoro.completed'],
          },
          {
            agentId: 'all-agent',
            userId: testUser.id,
            eventTypes: ['task.created', 'pomodoro.started'],
          },
        ],
      });

      // Find subscriptions for task.created event
      const taskCreatedSubs = await prisma.mCPSubscription.findMany({
        where: {
          userId: testUser.id,
          eventTypes: { has: 'task.created' },
        },
      });

      expect(taskCreatedSubs.length).toBe(2);
      expect(taskCreatedSubs.map(s => s.agentId)).toContain('task-agent');
      expect(taskCreatedSubs.map(s => s.agentId)).toContain('all-agent');

      // Find subscriptions for pomodoro.started event
      const pomodoroStartedSubs = await prisma.mCPSubscription.findMany({
        where: {
          userId: testUser.id,
          eventTypes: { has: 'pomodoro.started' },
        },
      });

      expect(pomodoroStartedSubs.length).toBe(2);
      expect(pomodoroStartedSubs.map(s => s.agentId)).toContain('pomodoro-agent');
      expect(pomodoroStartedSubs.map(s => s.agentId)).toContain('all-agent');
    });
  });
});
