# VibeFlow 上线前待办清单

> 生成日期：2026-03-07
> 范围：不含部署/基础设施（CI/CD、Docker、域名、云服务等），聚焦于**功能开发、质量保障、安全加固**

---

## 一、总览

| 优先级 | 分类 | 待办数 | 建议工期 |
|--------|------|--------|----------|
| 🔴 P0 必须完成 | 认证 / 安全 / 核心体验 | 5 | — |
| 🟡 P1 强烈建议 | 功能补齐 / 质量保障 | 6 | — |
| 🟢 P2 可延后 | 增值功能 / 体验优化 | 7 | — |

当前项目整体完成度约 **80%**（后端 ~95%，Web UI ~85%，AI Chat ~90%，iOS ~40%，认证 ~30%，E2E ~50%）。

---

## 二、🔴 P0 — 必须完成（上线阻塞项）

### 1. 生产级认证系统

**现状**：仅有 Email/Password Credentials Provider + 开发模式 `X-Dev-User-Email` Header Bypass。无 OAuth、无密码重置、无邮箱验证。

**待开发**：
- [ ] 登录/注册页面 UI（NextAuth config 已指向 `/login`，但页面不存在）
- [ ] 密码重置流程（发送重置邮件 → 重置页面 → 修改密码）
- [ ] 邮箱验证流程（注册后发送验证邮件）
- [ ] OAuth 集成（至少一个：Google / GitHub）
- [ ] 禁用开发模式 Header Bypass 的生产环境开关
- [ ] Session 安全加固（CSRF token、HttpOnly cookies、secure flag）

**相关 Spec**：`dev-user-system`（全部未开始）

---

### 2. 登录/注册前端页面

**现状**：`/api/auth/register` API 存在，但无 UI。`/login` 页面未创建。

**待开发**：
- [ ] `/login` 页面（Email/Password 登录 + OAuth 按钮）
- [ ] `/register` 页面（注册表单 + 密码强度校验）
- [ ] `/forgot-password` 页面
- [ ] 未认证时的重定向逻辑
- [ ] 认证状态下的路由守卫

---

### 3. 数据隔离审计

**现状**：Services 设计上按 `userId` 过滤，但未系统性验证所有查询都正确限定了 scope。

**待开发**：
- [ ] 审计所有 Prisma 查询，确认 `where` 条件包含 `userId`
- [ ] 对跨用户数据泄露的关键路径编写安全测试
- [ ] 审计 Socket.io 房间隔离（确保用户只能接收自己的广播）
- [ ] 审计 tRPC Context 中 userId 的传递链

**相关 Spec**：`dev-user-system` Tasks 3.1–3.4

---

### 4. 环境变量 & 密钥安全

**现状**：LLM API Key、数据库连接字符串等通过环境变量直接使用，无加密、无轮换机制。

**待完善**：
- [ ] 确认 `.env` 不会被提交（`.gitignore` 检查）
- [ ] 生产环境密钥管理方案（Vault / Secret Manager）
- [ ] LLM API Key 的 rate limit 处理和降级策略
- [ ] `NEXTAUTH_SECRET` 使用足够强度的随机值

---

### 5. 错误处理 & 基础可观测性

**现状**：无 Sentry、无结构化日志、无生产环境错误监控。

**待开发**：
- [ ] 全局错误边界组件（React Error Boundary）
- [ ] API 层统一错误响应格式（已有 ServiceResult，需确认 tRPC errorFormatter）
- [ ] 关键路径的结构化日志（登录、支付、状态转换）
- [ ] 集成 Sentry 或类似错误追踪服务（可选，但强烈建议）

---

## 三、🟡 P1 — 强烈建议完成

### 6. E2E 测试补全

**现状**：14 个 spec 文件、~114 个测试。仅覆盖 Airlock、Pomodoro、Chat、MCP 流程。核心 CRUD 无 E2E。

