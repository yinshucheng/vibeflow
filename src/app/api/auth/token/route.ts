/**
 * API Token Endpoint
 *
 * POST — Issue a new API token (for mobile/desktop clients)
 *   Accepts: NextAuth session cookie OR { email, password } body
 *   Returns: { token: 'vf_xxx', expiresAt: string }
 *
 * GET — Verify a Bearer token
 *   Header: Authorization: Bearer vf_xxx
 *   Returns: { valid: true, user: { id, email } }
 *
 * DELETE — Revoke a Bearer token
 *   Header: Authorization: Bearer vf_xxx
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth';
import { authService } from '@/services/auth.service';
import { checkRateLimit, AUTH_RATE_LIMITS } from '@/lib/rate-limit';

const issueTokenBodySchema = z.object({
  email: z.string().email().optional(),
  password: z.string().optional(),
  clientType: z.enum(['web', 'desktop', 'browser_ext', 'mobile']).optional(),
  name: z.string().optional(),
});

/**
 * POST — Issue a new API token
 */
export async function POST(request: NextRequest) {
  // Rate limit: 5 requests per minute per IP
  const rateLimitResponse = checkRateLimit(request, AUTH_RATE_LIMITS.login);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = issueTokenBodySchema.parse(body);

    let userId: string | null = null;
    let userEmail: string | null = null;

    // Method 1: Authenticate via NextAuth session cookie
    const jwtToken = await getToken({
      req: request as Parameters<typeof getToken>[0]['req'],
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (jwtToken?.id && jwtToken?.email) {
      userId = jwtToken.id as string;
      userEmail = jwtToken.email as string;
    }

    // Method 2: Authenticate via email + password in body
    if (!userId && parsed.email) {
      const user = await prisma.user.findUnique({
        where: { email: parsed.email },
      });

      if (user) {
        if (process.env.DEV_MODE === 'true' && user.password === 'dev_mode_no_password') {
          // DEV_MODE only: allow passwordless login for dev users
          userId = user.id;
          userEmail = user.email;
        } else if (user.password === 'dev_mode_no_password') {
          // Production: reject dev-mode users who haven't set a real password
          return NextResponse.json(
            { success: false, error: { code: 'AUTH_ERROR', message: 'Invalid credentials' } },
            { status: 401 }
          );
        } else if (parsed.password) {
          const valid = await verifyPassword(parsed.password, user.password);
          if (valid) {
            userId = user.id;
            userEmail = user.email;
          }
        }
      }

      // Auto-create user in DEV_MODE only
      if (!userId && process.env.DEV_MODE === 'true' && parsed.email) {
        const newUser = await prisma.user.upsert({
          where: { email: parsed.email },
          update: {},
          create: {
            email: parsed.email,
            password: 'dev_mode_no_password',
            settings: { create: {} },
          },
        });
        userId = newUser.id;
        userEmail = newUser.email;
      }

      if (!userId) {
        return NextResponse.json(
          { success: false, error: { code: 'AUTH_ERROR', message: 'Invalid credentials' } },
          { status: 401 }
        );
      }
    }

    if (!userId || !userEmail) {
      return NextResponse.json(
        { success: false, error: { code: 'AUTH_ERROR', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    // Create API token
    const clientType = parsed.clientType || 'mobile';
    const name = parsed.name || `${clientType}-${new Date().toISOString().slice(0, 10)}`;
    const result = await authService.createToken(userId, {
      name,
      clientType,
      expiresInDays: 90,
    });

    if (!result.success || !result.data) {
      return NextResponse.json(
        { success: false, error: result.error || { code: 'INTERNAL_ERROR', message: 'Failed to create token' } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      token: result.data.token,
      expiresAt: result.data.tokenInfo.expiresAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: error.flatten().fieldErrors } },
        { status: 400 }
      );
    }
    console.error('Token creation error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create token' } },
      { status: 500 }
    );
  }
}

/**
 * GET — Verify a Bearer token
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer vf_')) {
      return NextResponse.json(
        { valid: false, error: { code: 'AUTH_ERROR', message: 'Bearer token required' } },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7); // "Bearer ".length = 7
    const result = await authService.validateToken(token);

    if (!result.success || !result.data?.valid || !result.data.userId) {
      return NextResponse.json({ valid: false }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: result.data.userId },
      select: { id: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ valid: false }, { status: 401 });
    }

    return NextResponse.json({
      valid: true,
      user: { id: user.id, email: user.email },
    });
  } catch (error) {
    console.error('Token verification error:', error);
    return NextResponse.json(
      { valid: false, error: { code: 'INTERNAL_ERROR', message: 'Verification failed' } },
      { status: 500 }
    );
  }
}

/**
 * DELETE — Revoke a Bearer token
 */
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer vf_')) {
      return NextResponse.json(
        { success: false, error: { code: 'AUTH_ERROR', message: 'Bearer token required' } },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);
    const validationResult = await authService.validateToken(token);

    if (!validationResult.success || !validationResult.data?.valid || !validationResult.data.tokenId) {
      return NextResponse.json(
        { success: false, error: { code: 'AUTH_ERROR', message: 'Invalid token' } },
        { status: 401 }
      );
    }

    const revokeResult = await authService.revokeToken(
      validationResult.data.userId!,
      validationResult.data.tokenId
    );

    if (!revokeResult.success) {
      return NextResponse.json(
        { success: false, error: revokeResult.error },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Token revocation error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Revocation failed' } },
      { status: 500 }
    );
  }
}
