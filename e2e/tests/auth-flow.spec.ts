import { test, expect } from '../fixtures';
import { generateTestEmail, getPrismaClient } from '../fixtures';
import bcrypt from 'bcryptjs';

/**
 * Auth flow E2E tests (Checkpoint 1.5)
 *
 * Tests login, registration, error handling, Socket.io auth, and DEV_MODE quick login.
 * These tests run against the dev server (DEV_MODE=true, NEXT_PUBLIC_DEV_MODE=true).
 */

const TEST_PASSWORD = 'TestPass123!';

// Helper: create a user directly via Prisma with a properly hashed password
async function createUserWithPassword(
  email: string,
  password: string
): Promise<string> {
  const prisma = getPrismaClient();
  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, password: hashed },
  });
  await prisma.userSettings.create({
    data: { userId: user.id },
  });
  return user.id;
}

// Helper: clean up a test user by email via Prisma
async function cleanupUser(email: string): Promise<void> {
  const prisma = getPrismaClient();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  const userId = user.id;
  try {
    await prisma.lLMUsageLog.deleteMany({ where: { userId } });
    await prisma.chatMessage.deleteMany({ where: { conversation: { userId } } });
    await prisma.conversation.deleteMany({ where: { userId } });
    await prisma.activityLog.deleteMany({ where: { userId } });
    await prisma.pomodoro.deleteMany({ where: { userId } });
    await prisma.dailyState.deleteMany({ where: { userId } });
    await prisma.task.deleteMany({ where: { userId } });
    const projects = await prisma.project.findMany({ where: { userId }, select: { id: true } });
    if (projects.length > 0) {
      await prisma.projectGoal.deleteMany({ where: { projectId: { in: projects.map(p => p.id) } } });
    }
    await prisma.project.deleteMany({ where: { userId } });
    await prisma.goal.deleteMany({ where: { userId } });
    await prisma.userSettings.deleteMany({ where: { userId } });
    await prisma.apiToken.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  } catch {
    // Best effort cleanup
  }
}

