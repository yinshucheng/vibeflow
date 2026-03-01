---
inclusion: always
---

# E2E Testing Guide

## Overview

E2E tests live in `e2e/` and run via Playwright. They cover 4 testing layers against a running dev server (`http://localhost:3000`):

| Layer | What It Tests | Typical File Pattern |
|-------|---------------|---------------------|
| **Browser UI** | Playwright drives a real browser, clicks elements, asserts DOM | `authenticatedPage.goto()` + locator assertions |
| **Socket.io Protocol** | Raw Socket.io client connects, sends OCTOPUS_EVENT, asserts OCTOPUS_COMMAND | `connectSocket()` + `collectCommands()` |
| **tRPC HTTP** | Raw `fetch()` calls to `/api/trpc/*` endpoints | `trpcQuery()` / `trpcMutation()` |
| **Prisma DB** | Direct Prisma client operations to verify data state | `prisma.task.findFirst()` etc. |

Most tests combine layers: e.g. Socket.io protocol test sends a message, then uses Prisma to verify persistence.

## Directory Structure

```
e2e/
  fixtures/
    index.ts            # Extended Playwright test with all fixtures
    auth.fixture.ts     # Test user creation, X-Dev-User-Email auth
    database.fixture.ts # PrismaClient singleton, TestDataTracker, cleanup
    chat.fixture.ts     # ChatTestHelper (seed conversations & messages)
    factories/
      user.factory.ts
      project.factory.ts
      task.factory.ts
      goal.factory.ts
  helpers/
    socket-test-utils.ts  # Shared Socket.io client helpers
  tests/
    *.spec.ts             # Test files
```

## Key Fixtures

Always import `test` and `expect` from `../fixtures`, not from `@playwright/test`:

```typescript
import { test, expect } from '../fixtures';
```

| Fixture | Type | Purpose |
|---------|------|---------|
| `testUser` | `{ id, email }` | Unique user per test, auto-cleanup |
| `prisma` | `PrismaClient` | Direct DB access for seed & verify |
| `tracker` | `TestDataTracker` | Track created entities, auto-cleanup after test |
| `authenticatedPage` | Playwright `Page` | Browser page with `X-Dev-User-Email` header |
| `createAuthenticatedContext` | `(email?) => BrowserContext` | Additional authenticated browser contexts |
| `chatHelper` | `ChatTestHelper` | `seedConversation(userId, msgCount)` |
| `projectFactory` | `ProjectFactory` | `create(userId)`, `createActive()`, etc. |
| `taskFactory` | `TaskFactory` | `create(projectId, userId)`, `createForToday()`, etc. |
| `goalFactory` | `GoalFactory` | `create(userId)`, `createLongTerm()`, etc. |

## Shared Socket.io Helpers

`e2e/helpers/socket-test-utils.ts` provides:

| Helper | Usage |
|--------|-------|
| `connectSocket(email)` | Create authenticated Socket.io client |
| `waitForConnect(socket)` | Await connection (10s timeout) |
| `collectCommands<T>(socket, cmdType, predicate, timeout?)` | Collect OCTOPUS_COMMAND events until predicate is true |
| `collectAnyCommands(socket, cmdType, waitMs?)` | Collect commands within a time window (always resolves) |
| `sendChatMessage(socket, content, conversationId?)` | Emit CHAT_MESSAGE event |
| `waitForChatComplete(socket, timeout?)` | Wait for CHAT_RESPONSE with `type=complete` |

Usage pattern:

```typescript
const socket = connectSocket(testUser.email);
await waitForConnect(socket);
try {
  const responsePromise = waitForChatComplete(socket);
  sendChatMessage(socket, 'Hello');
  const responses = await responsePromise;
  expect(responses.find(r => r.type === 'complete')).toBeDefined();
} finally {
  socket.disconnect();
}
```

## Test File Catalog

### Core Domain

| File | Tests | Layer | Covers |
|------|------:|-------|--------|
| `fixtures.spec.ts` | 15 | DB + Browser | Fixture wiring, data isolation |
| `airlock-flow.spec.ts` | 7 | Browser + DB | Morning Airlock (LOCKED -> PLANNING) |
| `pomodoro-flow.spec.ts` | 11 | Browser + DB | Pomodoro lifecycle, rest, daily cap |

