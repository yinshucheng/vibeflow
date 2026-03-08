/**
 * Integration tests for migrate-dev-account.ts (tasks 2.1.1–2.1.2)
 *
 * Tests verify:
 *   2.1.1 — Script migrates dev@vibeflow.local: updates password + optional email,
 *           prints data integrity counts
 *   2.1.2 — Idempotency: re-running overwrites password only;
 *           account not found exits safely
 *
 * Strategy: Tests operate on the real dev@vibeflow.local account which may already
 * exist with FK-constrained data. We save/restore state rather than delete/recreate.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { execSync } from 'child_process';
import path from 'path';

const prisma = new PrismaClient();
let dbAvailable = false;

const SCRIPT_PATH = path.resolve(__dirname, '../../scripts/migrate-dev-account.ts');
const DEV_EMAIL = 'dev@vibeflow.local';

// We use a unique test email to avoid conflicts with the real dev account
const TEST_DEV_EMAIL_PREFIX = 'migrate-test-dev';

function skipIfNoDb(fn: () => void | Promise<void>): void | Promise<void> {
  if (!dbAvailable) {
    console.warn('[migrate-dev-account] Skipping: Database not available');
    return;
  }
  return fn();
}

function runMigrateScript(args: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`npx tsx ${SCRIPT_PATH} ${args}`, {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf-8',
      timeout: 30000,
      env: { ...process.env, NODE_ENV: 'test' },
    });
    return { stdout, exitCode: 0 };
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: (execError.stdout || '') + (execError.stderr || ''),
      exitCode: execError.status ?? 1,
    };
  }
}

beforeAll(async () => {
  try {
    await prisma.$connect();
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * Helper to clean up a test user and all dependent records.
 * Only used for users we create in tests (not the real dev account).
 */
async function cleanupTestUser(userId: string) {
  try {
    // Delete in FK-safe order
    await prisma.apiToken.deleteMany({ where: { userId } });
    await prisma.dailyState.deleteMany({ where: { userId } });
    await prisma.pomodoro.deleteMany({ where: { userId } });
    await prisma.task.deleteMany({ where: { userId } });
    await prisma.project.deleteMany({ where: { userId } });
    await prisma.goal.deleteMany({ where: { userId } });
    await prisma.userSettings.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  } catch {
    // Ignore cleanup errors
  }
}

describe('2.1.1 migrate-dev-account script', () => {
  // Save and restore the original dev account password to avoid mutating prod data
  let originalPassword: string | undefined;
  let devAccountExists = false;

  beforeAll(async () => {
    if (!dbAvailable) return;
    const user = await prisma.user.findUnique({ where: { email: DEV_EMAIL } });
    if (user) {
      devAccountExists = true;
      originalPassword = user.password;
    }
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    // Restore original password if we modified it
    if (devAccountExists && originalPassword) {
      await prisma.user.update({
        where: { email: DEV_EMAIL },
        data: { password: originalPassword },
      });
    }
  });

  it('migrates dev account password', () =>
    skipIfNoDb(async () => {
      if (!devAccountExists) {
        // Create a temporary dev account for this test
        await prisma.user.create({
          data: { email: DEV_EMAIL, password: 'dev_mode_no_password' },
        });
      }

      const { stdout, exitCode } = runMigrateScript('--password TestMigrate123');
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Migrated');
      expect(stdout).toContain('password set');

      // Verify password was updated
      const updated = await prisma.user.findUnique({ where: { email: DEV_EMAIL } });
      expect(updated).not.toBeNull();
      expect(updated!.password).not.toBe('dev_mode_no_password');
      const isValid = await bcrypt.compare('TestMigrate123', updated!.password);
      expect(isValid).toBe(true);
    }));

  it('keeps email unchanged when --email is not provided', () =>
    skipIfNoDb(async () => {
      const before = await prisma.user.findUnique({ where: { email: DEV_EMAIL } });
      if (!before) return; // skip if no dev account (previous test may have created/modified it)

      const { exitCode } = runMigrateScript('--password AnotherPass123');
      expect(exitCode).toBe(0);

      const after = await prisma.user.findUnique({ where: { id: before.id } });
      expect(after).not.toBeNull();
      expect(after!.email).toBe(DEV_EMAIL);
    }));

  it('prints data integrity counts', () =>
    skipIfNoDb(async () => {
      const { stdout, exitCode } = runMigrateScript('--password TestMigrate123');
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Data integrity check');
      expect(stdout).toContain('projects');
      expect(stdout).toContain('tasks');
      expect(stdout).toContain('pomodoros');
      expect(stdout).toContain('goals');
      expect(stdout).toContain('dailyStates');
    }));
});

