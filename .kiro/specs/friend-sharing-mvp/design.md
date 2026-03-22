# Friend Sharing MVP - Technical Design

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        Clients                                  │
│  Web (/login, /register)  │  iOS (LoginScreen)  │  Desktop     │
│  Browser Extension        │                     │  (LoginWindow)│
└────────────┬──────────────┴──────────┬──────────┴──────┬───────┘
             │ NextAuth Cookie         │ API Token        │ API Token
             │ (HttpOnly JWT)          │ (vf_xxx)         │ (vf_xxx)
             ▼                         ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend (server.ts)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │ Next.js      │  │ tRPC         │  │ Socket.io             │ │
│  │ Middleware    │  │ createContext │  │ authenticateSocket    │ │
│  │ (redirect    │  │ (session →   │  │ (cookie/token →       │ │
│  │  to /login)  │  │  UserContext) │  │  UserContext)         │ │
│  └──────────────┘  └──────────────┘  └───────────────────────┘ │
│                           │                                     │
│              ┌────────────▼────────────┐                        │
│              │  userService            │                        │
│              │  .getCurrentUser()      │                        │
│              │  DEV_MODE → header auth │                        │
│              │  PROD → session/token   │                        │
│              └────────────┬────────────┘                        │
│                           ▼                                     │
│              ┌─────────────────────────┐                        │
│              │  Prisma (userId filter) │                        │
│              └─────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

**认证策略分两类**：
- **Web + Extension**：NextAuth JWT cookie（浏览器自动携带，无需额外处理）
- **iOS + Desktop**：API Token（`vf_xxx` 格式，登录后颁发，存本地，每次请求携带）

---

## Phase 1: 登录注册 + 认证集成 (Req 1, 2, 3)

### 1.1 新增文件

| 文件 | 说明 |
|------|------|
| `src/app/(auth)/login/page.tsx` | 登录页面 |
| `src/app/(auth)/register/page.tsx` | 注册页面 |
| `src/app/(auth)/layout.tsx` | Auth 页面布局（无侧边栏、无需登录） |
| `src/middleware.ts` | Next.js middleware，未认证时重定向到 /login |

### 1.2 Next.js Middleware（路由守卫）

```typescript
// src/middleware.ts
import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';

const publicPaths = ['/login', '/register', '/api/auth', '/api/health'];

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // 公开路径放行
  if (publicPaths.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // DEV_MODE 放行（保持开发体验）
  if (process.env.DEV_MODE === 'true') {
    return NextResponse.next();
  }

  // 检查 NextAuth JWT token
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
```

### 1.3 Auth 页面布局

使用 Next.js Route Group `(auth)` 让登录/注册页面不走主布局（无侧边栏、无 Provider 依赖）：

```typescript
// src/app/(auth)/layout.tsx
export default function AuthLayout({ children }) {
  return (
    <html><body>
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        {children}
      </div>
    </body></html>
  );
}
```

### 1.4 登录页面

```typescript
// src/app/(auth)/login/page.tsx — 核心逻辑
// 使用 next-auth/react 的 signIn('credentials', { email, password, redirect: false })
// 成功后 router.push(callbackUrl || '/')
// 失败后显示通用错误

// DEV_MODE 区域（仅 process.env.NEXT_PUBLIC_DEV_MODE === 'true' 时渲染）：
// 输入任意 email → signIn('credentials', { email, password: '', devMode: true })
```

**设计决策**：DEV_MODE 快速登录走 CredentialsProvider 的特殊分支——当 `devMode: true` 时跳过密码验证，直接 auto-create 用户。这需要在 `authOptions.providers` 的 `authorize()` 中加一个判断。

### 1.5 注册页面

```typescript
// src/app/(auth)/register/page.tsx — 核心逻辑
// 1. 前端 Zod 验证 email + password >= 8 + confirmPassword match
// 2. POST /api/auth/register（已有端点）
// 3. 成功后自动调用 signIn('credentials', { email, password }) 完成登录
```

已有的 `/api/auth/register` 端点已经处理了后端验证、重复检测、bcrypt 哈希、创建 UserSettings，无需修改。

### 1.6 userService.getCurrentUser() 生产模式改造

