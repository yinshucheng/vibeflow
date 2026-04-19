/**
 * Integration tests for ApiToken scope extension (task 2)
 *
 * Tests verify:
 *   2.1 — ApiToken model has scopes and description fields
 *   2.2 — authService methods handle scopes correctly
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
let dbAvailable = false;

let testUserId: string;
let testUserEmail: string;

function skipIfNoDb(fn: () => void | Promise<void>): void | Promise<void> {
  if (!dbAvailable) {
    console.warn('[auth-scope] Skipping: Database not available');
    return;
  }
  return fn();
}

beforeAll(async () => {
  try {
    await prisma.$connect();
    dbAvailable = true;
  } catch {
    dbAvailable = false;
    return;
  }

  testUserEmail = `scope-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.vibeflow.local`;

  const user = await prisma.user.create({
    data: { email: testUserEmail, password: 'test_password_hash' },
  });
  testUserId = user.id;
});

afterAll(async () => {
  if (!dbAvailable || !testUserId) {
    await prisma.$disconnect();
    return;
  }
  try {
    await prisma.apiToken.deleteMany({ where: { userId: testUserId } });
    await prisma.userSettings.deleteMany({ where: { userId: testUserId } });
    await prisma.user.delete({ where: { id: testUserId } });
  } catch (error) {
    console.warn('[auth-scope] cleanup error:', error);
  } finally {
    await prisma.$disconnect();
  }
});

// ─── 2.1 createToken with scopes and description ─────────────────────────

describe('2.1 createToken supports scopes and description', () => {
  it('creates token with default scopes ["read", "write"]', () =>
    skipIfNoDb(async () => {
      const { authService } = await import('@/services/auth.service');
      const result = await authService.createToken(testUserId, {
        name: 'default-scope-token',
        clientType: 'api',
      });

      expect(result.success).toBe(true);
      expect(result.data!.token).toMatch(/^vf_/);
      expect(result.data!.tokenInfo.scopes).toEqual(['read', 'write']);
      expect(result.data!.tokenInfo.description).toBeNull();
    }));

  it('creates token with custom scopes', () =>
    skipIfNoDb(async () => {
      const { authService } = await import('@/services/auth.service');
      const result = await authService.createToken(testUserId, {
        name: 'custom-scope-token',
        clientType: 'api',
        scopes: ['read'],
        description: 'Read-only token for analytics',
      });

      expect(result.success).toBe(true);
      expect(result.data!.tokenInfo.scopes).toEqual(['read']);
      expect(result.data!.tokenInfo.description).toBe('Read-only token for analytics');
    }));

  it('creates token with admin scope', () =>
    skipIfNoDb(async () => {
      const { authService } = await import('@/services/auth.service');
      const result = await authService.createToken(testUserId, {
        name: 'admin-token',
        clientType: 'api',
        scopes: ['read', 'write', 'admin'],
      });

      expect(result.success).toBe(true);
      expect(result.data!.tokenInfo.scopes).toEqual(['read', 'write', 'admin']);
    }));

  it('accepts api clientType', () =>
    skipIfNoDb(async () => {
      const { authService } = await import('@/services/auth.service');
      const result = await authService.createToken(testUserId, {
        name: 'api-client-token',
        clientType: 'api',
      });

      expect(result.success).toBe(true);
      expect(result.data!.tokenInfo.clientType).toBe('api');
    }));

  it('rejects invalid scope values', () =>
    skipIfNoDb(async () => {
      const { authService } = await import('@/services/auth.service');
      const result = await authService.createToken(testUserId, {
        name: 'bad-scope-token',
        clientType: 'api',
        scopes: ['read', 'superadmin' as 'read'],
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    }));
});

// ─── 2.2 validateToken returns scopes and email ──────────────────────────

describe('2.2 validateToken returns scopes and email', () => {
  let tokenWithReadOnly: string;
  let tokenWithAllScopes: string;

  beforeAll(async () => {
    if (!dbAvailable) return;
    const { authService } = await import('@/services/auth.service');

    const r1 = await authService.createToken(testUserId, {
      name: 'validate-read-only',
      clientType: 'api',
      scopes: ['read'],
    });
    tokenWithReadOnly = r1.data!.token;

    const r2 = await authService.createToken(testUserId, {
      name: 'validate-all-scopes',
      clientType: 'api',
      scopes: ['read', 'write', 'admin'],
    });
    tokenWithAllScopes = r2.data!.token;
  });

  it('returns scopes for read-only token', () =>
    skipIfNoDb(async () => {
      const { authService } = await import('@/services/auth.service');
      const result = await authService.validateToken(tokenWithReadOnly);

      expect(result.success).toBe(true);
      expect(result.data!.valid).toBe(true);
      expect(result.data!.scopes).toEqual(['read']);
      expect(result.data!.email).toBe(testUserEmail);
      expect(result.data!.userId).toBe(testUserId);
    }));

  it('returns scopes for full-access token', () =>
    skipIfNoDb(async () => {
      const { authService } = await import('@/services/auth.service');
      const result = await authService.validateToken(tokenWithAllScopes);

      expect(result.success).toBe(true);
      expect(result.data!.valid).toBe(true);
      expect(result.data!.scopes).toEqual(['read', 'write', 'admin']);
      expect(result.data!.email).toBe(testUserEmail);
    }));
});

// ─── 2.3 getUserTokens returns scopes and description ────────────────────

describe('2.3 getUserTokens returns scopes and description', () => {
  it('returns scopes and description in token list', () =>
    skipIfNoDb(async () => {
      const { authService } = await import('@/services/auth.service');
      const result = await authService.getUserTokens(testUserId);

      expect(result.success).toBe(true);
      expect(result.data!.length).toBeGreaterThan(0);

      for (const token of result.data!) {
        expect(token).toHaveProperty('scopes');
        expect(token).toHaveProperty('description');
        expect(Array.isArray(token.scopes)).toBe(true);
      }
    }));
});

// ─── 2.4 countActiveTokens ───────────────────────────────────────────────

describe('2.4 countActiveTokens', () => {
  it('counts only active (non-revoked, non-expired) tokens', () =>
    skipIfNoDb(async () => {
      const { authService } = await import('@/services/auth.service');

      // Get count before
      const before = await authService.countActiveTokens(testUserId);
      expect(before.success).toBe(true);
      const countBefore = before.data!;

      // Create a new token
      const created = await authService.createToken(testUserId, {
        name: 'count-test-token',
        clientType: 'api',
      });
      expect(created.success).toBe(true);

      // Count should increase by 1
      const after = await authService.countActiveTokens(testUserId);
      expect(after.success).toBe(true);
      expect(after.data).toBe(countBefore + 1);

      // Revoke it
      await authService.revokeToken(testUserId, created.data!.tokenInfo.id);

      // Count should go back
      const afterRevoke = await authService.countActiveTokens(testUserId);
      expect(afterRevoke.success).toBe(true);
      expect(afterRevoke.data).toBe(countBefore);
    }));

  it('excludes expired tokens from count', () =>
    skipIfNoDb(async () => {
      const { authService } = await import('@/services/auth.service');
      const crypto = await import('crypto');

      // Get count before
      const before = await authService.countActiveTokens(testUserId);
      const countBefore = before.data!;

      // Directly create an expired token in the DB
      const plainToken = `vf_${crypto.randomBytes(32).toString('hex')}`;
      const hashedToken = crypto.createHash('sha256').update(plainToken).digest('hex');
      await prisma.apiToken.create({
        data: {
          userId: testUserId,
          token: hashedToken,
          name: 'expired-count-test',
          clientType: 'api',
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      // Count should not include expired token
      const after = await authService.countActiveTokens(testUserId);
      expect(after.success).toBe(true);
      expect(after.data).toBe(countBefore);
    }));
});
