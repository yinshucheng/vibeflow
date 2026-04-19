/**
 * MCP tRPC HTTP Client
 *
 * Creates a tRPC client that connects to the VibeFlow server via HTTP.
 * Production: uses VIBEFLOW_API_KEY (vf_ token) as Bearer auth
 * Dev mode: uses x-dev-user-email header as fallback
 *
 * Requirements: R8.3
 */

import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '../server/routers/_app';

const serverUrl = process.env.VIBEFLOW_SERVER_URL || 'http://localhost:3000';
const apiKey = process.env.VIBEFLOW_API_KEY;
const isDev = process.env.NODE_ENV === 'development' || process.env.DEV_MODE === 'true';
const devEmail = process.env.MCP_USER_EMAIL || process.env.DEV_USER_EMAIL || 'dev@vibeflow.local';

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: `${serverUrl}/api/trpc`,
      transformer: superjson,
      headers() {
        const headers: Record<string, string> = {};

        // Production: Bearer token authentication
        if (apiKey) {
          headers['authorization'] = `Bearer ${apiKey}`;
        }

        // Dev mode: email header fallback (also sent alongside Bearer token for compatibility)
        if (isDev) {
          headers['x-dev-user-email'] = devEmail;
        }

        return headers;
      },
    }),
  ],
});

export { serverUrl, apiKey, devEmail };
