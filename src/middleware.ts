import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicPaths = ['/login', '/register', '/api/auth', '/api/health', '/api/skill'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths — allow through (auth handled by route handlers themselves)
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // DEV_MODE — allow everything through
  if (process.env.DEV_MODE === 'true') {
    return NextResponse.next();
  }

  // API routes with Bearer token — let tRPC/route handlers handle auth
  const authHeader = request.headers.get('authorization');
  if (pathname.startsWith('/api/') && authHeader?.startsWith('Bearer ')) {
    return NextResponse.next();
  }

  // Check NextAuth JWT token (for browser/cookie-based sessions)
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    // API routes without auth → return 401 JSON instead of redirect
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    // Page routes → redirect to login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
