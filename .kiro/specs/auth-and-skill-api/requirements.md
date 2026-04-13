# Auth Activation & Skill API — Requirements

## Overview

VibeFlow 已有完整的认证基础设施（NextAuth、`vf_` API Token、bcrypt、iOS SecureStore），但从未真正启用——所有客户端都通过 `DEV_MODE=true` + 硬编码 `dev@vibeflow.local` 绕过登录。本 spec 的目标：

1. **激活现有认证链**：让 Web/iOS/Desktop/Extension 真正走登录流程
2. **API Key 管理**：让用户创建和管理 API Key，供外部 Agent 使用
3. **MCP 认证统一**：废弃 `vibeflow_<userId>_<secret>` 格式，统一用 `vf_` token
4. **Skill 接入层**：将 MCP 能力以 Skill 方式暴露，可上架 SkillHub

**前提**：当前只有一个用户（我），需要安全地迁移数据，保留 dev 默认账号作为兜底。

### 与已有 spec 的关系

- **`production-auth`**（not-started）：本 spec 只取其中"启用认证 + 路由守卫"部分，OAuth/密码重置/邮箱验证暂不做
- **`dev-user-system`**（not-started）：本 spec 只取其中"数据隔离审查"部分，多用户切换器等开发工具暂不做
- 后续 `production-auth` 和 `dev-user-system` 可在本 spec 完成后独立推进

## Glossary

- **API_Key**: 格式为 `vf_<64hex>` 的 Bearer Token，SHA-256 哈希存储，用于非交互式认证
- **Skill**: Claude Code 等 AI 工具的扩展指令文件（SKILL.md），教 Agent 如何通过 HTTP API 操作 VibeFlow
- **MCP**: Model Context Protocol，当前的 AI 接入方式（stdio 传输），将与 Skill 并存
- **Dev_Fallback**: 默认 `dev@vibeflow.local` 账号，作为迁移期兜底

## Requirements

### R1: 默认用户数据迁移

**背景**：当前所有数据都在 `dev@vibeflow.local` 用户下。需要将数据复制一份到新注册账号，保留原默认账号数据不变作为兜底。

- R1.1: 提供数据迁移脚本 `scripts/migrate-user-data.ts`，将指定源用户的所有数据复制到目标用户
- R1.2: 迁移范围覆盖所有用户关联数据（Prisma schema 中约 40 个含 userId 的模型），分三层：核心业务数据（必须迁移）、辅助数据（建议迁移）、日志/瞬态数据（可跳过）。详见 design.md
- R1.3: 迁移脚本使用事务，要么全部成功要么全部回滚
- R1.4: 迁移后源用户数据保持不变（复制而非移动），确保迁移失败可回退到默认账号
- R1.5: 迁移脚本支持 dry-run 模式（`--dry-run`），输出将迁移的数据量但不执行
- R1.6: 需要用户先注册新账号（通过 `/register` 端点或登录页面），再运行迁移脚本

### R2: 服务端认证激活

**背景**：服务端有完整的认证代码，但 `.env` 的 `DEV_MODE=true` 让所有检查短路。

- R2.1: 生产环境 `.env` 设置 `DEV_MODE=false`，本地开发 `.env` 保留 `DEV_MODE=true`
- R2.2: `DEV_MODE=false` 时，`userService.getCurrentUser()` 不接受 `x-dev-user-email` header
- R2.3: `DEV_MODE=false` 时，`middleware.ts` 对未认证请求重定向到 `/login`（白名单：`/login`、`/register`、`/api/auth/*`、静态资源）
- R2.4: `DEV_MODE=false` 时，Socket.io 认证拒绝纯 email 登录，要求 Bearer token 或 NextAuth session
- R2.5: 废弃 Legacy token 格式 `vibeflow_<userId>`（socket.ts 中），删除相关代码
- R2.6: `DEV_MODE=false` 时，token 端点 `POST /api/auth/token` 不允许无密码登录和自动创建用户
- R2.7: `dev_mode_no_password` 密码的用户在 `DEV_MODE=false` 时无法通过凭证登录（已实现，需验证）

