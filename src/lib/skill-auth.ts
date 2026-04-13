/**
 * Skill REST API Authentication
 *
 * Authenticates Bearer vf_ tokens for /api/skill/* endpoints.
 * These endpoints bypass Next.js middleware auth (whitelisted) and handle auth themselves.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/services/auth.service';
import type { UserContext } from '@/services/user.service';

/**
 * Authenticate a Skill REST API request.
 *
 * - Validates Bearer vf_ token via authService
 * - Checks required scope (read/write/admin)
 * - In DEV_MODE, also accepts x-dev-user-email header
 *
 * Returns UserContext on success, null on failure.
 */
export async function authenticateRequest(
  req: NextRequest,
  requiredScope: 'read' | 'write' | 'admin' = 'read'
): Promise<UserContext | null> {
  // DEV_MODE: accept x-dev-user-email header
  const isDevMode = process.env.DEV_MODE === 'true';
  if (isDevMode) {
    const devEmail = req.headers.get('x-dev-user-email');
    if (devEmail) {
      // In dev mode with email header, grant full access (no scope check)
      const { userService } = await import('@/services/user.service');
      const result = await userService.getCurrentUser({
        headers: { 'x-dev-user-email': devEmail },
        session: null,
      });
      if (result.success && result.data) {
        return result.data;
      }
    }
  }

  // Bearer vf_ token authentication
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer vf_')) return null;

  const token = authHeader.slice(7); // "Bearer ".length = 7
  const result = await authService.validateToken(token);
  if (!result.success || !result.data?.valid || !result.data.userId) return null;

  // Scope check
  const scopes = result.data.scopes || [];
  if (!scopes.includes(requiredScope)) return null;

  return {
    userId: result.data.userId,
    email: result.data.email || '',
    isDevMode: false,
    tokenScopes: scopes,
  };
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
