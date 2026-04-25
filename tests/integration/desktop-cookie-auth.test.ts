/**
 * Desktop Cookie Auth Integration Test
 *
 * Verifies that WebSocket connections authenticated via cookie extraHeaders
 * work correctly — the same auth path the desktop main process now uses.
 *
 * Flow:
 *   1. Login via NextAuth credentials endpoint → get session cookie
 *   2. Connect socket.io with extraHeaders: { Cookie: ... }
 *   3. Verify connection succeeds and initial SYNC_STATE is received
 *   4. Verify the user identity matches
 *
 * Runs against local dev server (localhost:3000).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import os from 'os';

const SERVER = process.env.VIBEFLOW_TEST_SERVER || 'http://localhost:3000';
const TEST_EMAIL = 'desktop-cookie-auth-test@vibeflow.local';
const TEST_PASSWORD = 'testpass123';
const DB_URL = process.env.VIBEFLOW_TEST_DB || `postgresql://${os.userInfo().username}@localhost:5432/vibeflow?schema=public`;
const prisma = new PrismaClient({ datasourceUrl: DB_URL });

function waitFor(socket: ClientSocket, event: string, ms = 5000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout waiting for "${event}" after ${ms}ms`)), ms);
    socket.once(event, (data: unknown) => { clearTimeout(t); resolve(data); });
  });
}

describe('Desktop Cookie Auth (real server)', () => {
  let serverAvailable = false;
  let sessionCookie: string | null = null;

  beforeAll(async () => {
    try {
      const resp = await fetch(`${SERVER}/api/health`);
      serverAvailable = resp.ok;
    } catch {
      console.log('⚠️  Server not running on localhost:3000 — skipping');
      return;
    }

    if (serverAvailable) {
      const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 12);
      await prisma.user.upsert({
        where: { email: TEST_EMAIL },
        update: { password: hashedPassword },
        create: { email: TEST_EMAIL, password: hashedPassword },
      });
    }
  });

  afterAll(async () => {
    try {
      const user = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
      if (user) {
        await prisma.apiToken.deleteMany({ where: { userId: user.id } });
        await prisma.pomodoro.deleteMany({ where: { userId: user.id } });
        await prisma.task.deleteMany({ where: { userId: user.id } });
        await prisma.dailyState.deleteMany({ where: { userId: user.id } });
        await prisma.stateTransitionLog.deleteMany({ where: { userId: user.id } });
        await prisma.userSettings.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
    } catch (error) {
      console.warn('[desktop-cookie-auth] cleanup error:', error);
    } finally {
      await prisma.$disconnect();
    }
  });

  // =========================================================================
  // 1. Get session cookie via NextAuth login
  // =========================================================================

  describe('NextAuth cookie acquisition', () => {
    it('should get CSRF token and session cookie via NextAuth credentials login', async () => {
      if (!serverAvailable) return;

      // Step 1: Get CSRF token from NextAuth
      const csrfResp = await fetch(`${SERVER}/api/auth/csrf`);
      expect(csrfResp.ok).toBe(true);
      const { csrfToken } = await csrfResp.json() as { csrfToken: string };
      expect(csrfToken).toBeTruthy();

      // Collect cookies from CSRF response
      const csrfCookies = csrfResp.headers.getSetCookie?.() ?? [];
      const csrfCookieHeader = csrfCookies.map(c => c.split(';')[0]).join('; ');

      // Step 2: Login via NextAuth credentials callback
      const loginResp = await fetch(`${SERVER}/api/auth/callback/credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: csrfCookieHeader,
        },
        body: new URLSearchParams({
          csrfToken,
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
        }),
        redirect: 'manual', // Don't follow redirect — we need the Set-Cookie headers
      });

      console.log('[Test] Login response status:', loginResp.status);

      // NextAuth redirects on success (302) and sets session cookie
      expect([200, 302]).toContain(loginResp.status);

      // Collect all Set-Cookie headers from login response
      const loginCookies = loginResp.headers.getSetCookie?.() ?? [];
      console.log('[Test] Login Set-Cookie headers:', loginCookies.length);

      // Combine CSRF + login cookies, then extract the session token
      const allCookies = [...csrfCookies, ...loginCookies];
      const cookiePairs = allCookies.map(c => c.split(';')[0]);

      // Deduplicate (later values override earlier for same name)
      const cookieMap = new Map<string, string>();
      for (const pair of cookiePairs) {
        const [name] = pair.split('=');
        cookieMap.set(name.trim(), pair);
      }
      sessionCookie = [...cookieMap.values()].join('; ');

      console.log('[Test] Session cookie names:', [...cookieMap.keys()]);

      // Verify session cookie contains a NextAuth session token
      const hasSessionToken = sessionCookie.includes('next-auth.session-token') ||
                               sessionCookie.includes('__Secure-next-auth.session-token');
      expect(hasSessionToken).toBe(true);
    });

    it('should validate session cookie via /api/auth/session', async () => {
      if (!serverAvailable || !sessionCookie) return;

      const resp = await fetch(`${SERVER}/api/auth/session`, {
        headers: { Cookie: sessionCookie },
      });

      expect(resp.ok).toBe(true);
      const data = await resp.json() as { user?: { email?: string } };
      console.log('[Test] Session validation result:', data);
      expect(data.user?.email).toBe(TEST_EMAIL);
    });
  });

  // =========================================================================
  // 2. WebSocket auth via cookie extraHeaders (Desktop path)
  // =========================================================================

  describe('WebSocket auth via cookie extraHeaders', () => {
    it('should connect and receive SYNC_STATE when using cookie in extraHeaders', async () => {
      if (!serverAvailable || !sessionCookie) return;

      const client = ioClient(SERVER, {
        transports: ['websocket'],
        auth: { clientType: 'desktop' },
        extraHeaders: { Cookie: sessionCookie },
      });

      await waitFor(client, 'connect');
      expect(client.connected).toBe(true);
      console.log('[Test] Socket connected with cookie auth');

      // Should receive initial SYNC_STATE or UPDATE_POLICY
      const cmd = await waitFor(client, 'OCTOPUS_COMMAND') as { commandType: string };
      console.log('[Test] Received command:', cmd.commandType);
      expect(['SYNC_STATE', 'UPDATE_POLICY']).toContain(cmd.commandType);

      client.disconnect();
    });

    it('should NOT connect as guest (no 30s auto-disconnect)', async () => {
      if (!serverAvailable || !sessionCookie) return;

      const client = ioClient(SERVER, {
        transports: ['websocket'],
        auth: { clientType: 'desktop' },
        extraHeaders: { Cookie: sessionCookie },
      });

      await waitFor(client, 'connect');

      // Wait 3 seconds — if we're a guest, the server would start the 30s disconnect timer.
      // A properly authenticated client stays connected and receives commands.
      const commands: unknown[] = [];
      const collectPromise = new Promise<void>((resolve) => {
        client.on('OCTOPUS_COMMAND', (data: unknown) => commands.push(data));
        setTimeout(resolve, 3000);
      });

      await collectPromise;

      // Should still be connected after 3 seconds
      expect(client.connected).toBe(true);
      // Should have received at least one command (SYNC_STATE or UPDATE_POLICY)
      expect(commands.length).toBeGreaterThan(0);
      console.log('[Test] Received', commands.length, 'commands, still connected after 3s');

      client.disconnect();
    });

    it('should fail auth with invalid/empty cookie', async () => {
      if (!serverAvailable) return;

      const client = ioClient(SERVER, {
        transports: ['websocket'],
        auth: { clientType: 'desktop' },
        extraHeaders: { Cookie: 'next-auth.session-token=invalid_garbage' },
      });

      await waitFor(client, 'connect');

      // Server allows guest connection but limits to AUTH_LOGIN/AUTH_VERIFY events.
      // An authenticated client would get OCTOPUS_COMMAND; a guest won't.
      const gotCommand = await Promise.race([
        waitFor(client, 'OCTOPUS_COMMAND').then(() => true),
        new Promise<false>(r => setTimeout(() => r(false), 2000)),
      ]);

      expect(gotCommand).toBe(false);
      console.log('[Test] Invalid cookie: no OCTOPUS_COMMAND received (expected)');

      client.disconnect();
    });
  });

  // =========================================================================
  // 3. HTTP auth via cookie (tRPC)
  // =========================================================================

  describe('HTTP auth via cookie (tRPC)', () => {
    it('should access protected tRPC endpoint with session cookie', async () => {
      if (!serverAvailable || !sessionCookie) return;

      const resp = await fetch(`${SERVER}/api/trpc/dailyState.getToday`, {
        headers: { Cookie: sessionCookie },
      });

      expect(resp.ok).toBe(true);
      const data = await resp.json() as { result?: { data?: { json?: unknown } } };
      expect(data.result?.data?.json).toBeDefined();
      console.log('[Test] tRPC dailyState.getToday succeeded with cookie auth');
    });
  });
});
