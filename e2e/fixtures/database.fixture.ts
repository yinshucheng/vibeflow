import { PrismaClient } from '@prisma/client';

/**
 * Database fixture for E2E tests
 * Provides database connection and cleanup utilities for test isolation
 * 
 * Requirements: 2.1, 2.3
 * - Creates fresh test database state or resets to known state
 * - Cleans up created test data after tests complete
 */

// Singleton Prisma client for E2E tests
let prismaInstance: PrismaClient | null = null;

/**
 * Get or create a Prisma client instance for E2E tests
 */
export function getPrismaClient(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient({
      log: process.env.DEBUG ? ['query', 'error', 'warn'] : ['error'],
    });
  }
  return prismaInstance;
}

/**
 * Disconnect the Prisma client
 */
export async function disconnectPrisma(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
  }
}

/**
 * Clean up all test data from the database
 * Deletes data in the correct order to respect foreign key constraints
 * 
 * This is used to reset the database to a clean state before/after tests
 */
export async function cleanupDatabase(prisma: PrismaClient): Promise<void> {
  // Delete in order of dependencies (children first, then parents)
  // This respects foreign key constraints

  // Chat entities first
  await prisma.lLMUsageLog.deleteMany({});
  await prisma.chatMessage.deleteMany({});
  await prisma.conversation.deleteMany({});

  await prisma.activityLog.deleteMany({});
  await prisma.pomodoro.deleteMany({});
  await prisma.dailyState.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.projectGoal.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.goal.deleteMany({});
  await prisma.userSettings.deleteMany({});
  await prisma.user.deleteMany({});
}

/**
 * Clean up test data for a specific user
 * Useful for isolated test cleanup without affecting other test data
 */
