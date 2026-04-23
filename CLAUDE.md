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

### 跨端同步测试（修改 Socket/广播/认证相关代码时必跑）

```bash
# 独立测试（不需要 dev server，任何时候可跑）
npx vitest --run tests/integration/data-change-broadcast.test.ts  # 4 tests: socket room 广播正确性
npx vitest --run tests/integration/socket-protocol.test.ts         # 39 tests: 无 legacy 事件残留
npx vitest --run tests/integration/offline-flush-sequence.test.ts  # 22 tests: 离线 flush 时序

# 端到端测试（需要先启动 npm run dev）
npx vitest --run tests/integration/cross-client-sync.test.ts       # 7 tests: 完整链路验证
```

`cross-client-sync.test.ts` 验证：API token 认证 → WS 连接 → Web 创建任务 → iOS 收到 DATA_CHANGE → iOS 创建任务 → Web 收到 DATA_CHANGE → 番茄启动 → SYNC_STATE + UPDATE_POLICY 推送。

**触发条件**：修改以下文件时必须跑 `cross-client-sync.test.ts`：
- `src/server/socket.ts`（广播逻辑）
- `src/server/socket-init.ts`（broadcaster 注册）
- `src/services/state-engine*.ts`（状态广播）
- `src/services/socket-broadcast.service.ts`（DATA_CHANGE 广播）
- `src/server/routers/*.ts` 中的 `broadcastDataChange` 调用
- `src/lib/socket-client.ts`（Web socket 认证）
- `src/hooks/use-socket.ts`（Web socket 连接）
- `src/stores/realtime.store.ts`（Web 实时状态）
- `packages/octopus-protocol/src/protocol/`（SDK command handler/state manager）

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
- **重写/大幅修改文件前，必须先查所有消费者**：用 `grep` 或 LSP `findReferences` 检查该文件的所有 export 被哪些文件 import。重写后逐一确认每个 export 仍然存在且签名兼容。常见事故：简化模块时删掉了被其他文件依赖的导出函数（如 `setCachedEmail`、`getSocketAuthPayload`），TypeScript 编译通过（因为 iOS 子项目有独立 tsconfig），但运行时 `undefined is not a function`。
- **修改 shared 模块的检查清单**：1) `grep -rn 'from.*模块名' src/ vibeflow-ios/ vibeflow-desktop/ vibeflow-extension/` 列出所有消费者 2) 确认所有 import 的名称在新代码中仍然 export 3) 跑所有子项目的 `tsc --noEmit`（不只是主项目）
- **iOS 子项目必须单独验证编译**：主项目 `npx tsc --noEmit` 不覆盖 iOS 的 tsconfig。修改 iOS 代码后必须跑 `cd vibeflow-ios && npx tsc --noEmit`。

## 跨端开发防坑规则

> 从八爪鱼协议统一化验收中总结的教训。

### 模块共享状态必须用 globalThis
Next.js custom server（Node.js 原生加载）和 App Router route handlers（webpack 编译）在同一进程但**不同模块图**。模块级 `let` 变量在两个图中是独立实例。**任何跨模块共享的 mutable state（singleton、broadcaster、registry）必须存在 `globalThis` 上。** 参考 `src/server/socket.ts` 的 `__vibeflow_socket_server__` 模式。

### 跨端功能先写自动化测试再手动验证
手动验证（启动模拟器、刷新浏览器、观察 UI）每次来回 5-10 分钟。写一个 `tests/integration/cross-client-sync.test.ts` 跑一次 15 秒。**任何涉及"端 A 操作 → 端 B 感知"的功能，必须先有集成测试覆盖**（真实 socket.io server + client），再做人工验证。测试要包含：1) 认证 2) 用户身份一致性断言 3) 消息到达。

### 部署后必须验证编译产物
`npx tsc --noEmit` 验证的是源码，Docker 里跑的是 `dist/server.js`（CJS 编译产物）。**本地测试全绿不代表生产环境正常。** 部署后至少检查一次关键日志：`docker compose logs --since=1m | grep "queued\|error\|not ready"`。后续考虑加 `npm run build:server && node -e "require('./dist/src/server/socket')"` 作为 CI smoke test。

### 禁止 DEV_MODE 影响认证链路
`DEV_MODE` 只用于开发便利（如跳过密码、自动创建用户），**绝不能绕过 middleware 认证或改变用户身份解析逻辑**。不同端走不同的 DEV_MODE fallback 会导致用户不一致——表面上"都能用"但实际是不同用户，跨端同步全部失效。middleware 的 DEV_MODE bypass 已移除（commit `53cac84`），其余 ~57 处待清理。

### deploy.sh 不截断日志
`docker compose build 2>&1 | tail -5` 会隐藏编译错误（如 `ENOSPC`、`npm error`）。改为 `| tail -20` 或在失败时 dump 完整日志。部署脚本中任何可能失败的步骤都要 `set -e` + 有意义的错误输出。

### 桌面端 renderer 来自远程服务器——改本地代码不够，必须部署
Release app 的 renderer（webContents）加载的是**远程服务器的 Next.js 页面**（`http://39.105.213.147:4000`），不是本地代码。`src/components/` 下的前端修改（如 `tray-sync-provider.tsx`）只有**部署到远程服务器后**才能生效。桌面端 `npm run build` 只编译 Electron main process（`electron/` 目录），不影响 renderer 页面。排查桌面端 bug 时第一步确认：**这个逻辑跑在 main process 还是 renderer？** renderer 的修复 = 部署远程服务器。

### 桌面端 tsc 编译输出路径陷阱
`vibeflow-desktop/tsconfig.json` 的 paths 映射了 `@vibeflow/octopus-protocol` 到 `../packages/` 源码，导致 tsc 推断 rootDir 为 monorepo 根目录，输出到 `dist/vibeflow-desktop/electron/` 而非 `dist/electron/`。但 `package.json` 的 `main` 是 `dist/electron/main.js`。**编译后必须确认产物路径**：`ls dist/electron/main.js` 且 `grep` 确认包含新代码。如果路径不对，用 `rsync` 同步。

### 桌面端 tray 状态的数据所有权
`tray-manager` 的 `pomodoroActive` 和 `isInSleepTime` 有两个写入者竞争：renderer（通过 IPC `tray:updateMenu`）和 main process（通过 `startPomodoroCountdown` / `onPolicyUpdate`）。**当两者冲突时，main process 应该是 owner**——renderer 可能是旧代码（远程未部署）。对于关键状态（pomodoro、sleep），main process 应 `delete` renderer 发来的值，自己通过 `onStateChange` / `sleepEnforcer` 判断。

### iOS Release build 需要单独验证网络
Debug build 中 iOS 自动放行 HTTP（ATS 豁免），但 Release build 严格执行 ATS。**对纯 IP 地址的 HTTP 请求，即使 `NSAllowsArbitraryLoads: true` 也不够——需要 `NSExceptionDomains` 显式豁免。** 上 HTTPS + 域名后此问题消失。

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
| `desktop-tray-self-driven` | not-started | Tray 状态由 main process 自驱动（读 stateSnapshot），去掉 renderer IPC 依赖 |
o'n'g's
## Environment Setup

See `.env.example` for required variables: `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `DEV_MODE`.
hua