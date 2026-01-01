/**
 * Authentication Service
 * 
 * Handles API token management and validation for Octopus Architecture.
 * Requirements: 1.6, 13.2
 */

import { z } from 'zod';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import type { ApiToken } from '@prisma/client';
import type { ClientType } from '@/types/octopus';

// Service result type
export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

// Token creation input schema
export const CreateTokenSchema = z.object({
  name: z.string().min(1).max(100),
  clientType: z.enum(['web', 'desktop', 'browser_ext', 'mobile']),
  expiresInDays: z.number().min(1).max(365).optional(),
});

export type CreateTokenInput = z.infer<typeof CreateTokenSchema>;

// Token validation result
export interface TokenValidationResult {
  valid: boolean;
  userId?: string;
  clientType?: ClientType;
  tokenId?: string;
}

// Token info (without sensitive data)
export interface TokenInfo {
  id: string;
  name: string;
  clientType: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

/**
 * Generate a secure random token
 */
function generateToken(): string {
  return `vf_${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * Hash a token for storage
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export const authService = {
  /**
   * Create a new API token for a user
   * Requirements: 1.6, 13.2
   */
  async createToken(
    userId: string,
    input: CreateTokenInput
  ): Promise<ServiceResult<{ token: string; tokenInfo: TokenInfo }>> {
    try {
      const validated = CreateTokenSchema.parse(input);
      
      // Generate a new token
      const plainToken = generateToken();
      const hashedToken = hashToken(plainToken);
      
      // Calculate expiry date if specified
      const expiresAt = validated.expiresInDays
        ? new Date(Date.now() + validated.expiresInDays * 24 * 60 * 60 * 1000)
        : null;
      
      // Create the token record
      const apiToken = await prisma.apiToken.create({
        data: {
          userId,
          token: hashedToken,
          name: validated.name,
          clientType: validated.clientType,
          expiresAt,
        },
      });
      
      return {
        success: true,
        data: {
          token: plainToken, // Return plain token only once
          tokenInfo: {
            id: apiToken.id,
            name: apiToken.name,
            clientType: apiToken.clientType,
            lastUsedAt: apiToken.lastUsedAt,
            expiresAt: apiToken.expiresAt,
            createdAt: apiToken.createdAt,
          },
        },
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid token creation input',
            details: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create token',
        },
      };
    }
  },

  /**
   * Validate an API token
   * Requirements: 1.6, 13.2
   */
  async validateToken(token: string): Promise<ServiceResult<TokenValidationResult>> {
    try {
      // Check token format
      if (!token || !token.startsWith('vf_')) {
        return {
          success: true,
          data: { valid: false },
        };
      }
      
      const hashedToken = hashToken(token);
      
      // Find the token
      const apiToken = await prisma.apiToken.findUnique({
        where: { token: hashedToken },
        include: { user: true },
      });
      
      if (!apiToken) {
        return {
          success: true,
          data: { valid: false },
        };
      }
      
      // Check if token is revoked
      if (apiToken.revokedAt) {
        return {
          success: true,
          data: { valid: false },
        };
      }
      
      // Check if token is expired
      if (apiToken.expiresAt && apiToken.expiresAt < new Date()) {
        return {
          success: true,
          data: { valid: false },
        };
      }
      
      // Update last used timestamp (fire and forget)
      prisma.apiToken.update({
        where: { id: apiToken.id },
        data: { lastUsedAt: new Date() },
      }).catch(() => {
        // Ignore errors updating last used time
      });
      
      return {
        success: true,
        data: {
          valid: true,
          userId: apiToken.userId,
          clientType: apiToken.clientType as ClientType,
          tokenId: apiToken.id,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to validate token',
        },
      };
    }
  },

  /**
   * Get all tokens for a user
   * Requirements: 9.3
   */
  async getUserTokens(userId: string): Promise<ServiceResult<TokenInfo[]>> {
    try {
      const tokens = await prisma.apiToken.findMany({
        where: {
          userId,
          revokedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      });
      
      return {
        success: true,
        data: tokens.map((t) => ({
          id: t.id,
          name: t.name,
          clientType: t.clientType,
          lastUsedAt: t.lastUsedAt,
          expiresAt: t.expiresAt,
          createdAt: t.createdAt,
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get user tokens',
        },
      };
    }
  },

  /**
   * Revoke an API token
   * Requirements: 9.5
   */
  async revokeToken(userId: string, tokenId: string): Promise<ServiceResult<void>> {
    try {
      // Verify the token belongs to the user
      const token = await prisma.apiToken.findFirst({
        where: {
          id: tokenId,
          userId,
        },
      });
      
      if (!token) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Token not found',
          },
        };
      }
      
      // Revoke the token
      await prisma.apiToken.update({
        where: { id: tokenId },
        data: { revokedAt: new Date() },
      });
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to revoke token',
        },
      };
    }
  },

  /**
   * Revoke all tokens for a user
   */
  async revokeAllTokens(userId: string): Promise<ServiceResult<{ count: number }>> {
    try {
      const result = await prisma.apiToken.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      
      return {
        success: true,
        data: { count: result.count },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to revoke tokens',
        },
      };
    }
  },

  /**
   * Clean up expired tokens
   */
  async cleanupExpiredTokens(): Promise<ServiceResult<{ count: number }>> {
    try {
      const result = await prisma.apiToken.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            { revokedAt: { not: null } },
          ],
        },
      });
      
      return {
        success: true,
        data: { count: result.count },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to cleanup tokens',
        },
      };
    }
  },
};

export default authService;
