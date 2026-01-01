---
inclusion: always
---

# Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes (tRPC, auth, socket)
│   ├── airlock/           # Daily planning workflow
│   ├── goals/             # Goal management pages
│   ├── pomodoro/          # Timer interface
│   ├── projects/          # Project management pages
│   ├── settings/          # User settings
│   ├── stats/             # Analytics dashboard
│   ├── tasks/             # Task management pages
│   └── timeline/          # Activity timeline
│
├── components/            # React components by domain
│   ├── goals/            # Goal-related components
│   ├── layout/           # Header, navigation, main layout
│   ├── pomodoro/         # Timer, modals, task selector
│   ├── projects/         # Project forms
│   ├── providers/        # Context providers (tRPC, session, offline)
│   ├── settings/         # Settings forms
│   ├── stats/            # Charts and dashboards
│   ├── tasks/            # Task tree, forms
│   ├── timeline/         # Calendar and timeline views
│   └── ui/               # Shared UI primitives
│
├── hooks/                 # Custom React hooks
├── lib/                   # Core utilities (auth, prisma, trpc, socket)
├── machines/              # XState state machines
├── mcp/                   # Model Context Protocol server
├── middleware/            # Request middleware
├── server/                # tRPC routers and socket handlers
├── services/              # Business logic layer
└── types/                 # TypeScript declarations

prisma/
└── schema.prisma          # Database schema

tests/property/            # Property-based tests (fast-check)
e2e/                       # Playwright E2E tests
```

## Code Conventions

### Services (`src/services/`)
- Export singleton object with methods (e.g., `export const projectService = { ... }`)
- Return `ServiceResult<T>`: `{ success: boolean; data?: T; error?: { code: string; message: string } }`
- Define Zod schemas alongside service for input validation
- Handle authorization internally (verify `userId` ownership)
- Broadcast state changes via `socketBroadcastService.broadcastStateChange(userId, state)`

### API Routes (`src/app/api/`)
- Use tRPC for most endpoints (`src/server/routers/`)
- Return consistent JSON: `{ success, data?, error? }`
- Error codes: `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `INTERNAL_ERROR`, `AUTH_ERROR`

### Components
- Mark client components with `'use client'` directive
- Organize by domain (goals, tasks, pomodoro, etc.)
- Use `@/` path alias for imports from `src/`

### State Management
- XState machines in `src/machines/` for complex flows
- tRPC queries/mutations for server state
- React hooks for local UI state

### Testing
- Property tests: `tests/property/*.property.ts` using fast-check
- E2E tests: `e2e/tests/*.spec.ts` using Playwright
- Use factories in `e2e/fixtures/factories/` for test data