当前问题：生产模式下直接返回 `AUTH_ERROR`，需要从 request headers 中解析 NextAuth session。

```typescript
// src/services/user.service.ts — getCurrentUser() 改造

async getCurrentUser(ctx: {
  headers?: Record<string, string | undefined>;
  session?: { user: { id: string; email: string } } | null;  // 新增
}): Promise<ServiceResult<UserContext>> {
  // 1. DEV_MODE 路径不变
  if (devModeConfig.enabled) { /* 现有逻辑 */ }

  // 2. 生产模式：优先用传入的 session（tRPC context 从 getServerSession 获取）
  if (ctx.session?.user) {
    return {
      success: true,
      data: {
        userId: ctx.session.user.id,
        email: ctx.session.user.email,
        isDevMode: false,
      },
    };
  }

  // 3. API Token 认证（iOS/Desktop 用）
  const authHeader = ctx.headers?.['authorization'];
  if (authHeader?.startsWith('Bearer vf_')) {
    const token = authHeader.slice(7);
    const result = await authService.validateToken(token);
    if (result.success) {
      return {
        success: true,
        data: {
          userId: result.data.userId,
          email: result.data.email,
          isDevMode: false,
        },
      };
    }
  }

  return { success: false, error: { code: 'AUTH_ERROR', message: 'Authentication required' } };
}
```

### 1.7 tRPC Context 改造

```typescript
// src/server/trpc.ts — createContext() 改造

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function createContext(opts: CreateContextOptions) {
  const headers = Object.fromEntries(opts.req.headers);

  // 获取 NextAuth session（生产模式下使用）
  const session = await getServerSession(opts.req, opts.res, authOptions);

  const userResult = await userService.getCurrentUser({ headers, session });
  return {
    user: userResult.success ? userResult.data : null,
    headers,
  };
}
```

### 1.8 Socket.io 认证改造

`authenticateSocket()` 已有 dev mode + API token 路径。需新增 NextAuth cookie 路径：

```typescript
// src/server/socket.ts — authenticateSocket() 新增分支

// 在现有 dev mode 和 API token 之间加入：
// 生产模式 — 从 socket.request 中解析 NextAuth cookie
if (!devModeConfig.enabled) {
  const session = await getServerSession(
    socket.request as any,
    {} as any,  // Socket.io 没有 res，用空对象
    authOptions
  );
  if (session?.user) {
    socket.data = { userId: session.user.id, email: session.user.email, isDevMode: false, ... };
    return;
  }
}
```

**注意**：Socket.io 的 cookie 解析依赖浏览器自动携带 cookie（Web + Extension 场景）。iOS/Desktop 走 API Token 路径（已支持）。

### 1.9 CredentialsProvider authorize() 改造

```typescript
// src/lib/auth.ts — authorize() 加 DEV_MODE 分支

async authorize(credentials) {
  if (!credentials?.email) return null;

  // DEV_MODE 快速登录（无密码）
  if (process.env.DEV_MODE === 'true' && credentials.devMode === 'true') {
    const result = await userService.getOrCreateDevUser(credentials.email);
    if (!result.success || !result.data) return null;
    return { id: result.data.id, email: result.data.email };
  }

  // 正常登录
  const user = await prisma.user.findUnique({ where: { email: credentials.email } });
  if (!user || user.password === 'dev_mode_no_password') return null;
  const valid = await verifyPassword(credentials.password, user.password);
  if (!valid) return null;
  return { id: user.id, email: user.email };
}
```

**关键点**：密码为 `dev_mode_no_password` 的用户（dev 模式创建的）不能通过密码登录，必须先迁移设置正式密码。

### 1.10 前端 UNAUTHORIZED 处理

```typescript
// src/components/providers/trpc-provider.tsx — 加全局错误处理

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${getBaseUrl()}/api/trpc`,
      // 生产模式下不需要手动加 header，cookie 自动携带
      headers() {
        if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
          const devEmail = localStorage.getItem('dev-user-email');
          if (devEmail) return { 'x-dev-user-email': devEmail };
        }
        return {};
      },
    }),
  ],
});