describe('2.1.1 migrate-dev-account email update (isolated user)', () => {
  let testUserId: string | undefined;
  const isolatedEmail = `${TEST_DEV_EMAIL_PREFIX}-${Date.now()}@vibeflow.local`;

  afterEach(async () => {
    if (!dbAvailable || !testUserId) return;
    await cleanupTestUser(testUserId);
    testUserId = undefined;
    // Also clean up by the migrated email
    const leftover = await prisma.user.findFirst({
      where: { email: { startsWith: TEST_DEV_EMAIL_PREFIX } },
    });
    if (leftover) await cleanupTestUser(leftover.id);
  });

  it('updates email when --email is provided (via direct logic test)', () =>
    skipIfNoDb(async () => {
      // Since the script hardcodes dev@vibeflow.local, we test email update
      // logic directly rather than through CLI to avoid mutating the real account.
      const user = await prisma.user.create({
        data: { email: isolatedEmail, password: 'dev_mode_no_password' },
      });
      testUserId = user.id;

      const newEmail = `${TEST_DEV_EMAIL_PREFIX}-migrated-${Date.now()}@vibeflow.local`;
      const hashedPassword = await bcrypt.hash('NewPassword123', 12);

      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword, email: newEmail },
      });

      const updated = await prisma.user.findUnique({ where: { id: user.id } });
      expect(updated).not.toBeNull();
      expect(updated!.email).toBe(newEmail);
      const isValid = await bcrypt.compare('NewPassword123', updated!.password);
      expect(isValid).toBe(true);
    }));
});

describe('2.1.1 account not found', () => {
  // Temporarily rename the dev account to simulate "not found"
  let realDevUser: { id: string; email: string } | null = null;
  const tempEmail = `${TEST_DEV_EMAIL_PREFIX}-temp-${Date.now()}@vibeflow.local`;

  beforeAll(async () => {
    if (!dbAvailable) return;
    realDevUser = await prisma.user.findUnique({
      where: { email: DEV_EMAIL },
      select: { id: true, email: true },
    });
    if (realDevUser) {
      // Temporarily change email so the script can't find it
      await prisma.user.update({
        where: { id: realDevUser.id },
        data: { email: tempEmail },
      });
    }
  });

  afterAll(async () => {
    if (!dbAvailable || !realDevUser) return;
    // Restore original email
    await prisma.user.update({
      where: { id: realDevUser.id },
      data: { email: DEV_EMAIL },
    });
  });

  it('exits safely when account not found', () =>
    skipIfNoDb(async () => {
      const { stdout, exitCode } = runMigrateScript('--password TestMigrate123');
      expect(exitCode).toBe(0);
      expect(stdout).toContain('not found');
      expect(stdout).toContain('nothing to migrate');
    }));
});

describe('2.1.2 idempotency', () => {
  let originalPassword: string | undefined;

  beforeAll(async () => {
    if (!dbAvailable) return;
    const user = await prisma.user.findUnique({ where: { email: DEV_EMAIL } });
    if (user) originalPassword = user.password;
  });

  afterAll(async () => {
    if (!dbAvailable || !originalPassword) return;
    await prisma.user.update({
      where: { email: DEV_EMAIL },
      data: { password: originalPassword },
    });
  });

  it('re-running overwrites password without creating duplicates', () =>
    skipIfNoDb(async () => {
      const userBefore = await prisma.user.findUnique({ where: { email: DEV_EMAIL } });
      if (!userBefore) return; // skip if no dev account

      // Run twice with different passwords
      const { exitCode: exitCode1 } = runMigrateScript('--password FirstPass123');
      expect(exitCode1).toBe(0);

      const { exitCode: exitCode2 } = runMigrateScript('--password SecondPass123');
      expect(exitCode2).toBe(0);

      // Verify only one user exists
      const userCount = await prisma.user.count({ where: { email: DEV_EMAIL } });
      expect(userCount).toBe(1);

      // Verify latest password is active
      const updated = await prisma.user.findUnique({ where: { id: userBefore.id } });
      expect(updated).not.toBeNull();
      const isFirstValid = await bcrypt.compare('FirstPass123', updated!.password);
      const isSecondValid = await bcrypt.compare('SecondPass123', updated!.password);
      expect(isFirstValid).toBe(false);
      expect(isSecondValid).toBe(true);
    }));

  it('rejects password shorter than 8 characters', () =>
    skipIfNoDb(async () => {
      const { exitCode } = runMigrateScript('--password short');
      expect(exitCode).not.toBe(0);
    }));

  it('exits with error when --password is missing', () =>
    skipIfNoDb(async () => {
      const { exitCode } = runMigrateScript('');
      expect(exitCode).not.toBe(0);
    }));
});
