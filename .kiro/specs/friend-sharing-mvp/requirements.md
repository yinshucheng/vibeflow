# Friend Sharing MVP - Requirements

## 背景

VibeFlow 目前是单用户开发模式（`X-Dev-User-Email` header，默认账号 `dev@vibeflow.local`），没有登录/注册页面，没有数据隔离保障。目标是让朋友们也能使用 VibeFlow，需要：

1. 简单的登录注册体系
2. 可靠的多用户数据隔离
3. iOS 和 Desktop 客户端的分发方案

**设计原则**：MVP 优先，先跑通核心流程，不做过度设计（如 OAuth、邮箱验证等后续再加）。

**前置条件**：公网部署已完成（frp + Caddy + HTTPS），`deploy/` 目录下的配置已就绪。

**数据迁移约束**：默认账号 `dev@vibeflow.local` 已使用 2 个月，积累了大量数据。注册登录上线后需要：
- 保留该账号及其所有数据（projects、tasks、goals、pomodoros、settings 等）
- 为该账号设置正式密码，使其可以通过登录页面正常登录
- 注册登录验证完毕后，关闭 DEV_MODE，不再提供默认账号方式

---

## Requirement 1: 登录页面

### 用户故事

作为用户，我需要一个登录页面来验证身份进入系统。

### 验收标准

- 1.1 未认证用户访问任何页面时重定向到 `/login`
- 1.2 登录页面包含 email 和 password 输入框，以及登录按钮
- 1.3 登录页面包含"没有账号？去注册"的链接，跳转到 `/register`
- 1.4 输入正确的 email 和密码后，创建 JWT session 并跳转到原始目标页面（默认 `/`）
- 1.5 输入错误的凭证时，显示"邮箱或密码错误"的通用错误提示（不透露具体哪个错误）
- 1.6 登录按钮在请求期间显示 loading 状态，防止重复提交
- 1.7 `DEV_MODE=true` 时，登录页面额外显示"开发者快速登录"区域，可以输入任意邮箱直接登录（保持现有 dev 模式行为）

---

## Requirement 2: 注册页面

### 用户故事

作为新用户（朋友），我需要注册一个账号来使用 VibeFlow。

### 验收标准

- 2.1 注册页面包含 email、密码、确认密码三个字段和注册按钮
- 2.2 密码最少 8 个字符，两次密码必须一致
- 2.3 email 格式验证（前端 + 后端）
- 2.4 注册成功后自动登录并跳转到 `/`，同时自动创建默认的 UserSettings
- 2.5 如果 email 已被注册，返回通用错误"注册失败，请检查输入"（防止邮箱枚举）
- 2.6 密码使用 bcrypt 哈希存储（已有实现，复用 `src/lib/auth.ts` 的 `hashPassword`）
- 2.7 注册页面包含"已有账号？去登录"的链接

---

## Requirement 3: 生产模式认证集成

### 用户故事

作为系统，需要在非 DEV_MODE 下正确完成认证流程。

### 验收标准

- 3.1 `userService.getCurrentUser()` 在生产模式下从 NextAuth JWT session 中获取用户信息（目前返回 AUTH_ERROR）
- 3.2 `protectedProcedure` 在 session 无效时返回 `UNAUTHORIZED`，前端收到后重定向到 `/login`
- 3.3 Socket.io 连接在生产模式下使用 session token 进行认证
- 3.4 当 `DEV_MODE != true` 时，拒绝所有 `X-Dev-User-Email` header 请求
- 3.5 Session cookie 设置 HttpOnly、Secure（HTTPS 环境下）、SameSite=Lax
- 3.6 iOS 客户端使用注册/登录获取的 session token 进行 API 和 WebSocket 认证
- 3.7 Desktop 客户端使用注册/登录获取的 session token 进行认证

---

## Requirement 4: 默认账号迁移

### 用户故事

作为现有用户（`dev@vibeflow.local`），我已经使用了 2 个月的数据不能丢失，切换到正式认证后仍然可以正常使用。

### 验收标准

- 4.1 提供一次性迁移脚本（或管理命令），为 `dev@vibeflow.local` 账号设置正式密码
- 4.2 迁移脚本支持可选地更改 email 地址（如果我想换一个正式邮箱）
- 4.3 迁移后该账号的所有数据（projects、tasks、goals、pomodoros、dailyStates、settings 等）完整保留，关联关系不变
- 4.4 迁移后该账号可以通过 `/login` 页面正常登录
- 4.5 关闭 DEV_MODE 后，系统不再自动创建 dev 用户，所有用户必须通过注册或迁移后的账号登录
- 4.6 迁移脚本幂等——重复运行不会创建重复数据或破坏已有数据

