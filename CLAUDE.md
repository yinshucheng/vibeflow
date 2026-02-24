# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VibeFlow is an AI-Native Output Engine — a productivity and focus management system built around the Pomodoro technique. It has four clients sharing one backend:

| Client | Path | Stack |
|--------|------|-------|
| Web (primary) | `src/` | Next.js 14 App Router, React 19, Tailwind CSS |
| Desktop | `vibeflow-desktop/` | Electron 28 (macOS focus enforcement) |
| Browser Extension | `vibeflow-extension/` | Chrome Manifest V3 |
| iOS | `vibeflow-ios/` | Expo SDK 54, React Native, Zustand |

Backend: tRPC 11, Socket.io 4.8, PostgreSQL + Prisma 6.2, XState 5.19

## Commands

```bash
# Development
npm run dev              # Full stack: Next.js + Socket.io + hot reload (port 3000)
npm run dev:mcp          # MCP server (stdio transport)

# Testing
npm run test             # Vitest (single run)
npm run test:watch       # Vitest watch mode
npx vitest run path/to/file.test.ts        # Single test file
npx vitest run -t "test name pattern"      # Single test by name
npm run e2e              # Playwright E2E (starts dev server automatically)
npm run e2e:ui           # Playwright UI mode
npx playwright test e2e/tests/file.spec.ts # Single E2E test

# Database
npm run db:generate      # Generate Prisma client
npm run db:push          # Sync schema to DB (dev)
npm run db:migrate       # Run migrations (production)

# Build & Lint
npm run build            # Next.js build (also validates TypeScript)
npm run build:server     # Server build (tsc + tsc-alias → dist/)
npm run lint             # ESLint

# Sub-project tests
cd vibeflow-desktop && npx vitest run   # Desktop unit tests
cd vibeflow-desktop && npx playwright test  # Desktop E2E
cd vibeflow-ios && npx jest             # iOS tests
```

## Code Quality Gates (必须遵守)

Every code change must pass these checks in order:

1. **TypeScript compilation**: `npm run build` or `npx tsc --noEmit`
2. **Tests pass**: `npm test`
3. **Lint clean**: `npm run lint`

Cross-environment type compatibility: use `ReturnType<typeof setTimeout>` instead of `NodeJS.Timeout`.

## Architecture

### Domain Hierarchy

```
Goals (1 week–5 years)
  └── Projects (task containers)
        └── Tasks (P1/P2/P3, hierarchical with subtasks, require planDate)
              └── Pomodoros (10–120 min focus sessions, always tied to a task)
```

### Daily State Machine

```
LOCKED → PLANNING → FOCUS ↔ REST → LOCKED
                              ↓
                          OVER_REST
```

| State | User Can Do |
|-------|-------------|
| `LOCKED` | Complete airlock only |
| `PLANNING` | Start pomodoro, manage tasks |
| `FOCUS` | Complete/abort active pomodoro, switch tasks |
| `REST` | Complete rest, override daily cap |
| `OVER_REST` | Forced return after exceeding rest time |

Machine: `src/machines/vibeflow.machine.ts`. Daily reset at 04:00 AM. Default cap: 8 pomodoros/day. Top 3 task selection during airlock (0–3 tasks).

### Service Layer Pattern

All business logic lives in `src/services/` as singleton objects (~50 services). Services return `ServiceResult<T>`:

```typescript
type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: ErrorCode; message: string } };
// ErrorCode: 'VALIDATION_ERROR' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR' | 'AUTH_ERROR'
```

Pattern: Zod schema → validate → verify userId ownership → Prisma operation → broadcast state change.

All services exported from `src/services/index.ts`.

### tRPC Router Pattern

Routers in `src/server/routers/` are thin wrappers — no business logic. Root router at `_app.ts` combines ~21 domain routers.

Three procedure types in `src/server/trpc.ts`:
- `publicProcedure` — no auth
- `protectedProcedure` — requires authenticated user
- `withStateValidation(allowedStates)` — enforces state machine guard

### Real-time Communication

`src/server/socket.ts` handles all WebSocket events. After state mutations, always call `socketBroadcastService.broadcastStateChange(userId, state)`.

### MCP Integration

`src/mcp/` provides AI assistant integration via `@modelcontextprotocol/sdk` (stdio transport):
- 13 resources (`vibe://` URIs) for reading context, tasks, analytics
- 28 tools (`flow_*`) for task management, pomodoro control, project operations

Auth: dev mode uses `dev_<email>` tokens, production uses `vibeflow_<userId>_<secret>`.

### Import Convention

Path alias: `@/*` → `./src/*`

```typescript
import { prisma } from '@/lib/prisma';
import { trpc } from '@/lib/trpc';
```

### Testing Layout

| Type | Tool | Location | Pattern |
|------|------|----------|---------|
| Unit/Integration | Vitest | Co-located or `tests/` | `*.test.ts` |
| Property | fast-check + Vitest | `tests/property/` | `*.property.ts` |
| E2E | Playwright | `e2e/tests/` | `*.spec.ts` |
| E2E fixtures | Playwright | `e2e/fixtures/factories/` | `*.factory.ts` |

E2E auth via `X-Dev-User-Email` header (non-production only).

### Database

Schema: `prisma/schema.prisma` (34 models). Prisma is the only database access layer.

### Entry Point

`server.ts` — custom HTTP server that boots Next.js + Socket.io + pomodoro scheduler. Graceful shutdown on SIGTERM/SIGINT. Hot reload via tsx watch (SIGUSR2).

## Development Principles

- 整体架构按照DDD方式构建，不做过度抽象
- 分阶段开发，每个阶段要有happy path测试后再进入下一阶段
- Services verify `userId` ownership before any data access
- Zod schemas define validation once, reuse in routers and services
- Routers stay thin — delegate to services
- Multi-client support with offline resilience

## Steering Documents (必读)

Before starting any new feature, read `.kiro/steering/`:
- `product.md` — domain hierarchy, Daily State Machine, platform locations
- `structure.md` — service/router patterns, component conventions
- `tech.md` — tech stack, import conventions, constraints

Update steering docs if implementation reveals inconsistencies.

## Feature Specs (Required)

New features require specs in `.kiro/specs/<feature-name>/`:
- `requirements.md` — requirements and acceptance criteria
- `design.md` — technical design and architecture decisions
- `tasks.md` — implementation tasks and progress tracking (mark `[x]` on completion)

## Environment Setup

See `.env.example` for required variables: `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `DEV_MODE`, `DEV_USER_EMAIL`.
