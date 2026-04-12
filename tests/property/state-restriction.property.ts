import fc from 'fast-check';
import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Feature: browser-sentinel-enhancement
 * Property 1: OVER_REST State Dashboard Restriction (was LOCKED, now only OVER_REST)
 * Property 2: OVER_REST State Dashboard Restriction
 * Validates: Requirements 1.1, 1.2, 1.6, 1.10
 *
 * After state-management-overhaul: LOCKED state no longer exists.
 * Only OVER_REST triggers state-based blocking in the extension.
 * States are now: IDLE, FOCUS, OVER_REST (3-state model).
 */

// ============================================================================
// Types (mirroring browser-sentinel types for testing)
// ============================================================================

type SystemState = 'IDLE' | 'FOCUS' | 'OVER_REST';

interface StateRestrictionResult {
  blocked: boolean;
  redirectUrl?: string;
  reason?: 'over_rest';
}

interface RestrictionReason {
  reason: 'over_rest' | null;
  message: string;
}

// ============================================================================
// State Restriction Logic (extracted for testing)
// ============================================================================

const DEFAULT_DASHBOARD_URL = 'http://localhost:3000';

/**
 * Check if the system is in a restricted state (only OVER_REST in 3-state model)
 * Requirements: 1.1, 1.6
 */
function isRestrictedState(state: SystemState): boolean {
  return state === 'OVER_REST';
}

/**
 * Check if a URL is the Dashboard URL
 */
function isDashboardUrl(url: string, dashboardUrl: string = DEFAULT_DASHBOARD_URL): boolean {
  if (!url) return false;

  try {
    const urlObj = new URL(url);
    const dashboardUrlObj = new URL(dashboardUrl);

    // Check if the hostname matches the dashboard hostname
    return urlObj.hostname === dashboardUrlObj.hostname;
  } catch {
    return false;
  }
}

/**
 * Check if URL is internal (should not be blocked)
 */
function isInternalUrl(url: string): boolean {
  return (
    !url ||
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('about:') ||
    url.startsWith('edge://') ||
    url.startsWith('moz-extension://') ||
    url.startsWith('file://')
  );
}

/**
 * Get the restriction reason for the current state
 * Requirements: 1.6, 1.7
 */
function getRestrictionReason(state: SystemState): RestrictionReason {
  if (state === 'OVER_REST') {
    return {
      reason: 'over_rest',
      message: '超时休息中，请开始工作',
    };
  }

  return { reason: null, message: '' };
}

/**
 * Check if URL should be blocked due to state restriction
 * Requirements: 1.1, 1.6
 */
function shouldBlockForStateRestriction(
  url: string,
  state: SystemState,
  dashboardUrl: string = DEFAULT_DASHBOARD_URL
): StateRestrictionResult {
  // Skip internal URLs
  if (isInternalUrl(url)) {
    return { blocked: false };
  }

  // If not in restricted state, allow
  if (!isRestrictedState(state)) {
    return { blocked: false };
  }

  // Allow Dashboard URLs
  if (isDashboardUrl(url, dashboardUrl)) {
    return { blocked: false };
  }

  // Block and redirect to over-rest screensaver
  return {
    blocked: true,
    redirectUrl: `chrome-extension://test-extension-id/over-rest-screensaver.html`,
    reason: 'over_rest',
  };
}

// ============================================================================
// Test Helpers
// ============================================================================

// Arbitrary generators
const domainArbitrary = fc.stringMatching(/^[a-z][a-z0-9-]{0,20}\.[a-z]{2,6}$/);
const pathArbitrary = fc.stringMatching(/^\/[a-z0-9\/-]{0,30}$/);
const nonRestrictedStateArbitrary = fc.constantFrom<SystemState>('IDLE', 'FOCUS');
const restrictedStateArbitrary = fc.constantFrom<SystemState>('OVER_REST');
const allStatesArbitrary = fc.constantFrom<SystemState>('IDLE', 'FOCUS', 'OVER_REST');

