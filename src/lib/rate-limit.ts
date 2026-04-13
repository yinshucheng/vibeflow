/**
 * In-memory IP-based Rate Limiter
 *
 * Simple sliding-window rate limiter using Map.
 * Suitable for single-instance deployments (no Redis needed).
 * Requirements: R7.10
 */

import { NextRequest, NextResponse } from 'next/server';

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  const cutoff = now - windowMs;
  store.forEach((entry, key) => {
    entry.timestamps = entry.timestamps.filter((t: number) => t > cutoff);
    if (entry.timestamps.length === 0) {
      store.delete(key);
    }
  });
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}

interface RateLimitConfig {
  /** Max requests allowed in the window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

/**
 * Check rate limit for a request.
 * Returns null if allowed, or a 429 response if rate-limited.
 */
export function checkRateLimit(
  req: NextRequest,
  config: RateLimitConfig
): NextResponse | null {
  const ip = getClientIp(req);
  const key = `${ip}`;
  const now = Date.now();
  const cutoff = now - config.windowMs;

  cleanup(config.windowMs);

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t: number) => t > cutoff);

  if (entry.timestamps.length >= config.limit) {
    const retryAfter = Math.ceil(
      (entry.timestamps[0] + config.windowMs - now) / 1000
    );
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: '请求过于频繁，请稍后再试',
        },
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
        },
      }
    );
  }

  entry.timestamps.push(now);
  return null;
}

/** Rate limit configs for auth endpoints */
export const AUTH_RATE_LIMITS = {
  /** Login: 5 requests per minute per IP */
  login: { limit: 5, windowMs: 60 * 1000 } as RateLimitConfig,
  /** Register: 3 requests per minute per IP */
  register: { limit: 3, windowMs: 60 * 1000 } as RateLimitConfig,
};