**待开发**：
- [ ] Page Objects 抽象层（`e2e-testing` Spec Task 4）
- [ ] Task CRUD E2E（创建、编辑、删除、子任务）
- [ ] Project CRUD E2E
- [ ] Goal CRUD E2E
- [ ] Settings 页面 E2E
- [ ] Daily State 流转 E2E
- [ ] Daily Cap 触发与覆盖 E2E

**相关 Spec**：`e2e-testing` Tasks 4, 8–12

---

### 7. Pomodoro 多任务功能补全

**现状**：Phase 1–2 完成（数据层 + 状态机），Phase 3 部分完成（~80%），Phase 4–8 未开始。

**建议上线前完成**：
- [ ] Phase 3 收尾：Task Switcher 搜索、标签输入、庆祝动画、E2E 测试
- [ ] Phase 5：Timeline 增强（多任务时间片可视化）

**可延后**：
- Phase 4（Desktop Rest Enforcer）、Phase 7（Flow Extension）、Phase 8（Rest Reminders）

**相关 Spec**：`pomodoro-multitask-enhancement`

---

### 8. AI Chat S11 剩余功能评估

**现状**：S11.1–S11.3 + S11.6 已完成。S11.4、S11.5、S11.7 未开始。

**建议**：
- [ ] S11.4 Skill Registry — 上线前可跳过（用户可通过现有 24 个工具完成多数操作）
- [ ] S11.5 External MCP Server Integration — 上线前可跳过（Calendar/Notion/GitHub 集成为增值功能）
- [ ] S11.7 Data Analytics Dashboard — **建议完成**（LLM 用量/成本监控对运营至关重要）

---

### 9. 网站使用统计功能

**现状**：`WebsiteStatsService` 不存在。`pomodoro-enhancement` Spec Tasks 16.5–16.8 未完成。

**待开发**：
- [ ] WebsiteStatsService（网站使用时长聚合）
- [ ] 饼图组件（使用分布）
- [ ] 排行榜组件
- [ ] 时间线视图

**评估**：如果浏览器扩展的网站追踪是核心卖点之一，则为 P1；否则可降为 P2。

---

### 10. Desktop 已知 Bug 修复

**现状**：文档 `desktop-window-behavior.md` 记录了 Over-Rest Enforcer 在 Pomodoro 期间可能因 Policy 更新延迟继续运行的 bug。Focus Enforcer、Over-Rest Enforcer、Sleep Enforcer、Notification Manager 模块缺少测试。

**待开发**：
- [ ] 修复 Over-Rest Enforcer Policy 延迟 bug
- [ ] 为 Desktop Enforcer 模块添加单元测试

---

### 11. 性能基线 & 优化

**待评估**：
- [ ] 首页加载时间（LCP、FID、CLS 基线测量）
- [ ] tRPC 批量查询是否有 N+1 问题
- [ ] Socket.io 连接数压测（单用户多客户端场景）
- [ ] Prisma 查询性能（大数据量下的 Task 列表、Stats 聚合）
- [ ] 数据库索引审查（高频查询路径）

---

## 四、🟢 P2 — 可延后（上线后迭代）

### 12. iOS 写操作

**现状**：iOS 客户端为只读 MVP。无法创建/编辑 Task、启动 Pomodoro、管理 Top 3、修改 Settings。

**相关 Spec**：`ios-mobile-enhancement`（全部未开始）

**建议**：首次上线可仅提供 Web + Desktop，iOS 作为后续版本发布。

---

### 13. REST/SLEEP 工作应用阻断

**现状**：`rest-sleep-enforcement` Spec 全部未开始（~60 个子任务）。涉及 HealthLimitService、RestEnforcementService、Desktop IPC force-quit。

**评估**：这是 Desktop 端差异化功能。如果首次上线仅面向 Web 用户，可延后；如果 Desktop 是核心，则提升至 P1。

**相关 Spec**：`rest-sleep-enforcement`

---

### 14. UI 设计系统重构