### R3: Web 客户端认证启用

- R3.1: `/login` 页面：生产模式隐藏 "Dev Quick Login" 区域，只显示标准 email/password 表单
- R3.2: `/register` 页面：允许新用户注册（已有端点 `POST /api/auth/register`）
- R3.3: `trpc-provider.tsx`：生产模式不注入 `x-dev-user-email` header
- R3.4: `socket-client.ts`：生产模式使用 NextAuth session cookie 认证，不使用 localStorage email fallback
- R3.5: 未认证时所有 tRPC 调用返回 `UNAUTHORIZED`，前端检测到后重定向到 `/login?returnUrl=<current>`
- R3.6: 登录成功后重定向回 `returnUrl`（如果存在）

### R4: iOS 客户端认证启用

- R4.1: `AppProvider.tsx`：删除硬编码 `dev@vibeflow.local` 绕过，改为调用 `auth.ts` 的 token 验证流程
- R4.2: 启动时检查 SecureStore 中的 token，有效则进入主界面，无效/缺失则显示 LoginScreen
- R4.3: LoginScreen 支持登录和注册（已实现，需验证可用性）
- R4.4: 登录成功后 token 存入 SecureStore，后续请求通过 `Authorization: Bearer vf_xxx` 认证
- R4.5: 401 响应时清除 token 并回退到 LoginScreen
- R4.6: 保留 `DEV_MODE` 环境变量支持——`DEV_MODE=true` 时 iOS 仍可使用 dev email 快捷登录（本地调试用）

### R5: Desktop 客户端认证启用

- R5.1: `main.ts`：无论 `isDevelopment` 与否，无有效 token 时都弹出登录窗口
- R5.2: `connection-manager.ts`：删除 `dev@vibeflow.local` fallback，无 token 时拒绝 socket 连接
- R5.3: 登录窗口打开 Web `/login` 页面，登录成功后获取 API token 存储到 Electron store
- R5.4: 保留环境变量 `VIBEFLOW_DEV_BYPASS=true` 用于本地开发时跳过登录（替代原来的 `isDevelopment` 判断）

### R6: Browser Extension 认证

- R6.1: Extension 依赖 Web 的 NextAuth session cookie，Web 认证启用后自动生效
- R6.2: 未认证时（无 session cookie），Extension popup 显示"请先登录 Web 端"提示
- R6.3: 认证失败时 Extension 进入降级模式（不屏蔽网站，只显示提示）

### R7: API Key 管理

**背景**：已有 `ApiToken` 模型和 CRUD 端点，需要加 UI 和少量模型扩展。

- R7.1: `ApiToken` 模型增加 `scopes` 字段（`String[]`，默认 `["read", "write"]`）和 `description` 字段（`String?`）
- R7.2: Settings 页面新增 "API Keys" 管理面板
- R7.3: 创建 Key：用户输入名称 + 可选描述 + 选择 scope → 系统生成 `vf_xxx` token → 只显示一次
- R7.4: 创建后弹出安全警告，明确告知：Key 只显示一次、丢失不会导致数据丢失（吊销重建即可）、泄露应立即吊销
- R7.5: 列表展示：名称、scope、创建时间、最后使用时间、操作（吊销）
- R7.6: 吊销 Key：确认对话框 → 软删除（设 `revokedAt`）
- R7.7: Scope 控制：`read` = 只读操作（查询任务/项目/状态），`write` = 读写操作（创建/修改/启动番茄钟），`admin` = 管理操作（吊销 token、修改设置）
- R7.8: 服务端验证 scope：所有 tRPC router 和 REST Skill 端点必须声明所需 scope（query=read, mutation=write, 管理=admin），API Token 请求 scope 不匹配时返回 403
- R7.9: 每个用户最多 10 个活跃 Key（防滥用）
- R7.10: 登录/注册端点 IP-based rate limiting（登录 5 次/分钟，注册 3 次/分钟），超限返回 429

