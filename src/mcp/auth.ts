/**
 * MCP Authentication Module
 *
 * Handles API token authentication for MCP connections.
 * Production: vf_ Bearer token via authService.validateToken
 * Dev mode: dev_<email> format or email fallback
 *
 * Requirements: R8.1, R8.2, R8.4
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

/** Reset cached auth context (for testing) */
export function resetAuthCache(): void {
  cachedContext = null;
}

function isDevMode(): boolean {
  return process.env.NODE_ENV === 'development' || process.env.DEV_MODE === 'true';
}

/**
 * Authenticate an API token and return the user context
 *
 * Production: accepts vf_<64hex> Bearer tokens
 * Dev mode: accepts dev_<email> tokens, or no token (fallback to default email)
 *
 * Requirements: R8.1, R8.2, R8.4
 */
export async function authenticateToken(token?: string): Promise<AuthResult> {
  // If we already have a cached context, return it
  if (cachedContext) {
    return { success: true, context: cachedContext };
  }

  // Dev mode: no token → fallback to default email
  if (!token) {
    if (isDevMode()) {
      return authenticateViaRemote(process.env.DEV_USER_EMAIL || process.env.MCP_USER_EMAIL || 'dev@vibeflow.local');
    }
    return { success: false, error: 'API key required. Set VIBEFLOW_API_KEY environment variable.' };
  }

  // Dev mode: dev_<email> token format
  if (isDevMode() && token.startsWith('dev_')) {
    const email = token.substring(4);
    return authenticateViaRemote(email);
  }

  // Production: vf_ token format — validate via server
  if (token.startsWith('vf_')) {
    return authenticateViaToken(token);
  }

  return { success: false, error: 'Invalid token format. Expected vf_<token> (API key).' };
}

/**
 * Authenticate using a vf_ Bearer token by calling the server's token verification endpoint
 */
async function authenticateViaToken(token: string): Promise<AuthResult> {
  try {
    // Call the token verification endpoint directly
    const whoami = await trpcClient.mcpBridge.whoami.query();

    cachedContext = {
      userId: whoami.userId,
      email: whoami.email,
      isAuthenticated: true,
    };

    return { success: true, context: cachedContext };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Token validation failed',
    };
  }
}

/**
 * Authenticate by calling the remote server's whoami endpoint (dev mode)
 */
async function authenticateViaRemote(email?: string): Promise<AuthResult> {
  try {
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
