import { PrismaClient } from '@prisma/client';

/**
 * Vitest Chat test helper
 * Provides test user lifecycle management for integration tests that need a real DB.
 *
 * Usage:
 *   beforeAll(() => setupChatTestUser());
 *   afterAll(() => cleanupChatTestUser());
 *
 *   it('test case', () => skipIfNoDb(async () => { ... }));
 *
 * Key constraints:
 * - Each test file creates its own unique user (no shared state)
 * - Cleanup order: LLMUsageLog → ChatMessage → Conversation → User
 * - DB not available → graceful skip, not failure
 */

const prisma = new PrismaClient();
let testUserId: string = '';
let dbAvailable = false;

/**
 * Create a unique test user. Call in beforeAll().
 */
export async function setupChatTestUser(): Promise<void> {
  try {
    await prisma.$connect();
    dbAvailable = true;
  } catch {
    dbAvailable = false;
    return;
  }

  const email = `chat-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.vibeflow.local`;
  const user = await prisma.user.create({
    data: { email, password: 'test_hash' },
  });
  testUserId = user.id;
}

/**
 * Delete the test user and all associated Chat data. Call in afterAll().
 */
export async function cleanupChatTestUser(): Promise<void> {
  if (!dbAvailable || !testUserId) {
    await prisma.$disconnect();
    return;
  }

  try {
    // Delete in FK dependency order
    await prisma.lLMUsageLog.deleteMany({ where: { userId: testUserId } });
    await prisma.chatMessage.deleteMany({ where: { conversation: { userId: testUserId } } });
    await prisma.conversation.deleteMany({ where: { userId: testUserId } });
    await prisma.user.delete({ where: { id: testUserId } });
  } catch (error) {
    console.warn('[chat-test-setup] cleanup error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Wrap a test body to graceful-skip when DB is unavailable.
 */
export function skipIfNoDb(fn: () => void | Promise<void>): void | Promise<void> {
  if (!dbAvailable) {
    console.warn('[chat-test-setup] Skipping: Database not available');
    return;
  }
  return fn();
}

export function isDbAvailable(): boolean {
  return dbAvailable;
}

export function getTestUserId(): string {
  return testUserId;
}

export { prisma };
