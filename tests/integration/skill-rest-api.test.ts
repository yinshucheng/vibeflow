/**
 * Tests for Skill REST Adapter (task 13)
 *
 * Tests verify:
 *   13.1 — skill-auth.ts: authenticateRequest validates Bearer vf_ tokens
 *   13.1 — skill-auth.ts: scope checking works correctly
 *   13.1 — skill-auth.ts: DEV_MODE x-dev-user-email header support
 *   13.2 — REST route handlers return standard JSON (no SuperJSON)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock authService before importing skill-auth
vi.mock('../../src/services/auth.service', () => ({
  authService: {
    validateToken: vi.fn(),
  },
}));

// Mock userService for DEV_MODE support
vi.mock('../../src/services/user.service', () => ({
  userService: {
    getCurrentUser: vi.fn(),
  },
}));

import { authService } from '../../src/services/auth.service';
import { userService } from '../../src/services/user.service';
import { authenticateRequest, unauthorizedResponse, forbiddenResponse, serviceResultResponse } from '../../src/lib/skill-auth';
import { NextRequest } from 'next/server';

const mockValidateToken = vi.mocked(authService.validateToken);
const mockGetCurrentUser = vi.mocked(userService.getCurrentUser);

function makeRequest(opts: {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
} = {}): NextRequest {
  const url = opts.url || 'http://localhost:3000/api/skill/tasks';
  const request = new NextRequest(url, {
    method: opts.method || 'GET',
    headers: opts.headers || {},
  });
  return request;
}

describe('Skill Auth — authenticateRequest', () => {
  beforeEach(() => {
    mockValidateToken.mockReset();
    mockGetCurrentUser.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null when no Authorization header', async () => {
    const req = makeRequest();
    const result = await authenticateRequest(req);
    expect(result.status).toBe('unauthorized');
  });

  it('returns null when Authorization header is not Bearer vf_', async () => {
    const req = makeRequest({
      headers: { authorization: 'Bearer sk_abc123' },
    });
    const result = await authenticateRequest(req);
    expect(result.status).toBe('unauthorized');
  });

  it('returns null when token validation fails', async () => {
    mockValidateToken.mockResolvedValueOnce({
      success: false,
      error: { code: 'AUTH_ERROR', message: 'Invalid token' },
    });

    const req = makeRequest({
      headers: { authorization: 'Bearer vf_invalid123' },
    });
    const result = await authenticateRequest(req);
    expect(result.status).toBe('unauthorized');
  });

  it('returns null when token is valid but lacks required scope', async () => {
    mockValidateToken.mockResolvedValueOnce({
      success: true,
      data: {
        valid: true,
        userId: 'user-1',
        email: 'test@example.com',
        scopes: ['read'],
        tokenId: 'tok-1',
      },
    });

    const req = makeRequest({
      headers: { authorization: 'Bearer vf_valid123' },
    });
    const result = await authenticateRequest(req, 'write');
    expect(result.status).toBe('forbidden');
  });

  it('returns UserContext when token is valid with matching scope', async () => {
    mockValidateToken.mockResolvedValueOnce({
      success: true,
      data: {
        valid: true,
        userId: 'user-1',
        email: 'test@example.com',
        scopes: ['read', 'write'],
        tokenId: 'tok-1',
      },
    });

    const req = makeRequest({
      headers: { authorization: 'Bearer vf_valid123' },
    });
    const result = await authenticateRequest(req, 'read');
    expect(result).toEqual({
      status: 'ok',
      user: {
        userId: 'user-1',
        email: 'test@example.com',
        isDevMode: false,
        tokenScopes: ['read', 'write'],
      },
    });
  });

  it('default scope is read', async () => {
    mockValidateToken.mockResolvedValueOnce({
      success: true,
      data: {
        valid: true,
        userId: 'user-1',
        email: 'test@example.com',
        scopes: ['read'],
        tokenId: 'tok-1',
      },
    });

    const req = makeRequest({
      headers: { authorization: 'Bearer vf_valid123' },
    });
    const result = await authenticateRequest(req);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.user.userId).toBe('user-1');
  });

  describe('DEV_MODE support', () => {
    beforeEach(() => {
      vi.stubEnv('DEV_MODE', 'true');
    });

    it('accepts x-dev-user-email header in DEV_MODE', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        success: true,
        data: {
          userId: 'dev-user-1',
          email: 'dev@vibeflow.local',
          isDevMode: true,
        },
      });

      const req = makeRequest({
        headers: { 'x-dev-user-email': 'dev@vibeflow.local' },
      });
      const result = await authenticateRequest(req, 'write');
      expect(result.status).toBe('ok');
      if (result.status === 'ok') {
        expect(result.user.userId).toBe('dev-user-1');
        expect(result.user.isDevMode).toBe(true);
      }
    });

    it('still accepts Bearer vf_ token in DEV_MODE', async () => {
      mockValidateToken.mockResolvedValueOnce({
        success: true,
        data: {
          valid: true,
          userId: 'user-1',
          email: 'test@example.com',
          scopes: ['read', 'write'],
          tokenId: 'tok-1',
        },
      });

      const req = makeRequest({
        headers: { authorization: 'Bearer vf_valid123' },
      });
      const result = await authenticateRequest(req, 'read');
      expect(result.status).toBe('ok');
      if (result.status === 'ok') expect(result.user.userId).toBe('user-1');
    });
  });
});

describe('Skill Auth — response helpers', () => {
  it('unauthorizedResponse returns 401', async () => {
    const response = unauthorizedResponse();
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('AUTH_ERROR');
  });

  it('forbiddenResponse returns 403', async () => {
    const response = forbiddenResponse();
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('serviceResultResponse maps success correctly', async () => {
    const response = serviceResultResponse({
      success: true,
      data: { id: '1', title: 'Test' },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ id: '1', title: 'Test' });
  });

  it('serviceResultResponse maps VALIDATION_ERROR to 400', async () => {
    const response = serviceResultResponse({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Bad input' },
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('serviceResultResponse maps NOT_FOUND to 404', async () => {
    const response = serviceResultResponse({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Not found' },
    });
    expect(response.status).toBe(404);
  });

  it('serviceResultResponse maps CONFLICT to 409', async () => {
    const response = serviceResultResponse({
      success: false,
      error: { code: 'CONFLICT', message: 'Conflict' },
    });
    expect(response.status).toBe(409);
  });

  it('serviceResultResponse maps unknown error to 500', async () => {
    const response = serviceResultResponse({
      success: false,
      error: { code: 'CUSTOM_ERROR', message: 'Something' },
    });
    expect(response.status).toBe(500);
  });
});
