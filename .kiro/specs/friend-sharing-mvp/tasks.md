# Friend Sharing MVP - Tasks

> 测试标记：`[unit]` 单元测试 · `[intg]` 集成测试 · `[e2e]` Playwright E2E · `[manual]` 需人工验收
>
> Phase 1–4 为自动化可完成的任务，Phase 5 集中所有人工验收项。

## Phase 1: 登录注册 + 认证集成 (Req 1, 2, 3)

### 1.1 后端认证改造

- [x] **1.1.1** 修改 `src/lib/auth.ts` — `authorize()` 加 DEV_MODE 快速登录分支：当 `DEV_MODE=true && credentials.devMode=true` 时调用 `getOrCreateDevUser()`，跳过密码验证；正常登录时拒绝密码为 `dev_mode_no_password` 的用户 `[unit]` <!-- 20a6738 -->
- [x] **1.1.2** 修改 `src/services/user.service.ts` — `getCurrentUser()` 新增生产模式路径：优先从传入的 `session` 参数获取用户信息，其次从 `Authorization: Bearer vf_xxx` header 解析 API Token（调用 `authService.validateToken()`） `[unit]` <!-- 20a6738 -->
- [x] **1.1.3** 修改 `src/server/trpc.ts` — `createContext()` 中调用 `getToken()` 从 NextAuth JWT cookie 获取 session，传入 `userService.getCurrentUser({ headers, session })` `[intg]` <!-- 20a6738 -->
- [x] **1.1.4** 修改 `src/server/socket.ts` — `authenticateSocket()` 新增 NextAuth cookie 认证分支：生产模式下从 `socket.request` 解析 session cookie，保留已有的 API Token 认证路径 `[intg]` <!-- 20a6738 -->
- [x] **1.1.5** 新增 `src/app/api/auth/token/route.ts` — API Token 端点：POST（颁发，接受 session cookie 或 email+password）、GET（验证 Bearer token）、DELETE（吊销 token），复用 `authService` `[intg]` <!-- 20a6738 -->

### 1.2 Checkpoint: 后端认证

- [x] **1.2.1** 验证：DEV_MODE=true 时，`X-Dev-User-Email` header 认证正常工作（现有行为不变） `[intg]` <!-- b881895 -->
- [x] **1.2.2** 验证：DEV_MODE=false 时，通过 NextAuth session（cookie）可以获取 UserContext `[intg]` <!-- b881895 -->
- [x] **1.2.3** 验证：DEV_MODE=false 时，通过 `Authorization: Bearer vf_xxx` 可以获取 UserContext `[intg]` <!-- b881895 -->
- [x] **1.2.4** 验证：DEV_MODE=false 时，`X-Dev-User-Email` header 被拒绝 `[intg]` <!-- b881895 -->
- [x] **1.2.5** 验证：`POST /api/auth/token` 可以颁发 token，`GET /api/auth/token` 可以验证 token `[intg]` <!-- b881895 -->

### 1.3 前端页面

- [x] **1.3.1** 新增 `src/app/(auth)/layout.tsx` — Auth 布局：独立的 html/body，居中布局，不包含侧边栏和主应用 Provider `[e2e]` <!-- 0c2a176 -->
- [x] **1.3.2** 新增 `src/app/(auth)/login/page.tsx` — 登录页面：email + password 表单，调用 `signIn('credentials', { redirect: false })`，成功后 `router.push(callbackUrl || '/')`，失败显示通用错误，loading 状态防重复提交 `[e2e]` <!-- 0c2a176 -->
- [x] **1.3.3** 登录页面 DEV_MODE 区域：当 `NEXT_PUBLIC_DEV_MODE=true` 时，渲染"开发者快速登录"区域，输入任意 email 直接调用 `signIn('credentials', { email, devMode: true })` `[e2e]` <!-- 0c2a176 -->
- [x] **1.3.4** 新增 `src/app/(auth)/register/page.tsx` — 注册页面：email + password + confirmPassword 表单，前端 Zod 验证（email 格式、密码 >= 8 字符、两次一致），POST `/api/auth/register`，成功后自动 `signIn` 登录 `[e2e]` <!-- 0c2a176 -->
- [x] **1.3.5** 登录/注册页面互相链接："没有账号？去注册" 和 "已有账号？去登录" `[e2e]` <!-- 0c2a176 -->

### 1.4 路由守卫 + 全局错误处理

