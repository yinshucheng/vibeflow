# VibeFlow AI-Native 集成指南

本文档提供 VibeFlow AI-Native 功能的完整说明，包括能力概览、接入方法、调试指南和验收测试清单。

---

## 一、AI-Native 能力概览

### 1.1 MCP Resources（只读数据资源）

| Resource URI | 功能 | 返回数据 |
|-------------|------|---------|
| `vibe://context/current` | 当前工作上下文 | 活跃项目、当前任务、系统状态、番茄钟剩余时间 |
| `vibe://context/workspace` | 工作区上下文 | 最近文件变更、活跃 Git 分支 |
| `vibe://user/goals` | 用户目标 | 长期/短期目标及关联项目数 |
| `vibe://user/principles` | 编码原则 | 用户的编码标准和偏好设置 |
| `vibe://projects/active` | 活跃项目列表 | 项目详情、任务数、关联目标 |
| `vibe://tasks/today` | 今日任务 | Top 3 任务、其他计划任务 |
| `vibe://history/pomodoros` | 番茄钟历史 | 最近 7 天的番茄钟记录和统计摘要 |
| `vibe://analytics/productivity` | 生产力分析 | 日/周/月评分、趋势、高效时段 |
| `vibe://blockers/active` | 活跃阻塞 | 当前阻塞列表、分类、状态 |

### 1.2 MCP Tools（可执行操作）

| Tool Name | 功能 | 参数 |
|-----------|------|------|
| `vibe.complete_task` | 完成任务 | `task_id`, `summary` |
| `vibe.add_subtask` | 添加子任务 | `parent_id`, `title`, `priority` |
| `vibe.report_blocker` | 报告阻塞 | `task_id`, `error_log` |
| `vibe.start_pomodoro` | 开始番茄钟 | `task_id`, `duration` |
| `vibe.get_task_context` | 获取任务上下文 | `task_id` |
| `vibe.batch_update_tasks` | 批量更新任务 | `updates[]` (taskId, status, priority, planDate) |
| `vibe.create_project_from_template` | 从模板创建项目 | `templateId`, `projectName`, `goalId?` |
| `vibe.analyze_task_dependencies` | 分析任务依赖 | `projectId` |
| `vibe.generate_daily_summary` | 生成每日总结 | `date?` |
| `vibe.create_task_from_nl` | 自然语言创建任务 | `description` |

### 1.3 智能服务能力

| 服务 | 功能 | 文件位置 |
|------|------|---------|
| Smart Suggestion Engine | 基于优先级、截止日期、目标关联推荐任务 | `src/services/smart-suggestion.service.ts` |
| Task Decomposer | 自动将大任务分解为 2-5 个子任务 | `src/services/task-decomposer.service.ts` |
| Blocker Resolver | 检测卡住的任务并提供解决建议 | `src/services/blocker-resolver.service.ts` |
| Progress Analyzer | 生产力评分、趋势检测、高效时段识别 | `src/services/progress-analyzer.service.ts` |
| Context Provider | 为 AI 提供结构化 Markdown 上下文 | `src/services/context-provider.service.ts` |
| NL Parser | 自然语言任务解析 | `src/services/nl-parser.service.ts` |
| MCP Event Service | 事件订阅和发布 | `src/services/mcp-event.service.ts` |
| MCP Audit Service | 工具调用审计日志 | `src/services/mcp-audit.service.ts` |

---

## 二、接入 Claude/Cursor 的方法

### 2.1 方法一：MCP 配置文件（推荐）

在 Claude Desktop 或 Cursor 的 MCP 配置文件中添加：

**Claude Desktop** (`~/.claude/mcp.json`):
```json
{
  "mcpServers": {
    "vibeflow": {
      "command": "npx",
      "args": ["ts-node", "<path-to-vibeflow>/src/mcp/run.ts"],
      "env": {
        "DATABASE_URL": "postgresql://user:pass@localhost:5432/vibeflow",
        "MCP_USER_EMAIL": "your@email.com"
      }
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "vibeflow": {
      "command": "node",
      "args": ["--loader", "ts-node/esm", "/Users/yinshucheng/code/creo/vibeflow/src/mcp/run.ts"],
      "env": {
        "DATABASE_URL": "postgresql://yinshucheng@localhost:5432/vibeflow",
        "MCP_USER_EMAIL": "dev@vibeflow.local"
      }
    }
  }
}
```

