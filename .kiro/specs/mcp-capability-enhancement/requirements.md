# MCP Capability Enhancement - Requirements Document

## Introduction

本文档定义了 VibeFlow MCP 能力扩展的需求。当前 MCP 能力不足以支撑 AI Agent 进行完整的任务管理和梳理工作，需要系统性地扩展 MCP 的 Resources 和 Tools。

---

## 现有 MCP 能力梳理

### 已实现的 Resources（11 个）

| Resource URI | 描述 | 数据内容 |
|-------------|------|---------|
| `vibe://context/current` | 当前工作上下文 | 活跃项目、当前任务、系统状态、Pomodoro剩余时间 |
| `vibe://user/goals` | 用户目标 | 长期目标、短期目标及其关联项目数 |
| `vibe://user/principles` | 用户编码原则 | 编码标准、偏好设置 |
| `vibe://projects/active` | 活跃项目列表 | 项目详情、任务数、关联目标 |
| `vibe://tasks/today` | 今日任务 | Top 3 任务、其他计划任务 |
| `vibe://context/workspace` | 工作区上下文 | 当前文件、最近变更、活跃分支 |
| `vibe://history/pomodoros` | 番茄钟历史 | 最近7天的番茄钟记录 |
| `vibe://analytics/productivity` | 生产力分析 | 日/周/月评分、高峰时段、趋势 |
| `vibe://blockers/active` | 活跃阻塞 | 当前报告的阻塞及状态 |
| `vibe://pomodoro/current` | 当前番茄钟 | 进行中的番茄钟、任务栈、时间切片 |
| `vibe://pomodoro/summary` | 番茄钟摘要 | 最近完成的番茄钟时间分布 |

### 已实现的 Tools（14 个）

| Tool Name | 描述 | 参数 |
|-----------|------|------|
| `flow_complete_task` | 完成任务 | task_id, summary |
| `flow_add_subtask` | 添加子任务 | parent_id, title, priority |
| `flow_report_blocker` | 报告阻塞 | task_id, error_log |
| `flow_start_pomodoro` | 开始番茄钟 | task_id, duration |
| `flow_get_task_context` | 获取任务上下文 | task_id |
| `flow_batch_update_tasks` | 批量更新任务 | updates[] |
| `flow_create_project_from_template` | 从模板创建项目 | template_id, project_name, goal_id |
| `flow_analyze_task_dependencies` | 分析任务依赖 | project_id |
| `flow_generate_daily_summary` | 生成每日总结 | date |
| `flow_create_task_from_nl` | 自然语言创建任务 | description, project_id, confirm |
| `flow_switch_task` | 切换任务 | pomodoro_id, new_task_id |
| `flow_start_taskless_pomodoro` | 开始无任务番茄钟 | label |
| `flow_quick_create_inbox_task` | 快速创建收件箱任务 | title |
| `flow_complete_current_task` | 完成当前任务 | pomodoro_id, next_task_id |

---

## 能力缺口分析

### 1. 任务管理能力缺口

| 缺失能力 | 影响 | 优先级 |
|---------|------|--------|
| 获取单个任务详情 | 无法查询特定任务的完整信息 | P1 |
| 更新任务属性 | 无法修改任务标题、描述、预估时间 | P1 |
| 删除/归档任务 | 无法清理不需要的任务 | P2 |
| 获取积压任务 | 无法查看未计划的任务 | P1 |
| 获取逾期任务 | 无法识别需要关注的逾期任务 | P1 |
| 移动任务到其他项目 | 无法重新组织任务 | P2 |
| 任务重排序 | 无法调整任务优先顺序 | P2 |
| 设置任务计划日期 | 无法规划任务到具体日期 | P1 |

### 2. 项目管理能力缺口

| 缺失能力 | 影响 | 优先级 |
|---------|------|--------|
| 创建项目 | 无法通过 AI 创建新项目 | P1 |
| 更新项目 | 无法修改项目信息 | P2 |
| 归档项目 | 无法完成项目生命周期 | P2 |
| 获取项目详情 | 无法查询单个项目完整信息 | P1 |
| 获取项目进度 | 无法了解项目完成情况 | P1 |
| 获取所有项目（含归档） | 无法查看历史项目 | P3 |

### 3. 目标管理能力缺口

| 缺失能力 | 影响 | 优先级 |
|---------|------|--------|
| 创建目标 | 无法通过 AI 设定目标 | P2 |
| 更新目标 | 无法修改目标信息 | P2 |
| 关联项目到目标 | 无法建立项目-目标关系 | P2 |
| 获取目标进度 | 无法追踪目标完成情况 | P2 |

### 4. 每日状态管理能力缺口