- [x] **1.4.1** 新增 `src/middleware.ts` — Next.js middleware：公开路径（`/login`, `/register`, `/api/auth`, `/api/health`）放行；DEV_MODE=true 全部放行；其余路径检查 NextAuth JWT token，无效时重定向到 `/login?callbackUrl=xxx` `[e2e]` <!-- 0c2a176 -->
- [x] **1.4.2** 修改 `src/components/providers/trpc-provider.tsx` — 全局 UNAUTHORIZED 处理：QueryClient 的 query retry 跳过 UNAUTHORIZED，mutation onError 收到 UNAUTHORIZED 时 `window.location.href = '/login'` `[e2e]` <!-- 0c2a176 -->
- [x] **1.4.3** 添加 `NEXT_PUBLIC_DEV_MODE` 环境变量到 `.env.example`，在 `next.config.js` 中暴露给客户端（如未配置） `[unit]` <!-- 0c2a176 -->

### 1.5 Checkpoint: Web 端 E2E

- [x] **1.5.1** 验证：未登录访问 `/` 重定向到 `/login` `[e2e]` <!-- a591c72 -->
- [x] **1.5.2** 验证：注册新用户 → 自动登录 → 跳转到首页 `[e2e]` <!-- a591c72 -->
- [x] **1.5.3** 验证：登录已有用户 → 跳转到首页，tRPC 请求正常 `[e2e]` <!-- a591c72 -->
- [x] **1.5.4** 验证：错误密码登录 → 显示通用错误 `[e2e]` <!-- a591c72 -->
- [x] **1.5.5** 验证：Socket.io 连接在登录后正常建立（cookie 认证） `[e2e]` <!-- a591c72 -->
- [x] **1.5.6** 验证：DEV_MODE=true 时，快速登录功能正常 `[e2e]` <!-- a591c72 -->

---

## Phase 2: 默认账号迁移脚本 (Req 4)

### 2.1 迁移脚本

- [x] **2.1.1** 新增 `scripts/migrate-dev-account.ts` — 迁移脚本：接受 `--password` 必填参数和 `--email` 可选参数，查找 `dev@vibeflow.local` 账号，更新 password（bcrypt hash）和可选的 email，输出数据完整性统计（projects/tasks/goals/pomodoros/dailyStates 计数） `[intg]` <!-- 6216190 -->
- [x] **2.1.2** 迁移脚本幂等性测试：重复运行只覆盖密码，不创建重复数据；账号不存在时安全退出 `[intg]` <!-- 6216190 -->

---

## Phase 3: 数据隔离审计 (Req 5)

### 3.1 Service 审计

- [x] **3.1.1** 审计所有 `src/services/*.service.ts` 中的 Prisma 操作，确保每个 findMany/findFirst/findUnique/update/delete/count/aggregate 包含 `userId` 过滤条件（直接或通过关联链路），在下方记录审计结果 `[unit]`
- [x] **3.1.2** 修复审计中发现的缺失 `userId` 过滤的查询 `[unit]`
- [x] **3.1.3** 审计 Socket.io 广播——确认 `socketBroadcastService` 只向当前用户的 room 发送消息 `[unit]`
- [x] **3.1.4** 审计 tRPC context——确认 `ctx.user.userId` 只来自 authenticated session，不能被客户端请求参数覆盖 `[unit]`

### 3.2 跨用户隔离测试

- [ ] **3.2.1** 新增 `e2e/tests/data-isolation.spec.ts`——注册两个用户，测试：用户 A 创建 task 后用户 B 列表为空且直接访问返回 404 `[e2e]`
- [ ] **3.2.2** 补充测试：projects 隔离（用户 A 的 project 用户 B 不可见） `[e2e]`
- [ ] **3.2.3** 补充测试：goals 隔离 `[e2e]`
- [ ] **3.2.4** 补充测试：pomodoros 隔离 `[e2e]`
- [ ] **3.2.5** 补充测试：settings 隔离（用户 A 修改 settings 不影响用户 B） `[e2e]`

### 3.3 审计结果记录

