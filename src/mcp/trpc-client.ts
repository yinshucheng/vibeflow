/**
 * MCP tRPC HTTP Client
 *
 * Creates a tRPC client that connects to the remote VibeFlow server
 * via HTTP, replacing direct Prisma database access.
 */

import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '../server/routers/_app';

const serverUrl = process.env.VIBEFLOW_SERVER_URL || 'http://39.105.213.147:4000';
const userEmail = process.env.MCP_USER_EMAIL || 'dev@vibeflow.local';

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: `${serverUrl}/api/trpc`,
      transformer: superjson,
      headers() {
        return {
          'x-dev-user-email': userEmail,
        };
      },
    }),
  ],
});

export { serverUrl, userEmail };
