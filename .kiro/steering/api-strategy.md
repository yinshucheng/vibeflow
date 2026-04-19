# API 接入策略：MCP vs Skill vs REST

> 最后更新：2026-04-14。本文档是 VibeFlow 外部接入层的唯一 truth source。

## 背景

VibeFlow 有三种外部接入方式 + 一种内部 AI 交互：

| 接入方式 | 传输 | 认证 | 使用者 |
|----------|------|------|--------|
| **MCP** | stdio 进程 | `vf_` token / `dev_<email>` | Claude Code（本地配置 .mcp.json） |
| **Skill REST API** | HTTP | `vf_` Bearer token | 任何 AI Agent（Claude Code、Cursor、脚本） |
| **SKILL.md** | 无（纯文档） | 教 Agent 调 REST API | Claude Code / Cursor / Gemini CLI 等 |
| **内置 AI Chat** | tRPC + Socket.io | Session / Bearer token | Web/iOS/Desktop 用户 |

## 核心决策：保留两层，一层退役

### 推荐：**Skill REST API 为主，MCP 逐步退役**

| 维度 | MCP | Skill REST API | 结论 |
|------|-----|----------------|------|
| 分发 | 需配置 .mcp.json + 启动进程 | `npx skills add` 一键安装 | **REST 胜** |
| 跨工具兼容 | 仅 Claude Code | Claude Code、Cursor、Gemini CLI、Codex、任何能 curl 的工具 | **REST 胜** |
| 认证 | 独立体系（已统一到 vf_，但仍是单独进程） | 标准 HTTP Bearer token | **REST 胜** |
| 实时性 | 可持有连接 | 无状态 HTTP | MCP 略胜（但 Agent 场景不需要实时） |
| 能力覆盖 | 28 tool + 14 resource | 当前 22 handler（缺 13 个） | **MCP 暂时胜**，补齐后对等 |
| 维护成本 | 独立进程 + trpc-client + auth 模块 | Next.js route handler，与主应用同进程 | **REST 胜** |
| SkillHub 上架 | 不支持 | 原生支持 | **REST 胜** |

**结论**：REST Skill API 是未来主线。MCP 保留到 REST 完全对齐后标记为 deprecated，给用户半年迁移期。

### 过渡期策略

```
现在 ─────────────────────────────────────── 未来
MCP (28 tool) ──→ 保留可用 ──→ deprecated ──→ 删除
REST (22 handler) ──→ 补齐到 35 ──→ 主线 ──→ 唯一外部 API
SKILL.md (未写) ──→ 编写 6 个 ──→ 上架 SkillHub ──→ 持续更新
```

## 接口能力清单（唯一对照表）

以下是所有操作的最终对照。**标 ⭐ 的是核心接口**（让 Claude Code 能正常控制 VibeFlow 的最小集）。

### 写入操作

| # | 操作 | 内置 Chat | MCP tool | REST 端点 | 优先级 |
|---|------|:---------:|:--------:|:---------:|:------:|
| W1 | 创建任务 | ✅ | ✅ `flow_create_task_from_nl` | ✅ `POST /tasks` | ⭐ |
| W2 | 更新任务 | ✅ | ✅ `flow_update_task` | ✅ `PUT /tasks/[id]` | ⭐ |
| W3 | 删除任务 | ✅ | ✅ `flow_delete_task` | ✅ `DELETE /tasks/[id]` | ⭐ |
| W4 | 添加子任务 | ✅ | ✅ `flow_add_subtask` | ✅ `POST /tasks/[id]/subtasks` | ⭐ |
| W5 | 批量更新任务 | ✅ | ✅ `flow_batch_update_tasks` | ✅ `POST /tasks/batch` | |
| W6 | 设置 Top 3 | ✅ | ✅ `flow_set_top3` | ✅ `POST /top3` | ⭐ |
| W7 | 启动番茄钟 | ✅ | ✅ `flow_start_pomodoro` | ✅ `POST /pomodoro` | ⭐ |
| W8 | 完成番茄钟 | ✅ | ❌ | ✅ `POST /pomodoro/complete` | ⭐ |
| W9 | 中止番茄钟 | ✅ | ❌ | ✅ `POST /pomodoro/abort` | ⭐ |
| W10 | 创建项目 | ✅ | ✅ `flow_create_project` | ✅ `POST /projects` | ⭐ |
| W11 | 更新项目 | ✅ | ✅ `flow_update_project` | ✅ `PUT /projects/[id]` | |
| W12 | 快速创建 inbox 任务 | ✅ | ✅ `flow_quick_create_inbox_task` | ❌ | ⭐ |
| W13 | 番茄钟中切换任务 | ✅ | ✅ `flow_switch_task` | ❌ | |
| W14 | 完成当前任务并切换 | ✅ | ✅ `flow_complete_current_task` | ❌ | |
| W15 | 无任务番茄钟 | ✅ | ✅ `flow_start_taskless_pomodoro` | ❌ | |
| W16 | 补录番茄钟 | ✅ | ✅ `flow_record_pomodoro` | ❌ | |
| W17 | 移动任务到其他项目 | ✅ | ✅ `flow_move_task` | ❌ | |
| W18 | 上报 blocker | ✅ | ✅ `flow_report_blocker` | ❌ | |
| W19 | 从模板创建项目 | ✅ | ✅ `flow_create_project_from_template` | ❌ | |
| W20 | 临时解锁 Screen Time | ✅ | ✅ `flow_request_temporary_unblock` | ❌ | |
| W21 | 完成任务（带 summary） | ✅ | ✅ `flow_complete_task` | ❌（可用 W2 设 status=DONE） | |
| W22 | NL 解析创建任务 | ✅ | ✅ `flow_create_task_from_nl` | ❌（外部 Agent 自己有 NL 能力） | |

