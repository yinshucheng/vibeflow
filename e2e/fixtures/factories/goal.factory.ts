import { PrismaClient, Goal, GoalType, GoalStatus } from '@prisma/client';
import { TestDataTracker } from '../database.fixture';

/**
 * Goal factory for E2E tests
 * Creates test goals with configurable timeframes
 * 
 * Requirements: 2.2
 * - Provides factory function for Goal entity
 * - Implements create() and cleanup() methods
 */

export interface CreateGoalInput {
  title?: string;
  description?: string;
  type?: GoalType;
  targetDate?: Date;
  status?: GoalStatus;
}

export class GoalFactory {
  private prisma: PrismaClient;
  private tracker: TestDataTracker;
  private createdGoalIds: string[] = [];

  constructor(prisma: PrismaClient, tracker: TestDataTracker) {
    this.prisma = prisma;
    this.tracker = tracker;
  }

  /**
   * Generate a unique goal title
   */
  private generateTitle(type: GoalType): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 6);
    const prefix = type === 'LONG_TERM' ? 'Long-term' : 'Short-term';
    return `${prefix} Goal ${timestamp}-${random}`;
  }

  /**
   * Generate a default target date based on goal type
   */
  private generateTargetDate(type: GoalType): Date {
    const date = new Date();
    if (type === 'LONG_TERM') {
      // 2 years from now (within 1-5 year range)
      date.setFullYear(date.getFullYear() + 2);
    } else {
      // 3 months from now (within 1 week - 6 month range)
      date.setMonth(date.getMonth() + 3);
    }
    return date;
  }

  /**
   * Create a test goal for a user
   */
  async create(userId: string, input: CreateGoalInput = {}): Promise<Goal> {
    const type = input.type || 'SHORT_TERM';
    const title = input.title || this.generateTitle(type);
    const description = input.description || `Description for ${title}`;
    const targetDate = input.targetDate || this.generateTargetDate(type);
    const status = input.status || 'ACTIVE';

    const goal = await this.prisma.goal.create({
      data: {
        title,
        description,
        type,
        targetDate,
        status,
        userId,
      },
    });

    this.createdGoalIds.push(goal.id);
    this.tracker.trackGoal(goal.id);

    return goal;
  }

  /**
   * Create multiple goals for a user
   */
  async createMany(userId: string, count: number, input: CreateGoalInput = {}): Promise<Goal[]> {
    const goals: Goal[] = [];
    for (let i = 0; i < count; i++) {
      const goal = await this.create(userId, {
        ...input,
        title: input.title ? `${input.title} ${i + 1}` : undefined,
      });
      goals.push(goal);
    }
    return goals;
  }

  /**
   * Create a long-term goal (1-5 years)
   */
  async createLongTerm(userId: string, input: Omit<CreateGoalInput, 'type'> = {}): Promise<Goal> {
    return this.create(userId, { ...input, type: 'LONG_TERM' });
  }

  /**
   * Create a short-term goal (1 week - 6 months)
   */
  async createShortTerm(userId: string, input: Omit<CreateGoalInput, 'type'> = {}): Promise<Goal> {
    return this.create(userId, { ...input, type: 'SHORT_TERM' });
  }

  /**
   * Create an active goal
   */
  async createActive(userId: string, input: Omit<CreateGoalInput, 'status'> = {}): Promise<Goal> {
    return this.create(userId, { ...input, status: 'ACTIVE' });
  }

  /**
   * Create a completed goal
   */
  async createCompleted(userId: string, input: Omit<CreateGoalInput, 'status'> = {}): Promise<Goal> {
    return this.create(userId, { ...input, status: 'COMPLETED' });
  }

  /**
   * Create an archived goal
   */
  async createArchived(userId: string, input: Omit<CreateGoalInput, 'status'> = {}): Promise<Goal> {
    return this.create(userId, { ...input, status: 'ARCHIVED' });
  }

  /**
   * Create a goal with a specific target date
   */
  async createWithTargetDate(
    userId: string,
    targetDate: Date,
    input: Omit<CreateGoalInput, 'targetDate'> = {}
  ): Promise<Goal> {
    return this.create(userId, { ...input, targetDate });
  }

  /**
   * Get all created goal IDs
   */
  getCreatedIds(): string[] {
    return [...this.createdGoalIds];
  }

  /**
   * Clean up all goals created by this factory
   */
  async cleanup(): Promise<void> {
    if (this.createdGoalIds.length === 0) return;

    try {
      // Delete project-goal relations first
      await this.prisma.projectGoal.deleteMany({
        where: { goalId: { in: this.createdGoalIds } },
      });

      // Delete goals
      await this.prisma.goal.deleteMany({
        where: { id: { in: this.createdGoalIds } },
      });
    } catch (error) {
      console.error('[GoalFactory] Failed to cleanup goals:', error);
    }

    this.createdGoalIds = [];
  }
}
