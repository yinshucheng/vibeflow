# Requirements Document

## Introduction

本文档定义了 VibeFlow AI-Native 增强功能的需求，旨在将 VibeFlow 从一个传统的生产力工具转变为一个 AI 原生应用。通过深度集成 AI 能力，系统将能够主动理解用户意图、提供智能建议、自动化重复性工作，并与外部 AI Agent（如 Cursor、Claude Code）无缝协作。

---

## 现有 MCP 能力梳理

### 已实现的 Resources（只读数据）

| Resource URI | 描述 | 数据内容 |
|-------------|------|---------|
| `vibe://context/current` | 当前工作上下文 | 活跃项目、当前任务、系统状态、Pomodoro剩余时间 |
| `vibe://user/goals` | 用户目标 | 长期目标、短期目标及其关联项目数 |
| `vibe://user/principles` | 用户编码原则 | 编码标准、偏好设置 |
| `vibe://projects/active` | 活跃项目列表 | 项目详情、任务数、关联目标 |
| `vibe://tasks/today` | 今日任务 | Top 3 任务、其他计划任务 |

### 已实现的 Tools（可执行操作）

| Tool Name | 描述 | 参数 |
|-----------|------|------|
| `vibe.complete_task` | 完成任务 | task_id, summary |
| `vibe.add_subtask` | 添加子任务 | parent_id, title, priority |
| `vibe.report_blocker` | 报告阻塞 | task_id, error_log |
| `vibe.start_pomodoro` | 开始番茄钟 | task_id, duration |
| `vibe.get_task_context` | 获取任务上下文 | task_id |

### 可扩展暴露的服务能力

基于现有服务层，以下能力可以暴露给 MCP：

#### 任务管理 (taskService)
- 创建任务、更新任务、删除任务
- 获取项目任务、获取今日任务、获取积压任务
- 任务重排序、设置计划日期
- 获取任务时间估算（预估 vs 实际）

#### 项目管理 (projectService)
- 创建/更新/归档项目
- 获取项目估算（总预估时间、完成进度）

#### 目标管理 (goalService)
- 创建/更新/归档目标
- 关联/取消关联项目
- 获取目标进度

#### 番茄钟管理 (pomodoroService)
- 开始/完成/中止/中断番茄钟
- 获取今日完成数、检查每日上限

#### 每日状态 (dailyStateService)
- 获取/更新系统状态
- 完成 Airlock、获取 Top 3 任务
- 检查/覆盖每日上限

#### 统计分析 (statsService, efficiencyAnalysisService)
- 多维度统计（按项目/任务/日期）
- 效率分析（时段效率、热力图）
- 目标达成率、建议目标

#### 进度预测 (progressCalculationService)
- 当前状态（时间上下文、预期状态）
- 每日进度（完成率、压力等级）
- 任务建议、目标风险评估

#### 专注会话 (focusSessionService)
- 开始/结束/延长专注会话

#### 睡眠时间 (sleepTimeService)
- 获取/更新睡眠配置
- 检查是否在睡眠时间

#### 活动日志 (activityLogService)
- 记录活动日志（来源：浏览器扩展、桌面客户端、MCP Agent）
- 获取活动摘要（生产性/中性/分心时间分布）
- 获取今日活动摘要
- 获取访问最多的网站

#### 时间线 (timelineService)
- 获取每日时间线事件
- 获取时间线摘要（追踪时间、间隙时间）
- 获取合并时间线（番茄钟 + 其他事件）

#### 每日回顾 (reviewService)
- 获取每日回顾数据（预期 vs 实际）
- 获取周趋势数据
- 计算达成率

#### 预警服务 (earlyWarningService)
- 检查进度是否落后
- 生成预警通知
- 获取/更新预警配置

#### 娱乐模式 (entertainmentService)
- 获取娱乐状态（配额、冷却时间）
- 开始/停止娱乐模式
- 获取娱乐历史

---

## 可补充的 AI 增强能力

### 1. 智能上下文理解
- **代码上下文关联**: 将当前编辑的代码文件与任务关联
- **Git 提交关联**: 自动将 Git 提交与任务/番茄钟关联
- **工作区感知**: 理解用户当前工作的项目和文件

