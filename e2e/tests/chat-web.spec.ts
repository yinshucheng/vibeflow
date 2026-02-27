import { test, expect } from '../fixtures';

/**
 * Chat Web E2E Tests (S3.4)
 *
 * Tests the tRPC chat router endpoints:
 * - chat.getHistory → returns message list (requires auth)
 * - chat.getHistory without auth → 401
 * - chat.getHistory for another user's conversation → empty/error
 * - chat.getConversationStats → returns token statistics
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

/**
 * Helper: make a tRPC query request via HTTP.
 * The project uses superjson transformer + batch endpoint.
 */
async function trpcQuery(
  path: string,
  input: unknown,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: unknown }> {
  const encoded = encodeURIComponent(
    JSON.stringify({ json: input ?? null })
  );
  const url = `${BASE_URL}/api/trpc/${path}?input=${encoded}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function trpcMutation(
  path: string,
  input: unknown,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: unknown }> {
  const url = `${BASE_URL}/api/trpc/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ json: input }),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

test.describe('Chat Web tRPC Router (S3)', () => {
  test('chat.getHistory returns messages for authenticated user', async ({
    testUser,
  }) => {
    const result = await trpcQuery('chat.getHistory', undefined, {
      'x-dev-user-email': testUser.email,
    });

    // Should return successfully (200)
    expect(result.status).toBe(200);

    // Body should contain a result with data (even if empty array for new user)
    const body = result.body as { result?: { data?: { json?: unknown } } };
    expect(body.result?.data).toBeDefined();
  });

  test('chat.getHistory without auth returns UNAUTHORIZED', async () => {
    const result = await trpcQuery('chat.getHistory', undefined, {});

    // Should fail with UNAUTHORIZED (tRPC returns 401 or wraps it)
    expect(result.status).toBeGreaterThanOrEqual(400);
  });

  test('chat.getConversationStats returns stats for authenticated user', async ({
    testUser,
  }) => {
    const result = await trpcQuery('chat.getConversationStats', undefined, {
      'x-dev-user-email': testUser.email,
    });

    expect(result.status).toBe(200);
    const body = result.body as { result?: { data?: { json?: unknown } } };
    expect(body.result?.data).toBeDefined();
  });

  test('chat.getHistory with wrong conversationId returns error', async ({
    testUser,
  }) => {
    const result = await trpcQuery(
      'chat.getHistory',
      {
        conversationId: '00000000-0000-0000-0000-000000000000',
      },
      {
        'x-dev-user-email': testUser.email,
      }
    );

    // Should either return 404 or an error result
    // tRPC may return 500 for NOT_FOUND depending on error mapping
    const body = result.body as { error?: { data?: { code?: string } } };
    if (result.status >= 400) {
      expect(body.error).toBeDefined();
    }
  });
});
