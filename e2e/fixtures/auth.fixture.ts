import { test as base, Page, BrowserContext } from '@playwright/test';
import { PrismaClient, User } from '@prisma/client';
import { getPrismaClient, TestDataTracker } from './database.fixture';

/**
 * Auth fixture for E2E tests
 * Implements development mode authentication using X-Dev-User-Email header
 * 
 * Requirements: 1.4
 * - Provides reusable auth setup fixture
 * - Configures extraHTTPHeaders to auto-inject authentication header
 */

export interface TestUser {
  id: string;
  email: string;
}

export interface AuthFixture {
  /** The authenticated test user */
  testUser: TestUser;
  /** Page with authentication headers pre-configured */
  authenticatedPage: Page;
  /** Create a new authenticated context for a specific user */
  createAuthenticatedContext: (email?: string) => Promise<BrowserContext>;
}

/**
 * Create or get a test user by email
 */
async function getOrCreateTestUser(
  prisma: PrismaClient,
  email: string,
  tracker?: TestDataTracker
): Promise<User> {
  let user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        password: 'e2e_test_password_hash',
      },
    });
    
    // Track the created user for cleanup
    if (tracker) {
      tracker.trackUser(user.id);
    }
  }

  return user;
}

/**
 * Generate a unique test email for isolation
 */
export function generateTestEmail(prefix: string = 'e2e'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}@test.vibeflow.local`;
}

/**
 * Create auth fixture for Playwright tests
 * Extends the base test with authentication capabilities
 */
export const authTest = base.extend<AuthFixture>({
  testUser: async ({}, use) => {
    const prisma = getPrismaClient();
    const email = generateTestEmail();
    const user = await getOrCreateTestUser(prisma, email);
    
    await use({
      id: user.id,
      email: user.email,
    });
    
    // Cleanup: delete the test user and all related data
    await cleanupTestUser(prisma, user.id);
  },

  authenticatedPage: async ({ browser, testUser }, use) => {
    // Create a new context with the dev auth header
    const context = await browser.newContext({
      extraHTTPHeaders: {
        'X-Dev-User-Email': testUser.email,
      },
    });
    
    const page = await context.newPage();
    
    await use(page);
    
    // Cleanup
    await page.close();
    await context.close();
  },

  createAuthenticatedContext: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];
    
    const createContext = async (email?: string): Promise<BrowserContext> => {
      const userEmail = email || generateTestEmail();
      const prisma = getPrismaClient();
      
      // Ensure user exists
      await getOrCreateTestUser(prisma, userEmail);
      
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

/**
 * Clean up a test user and all related data
 */
async function cleanupTestUser(prisma: PrismaClient, userId: string): Promise<void> {
  try {
    // Delete in order of dependencies
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
    
    if (projectIds.length > 0) {
      await prisma.projectGoal.deleteMany({
        where: { projectId: { in: projectIds } },
      });
    }
    
    await prisma.project.deleteMany({ where: { userId } });
    await prisma.goal.deleteMany({ where: { userId } });
    await prisma.userSettings.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  } catch (error) {
    console.error(`[AuthFixture] Failed to cleanup test user ${userId}:`, error);
  }
}

/**
 * Helper to set auth header on an existing page
 */
export async function setAuthHeader(page: Page, email: string): Promise<void> {
  await page.setExtraHTTPHeaders({
    'X-Dev-User-Email': email,
  });
}

export { getOrCreateTestUser };
