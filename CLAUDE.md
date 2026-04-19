# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VibeFlow is an AI-Native Output Engine — 帮助用户心想事成的系统。核心理念：**用户有预期状态（工作、休息、睡眠、目标达成），现实往往偏离，系统持续校正帮用户回归预期。** 目标管理、任务拆解、番茄钟、休息保护、睡眠管理、AI 建议都是手段。

It has four clients sharing one backend:

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

### Daily State Machine (3-state model)

```
IDLE ──START_POMODORO──→ FOCUS ──COMPLETE/ABORT──→ IDLE
  ↑                                                  │
  └──RETURN_TO_IDLE/START_POMODORO── OVER_REST ←─────┘
                                     (rest exceeded)
```

| State | DB Value | User Can Do |
|-------|----------|-------------|
| `idle` | `IDLE` | Start pomodoro, manage tasks, plan day |
| `focus` | `FOCUS` | Complete/abort active pomodoro, switch tasks |
| `over_rest` | `OVER_REST` | Start pomodoro (forced return) or acknowledge |

REST is a **sub-phase of IDLE** — determined by `lastPomodoroEndTime` (recent completion = resting). Desktop tray shows `READY` or `RESTING` accordingly.

**OVER_REST trigger conditions** (`scheduleOverRestTimer` + 30s fallback):
- State is `idle` AND `lastPomodoroEndTime` exists (pomodoro was completed, not aborted)
- AND (`isWithinWorkHours` OR `inFocusSession`) — without either, OVER_REST does not trigger
- Timer delay = `shortRestDuration + overRestGracePeriod` (default: 5+5 = 10 min)

**Time windows and their effects:**

| Window | Can start pomodoro? | OVER_REST triggers? | Enforcement |
|--------|--------------------|--------------------|-------------|
| Work time | ✅ | ✅ | Distraction apps blocked during FOCUS |
| Non-work, no Focus Session | ✅ | ❌ | No enforcement |
| Non-work + Focus Session (overtime) | ✅ | ✅ | Distraction + sleep apps blocked |
| Sleep time, no Focus Session | ✅ | ❌ | Sleep enforcement active |
| Sleep time + Focus Session | ✅ | ✅ | Sleep enforcement overridden |

Machine: `src/machines/vibeflow.machine.ts`. StateEngine: `src/services/state-engine.service.ts`. Daily reset at 04:00 AM. Default cap: 8 pomodoros/day.

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

## Development Principles

- 整体架构按照DDD方式构建，不做过度抽象
- 分阶段开发，每个阶段要有happy path测试后再进入下一阶段
- Services verify `userId` ownership before any data access
- Zod schemas define validation once, reuse in routers and services
- Routers stay thin — delegate to services
- Multi-client support with offline resilience
- 修改服务端 API/Socket 事件/数据结构时，必须检查所有 4 个客户端（Web、Desktop、Extension、iOS）是否需要同步调整
- Bug 修复流程：先写测试复现 bug（单测优先，必要时用 E2E），再修复代码。如果 bug 难以用自动化测试复现（如纯 UI/环境相关），需在 commit message 中说明理由和手动复现步骤。

## Deployment

Production runs on Alibaba Cloud ECS via Docker. Key commands:

```bash
./deploy/deploy.sh              # Deploy to production (one command)
./scripts/start-remote.sh ios   # Start iOS connected to remote server
./scripts/start-remote.sh desktop  # Start Desktop connected to remote server (dev mode)

# Desktop release build (packaged .app auto-connects to remote server)
cd vibeflow-desktop && npm run build:mac && open release/mac-arm64/VibeFlow.app
```

Local `npm run dev` connects to local DB — isolated from production.

See `.kiro/steering/deployment.md` for full deployment guide, server operations, and data backup.

## Reference Documents

`.kiro/steering/` 中有专题参考文档，仅在涉及相关功能时按需查阅。核心架构和约束以本文件（CLAUDE.md）为唯一 truth source。

| Document | When to read |
|----------|-------------|
| `deployment.md` | 部署、服务器运维、客户端连接远程服务器 |
| `desktop-window-behavior.md` | Desktop 窗口行为 |
| `e2e-testing.md` | E2E 测试 |

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
| `pomodoro-state-transition` | deprecated | Superseded by state-management-overhaul |
| `state-management-overhaul` | not-started | 状态管理系统重构：3 状态模型、统一转换引擎、OVER_REST 显式化 |
| `ios-screen-time` | requirements | Has design + pipeline config, no tasks |
| `mobile-app` | deprecated | Superseded by ios-mvp |
| `dashboard-command-center` | not-started | Dashboard 指挥部改造，内嵌番茄钟+任务操作 |
| `work-rhythm-enhancement` | tested | OVER_REST 一致性、UI 显示修复、加班模式、健康提醒、跨客户端通知 |
| `auth-and-skill-api` | tested | Phase 1/2/4/5 完成并验收。剩余：Phase 3（iOS/Desktop 认证）、task 16（上架 README/LICENSE） |
| `octopus-protocol-unification` | not-started | 八爪鱼协议统一：共享类型包、清理 legacy 事件、统一 Policy、客户端 SDK |

## Environment Setup

See `.env.example` for required variables: `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `DEV_MODE`, `DEV_USER_EMAIL`.
