# Auth Activation & Skill API — Tasks

## Overview

激活认证链、统一 API Key、迁移用户数据、添加 Skill REST API + Skill 接入层。分 5 个 Phase，每个 Phase 可独立验证。

## Tasks

### Phase 1: 数据迁移准备 + 服务端改造

- [x] 1. 数据迁移脚本
  - [x] 1.1 编写 `scripts/migrate-user-data.ts`
    - 支持 `--source`、`--target`、`--dry-run`、`--skip-auxiliary` 参数
    - 使用 Prisma interactive transaction，`timeout: 120000`
    - 维护 `Map<oldId, newId>` ID 映射表
    - **迁移顺序（依赖优先）**：UserSettings → Goal → Project → ProjectGoal → Task（自引用：先全量插入 parentId=null，再批量更新 parentId）→ Pomodoro → TaskTimeSlice → Habit → HabitGoal → HabitEntry → DailyState → FocusSession → Blocker → DailyReview → PolicyVersion → Conversation → ChatMessage → 第二层辅助数据
    - 第三层日志/瞬态数据默认跳过（ActivityLog、TimelineEvent、StateTransitionLog 等，见 design.md）
    - 输出迁移报告（每个模型的记录数）
    - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.5_
  - [x] 1.2 测试迁移脚本
    - dry-run 模式验证输出
    - 实际迁移后验证：记录数、FK 完整性（新 userId 下子模型 userId 一致）、唯一约束（DailyState @@unique([userId, date])）
    - 验证 Task 层级关系（parentId 映射正确）
    - 验证 Pomodoro → Task、TaskTimeSlice → Pomodoro+Task 的 FK 映射
    - 验证源用户数据未被修改
    - _Requirements: R1.4, R1.5_ <!-- 1 done -->

- [x] 2. ApiToken 模型扩展
  - [x] 2.1 Prisma schema 添加 `scopes` 和 `description` 字段
    - `scopes String[] @default(["read", "write"])`
    - `description String?`
    - 运行 `db:generate` + `db:push`
    - _Requirements: R7.1_
  - [x] 2.2 更新 `authService` 支持 scope
    - `createToken` 接受 scopes 参数
    - `validateToken` 返回值包含 scopes
    - `listTokens` 返回 scope 和 description
    - `countActiveTokens` 方法（用于限额检查）
    - _Requirements: R7.7, R7.9_ <!-- 2 done -->

- [x] 3. 服务端认证改造
  - [x] 3.1 `userService.getCurrentUser` 改造
    - DEV_MODE=false 时跳过 dev header 路径
    - Bearer token 路径返回 tokenScopes
    - DEV_MODE=false 时无 fallback（返回 null）
    - `UserContext` 接口添加 `tokenScopes?: string[]`
    - _Requirements: R2.2_
  - [x] 3.2 `middleware.ts` 路由保护
    - DEV_MODE=false 时对未认证请求重定向 `/login`
    - 白名单：`/login`、`/register`、`/api/auth/*`、`/api/skill/*`、`/_next/*`、`/favicon.ico`
    - _Requirements: R2.3_
  - [x] 3.3 Socket.io 认证加固
    - DEV_MODE=false 时拒绝纯 email 登录
    - 删除 legacy `vibeflow_<userId>` token 支持（DEV_MODE 无关，这个格式无密码验证，直接删）
    - 支持 Bearer `vf_` token、NextAuth session cookie、DEV_MODE email 三种认证
    - **验证 Extension cookie 路径不受影响**：Extension 发送空 auth payload 依赖 handshake headers 中的 cookie，加固逻辑不能要求 auth payload 必须有 token
    - _Requirements: R2.4, R2.5_
  - [x] 3.4 Token 端点加固
    - DEV_MODE=false 时 `POST /api/auth/token` 不允许无密码登录
    - DEV_MODE=false 时不自动创建用户
    - _Requirements: R2.6_ <!-- 3 done -->

- [ ] 4. Checkpoint — 服务端测试
  - [x] 运行 `npm test` 确保现有测试通过
  - 手动测试：DEV_MODE=true 时行为不变
  - 手动测试：DEV_MODE=false 时 API 返回 401
  - _Requirements: R2.7_

### Phase 2: Web + Extension 客户端

