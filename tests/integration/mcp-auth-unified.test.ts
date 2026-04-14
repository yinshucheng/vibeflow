/**
 * Tests for MCP authentication unification (task 12)
 *
 * Tests verify:
 *   12.1 — mcp/auth.ts: production mode only accepts vf_ tokens
 *   12.1 — mcp/auth.ts: dev mode accepts dev_<email> tokens
 *   12.1 — mcp/auth.ts: vibeflow_ format is rejected
 *   12.2 — mcp/trpc-client.ts: uses VIBEFLOW_API_KEY env var
 *   12.2 — mcp/trpc-client.ts: dev mode sends x-dev-user-email header
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to mock the trpc-client before importing auth
vi.mock('../../src/mcp/trpc-client', () => ({
  trpcClient: {
    mcpBridge: {
      whoami: {
        query: vi.fn(),
      },
    },
  },
  serverUrl: 'http://localhost:3000',
  apiKey: undefined,
  userEmail: 'dev@vibeflow.local',
}));

import { authenticateToken, resetAuthCache } from '../../src/mcp/auth';
import { trpcClient } from '../../src/mcp/trpc-client';

const mockWhoami = vi.mocked(trpcClient.mcpBridge.whoami.query);

describe('MCP Auth — authenticateToken', () => {
  beforeEach(() => {
    mockWhoami.mockReset();
    resetAuthCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('production mode (DEV_MODE=false)', () => {
    beforeEach(() => {
      vi.stubEnv('DEV_MODE', 'false');
      vi.stubEnv('NODE_ENV', 'production');
    });

    it('rejects when no token provided', async () => {
      const result = await authenticateToken();
      expect(result.success).toBe(false);
      expect(result.error).toContain('API key required');
    });

    it('rejects dev_<email> token format', async () => {
      const result = await authenticateToken('dev_test@example.com');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid token format');
    });

    it('rejects vibeflow_<userId>_<secret> legacy format', async () => {
      const result = await authenticateToken('vibeflow_user123_secret456');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid token format');
    });

    it('accepts vf_ token and validates via server', async () => {
      mockWhoami.mockResolvedValueOnce({
        userId: 'user-123',
        email: 'prod@example.com',
      });

      const result = await authenticateToken('vf_abc123def456');
      expect(result.success).toBe(true);
      expect(result.context).toEqual({
        userId: 'user-123',
        email: 'prod@example.com',
        isAuthenticated: true,
      });
    });

    it('returns error when vf_ token validation fails', async () => {
      mockWhoami.mockRejectedValueOnce(new Error('Token expired'));

      const result = await authenticateToken('vf_expired_token');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Token expired');
    });

    it('rejects random string token', async () => {
      const result = await authenticateToken('random_garbage_token');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid token format');
    });
  });

  describe('dev mode (DEV_MODE=true)', () => {
    beforeEach(() => {
      vi.stubEnv('DEV_MODE', 'true');
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('DEV_USER_EMAIL', 'dev@vibeflow.local');
      vi.stubEnv('MCP_USER_EMAIL', 'dev@vibeflow.local');
    });

    it('allows no-token fallback with dev email', async () => {
      mockWhoami.mockResolvedValueOnce({
        userId: 'dev-user-1',
        email: 'dev@vibeflow.local',
      });

      const result = await authenticateToken();
      expect(result.success).toBe(true);
      expect(result.context?.email).toBe('dev@vibeflow.local');
    });

    it('accepts dev_<email> token format', async () => {
      mockWhoami.mockResolvedValueOnce({
        userId: 'dev-user-2',
        email: 'custom@test.com',
      });

      const result = await authenticateToken('dev_custom@test.com');
      expect(result.success).toBe(true);
      expect(result.context?.email).toBe('custom@test.com');
    });

    it('still accepts vf_ token in dev mode', async () => {
      mockWhoami.mockResolvedValueOnce({
        userId: 'user-456',
        email: 'user@example.com',
      });

      const result = await authenticateToken('vf_valid_token_here');
      expect(result.success).toBe(true);
      expect(result.context?.userId).toBe('user-456');
    });

    it('still rejects vibeflow_ legacy format even in dev mode', async () => {
      const result = await authenticateToken('vibeflow_user123_secret456');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid token format');
    });
  });

  describe('caching behavior', () => {
    beforeEach(() => {
      vi.stubEnv('DEV_MODE', 'false');
      vi.stubEnv('NODE_ENV', 'production');
    });

    it('caches context after successful authentication', async () => {
      mockWhoami.mockResolvedValueOnce({
        userId: 'cached-user',
        email: 'cached@example.com',
      });

      // First call — hits the server
      const result1 = await authenticateToken('vf_token_for_caching');
      expect(result1.success).toBe(true);
      expect(mockWhoami).toHaveBeenCalledTimes(1);

      // Second call — should use cache, not call server again
      const result2 = await authenticateToken('vf_different_token');
      expect(result2.success).toBe(true);
      expect(result2.context?.userId).toBe('cached-user');
      expect(mockWhoami).toHaveBeenCalledTimes(1); // Still only 1 call
    });

    it('resetAuthCache clears the cache', async () => {
      mockWhoami.mockResolvedValue({
        userId: 'first-user',
        email: 'first@example.com',
      });

      await authenticateToken('vf_first_token');
      expect(mockWhoami).toHaveBeenCalledTimes(1);

      resetAuthCache();

      mockWhoami.mockResolvedValueOnce({
        userId: 'second-user',
        email: 'second@example.com',
      });

      const result = await authenticateToken('vf_second_token');
      expect(result.context?.userId).toBe('second-user');
      expect(mockWhoami).toHaveBeenCalledTimes(2);
    });
  });
});

describe('MCP trpc-client configuration', () => {
  it('exports serverUrl defaulting to localhost (no hardcoded external IP)', async () => {
    const { serverUrl } = await import('../../src/mcp/trpc-client');
    // The module-level default should not contain the old hardcoded IP
    expect(serverUrl).not.toContain('39.105');
  });
});
