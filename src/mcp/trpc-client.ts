/**
 * MCP tRPC HTTP Client
 *
 * Creates a tRPC client that connects to the VibeFlow server via HTTP.
 * Auth: VIBEFLOW_API_KEY (vf_ token) as Bearer header.
 *
 * Requirements: R8.3
 */

import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '../server/routers/_app';

const serverUrl = process.env.VIBEFLOW_SERVER_URL || 'http://localhost:3000';
const apiKey = process.env.VIBEFLOW_API_KEY;

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: `${serverUrl}/api/trpc`,
      transformer: superjson,
      headers() {
        const headers: Record<string, string> = {};

        if (apiKey) {
          headers['authorization'] = `Bearer ${apiKey}`;
        }

        return headers;
      },
    }),
  ],
});

export { serverUrl, apiKey };