### 2. 智能建议引擎
- **任务优先级建议**: 基于截止日期、依赖关系、历史数据
- **时间估算建议**: 基于历史相似任务的实际耗时
- **休息提醒**: 基于专注时长和效率曲线

### 3. 自动化能力
- **自动任务创建**: 从代码注释（TODO/FIXME）自动创建任务
- **自动进度更新**: 基于 Git 提交自动更新任务进度
- **自动日报生成**: 每日工作总结自动生成

### 4. 协作增强
- **多 Agent 协调**: 支持多个 AI Agent 同时工作
- **上下文共享**: Agent 之间共享工作上下文
- **冲突检测**: 检测多个 Agent 的操作冲突

---

## 最终实现效果

### 场景 1: AI 编程助手深度集成

**用户在 Cursor/Claude Code 中编程时：**

```
AI Agent: 我看到你正在处理 "实现用户认证模块" 任务，
         已经进行了 2 个番茄钟（50分钟），预估还需要 1 个番茄钟。
         
         当前系统状态: FOCUS
         剩余番茄钟时间: 12分钟
         
         需要我帮你：
         1. 记录当前进度？
         2. 添加发现的子任务？
         3. 报告遇到的阻塞？
```

### 场景 2: 智能每日规划

**用户进入 Airlock 阶段时：**

```
AI Agent: 早上好！基于你的历史数据分析：

         📊 你的最佳工作时段是上午 9-12 点
         📈 过去 7 天平均完成 6.5 个番茄钟
         ⚠️ "API 重构" 项目进度落后 20%
         
         建议今日 Top 3:
         1. [P1] 完成 API 认证接口 (预估 2 番茄钟)
         2. [P1] 修复登录 Bug (预估 1 番茄钟)  
         3. [P2] 编写单元测试 (预估 2 番茄钟)
         
         是否采纳这个计划？
```

### 场景 3: 实时进度监控

**AI Agent 持续监控工作状态：**

```
AI Agent: ⚡ 进度提醒
         
         当前: 已完成 3/8 番茄钟 (37.5%)
         剩余工作时间: 4 小时
         压力等级: 中等 🟡
         
         按当前节奏，你可以完成 6 个番茄钟。
         建议: 减少休息间隔或调整今日目标到 6 个。
```

### 场景 4: 阻塞智能处理

**当用户在同一任务上卡住时：**

```
AI Agent: 我注意到你在 "数据库迁移" 任务上已经花了 3 个番茄钟，
         但任务状态仍未更新。
         
         可能的阻塞原因：
         - 技术难题？
         - 依赖其他人？
         - 需求不清晰？
         
         需要我帮你：
         1. 记录这个阻塞？
         2. 将任务拆分为更小的子任务？
         3. 暂时跳过，先处理其他任务？
```

### 场景 5: 自然语言任务创建

**用户在编程时发现新任务：**

```
用户: "明天需要重构这个函数，优先级高"

AI Agent: 已创建任务：
         📝 重构 [函数名]
         📅 计划日期: 明天
         🔴 优先级: P1
         📁 项目: [当前项目]
         
         已添加到你的任务列表。
```

### 场景 6: 自动工作日报

**每日工作结束时：**

```
AI Agent: 📊 今日工作总结

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

### 场景 7: Git 提交关联

**用户提交代码时：**

```
AI Agent: 检测到 Git 提交: "feat: add user authentication"
         
         已自动关联到任务: "实现用户认证模块"
         任务进度更新: 60% → 80%
         
         是否将此任务标记为完成？
```

### 场景 8: 多 Agent 协作

**多个 AI Agent 同时工作时：**

```
Cursor Agent: 正在处理 "实现登录接口" 任务
Claude Agent: 正在处理 "编写登录测试" 任务

VibeFlow: 检测到任务依赖关系
          "编写登录测试" 依赖 "实现登录接口"
          
          建议: Claude Agent 等待 Cursor Agent 完成后再开始
