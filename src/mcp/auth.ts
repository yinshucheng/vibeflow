/**
 * MCP Authentication Module
 * 
 * Handles API token authentication for MCP connections.
 * 
 * Requirements: 9.2
 */

import prisma from '../lib/prisma';

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

/**
 * Authenticate an API token and return the user context
 * 
 * Token format: vibeflow_<userId>_<secret>
 * In development mode, accepts: dev_<email> format
 * 
 * Requirements: 9.2
 */
export async function authenticateToken(token?: string): Promise<AuthResult> {
  // Development mode: allow simplified token format
  const isDev = process.env.NODE_ENV === 'development' || process.env.DEV_MODE === 'true';
  
  if (!token) {
    if (isDev) {
      // In dev mode, use default user if no token provided
      return authenticateDevUser(process.env.DEV_USER_EMAIL || 'dev@vibeflow.local');
    }
    return {
      success: false,
      error: 'API token required',
    };
  }

  // Check for dev token format: dev_<email>
  if (isDev && token.startsWith('dev_')) {
    const email = token.substring(4);
    return authenticateDevUser(email);
  }

  // Production token format: vibeflow_<userId>_<secret>
  if (token.startsWith('vibeflow_')) {
    const parts = token.split('_');
    if (parts.length >= 3) {
      const userId = parts[1];
      return authenticateByUserId(userId);
    }
  }

  return {
    success: false,
    error: 'Invalid token format',
  };
}

/**
 * Authenticate a development user by email
 */
async function authenticateDevUser(email: string): Promise<AuthResult> {
  try {
    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Create dev user if doesn't exist
      user = await prisma.user.create({
        data: {
          email,
          password: 'dev_mode_no_password',
        },
      });
    }

    return {
      success: true,
      context: {
        userId: user.id,
        email: user.email,
        isAuthenticated: true,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Authentication failed',
    };
  }
}

/**
 * Authenticate by user ID (for production tokens)
 */
async function authenticateByUserId(userId: string): Promise<AuthResult> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return {
        success: false,
        error: 'User not found',
      };
    }

    return {
      success: true,
      context: {
        userId: user.id,
        email: user.email,
        isAuthenticated: true,
      },
    };
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
