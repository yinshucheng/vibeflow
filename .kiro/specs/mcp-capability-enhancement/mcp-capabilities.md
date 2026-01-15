# VibeFlow MCP 能力清单

> 最后更新: 2026-01-14

## 概述

VibeFlow MCP Server 为外部 AI Agent（如 Claude Code、Cursor）提供完整的任务管理和生产力追踪能力。

- **Tools (可执行操作)**: 27 个
- **Resources (只读资源)**: 14 个

---

## Tools 清单 (27个)

### 任务管理 (12个)

| Tool | 描述 | 参数 |
|------|------|------|
| `flow_complete_task` | 完成任务 | task_id, summary |
| `flow_add_subtask` | 添加子任务 | parent_id, title, priority? |
| `flow_get_task` | 获取任务详情 | task_id |
| `flow_update_task` | 更新任务属性 | task_id, title?, description?, priority?, estimated_minutes?, plan_date? |
| `flow_delete_task` | 删除/归档任务 | task_id, archive? |
| `flow_get_backlog_tasks` | 获取积压任务 | project_id?, limit? |
| `flow_get_overdue_tasks` | 获取逾期任务 | project_id?, include_today? |
| `flow_move_task` | 移动任务到其他项目 | task_id, target_project_id |
| `flow_set_plan_date` | 设置任务计划日期 | task_id, plan_date |
| `flow_get_task_context` | 获取任务上下文 | task_id |
| `flow_batch_update_tasks` | 批量更新任务 | updates[] |
| `flow_quick_create_inbox_task` | 快速创建收件箱任务 | title |

### 项目管理 (4个)

| Tool | 描述 | 参数 |
|------|------|------|
| `flow_create_project` | 创建项目 | title, deliverable, goal_id? |
| `flow_update_project` | 更新项目 | project_id, title?, deliverable?, status? |
| `flow_get_project` | 获取项目详情 | project_id, include_tasks? |
| `flow_create_project_from_template` | 从模板创建项目 | template_id, project_name, goal_id? |

### 番茄钟管理 (6个)

| Tool | 描述 | 参数 |
|------|------|------|
| `flow_start_pomodoro` | 开始番茄钟 | task_id, duration? |
| `flow_start_taskless_pomodoro` | 开始无任务番茄钟 | label? |
| `flow_switch_task` | 切换任务 | pomodoro_id, new_task_id |
| `flow_complete_current_task` | 完成当前任务 | pomodoro_id, next_task_id? |
| `flow_record_pomodoro` | 补录番茄钟 | task_id?, duration, completed_at, summary? |
| `flow_report_blocker` | 报告阻塞 | task_id, error_log |

### 每日状态 (2个)

| Tool | 描述 | 参数 |
|------|------|------|
| `flow_get_top3` | 获取 Top 3 任务 | (无) |
| `flow_set_top3` | 设置 Top 3 任务 | task_ids[] |

### AI 增强 (3个)

| Tool | 描述 | 参数 |
|------|------|------|
| `flow_create_task_from_nl` | 自然语言创建任务 | description, project_id?, confirm? |
| `flow_analyze_task_dependencies` | 分析任务依赖 | project_id |
| `flow_generate_daily_summary` | 生成每日总结 | date? |

---

## Resources 清单 (14个)

### 上下文资源 (3个)

| URI | 描述 | 数据内容 |
|-----|------|---------|
| `vibe://context/current` | 当前工作上下文 | 活跃项目、当前任务、系统状态、番茄钟剩余时间 |
| `vibe://context/workspace` | 工作区上下文 | 当前文件、最近变更、活跃分支 |
| `vibe://state/current` | 当前系统状态 | 状态(LOCKED/PLANNING/FOCUS/REST)、今日统计 |

### 任务资源 (1个)

| URI | 描述 | 数据内容 |
|-----|------|---------|
| `vibe://tasks/today` | 今日任务 | Top 3 任务、其他计划任务 |

### 项目资源 (2个)