### 读取操作

| # | 数据 | 内置 Chat | MCP resource | REST 端点 | 优先级 |
|---|------|:---------:|:------------:|:---------:|:------:|
| R1 | 当前系统状态 | ✅ | ✅ `vibe://state/current` | ✅ `GET /state` | ⭐ |
| R2 | 今日任务 | ✅ | ✅ `vibe://tasks/today` | ✅ `GET /tasks` | ⭐ |
| R3 | 任务详情 | ✅ | ✅ `flow_get_task` | ✅ `GET /tasks/[id]` | ⭐ |
| R4 | Backlog 任务 | ✅ | ✅ `flow_get_backlog_tasks` | ✅ `GET /tasks/backlog` | |
| R5 | 逾期任务 | ✅ | ✅ `flow_get_overdue_tasks` | ✅ `GET /tasks/overdue` | |
| R6 | 项目列表 | ✅ | ✅ `vibe://projects/active` | ✅ `GET /projects` | ⭐ |
| R7 | 项目详情 | ✅ | ✅ `flow_get_project` | ✅ `GET /projects/[id]` | |
| R8 | 当前番茄钟 | ✅ | ✅ `vibe://pomodoro/current` | ✅ `GET /pomodoro` | ⭐ |
| R9 | 生产力分析 | ✅ | ✅ `vibe://analytics/productivity` | ✅ `GET /analytics` | |
| R10 | 今日时间线 | ✅ | ✅ `vibe://timeline/today` | ✅ `GET /timeline` | |
| R11 | Top 3 任务 | ✅ | ✅ `flow_get_top3` | ✅ `GET /top3` | ⭐ |
| R12 | 任务上下文（含项目） | ✅ | ✅ `flow_get_task_context` | ❌ | |
| R13 | 依赖分析 | ✅ | ✅ `flow_analyze_task_dependencies` | ❌ | |
| R14 | 每日总结 | ✅ | ✅ `flow_generate_daily_summary` | ❌ | ⭐ |
| R15 | 目标列表 | ✅ | ✅ `vibe://user/goals` | ❌ | |
| R16 | 番茄钟历史（7天） | ✅ | ✅ `vibe://history/pomodoros` | ❌ | |
| R17 | 活跃 blocker | ✅ | ✅ `vibe://blockers/active` | ❌ | |
| R18 | 用户偏好/编码标准 | ✅ | ✅ `vibe://user/principles` | ❌ | |

## 核心接口（⭐）— 让 Claude Code 能正常控制

补齐以下 REST 端点 + 写好 SKILL.md，Claude Code 就能完成 90% 的日常操作：

### 已有（不用动）

✅ W1-W11, R1-R11 — 22 个 handler 已实现

### 需要补的（3 个核心 REST 端点）

| 端点 | 说明 |
|------|------|
| `POST /api/skill/tasks/inbox` | 快速创建 inbox 任务（W12），外部 Agent 最常用 |
| `GET /api/skill/summary` | 每日总结（R14），Agent 需要了解今天的工作概况 |
| `POST /api/skill/tasks/complete` | 完成任务带 summary（W21），比 PUT 更语义化 |

### 需要写的文档

| 文件 | 说明 |
|------|------|
| `vibeflow/SKILL.md` | Hub skill — 概览 + 路由 |
| `vibeflow-setup/SKILL.md` | 配置引导 |
| `vibeflow-focus/SKILL.md` | 番茄钟操作 |
| `vibeflow-tasks/SKILL.md` | 任务操作 |
| `vibeflow-projects/SKILL.md` | 项目操作 |
| `vibeflow-analytics/SKILL.md` | 数据查询 |
| `reference/api-reference.md` | 完整端点文档 |

## 非核心接口（后续补齐）

补齐核心后，剩下 10 个 REST 端点让 Skill 完全对齐 MCP：