---

## Requirement 5: 多用户数据隔离

### 用户故事

作为用户，我的数据不能被其他用户看到或修改。

### 验收标准

- 5.1 所有 Prisma 查询（~62 个 service 文件）必须包含 `userId` 过滤条件
- 5.2 用户 A 访问用户 B 的资源时，返回 `NOT_FOUND`（不返回 `FORBIDDEN`，避免信息泄露）
- 5.3 Socket.io 广播仅发送给当前用户的 room（已有实现，需审计确认）
- 5.4 tRPC context 中的 userId 只能来自 authenticated session，不能被客户端覆盖
- 5.5 至少 5 个跨用户隔离 E2E 测试：tasks、projects、goals、pomodoros、settings
- 5.6 每个 service 文件在审计后标注 "audited" 或 "N/A"（在 tasks.md 中记录）

---

## Requirement 6: iOS 客户端分发

### 用户故事

作为用户（朋友），我需要在 iPhone 上安装 VibeFlow。

### 验收标准

- 6.1 使用 Apple Developer Program 注册正式 Bundle ID（替换 `com.anonymous.vibeflow-ios`）
- 6.2 配置 EAS Build（`eas.json`）支持 `development` 和 `preview`（AdHoc）两种 profile
- 6.3 `preview` profile 构建 AdHoc IPA，可以通过链接分发给注册了 UDID 的朋友
- 6.4 **Family Controls entitlement 处理**：由于 Screen Time API 需要 Apple 特殊审批，提供两种安装方式：
  - (a) 包含 Screen Time 功能的完整版：需要朋友的设备 UDID 加入 provisioning profile
  - (b) 不含 Screen Time 的精简版：更容易分发（如果完整版审批受阻）
- 6.5 提供清晰的安装文档：如何获取 UDID、如何安装 IPA
- 6.6 iOS 客户端内置登录页面，首次打开时要求登录（而非直接连接 dev 模式）
- 6.7 iOS 客户端的服务器地址可配置（通过环境变量 `EXPO_PUBLIC_SERVER_URL` 在构建时注入）

---

## Requirement 7: Desktop 客户端分发

### 用户故事

作为用户（朋友），我需要在 Mac 上安装 VibeFlow Desktop。

### 验收标准

- 7.1 使用 Apple Developer ID 证书签名 DMG（避免 macOS Gatekeeper 阻止）
- 7.2 配置 notarization（`@electron/notarize`），让 macOS 不弹"无法验证开发者"警告
- 7.3 构建 universal DMG（已有 x64 + arm64 配置）
- 7.4 **如果没有 Apple Developer Program**：提供手动绕过方案的文档（右键打开 → 系统偏好设置允许）
- 7.5 DMG 分发方式：通过 HTTPS 链接下载（可以用 Caddy 托管静态文件，或第三方如 GitHub Releases）
- 7.6 Desktop 客户端内置登录窗口，首次打开时要求登录
- 7.7 Desktop 客户端的服务器地址可配置（通过 `VIBEFLOW_SERVER_URL` 环境变量或设置页面）

---

## Requirement 8: Browser Extension 认证适配

### 用户故事

作为使用浏览器扩展的用户，扩展需要正确识别我的登录状态。

### 验收标准

- 8.1 Browser Extension 在同一浏览器中复用 Web 端的 session cookie（SameSite 策略允许）
- 8.2 如果 session 过期，Extension popup 显示"请在网页端重新登录"的提示
- 8.3 Extension 的 WebSocket 连接携带 session cookie 进行认证

---

## 实现优先级（建议顺序）

| 阶段 | 内容 | 说明 |
|------|------|------|
| **P0** | Req 1 + 2 + 3 | 登录注册 + 认证集成，能跑通基本流程 |
| **P0.5** | Req 4 | 默认账号迁移，保留 2 个月的数据 |
| **P1** | Req 5 | 数据隔离审计，保证多用户安全 |
| **P2** | Req 6 + 7 + 8 | 客户端分发和认证适配 |

---

## 不在 MVP 范围内（后续再做）

- OAuth（Google 登录）
- 邮箱验证
- 密码重置
- CSRF token 显式防护（NextAuth JWT 模式不依赖 CSRF token）
- 用户管理后台（邀请、禁用等）
- 自动更新（Desktop auto-update）
- App Store / TestFlight 发布
- CI/CD 构建流水线
