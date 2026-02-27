import { test as base, Page, BrowserContext } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import {
  getPrismaClient,
  disconnectPrisma,
  TestDataTracker,
  DatabaseFixture,
  createDatabaseFixture,
} from './database.fixture';
import { generateTestEmail, getOrCreateTestUser, TestUser } from './auth.fixture';
import { UserFactory, ProjectFactory, TaskFactory, GoalFactory } from './factories';
import { ChatTestHelper } from './chat.fixture';

/**
 * Main fixture export file for E2E tests
 * Combines all fixtures and exports an extended test object
 * 
 * Requirements: 1.4, 1.5
 * - Provides reusable auth setup fixture
 * - Provides Test_Data_Seeding utilities
 */

/**
 * Extended test fixtures interface
 */
export interface TestFixtures {
  // Database
  prisma: PrismaClient;
  tracker: TestDataTracker;
  db: DatabaseFixture;

  // Factories
  userFactory: UserFactory;
  projectFactory: ProjectFactory;
  taskFactory: TaskFactory;
  goalFactory: GoalFactory;

  // Chat
  chatHelper: ChatTestHelper;

  // Auth
  testUser: TestUser;
  authenticatedPage: Page;
  createAuthenticatedContext: (email?: string) => Promise<BrowserContext>;
}

/**
 * Extended test object with all fixtures
 */
export const test = base.extend<TestFixtures>({
  // Database fixture
  prisma: async ({}, use) => {
    const prisma = getPrismaClient();
    await use(prisma);
    // Don't disconnect here - let the global teardown handle it
  },

  // Test data tracker
  tracker: async ({ prisma }, use) => {
    const tracker = new TestDataTracker(prisma);
    await use(tracker);
    // Cleanup tracked data after test
    await tracker.cleanup();
  },

  // Combined database fixture
  db: async ({}, use) => {
    const fixture = createDatabaseFixture();
    await use(fixture);
    await fixture.cleanup();
  },

  // User factory
  userFactory: async ({ prisma, tracker }, use) => {
    const factory = new UserFactory(prisma, tracker);
    await use(factory);
    // Cleanup is handled by tracker
  },

  // Project factory
  projectFactory: async ({ prisma, tracker }, use) => {
    const factory = new ProjectFactory(prisma, tracker);
    await use(factory);
    // Cleanup is handled by tracker
  },

  // Task factory
  taskFactory: async ({ prisma, tracker }, use) => {
    const factory = new TaskFactory(prisma, tracker);
    await use(factory);
    // Cleanup is handled by tracker
  },

  // Goal factory
  goalFactory: async ({ prisma, tracker }, use) => {
    const factory = new GoalFactory(prisma, tracker);
    await use(factory);
    // Cleanup is handled by tracker
  },

  // Chat helper
  chatHelper: async ({ prisma, tracker }, use) => {
    const helper = new ChatTestHelper(prisma, tracker);
    await use(helper);
    // Cleanup is handled by tracker
  },

  // Test user - creates a unique user for each test
  testUser: async ({ prisma, tracker }, use) => {
    const email = generateTestEmail();
    const user = await getOrCreateTestUser(prisma, email, tracker);
    
    await use({
      id: user.id,
      email: user.email,
    });
    // Cleanup is handled by tracker
  },

  // Authenticated page with dev auth header
  authenticatedPage: async ({ browser, testUser }, use) => {
    const context = await browser.newContext({
      extraHTTPHeaders: {
        'X-Dev-User-Email': testUser.email,
      },
    });
    
    const page = await context.newPage();
    
    await use(page);
    
    await page.close();
    await context.close();
  },

  // Factory for creating additional authenticated contexts
  createAuthenticatedContext: async ({ browser, prisma, tracker }, use) => {
    const contexts: BrowserContext[] = [];
    
    const createContext = async (email?: string): Promise<BrowserContext> => {
      const userEmail = email || generateTestEmail();
      
      // Ensure user exists
      await getOrCreateTestUser(prisma, userEmail, tracker);
      
      const context = await browser.newContext({
        extraHTTPHeaders: {
          'X-Dev-User-Email': userEmail,
        },
      });
      
      contexts.push(context);
      return context;
    };
    
    await use(createContext);
    
    // Cleanup all created contexts
    for (const ctx of contexts) {
      await ctx.close();
    }
  },
});

// Re-export expect from Playwright
export { expect } from '@playwright/test';

// Re-export database utilities
export {
  getPrismaClient,
  disconnectPrisma,
  TestDataTracker,
  cleanupDatabase,
  cleanupUserData,
} from './database.fixture';

// Re-export auth utilities
export { generateTestEmail, getOrCreateTestUser, setAuthHeader } from './auth.fixture';
export type { TestUser, AuthFixture } from './auth.fixture';

// Re-export chat fixture
export { ChatTestHelper } from './chat.fixture';

// Re-export factories
export {
  UserFactory,
  ProjectFactory,
  TaskFactory,
  GoalFactory,
} from './factories';

export type {
  CreateUserInput,
  CreateUserSettingsInput,
  UserWithSettings,
  CreateProjectInput,
  CreateTaskInput,
  CreateGoalInput,
} from './factories';
