import fc from 'fast-check';
import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Feature: browser-sentinel-enhancement
 * Property 15: Entertainment Tab Closure on Mode End
 * Validates: Requirements 5.10
 * 
 * For any Entertainment Mode session end, all tabs with Entertainment Site URLs 
 * SHALL be closed.
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

interface MockTab {
  id: number;
  url: string;
  title: string;
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

const INTERNAL_URL_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'about:',
  'edge://',
  'moz-extension://',
  'file://',
];

const NON_ENTERTAINMENT_DOMAINS = [
  'github.com',
  'stackoverflow.com',
  'google.com',
  'docs.google.com',
  'notion.so',
  'linear.app',
  'figma.com',
  'localhost',
];

// ============================================================================
// Entertainment Manager Logic (extracted for testing)
// ============================================================================

function extractHostname(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.toLowerCase();
  } catch {
    return null;
  }
}

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

function matchGlobPattern(url: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');

  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(url);
}

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

function isEntertainmentSite(url: string, config: EntertainmentConfig): boolean {
  const hostname = extractHostname(url);
  if (!hostname) return false;

  const enabledBlacklist = config.blacklist
    .filter(entry => entry.enabled)
    .map(entry => entry.domain);

  return matchesDomainPatterns(hostname, enabledBlacklist);
}

function isWhitelisted(url: string, config: EntertainmentConfig): boolean {
  const enabledWhitelist = config.whitelist
    .filter(entry => entry.enabled)
    .map(entry => entry.pattern);

  return matchesUrlPatterns(url, enabledWhitelist);
}

function isInternalUrl(url: string): boolean {
  return INTERNAL_URL_PREFIXES.some(prefix => url.startsWith(prefix));
}

// ============================================================================
// Tab Closure Logic (mirroring service-worker.ts closeEntertainmentTabs)
// ============================================================================

/**
 * Determines which tabs should be closed when entertainment mode ends
 * Requirements: 5.10
 */
function getTabsToClose(tabs: MockTab[], config: EntertainmentConfig): number[] {
  const tabsToClose: number[] = [];
  
  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue;
    
    // Skip internal URLs
    if (isInternalUrl(tab.url)) {
      continue;
    }
    
    // Check if this is an entertainment site that should be closed
    if (isEntertainmentSite(tab.url, config) && !isWhitelisted(tab.url, config)) {
      tabsToClose.push(tab.id);
    }
  }
  
  return tabsToClose;
}

/**
 * Simulates the tab closure operation
 * Returns the tabs that remain open after closure
 */
function simulateTabClosure(tabs: MockTab[], tabsToClose: number[]): MockTab[] {
  return tabs.filter(tab => !tabsToClose.includes(tab.id));
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
const pathArbitrary = fc.stringMatching(/^\/[a-z0-9\/-]{0,30}$/);
const subdomainArbitrary = fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/);

const entertainmentUrlArbitrary = fc.tuple(
  fc.constantFrom(...PRESET_ENTERTAINMENT_BLACKLIST),
  pathArbitrary
).map(([domain, path]) => `https://${domain}${path}`);

const nonEntertainmentUrlArbitrary = fc.tuple(
  fc.constantFrom(...NON_ENTERTAINMENT_DOMAINS),
  pathArbitrary
).map(([domain, path]) => `https://${domain}${path}`);

const internalUrlArbitrary = fc.constantFrom(
  'chrome://newtab',
  'chrome://settings',
  'chrome-extension://abc123/popup.html',
  'about:blank',
  'edge://settings',
  'file:///home/user/document.html'
);

const whitelistedUrlArbitrary = fc.constantFrom(
  'https://weibo.com/fav/123',
  'https://weibo.com/fav/abc/def',
  'https://twitter.com/i/bookmarks',
  'https://bilibili.com/video/BV123',
  'https://bilibili.com/search/all'
);

