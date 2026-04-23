/**
 * Shared NextAuth Session Token Decoder
 *
 * Extracts and decodes NextAuth JWT session from raw cookie header strings.
 * Used by both tRPC context and Socket.io authentication where the standard
 * `getToken()` from next-auth/jwt doesn't work (it requires `req.cookies`
 * which raw `IncomingMessage` objects don't have).
 */

import { decode } from 'next-auth/jwt';

export interface SessionUser {
  id: string;
  email: string;
}

const DEFAULT_COOKIE_NAME = 'next-auth.session-token';
const SECURE_COOKIE_NAME = '__Secure-next-auth.session-token';

/**
 * Decode NextAuth session from a raw cookie header string.
 *
 * @param cookieHeader - The raw `Cookie` header value (semicolon-separated pairs)
 * @returns Decoded session user ({ id, email }) or null if not found / invalid
 */
export async function decodeSessionFromCookies(
  cookieHeader: string
): Promise<SessionUser | null> {
  if (!cookieHeader) return null;

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;

  // Determine cookie name based on NEXTAUTH_URL (same logic as next-auth)
  const isSecure = process.env.NEXTAUTH_URL?.startsWith('https://') ?? false;
  const cookieName = isSecure ? SECURE_COOKIE_NAME : DEFAULT_COOKIE_NAME;

  // Parse the target cookie from the raw header
  const sessionToken = cookieHeader
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith(`${cookieName}=`))
    ?.split('=')
    .slice(1)
    .join('=');

  if (!sessionToken) return null;

  try {
    const token = await decode({ token: sessionToken, secret });
    if (token?.id && token?.email) {
      return { id: token.id as string, email: token.email as string };
    }
    return null;
  } catch {
    return null;
  }
}