| 缺失能力 | 影响 | 优先级 |
|---------|------|--------|
| 获取当前系统状态 | 无法了解用户当前工作阶段 | P1 |
| 设置 Top 3 任务 | 无法帮助用户规划每日重点 | P1 |
| 完成 Airlock | 无法帮助用户完成每日规划 | P2 |

### 5. 统计与分析能力缺口

| 缺失能力 | 影响 | 优先级 |
|---------|------|--------|
| 按项目统计 | 无法分析项目级别的工作量 | P2 |
| 按日期范围统计 | 无法分析特定时间段的工作 | P2 |
| 获取时间线 | 无法查看每日工作时间线 | P2 |
| 获取每日回顾数据 | 无法进行每日复盘 | P2 |

### 6. 番茄钟管理能力缺口

| 缺失能力 | 影响 | 优先级 |
|---------|------|--------|
| 暂停番茄钟 | 无法处理临时中断 | P2 |
| 恢复番茄钟 | 无法继续暂停的番茄钟 | P2 |
| 中止番茄钟 | 无法取消进行中的番茄钟 | P1 |
| 获取今日番茄钟统计 | 无法了解今日完成情况 | P1 |

---

## Requirements

### Requirement 1: 任务查询与管理工具

**User Story:** As an AI_Agent, I want to query and manage tasks comprehensively, so that I can help users organize their work effectively.

#### Acceptance Criteria

1.1. THE MCP_Server SHALL expose a `flow_get_task` tool that returns complete task details including subtasks, pomodoro history, and blockers
1.2. THE MCP_Server SHALL expose a `flow_update_task` tool for updating task title, description, priority, estimated minutes, and plan date
1.3. THE MCP_Server SHALL expose a `flow_delete_task` tool for soft-deleting tasks (archive)
1.4. THE MCP_Server SHALL expose a `flow_get_backlog_tasks` tool for retrieving tasks without a plan date
1.5. THE MCP_Server SHALL expose a `flow_get_overdue_tasks` tool for retrieving tasks past their plan date
1.6. THE MCP_Server SHALL expose a `flow_move_task` tool for moving a task to a different project
1.7. THE MCP_Server SHALL expose a `flow_set_plan_date` tool for setting or clearing a task's plan date

### Requirement 2: 项目管理工具

**User Story:** As an AI_Agent, I want to manage projects, so that I can help users organize their work into logical groups.

#### Acceptance Criteria

2.1. THE MCP_Server SHALL expose a `flow_create_project` tool for creating new projects with title, deliverable, and optional goal linkage
2.2. THE MCP_Server SHALL expose a `flow_update_project` tool for updating project title, deliverable, and status
2.3. THE MCP_Server SHALL expose a `flow_archive_project` tool for archiving completed projects
2.4. THE MCP_Server SHALL expose a `flow_get_project` tool for retrieving complete project details including tasks and progress
2.5. THE MCP_Server SHALL expose a `vibe://projects/all` resource containing all projects including archived ones

### Requirement 3: 每日状态管理工具

**User Story:** As an AI_Agent, I want to manage daily state and planning, so that I can help users start each day with clear focus.

#### Acceptance Criteria

3.1. THE MCP_Server SHALL expose a `vibe://state/current` resource containing current daily state (LOCKED/PLANNING/FOCUS/REST)
3.2. THE MCP_Server SHALL expose a `flow_set_top3` tool for setting the day's Top 3 priority tasks
3.3. THE MCP_Server SHALL expose a `flow_get_top3` tool for retrieving the current Top 3 tasks
3.4. THE MCP_Server SHALL expose a `flow_complete_airlock` tool for transitioning from PLANNING to FOCUS state
3.5. THE MCP_Server SHALL expose a `vibe://planning/suggestions` resource containing AI-suggested Top 3 tasks based on priorities and deadlines

### Requirement 4: 番茄钟控制工具

**User Story:** As an AI_Agent, I want to control pomodoro sessions, so that I can help users manage their focus time.

#### Acceptance Criteria

4.1. THE MCP_Server SHALL expose a `flow_pause_pomodoro` tool for pausing an active pomodoro
4.2. THE MCP_Server SHALL expose a `flow_resume_pomodoro` tool for resuming a paused pomodoro
4.3. THE MCP_Server SHALL expose a `flow_abort_pomodoro` tool for canceling an active pomodoro
4.4. THE MCP_Server SHALL expose a `vibe://pomodoro/today` resource containing today's pomodoro count, completed count, and remaining quota

### Requirement 5: 统计与时间线资源

**User Story:** As an AI_Agent, I want to access statistics and timeline data, so that I can provide insights and help users review their work.

#### Acceptance Criteria

5.1. THE MCP_Server SHALL expose a `vibe://stats/project/{id}` resource template for project-level statistics
5.2. THE MCP_Server SHALL expose a `vibe://timeline/today` resource containing today's work timeline with pomodoros and activities
5.3. THE MCP_Server SHALL expose a `vibe://review/daily` resource containing daily review data (expected vs actual)
5.4. THE MCP_Server SHALL expose a `flow_get_stats` tool for retrieving statistics by date range and optional project filter

