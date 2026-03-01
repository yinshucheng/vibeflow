import { test, expect } from '../fixtures';

/**
 * Chat UI Browser E2E Tests
 *
 * Tests the Web Chat UI integration via Playwright browser automation:
 * - ChatFAB visibility on page load
 * - Open/close panel interactions
 * - Backdrop click to close
 * - Send message and receive assistant reply
 */

test.describe('Chat UI (Browser)', () => {
  test('FAB is visible on the home page', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    const fab = authenticatedPage.locator('[data-testid="chat-fab"]');
    await expect(fab).toBeVisible({ timeout: 10000 });
  });

  test('clicking FAB opens the chat panel and hides FAB', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/');
    const fab = authenticatedPage.locator('[data-testid="chat-fab"]');
    await expect(fab).toBeVisible({ timeout: 10000 });

    await fab.click();

    const panel = authenticatedPage.locator('[data-testid="chat-panel"]');
    await expect(panel).toBeVisible({ timeout: 5000 });

    // FAB should be hidden when panel is open
    await expect(fab).not.toBeVisible();
  });

  test('clicking close button closes the panel and restores FAB', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/');
    const fab = authenticatedPage.locator('[data-testid="chat-fab"]');
    await expect(fab).toBeVisible({ timeout: 10000 });

    // Open panel
    await fab.click();
    const panel = authenticatedPage.locator('[data-testid="chat-panel"]');
    await expect(panel).toBeVisible({ timeout: 5000 });

    // Close via close button
    const closeBtn = authenticatedPage.locator('[data-testid="chat-panel-close"]');
    await closeBtn.click();

    await expect(panel).not.toBeVisible();
    await expect(fab).toBeVisible();
  });

  test('clicking backdrop closes the panel', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/');
    const fab = authenticatedPage.locator('[data-testid="chat-fab"]');
    await expect(fab).toBeVisible({ timeout: 10000 });

    // Open panel
    await fab.click();
    const panel = authenticatedPage.locator('[data-testid="chat-panel"]');
    await expect(panel).toBeVisible({ timeout: 5000 });

    // Click backdrop to close
    const backdrop = authenticatedPage.locator('[data-testid="chat-panel-backdrop"]');
    await backdrop.click({ position: { x: 10, y: 10 } });

    await expect(panel).not.toBeVisible();
    await expect(fab).toBeVisible();
  });

  // TODO: Browser socket auth requires full session flow — X-Dev-User-Email only covers HTTP
  test.fixme('sending a message shows user bubble and receives assistant reply', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/');
    const fab = authenticatedPage.locator('[data-testid="chat-fab"]');
    await expect(fab).toBeVisible({ timeout: 10000 });

    // Open panel
    await fab.click();
    const panel = authenticatedPage.locator('[data-testid="chat-panel"]');
    await expect(panel).toBeVisible({ timeout: 5000 });

    // Type a message in the textarea
    const textarea = panel.locator('[data-testid="chat-input"] textarea');
    await textarea.fill('你好');

    // Click send button
    const sendBtn = panel.locator('[data-testid="chat-send-button"]');
    await sendBtn.click();

    // User bubble should appear
    const userBubble = panel.locator('[data-testid="chat-bubble-user"]');
    await expect(userBubble.first()).toBeVisible({ timeout: 5000 });
    await expect(userBubble.first()).toContainText('你好');

    // Wait for assistant bubble to appear (LLM response)
    const assistantBubble = panel.locator('[data-testid="chat-bubble-assistant"]');
    await expect(assistantBubble.first()).toBeVisible({ timeout: 30000 });
    // Assistant content should be non-empty
    await expect(assistantBubble.first()).not.toBeEmpty();
  });
});