| URI | 描述 | 数据内容 |
|-----|------|---------|
| `vibe://projects/active` | 活跃项目列表 | 项目详情、任务数、关联目标 |
| `vibe://projects/all` | 所有项目列表 | 包含归档项目 |

### 用户资源 (2个)

| URI | 描述 | 数据内容 |
|-----|------|---------|
| `vibe://user/goals` | 用户目标 | 长期目标、短期目标及关联项目数 |
| `vibe://user/principles` | 用户编码原则 | 编码标准、偏好设置 |

### 番茄钟资源 (3个)

| URI | 描述 | 数据内容 |
|-----|------|---------|
| `vibe://pomodoro/current` | 当前番茄钟 | 进行中的番茄钟、任务栈、时间切片 |
| `vibe://pomodoro/summary` | 番茄钟摘要 | 最近完成的番茄钟时间分布 |
| `vibe://history/pomodoros` | 番茄钟历史 | 最近7天的番茄钟记录 |

### 分析资源 (2个)

| URI | 描述 | 数据内容 |
|-----|------|---------|
| `vibe://analytics/productivity` | 生产力分析 | 日/周/月评分、高峰时段、趋势 |
| `vibe://timeline/today` | 今日时间线 | 番茄钟、任务完成、休息事件 |

### 阻塞资源 (1个)

| URI | 描述 | 数据内容 |
|-----|------|---------|
| `vibe://blockers/active` | 活跃阻塞 | 当前报告的阻塞及状态 |

---

## 能力缺口分析 (Phase 2+)

### 待实现能力

| 类别 | 能力 | 优先级 | 说明 |
|------|------|--------|------|
| 番茄钟 | `flow_pause_pomodoro` | P2 | 暂停番茄钟 |
| 番茄钟 | `flow_resume_pomodoro` | P2 | 恢复番茄钟 |
| 番茄钟 | `flow_abort_pomodoro` | P2 | 中止番茄钟 |
| 每日状态 | `flow_complete_airlock` | P2 | 完成 Airlock 进入 FOCUS |
| 规划 | `vibe://planning/suggestions` | P2 | AI 建议的 Top 3 任务 |
| 目标 | `flow_create_goal` | P3 | 创建目标 |
| 目标 | `flow_update_goal` | P3 | 更新目标 |
| 目标 | `flow_link_project_to_goal` | P3 | 关联项目到目标 |
| 目标 | `vibe://goals/progress` | P3 | 目标进度 |
| 搜索 | `flow_search_tasks` | P3 | 搜索任务 |
| 搜索 | `flow_filter_tasks` | P3 | 过滤任务 |
| 阻塞 | `flow_resolve_blocker` | P3 | 解决阻塞 |
| 批量 | `flow_batch_move_tasks` | P3 | 批量移动任务 |
| 批量 | `flow_batch_set_plan_date` | P3 | 批量设置计划日期 |
| 设置 | `vibe://settings/pomodoro` | P3 | 番茄钟设置 |
| 设置 | `vibe://settings/work-hours` | P3 | 工作时间设置 |

---

## 使用示例

### 1. 获取今日任务并开始工作

```
1. 读取 vibe://tasks/today 获取今日任务
2. 读取 vibe://state/current 确认系统状态
3. 调用 flow_start_pomodoro 开始番茄钟
```

### 2. 整理积压任务

```
1. 调用 flow_get_backlog_tasks 获取积压任务
2. 调用 flow_batch_update_tasks 批量设置优先级
3. 调用 flow_set_plan_date 设置计划日期
```

### 3. 每日回顾

```
1. 调用 flow_generate_daily_summary 生成总结
2. 读取 vibe://timeline/today 查看时间线
3. 读取 vibe://analytics/productivity 查看效率分析
```

### 4. 创建新项目

```
1. 调用 flow_create_project 创建项目
2. 调用 flow_create_task_from_nl 用自然语言创建任务
3. 调用 flow_set_top3 设置今日重点
```