### 2.2 方法二：启动 VibeFlow 服务后通过 stdio 连接

```bash
# 1. 启动 VibeFlow 服务
cd vibeflow
npm run dev

# 2. MCP 服务通过 stdio 模式运行
npx ts-node src/mcp/run.ts
```

### 2.3 环境变量配置

| 变量 | 说明 | 示例 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | `postgresql://user:pass@localhost:5432/vibeflow` |
| `MCP_USER_EMAIL` | 用户邮箱（用于认证） | `test@example.com` |
| `NODE_ENV` | 环境模式 | `development` / `production` |

### 2.4 开发环境认证绕过

在非生产环境，可以使用 HTTP Header 绕过认证：

```bash
curl -H "X-Dev-User-Email: test@example.com" http://localhost:3000/api/trpc/task.list
```

---

## 三、调试指南

### 3.1 查看 MCP 审计日志

所有 MCP 工具调用都会记录到 `MCPAuditLog` 表：

```sql
-- 查看最近的工具调用
SELECT 
  "toolName", 
  "success", 
  "duration", 
  "timestamp",
  "input"::text,
  "output"::text
FROM "MCPAuditLog" 
WHERE "userId" = 'xxx' 
ORDER BY timestamp DESC 
LIMIT 20;

-- 查看失败的调用
SELECT * FROM "MCPAuditLog" 
WHERE "success" = false 
ORDER BY timestamp DESC;
```

### 3.2 查看事件历史

```sql
-- 查看最近的事件
SELECT "type", "payload"::text, "timestamp"
FROM "MCPEvent" 
WHERE "userId" = 'xxx' 
ORDER BY timestamp DESC 
LIMIT 50;

-- 按事件类型统计
SELECT "type", COUNT(*) 
FROM "MCPEvent" 
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY "type";
```

### 3.3 本地调试 MCP 服务

```bash
# 运行 MCP 服务器（stdio 模式）
MCP_USER_EMAIL=test@example.com npx ts-node src/mcp/run.ts

# 测试资源读取
echo '{"jsonrpc":"2.0","method":"resources/read","params":{"uri":"vibe://context/current"},"id":1}' | \
  MCP_USER_EMAIL=test@example.com npx ts-node src/mcp/run.ts

# 测试工具调用
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"vibe.generate_daily_summary","arguments":{}},"id":1}' | \
  MCP_USER_EMAIL=test@example.com npx ts-node src/mcp/run.ts
```

### 3.4 日志查看

```bash
# 查看服务日志
npm run dev 2>&1 | grep -E "(MCP|Event|Audit)"

# 查看事件发布日志
# 日志格式: [MCPEventService] Event published: <type> for user <userId> (<subscribers> subscribers, <duration>ms)
```

---

## 四、运维指南

### 4.1 数据库维护

```sql
-- 清理 24 小时前的事件历史
DELETE FROM "MCPEvent" WHERE timestamp < NOW() - INTERVAL '24 hours';

-- 清理 30 天前的审计日志
DELETE FROM "MCPAuditLog" WHERE timestamp < NOW() - INTERVAL '30 days';

-- 清理已解决的阻塞记录（保留 7 天）
DELETE FROM "Blocker" 
WHERE status = 'resolved' 
AND "resolvedAt" < NOW() - INTERVAL '7 days';
```

### 4.2 监控指标

| 指标 | 目标值 | 查询方式 |
|------|--------|---------|
| MCP 工具调用成功率 | > 99% | `SELECT AVG(success::int) FROM "MCPAuditLog"` |
| 事件发布延迟 | < 100ms | 查看日志中的 duration |
| 资源响应时间 | < 500ms | 查看审计日志中的 duration |

### 4.3 常见问题排查

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| AI 无法获取上下文 | `MCP_USER_EMAIL` 未设置 | 检查环境变量配置 |
| 工具调用失败 | 参数错误或权限问题 | 查看 `MCPAuditLog` 中的错误信息 |
| 事件未收到 | 订阅未创建或已过期 | 检查 `MCPSubscription` 表 |
| 性能问题 | 数据库连接池耗尽 | 检查连接数，增加池大小 |
| 认证失败 | 用户不存在 | 确保用户已在数据库中创建 |