// Helper: perform login via UI and wait for result
async function loginViaUI(
  page: import('@playwright/test').Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto('/login');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('Auth Flow (Checkpoint 1.5)', () => {
  // ------------------------------------------------------------------
  // 1.5.1 — Unauthenticated access: login page renders correctly
  // ------------------------------------------------------------------
  test.describe('1.5.1 — Login page access', () => {
    test('login page renders with correct elements', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        await page.goto('/login');
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('h1')).toContainText('Sign in to VibeFlow');
        await expect(page.locator('#email')).toBeVisible();
        await expect(page.locator('#password')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
        await expect(page.locator('a[href="/register"]')).toBeVisible();
      } finally {
        await page.close();
        await context.close();
      }
    });

    test('register page renders with correct elements', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        await page.goto('/register');
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('h1')).toContainText('Create your account');
        await expect(page.locator('#email')).toBeVisible();
        await expect(page.locator('#password')).toBeVisible();
        await expect(page.locator('#confirmPassword')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
        await expect(page.locator('a[href="/login"]')).toBeVisible();
      } finally {
        await page.close();
        await context.close();
      }
    });
  });

  // ------------------------------------------------------------------
  // 1.5.2 — Register new user → auto-login → redirect to homepage
  // ------------------------------------------------------------------
  test.describe('1.5.2 — Registration flow', () => {
    let testEmail: string;

    test.beforeEach(() => {
      testEmail = generateTestEmail('auth-reg');
    });

    test.afterEach(async () => {
      await cleanupUser(testEmail);
    });

    test('register → auto-login → redirects to homepage', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        await page.goto('/register');
        await page.waitForLoadState('domcontentloaded');

        await page.locator('#email').fill(testEmail);
        await page.locator('#password').fill(TEST_PASSWORD);
        await page.locator('#confirmPassword').fill(TEST_PASSWORD);

        await page.getByRole('button', { name: 'Create account' }).click();

        // Should auto-login and redirect to homepage
        await page.waitForURL('/', { timeout: 15000 });
        expect(page.url()).not.toContain('/login');
        expect(page.url()).not.toContain('/register');
      } finally {
        await page.close();
        await context.close();
      }
    });
  });

  // ------------------------------------------------------------------
  // 1.5.3 — Login existing user → redirect to homepage, tRPC works
  // ------------------------------------------------------------------
  test.describe('1.5.3 — Login existing user', () => {
    let testEmail: string;

    test.beforeEach(async () => {
      testEmail = generateTestEmail('auth-login');
      await createUserWithPassword(testEmail, TEST_PASSWORD);
    });

    test.afterEach(async () => {
      await cleanupUser(testEmail);
    });

    test('login → redirects to homepage, tRPC requests work', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        await loginViaUI(page, testEmail, TEST_PASSWORD);

        // Should redirect to homepage
        await page.waitForURL('/', { timeout: 15000 });
        expect(page.url()).not.toContain('/login');

        // Wait for page to fully load — tRPC requests should be working
        await page.waitForLoadState('networkidle');

        // Verify tRPC is working (no UNAUTHORIZED errors)
        const errorLocator = page.locator('text=UNAUTHORIZED');
        await expect(errorLocator).not.toBeVisible({ timeout: 5000 });
      } finally {
        await page.close();
        await context.close();
      }
    });
  });

  // ------------------------------------------------------------------
  // 1.5.4 — Wrong password → error message
  // ------------------------------------------------------------------
  test.describe('1.5.4 — Wrong password error', () => {
    let testEmail: string;

    test.beforeEach(async () => {
      testEmail = generateTestEmail('auth-wrong');
      await createUserWithPassword(testEmail, TEST_PASSWORD);
    });

    test.afterEach(async () => {
      await cleanupUser(testEmail);
    });

    test('wrong password shows error message', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        // Navigate to login page and wait for it to be fully interactive
        await page.goto('/login');
        await page.waitForLoadState('networkidle');

        // Fill login form with wrong password
        await page.locator('#email').fill(testEmail);
        await page.locator('#password').fill('WrongPassword999');

        // Submit and wait for the auth callback response
        const [callbackResponse] = await Promise.all([
          page.waitForResponse(
            (response) => response.url().includes('/api/auth/callback/credentials'),
            { timeout: 15000 }
          ),
          page.getByRole('button', { name: 'Sign in' }).click(),
        ]);

        // The callback should return 401 for wrong credentials
        expect(callbackResponse.status()).toBe(401);

        // Should show error message and stay on login page
        await expect(
          page.locator('text=Invalid email or password')
        ).toBeVisible({ timeout: 10000 });
        expect(page.url()).toContain('/login');
      } finally {
        await page.close();
        await context.close();
      }
    });
  });

  // ------------------------------------------------------------------
  // 1.5.5 — Socket.io connection after login (cookie auth)
  // ------------------------------------------------------------------
  test.describe('1.5.5 — Socket.io connection after login', () => {
    let testEmail: string;

    test.beforeEach(async () => {
      testEmail = generateTestEmail('auth-socket');
      await createUserWithPassword(testEmail, TEST_PASSWORD);
    });

    test.afterEach(async () => {
      await cleanupUser(testEmail);
    });

    test('Socket.io connects after login', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        // Track WebSocket connections
        const wsConnections: string[] = [];
        page.on('websocket', (ws) => {
          wsConnections.push(ws.url());
        });

        await loginViaUI(page, testEmail, TEST_PASSWORD);

        // Wait for redirect to homepage
        await page.waitForURL('/', { timeout: 15000 });
        await page.waitForLoadState('networkidle');

        // Wait for Socket.io to establish connection
        await page.waitForTimeout(3000);

        // Verify a WebSocket connection was made
        const hasSocketConnection = wsConnections.some(
          (url) => url.includes('socket.io') || url.includes('ws')
        );
        expect(hasSocketConnection).toBe(true);
      } finally {
        await page.close();
        await context.close();
      }
    });
  });

  // ------------------------------------------------------------------
  // 1.5.6 — DEV_MODE quick login
  // ------------------------------------------------------------------
  test.describe('1.5.6 — DEV_MODE quick login', () => {
    let devTestEmail: string;

    test.beforeEach(() => {
      devTestEmail = generateTestEmail('auth-dev');
    });

    test.afterEach(async () => {
      await cleanupUser(devTestEmail);
    });

    test('DEV_MODE quick login works without password', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        await page.goto('/login');
        await page.waitForLoadState('domcontentloaded');

        // Verify DEV_MODE section is visible (requires NEXT_PUBLIC_DEV_MODE=true)
        const devSection = page.locator('text=Dev Quick Login');
        await expect(devSection).toBeVisible({ timeout: 5000 });

        // Fill the dev login email
        const devEmailInput = page.locator(
          'input[type="email"][placeholder="any-email@example.com"]'
        );
        await expect(devEmailInput).toBeVisible();
        await devEmailInput.fill(devTestEmail);

        // Click the dev login button
        await page.getByRole('button', { name: 'Quick Login (No Password)' }).click();

        // Should redirect to homepage
        await page.waitForURL('/', { timeout: 15000 });
        expect(page.url()).not.toContain('/login');

        // Verify localStorage was set for socket auth
        const storedEmail = await page.evaluate(() =>
          localStorage.getItem('dev-user-email')
        );
        expect(storedEmail).toBe(devTestEmail);
      } finally {
        await page.close();
        await context.close();
      }
    });
  });
});
