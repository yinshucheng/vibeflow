import fc from 'fast-check';
import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Feature: browser-sentinel-enhancement
 * Property 6: Entertainment Blacklist Domain Blocking
 * Property 7: Entertainment Whitelist Override
 * Validates: Requirements 2.1, 2.3, 2.5, 2.6, 2.7
 */

// ============================================================================
// Types (mirroring browser-sentinel types for testing)
// ============================================================================

interface EntertainmentBlacklistEntry {
  domain: string;
  isPreset: boolean;
  enabled: boolean;
  addedAt: number;
}

interface EntertainmentWhitelistEntry {
  pattern: string;
  description?: string;
  isPreset: boolean;
  enabled: boolean;
  addedAt: number;
}

interface EntertainmentConfig {
  blacklist: EntertainmentBlacklistEntry[];
  whitelist: EntertainmentWhitelistEntry[];
  quotaMinutes: number;
  cooldownMinutes: number;
  lastSync: number;
}

// ============================================================================
// Constants
// ============================================================================

const PRESET_ENTERTAINMENT_BLACKLIST: string[] = [
  'twitter.com',
  'x.com',
  'weibo.com',
  'youtube.com',
  'bilibili.com',
  'tiktok.com',
  'douyin.com',
  'instagram.com',
  'facebook.com',
  'reddit.com',
  'twitch.tv',
];

const PRESET_ENTERTAINMENT_WHITELIST: string[] = [
  'weibo.com/fav/*',
  'twitter.com/i/bookmarks',
  'bilibili.com/video/*',
  'bilibili.com/search/*',
];

// ============================================================================
// Entertainment Manager Logic (extracted for testing)
// ============================================================================

/**
 * Extract hostname from URL
 */