// Non-dashboard domains for testing
const nonDashboardDomains = [
  'twitter.com',
  'github.com',
  'google.com',
  'youtube.com',
  'stackoverflow.com',
  'reddit.com',
  'example.com',
];

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 2: OVER_REST State Dashboard Restriction', () => {
  /**
   * Property: In OVER_REST state, only Dashboard URLs are allowed
   * For any browser navigation attempt when system state is OVER_REST,
   * the Browser Sentinel SHALL redirect to Dashboard.
   * Validates: Requirements 1.1, 1.6
   */

  it('should block all non-Dashboard URLs when in OVER_REST state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...nonDashboardDomains),
        pathArbitrary,
        async (domain, path) => {
          const url = `https://${domain}${path}`;
          const result = shouldBlockForStateRestriction(url, 'OVER_REST');

          // Property: Non-Dashboard URLs should be blocked in OVER_REST state
          expect(result.blocked).toBe(true);
          expect(result.reason).toBe('over_rest');
          expect(result.redirectUrl).toContain('over-rest-screensaver.html');

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should allow Dashboard URLs when in OVER_REST state', async () => {
    await fc.assert(
      fc.asyncProperty(
        pathArbitrary,
        async (path) => {
          const dashboardUrl = DEFAULT_DASHBOARD_URL;
          const url = `${dashboardUrl}${path}`;
          const result = shouldBlockForStateRestriction(url, 'OVER_REST', dashboardUrl);

          // Property: Dashboard URLs should be allowed in OVER_REST state
          expect(result.blocked).toBe(false);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return correct restriction message for OVER_REST state', () => {
    const reason = getRestrictionReason('OVER_REST');

    expect(reason.reason).toBe('over_rest');
    expect(reason.message).toBe('超时休息中，请开始工作');
  });

  it('should allow internal URLs in OVER_REST state', async () => {
    const internalUrls = [
      'chrome://extensions',
      'chrome-extension://abc123/popup.html',
      'about:blank',
      'edge://settings',
      'moz-extension://abc123/page.html',
      'file:///home/user/document.html',
      '',
    ];

    for (const url of internalUrls) {
      const result = shouldBlockForStateRestriction(url, 'OVER_REST');

      // Property: Internal URLs should not be blocked
      expect(result.blocked).toBe(false);
    }
  });
});

describe('State Restriction - Non-Restricted States', () => {
  /**
   * Property: Non-restricted states (IDLE, FOCUS) should not
   * trigger state-based blocking
   */

  it('should not block any URLs in IDLE state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...nonDashboardDomains),
        pathArbitrary,
        async (domain, path) => {
          const url = `https://${domain}${path}`;
          const result = shouldBlockForStateRestriction(url, 'IDLE');

          // Property: IDLE state should not trigger state restriction
          expect(result.blocked).toBe(false);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not block any URLs in FOCUS state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...nonDashboardDomains),
        pathArbitrary,
        async (domain, path) => {
          const url = `https://${domain}${path}`;
          const result = shouldBlockForStateRestriction(url, 'FOCUS');

          // Property: FOCUS state should not trigger state restriction
          // (FOCUS has its own blocking logic for blacklisted sites)
          expect(result.blocked).toBe(false);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return null reason for non-restricted states', async () => {
    await fc.assert(
      fc.asyncProperty(
        nonRestrictedStateArbitrary,
        async (state) => {
          const reason = getRestrictionReason(state);

          // Property: Non-restricted states should have null reason
          expect(reason.reason).toBeNull();
          expect(reason.message).toBe('');

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('isRestrictedState Function', () => {
  it('should correctly identify restricted states', async () => {
    await fc.assert(
      fc.asyncProperty(
        allStatesArbitrary,
        async (state) => {
          const isRestricted = isRestrictedState(state);

          // Property: Only OVER_REST is a restricted state (LOCKED removed in 3-state model)
          if (state === 'OVER_REST') {
            expect(isRestricted).toBe(true);
          } else {
            expect(isRestricted).toBe(false);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('isDashboardUrl Function', () => {
  it('should correctly identify Dashboard URLs', async () => {
    const dashboardUrl = 'http://localhost:3000';

    const dashboardUrls = [
      'http://localhost:3000',
      'http://localhost:3000/',
      'http://localhost:3000/pomodoro',
      'http://localhost:3000/settings',
      'http://localhost:3000/tasks/123',
    ];

    for (const url of dashboardUrls) {
      const result = isDashboardUrl(url, dashboardUrl);
      expect(result).toBe(true);
    }
  });

  it('should correctly reject non-Dashboard URLs', async () => {
    const dashboardUrl = 'http://localhost:3000';

    const nonDashboardUrls = [
      'https://twitter.com',
      'https://github.com',
      'http://example.com:3000',
      'http://192.168.1.1:3000',
      'https://vibeflow.io',
    ];

    for (const url of nonDashboardUrls) {
      const result = isDashboardUrl(url, dashboardUrl);
      expect(result).toBe(false);
    }
  });

  it('should handle custom dashboard URLs', async () => {
    await fc.assert(
      fc.asyncProperty(
        domainArbitrary,
        fc.integer({ min: 1000, max: 9999 }),
        pathArbitrary,
        async (domain, port, path) => {
          const dashboardUrl = `http://${domain}:${port}`;
          const testUrl = `http://${domain}:${port}${path}`;

          const result = isDashboardUrl(testUrl, dashboardUrl);

          // Property: URLs with matching hostname should be identified as Dashboard
          expect(result).toBe(true);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle invalid URLs gracefully', () => {
    const invalidUrls = [
      '',
      'not-a-url',
      '://missing-protocol.com',
    ];

    for (const url of invalidUrls) {
      const result = isDashboardUrl(url);
      expect(result).toBe(false);
    }
  });
});

describe('State Transition Scenarios', () => {
  /**
   * Property: State changes should correctly update blocking behavior
   * Requirements: 1.5
   */

  it('should restore normal browsing when transitioning from OVER_REST to FOCUS', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...nonDashboardDomains),
        pathArbitrary,
        async (domain, path) => {
          const url = `https://${domain}${path}`;

          // Before: OVER_REST state blocks
          const overRestResult = shouldBlockForStateRestriction(url, 'OVER_REST');
          expect(overRestResult.blocked).toBe(true);

          // After: FOCUS state allows (state restriction doesn't apply)
          const focusResult = shouldBlockForStateRestriction(url, 'FOCUS');
          expect(focusResult.blocked).toBe(false);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should restore normal browsing when transitioning from OVER_REST to IDLE', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...nonDashboardDomains),
        pathArbitrary,
        async (domain, path) => {
          const url = `https://${domain}${path}`;

          // Before: OVER_REST state blocks
          const overRestResult = shouldBlockForStateRestriction(url, 'OVER_REST');
          expect(overRestResult.blocked).toBe(true);

          // After: IDLE state allows (RETURN_TO_IDLE or WORK_TIME_ENDED)
          const idleResult = shouldBlockForStateRestriction(url, 'IDLE');
          expect(idleResult.blocked).toBe(false);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should block when transitioning from IDLE to OVER_REST', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...nonDashboardDomains),
        pathArbitrary,
        async (domain, path) => {
          const url = `https://${domain}${path}`;

          // Before: IDLE state allows
          const idleResult = shouldBlockForStateRestriction(url, 'IDLE');
          expect(idleResult.blocked).toBe(false);

          // After: OVER_REST state blocks
          const overRestResult = shouldBlockForStateRestriction(url, 'OVER_REST');
          expect(overRestResult.blocked).toBe(true);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Redirect URL Correctness', () => {
  /**
   * Property: Redirect URLs should point to the correct screensaver
   */

  it('should redirect to over-rest-screensaver.html for OVER_REST state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...nonDashboardDomains),
        pathArbitrary,
        async (domain, path) => {
          const url = `https://${domain}${path}`;
          const result = shouldBlockForStateRestriction(url, 'OVER_REST');

          expect(result.blocked).toBe(true);
          expect(result.redirectUrl).toContain('over-rest-screensaver.html');

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