// QueryClient 全局 onError：
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => {
        if (error.data?.code === 'UNAUTHORIZED') return false;
        return count < 3;
      },
    },
    mutations: {
      onError: (error) => {
        if (error.data?.code === 'UNAUTHORIZED') {
          window.location.href = '/login';
        }
      },
    },
  },
});
```

---

## Phase 2: 默认账号迁移 (Req 4)

### 2.1 迁移脚本

```typescript
// scripts/migrate-dev-account.ts
// 用法：npx tsx scripts/migrate-dev-account.ts --password <新密码> [--email <新邮箱>]

import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/auth';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const oldEmail = 'dev@vibeflow.local';
  const newPassword = args.password;   // 必填
  const newEmail = args.email;         // 可选

  // 1. 查找现有账号
  const user = await prisma.user.findUnique({ where: { email: oldEmail } });
  if (!user) { console.log('Account not found, nothing to migrate'); return; }

  // 2. 更新密码（+ 可选的 email）
  const hashed = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashed,
      ...(newEmail ? { email: newEmail } : {}),
    },
  });

  // 3. 验证
  const updated = await prisma.user.findUnique({ where: { id: user.id } });
  console.log(`Migrated: ${oldEmail} → ${updated.email}, password set`);

  // 4. 数据完整性检查
  const counts = {
    projects: await prisma.project.count({ where: { userId: user.id } }),
    tasks: await prisma.task.count({ where: { userId: user.id } }),
    pomodoros: await prisma.pomodoro.count({ where: { userId: user.id } }),
    goals: await prisma.goal.count({ where: { userId: user.id } }),
    dailyStates: await prisma.dailyState.count({ where: { userId: user.id } }),
  };
  console.log('Data integrity check:', counts);
}
```

**幂等性**：脚本只做 `update`，不做 `create`。重复运行只会覆盖密码，不影响数据。

### 2.2 关闭 DEV_MODE

迁移完成后，环境变量改为：

```env
DEV_MODE=false
# DEV_USER_EMAIL 不再需要
```

系统行为变化：
- `userService.getCurrentUser()` 不再走 dev mode 分支
- `getOrCreateDevUser()` 不再被调用
- Next.js middleware 开始强制登录
- Socket.io 不再接受纯 email 认证

---

## Phase 3: 数据隔离审计 (Req 5)

### 3.1 审计方法

逐个检查 `src/services/*.service.ts` 中的每个 Prisma 操作：

```
审计清单（示例）：
✅ task.service.ts — 所有 findMany/findFirst/update/delete 含 userId
✅ project.service.ts — 同上
❌ timeline.service.ts — findMany 缺少 userId（需修复）
N/A auth.service.ts — 管理 API token，按 userId 隔离
```

### 3.2 审计规则

1. **查询类**（findMany/findFirst/findUnique）：where 条件必须包含 `userId`，或通过关联链路隐式包含（如 `task → project → userId`）
2. **写入类**（create/update/delete）：写入前必须验证资源归属（先查后写，或 where 包含 userId）
3. **聚合类**（count/aggregate/groupBy）：where 条件必须包含 `userId`
4. **跳过**：用户自身资源（User model 的 CRUD）、公共数据（如果有）

### 3.3 跨用户隔离 E2E 测试

```typescript
// e2e/tests/data-isolation.spec.ts
// 使用两个不同的 test user（通过 register API 创建）

test('user A cannot see user B tasks', async () => {
  // 1. Register userA, create a task
  // 2. Register userB, list tasks → should be empty
  // 3. userB try to GET userA's task by ID → 404
});

// 同样模式覆盖：projects, goals, pomodoros, settings
```

---

## Phase 4: 客户端认证适配 (Req 6, 7, 8)

### 4.1 iOS 客户端认证

**认证流程**：

```
App 启动 → 检查 SecureStore 中的 API Token
  ├── 有 Token → 验证 Token（GET /api/auth/verify）
  │     ├── 有效 → 进入主界面
  │     └── 无效 → 跳转 LoginScreen
  └── 无 Token → 跳转 LoginScreen

LoginScreen:
  1. 用户输入 email + password
  2. POST /api/auth/register（注册）或 signIn（登录）
  3. 登录成功后调用 POST /api/auth/token 获取 API Token
  4. Token 存入 expo-secure-store
  5. 后续所有 HTTP 请求 Header: Authorization: Bearer vf_xxx
  6. Socket.io 连接: auth: { token: 'vf_xxx' }
```

**需要新增的后端端点**：

```typescript
// POST /api/auth/token — 登录后颁发 API Token
// 需要有效的 NextAuth session（通过 cookie）或 email+password
// 返回 { token: 'vf_xxx', expiresAt: '...' }
// 使用已有的 authService.createToken()
```

**修改的文件**：

| 文件 | 改动 |
|------|------|
| `vibeflow-ios/src/config/auth.ts` | 改为从 SecureStore 读取 token，提供 login/register/logout 函数 |
| `vibeflow-ios/src/providers/AppProvider.tsx` | 加入 auth 状态管理，未登录时渲染 LoginScreen |
| `vibeflow-ios/src/services/websocket.service.ts` | auth payload 从 `{ email }` 改为 `{ token }` |
| `vibeflow-ios/src/screens/LoginScreen.tsx` | 新增：登录/注册 UI |

### 4.2 Desktop 客户端认证

**认证流程**（与 iOS 类似但使用 Electron）：

```
App 启动 → 检查 electron-store 中的 API Token
  ├── 有 Token → 验证 → 进入主界面 / 跳转登录
  └── 无 Token → 显示登录 BrowserWindow

LoginWindow:
  1. 加载 serverUrl + '/login' 页面（复用 Web 登录页）
  2. 监听登录成功后的 cookie/redirect
  3. 从 session 中获取 API Token
  4. 存入 electron-store，关闭 LoginWindow
```

**设计决策**：Desktop 复用 Web 登录页（在 BrowserWindow 中加载），而非重新实现一套 UI。登录成功后通过 `POST /api/auth/token` 获取长效 API Token 存本地。

**修改的文件**：

| 文件 | 改动 |
|------|------|
| `vibeflow-desktop/electron/modules/connection-manager.ts` | auth payload 改为 `{ token }` |
| `vibeflow-desktop/electron/modules/auth-manager.ts` | 新增：管理 token 存储、登录窗口、验证 |
| `vibeflow-desktop/electron/main.ts` | 启动时先检查 auth，未登录则打开 LoginWindow |

### 4.3 Browser Extension 认证适配

**无需大改**——Extension 和 Web 同域（或同源），NextAuth cookie 自动携带。

改动：
- `vibeflow-extension/src/background/service-worker.ts`：去掉 `DEFAULT_USER_EMAIL`，不再发送 email auth
- Socket.io 连接时不传 auth payload（依赖 cookie）
- 如果 cookie 过期，API 返回 401 → popup 显示"请在网页端重新登录"

### 4.4 新增 API 端点：Token 颁发

```typescript
// src/app/api/auth/token/route.ts
// POST — 为移动/桌面客户端颁发 API Token
// 接受两种认证：
//   (a) NextAuth session cookie（Web 登录后调用）
//   (b) email + password body（客户端直接登录）
// 返回：{ token: 'vf_xxx', expiresAt: string }
// 复用 authService.createToken()

// GET — 验证 token 有效性
// Header: Authorization: Bearer vf_xxx
// 返回：{ valid: true, user: { id, email } }

// DELETE — 登出（吊销 token）
// Header: Authorization: Bearer vf_xxx
// 调用 authService.revokeToken()
```

### 4.5 iOS 分发（EAS Build）

```json
// vibeflow-ios/eas.json
{
  "cli": { "version": ">= 3.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": false }
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "bundleIdentifier": "com.vibeflow.app"
      }
    },
    "preview-lite": {
      "distribution": "internal",
      "ios": {
        "bundleIdentifier": "com.vibeflow.lite"
      },
      "env": { "EXCLUDE_SCREEN_TIME": "true" }
    }
  }
}
```

- `preview`：完整版（含 Family Controls），需要手动添加 UDID 到 provisioning profile
- `preview-lite`：精简版（无 Screen Time），分发更容易
- Bundle ID 需要在 Apple Developer Portal 注册

### 4.6 Desktop 分发

现有 electron-builder 配置已支持 DMG 构建。需要补充：

1. **签名**（如果有 Apple Developer ID）：
   ```yaml
   # electron-builder.yml 追加
   afterSign: scripts/notarize.js
   mac:
     identity: "Developer ID Application: Your Name (TEAM_ID)"
   ```

2. **无签名方案**：提供文档说明如何通过「系统偏好设置 → 安全性与隐私 → 仍要打开」安装未签名 app

3. **分发**：构建产物上传到 HTTPS 可下载地址（GitHub Releases 或 Caddy 托管）

---

## 关键设计决策

### D1: Web 用 cookie，移动/桌面用 API Token

**理由**：
- Web 和 Extension 天然支持 cookie，NextAuth 自动管理
- iOS/Desktop 无法可靠使用 cookie（跨进程、WebView 隔离），API Token 更适合
- 已有 `authService` 和 `ApiToken` 模型，复用现有基础设施

### D2: Desktop 复用 Web 登录页

**理由**：
- 避免在 Electron 中重新实现登录 UI
- Web 登录页的变更自动同步到 Desktop
- BrowserWindow 可以完整运行 Next.js 页面

### D3: 迁移而非重建默认账号

**理由**：
- `dev@vibeflow.local` 的 userId 是所有关联数据的外键
- 只更新 password（和可选的 email），不改 id，所有关联零影响
- 比导出-导入方案简单得多

### D4: 关闭 DEV_MODE 而非保留双模式

**理由**：
- 保留 DEV_MODE 是安全隐患（任何人可以用任意邮箱登录）
- 开发时可以在本地 `.env` 中开启 `DEV_MODE=true`，不影响生产环境
- 生产环境只有一种认证路径，降低复杂度

### D5: Auth 页面使用 Route Group `(auth)`

**理由**：
- 登录/注册页面不需要主布局的侧边栏、ChatProvider 等
- Route Group 不影响 URL（`/login` 而非 `/(auth)/login`）
- 独立的 layout 可以有独立的样式

---

## 影响分析

### 需要修改的现有文件

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `src/lib/auth.ts` | 修改 | authorize() 加 devMode 分支，拒绝 dev_mode_no_password 密码登录 |
| `src/server/trpc.ts` | 修改 | createContext() 加 getServerSession |
| `src/services/user.service.ts` | 修改 | getCurrentUser() 加 session + Bearer token 路径 |
| `src/server/socket.ts` | 修改 | authenticateSocket() 加 NextAuth cookie 路径 |
| `src/components/providers/trpc-provider.tsx` | 修改 | 加全局 UNAUTHORIZED 处理 |
| `src/app/layout.tsx` | 不变 | SessionProvider 已存在 |
| `vibeflow-ios/src/config/auth.ts` | 重写 | 从 hardcoded email 改为 token-based |
| `vibeflow-ios/src/providers/AppProvider.tsx` | 修改 | 加 auth 状态和 LoginScreen 跳转 |
| `vibeflow-ios/src/services/websocket.service.ts` | 修改 | auth payload 改为 token |
| `vibeflow-desktop/electron/modules/connection-manager.ts` | 修改 | auth payload 改为 token |
| `vibeflow-extension/src/background/service-worker.ts` | 修改 | 去掉 email auth，依赖 cookie |
| `src/services/*.service.ts` (~62 files) | 审计/修改 | 确保 userId 过滤 |

### 需要新增的文件

| 文件 | 说明 |
|------|------|
| `src/middleware.ts` | Next.js 路由守卫 |
| `src/app/(auth)/layout.tsx` | Auth 页面布局 |
| `src/app/(auth)/login/page.tsx` | 登录页面 |
| `src/app/(auth)/register/page.tsx` | 注册页面 |
| `src/app/api/auth/token/route.ts` | API Token 颁发/验证/吊销 |
| `scripts/migrate-dev-account.ts` | 默认账号迁移脚本 |
| `vibeflow-ios/src/screens/LoginScreen.tsx` | iOS 登录页面 |
| `vibeflow-ios/eas.json` | EAS Build 配置 |
| `vibeflow-desktop/electron/modules/auth-manager.ts` | Desktop 认证管理 |
| `e2e/tests/data-isolation.spec.ts` | 跨用户隔离 E2E 测试 |
| `docs/install-ios.md` | iOS 安装文档 |
| `docs/install-desktop.md` | Desktop 安装文档 |