### R8: MCP 认证统一

- R8.1: `mcp/auth.ts`：生产模式使用 `vf_` token 认证（通过已有的 `authService.validateToken()`）
- R8.2: 废弃 `vibeflow_<userId>_<secret>` token 格式
- R8.3: `mcp/trpc-client.ts`：从环境变量 `VIBEFLOW_API_KEY` 读取 `vf_xxx` token，不再硬编码 server IP 和 email
- R8.4: MCP 开发模式（`DEV_MODE=true`）保留 `dev_<email>` token 支持
- R8.5: 更新 `.claude/.mcp.json` 配置，添加 `VIBEFLOW_API_KEY` 环境变量

### R9: Skill 接入层

**背景**：将 MCP 的 28 个 tool 和 14 个 resource 以 Skill 方式暴露，让 Claude Code 等 AI 工具可以通过 HTTP API 访问 VibeFlow。由于 tRPC 使用 SuperJSON transformer（Date 等类型有特殊序列化），直接 curl 调 tRPC 极易出错，因此需要一层轻量 REST adapter（`/api/skill/*`）接收和返回标准 JSON。

- R9.1: 创建 Skill REST API（`src/app/api/skill/`），直接调用 service 层，接收和返回标准 JSON（无 SuperJSON）
- R9.2: Hub skill（`vibeflow/SKILL.md`）：项目概览 + 路由到子 skill + API 认证说明
- R9.3: Setup skill（`vibeflow-setup/SKILL.md`）：引导用户配置 server URL 和 API Key
- R9.4: 按领域拆分功能 skill：`vibeflow-focus`（番茄钟）、`vibeflow-tasks`（任务）、`vibeflow-projects`（项目）、`vibeflow-analytics`（分析数据）
- R9.5: 每个 skill 的 SKILL.md 包含：YAML frontmatter（name、description、version、argument-hint）+ 认证说明 + API 调用指令 + 响应解析 + 错误处理
- R9.6: Skill 通过环境变量 `VIBEFLOW_API_KEY` 和 `VIBEFLOW_SERVER_URL` 配置，不硬编码
- R9.7: Skill 指令明确 "NEVER echo or display the API key in output"
- R9.8: `reference/api-reference.md`：完整的 tRPC 端点文档，供 skill 引用
- R9.9: `reference/authentication.md`：认证机制说明，包含 scope 权限表

### R10: SkillHub 上架准备

- R10.1: `vibeflow-skills/` 包含 `skills-lock.json`、`README.md`、`LICENSE`
- R10.2: 每个 SKILL.md 的 frontmatter 符合 agentskills.io 规范：`name`（kebab-case、≤64字符）、`description`（≤1024字符、含触发短语）、`version`（semver）
- R10.3: 所有 skill 设置 `user-invocable: true`
- R10.4: README 包含：一键安装命令、前置条件（需要 VibeFlow 账号 + API Key）、安全须知
- R10.5: 支持多 harness 分发：skill 文件可被 Claude Code、Cursor、Gemini CLI 等工具读取

## Acceptance Criteria

1. 生产环境 `DEV_MODE=false` 后，Web 端未登录用户被重定向到 `/login`
2. 用户可以通过 `/login` 登录、`/register` 注册
3. iOS 启动时验证 token，无效则显示登录页，登录后正常使用
4. Desktop 无 token 时弹出登录窗口，登录后正常连接
5. 迁移脚本将默认用户数据复制到新注册用户，原数据不变
6. Settings 页面可以创建/查看/吊销 API Key
7. MCP 使用 `vf_` token 认证，与主系统统一
8. `npx skills add` 或手动复制后，Claude Code 可通过 Skill + API Key 操作 VibeFlow
9. 迁移失败时，切回 `DEV_MODE=true` + 默认账号可正常使用（兜底）