### 4.4 生产环境配置

```env
# .env.production
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=xxx
NEXTAUTH_URL=https://your-domain.com
NODE_ENV=production

# MCP 认证（生产环境应使用 JWT）
MCP_AUTH_MODE=jwt
MCP_JWT_SECRET=xxx
```

---

## 五、验收测试清单

### 5.1 自动化测试

运行以下命令验证功能完整性：

```bash
# 属性测试（Property-Based Tests）
npm run test

# AI-Native E2E 测试
npx playwright test e2e/tests/mcp-ai-native --reporter=list

# 构建验证
npm run build
```

**预期结果：**
- 属性测试：215+ 通过
- E2E 测试：147 通过
- 构建：成功

### 5.2 手动验收测试清单

#### MCP Resources 验收

| # | 测试项 | 验收标准 | 通过 |
|---|--------|---------|------|
| R1 | 获取当前上下文 | `vibe://context/current` 返回有效 JSON，包含 systemState | ☐ |
| R2 | 获取工作区上下文 | `vibe://context/workspace` 返回最近活动 | ☐ |
| R3 | 获取番茄钟历史 | `vibe://history/pomodoros` 返回 7 天内记录 | ☐ |
| R4 | 获取生产力分析 | `vibe://analytics/productivity` 返回评分和趋势 | ☐ |
| R5 | 获取活跃阻塞 | `vibe://blockers/active` 返回阻塞列表 | ☐ |
| R6 | 资源响应时间 | 所有资源响应 < 500ms | ☐ |

#### MCP Tools 验收

| # | 测试项 | 验收标准 | 通过 |
|---|--------|---------|------|
| T1 | 完成任务 | `vibe.complete_task` 成功标记任务为 DONE | ☐ |
| T2 | 添加子任务 | `vibe.add_subtask` 创建子任务并关联父任务 | ☐ |
| T3 | 开始番茄钟 | `vibe.start_pomodoro` 成功启动番茄钟 | ☐ |
| T4 | 批量更新任务 | `vibe.batch_update_tasks` 原子性更新多个任务 | ☐ |
| T5 | 从模板创建项目 | `vibe.create_project_from_template` 创建项目和任务 | ☐ |
| T6 | 分析任务依赖 | `vibe.analyze_task_dependencies` 返回依赖关系 | ☐ |
| T7 | 生成每日总结 | `vibe.generate_daily_summary` 返回完整总结 | ☐ |
| T8 | 自然语言创建任务 | `vibe.create_task_from_nl` 解析并创建任务 | ☐ |
| T9 | 审计日志记录 | 所有工具调用记录到 MCPAuditLog | ☐ |

#### 事件订阅验收

| # | 测试项 | 验收标准 | 通过 |
|---|--------|---------|------|
| E1 | 创建订阅 | 成功创建事件订阅 | ☐ |
| E2 | 任务状态变更事件 | 任务状态变更时发布 `task.status_changed` | ☐ |
| E3 | 番茄钟生命周期事件 | 番茄钟操作时发布相应事件 | ☐ |
| E4 | 事件历史查询 | 能查询最近 24 小时事件 | ☐ |
| E5 | 事件发布延迟 | 事件发布 < 100ms | ☐ |

#### 智能服务验收

| # | 测试项 | 验收标准 | 通过 |
|---|--------|---------|------|
| S1 | 任务建议 | 完成番茄钟后 3 秒内返回下一个任务建议 | ☐ |
| S2 | 任务分解 | 描述 > 100 字符的任务提供分解建议 | ☐ |
| S3 | 阻塞检测 | 同一任务 2+ 番茄钟无进度时提示阻塞 | ☐ |
| S4 | 生产力评分 | 评分在 0-100 范围内 | ☐ |
| S5 | 趋势检测 | 返回 improving/declining/stable | ☐ |

#### 数据隔离验收

| # | 测试项 | 验收标准 | 通过 |
|---|--------|---------|------|
| D1 | 资源数据隔离 | 用户 A 无法访问用户 B 的资源 | ☐ |
| D2 | 工具操作隔离 | 用户 A 无法操作用户 B 的任务 | ☐ |
| D3 | 事件隔离 | 用户 A 无法查看用户 B 的事件 | ☐ |