### MCP (AI Integration)

| File | Tests | Layer | Covers |
|------|------:|-------|--------|
| `mcp-integration.spec.ts` | 14 | DB | MCP resources & tools via Prisma |
| `mcp-ai-native-events.spec.ts` | 20 | DB | Event subscriptions, history, isolation |
| `mcp-ai-native-resources.spec.ts` | 11 | DB | Workspace context, analytics, blockers |
| `mcp-ai-native-tools.spec.ts` | 18 | DB | Batch update, templates, dependencies, daily summary |

### Chat (AI Assistant)

| File | Tests | Layer | Covers |
|------|------:|-------|--------|
| `chat-basic.spec.ts` | 2 | Socket.io + DB | Send/receive message, persistence |
| `chat-sync.spec.ts` | 2 | Socket.io + DB | Multi-device CHAT_SYNC |
| `chat-confirmation.spec.ts` | 3 | Socket.io + DB | High-risk tool confirm/cancel, low-risk auto-execute |
| `chat-web.spec.ts` | 4 | tRPC HTTP | chat.getHistory, auth, stats |
| `chat-trigger-integration.spec.ts` | 5 | Pure assertion | Proactive message structure, trigger definitions |
| `chat-regression.spec.ts` | 4 | Socket.io + DB | BUG-2~5 regressions (empty msg, cold start, broadcast, auto-inbox) |
| `chat-ui.spec.ts` | 5 | Browser | FAB/Panel open/close, send message in browser |

**Total: ~106 tests across 14 spec files.**

## Auth in E2E

Dev mode uses `X-Dev-User-Email` header for authentication (no real OAuth flow):

- **Browser tests**: `authenticatedPage` fixture sets the header automatically
- **Socket.io tests**: `connectSocket(email)` passes email in `auth` option
- **tRPC HTTP tests**: Pass `{ 'x-dev-user-email': email }` header to `fetch()`

## Writing New Tests

### Choosing the Right Layer

- **User sees / clicks something** -> Browser UI test with `authenticatedPage`
- **Real-time protocol correctness** -> Socket.io test with `connectSocket()`
- **API contract / auth boundary** -> tRPC HTTP test with `fetch()`
- **Data integrity after operation** -> Add Prisma assertions to any of the above

### Test Template (Socket.io)

```typescript
import { test, expect } from '../fixtures';
import { connectSocket, waitForConnect, sendChatMessage, waitForChatComplete } from '../helpers/socket-test-utils';

test.describe('Feature Name', () => {
  test('description', async ({ testUser, prisma }) => {
    const socket = connectSocket(testUser.email);
    try {
      await waitForConnect(socket);
      // ... test logic
    } finally {
      socket.disconnect();
    }
  });
});
```

### Test Template (Browser UI)

```typescript
import { test, expect } from '../fixtures';

test.describe('Feature Name', () => {
  test('description', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    const el = authenticatedPage.locator('[data-testid="xxx"]');
    await expect(el).toBeVisible({ timeout: 10000 });
    // ... interactions and assertions
  });
});
```

### Cleanup Convention

- Use `tracker` or factories (which auto-register to tracker) -- cleanup happens automatically after each test
- For manual Prisma creates, wrap in `try/finally` with explicit delete
- Socket clients must be disconnected in `finally` blocks

## Running Tests

```bash
# All E2E (auto-starts dev server)
npm run e2e

# Single file
npx playwright test e2e/tests/chat-ui.spec.ts

# With UI debugger
npm run e2e:ui

# Specific test by name
npx playwright test -g "FAB is visible"
```

## Coverage Gaps to Watch

When adding new features, check if these areas need new E2E tests:

1. **New OCTOPUS_COMMAND types** -> Socket.io protocol test
2. **New tRPC router endpoints** -> tRPC HTTP test (at minimum auth boundary)
3. **New UI components in layout** -> Browser test for visibility + interaction
4. **New tool call types** -> Confirmation/auto-execute behavior test
5. **Multi-device state sync** -> Two-socket test verifying broadcast
