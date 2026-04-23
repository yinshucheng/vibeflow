/**
 * Skill REST API Authentication
 *
 * Authenticates Bearer vf_ tokens for /api/skill/* endpoints.
 * These endpoints bypass Next.js middleware auth (whitelisted) and handle auth themselves.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/services/auth.service';
import type { UserContext } from '@/services/user.service';

export type AuthSuccess = { status: 'ok'; user: UserContext };
export type AuthFailure = { status: 'unauthorized' } | { status: 'forbidden'; message: string };
export type AuthResult = AuthSuccess | AuthFailure;

/**
 * Authenticate a Skill REST API request.
 *
 * - Validates Bearer vf_ token via authService
 * - Checks required scope (read/write/admin)
 *
 * Returns AuthResult distinguishing unauthorized (401) from forbidden (403).
 */
export async function authenticateRequest(
  req: NextRequest,
  requiredScope: 'read' | 'write' | 'admin' = 'read'
): Promise<AuthResult> {
  // Bearer vf_ token authentication
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer vf_')) return { status: 'unauthorized' };

  const token = authHeader.slice(7); // "Bearer ".length = 7
  const result = await authService.validateToken(token);
  if (!result.success || !result.data?.valid || !result.data.userId) return { status: 'unauthorized' };

  // Scope check — token is valid but scope insufficient → 403
  const scopes = result.data.scopes || [];
  if (!scopes.includes(requiredScope)) {
    return { status: 'forbidden', message: `Requires '${requiredScope}' scope` };
  }

  return {
    status: 'ok',
    user: {
      userId: result.data.userId,
      email: result.data.email || '',
      isDevMode: false,
      tokenScopes: scopes,
    },
  };
}

/**
 * Helper: check auth and return user or error response.
 * If auth failed, returns { error: NextResponse }. If ok, returns { user: UserContext }.
 */
export function resolveAuth(auth: AuthResult): { user: UserContext; error?: never } | { user?: never; error: NextResponse } {
  if (auth.status === 'ok') return { user: auth.user };
  if (auth.status === 'forbidden') return { error: forbiddenResponse(auth.message) };
  return { error: unauthorizedResponse() };
}

/**
 * Standard 401 Unauthorized response for Skill endpoints.
 */
export function unauthorizedResponse(message = 'Unauthorized') {
  return NextResponse.json(
    { success: false, error: { code: 'AUTH_ERROR', message } },
    { status: 401 }
  );
}

/**
 * Standard 403 Forbidden response for Skill endpoints.
 */
export function forbiddenResponse(message = 'Insufficient permissions') {
  return NextResponse.json(
    { success: false, error: { code: 'FORBIDDEN', message } },
    { status: 403 }
  );
}

/**
 * Standard error response helper.
 */
export function errorResponse(
  code: string,
  message: string,
  status: number
) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status }
  );
}

/**
 * Wrap a service result into a NextResponse.
 * Maps service error codes to HTTP status codes.
 */
export function serviceResultResponse<T>(result: {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: Record<string, string[]> };
}) {
  if (result.success) {
    return NextResponse.json({ success: true, data: result.data });
  }

  const statusMap: Record<string, number> = {
    VALIDATION_ERROR: 400,
    NOT_FOUND: 404,
    CONFLICT: 409,
    AUTH_ERROR: 401,
    INTERNAL_ERROR: 500,
  };

  const status = statusMap[result.error?.code || ''] || 500;
  return NextResponse.json(
    { success: false, error: result.error },
    { status }
  );
}