```

---

## Glossary

- **AI_Agent**: 外部 AI 助手，如 Cursor、Claude Code，通过 MCP 协议与 VibeFlow 交互
- **MCP_Server**: Model Context Protocol 服务器，暴露 VibeFlow 能力给外部 AI Agent
- **Smart_Suggestion_Engine**: 智能建议引擎，基于用户行为和上下文生成建议
- **Context_Provider**: 上下文提供器，为 AI Agent 提供丰富的工作上下文
- **Proactive_Assistant**: 主动助手，在适当时机主动提供帮助
- **Task_Decomposer**: 任务分解器，将大任务自动分解为可执行的子任务
- **Progress_Analyzer**: 进度分析器，分析用户工作进度并提供洞察
- **Blocker_Resolver**: 阻塞解决器，帮助识别和解决工作中的阻塞问题

## Requirements

### Requirement 1: 增强的 MCP 资源暴露

**User Story:** As an AI_Agent, I want to access comprehensive user context, so that I can provide more relevant and personalized assistance.

#### Acceptance Criteria

1.1. THE MCP_Server SHALL expose a `vibe://context/workspace` resource containing current workspace files, recent changes, and active branches
1.2. THE MCP_Server SHALL expose a `vibe://history/pomodoros` resource containing the last 7 days of Pomodoro session history with task associations
1.3. THE MCP_Server SHALL expose a `vibe://analytics/productivity` resource containing productivity metrics and patterns
1.4. THE MCP_Server SHALL expose a `vibe://blockers/active` resource containing currently reported blockers and their status
1.5. WHEN an AI_Agent requests context, THE MCP_Server SHALL return data within 500ms for optimal responsiveness

### Requirement 2: 智能任务分解

**User Story:** As a developer, I want AI to help break down complex tasks into manageable subtasks, so that I can better plan and execute my work.

#### Acceptance Criteria

2.1. WHEN a user creates a task with description longer than 100 characters, THE Task_Decomposer SHALL offer to suggest subtask breakdown
2.2. WHEN the Task_Decomposer analyzes a task, THE Task_Decomposer SHALL generate 2-5 actionable subtasks based on the task description
2.3. THE Task_Decomposer SHALL estimate time for each suggested subtask based on historical data
2.4. WHEN a user accepts suggested subtasks, THE System SHALL create the subtasks with appropriate priorities and link them to the parent task
2.5. THE Task_Decomposer SHALL learn from user acceptance/rejection patterns to improve future suggestions

### Requirement 3: 主动工作建议

**User Story:** As a developer, I want the system to proactively suggest what to work on next, so that I can maintain focus and momentum.

#### Acceptance Criteria

3.1. WHEN a user completes a Pomodoro session, THE Smart_Suggestion_Engine SHALL suggest the next task to work on within 3 seconds
3.2. WHEN making suggestions, THE Smart_Suggestion_Engine SHALL consider task priority, deadline proximity, and goal alignment
3.3. WHEN a user has been idle for more than 5 minutes during work hours, THE Proactive_Assistant SHALL gently prompt with task suggestions
3.4. THE System SHALL display suggestions in a non-intrusive manner that does not disrupt flow state
3.5. WHEN a user dismisses a suggestion, THE System SHALL learn from this feedback to improve future suggestions

### Requirement 4: AI Agent 协作工具

**User Story:** As an AI_Agent, I want to perform complex operations on behalf of the user, so that I can automate repetitive development tasks.

#### Acceptance Criteria

4.1. THE MCP_Server SHALL expose a `vibe.batch_update_tasks` tool for updating multiple tasks in a single operation
4.2. THE MCP_Server SHALL expose a `vibe.create_project_from_template` tool for scaffolding new projects with predefined structures
4.3. THE MCP_Server SHALL expose a `vibe.analyze_task_dependencies` tool for identifying task dependencies and optimal execution order
4.4. THE MCP_Server SHALL expose a `vibe.generate_daily_summary` tool for creating end-of-day work summaries
4.5. WHEN an AI_Agent calls any tool, THE MCP_Server SHALL log the action for audit and learning purposes

### Requirement 5: 智能阻塞检测与解决

**User Story:** As a developer, I want the system to help identify and resolve blockers, so that I can maintain productivity.

#### Acceptance Criteria

