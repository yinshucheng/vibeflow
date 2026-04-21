import { test, expect } from '../fixtures';

/**
 * No-Polling E2E Test
 *
 * Verifies that the Web client does not make periodic tRPC HTTP requests
 * after initial page load. All real-time state should come via WebSocket.
 *
 * After the page is fully loaded and WebSocket is connected, we monitor
 * network requests for 60 seconds. Any repeating tRPC calls indicate
 * a refetchInterval that should have been removed.
 *
 * Acceptable requests:
 * - Initial page load requests (before monitoring starts)
 * - One-time tRPC queries triggered by navigation/user action
 * - WebSocket frames (not captured as HTTP requests)
 * - task-suggestions refetch every 120s (AI non-realtime data, excluded)
 *
 * Unacceptable requests:
 * - Any tRPC query that repeats more than once during the monitoring window
 *   (indicates a refetchInterval polling pattern)
 */

test.describe('No-Polling Verification', () => {
  test('should not make periodic tRPC calls after page load', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Wait for page to be fully loaded and WebSocket connected
    await page.waitForLoadState('networkidle');
    // Give extra time for initial queries to complete
    await page.waitForTimeout(3000);

    // Start monitoring tRPC requests
    const tRPCRequests: { url: string; timestamp: number; procedure: string }[] = [];

    page.on('request', (request) => {
      const url = request.url();
      // Match tRPC requests (batch queries via GET or POST to /api/trpc/)
      if (url.includes('/api/trpc/') || url.includes('trpc')) {
        // Extract procedure name from URL
        const urlObj = new URL(url);
        const procedure = urlObj.pathname.replace(/.*\/trpc\//, '').split('?')[0] || 'unknown';
        tRPCRequests.push({
          url,
          timestamp: Date.now(),
          procedure,
        });
      }
    });

    // Monitor for 60 seconds
    await page.waitForTimeout(60000);

    // Analyze: group by procedure and check for repeats
    const procedureCounts = new Map<string, number>();
    for (const req of tRPCRequests) {
      const current = procedureCounts.get(req.procedure) || 0;
      procedureCounts.set(req.procedure, current + 1);
    }

    // Exclude known acceptable periodic queries
    const ALLOWED_PERIODIC = new Set([
      'dailyState.getTaskSuggestions', // AI suggestions, 120s interval, non-realtime
    ]);

    // Find any procedure that was called more than once (indicating polling)
    const pollingProcedures: { procedure: string; count: number }[] = [];
    for (const [procedure, count] of procedureCounts) {
      if (count > 1 && !ALLOWED_PERIODIC.has(procedure)) {
        pollingProcedures.push({ procedure, count });
      }
    }

    // Assert no polling detected
    expect(
      pollingProcedures,
      `Detected periodic tRPC polling: ${pollingProcedures.map((p) => `${p.procedure} (${p.count}x)`).join(', ')}. All real-time data should come via WebSocket push.`
    ).toHaveLength(0);
  });
});