- [x] 5. Web 客户端认证启用
  - [x] 5.1 `/login` 页面改造
    - 生产模式隐藏 Dev Quick Login 区域（`NEXT_PUBLIC_DEV_MODE !== 'true'`）
    - 确保标准 email/password 登录正常工作
    - 添加注册链接指向 `/register`
    - _Requirements: R3.1_
  - [x] 5.2 `/register` 页面
    - 确保注册页面可访问并正常工作（已有端点，可能需要 UI）
    - 注册成功后自动登录并重定向到 Dashboard
    - _Requirements: R3.2_
  - [x] 5.3 tRPC Provider 改造
    - 生产模式不注入 `x-dev-user-email` header
    - 检测 UNAUTHORIZED 响应时重定向到 `/login?returnUrl=<current>`
    - _Requirements: R3.3, R3.5_
  - [x] 5.4 Socket Client 改造
    - 生产模式不使用 localStorage email
    - 使用 NextAuth session cookie 认证（Web 端 socket 通过同域 cookie 自动携带）
    - _Requirements: R3.4_
  - [x] 5.5 登录后重定向
    - 从 URL 参数读取 `returnUrl`，登录成功后重定向
    - _Requirements: R3.6_ <!-- 5 done -->

- [x] 6. Extension 认证
  - [x] 6.1 未认证提示
    - 无 session cookie 时 popup 显示"请先在浏览器中登录 VibeFlow"
    - _Requirements: R6.2_
  - [x] 6.2 降级模式
    - 未认证时不屏蔽网站，只显示登录提示
    - _Requirements: R6.3_ <!-- 6 done -->

- [ ] 7. Checkpoint — Web + Extension 测试
  - DEV_MODE=false：访问 Dashboard 重定向到 /login
  - 登录后正常使用
  - Extension 依赖 session cookie 正常工作
  - DEV_MODE=true 时一切恢复

### Phase 3: iOS + Desktop 客户端

- [ ] 8. iOS 认证启用
  - [ ] 8.1 AppProvider 改造
    - 删除硬编码 `dev@vibeflow.local`
    - `__DEV__ && EXPO_PUBLIC_DEV_MODE === 'true'` 时保留 dev 快捷方式
    - 否则走 token 验证流程：SecureStore → verifyToken → authenticated/unauthenticated
    - _Requirements: R4.1, R4.2, R4.6_
  - [ ] 8.2 LoginScreen 验证
    - 确保登录/注册功能正常
    - 登录后 token 正确存入 SecureStore
    - _Requirements: R4.3, R4.4_
  - [ ] 8.3 401 处理
    - HTTP 401 响应清除 SecureStore token，设 authStatus 为 unauthenticated
    - **防抖**：多个并发请求同时 401 时只触发一次"清除 token + 跳转登录页"
    - WebSocket `connect_error` 时检查是否认证失败，是则同样触发登出
    - _Requirements: R4.5_

- [ ] 9. Desktop 认证启用
  - [ ] 9.1 main.ts 改造
    - 用 `VIBEFLOW_DEV_BYPASS=true` 替代 `isDevelopment` 判断
    - 无 bypass 且无 token 时打开登录窗口
    - 注意：release build .app 中不会有此环境变量，这是有意为之（阻止 release build 绕过认证）
    - _Requirements: R5.1_
  - [ ] 9.2 ConnectionManager 改造
    - 删除 `dev@vibeflow.local` email fallback（DEV_MODE=false 时）
    - DEV_MODE=true（`VIBEFLOW_DEV_BYPASS=true`）时保留 email fallback
    - 无 token 且无 bypass 时不连接 socket，等待用户登录
    - _Requirements: R5.2_
  - [ ] 9.3 登录窗口 token 流程验证
    - 验证已有 auth-manager.ts 流程：BrowserWindow → Web /login → cookie → POST /api/auth/token → electron-store
    - 验证生产环境（非 localhost）NextAuth httpOnly cookie 能被 Electron session.cookies.get() 读取
    - _Requirements: R5.3, R5.4_

- [ ] 10. Checkpoint — 全客户端测试
  - iOS 启动显示登录页 → 登录后正常使用
  - Desktop 弹出登录窗口 → 登录后正常连接
  - 所有客户端 DEV_MODE=true 时正常（兜底）

### Phase 4: API Key 管理 UI + MCP 统一 + REST Adapter

> **依赖**：Phase 4 后端部分（task 11.1, 11.3, 12, 13-REST）可与 Phase 3 并行。Phase 4 UI 部分（task 11.2）依赖 Phase 2（Web 登录）完成。

