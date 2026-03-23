import { PrismaClient, Task, TaskStatus, Priority } from '@prisma/client';
import { TestDataTracker } from '../database.fixture';

/**
 * Task factory for E2E tests
 * Creates test tasks with hierarchical support
 * 
 * Requirements: 2.2
 * - Provides factory function for Task entity
 * - Implements create() and cleanup() methods
 */

export interface CreateTaskInput {
  title?: string;
  status?: TaskStatus;
  priority?: Priority;
  planDate?: Date | null;
  sortOrder?: number;
  parentId?: string | null;
}

export class TaskFactory {
  private prisma: PrismaClient;
  private tracker: TestDataTracker;
  private createdTaskIds: string[] = [];

  constructor(prisma: PrismaClient, tracker: TestDataTracker) {
    this.prisma = prisma;
    this.tracker = tracker;
  }

  /**
   * Generate a unique task title
   */
  private generateTitle(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 6);
    return `Test Task ${timestamp}-${random}`;
  }

  /**
   * Create a test task for a project
   */
  async create(projectId: string, userId: string, input: CreateTaskInput = {}): Promise<Task> {
    const title = input.title || this.generateTitle();

    const task = await this.prisma.task.create({
      data: {
        title,
        status: input.status || 'TODO',
        priority: input.priority || 'P2',
        planDate: input.planDate,
        sortOrder: input.sortOrder ?? 0,
        parentId: input.parentId,
        projectId,
        userId,
      },
    });

    this.createdTaskIds.push(task.id);
    this.tracker.trackTask(task.id);

    return task;
  }

  /**
   * Create multiple tasks for a project
   */
  async createMany(
    projectId: string,
    userId: string,
    count: number,
    input: CreateTaskInput = {}
  ): Promise<Task[]> {
    const tasks: Task[] = [];
    for (let i = 0; i < count; i++) {
      const task = await this.create(projectId, userId, {
        ...input,
        title: input.title ? `${input.title} ${i + 1}` : undefined,
        sortOrder: input.sortOrder ?? i,
      });
      tasks.push(task);
    }
    return tasks;
  }

  /**
   * Create a task with subtasks
   */
  async createWithSubtasks(
    projectId: string,
    userId: string,
    subtaskCount: number,
    input: CreateTaskInput = {}
  ): Promise<{ parent: Task; subtasks: Task[] }> {
    const parent = await this.create(projectId, userId, input);
    
    const subtasks: Task[] = [];
    for (let i = 0; i < subtaskCount; i++) {
      const subtask = await this.create(projectId, userId, {
        title: `Subtask ${i + 1} of ${parent.title}`,
        parentId: parent.id,
        sortOrder: i,
      });
      subtasks.push(subtask);
    }

    return { parent, subtasks };
  }

  /**
   * Create a TODO task
   */
  async createTodo(projectId: string, userId: string, input: Omit<CreateTaskInput, 'status'> = {}): Promise<Task> {
    return this.create(projectId, userId, { ...input, status: 'TODO' });
  }

  /**
   * Create an IN_PROGRESS task
   */
  async createInProgress(projectId: string, userId: string, input: Omit<CreateTaskInput, 'status'> = {}): Promise<Task> {
    return this.create(projectId, userId, { ...input, status: 'IN_PROGRESS' });
  }

  /**
   * Create a DONE task
   */
  async createDone(projectId: string, userId: string, input: Omit<CreateTaskInput, 'status'> = {}): Promise<Task> {
    return this.create(projectId, userId, { ...input, status: 'DONE' });
  }

  /**
   * Create a P1 (high priority) task
   */
  async createP1(projectId: string, userId: string, input: Omit<CreateTaskInput, 'priority'> = {}): Promise<Task> {
    return this.create(projectId, userId, { ...input, priority: 'P1' });
  }

  /**
   * Create a task planned for today
   */
  async createForToday(projectId: string, userId: string, input: Omit<CreateTaskInput, 'planDate'> = {}): Promise<Task> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.create(projectId, userId, { ...input, planDate: today });
  }

  /**
   * Create a task planned for yesterday (for daily planning testing)
   */
  async createForYesterday(projectId: string, userId: string, input: Omit<CreateTaskInput, 'planDate'> = {}): Promise<Task> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    return this.create(projectId, userId, { ...input, planDate: yesterday });
  }

  /**
   * Get all created task IDs
   */
  getCreatedIds(): string[] {
    return [...this.createdTaskIds];
  }

  /**
   * Clean up all tasks created by this factory
   */
  async cleanup(): Promise<void> {
    if (this.createdTaskIds.length === 0) return;

    try {
      // Delete pomodoros first (they reference tasks)
      await this.prisma.pomodoro.deleteMany({
        where: { taskId: { in: this.createdTaskIds } },
      });

      // Delete tasks (children first due to self-reference)
      // We need to delete in reverse order to handle parent-child relationships
      for (const taskId of [...this.createdTaskIds].reverse()) {
        await this.prisma.task.deleteMany({
          where: { id: taskId },
        });
      }
    } catch (error) {
      console.error('[TaskFactory] Failed to cleanup tasks:', error);
    }

    this.createdTaskIds = [];
  }
}
