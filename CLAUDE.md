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

每个独立功能点或 bug 修复完成后，**立即**依次运行以下检查，不要积攒到最后：

1. **TypeScript compilation**: 仅改服务端代码时 `npx tsc --noEmit` 即可；涉及前端或需完整验证时 `npm run build`
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

Routers in `src/server/routers/` are thin wrappers — no business logic。Router 中禁止出现：数据库查询、业务条件判断、数据转换逻辑。如果需要这些，提取到 service。Root router at `_app.ts` combines ~21 domain routers.

Three procedure types in `src/server/trpc.ts`:
- `publicProcedure` — no auth
- `protectedProcedure` — requires authenticated user
- `withStateValidation(allowedStates)` — enforces state machine guard

### Real-time Communication

`src/server/socket.ts` handles all WebSocket events. After state mutations, always call `socketBroadcastService.broadcastStateChange(userId, state)`。涉及状态机 state 变迁的操作（如 FOCUS→REST），必须使用 `broadcastFullState` 而非仅广播 delta，确保所有客户端状态一致。

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

Schema: `prisma/schema.prisma` (34 models). Prisma is the only database access layer。修改 schema 后必须：`db:generate` → `db:push` → 检查相关 service 的 Zod schema 是否需要同步更新。

### Entry Point

`server.ts` — custom HTTP server that boots Next.js + Socket.io + pomodoro scheduler. Graceful shutdown on SIGTERM/SIGINT. Hot reload via tsx watch (SIGUSR2).

## Auto-Start Services for Verification

代码修改后需要验证时（如真机测试），自动启动相关服务，除非用户明确说"我自己启动"：
- **iOS 验证**: `cd vibeflow-ios && EXPO_PUBLIC_SERVER_HOST=$(ipconfig getifaddr en0) npx expo start --port 8081`
- **Web/Backend 验证**: `npm run dev`
- 启动前先检查端口是否已占用，已占用则先 kill 再启动

## npm Registry 规则

**禁止使用美团内网 npm 源**（`r.npm.sankuai.com`、`npm.sankuai.com`）。本项目部署在阿里云 ECS，无法访问美团内网。

- `package-lock.json` 中的 `resolved` URL 不允许包含 `sankuai.com`
- `.npmrc` 不允许配置美团 registry
- 如果发现 lockfile 中有美团源 URL，立即替换为 `https://registry.npmmirror.com` 或 `https://registry.npmjs.org`
- 安装依赖前确认当前 npm registry 不是美团源：`npm config get registry`

## Development Principles

- 整体架构按照DDD方式构建，不做过度抽象
- 分阶段开发，每个阶段要有happy path测试后再进入下一阶段
- Services verify `userId` ownership before any data access
- Zod schemas define validation once, reuse in routers and services
- Routers stay thin — delegate to services
- Multi-client support with offline resilience
- 修改服务端 API/Socket 事件/数据结构时，必须检查所有 4 个客户端（Web、Desktop、Extension、iOS）是否需要同步调整
- Bug 修复流程：先写测试复现 bug（单测优先，必要时用 E2E），再修复代码。如果 bug 难以用自动化测试复现（如纯 UI/环境相关），需在 commit message 中说明理由和手动复现步骤。

## Reference Documents

`.kiro/steering/` 中有专题参考文档（如 `desktop-window-behavior.md`、`e2e-testing.md`），仅在涉及相关功能时按需查阅。核心架构和约束以本文件（CLAUDE.md）为唯一 truth source。

## Feature Specs (Required)

New features require specs in `.kiro/specs/<feature-name>/`:
- `requirements.md` — requirements and acceptance criteria
- `design.md` — technical design and architecture decisions
- `tasks.md` — implementation tasks and progress tracking (mark `[x]` on completion)

### Spec Status Labels

Each spec has a status label. When working on a spec, update the table below.

| Label | Meaning |
|-------|---------|
| `done` | All tasks completed and verified |
| `tested` | Implementation complete, tests passing |
| `dev` | Actively in development |
| `partial` | Some tasks done, not actively being worked on |
| `requirements` | Only requirements.md exists, no design or tasks |
| `not-started` | Has design/tasks but no implementation yet |
| `deprecated` | Superseded by another spec |

### Spec Status Table

| Spec | Status | Notes |
|------|--------|-------|
| `vibeflow-foundation` | done | Core services, state machine, UI, MCP, extension |
| `desktop-focus-enforcement` | done | Electron focus enforcement, tray, skip tokens |
| `desktop-production-resilience` | done | Heartbeat, bypass detection, demo mode, process guardian |
| `desktop-tray-enhancement` | done | Tray state display, tooltips, icons |
| `browser-sentinel-enhancement` | done | Entertainment mode, LOCKED/OVER_REST restrictions |
| `ai-native-enhancement` | done | Smart suggestions, task decomposition, MCP |
| `ad-hoc-focus-session` | done | Focus sessions, sleep time, progress calculations |
| `ios-mvp` | done | iOS read-only client, Screen Time, notifications |
| `octopus-architecture` | done | Protocol types, client registry, policy distribution |
| `octopus-protocol-unification` | done | 共享类型包、Policy Config/State 拆分、删 legacy 事件、协议层 SDK、消除 Web 轮询、conformance 测试 |
| `pomodoro-enhancement` | partial | Tasks 16.5–16.8 (WebsiteStatsService) not done |
| `pomodoro-multitask-enhancement` | partial | Phase 1–2 done, Phase 3 ~80%, Phase 4–8 not started |
| `e2e-testing` | partial | Fixtures + core flows done; Page Objects, CRUD E2E, CI/CD missing |
| `dev-user-system` | not-started | Multi-user, data isolation, OAuth prep |
| `rest-sleep-enforcement` | deprecated | Superseded by desktop-rest-enforcement |
| `desktop-rest-enforcement` | not-started | REST work app blocking, OVER_REST fix, health notifications |
| `ui-redesign` | not-started | Design tokens, component library, accessibility |
| `ios-mobile-enhancement` | not-started | iOS write operations |
| `mcp-capability-enhancement` | not-started | 8 additional MCP tools |
| `production-auth` | not-started | Login/register UI, OAuth, password reset, security |
| `data-isolation-audit` | not-started | Prisma query audit, Socket isolation, cross-user tests |
| `error-observability` | not-started | Error boundary, structured logs, health check |
| `e2e-test-coverage` | not-started | Task/Project/Goal/Settings/DailyState CRUD E2E |
| `pre-launch-polish` | not-started | Secret management, performance, onboarding, privacy |
| `public-network-deployment` | requirements | Public network deployment plan |
| `state-aware-enforcement` | requirements | State-aware enforcement rules |
| `task-categorization` | requirements | Task categorization system |
| `pomodoro-state-transition` | requirements | Architecture refactor docs |
| `ios-screen-time` | requirements | Has design + pipeline config, no tasks |
| `mobile-app` | deprecated | Superseded by ios-mvp |
| `dashboard-command-center` | not-started | Dashboard 指挥部改造，内嵌番茄钟+任务操作 |
| `work-rhythm-analytics` | requirements | 工作节奏统计：上班效率、加班检测、休息保护、节奏评分 |
o'n'g's
## Environment Setup

See `.env.example` for required variables: `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `DEV_MODE`, `DEV_USER_EMAIL`.
hua