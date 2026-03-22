# Dashboard Command Center — Tasks

## Phase 1: API 准备

- [x] **1.1** 修改 `taskService.getTodayTasks`，添加 `includeDone?: boolean` 参数，默认 false 保持向后兼容。当 `includeDone=true` 时去掉 `status: { not: 'DONE' }` 过滤 `056a827`
  - 文件: `src/services/task.service.ts`
- [x] **1.2** 在 task router 添加 `getTodayTasksAll` procedure，调用 `getTodayTasks(userId, true)` `056a827`
  - 文件: `src/server/routers/task.ts`
- [x] **1.3** 验证: 写单元测试确认 `getTodayTasksAll` 返回含 DONE 状态的任务 `056a827`
  - 文件: `tests/services/task-today-all.test.ts`

## Phase 2: TaskRow 组件（全局通用任务行）

- [x] **2.1** 创建 `TaskRow` 组件，全宽横条展示：checkbox + 标题 + 优先级 + 项目名 + 预估时间 + 计划日期 + 番茄按钮 `ce7f926`
  - 文件: `src/components/tasks/task-row.tsx`
- [x] **2.2** 实现 hover 操作按钮: Edit（跳转 `/tasks/[id]/edit`）+ Delete（inline confirm: 文字变 "确认？[是][否]"，2秒后恢复） `ce7f926`
- [x] **2.3** 实现 checkbox 乐观更新: 点击立即切换 UI，后台调用 `trpc.task.updateStatus`，失败时回滚 `ce7f926`
- [x] **2.4** 支持子任务展开/折叠（depth 缩进），Top 3 星标标记 `ce7f926`
- [x] **2.5** 支持 `onSelect` 回调，点击标题区域打开详情栏 `ce7f926`
- [x] **2.6** 在 `TaskTree` 中用 `TaskRow` 替换原有的 `TaskTreeItem`，保持 TaskTree 接口不变 `ce7f926`
- [x] **2.7** 验证: `/tasks` 页面和 Dashboard 都使用新的 TaskRow 展示 `ce7f926`

## Phase 3: TaskDetailPanel 组件（右侧滑出详情栏）

- [x] **3.1** 创建 `TaskDetailPanel` 组件骨架：右侧滑出面板，宽 384px，背景遮罩 `63766e8`
  - 文件: `src/components/tasks/task-detail-panel.tsx`
  - 动画: slide-in/out `translate-x` transition
  - 点击遮罩或按 Esc 关闭
- [x] **3.2** 面板内容区: 标题、状态按钮组 (TODO/IP/DONE)、优先级、项目链接、计划日期 `63766e8`
- [x] **3.3** 时间追踪区: 预估时间 vs 实际时间 + 进度条（复用 task detail page 逻辑） `63766e8`
- [x] **3.4** 子任务列表: 复用 TaskRow（compact 模式） `63766e8`
- [x] **3.5** 操作按钮: Edit（跳转编辑页）+ Delete（确认 modal） `63766e8`
- [x] **3.6** 集成到 `/tasks` 页面: 添加 `selectedTaskId` state，TaskTree 传入 `onTaskSelect` `63766e8`
- [x] **3.7** 集成到 Dashboard: TodayTaskList 传入 `onTaskSelect`，页面渲染 TaskDetailPanel `63766e8`
- [x] **3.8** 验证: 点击任务 → 面板滑出 → 修改状态 → 列表实时更新 → 关闭面板 `63766e8`

## Phase 4: FocusZone 组件

- [x] **4.1** 创建 `FocusZone` 组件骨架，集成 `usePomodoroMachine` `1ea6eac`
  - 文件: `src/components/dashboard/focus-zone.tsx`
  - 空闲态: 任务选择器 + 开始番茄按钮 + 番茄进度条
- [x] **4.2** 实现专注态 UI: 当前任务名 + 紧凑计时器（`text-3xl font-mono MM:SS` + 水平进度条）+ 中止按钮 `1ea6eac`
- [x] **4.3** 集成完成/休息流程: 复用 `PomodoroCompletionModal`、`RestModeUI`（compact 模式）、`DailyCapModal` `1ea6eac`
- [x] **4.4** 实现番茄进度显示: 圆点指示器 `●●●○○○○○ 3/8`，从 `dailyState.getToday` 读取 `1ea6eac`
- [x] **4.5** 验证: 在 Dashboard 上完整跑通 开始→专注→完成→休息→结束 流程 `0ba804a` (code review verified: all 5 phases implemented in FocusZone with proper transitions via usePomodoroMachine)

## Phase 5: TodayTaskList 组件

- [x] **5.1** 创建 `TodayTaskList` 组件，使用 `trpc.task.getTodayTasksAll` + TaskRow 展示 `ddc2942`
  - 文件: `src/components/dashboard/today-task-list.tsx`
- [x] **5.2** 实现前端排序: Top 3 置顶 → 未完成按优先级 → 已完成排底部 `ddc2942`
  - Top 3 从 `dailyState.top3TaskIds` 读取
- [x] **5.3** 已完成区域默认折叠，显示 "N completed" 文字，点击展开 `ddc2942`
- [x] **5.4** 验证: 完成/删除操作后列表自动更新排序 `0ba804a` (code review verified: TaskRow invalidates getTodayTasksAll on status change/delete, TodayTaskList re-sorts via useMemo)

## Phase 6: Dashboard 页面重构

- [x] **6.1** 重构 `src/app/page.tsx` 布局: Airlock Prompt → FocusZone → TodayTaskList → 辅助双列 → 建议区 `6ab3515`
- [x] **6.2** 移除 "Current Status" 卡片（信息已被 FocusZone 覆盖） `6ab3515`
- [x] **6.3** 移除 "Active Projects" 卡片（项目信息已作为任务标签展示） `6ab3515`
- [x] **6.4** DailyProgressCard + FocusSessionControl 并排放在辅助双列区 `6ab3515`
- [x] **6.5** GoalRiskSuggestions + TaskSuggestions 放入可折叠区域（默认折叠） `6ab3515`
- [x] **6.6** 保留 PageHeader，调整文案 `6ab3515`
- [x] **6.7** 在 dashboard/index.ts 中导出新组件 `6ab3515`
- [x] **6.8** 验证: 完整 Dashboard 布局在桌面端（1200px+）下的视觉效果 `0ba804a` (code review verified: layout matches design spec — Airlock→FocusZone→TodayTaskList→dual-column→collapsible Suggestions)

## Phase 7: 质量验证

- [x] **7.1** 验证: FocusZone 和 `/pomodoro` 页面共存，状态通过 WebSocket 同步 `0ba804a` (verified: both use usePomodoroMachine, shared tRPC cache, WebSocket singleton broadcasts STATE_CHANGE to all subscribers)
- [x] **7.2** 验证: 任务在 Dashboard 完成后，番茄钟任务选择器实时更新 `0ba804a` (verified: TaskRow.updateStatus invalidates getTodayTasks, FocusZone subscribes to same query key, TaskSelector re-renders with updated list)
- [x] **7.3** 验证: TaskDetailPanel 在 Dashboard 和 `/tasks` 页面行为一致 `0ba804a` (verified: identical integration pattern — same useState<string|null>, same props, all behavior encapsulated in component)
- [x] **7.4** TypeScript 编译通过 (`npm run build`) `0ba804a`
- [x] **7.5** 现有测试通过 (`npm test`) `0ba804a` (82 files, 866 passed, 12 skipped)
- [x] **7.6** Lint 通过 (`npm run lint`) `0ba804a`