<!-- 审计完成，结果如下 -->
```text
审计结果（61 service files）：

✅ PASS（用户面方法均含 userId 过滤）：
  activity-aggregation.service.ts, activity-log.service.ts, auth.service.ts,
  blocker-resolver.service.ts, policy-distribution.service.ts, review.service.ts,
  settings-modification-log.service.ts, skip-token.service.ts, sleep-time.service.ts,
  efficiency-analysis.service.ts, progress-calculation.service.ts, over-rest.service.ts,
  task-decomposer.service.ts, progress-analyzer.service.ts, demo-mode.service.ts,
  bypass-detection.service.ts, goal.service.ts, stats.service.ts, rest-enforcement.service.ts,
  health-limit.service.ts, ai-trigger.service.ts, grace-period.service.ts,
  timeline.service.ts, user.service.ts, work-start.service.ts, chat-user-config.service.ts,
  nl-parser.service.ts, screen-time-exemption.service.ts, context-provider.service.ts,
  chat-context.service.ts, chat-observability.service.ts, chat-triggers-cron.service.ts,
  early-warning.service.ts, data-access-audit.service.ts, focus-session.service.ts,
  mcp-audit.service.ts, entertainment.service.ts

N/A（无 Prisma 调用或纯客户端服务）：
  settings-lock.service.ts, idle.service.ts, notification.service.ts,
  tray-integration.service.ts, chat-intent.service.ts, llm-adapter.service.ts,
  daily-reset-scheduler.service.ts, socket-broadcast.service.ts

❌ 已修复（defense-in-depth 补充 userId 过滤）：
  task.service.ts — aggregate/updateMany/findMany 补充 userId (4 处)
  pomodoro.service.ts — completeTaskInPomodoro 的 task.update 补充 userId
  daily-state.service.ts — completeAirlock 的 task.updateMany 补充 userId
  project.service.ts — update 中 goalIds 添加所有权验证
  chat.service.ts — persistMessage 添加 userId 参数和会话所有权验证
  mcp-event.service.ts — unsubscribe 添加 userId 所有权验证，getSubscriptions 添加 userId 过滤
  client-registry.service.ts — updateMetadata/markDisconnected/getClientById/updateLastSeen 添加 userId 验证
  command-queue.service.ts — markDelivered/markAcknowledged/getCommandById/requeueCommand 添加 userId 验证
  time-slice.service.ts — 所有方法添加 userId 参数和 pomodoro 所有权验证
  chat-tools.service.ts — executeSetTop3 和 executeGetProject 补充 userId
  chat-triggers-state.service.ts — handleTaskStuck 的 task 查询补充 userId
  chat-summary.service.ts — getOrCreateSummary 添加 userId 参数和会话所有权验证
  smart-suggestion.service.ts — calculateGoalAlignment 添加 userId 过滤

  time-slice router (src/server/routers/time-slice.ts) — 所有端点传递 ctx.user.userId
  clients router (src/server/routers/clients.ts) — getClient 端点传递 ctx.user.userId

系统级方法（intentional cross-user ops, cron/scheduler only）：
  auth.service.ts — cleanupExpiredTokens
  entertainment.service.ts — resetDailyQuotas, checkAndEndExpiredSessions
  focus-session.service.ts — checkExpiredSessions
  pomodoro-scheduler.service.ts — checkExpiredPomodoros
  heartbeat.service.ts — detectOfflineClients
  client-registry.service.ts — markStaleClientsOffline
  command-queue.service.ts — cleanupExpired, deleteOldAcknowledged, deleteOldExpired
  chat-archive.service.ts — runDailyArchive, cleanupOldMessages
  demo-mode.service.ts — processExpiredDemoModes
  data-access-audit.service.ts — cleanupOldLogs
  mcp-audit.service.ts — cleanupOldLogs

Socket.io 广播审计: ✅ PASS
  - 所有 broadcast 方法使用 `io.to(user:${userId})` 定向发送
  - 无全局 broadcast (io.emit)
  - socket 连接时自动 join user room
  - octopus event 验证 event.userId === socket.data.userId

tRPC Context 审计: ✅ PASS
  - ctx.user 仅来自 NextAuth JWT / dev mode header / API token
  - 无 router 从 input 接收 userId
  - protectedProcedure 强制校验 ctx.user 存在
```

---

## Phase 4: 客户端代码适配 (Req 6, 7, 8)

### 4.1 iOS 客户端认证

- [ ] **4.1.1** 重写 `vibeflow-ios/src/config/auth.ts` — 从 hardcoded email 改为 token-based：提供 `login(email, password)`（POST `/api/auth/token`）、`register(email, password)`（POST `/api/auth/register` → `/api/auth/token`）、`logout()`（DELETE `/api/auth/token` + 清除 SecureStore）、`getToken()`（从 SecureStore 读取）、`getAuthHeaders()`（返回 `Authorization: Bearer vf_xxx`） `[unit]`
- [ ] **4.1.2** 新增 `vibeflow-ios/src/screens/LoginScreen.tsx` — 登录/注册 UI：email + password 表单，登录/注册切换，调用 auth.ts 的 login/register 函数，成功后导航到主界面 `[unit]`
- [ ] **4.1.3** 修改 `vibeflow-ios/src/providers/AppProvider.tsx` — 加入 auth 状态管理：启动时检查 SecureStore 中的 token 有效性（GET `/api/auth/token`），无效则渲染 LoginScreen 而非主界面 `[unit]`
- [ ] **4.1.4** 修改 `vibeflow-ios/src/services/websocket.service.ts` — Socket.io auth payload 从 `{ email }` 改为 `{ token: 'vf_xxx' }` `[unit]`

### 4.2 iOS 分发配置（代码部分）