### Requirement 6: 目标管理工具

**User Story:** As an AI_Agent, I want to manage goals, so that I can help users align their work with long-term objectives.

#### Acceptance Criteria

6.1. THE MCP_Server SHALL expose a `flow_create_goal` tool for creating new goals with title, description, type (LONG_TERM/SHORT_TERM), and target date
6.2. THE MCP_Server SHALL expose a `flow_update_goal` tool for updating goal properties
6.3. THE MCP_Server SHALL expose a `flow_link_project_to_goal` tool for associating projects with goals
6.4. THE MCP_Server SHALL expose a `vibe://goals/progress` resource containing goal progress with linked project completion rates

### Requirement 7: 任务搜索与过滤

**User Story:** As an AI_Agent, I want to search and filter tasks, so that I can quickly find relevant tasks for the user.

#### Acceptance Criteria

7.1. THE MCP_Server SHALL expose a `flow_search_tasks` tool for searching tasks by keyword in title and description
7.2. THE MCP_Server SHALL expose a `flow_filter_tasks` tool for filtering tasks by status, priority, project, and date range
7.3. THE MCP_Server SHALL expose a `vibe://tasks/recent` resource containing recently modified tasks (last 24 hours)
7.4. WHEN searching tasks, THE tool SHALL return results sorted by relevance and recency

### Requirement 8: 阻塞管理增强

**User Story:** As an AI_Agent, I want to manage blockers comprehensively, so that I can help users track and resolve impediments.

#### Acceptance Criteria

8.1. THE MCP_Server SHALL expose a `flow_resolve_blocker` tool for marking a blocker as resolved with resolution notes
8.2. THE MCP_Server SHALL expose a `flow_get_blocker_history` tool for retrieving blocker history for a task or project
8.3. THE MCP_Server SHALL expose a `vibe://blockers/summary` resource containing blocker statistics by category and resolution time

### Requirement 9: 批量操作增强

**User Story:** As an AI_Agent, I want to perform batch operations efficiently, so that I can help users reorganize their work quickly.

#### Acceptance Criteria

9.1. THE MCP_Server SHALL expose a `flow_batch_move_tasks` tool for moving multiple tasks to a different project
9.2. THE MCP_Server SHALL expose a `flow_batch_set_plan_date` tool for setting plan dates for multiple tasks
9.3. THE MCP_Server SHALL expose a `flow_batch_archive_tasks` tool for archiving multiple completed tasks
9.4. WHEN performing batch operations, THE tool SHALL return a summary of successful and failed operations

### Requirement 10: 用户设置访问

**User Story:** As an AI_Agent, I want to access user settings, so that I can provide personalized assistance.

#### Acceptance Criteria

10.1. THE MCP_Server SHALL expose a `vibe://settings/pomodoro` resource containing pomodoro duration, break duration, and daily cap settings
10.2. THE MCP_Server SHALL expose a `vibe://settings/work-hours` resource containing work start time, end time, and sleep schedule
10.3. THE MCP_Server SHALL expose a `vibe://settings/preferences` resource containing notification preferences and UI settings

---

## 实现优先级

### Phase 1: 核心任务管理（P1）
- Requirement 1.1-1.5: 任务查询与基础管理
- Requirement 3.1-3.3: 每日状态与 Top 3
- Requirement 4.3-4.4: 番茄钟中止与统计

### Phase 2: 项目与规划（P1-P2）
- Requirement 2.1-2.4: 项目管理
- Requirement 3.4-3.5: Airlock 与规划建议
- Requirement 7.1-7.3: 任务搜索与过滤

### Phase 3: 分析与洞察（P2）
- Requirement 5.1-5.4: 统计与时间线
- Requirement 6.1-6.4: 目标管理
- Requirement 8.1-8.3: 阻塞管理增强

### Phase 4: 高级功能（P2-P3）
- Requirement 1.6-1.7: 任务移动与重排序
- Requirement 4.1-4.2: 番茄钟暂停/恢复
- Requirement 9.1-9.4: 批量操作
- Requirement 10.1-10.3: 用户设置

---

## Glossary

- **MCP_Server**: Model Context Protocol 服务器，暴露 VibeFlow 能力给外部 AI Agent
- **Resource**: MCP 只读资源，通过 URI 访问
- **Tool**: MCP 可执行工具，可修改系统状态
- **Top_3**: 每日最重要的三个任务
- **Airlock**: 每日规划阶段，用户选择 Top 3 任务
- **Backlog**: 未设置计划日期的任务积压
- **Daily_State**: 系统每日状态机 (LOCKED → PLANNING → FOCUS → REST)