### 5.3 集成测试场景

#### 场景 1: AI 编程助手集成

1. 在 Cursor 中配置 VibeFlow MCP
2. 创建一个任务并开始番茄钟
3. 验证 AI 能获取当前任务上下文
4. 验证 AI 能完成任务并记录总结

#### 场景 2: 每日规划

1. 进入 Airlock 阶段
2. 调用 `vibe.generate_daily_summary` 获取昨日总结
3. 验证返回的建议任务列表
4. 验证工作量警告（如果超出日常容量）

#### 场景 3: 自然语言任务创建

1. 调用 `vibe.create_task_from_nl` 传入 "明天完成 API 重构，优先级高"
2. 验证解析结果：标题、优先级 P1、计划日期为明天
3. 确认创建后任务存在于数据库

---

## 六、文件位置参考

| 功能 | 文件路径 |
|------|---------|
| MCP 服务器入口 | `src/mcp/server.ts` |
| MCP 运行脚本 | `src/mcp/run.ts` |
| MCP 资源定义 | `src/mcp/resources.ts` |
| MCP 工具定义 | `src/mcp/tools.ts` |
| MCP 认证 | `src/mcp/auth.ts` |
| 智能建议服务 | `src/services/smart-suggestion.service.ts` |
| 任务分解服务 | `src/services/task-decomposer.service.ts` |
| 阻塞解决服务 | `src/services/blocker-resolver.service.ts` |
| 进度分析服务 | `src/services/progress-analyzer.service.ts` |
| 上下文提供服务 | `src/services/context-provider.service.ts` |
| 自然语言解析服务 | `src/services/nl-parser.service.ts` |
| 事件订阅服务 | `src/services/mcp-event.service.ts` |
| 审计日志服务 | `src/services/mcp-audit.service.ts` |
| E2E 测试 - Resources | `e2e/tests/mcp-ai-native-resources.spec.ts` |
| E2E 测试 - Tools | `e2e/tests/mcp-ai-native-tools.spec.ts` |
| E2E 测试 - Events | `e2e/tests/mcp-ai-native-events.spec.ts` |
| 属性测试 - MCP Tools | `tests/property/mcp-tools.property.ts` |
| 属性测试 - MCP Resources | `tests/property/mcp-resources.property.ts` |

---

## 七、典型使用场景示例

### 场景 1: Cursor 中编程时的上下文感知

```
AI: 我看到你正在处理 "实现用户认证模块" 任务，
    已经进行了 2 个番茄钟（50分钟），预估还需要 1 个番茄钟。
    
    当前系统状态: FOCUS
    剩余番茄钟时间: 12分钟
    
    需要我帮你：
    1. 记录当前进度？
    2. 添加发现的子任务？
    3. 报告遇到的阻塞？
```

### 场景 2: 智能每日规划

```
AI: 早上好！基于你的历史数据分析：

    📊 你的最佳工作时段是上午 9-12 点
    📈 过去 7 天平均完成 6.5 个番茄钟
    ⚠️ "API 重构" 项目进度落后 20%
    
    建议今日 Top 3:
    1. [P1] 完成 API 认证接口 (预估 2 番茄钟)
    2. [P1] 修复登录 Bug (预估 1 番茄钟)  
    3. [P2] 编写单元测试 (预估 2 番茄钟)
    
    是否采纳这个计划？
```

### 场景 3: 自然语言任务创建

```
用户: "明天需要重构这个函数，优先级高"

AI: 已创建任务：
    📝 重构 [函数名]
    📅 计划日期: 明天
    🔴 优先级: P1
    📁 项目: [当前项目]
    
    已添加到你的任务列表。
```

### 场景 4: 自动工作日报

```
AI: 📊 今日工作总结

    ✅ 完成任务: 3 个
    - 实现用户认证模块 (2 番茄钟)
    - 修复登录 Bug (1 番茄钟)
    - 代码审查 (1 番茄钟)
    
    🍅 番茄钟: 5/8 (62.5%)
    ⏱️ 专注时间: 2 小时 5 分钟
    📈 效率评分: 85%
    
    💡 明日建议:
    - 继续 API 重构项目 (落后 20%)
    - 完成单元测试编写
```