export async function cleanupUserData(prisma: PrismaClient, userId: string): Promise<void> {
  // Delete in order of dependencies
  // Chat entities first
  await prisma.lLMUsageLog.deleteMany({ where: { userId } });
  await prisma.chatMessage.deleteMany({ where: { conversation: { userId } } });
  await prisma.conversation.deleteMany({ where: { userId } });

  await prisma.activityLog.deleteMany({ where: { userId } });
  await prisma.pomodoro.deleteMany({ where: { userId } });
  await prisma.dailyState.deleteMany({ where: { userId } });
  await prisma.task.deleteMany({ where: { userId } });
  
  // Get user's projects to clean up project-goal relations
  const projects = await prisma.project.findMany({
    where: { userId },
    select: { id: true },
  });
  const projectIds = projects.map(p => p.id);
  
  await prisma.projectGoal.deleteMany({
    where: { projectId: { in: projectIds } },
  });
  await prisma.project.deleteMany({ where: { userId } });
  await prisma.goal.deleteMany({ where: { userId } });
  await prisma.userSettings.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

/**
 * Clean up test data by specific entity IDs
 * Tracks created entities and cleans them up in the correct order
 */
export class TestDataTracker {
  private prisma: PrismaClient;
  private userIds: string[] = [];
  private projectIds: string[] = [];
  private taskIds: string[] = [];
  private goalIds: string[] = [];
  private pomodoroIds: string[] = [];
  private dailyStateIds: string[] = [];
  private activityLogIds: string[] = [];
  private userSettingsIds: string[] = [];
  private projectGoalIds: string[] = [];
  // Chat entities
  private conversationIds: string[] = [];
  private chatMessageIds: string[] = [];
  private llmUsageLogIds: string[] = [];

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  trackUser(id: string): void {
    this.userIds.push(id);
  }

  trackProject(id: string): void {
    this.projectIds.push(id);
  }

  trackTask(id: string): void {
    this.taskIds.push(id);
  }

  trackGoal(id: string): void {
    this.goalIds.push(id);
  }

  trackPomodoro(id: string): void {
    this.pomodoroIds.push(id);
  }

  trackDailyState(id: string): void {
    this.dailyStateIds.push(id);
  }

  trackActivityLog(id: string): void {
    this.activityLogIds.push(id);
  }

  trackUserSettings(id: string): void {
    this.userSettingsIds.push(id);
  }

  trackProjectGoal(id: string): void {
    this.projectGoalIds.push(id);
  }

  trackConversation(id: string): void {
    this.conversationIds.push(id);
  }

  trackChatMessage(id: string): void {
    this.chatMessageIds.push(id);
  }

  trackLLMUsageLog(id: string): void {
    this.llmUsageLogIds.push(id);
  }

  /**
   * Clean up all tracked entities in the correct order
   */
  async cleanup(): Promise<void> {
    // For tracked users, clean up ALL their data (not just tracked IDs)
    // This handles data created directly via prisma in tests
    if (this.userIds.length > 0) {
      // Chat entities first (LLMUsageLog → ChatMessage → Conversation)
      await this.prisma.lLMUsageLog.deleteMany({
        where: { userId: { in: this.userIds } },
      });

      await this.prisma.chatMessage.deleteMany({
        where: { conversation: { userId: { in: this.userIds } } },
      });

      await this.prisma.conversation.deleteMany({
        where: { userId: { in: this.userIds } },
      });

      // Delete all data for tracked users in dependency order
      await this.prisma.activityLog.deleteMany({
        where: { userId: { in: this.userIds } },
      });

      await this.prisma.pomodoro.deleteMany({
        where: { userId: { in: this.userIds } },
      });

      await this.prisma.dailyState.deleteMany({
        where: { userId: { in: this.userIds } },
      });

      await this.prisma.task.deleteMany({
        where: { userId: { in: this.userIds } },
      });

      // Get all projects for tracked users
      const projects = await this.prisma.project.findMany({
        where: { userId: { in: this.userIds } },
        select: { id: true },
      });
      const projectIds = projects.map(p => p.id);

      if (projectIds.length > 0) {
        await this.prisma.projectGoal.deleteMany({
          where: { projectId: { in: projectIds } },
        });
      }

      await this.prisma.project.deleteMany({
        where: { userId: { in: this.userIds } },
      });

      await this.prisma.goal.deleteMany({
        where: { userId: { in: this.userIds } },
      });

      await this.prisma.userSettings.deleteMany({
        where: { userId: { in: this.userIds } },
      });

      await this.prisma.user.deleteMany({
        where: { id: { in: this.userIds } },
      });
    }

    // Also clean up any specifically tracked Chat entities
    if (this.llmUsageLogIds.length > 0) {
      await this.prisma.lLMUsageLog.deleteMany({
        where: { id: { in: this.llmUsageLogIds } },
      }).catch(() => {});
    }

    if (this.chatMessageIds.length > 0) {
      await this.prisma.chatMessage.deleteMany({
        where: { id: { in: this.chatMessageIds } },
      }).catch(() => {});
    }

    if (this.conversationIds.length > 0) {
      await this.prisma.conversation.deleteMany({
        where: { id: { in: this.conversationIds } },
      }).catch(() => {});
    }

    // Also clean up any specifically tracked entities that might not be user-owned
    if (this.activityLogIds.length > 0) {
      await this.prisma.activityLog.deleteMany({
        where: { id: { in: this.activityLogIds } },
      }).catch(() => {});
    }

    if (this.pomodoroIds.length > 0) {
      await this.prisma.pomodoro.deleteMany({
        where: { id: { in: this.pomodoroIds } },
      }).catch(() => {});
    }

    if (this.dailyStateIds.length > 0) {
      await this.prisma.dailyState.deleteMany({
        where: { id: { in: this.dailyStateIds } },
      }).catch(() => {});
    }

    if (this.taskIds.length > 0) {
      await this.prisma.task.deleteMany({
        where: { id: { in: this.taskIds } },
      }).catch(() => {});
    }

    if (this.projectGoalIds.length > 0) {
      await this.prisma.projectGoal.deleteMany({
        where: { id: { in: this.projectGoalIds } },
      }).catch(() => {});
    }

    if (this.projectIds.length > 0) {
      await this.prisma.project.deleteMany({
        where: { id: { in: this.projectIds } },
      }).catch(() => {});
    }

    if (this.goalIds.length > 0) {
      await this.prisma.goal.deleteMany({
        where: { id: { in: this.goalIds } },
      }).catch(() => {});
    }

    if (this.userSettingsIds.length > 0) {
      await this.prisma.userSettings.deleteMany({
        where: { id: { in: this.userSettingsIds } },
      }).catch(() => {});
    }

    // Reset tracking arrays
    this.userIds = [];
    this.projectIds = [];
    this.taskIds = [];
    this.goalIds = [];
    this.pomodoroIds = [];
    this.dailyStateIds = [];
    this.activityLogIds = [];
    this.userSettingsIds = [];
    this.projectGoalIds = [];
    this.conversationIds = [];
    this.chatMessageIds = [];
    this.llmUsageLogIds = [];
  }
}

/**
 * Database fixture type for Playwright test extension
 */
export interface DatabaseFixture {
  prisma: PrismaClient;
  tracker: TestDataTracker;
  cleanup: () => Promise<void>;
  cleanupAll: () => Promise<void>;
}

/**
 * Create a database fixture for use in Playwright tests
 */
export function createDatabaseFixture(): DatabaseFixture {
  const prisma = getPrismaClient();
  const tracker = new TestDataTracker(prisma);

  return {
    prisma,
    tracker,
    cleanup: () => tracker.cleanup(),
    cleanupAll: () => cleanupDatabase(prisma),
  };
}
