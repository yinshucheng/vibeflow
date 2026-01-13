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
| 移动任务到其他项目 | 无法重新组织任务 | P1 |
| 设置任务计划日期 | 无法规划任务到具体日期 | P1 |

### 2. 项目管理能力缺口

| 缺失能力 | 影响 | 优先级 |
|---------|------|--------|
| 创建项目 | 无法通过 AI 创建新项目 | P1 |
| 更新项目 | 无法修改项目信息 | P1 |
| 获取项目详情 | 无法查询单个项目完整信息 | P1 |
| 获取所有项目（含归档） | 无法查看历史项目 | P2 |

### 3. 每日状态管理能力缺口

| 缺失能力 | 影响 | 优先级 |
|---------|------|--------|
| 获取当前系统状态 | 无法了解用户当前工作阶段 | P1 |
| 设置 Top 3 任务 | 无法帮助用户规划每日重点 | P1 |
| 获取 Top 3 任务 | 无法查询当前每日重点 | P1 |

### 4. 时间线能力缺口

| 缺失能力 | 影响 | 优先级 |
|---------|------|--------|
| 获取今日时间线 | 无法查看每日工作时间线 | P1 |

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
2.3. THE MCP_Server SHALL expose a `flow_get_project` tool for retrieving complete project details including tasks and progress
2.4. THE MCP_Server SHALL expose a `vibe://projects/all` resource containing all projects including archived ones

### Requirement 3: 每日状态管理工具

**User Story:** As an AI_Agent, I want to manage daily state and planning, so that I can help users start each day with clear focus.

#### Acceptance Criteria

3.1. THE MCP_Server SHALL expose a `vibe://state/current` resource containing current daily state (LOCKED/PLANNING/FOCUS/REST)
3.2. THE MCP_Server SHALL expose a `flow_set_top3` tool for setting the day's Top 3 priority tasks
3.3. THE MCP_Server SHALL expose a `flow_get_top3` tool for retrieving the current Top 3 tasks

### Requirement 4: 时间线资源

**User Story:** As an AI_Agent, I want to access timeline data, so that I can help users review their daily work.

#### Acceptance Criteria

4.1. THE MCP_Server SHALL expose a `vibe://timeline/today` resource containing today's work timeline with pomodoros and activities

---

## 实现优先级

### Phase 1: 核心能力（本次实现）

- Requirement 1: 任务查询与管理（7 个 Tools）
- Requirement 2: 项目管理（3 个 Tools + 1 个 Resource）
- Requirement 3: 每日状态（2 个 Tools + 1 个 Resource）
- Requirement 4: 时间线（1 个 Resource）

### Phase 2+: 延后需求

- 番茄钟控制（pause/resume/abort）
- Airlock 完成（flow_complete_airlock）
- 规划建议（vibe://planning/suggestions）
- 目标管理（create/update/link goal）
- 任务搜索与过滤
- 阻塞管理增强
- 批量操作增强
- 用户设置访问

---

## Glossary

- **MCP_Server**: Model Context Protocol 服务器，暴露 VibeFlow 能力给外部 AI Agent
- **Resource**: MCP 只读资源，通过 URI 访问
- **Tool**: MCP 可执行工具，可修改系统状态
- **Top_3**: 每日最重要的三个任务
- **Backlog**: 未设置计划日期的任务积压
- **Daily_State**: 系统每日状态机 (LOCKED → PLANNING → FOCUS → REST)
