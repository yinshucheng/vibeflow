# VibeFlow 开发指南

## 目录

- [快速开始](#快速开始)
- [服务架构](#服务架构)
- [启动方式](#启动方式)
- [VSCode 调试配置](#vscode-调试配置)
- [数据库管理](#数据库管理)
- [测试](#测试)
- [日志说明](#日志说明)
- [常见问题](#常见问题)

---

## 快速开始

### 1. 环境准备

```bash
# 安装依赖
npm install

# 复制环境配置
cp .env.example .env

# 编辑 .env 文件，配置数据库连接
# DATABASE_URL="postgresql://username@localhost:5432/vibeflow?schema=public"
```

### 2. 数据库初始化

```bash
# 创建数据库 (如果不存在)
psql -d postgres -c "CREATE DATABASE vibeflow;"

# 同步 Prisma Schema 到数据库
npm run db:push

# 或者使用迁移 (生产环境推荐)
npm run db:migrate
```

### 3. 启动服务

```bash
# 推荐：启动完整服务 (Next.js + Socket.io + 热更新)
npm run dev

# 访问 http://localhost:3000
```

---

## 服务架构

```
┌─────────────────────────────────────────────────────────────┐
│                    VibeFlow Application                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Next.js    │  │  Socket.io   │  │  MCP Server  │       │
│  │   (Web UI)   │  │  (实时通信)   │  │  (AI 集成)   │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                 │                 │                │
│  ┌──────▼─────────────────▼─────────────────▼──────┐        │
│  │                   tRPC API                       │        │
│  │              (类型安全的 API 层)                  │        │
│  └──────────────────────┬───────────────────────────┘        │
│                         │                                    │
│  ┌──────────────────────▼───────────────────────────┐        │
│  │                 Service Layer                     │        │
│  │    (业务逻辑: User, Project, Task, Goal, etc.)    │        │
│  └──────────────────────┬───────────────────────────┘        │
│                         │                                    │
│  ┌──────────────────────▼───────────────────────────┐        │
│  │              Prisma ORM + PostgreSQL              │        │
│  └───────────────────────────────────────────────────┘        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 启动方式

### NPM 命令

| 命令 | 说明 | 热更新 |
|------|------|--------|
| `npm run dev` | 完整服务 (Next.js + Socket.io) | ✅ |
| `npm run dev:next` | 仅 Next.js (无 Socket.io) | ✅ |
| `npm run dev:mcp` | MCP Server (AI 集成) | ✅ |
| `npm run build` | 生产构建 | - |
| `npm run start` | 生产启动 | - |

### 服务端口

| 服务 | 端口 | 说明 |
|------|------|------|
| Web Server | 3000 | Next.js + Socket.io |
| Socket.io | 3000 | 与 Web Server 共享端口 |
| Prisma Studio | 5555 | 数据库管理界面 |

---

## VSCode 调试配置

在 VSCode 中按 `F5` 或点击 "Run and Debug" 面板，选择以下配置：

### 推荐配置

| 配置名称 | 说明 |
|----------|------|
| 🚀 VibeFlow Server (推荐) | 启动完整服务，自动打开浏览器 |
| 🌐 Full Stack (Server + MCP) | 同时启动 Web 服务和 MCP 服务 |

### 其他配置

| 配置名称 | 说明 |
|----------|------|
| 📦 Next.js Only | 仅启动 Next.js，不含 Socket.io |
| 🔌 MCP Server | 启动 MCP 服务器 |
| 🧪 Vitest: Run Tests | 运行单元测试 |
| 🧪 Vitest: Watch Mode | 监听模式运行测试 |
| 🎭 Playwright E2E Tests | 运行 E2E 测试 |
| 🎭 Playwright E2E (UI Mode) | E2E 测试 UI 模式 |
| 🗄️ Prisma Studio | 打开数据库管理界面 |
| 🔧 Debug: Server (Full-stack) | 带断点调试的服务启动 |

### 使用方法

1. 打开 VSCode 的 "Run and Debug" 面板 (`Cmd+Shift+D` / `Ctrl+Shift+D`)
2. 从下拉菜单选择配置
3. 点击绿色播放按钮或按 `F5`

---

## 数据库管理

### 常用命令

```bash
# 生成 Prisma Client
npm run db:generate

# 同步 Schema 到数据库 (开发环境)
npm run db:push

# 创建迁移 (生产环境)
npm run db:migrate

# 打开 Prisma Studio (数据库 GUI)
npm run db:studio
```

### 数据库连接

在 `.env` 文件中配置：

```env
DATABASE_URL="postgresql://username@localhost:5432/vibeflow?schema=public"
```

---

## 测试

### 单元测试 (Vitest)

```bash
# 运行一次
npm run test

# 监听模式
npm run test:watch
```

### E2E 测试 (Playwright)

```bash
# 运行 E2E 测试
npm run e2e

# UI 模式 (可视化)
npm run e2e:ui

# 查看测试报告
npm run e2e:report
```

---

## 日志说明

启动服务后，你会看到彩色日志输出：

```
[2024-12-29 23:56:00] INFO  🚀 Starting VibeFlow Server...
[2024-12-29 23:56:00] INFO     Environment: development
[2024-12-29 23:56:00] INFO     Node.js: v20.x.x

[2024-12-29 23:56:02] INFO  ═══════════════════════════════════════════════════════════
[2024-12-29 23:56:02] INFO  ✅ VibeFlow Server Ready
[2024-12-29 23:56:02] INFO  ═══════════════════════════════════════════════════════════
[2024-12-29 23:56:02] INFO     🌐 URL:        http://localhost:3000
[2024-12-29 23:56:02] INFO     🔌 Socket.io:  Enabled
[2024-12-29 23:56:02] INFO     🔄 Hot Reload: Enabled (tsx watch)
[2024-12-29 23:56:02] INFO     🗄️  Database:   PostgreSQL
[2024-12-29 23:56:02] INFO     🔐 Auth Mode:  Development (X-Dev-User-Email)
[2024-12-29 23:56:02] INFO  ═══════════════════════════════════════════════════════════
```

### 请求日志格式

```
[时间戳] 方法   URL                                              状态码 耗时
[2024-12-29 23:56:05] GET    /api/trpc/project.list              200    15ms
[2024-12-29 23:56:05] POST   /api/trpc/task.create               201    45ms
```

### 日志级别颜色

- 🟢 **INFO** - 正常信息
- 🟡 **WARN** - 警告信息
- 🔴 **ERROR** - 错误信息
- 🔵 **DEBUG** - 调试信息

---

## 常见问题

### 1. 数据库连接失败

**错误**: `User was denied access on the database`

**解决方案**:
1. 确保 PostgreSQL 正在运行
2. 检查 `.env` 中的 `DATABASE_URL` 配置
3. 确保数据库 `vibeflow` 存在

```bash
# 检查 PostgreSQL 状态
pg_isready -h localhost -p 5432

# 创建数据库
psql -d postgres -c "CREATE DATABASE vibeflow;"

# 同步 Schema
npm run db:push
```

### 2. 认证失败 (401 Unauthorized)

**错误**: `Authentication required`

**解决方案**:
1. 确保 `.env` 中设置了 `DEV_MODE="true"`
2. 开发模式下会自动使用 `X-Dev-User-Email` header 认证
3. 默认用户: `dev@vibeflow.local`

### 3. 热更新不生效

**解决方案**:
1. 确保使用 `npm run dev` 启动 (使用 tsx watch)
2. 检查文件是否保存
3. 某些配置文件更改需要重启服务

### 4. Socket.io 连接失败

**解决方案**:
1. 确保使用 `npm run dev` 而不是 `npm run dev:next`
2. 检查浏览器控制台是否有 CORS 错误
3. 确保端口 3000 没有被占用

---

## 开发模式认证

在开发模式下 (`DEV_MODE="true"`)，系统使用 `X-Dev-User-Email` header 进行认证：

```typescript
// 前端请求会自动带上认证 header
// 或者手动设置:
fetch('/api/trpc/project.list', {
  headers: {
    'X-Dev-User-Email': 'dev@vibeflow.local'
  }
});
```

E2E 测试中使用 Auth Fixture 自动处理认证：

```typescript
import { test } from '../fixtures';

test('example test', async ({ authenticatedPage }) => {
  // authenticatedPage 已经配置了认证 header
  await authenticatedPage.goto('/projects');
});
```
