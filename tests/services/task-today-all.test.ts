import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { taskService } from '../../src/services/task.service';
import { prisma } from '../../src/lib/prisma';

describe('taskService.getTodayTasks — includeDone parameter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-16T10:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const userId = 'user-1';

  const todayTaskTodo = {
    id: 'task-1',
    userId,
    title: 'Active task',
    status: 'TODO',
    priority: 'P1',
    planDate: new Date('2026-03-16T00:00:00'),
    project: { id: 'proj-1', title: 'Project 1' },
    subTasks: [],
  };

  const todayTaskDone = {
    id: 'task-2',
    userId,
    title: 'Completed task',
    status: 'DONE',
    priority: 'P2',
    planDate: new Date('2026-03-16T00:00:00'),
    project: { id: 'proj-1', title: 'Project 1' },
    subTasks: [],
  };

  it('should exclude DONE tasks by default (includeDone = false)', async () => {
    vi.spyOn(prisma.task, 'findMany').mockResolvedValue([todayTaskTodo] as any);

    const result = await taskService.getTodayTasks(userId);

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data![0].id).toBe('task-1');

    const callArgs = vi.mocked(prisma.task.findMany).mock.calls[0][0];
    expect(callArgs?.where).toHaveProperty('status', { not: 'DONE' });
  });

  it('should include DONE tasks when includeDone = true', async () => {
    vi.spyOn(prisma.task, 'findMany').mockResolvedValue([todayTaskTodo, todayTaskDone] as any);

    const result = await taskService.getTodayTasks(userId, true);

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.data!.map(t => t.status)).toContain('DONE');

    const callArgs = vi.mocked(prisma.task.findMany).mock.calls[0][0];
    expect(callArgs?.where).not.toHaveProperty('status');
  });

  it('should use correct date range for today', async () => {
    vi.spyOn(prisma.task, 'findMany').mockResolvedValue([]);

    await taskService.getTodayTasks(userId);

    const callArgs = vi.mocked(prisma.task.findMany).mock.calls[0][0];
    const today = new Date('2026-03-16T00:00:00');
    const tomorrow = new Date('2026-03-17T00:00:00');
    expect(callArgs?.where?.planDate).toEqual({ gte: today, lt: tomorrow });
  });

  it('should include project and subTasks relations', async () => {
    vi.spyOn(prisma.task, 'findMany').mockResolvedValue([]);

    await taskService.getTodayTasks(userId, true);

    const callArgs = vi.mocked(prisma.task.findMany).mock.calls[0][0];
    expect(callArgs?.include).toEqual({ project: true, subTasks: true });
  });

  it('should handle errors gracefully', async () => {
    vi.spyOn(prisma.task, 'findMany').mockRejectedValue(new Error('DB connection failed'));

    const result = await taskService.getTodayTasks(userId, true);

    expect(result.success).toBe(false);
    expect(result.error!.code).toBe('INTERNAL_ERROR');
    expect(result.error!.message).toBe('DB connection failed');
  });
});