const mockTabArbitrary = (urlArb: fc.Arbitrary<string>) => 
  fc.tuple(
    fc.integer({ min: 1, max: 10000 }),
    urlArb,
    fc.string({ minLength: 1, maxLength: 50 })
  ).map(([id, url, title]) => ({ id, url, title }));

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 15: Entertainment Tab Closure on Mode End', () => {
  /**
   * Property: All entertainment site tabs are closed when entertainment mode ends
   * For any Entertainment Mode session end, all tabs with Entertainment Site URLs 
   * SHALL be closed.
   * Validates: Requirements 5.10
   */

  let config: EntertainmentConfig;

  beforeEach(() => {
    config = createDefaultConfig();
  });

  it('should identify all entertainment tabs for closure', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(mockTabArbitrary(entertainmentUrlArbitrary), { minLength: 1, maxLength: 10 }),
        async (entertainmentTabs) => {
          const tabsToClose = getTabsToClose(entertainmentTabs, config);
          
          // Filter out any whitelisted tabs from expected count
          const expectedClosureCount = entertainmentTabs.filter(
            tab => !isWhitelisted(tab.url, config)
          ).length;
          
          // Property: All non-whitelisted entertainment tabs should be marked for closure
          expect(tabsToClose.length).toBe(expectedClosureCount);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not close non-entertainment tabs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(mockTabArbitrary(nonEntertainmentUrlArbitrary), { minLength: 1, maxLength: 10 }),
        async (nonEntertainmentTabs) => {
          const tabsToClose = getTabsToClose(nonEntertainmentTabs, config);
          
          // Property: No non-entertainment tabs should be closed
          expect(tabsToClose.length).toBe(0);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not close internal browser tabs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(mockTabArbitrary(internalUrlArbitrary), { minLength: 1, maxLength: 10 }),
        async (internalTabs) => {
          const tabsToClose = getTabsToClose(internalTabs, config);
          
          // Property: Internal browser tabs should never be closed
          expect(tabsToClose.length).toBe(0);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not close whitelisted entertainment tabs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(mockTabArbitrary(whitelistedUrlArbitrary), { minLength: 1, maxLength: 10 }),
        async (whitelistedTabs) => {
          const tabsToClose = getTabsToClose(whitelistedTabs, config);
          
          // Property: Whitelisted tabs should not be closed even if from entertainment domains
          expect(tabsToClose.length).toBe(0);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should correctly handle mixed tab sets', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(mockTabArbitrary(entertainmentUrlArbitrary), { minLength: 0, maxLength: 5 }),
        fc.array(mockTabArbitrary(nonEntertainmentUrlArbitrary), { minLength: 0, maxLength: 5 }),
        fc.array(mockTabArbitrary(internalUrlArbitrary), { minLength: 0, maxLength: 3 }),
        fc.array(mockTabArbitrary(whitelistedUrlArbitrary), { minLength: 0, maxLength: 3 }),
        async (entertainmentTabs, nonEntertainmentTabs, internalTabs, whitelistedTabs) => {
          // Ensure unique IDs across all tabs
          let nextId = 1;
          const allTabs = [
            ...entertainmentTabs.map(t => ({ ...t, id: nextId++ })),
            ...nonEntertainmentTabs.map(t => ({ ...t, id: nextId++ })),
            ...internalTabs.map(t => ({ ...t, id: nextId++ })),
            ...whitelistedTabs.map(t => ({ ...t, id: nextId++ })),
          ];
          
          const tabsToClose = getTabsToClose(allTabs, config);
          const remainingTabs = simulateTabClosure(allTabs, tabsToClose);
          
          // Property: After closure, no non-whitelisted entertainment tabs should remain
          for (const tab of remainingTabs) {
            if (isEntertainmentSite(tab.url, config)) {
              // If it's an entertainment site that remains, it must be whitelisted
              expect(isWhitelisted(tab.url, config)).toBe(true);
            }
          }
          
          // Property: All non-entertainment and internal tabs should remain
          const nonEntertainmentIds = [
            ...nonEntertainmentTabs.map((_, i) => entertainmentTabs.length + i + 1),
            ...internalTabs.map((_, i) => entertainmentTabs.length + nonEntertainmentTabs.length + i + 1),
          ];
          
          for (const id of nonEntertainmentIds) {
            const tab = allTabs.find(t => t.id === id);
            if (tab) {
              expect(remainingTabs.some(t => t.id === id)).toBe(true);
            }
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should close entertainment tabs with subdomains', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...PRESET_ENTERTAINMENT_BLACKLIST),
        subdomainArbitrary,
        pathArbitrary,
        fc.integer({ min: 1, max: 10000 }),
        async (domain, subdomain, path, tabId) => {
          const url = `https://${subdomain}.${domain}${path}`;
          const tab: MockTab = { id: tabId, url, title: 'Test Tab' };
          
          const tabsToClose = getTabsToClose([tab], config);
          
          // Property: Subdomain entertainment tabs should also be closed
          expect(tabsToClose).toContain(tabId);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle tabs with missing or invalid URLs', async () => {
    const invalidTabs: MockTab[] = [
      { id: 1, url: '', title: 'Empty URL' },
      { id: 2, url: 'not-a-valid-url', title: 'Invalid URL' },
      { id: 3, url: '://missing-protocol.com', title: 'Missing Protocol' },
    ];
    
    // Should not throw and should not close invalid tabs
    const tabsToClose = getTabsToClose(invalidTabs, config);
    expect(tabsToClose.length).toBe(0);
  });

  it('should respect disabled blacklist entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...PRESET_ENTERTAINMENT_BLACKLIST),
        pathArbitrary,
        fc.integer({ min: 1, max: 10000 }),
        async (domain, path, tabId) => {
          // Create config with disabled blacklist entry
          const disabledConfig: EntertainmentConfig = {
            ...config,
            blacklist: config.blacklist.map(entry => ({
              ...entry,
              enabled: entry.domain !== domain,
            })),
          };
          
          const url = `https://${domain}${path}`;
          const tab: MockTab = { id: tabId, url, title: 'Test Tab' };
          
          const tabsToClose = getTabsToClose([tab], disabledConfig);
          
          // Property: Tabs from disabled blacklist domains should not be closed
          expect(tabsToClose).not.toContain(tabId);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should close all entertainment tabs regardless of stop reason', async () => {
    const stopReasons = ['manual', 'quota_exhausted', 'work_time_start'] as const;
    
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...stopReasons),
        fc.array(mockTabArbitrary(entertainmentUrlArbitrary), { minLength: 1, maxLength: 5 }),
        async (stopReason, entertainmentTabs) => {
          // The stop reason should not affect which tabs are closed
          // Tab closure logic is the same regardless of why entertainment mode ended
          const tabsToClose = getTabsToClose(entertainmentTabs, config);
          
          // Filter out whitelisted tabs
          const expectedClosureCount = entertainmentTabs.filter(
            tab => !isWhitelisted(tab.url, config)
          ).length;
          
          // Property: Same tabs should be closed regardless of stop reason
          expect(tabsToClose.length).toBe(expectedClosureCount);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle empty tab list gracefully', async () => {
    const tabsToClose = getTabsToClose([], config);
    
    // Property: Empty tab list should result in empty closure list
    expect(tabsToClose).toEqual([]);
  });

  it('should preserve tab IDs correctly in closure list', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.tuple(
            fc.integer({ min: 1, max: 10000 }),
            fc.constantFrom(...PRESET_ENTERTAINMENT_BLACKLIST),
            pathArbitrary
          ),
          { minLength: 1, maxLength: 10 }
        ),
        async (tabData) => {
          // Ensure unique IDs
          const uniqueIds = new Set<number>();
          const tabs: MockTab[] = tabData
            .filter(([id]) => {
              if (uniqueIds.has(id)) return false;
              uniqueIds.add(id);
              return true;
            })
            .map(([id, domain, path]) => ({
              id,
              url: `https://${domain}${path}`,
              title: `Tab ${id}`,
            }));
          
          const tabsToClose = getTabsToClose(tabs, config);
          
          // Property: All returned IDs should be valid tab IDs from the input
          const inputIds = new Set(tabs.map(t => t.id));
          for (const id of tabsToClose) {
            expect(inputIds.has(id)).toBe(true);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Entertainment Tab Closure Edge Cases', () => {
  let config: EntertainmentConfig;

  beforeEach(() => {
    config = createDefaultConfig();
  });

  it('should handle URLs with query parameters correctly', async () => {
    const urlsWithParams = [
      'https://youtube.com/watch?v=abc123',
      'https://twitter.com/home?ref=timeline',
      'https://reddit.com/r/all?sort=hot',
    ];
    
    const tabs: MockTab[] = urlsWithParams.map((url, i) => ({
      id: i + 1,
      url,
      title: `Tab ${i + 1}`,
    }));
    
    const tabsToClose = getTabsToClose(tabs, config);
    
    // Property: Query parameters should not affect entertainment site detection
    expect(tabsToClose.length).toBe(3);
  });

  it('should handle URLs with fragments correctly', async () => {
    const urlsWithFragments = [
      'https://youtube.com/watch#comments',
      'https://twitter.com/home#top',
      'https://reddit.com/r/all#sidebar',
    ];
    
    const tabs: MockTab[] = urlsWithFragments.map((url, i) => ({
      id: i + 1,
      url,
      title: `Tab ${i + 1}`,
    }));
    
    const tabsToClose = getTabsToClose(tabs, config);
    
    // Property: URL fragments should not affect entertainment site detection
    expect(tabsToClose.length).toBe(3);
  });

  it('should be case-insensitive for domain matching', async () => {
    const mixedCaseUrls = [
      'https://TWITTER.COM/home',
      'https://Twitter.Com/explore',
      'https://YOUTUBE.com/watch',
      'https://Reddit.COM/r/all',
    ];
    
    const tabs: MockTab[] = mixedCaseUrls.map((url, i) => ({
      id: i + 1,
      url,
      title: `Tab ${i + 1}`,
    }));
    
    const tabsToClose = getTabsToClose(tabs, config);
    
    // Property: Domain matching should be case-insensitive
    expect(tabsToClose.length).toBe(4);
  });

  it('should handle HTTP and HTTPS protocols', async () => {
    const httpUrls = [
      'http://twitter.com/home',
      'https://twitter.com/home',
      'http://youtube.com/watch',
      'https://youtube.com/watch',
    ];
    
    const tabs: MockTab[] = httpUrls.map((url, i) => ({
      id: i + 1,
      url,
      title: `Tab ${i + 1}`,
    }));
    
    const tabsToClose = getTabsToClose(tabs, config);
    
    // Property: Both HTTP and HTTPS should be detected
    expect(tabsToClose.length).toBe(4);
  });
});
