/**
 * tRPC Server Configuration
 * 
 * This file sets up the tRPC server with context, middleware, and procedures.
 * Requirements: 7.1, 8.5
 */

import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';
import { getToken } from 'next-auth/jwt';
import { userService, type UserContext } from '@/services/user.service';

/**
 * Context type for tRPC procedures
 */
export interface Context {
  user: UserContext | null;
  headers: Record<string, string | undefined>;
}

/**
 * Create context from request headers
 * Handles both dev mode and production authentication
 */
export async function createContext(opts: {
  headers: Headers;
}): Promise<Context> {
  const headers: Record<string, string | undefined> = {};
  opts.headers.forEach((value, key) => {
    headers[key] = value;
  });

  // Parse NextAuth JWT token from cookies (production mode)
  let session: { user: { id: string; email: string } } | null = null;
  if (!userService.isDevModeEnabled()) {
    try {
      const token = await getToken({
        req: { headers: opts.headers } as Parameters<typeof getToken>[0]['req'],
        secret: process.env.NEXTAUTH_SECRET,
      });
      if (token?.id && token?.email) {
        session = {
          user: {
            id: token.id as string,
            email: token.email as string,
          },
        };
      }
    } catch {
      // Token parsing failed, continue without session
    }
  }

  // Get user from dev mode, session, or API token
  const userResult = await userService.getCurrentUser({ headers, session });

  return {
    user: userResult.success ? userResult.data ?? null : null,
    headers,
  };
}

/**
 * Initialize tRPC with context and transformer
 */
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Export reusable router and procedure helpers
 */
export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

/**
 * Middleware to enforce authentication
 */
const enforceAuth = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

/**
 * Protected procedure - requires authentication
 */
export const protectedProcedure = t.procedure.use(enforceAuth);

/**
 * Middleware to validate system state for certain operations
 */
export const withStateValidation = (allowedStates: string[]) =>
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    // Import dynamically to avoid circular dependencies
    const { dailyStateService } = await import('@/services/daily-state.service');
    
    const stateResult = await dailyStateService.getCurrentState(ctx.user.userId);
    
    if (!stateResult.success || !stateResult.data) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get system state',
      });
    }

    if (!allowedStates.includes(stateResult.data)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Operation not allowed in ${stateResult.data} state`,
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
        systemState: stateResult.data,
      },
    });
  });