function extractHostname(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Check if hostname matches any domain pattern
 * Supports exact match and subdomain matching
 */
function matchesDomainPatterns(hostname: string, patterns: string[]): boolean {
  const lowerHostname = hostname.toLowerCase();

  return patterns.some(pattern => {
    const lowerPattern = pattern.toLowerCase();

    // Exact match
    if (lowerHostname === lowerPattern) {
      return true;
    }

    // Subdomain match (e.g., www.twitter.com matches twitter.com)
    if (lowerHostname.endsWith('.' + lowerPattern)) {
      return true;
    }

    return false;
  });
}

/**
 * Match URL against glob pattern
 * Supports * as wildcard for any characters
 */
function matchGlobPattern(url: string, pattern: string): boolean {
  // Convert glob pattern to regex
  // Escape special regex characters except *
  const regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');

  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(url);
}

/**
 * Check if URL matches any whitelist pattern
 * Supports glob-style patterns with * wildcard
 */
function matchesUrlPatterns(url: string, patterns: string[]): boolean {
  try {
    const urlObj = new URL(url);
    const urlWithoutProtocol = urlObj.hostname + urlObj.pathname;
    const lowerUrl = urlWithoutProtocol.toLowerCase();

    return patterns.some(pattern => {
      const lowerPattern = pattern.toLowerCase();
      return matchGlobPattern(lowerUrl, lowerPattern);
    });
  } catch {
    return false;
  }
}

/**
 * Check if a URL is an entertainment site (matches blacklist)
 */
function isEntertainmentSite(url: string, config: EntertainmentConfig): boolean {
  const hostname = extractHostname(url);
  if (!hostname) return false;

  const enabledBlacklist = config.blacklist
    .filter(entry => entry.enabled)
    .map(entry => entry.domain);

  return matchesDomainPatterns(hostname, enabledBlacklist);
}

/**
 * Check if a URL is whitelisted (allowed even if domain is blacklisted)
 */
function isWhitelisted(url: string, config: EntertainmentConfig): boolean {
  const enabledWhitelist = config.whitelist
    .filter(entry => entry.enabled)
    .map(entry => entry.pattern);

  return matchesUrlPatterns(url, enabledWhitelist);
}

/**
 * Check if a URL should be blocked as entertainment
 * Returns true if URL is entertainment site AND not whitelisted
 */
function shouldBlockAsEntertainment(url: string, config: EntertainmentConfig): boolean {
  // If whitelisted, never block
  if (isWhitelisted(url, config)) {
    return false;
  }

  // Block if it's an entertainment site
  return isEntertainmentSite(url, config);
}

// ============================================================================
// Test Helpers
// ============================================================================

function createDefaultConfig(): EntertainmentConfig {
  return {
    blacklist: PRESET_ENTERTAINMENT_BLACKLIST.map(domain => ({
      domain,
      isPreset: true,
      enabled: true,
      addedAt: Date.now(),
    })),
    whitelist: PRESET_ENTERTAINMENT_WHITELIST.map(pattern => ({
      pattern,
      isPreset: true,
      enabled: true,
      addedAt: Date.now(),
    })),
    quotaMinutes: 120,
    cooldownMinutes: 30,
    lastSync: Date.now(),
  };
}

// Arbitrary generators
const domainArbitrary = fc.stringMatching(/^[a-z][a-z0-9-]{0,20}\.[a-z]{2,6}$/);
const subdomainArbitrary = fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/);
const pathArbitrary = fc.stringMatching(/^\/[a-z0-9\/-]{0,30}$/);

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 6: Entertainment Blacklist Domain Blocking', () => {
  /**
   * Property: Blacklisted domains are blocked when not in entertainment mode
   * For any URL whose domain matches an enabled Entertainment Blacklist entry,
   * when NOT in Entertainment Mode AND within work time, the URL SHALL be blocked.
   * Validates: Requirements 2.1, 2.3
   */

  let config: EntertainmentConfig;

  beforeEach(() => {
    config = createDefaultConfig();
  });

  it('should block URLs from preset blacklisted domains', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...PRESET_ENTERTAINMENT_BLACKLIST),
        pathArbitrary,
        async (domain, path) => {
          const url = `https://${domain}${path}`;
          
          // Property: URLs from blacklisted domains should be identified as entertainment sites
          const isEntertainment = isEntertainmentSite(url, config);
          expect(isEntertainment).toBe(true);
          
          // Property: Should be blocked (assuming not whitelisted)
          // Check if this specific URL is whitelisted
          const whitelisted = isWhitelisted(url, config);
          const shouldBlock = shouldBlockAsEntertainment(url, config);
          
          // If not whitelisted, should be blocked
          if (!whitelisted) {
            expect(shouldBlock).toBe(true);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should block URLs from subdomains of blacklisted domains', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...PRESET_ENTERTAINMENT_BLACKLIST),
        subdomainArbitrary,
        pathArbitrary,
        async (domain, subdomain, path) => {
          const url = `https://${subdomain}.${domain}${path}`;
          
          // Property: Subdomains of blacklisted domains should also be blocked
          const isEntertainment = isEntertainmentSite(url, config);
          expect(isEntertainment).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not block URLs from non-blacklisted domains', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          'github.com',
          'stackoverflow.com',
          'google.com',
          'docs.google.com',
          'notion.so',
          'linear.app',
          'figma.com'
        ),
        pathArbitrary,
        async (domain, path) => {
          const url = `https://${domain}${path}`;
          
          // Property: Non-blacklisted domains should not be identified as entertainment
          const isEntertainment = isEntertainmentSite(url, config);
          expect(isEntertainment).toBe(false);
          
          // Property: Should not be blocked
          const shouldBlock = shouldBlockAsEntertainment(url, config);
          expect(shouldBlock).toBe(false);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should respect enabled/disabled state of blacklist entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...PRESET_ENTERTAINMENT_BLACKLIST),
        fc.boolean(),
        pathArbitrary,
        async (domain, enabled, path) => {
          // Create config with specific enabled state
          const testConfig: EntertainmentConfig = {
            ...config,
            blacklist: [{
              domain,
              isPreset: true,
              enabled,
              addedAt: Date.now(),
            }],
          };
          
          const url = `https://${domain}${path}`;
          const isEntertainment = isEntertainmentSite(url, testConfig);
          
          // Property: Only enabled entries should block
          if (enabled) {
            expect(isEntertainment).toBe(true);
          } else {
            expect(isEntertainment).toBe(false);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle custom blacklist entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        domainArbitrary,
        pathArbitrary,
        async (customDomain, path) => {
          // Add custom domain to blacklist
          const testConfig: EntertainmentConfig = {
            ...config,
            blacklist: [
              ...config.blacklist,
              {
                domain: customDomain,
                isPreset: false,
                enabled: true,
                addedAt: Date.now(),
              },
            ],
          };
          
          const url = `https://${customDomain}${path}`;
          const isEntertainment = isEntertainmentSite(url, testConfig);
          
          // Property: Custom blacklist entries should also block
          expect(isEntertainment).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 7: Entertainment Whitelist Override', () => {
  /**
   * Property: Whitelisted URLs are allowed even if domain is blacklisted
   * For any URL that matches both an Entertainment Blacklist domain AND 
   * an Entertainment Whitelist pattern, the URL SHALL be allowed 
   * (whitelist takes precedence).
   * Validates: Requirements 2.5, 2.6, 2.7
   */

  let config: EntertainmentConfig;

  beforeEach(() => {
    config = createDefaultConfig();
  });

  it('should allow whitelisted URLs even when domain is blacklisted', async () => {
    // Test specific whitelist patterns
    const whitelistTestCases = [
      { url: 'https://weibo.com/fav/123', pattern: 'weibo.com/fav/*' },
      { url: 'https://weibo.com/fav/abc/def', pattern: 'weibo.com/fav/*' },
      { url: 'https://twitter.com/i/bookmarks', pattern: 'twitter.com/i/bookmarks' },
      { url: 'https://bilibili.com/video/BV123', pattern: 'bilibili.com/video/*' },
      { url: 'https://bilibili.com/search/all', pattern: 'bilibili.com/search/*' },
    ];

    for (const testCase of whitelistTestCases) {
      const isEntertainment = isEntertainmentSite(testCase.url, config);
      const whitelisted = isWhitelisted(testCase.url, config);
      const shouldBlock = shouldBlockAsEntertainment(testCase.url, config);
      
      // Property: URL should be from entertainment domain
      expect(isEntertainment).toBe(true);
      
      // Property: URL should be whitelisted
      expect(whitelisted).toBe(true);
      
      // Property: Whitelisted URL should NOT be blocked
      expect(shouldBlock).toBe(false);
    }
  });

  it('should block non-whitelisted URLs from blacklisted domains', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          'https://twitter.com/home',
          'https://twitter.com/explore',
          'https://twitter.com/notifications',
          'https://weibo.com/home',
          'https://weibo.com/hot',
          'https://bilibili.com/',
          'https://bilibili.com/anime',
          'https://youtube.com/watch?v=123',
          'https://reddit.com/r/all'
        ),
        async (url) => {
          const isEntertainment = isEntertainmentSite(url, config);
          const whitelisted = isWhitelisted(url, config);
          const shouldBlock = shouldBlockAsEntertainment(url, config);
          
          // Property: URL should be from entertainment domain
          expect(isEntertainment).toBe(true);
          
          // Property: URL should NOT be whitelisted
          expect(whitelisted).toBe(false);
          
          // Property: Non-whitelisted entertainment URL should be blocked
          expect(shouldBlock).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should respect enabled/disabled state of whitelist entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        async (enabled) => {
          // Create config with specific enabled state for whitelist
          const testConfig: EntertainmentConfig = {
            ...config,
            whitelist: [{
              pattern: 'weibo.com/fav/*',
              isPreset: true,
              enabled,
              addedAt: Date.now(),
            }],
          };
          
          const url = 'https://weibo.com/fav/123';
          const whitelisted = isWhitelisted(url, testConfig);
          const shouldBlock = shouldBlockAsEntertainment(url, testConfig);
          
          // Property: Only enabled whitelist entries should allow
          if (enabled) {
            expect(whitelisted).toBe(true);
            expect(shouldBlock).toBe(false);
          } else {
            expect(whitelisted).toBe(false);
            expect(shouldBlock).toBe(true);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle custom whitelist patterns', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...PRESET_ENTERTAINMENT_BLACKLIST),
        fc.stringMatching(/^\/[a-z]{1,10}\/\*$/),
        async (domain, pathPattern) => {
          // Add custom whitelist pattern
          const customPattern = `${domain}${pathPattern}`;
          const testConfig: EntertainmentConfig = {
            ...config,
            whitelist: [
              ...config.whitelist,
              {
                pattern: customPattern,
                isPreset: false,
                enabled: true,
                addedAt: Date.now(),
              },
            ],
          };
          
          // Generate a URL that matches the pattern
          const pathBase = pathPattern.replace('/*', '');
          const url = `https://${domain}${pathBase}/test123`;
          
          const whitelisted = isWhitelisted(url, testConfig);
          const shouldBlock = shouldBlockAsEntertainment(url, testConfig);
          
          // Property: Custom whitelist patterns should also allow
          expect(whitelisted).toBe(true);
          expect(shouldBlock).toBe(false);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should correctly match glob patterns with wildcards', async () => {
    const testCases = [
      // Pattern: weibo.com/fav/*
      { pattern: 'weibo.com/fav/*', url: 'https://weibo.com/fav/', expected: true },
      { pattern: 'weibo.com/fav/*', url: 'https://weibo.com/fav/123', expected: true },
      { pattern: 'weibo.com/fav/*', url: 'https://weibo.com/fav/abc/def', expected: true },
      { pattern: 'weibo.com/fav/*', url: 'https://weibo.com/home', expected: false },
      { pattern: 'weibo.com/fav/*', url: 'https://weibo.com/favorites', expected: false },
      
      // Pattern: twitter.com/i/bookmarks (exact match)
      { pattern: 'twitter.com/i/bookmarks', url: 'https://twitter.com/i/bookmarks', expected: true },
      { pattern: 'twitter.com/i/bookmarks', url: 'https://twitter.com/i/bookmarks/', expected: false },
      { pattern: 'twitter.com/i/bookmarks', url: 'https://twitter.com/i/bookmark', expected: false },
      
      // Pattern: bilibili.com/video/*
      { pattern: 'bilibili.com/video/*', url: 'https://bilibili.com/video/BV123', expected: true },
      { pattern: 'bilibili.com/video/*', url: 'https://bilibili.com/video/', expected: true },
      { pattern: 'bilibili.com/video/*', url: 'https://bilibili.com/videos', expected: false },
    ];

    for (const testCase of testCases) {
      const testConfig: EntertainmentConfig = {
        ...config,
        whitelist: [{
          pattern: testCase.pattern,
          isPreset: true,
          enabled: true,
          addedAt: Date.now(),
        }],
      };
      
      const whitelisted = isWhitelisted(testCase.url, testConfig);
      expect(whitelisted).toBe(testCase.expected);
    }
  });

  it('whitelist should take precedence over blacklist for matching URLs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...PRESET_ENTERTAINMENT_WHITELIST),
        async (whitelistPattern) => {
          // Extract domain from pattern
          const domain = whitelistPattern.split('/')[0];
          
          // Generate a URL that matches the whitelist pattern
          let url: string;
          if (whitelistPattern.endsWith('/*')) {
            const basePath = whitelistPattern.replace('/*', '');
            url = `https://${basePath}/test`;
          } else {
            url = `https://${whitelistPattern}`;
          }
          
          const isEntertainment = isEntertainmentSite(url, config);
          const whitelisted = isWhitelisted(url, config);
          const shouldBlock = shouldBlockAsEntertainment(url, config);
          
          // Property: URL is from entertainment domain
          expect(isEntertainment).toBe(true);
          
          // Property: URL matches whitelist
          expect(whitelisted).toBe(true);
          
          // Property: Whitelist takes precedence - should NOT block
          expect(shouldBlock).toBe(false);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Domain and URL Matching Edge Cases', () => {
  let config: EntertainmentConfig;

  beforeEach(() => {
    config = createDefaultConfig();
  });

  it('should handle invalid URLs gracefully', async () => {
    const invalidUrls = [
      '',
      'not-a-url',
      '://missing-protocol.com',
      'http://',
    ];

    for (const url of invalidUrls) {
      const isEntertainment = isEntertainmentSite(url, config);
      const whitelisted = isWhitelisted(url, config);
      const shouldBlock = shouldBlockAsEntertainment(url, config);
      
      // Property: Invalid URLs should not crash and should not be blocked
      expect(isEntertainment).toBe(false);
      expect(whitelisted).toBe(false);
      expect(shouldBlock).toBe(false);
    }
  });

  it('should handle non-HTTP protocols correctly', async () => {
    // FTP URLs to entertainment sites should still be detected
    const ftpUrl = 'ftp://twitter.com/files';
    const isEntertainment = isEntertainmentSite(ftpUrl, config);
    
    // Property: Domain matching works regardless of protocol
    expect(isEntertainment).toBe(true);
  });

  it('should handle URLs with query parameters and fragments', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...PRESET_ENTERTAINMENT_BLACKLIST),
        fc.stringMatching(/^\?[a-z]=[a-z0-9]{1,10}$/),
        fc.stringMatching(/^#[a-z]{1,10}$/),
        async (domain, query, fragment) => {
          const url = `https://${domain}/path${query}${fragment}`;
          
          const isEntertainment = isEntertainmentSite(url, config);
          
          // Property: Query params and fragments should not affect domain matching
          expect(isEntertainment).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should be case-insensitive for domain matching', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...PRESET_ENTERTAINMENT_BLACKLIST),
        fc.func(fc.boolean()),
        async (domain, caseTransform) => {
          // Transform domain to mixed case
          const mixedCaseDomain = domain
            .split('')
            .map((char, i) => caseTransform(i) ? char.toUpperCase() : char.toLowerCase())
            .join('');
          
          const url = `https://${mixedCaseDomain}/path`;
          const isEntertainment = isEntertainmentSite(url, config);
          
          // Property: Domain matching should be case-insensitive
          expect(isEntertainment).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ============================================================================
// Property 8: Entertainment Mode Site Access
// ============================================================================

describe('Property 8: Entertainment Mode Site Access', () => {
  /**
   * Property: Entertainment sites are allowed when Entertainment Mode is active
   * For any Entertainment Site URL, when Entertainment Mode is active, 
   * the URL SHALL be allowed regardless of work time.
   * Validates: Requirements 2.10, 3.8
   */

  let config: EntertainmentConfig;

  beforeEach(() => {
    config = createDefaultConfig();
  });

  /**
   * Simulates PolicyManager.shouldBlockEntertainment logic
   * Returns true if URL should be blocked, false if allowed
   */
  function shouldBlockEntertainment(
    url: string, 
    entertainmentConfig: EntertainmentConfig, 
    entertainmentModeActive: boolean
  ): boolean {
    // If entertainment mode is active, allow all entertainment sites
    if (entertainmentModeActive) {
      return false;
    }

    // If whitelisted, never block
    if (isWhitelisted(url, entertainmentConfig)) {
      return false;
    }

    // Block if it's an entertainment site
    return isEntertainmentSite(url, entertainmentConfig);
  }

  it('should allow all entertainment sites when entertainment mode is active', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...PRESET_ENTERTAINMENT_BLACKLIST),
        pathArbitrary,
        async (domain, path) => {
          const url = `https://${domain}${path}`;
          
          // Property: When entertainment mode is active, entertainment sites should be allowed
          const shouldBlock = shouldBlockEntertainment(url, config, true);
          expect(shouldBlock).toBe(false);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should allow entertainment sites with subdomains when entertainment mode is active', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...PRESET_ENTERTAINMENT_BLACKLIST),
        subdomainArbitrary,
        pathArbitrary,
        async (domain, subdomain, path) => {
          const url = `https://${subdomain}.${domain}${path}`;
          
          // Property: Subdomains of entertainment sites should also be allowed in entertainment mode
          const shouldBlock = shouldBlockEntertainment(url, config, true);
          expect(shouldBlock).toBe(false);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should block entertainment sites when entertainment mode is NOT active', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...PRESET_ENTERTAINMENT_BLACKLIST),
        pathArbitrary,
        async (domain, path) => {
          const url = `https://${domain}${path}`;
          
          // Skip whitelisted URLs for this test
          if (isWhitelisted(url, config)) {
            return true;
          }
          
          // Property: When entertainment mode is NOT active, entertainment sites should be blocked
          const shouldBlock = shouldBlockEntertainment(url, config, false);
          expect(shouldBlock).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should allow entertainment sites regardless of work time when entertainment mode is active', async () => {
    // Simulate different work time scenarios
    const workTimeScenarios = [
      { isWithinWorkTime: true, description: 'within work time' },
      { isWithinWorkTime: false, description: 'outside work time' },
    ];

    for (const scenario of workTimeScenarios) {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...PRESET_ENTERTAINMENT_BLACKLIST),
          pathArbitrary,
          async (domain, path) => {
            const url = `https://${domain}${path}`;
            
            // Property: Entertainment mode allows sites regardless of work time
            // The shouldBlockEntertainment function doesn't check work time when entertainment mode is active
            const shouldBlock = shouldBlockEntertainment(url, config, true);
            expect(shouldBlock).toBe(false);
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    }
  });

  it('should toggle blocking based on entertainment mode state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...PRESET_ENTERTAINMENT_BLACKLIST),
        fc.boolean(),
        pathArbitrary,
        async (domain, entertainmentModeActive, path) => {
          const url = `https://${domain}${path}`;
          
          // Skip whitelisted URLs
          if (isWhitelisted(url, config)) {
            return true;
          }
          
          const shouldBlock = shouldBlockEntertainment(url, config, entertainmentModeActive);
          
          // Property: Blocking state should be inverse of entertainment mode state
          if (entertainmentModeActive) {
            expect(shouldBlock).toBe(false);
          } else {
            expect(shouldBlock).toBe(true);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should allow non-entertainment sites regardless of entertainment mode', async () => {
    const nonEntertainmentDomains = [
      'github.com',
      'stackoverflow.com',
      'google.com',
      'docs.google.com',
      'notion.so',
      'linear.app',
      'figma.com',
    ];

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...nonEntertainmentDomains),
        fc.boolean(),
        pathArbitrary,
        async (domain, entertainmentModeActive, path) => {
          const url = `https://${domain}${path}`;
          
          // Property: Non-entertainment sites should never be blocked by entertainment logic
          const shouldBlock = shouldBlockEntertainment(url, config, entertainmentModeActive);
          expect(shouldBlock).toBe(false);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should allow whitelisted entertainment URLs regardless of entertainment mode', async () => {
    const whitelistedUrls = [
      'https://weibo.com/fav/123',
      'https://twitter.com/i/bookmarks',
      'https://bilibili.com/video/BV123',
      'https://bilibili.com/search/all',
    ];

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...whitelistedUrls),
        fc.boolean(),
        async (url, entertainmentModeActive) => {
          // Property: Whitelisted URLs should always be allowed
          const shouldBlock = shouldBlockEntertainment(url, config, entertainmentModeActive);
          expect(shouldBlock).toBe(false);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