- [x] 11. API Key 管理
  - [x] 11.1 后端 Router
    - 创建 `src/server/routers/api-key.ts`（list/create/revoke）
    - 注册到 root router
    - 依赖 task 2.1（Prisma schema）和 task 2.2（authService scope）
    - _Requirements: R7.2, R7.3, R7.5, R7.6, R7.9_
  - [x] 11.2 Settings 页面 UI
    - API Keys tab/section
    - Key 列表（名称、scope、创建时间、最后使用时间、吊销按钮）
    - 创建对话框（名称、描述、scope 选择）
    - 创建成功弹窗（明文 token + 复制按钮 + 安全警告 + "我已复制"确认按钮，点遮罩层不关闭）
    - 吊销确认对话框
    - _Requirements: R7.2, R7.3, R7.4, R7.5, R7.6_
  - [x] 11.3 Scope 中间件 + 全面应用
    - 创建 `withScope` 中间件，导出 `readProcedure`、`writeProcedure`、`adminProcedure`
    - API Token 请求（`ctx.user.tokenScopes` 存在时）必须匹配 scope，否则 403
    - Session 用户（Web/Extension，无 tokenScopes）拥有全部权限
    - 将所有 tRPC query router（约 110 个）改为 `readProcedure`
    - 将所有 tRPC mutation router（约 69 个）改为 `writeProcedure`
    - api-key create/revoke → `adminProcedure`，api-key list → `readProcedure`
    - Settings 区分两类：安全相关（enforcement 模式等）→ `adminProcedure`，用户偏好（timer、work time、通知）→ `writeProcedure`
    - REST Skill 端点（`/api/skill/*`）在 `authenticateRequest(req, scope)` 中检查 scope（GET=read, POST/PUT/DELETE=write）
    - 修复 `heartbeat.getClientStatus` 数据隔离漏洞：添加 `ctx.user.userId` 验证，防止跨用户查看客户端状态
    - **验证**：完成后 grep 确认无残留 `protectedProcedure.query` / `protectedProcedure.mutation`（应全部替换为 read/write/adminProcedure）
    - _Requirements: R7.7, R7.8_
  - [x] 11.4 登录端点 Rate Limiting
    - `POST /api/auth/token`（登录）IP-based 限流：5 次/分钟
    - `POST /api/auth/register`（注册）IP-based 限流：3 次/分钟
    - 超限返回 429 Too Many Requests
    - 使用内存 store（单实例够用），不引入 Redis <!-- 11 done -->

- [ ] 12. MCP 认证统一
  - [ ] 12.1 `mcp/auth.ts` 改造
    - 生产模式只接受 `vf_` token
    - 通过 `authService.validateToken` 验证
    - 删除 `vibeflow_<userId>_<secret>` 格式支持
    - DEV_MODE=true 时保留 `dev_<email>` token 支持
    - _Requirements: R8.1, R8.2, R8.4_
  - [ ] 12.2 `mcp/trpc-client.ts` 改造
    - 从 `VIBEFLOW_API_KEY` 环境变量读取 token
    - 从 `VIBEFLOW_SERVER_URL` 读取 server URL（默认 http://localhost:3000）
    - 删除硬编码 IP
    - **DEV_MODE=true 时保留 `x-dev-user-email` header**（不是删除 email，是生产模式不用）
    - _Requirements: R8.3_
  - [ ] 12.3 更新 `.claude/.mcp.json`
    - MCP server 配置添加 `VIBEFLOW_API_KEY` 环境变量
    - _Requirements: R8.5_

- [ ] 13. Skill REST Adapter
  - [ ] 13.1 创建 `src/lib/skill-auth.ts`
    - `authenticateRequest(req)` 工具函数：验证 Bearer vf_ token，返回 UserContext
    - _Requirements: R9.6_
  - [ ] 13.2 创建 REST route handlers `src/app/api/skill/`
    - `/api/skill/state` — GET 当前状态
    - `/api/skill/tasks` — GET 今日任务，POST 创建任务
    - `/api/skill/tasks/[id]` — GET 详情，PUT 更新，DELETE 删除
    - `/api/skill/tasks/backlog` — GET backlog
    - `/api/skill/tasks/overdue` — GET 逾期
    - `/api/skill/tasks/batch` — POST 批量更新
    - `/api/skill/pomodoro` — GET 当前番茄钟，POST 启动
    - `/api/skill/pomodoro/complete` — POST 完成
    - `/api/skill/pomodoro/abort` — POST 中止
    - `/api/skill/projects` — GET 列表，POST 创建
    - `/api/skill/projects/[id]` — GET 详情，PUT 更新
    - `/api/skill/analytics` — GET 生产力分析
    - `/api/skill/timeline` — GET 今日时间线
    - `/api/skill/top3` — GET Top 3，POST 设置 Top 3
    - 全部使用标准 JSON（无 SuperJSON），直接调用 service 层
    - _Requirements: R9.1_
  - [ ] 13.3 `middleware.ts` 白名单添加 `/api/skill/*`
    - 已在 task 3.2 中包含

