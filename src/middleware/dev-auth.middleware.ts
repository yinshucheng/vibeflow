import { NextRequest, NextResponse } from 'next/server';
import { userService, UserContext } from '@/services/user.service';

/**
 * Development mode authentication middleware
 * Extracts user from X-Dev-User-Email header or uses default dev user
 */
export async function devAuthMiddleware(
  request: NextRequest
): Promise<{ user: UserContext | null; response?: NextResponse }> {
  // Check if dev mode is enabled
  if (!userService.isDevModeEnabled()) {
    return { user: null };
  }

  const headers: Record<string, string | undefined> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const result = await userService.getCurrentUser({ headers });

  if (!result.success || !result.data) {
    return {
      user: null,
      response: NextResponse.json(
        {
          success: false,
          error: result.error || { code: 'AUTH_ERROR', message: 'Authentication failed' },
        },
        { status: 401 }
      ),
    };
  }

  return { user: result.data };
}

/**
 * Helper to extract user context from request in API routes
 */
export async function getUserFromRequest(request: NextRequest): Promise<UserContext | null> {
  const { user } = await devAuthMiddleware(request);
  return user;
}

/**
 * Wrapper for API route handlers that require authentication
 */
export function withDevAuth<T>(
  handler: (request: NextRequest, user: UserContext) => Promise<NextResponse<T>>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const { user, response } = await devAuthMiddleware(request);

    if (response) {
      return response;
    }

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'AUTH_ERROR', message: 'Authentication required' },
        },
        { status: 401 }
      );
    }

    return handler(request, user);
  };
}
