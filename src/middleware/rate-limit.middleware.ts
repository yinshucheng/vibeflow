/**
 * Rate Limiting Middleware
 * 
 * Implements rate limiting for event submissions and API requests.
 * Requirements: 13.5
 */

import { NextRequest, NextResponse } from 'next/server';

// Rate limit configuration
export interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Maximum requests per window
  keyPrefix?: string;    // Prefix for rate limit keys
}

// Default configurations for different endpoints
export const RATE_LIMIT_CONFIGS = {
  // Event submission rate limit (100 events/minute per user)
  events: {
    windowMs: 60 * 1000,
    maxRequests: 100,
    keyPrefix: 'rl:events:',
  },
  // API requests rate limit (200 requests/minute per user)
  api: {
    windowMs: 60 * 1000,
    maxRequests: 200,
    keyPrefix: 'rl:api:',
  },
  // Auth attempts rate limit (10 attempts/minute per IP)
  auth: {
    windowMs: 60 * 1000,
    maxRequests: 10,
    keyPrefix: 'rl:auth:',
  },
  // Token creation rate limit (5 tokens/hour per user)
  tokenCreation: {
    windowMs: 60 * 60 * 1000,
    maxRequests: 5,
    keyPrefix: 'rl:token:',
  },
} as const;

// In-memory rate limit store (for single-instance deployments)
// In production, this should be replaced with Redis
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup interval for expired entries
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Start the cleanup interval for expired rate limit entries
 */
export function startRateLimitCleanup(): void {
  if (cleanupInterval) return;
  
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    const keysToDelete: string[] = [];
    rateLimitStore.forEach((entry, key) => {
      if (entry.resetAt <= now) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => rateLimitStore.delete(key));
  }, 60 * 1000); // Cleanup every minute
}

/**
 * Stop the cleanup interval
 */
export function stopRateLimitCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

/**
 * Check rate limit for a given key
 * Returns true if the request is allowed, false if rate limited
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetAt: number } {
  const fullKey = `${config.keyPrefix || ''}${key}`;
  const now = Date.now();
  
  let entry = rateLimitStore.get(fullKey);
  
  // If no entry or entry has expired, create a new one
  if (!entry || entry.resetAt <= now) {
    entry = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    rateLimitStore.set(fullKey, entry);
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: entry.resetAt,
    };
  }
  
  // Check if limit exceeded
  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }
  
  // Increment count
  entry.count++;
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Reset rate limit for a key (useful for testing)
 */
export function resetRateLimit(key: string, keyPrefix?: string): void {
  const fullKey = `${keyPrefix || ''}${key}`;
  rateLimitStore.delete(fullKey);
}

/**
 * Get current rate limit status for a key
 */
export function getRateLimitStatus(
  key: string,
  config: RateLimitConfig
): { count: number; remaining: number; resetAt: number } | null {
  const fullKey = `${config.keyPrefix || ''}${key}`;
  const entry = rateLimitStore.get(fullKey);
  
  if (!entry || entry.resetAt <= Date.now()) {
    return null;
  }
  
  return {
    count: entry.count,
    remaining: Math.max(0, config.maxRequests - entry.count),
    resetAt: entry.resetAt,
  };
}

/**
 * Rate limit result type
 */
export interface RateLimitResult {
  success: boolean;
  error?: {
    code: string;
    message: string;
    retryAfter: number;
  };
}

/**
 * Apply rate limiting for a user
 * Requirements: 13.5
 */
export function applyRateLimit(
  userId: string,
  configType: keyof typeof RATE_LIMIT_CONFIGS = 'api'
): RateLimitResult {
  const config = RATE_LIMIT_CONFIGS[configType];
  const result = checkRateLimit(userId, config);
  
  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    return {
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
        retryAfter,
      },
    };
  }
  
  return { success: true };
}

/**
 * Apply rate limiting for an IP address
 */
export function applyIpRateLimit(
  ipAddress: string,
  configType: keyof typeof RATE_LIMIT_CONFIGS = 'auth'
): RateLimitResult {
  const config = RATE_LIMIT_CONFIGS[configType];
  const result = checkRateLimit(`ip:${ipAddress}`, config);
  
  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    return {
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: `Too many requests from this IP. Please try again in ${retryAfter} seconds.`,
        retryAfter,
      },
    };
  }
  
  return { success: true };
}

/**
 * Next.js API route middleware for rate limiting
 */
export function withRateLimit(
  handler: (request: NextRequest) => Promise<NextResponse>,
  configType: keyof typeof RATE_LIMIT_CONFIGS = 'api'
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    // Get user ID from header or use IP as fallback
    const userId = request.headers.get('x-user-id');
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                      request.headers.get('x-real-ip') ||
                      'unknown';
    
    const key = userId || `ip:${ipAddress}`;
    const config = RATE_LIMIT_CONFIGS[configType];
    const result = checkRateLimit(key, config);
    
    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
            retryAfter,
          },
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(config.maxRequests),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
          },
        }
      );
    }
    
    // Add rate limit headers to response
    const response = await handler(request);
    response.headers.set('X-RateLimit-Limit', String(config.maxRequests));
    response.headers.set('X-RateLimit-Remaining', String(result.remaining));
    response.headers.set('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
    
    return response;
  };
}

// ============================================================================
// Socket.io Rate Limiting
// ============================================================================

/**
 * Rate limiter for Socket.io events
 * Requirements: 13.5
 */
export class SocketRateLimiter {
  private config: RateLimitConfig;
  
  constructor(config: RateLimitConfig = RATE_LIMIT_CONFIGS.events) {
    this.config = config;
  }
  
  /**
   * Check if an event from a user is allowed
   */
  checkEvent(userId: string): RateLimitResult {
    const result = checkRateLimit(userId, this.config);
    
    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
      return {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: `Event rate limit exceeded. Please wait ${retryAfter} seconds.`,
          retryAfter,
        },
      };
    }
    
    return { success: true };
  }
  
  /**
   * Check if a batch of events from a user is allowed
   */
  checkBatch(userId: string, batchSize: number): RateLimitResult {
    // For batches, we check if adding all events would exceed the limit
    const status = getRateLimitStatus(userId, this.config);
    const currentCount = status?.count || 0;
    
    if (currentCount + batchSize > this.config.maxRequests) {
      const remaining = Math.max(0, this.config.maxRequests - currentCount);
      const retryAfter = status ? Math.ceil((status.resetAt - Date.now()) / 1000) : 60;
      
      return {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: `Batch would exceed rate limit. Only ${remaining} events allowed. Please wait ${retryAfter} seconds.`,
          retryAfter,
        },
      };
    }
    
    // Consume the batch quota
    for (let i = 0; i < batchSize; i++) {
      checkRateLimit(userId, this.config);
    }
    
    return { success: true };
  }
  
  /**
   * Get remaining quota for a user
   */
  getRemainingQuota(userId: string): number {
    const status = getRateLimitStatus(userId, this.config);
    return status ? status.remaining : this.config.maxRequests;
  }
}

// Singleton instance for socket rate limiting
export const socketRateLimiter = new SocketRateLimiter();

// Start cleanup on module load
startRateLimitCleanup();
