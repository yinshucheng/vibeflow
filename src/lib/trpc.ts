/**
 * tRPC Client Configuration
 * 
 * Sets up the tRPC client for use in React components.
 */

import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@/server/routers/_app';

/**
 * tRPC React hooks
 */
export const trpc = createTRPCReact<AppRouter>();
