import { PrismaClient, User, UserSettings } from '@prisma/client';
import { TestDataTracker } from '../database.fixture';

/**
 * User factory for E2E tests
 * Creates test users with optional settings
 * 
 * Requirements: 2.2
 * - Provides factory function for User entity
 * - Implements create() and cleanup() methods
 */

export interface CreateUserInput {
  email?: string;
  password?: string;
  settings?: Partial<CreateUserSettingsInput>;
}

export interface CreateUserSettingsInput {
  pomodoroDuration?: number;
  shortRestDuration?: number;
  longRestDuration?: number;
  longRestInterval?: number;
  dailyCap?: number;
  blacklist?: string[];
  whitelist?: string[];
  codingStandards?: string[];
  preferences?: Record<string, unknown>;
}

export interface UserWithSettings extends User {
  settings: UserSettings | null;
}

export class UserFactory {
  private prisma: PrismaClient;
  private tracker: TestDataTracker;
  private createdUserIds: string[] = [];

  constructor(prisma: PrismaClient, tracker: TestDataTracker) {
    this.prisma = prisma;
    this.tracker = tracker;
  }

  /**
   * Generate a unique test email
   */
  private generateEmail(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `test-user-${timestamp}-${random}@test.vibeflow.local`;
  }

  /**
   * Create a test user with optional settings
   */
  async create(input: CreateUserInput = {}): Promise<UserWithSettings> {
    const email = input.email || this.generateEmail();
    const password = input.password || 'test_password_hash';

    const user = await this.prisma.user.create({
      data: {
        email,
        password,
      },
    });

    this.createdUserIds.push(user.id);
    this.tracker.trackUser(user.id);

    let settings: UserSettings | null = null;

    // Create settings if provided
    if (input.settings) {
      settings = await this.prisma.userSettings.create({
        data: {
          userId: user.id,
          pomodoroDuration: input.settings.pomodoroDuration ?? 25,
          shortRestDuration: input.settings.shortRestDuration ?? 5,
          longRestDuration: input.settings.longRestDuration ?? 15,
          longRestInterval: input.settings.longRestInterval ?? 4,
          dailyCap: input.settings.dailyCap ?? 8,
          blacklist: input.settings.blacklist ?? [],
          whitelist: input.settings.whitelist ?? [],
          codingStandards: input.settings.codingStandards ?? [],
          preferences: (input.settings.preferences ?? {}) as Record<string, string>,
        },
      });
      this.tracker.trackUserSettings(settings.id);
    }

    return { ...user, settings };
  }

  /**
   * Create a user with default settings
   */
  async createWithSettings(input: CreateUserInput = {}): Promise<UserWithSettings> {
    return this.create({
      ...input,
      settings: input.settings || {},
    });
  }

  /**
   * Get all created user IDs
   */
  getCreatedIds(): string[] {
    return [...this.createdUserIds];
  }

  /**
   * Clean up all users created by this factory
   */
  async cleanup(): Promise<void> {
    if (this.createdUserIds.length === 0) return;

    // Delete in order of dependencies
    for (const userId of this.createdUserIds) {
      try {
        await this.prisma.activityLog.deleteMany({ where: { userId } });
        await this.prisma.pomodoro.deleteMany({ where: { userId } });
        await this.prisma.dailyState.deleteMany({ where: { userId } });
        await this.prisma.task.deleteMany({ where: { userId } });
        
        const projects = await this.prisma.project.findMany({
          where: { userId },
          select: { id: true },
        });
        
        if (projects.length > 0) {
          await this.prisma.projectGoal.deleteMany({
            where: { projectId: { in: projects.map(p => p.id) } },
          });
        }
        
        await this.prisma.project.deleteMany({ where: { userId } });
        await this.prisma.goal.deleteMany({ where: { userId } });
        await this.prisma.userSettings.deleteMany({ where: { userId } });
        await this.prisma.user.deleteMany({ where: { id: userId } });
      } catch (error) {
        console.error(`[UserFactory] Failed to cleanup user ${userId}:`, error);
      }
    }

    this.createdUserIds = [];
  }
}