- [ ] **4.2.1** 新增 `vibeflow-ios/eas.json` — 配置 `development`、`preview`（完整版含 Family Controls）、`preview-lite`（精简版无 Screen Time）三个 build profile `[unit]`

### 4.3 Desktop 客户端认证

- [ ] **4.3.1** 新增 `vibeflow-desktop/electron/modules/auth-manager.ts` — 管理 auth 状态：token 存储（electron-store）、验证（GET `/api/auth/token`）、登录窗口管理（BrowserWindow 加载 Web `/login`）、监听登录成功后获取 token（通过 `POST /api/auth/token` 使用 cookie） `[unit]`
- [ ] **4.3.2** 修改 `vibeflow-desktop/electron/main.ts` — 启动时调用 auth-manager 检查认证状态，未登录则打开 LoginWindow，登录后再初始化主流程 `[unit]`
- [ ] **4.3.3** 修改 `vibeflow-desktop/electron/modules/connection-manager.ts` — Socket.io auth payload 从 `{ email: 'dev@vibeflow.local' }` 改为 `{ token: 'vf_xxx' }`（从 auth-manager 获取） `[unit]`

### 4.4 Browser Extension 适配

- [ ] **4.4.1** 修改 `vibeflow-extension/src/background/service-worker.ts` — 去掉 `DEFAULT_USER_EMAIL` 和 email-based auth，Socket.io 连接不传 auth payload（依赖浏览器 cookie） `[unit]`
- [ ] **4.4.2** 修改 Extension popup — session 过期时（API 返回 401）显示"请在网页端重新登录"提示 `[unit]`

### 4.5 安装文档

- [ ] **4.5.1** 新增 `docs/install-ios.md` — 安装文档：如何获取 UDID、如何添加设备到 provisioning profile、如何安装 IPA `[unit]`
- [ ] **4.5.2** 新增 `docs/install-desktop.md` — 安装文档：DMG 下载地址、手动绕过 Gatekeeper 的步骤（如无签名）、服务器地址配置 `[unit]`

---

## Phase 5: 人工验收 🔧 `[manual]`

> 以下所有任务需要人工操作或真机验证。Pipeline 自动化部分（Phase 1–4）完成后，按顺序逐项验收。

### 5.1 默认账号迁移验收

- [ ] **5.1.1** 在生产数据库运行迁移脚本：`npx tsx scripts/migrate-dev-account.ts --password <新密码> [--email <新邮箱>]`
- [ ] **5.1.2** 迁移后通过 `/login` 页面登录，确认所有历史数据（projects、tasks、goals、pomodoros、dailyStates、settings）完整可见
- [ ] **5.1.3** 更新生产环境 `.env`：`DEV_MODE=false`，移除 `DEV_USER_EMAIL`，重启服务
- [ ] **5.1.4** 确认关闭 DEV_MODE 后，系统不再接受 `X-Dev-User-Email` header，只能通过正式登录使用

### 5.2 iOS 验收

- [ ] **5.2.1** 在 Apple Developer Portal 注册正式 Bundle ID（替换 `com.anonymous.vibeflow-ios`），更新 `app.json`
- [ ] **5.2.2** 运行 `eas build --profile preview --platform ios` 构建 AdHoc IPA
- [ ] **5.2.3** 真机验证：首次打开显示登录页面
- [ ] **5.2.4** 真机验证：注册新账号 → 自动登录 → 进入主界面
- [ ] **5.2.5** 真机验证：登录已有账号 → 数据正常显示
- [ ] **5.2.6** 真机验证：WebSocket 连接正常（token 认证）
- [ ] **5.2.7** 真机验证：退出登录后回到登录页面

### 5.3 Desktop 验收

- [ ] **5.3.1** 配置签名（如有 Apple Developer ID 证书）或确认无签名方案文档已就绪
- [ ] **5.3.2** 运行 `npm run build:dmg` 构建 universal DMG
- [ ] **5.3.3** 在全新 Mac 上验证安装和运行
- [ ] **5.3.4** 验证：首次启动弹出登录窗口
- [ ] **5.3.5** 验证：登录后正常连接服务器
- [ ] **5.3.6** 验证：重启后 token 仍有效，无需重新登录
- [ ] **5.3.7** 上传 DMG 到可下载地址（GitHub Releases 或 Caddy 静态目录）

### 5.4 Browser Extension 验收

- [ ] **5.4.1** 验证：Web 端登录后 Extension 自动识别用户身份，WebSocket 正常连接

### 5.5 分发给朋友

- [ ] **5.5.1** 收集朋友的设备 UDID，添加到 provisioning profile
- [ ] **5.5.2** 重新构建 IPA 并分发安装链接
- [ ] **5.5.3** 分发 Desktop DMG 下载链接
- [ ] **5.5.4** 朋友注册账号并验证基本功能正常