| 端点 | 对应 MCP tool | 优先级 |
|------|--------------|--------|
| `POST /api/skill/pomodoro/switch` | `flow_switch_task` | 中 |
| `POST /api/skill/pomodoro/taskless` | `flow_start_taskless_pomodoro` | 中 |
| `POST /api/skill/pomodoro/complete-task` | `flow_complete_current_task` | 中 |
| `POST /api/skill/pomodoro/record` | `flow_record_pomodoro` | 低 |
| `POST /api/skill/tasks/[id]/move` | `flow_move_task` | 中 |
| `POST /api/skill/tasks/[id]/blocker` | `flow_report_blocker` | 低 |
| `GET /api/skill/tasks/[id]/context` | `flow_get_task_context` | 中 |
| `POST /api/skill/projects/from-template` | `flow_create_project_from_template` | 低 |
| `GET /api/skill/goals` | `vibe://user/goals` | 低 |
| `POST /api/skill/unblock` | `flow_request_temporary_unblock` | 低 |

## 内置 AI Chat 与 Skill 对齐机制

### 问题

当前三处独立定义工具，容易不同步：
- 内置 AI Chat：`src/services/chat-tools.service.ts`（27 个 tool，Zod schema + execute 函数）
- REST Skill API：`src/app/api/skill/**`（22 个 handler）
- SKILL.md：文档描述（尚未编写）

任何一处新增/修改工具，其他两处不知道。

### 解决方案：单一工具注册表

重构为**工具注册表模式**——所有工具在一个地方定义，三个接入层从注册表读取：

```
src/tools/                          ← 新目录：工具注册表
├── registry.ts                     ← 所有工具的定义（name, schema, execute, meta）
├── definitions/
│   ├── task-tools.ts               ← 任务相关工具
│   ├── pomodoro-tools.ts           ← 番茄钟相关工具
│   ├── project-tools.ts            ← 项目相关工具
│   └── query-tools.ts              ← 只读查询工具
└── adapters/
    ├── chat-adapter.ts             ← registry → Vercel AI SDK tool() 格式
    ├── rest-adapter.ts             ← registry → Next.js route handler（自动生成）
    └── skill-doc-generator.ts      ← registry → SKILL.md 文档（自动生成）
```

每个工具定义：

```typescript
// src/tools/definitions/task-tools.ts
export const completeTask = defineTool({
  name: 'flow_complete_task',
  description: '完成任务并添加总结',
  category: 'task',                    // 用于 SKILL.md 分组
  inputSchema: z.object({
    task_id: z.string().describe('Task UUID'),
    summary: z.string().optional().describe('完成总结'),
  }),
  outputSchema: z.object({ ... }),
  scope: 'write',                      // REST scope 控制
  requiresConfirmation: false,         // Chat 确认控制
  restMethod: 'POST',                  // REST HTTP method
  restPath: '/tasks/complete',         // REST 路径
  execute: async (userId, params) => {
    return taskService.updateStatus(params.task_id, userId, 'DONE');
  },
});
```

三个 adapter 从同一注册表读取：

| Adapter | 输入 | 输出 |
|---------|------|------|
| `chat-adapter.ts` | registry | Vercel AI SDK `ToolSet`（给 streamText 用） |
| `rest-adapter.ts` | registry | Next.js route handlers（自动注册到 `/api/skill/*`） |
| `skill-doc-generator.ts` | registry | SKILL.md 文件内容（`npx tsx scripts/generate-skill-docs.ts`） |

### 对齐保证

1. **新增工具**：只需在 `src/tools/definitions/` 加一个定义，三个 adapter 自动同步
2. **修改工具**：改一处定义，Chat/REST/SKILL.md 全部更新
3. **SKILL.md 自动生成**：`npm run generate:skills` 从注册表生成，不手写
4. **CI 检查**：`npm run check:tool-sync` 验证注册表 ↔ REST 端点 ↔ SKILL.md 三者一致

### 实施分期

| 阶段 | 做什么 | 效果 |
|------|--------|------|
| **现在（快速方案）** | 手写 SKILL.md + 手动维护对照表 | 能用，但靠人工同步 |
| **Phase 2（工具注册表）** | 重构 chat-tools + REST handler → registry 模式 | 新增工具自动三端同步 |
| **Phase 3（文档生成）** | 从 registry 自动生成 SKILL.md | SKILL.md 永远与代码一致 |

**建议**：先用快速方案上线（手写 SKILL.md），积累几个工具迭代后再做注册表重构——避免过早抽象。

## MCP 退役计划

1. **现在**：MCP 和 Skill REST 并存，MCP 保持可用
2. **REST 完全对齐后**：MCP 文档标注 deprecated，推荐迁移到 Skill
3. **6 个月后**：删除 `src/mcp/` 目录，registry 的 MCP adapter 也删除

## 与 CLAUDE.md 的关系

本文档补充 CLAUDE.md 的 "MCP Integration" 章节。当两者冲突时以本文档为准。

修改 service 层接口时，必须同步检查：
1. 内置 AI Chat 工具（`src/services/chat-tools.service.ts`）
2. REST Skill 端点（`src/app/api/skill/`）
3. SKILL.md 文档（`vibeflow-skills/`）
4. MCP tools（`src/mcp/tools.ts`）— 退役前仍需维护
5. 本文档的能力对照表（上方 ⭐ 表格）