**现状**：`ui-redesign` Spec 全部未开始。当前 UI 使用基础 Tailwind，无 Design Token、无组件库、无动画系统、无无障碍合规。

**待开发（后续迭代）**：
- [ ] Design Tokens（颜色、间距、字体）
- [ ] 组件库（基于 shadcn/ui 或自建）
- [ ] 深色模式
- [ ] 动画与过渡
- [ ] WCAG 2.1 AA 无障碍合规

---

### 15. MCP 能力扩展

**现状**：已有 28 个 tools + 13 个 resources。`mcp-capability-enhancement` Spec 的 8 个额外工具未开始（部分已通过 AI Chat 的 `chat-tools.service.ts` 间接实现）。

**建议**：当前 MCP 覆盖已足够上线使用，增量工具可后续补充。

---

### 16. 未落地的 Spec 规划

以下 Spec 仅有 `requirements.md`，无 design 或 tasks：

| Spec | 描述 | 建议 |
|------|------|------|
| `public-network-deployment` | 公网部署方案 | 属于部署范畴，不在本文讨论范围 |
| `state-aware-enforcement` | 状态感知的强制执行 | 可延后 |
| `task-categorization` | 任务分类系统 | 可延后 |
| `pomodoro-state-transition` | 架构重构 | 可延后 |

---

### 17. 文档 & 用户引导

**待开发**：
- [ ] 用户使用指南 / 帮助中心
- [ ] 首次使用引导（Onboarding Tour）
- [ ] 快捷键说明（Desktop）
- [ ] 常见问题 FAQ

---

### 18. 隐私 & 合规

**待评估**：
- [ ] 隐私政策页面
- [ ] 用户数据导出功能（GDPR 要求）
- [ ] 账户删除功能
- [ ] Cookie 同意弹窗（如面向欧洲用户）

---

## 五、建议的上线路径

### 最小可行上线（MVP Launch）— 仅完成 P0

聚焦 Web 端，Desktop 作为 Beta：

1. **认证系统**（登录/注册页面 + 密码重置 + 至少一个 OAuth）
2. **数据隔离审计**
3. **密钥安全**
4. **错误处理 + 错误边界**
5. **生产环境配置禁用开发模式 Bypass**

### 稳健上线 — P0 + 选择性 P1

在 MVP 基础上：

6. **E2E 测试**（至少覆盖 Task/Project CRUD + Daily State）
7. **LLM 用量监控**（S11.7 或简化版）
8. **Desktop Bug 修复**
9. **性能基线测量**

### 完整上线 — P0 + P1 + 选择性 P2

在稳健上线基础上：

10. **iOS 写操作**
11. **REST/SLEEP 强制执行**（如果 Desktop 是核心）
12. **用户引导 & 文档**
13. **隐私合规**

---

## 六、当前各模块完成度一览

| 模块 | 完成度 | 备注 |
|------|--------|------|
| 后端 Services (62个) | 95% | 成熟稳定 |
| tRPC Routers (26个) | 95% | 覆盖完整 |
| Prisma Schema (34 models) | 98% | 无明显缺失 |
| State Machine | 95% | 核心流转完整 |
| Web UI 页面 | 85% | 缺登录/注册页 |
| Web UI 组件 (74个) | 80% | 功能性具备，设计系统缺失 |
| AI Chat | 90% | F0-S10 完成，S11 部分完成 |
| MCP 集成 | 95% | 28 tools + 13 resources |
| Desktop (Electron) | 90% | 已知 Enforcer bug |
| 浏览器扩展 | 90% | 核心功能完整 |
| iOS | 40% | 仅只读 |
| 单元/属性测试 | 85% | 824 tests passing |
| E2E 测试 | 50% | 核心 CRUD 缺失 |
| 认证系统 | 30% | 仅 Dev Mode |
| UI 设计系统 | 0% | 未开始 |
| REST/SLEEP 强制 | 0% | 未开始 |
