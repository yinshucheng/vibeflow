# Dashboard Command Center — Requirements

## Background

当前 Dashboard 是一个信息展示页面，番茄钟在独立的 `/pomodoro` 页面。用户必须在两个页面间切换才能完成日常工作流。桌面端屏幕空间充足，番茄钟独占一页意义不大。

## Goal

将 Dashboard 改造为"今日指挥部"——一站式完成日常操作：看到正在做什么、今天要做什么、已经做了什么，并可以直接操作番茄钟和任务。

## User Stories

### US-1: 内嵌番茄钟
作为用户，我希望在 Dashboard 上直接启动/查看番茄钟，而不需要跳转到 `/pomodoro` 页面。

**Acceptance Criteria:**
- AC-1.1: Dashboard 顶部显示内嵌番茄钟区域
- AC-1.2: 空闲态：显示"开始番茄"按钮 + 任务选择器
- AC-1.3: 专注态：显示当前任务名 + 紧凑计时器（小型，非大圆圈）+ 剩余时间 + 中止按钮
- AC-1.4: 番茄完成/休息流程的模态框在 Dashboard 上也能正常弹出
- AC-1.5: `/pomodoro` 页面保持不变，作为全屏专注模式的备选入口

### US-2: 今日任务列表增强
作为用户，我希望在 Dashboard 上能快速操作任务（完成/删除），而不只是查看。

**Acceptance Criteria:**
- AC-2.1: 每个任务行可一键标记完成（点击 checkbox）
- AC-2.2: 每个任务行有删除操作（hover 显示删除图标，需确认）
- AC-2.3: 已完成的任务自动排到列表底部
- AC-2.4: 未完成的任务按优先级排序（P1 > P2 > P3）
- AC-2.5: 取消 `slice(0, 5)` 限制，显示所有今日任务（或合理的上限如 20）
- AC-2.6: 保留 "View all" 链接跳转到完整任务页面

### US-3: 今日视图统一
作为用户，我希望 Dashboard 能一眼看到今天的全貌——正在做什么、要做什么、已经做了什么。

**Acceptance Criteria:**
- AC-3.1: Dashboard 布局重构为清晰的分区：专注区（番茄钟）→ 今日任务区 → 进度/概览区
- AC-3.2: 番茄进度（x/8）内嵌在专注区，而非独立卡片
- AC-3.3: Top 3 任务（如已设置）以醒目样式显示在任务列表顶部
- AC-3.4: 移除或降级低价值卡片："Active Projects"（改为任务的项目上下文标签）
- AC-3.5: "Goal Risk Suggestions" 和 "Task Suggestions" 缩到辅助区域

### US-4: 任务行展示改版
作为用户，我希望任务以信息密度更高的横条形式展示，一行看到所有关键信息。

**Acceptance Criteria:**
- AC-4.1: 任务行为全宽横条，一行展示：checkbox + 标题 + 优先级 + 项目名 + 预估时间 + 计划日期 + 番茄按钮
- AC-4.2: 替代现有 TaskTree 的卡片/紧凑样式，全局统一（Dashboard 和 `/tasks` 页面共用）
- AC-4.3: hover 时显示操作按钮（删除、编辑）
- AC-4.4: 子任务仍可展开/折叠，缩进显示

### US-5: 任务详情右侧栏
作为用户，我希望点击任务后右侧弹出详情面板，无需离开当前列表页面。

**Acceptance Criteria:**
- AC-5.1: 点击任务行打开右侧滑出面板（slide-over panel），不跳转页面
- AC-5.2: 面板展示完整任务详情：标题、描述、状态、优先级、项目、计划日期、预估时间、实际时间、子任务列表
- AC-5.3: 面板内可直接编辑状态（TODO/IN_PROGRESS/DONE）、删除任务
- AC-5.4: 面板外点击或按 Esc 关闭面板
- AC-5.5: `/tasks/[id]` 独立页面保留，作为直链入口（如从其他地方链入）
- AC-5.6: Dashboard 和 `/tasks` 页面都使用此右侧栏

## Non-Goals (This Phase)

- 不改动侧边栏导航（Stats/Timeline/Airlock 保持现状）
- 不删除 `/pomodoro` 独立页面
- 不改动 Airlock 流程
- 不增加新的后端 API（复用现有 tRPC endpoints，除了 getTodayTasksAll）
- 不做移动端适配优化（专注桌面体验）
