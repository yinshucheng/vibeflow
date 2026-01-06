# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VibeFlow is an AI-Native Output Engine - a productivity and focus management system with multi-client support (web, desktop, browser extension, iOS).

## Tech Stack

- **Frontend**: Next.js 14, React 19, TypeScript 5.7, Tailwind CSS
- **Backend**: tRPC 11, Socket.io 4.8
- **State Machine**: XState 5.19 (LOCKED → PLANNING → FOCUS → REST)
- **Database**: PostgreSQL + Prisma 6.2
- **AI Integration**: MCP SDK 1.25

## Commands

```bash
# Development
npm run dev              # Full stack (Next.js + Socket.io + hot reload)
npm run dev:mcp          # MCP server for AI integration

# Testing
npm run test             # Vitest unit tests
npm run test:watch       # Vitest watch mode
npm run e2e              # Playwright E2E tests
npm run e2e:ui           # Playwright UI mode

# Database
npm run db:generate      # Generate Prisma client
npm run db:push          # Sync schema to DB
npm run db:studio        # Prisma Studio GUI

# Linting
npm run lint             # ESLint
```

## Architecture

### DDD Bounded Contexts

The codebase follows Domain-Driven Design with 11 bounded contexts:
- User Management, Project Management, Task Management
- Pomodoro/Focus, Activity Tracking, Settings
- Entertainment, Demo Mode, Bypass Detection
- AI-Native Features, MCP Integration

### Key Directories

- `/src/services` - 44 business logic services (single responsibility)
- `/src/server` - tRPC routers and Socket.io setup
- `/src/mcp` - MCP server (resources, tools, auth)
- `/src/machines` - XState state machine definitions
- `/prisma` - Database schema (30+ models)
- `/e2e` - Playwright E2E tests
- `/tests/property` - Property-based tests with fast-check

### State Machine

Core system state managed by XState: `LOCKED → PLANNING → FOCUS → REST`
- Guards enforce business rules (canStartPomodoro, dailyCapReached)
- Located in `/src/machines/vibeflow.machine.ts`

### MCP Integration

Resources (read-only): `vibe://context/current`, `vibe://tasks/today`, `vibe://analytics/productivity`, etc.
Tools (executable): `vibe.complete_task`, `vibe.start_pomodoro`, `vibe.create_task_from_nl`, etc.

## Development Principles

- 整体架构按照DDD方式构建，不做过度抽象
- 分阶段开发，每个阶段要有happy path测试后再进入下一阶段
- Type-safe throughout (TypeScript strict mode)
- Multi-client support with offline resilience

## Code Quality Gates (必须遵守)

每次代码改动后，必须按顺序通过以下检查：

1. **TypeScript 编译**: `npm run build` 或 `npx tsc --noEmit`
2. **测试通过**: `npm test`
3. **Lint 检查**: `npm run lint`

### 改动原则

- 修改任何 `.ts/.tsx` 文件后，立即运行 `npm test` 验证
- 修复一个问题时，不要引入新问题（测试回归）
- 类型修改要考虑跨环境兼容（浏览器 vs Node.js），如 `setTimeout` 返回类型用 `ReturnType<typeof setTimeout>`
- 测试文件修改后，确保测试仍能独立运行（检查变量作用域、异步初始化）

## Steering Documents (必读)

每次新需求启动前，必须先阅读 `.kiro/steering/` 目录下的文档：

- `product.md` - 产品上下文、领域层级、Daily State Machine
- `structure.md` - 目录结构、Service Layer 模式、tRPC Router 模式
- `tech.md` - 技术栈、命令、测试工具、关键约束

如果实现过程中发现文档与代码不一致，或有新的架构决策，需要同步更新 steering 文档。

## Feature Specs (Required)

新功能开发必须先在 `.kiro/specs/<feature-name>/` 下创建设计文档：

- `requirements.md` - 需求定义和验收标准
- `design.md` - 技术设计和架构决策
- `tasks.md` - 实现任务拆分和进度跟踪

参考现有 specs: `e2e-testing`, `pomodoro-enhancement`, `ai-native-enhancement`, `desktop-focus-enforcement` 等。