- [ ] 14. Checkpoint — API Key + MCP + REST 测试
  - Settings 创建 Key → Key 只显示一次
  - 用新 Key 配置 MCP → MCP tool 正常工作
  - 用新 Key curl `/api/skill/tasks` → 返回标准 JSON
  - 吊销 Key 后 MCP 和 REST 都返回 401

### Phase 5: Skill 接入层 + 上架准备

- [ ] 15. Skill 文件编写
  - [ ] 15.1 创建 `vibeflow-skills/` 目录结构
    - Hub skill: `vibeflow/SKILL.md`
    - Setup skill: `vibeflow-setup/SKILL.md`
    - Focus skill: `vibeflow-focus/SKILL.md`
    - Tasks skill: `vibeflow-tasks/SKILL.md`
    - Projects skill: `vibeflow-projects/SKILL.md`
    - Analytics skill: `vibeflow-analytics/SKILL.md`
    - _Requirements: R9.1, R9.2, R9.3, R9.4_
  - [ ] 15.2 编写 reference 文档
    - `reference/api-reference.md`：REST `/api/skill/*` 端点文档（标准 JSON 格式的 curl 示例）
    - `reference/authentication.md`：认证机制 + scope 权限表
    - `reference/examples.md`：常见操作 curl 示例
    - _Requirements: R9.8, R9.9_
  - [ ] 15.3 每个 skill 内容
    - YAML frontmatter（name、description、version、argument-hint）
    - 认证段落（环境变量 + REST curl 模板 + 401 处理）
    - 操作指令（每个 REST 端点的调用方式，标准 JSON）
    - 安全提示（NEVER display API key）
    - _Requirements: R9.5, R9.6, R9.7_

- [ ] 16. 上架准备
  - [ ] 16.1 元数据文件
    - `skills-lock.json`
    - `README.md`（安装命令、前置条件、安全须知）
    - `LICENSE`（MIT）
    - _Requirements: R10.1_
  - [ ] 16.2 Frontmatter 规范验证
    - 所有 name kebab-case ≤64 字符
    - 所有 description ≤1024 字符含触发短语
    - 所有 version semver
    - 所有 user-invocable: true
    - _Requirements: R10.2, R10.3_
  - [ ] 16.3 README 编写
    - 一键安装：`npx skills add <owner>/vibeflow-skills`
    - 前置条件：VibeFlow 账号 + API Key
    - 配置说明：环境变量设置
    - 安全须知
    - _Requirements: R10.4_
  - [ ] 16.4 多 harness 分发
    - 确保 skill 文件能被 Cursor（`.cursor/skills/`）、Gemini CLI（`.gemini/skills/`）等工具读取
    - 可通过 build script 或 README 说明手动复制
    - _Requirements: R10.5_

- [ ] 17. Final Checkpoint
  - 全流程端到端验证：注册 → 登录 → 创建 API Key → 配置 Skill → Claude Code 通过 REST API 操作 VibeFlow
  - 回滚验证：DEV_MODE=true → 默认账号正常使用
  - 更新 CLAUDE.md spec status table

## Follow-up（本 spec 完成后）

- [ ] F1. Token 过期提醒：Settings API Key 列表高亮 7 天内过期的 Key；客户端 token 接近过期时显示提醒
- [ ] F2. Scope 细粒度扩展：按业务域细分（如 `tasks:read`、`analytics:read`），满足"只给 Agent 读任务不读分析"的场景

## Notes

- Phase 1-3 是认证激活的核心，必须按序完成
- Phase 4 后端部分（router + MCP + REST adapter）可与 Phase 3 并行，UI 部分依赖 Phase 2
- Phase 5 (Skill) 依赖 Phase 4 的 REST Adapter 完成
- 每个 Checkpoint 失败时，DEV_MODE=true 是即时回滚手段
- 迁移脚本在 Phase 1 写好但不急着执行，等 Phase 2-3 代码改造验证后再做正式迁移
- **部署顺序**：先升级所有客户端到新版代码（DEV_MODE=true），再切 DEV_MODE=false