5.1. WHEN a user spends more than 2 Pomodoros on the same task without progress, THE Blocker_Resolver SHALL prompt to identify potential blockers
5.2. WHEN a blocker is reported, THE Blocker_Resolver SHALL categorize it as technical, dependency, unclear requirements, or other category
5.3. WHEN a blocker is categorized, THE Blocker_Resolver SHALL suggest resolution strategies based on blocker category and historical patterns
5.4. WHEN a blocker involves external dependencies, THE System SHALL track the dependency and notify the user when the dependency is resolved
5.5. THE System SHALL maintain a blocker history for pattern analysis and prevention

### Requirement 6: 上下文感知的 AI 提示

**User Story:** As a developer, I want AI agents to understand my full work context, so that they can provide more accurate assistance.

#### Acceptance Criteria

6.1. THE Context_Provider SHALL include current task details, project goals, and coding principles in every AI interaction
6.2. WHEN an AI_Agent requests context, THE Context_Provider SHALL include recent activity log from the last 2 hours
6.3. THE Context_Provider SHALL expose the user's preferred coding standards and conventions
6.4. WHILE a user is in FOCUS state, THE Context_Provider SHALL include Pomodoro timer status and remaining time
6.5. THE Context_Provider SHALL serialize context in structured markdown format optimized for LLM consumption

### Requirement 7: 进度洞察与预测

**User Story:** As a developer, I want to understand my productivity patterns and get predictions, so that I can plan better.

#### Acceptance Criteria

7.1. THE Progress_Analyzer SHALL calculate daily, weekly, and monthly productivity scores based on completed tasks and Pomodoros
7.2. THE Progress_Analyzer SHALL identify peak productivity hours based on historical data
7.3. WHEN a goal deadline approaches, THE Progress_Analyzer SHALL predict completion likelihood based on current velocity
7.4. THE Progress_Analyzer SHALL detect productivity trends as improving, declining, or stable and surface insights
7.5. WHEN productivity drops significantly, THE System SHALL suggest potential causes and remediation strategies

### Requirement 8: 自然语言任务创建

**User Story:** As a developer, I want to create tasks using natural language, so that I can quickly capture ideas without context switching.

#### Acceptance Criteria

8.1. WHEN a user inputs natural language task description, THE System SHALL parse and extract task title, priority, and project association
8.2. WHEN parsing task description, THE System SHALL infer task priority from keywords such as urgent, important, or low priority
8.3. WHEN project context is ambiguous, THE System SHALL prompt the user to select from active projects
8.4. THE System SHALL support date expressions such as "tomorrow", "next week", and "end of sprint" for planDate
8.5. WHEN task details are parsed, THE System SHALL confirm the parsed details before creation and allow the user to modify

### Requirement 9: AI 驱动的每日规划

**User Story:** As a developer, I want AI to help me plan my day during the Airlock phase, so that I can start each day with a clear focus.

#### Acceptance Criteria

9.1. WHEN a user enters the Airlock phase, THE Smart_Suggestion_Engine SHALL suggest Top 3 tasks based on priorities and deadlines
9.2. WHEN suggesting tasks, THE Smart_Suggestion_Engine SHALL explain the reasoning behind each suggestion
9.3. WHEN suggesting tasks, THE Smart_Suggestion_Engine SHALL consider the user's historical productivity patterns for the day of week
9.4. IF suggested workload exceeds typical daily capacity, THEN THE System SHALL warn the user
9.5. WHEN a user modifies the suggested plan, THE System SHALL learn from these adjustments

### Requirement 10: MCP 事件订阅

**User Story:** As an AI_Agent, I want to subscribe to VibeFlow events, so that I can react to changes in real-time.

#### Acceptance Criteria

10.1. THE MCP_Server SHALL support event subscription for task status changes
10.2. THE MCP_Server SHALL support event subscription for Pomodoro lifecycle events including start, pause, complete, and abort
10.3. THE MCP_Server SHALL support event subscription for daily state transitions
10.4. WHEN an event occurs, THE MCP_Server SHALL notify all subscribed AI_Agents within 100ms
10.5. THE MCP_Server SHALL provide event history for the last 24 hours for late-joining agents

