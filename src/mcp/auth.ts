/**
 * MCP Authentication Module
 *
 * Handles API token authentication for MCP connections.
 * Uses tRPC HTTP client instead of direct Prisma access.
 *
 * Requirements: 9.2
 */

import { trpcClient } from './trpc-client';

/**
 * MCP Context containing authenticated user information
 */
export interface MCPContext {
  userId: string;
  email: string;
  isAuthenticated: boolean;
  agentId?: string; // Optional agent identifier for audit logging
}

/**
 * Authentication result
 */
export interface AuthResult {
  success: boolean;
  context?: MCPContext;
  error?: string;
}

// In-process cache for userId (avoids repeated whoami calls)
let cachedContext: MCPContext | null = null;

/**
 * Authenticate an API token and return the user context
 *
 * Token format: vibeflow_<userId>_<secret>
 * In development mode, accepts: dev_<email> format
 *
 * Requirements: 9.2
 */
export async function authenticateToken(token?: string): Promise<AuthResult> {
  // If we already have a cached context, return it
  if (cachedContext) {
    return { success: true, context: cachedContext };
  }

  const isDev = process.env.NODE_ENV === 'development' || process.env.DEV_MODE === 'true';

  if (!token) {
    if (isDev) {
      return authenticateViaRemote(process.env.DEV_USER_EMAIL || process.env.MCP_USER_EMAIL || 'dev@vibeflow.local');
    }
    return { success: false, error: 'API token required' };
  }

  // Check for dev token format: dev_<email>
  if (isDev && token.startsWith('dev_')) {
    const email = token.substring(4);
    return authenticateViaRemote(email);
  }

  // Production token format: vibeflow_<userId>_<secret>
  if (token.startsWith('vibeflow_')) {
    const parts = token.split('_');
    if (parts.length >= 3) {
      // For production tokens, we still call whoami to validate
      return authenticateViaRemote();
    }
  }

  return { success: false, error: 'Invalid token format' };
}

/**
 * Authenticate by calling the remote server's whoami endpoint
 */
async function authenticateViaRemote(email?: string): Promise<AuthResult> {
  try {
    // The tRPC client already sends x-dev-user-email header from MCP_USER_EMAIL env var
    // If a specific email is provided, we trust the header set in trpc-client.ts
    const whoami = await trpcClient.mcpBridge.whoami.query();

    cachedContext = {
      userId: whoami.userId,
      email: email || whoami.email,
      isAuthenticated: true,
    };

    return { success: true, context: cachedContext };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Authentication failed',
    };
  }
}

/**
 * Generate an API token for a user (for future use)
 */
export function generateApiToken(userId: string): string {
  const secret = Math.random().toString(36).substring(2, 15);
  return `vibeflow_${userId}_${secret}`;
}
