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

## Feature Specs (Required)

新功能开发必须先在 `.kiro/specs/<feature-name>/` 下创建设计文档：

- `requirements.md` - 需求定义和验收标准
- `design.md` - 技术设计和架构决策
- `tasks.md` - 实现任务拆分和进度跟踪

参考现有 specs: `e2e-testing`, `pomodoro-enhancement`, `ai-native-enhancement`, `desktop-focus-enforcement` 等。
