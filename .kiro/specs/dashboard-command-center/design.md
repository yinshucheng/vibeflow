# Dashboard Command Center — Technical Design

## Layout Architecture

新 Dashboard 采用**单栏为主、辅助侧栏**的布局，自上而下按优先级排列：

```
┌─────────────────────────────────────────────────────┐
│  Airlock Prompt (conditional, same as current)      │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │  Focus Zone (番茄钟内嵌)                      │    │
│  │                                             │    │
│  │  空闲态: [选择任务 ▼] [▶ 开始番茄]            │    │
│  │         番茄进度 ●●●●○○○○ 4/8               │    │
│  │                                             │    │
│  │  专注态: 🔴 当前任务名                        │    │
│  │         23:45 剩余 ─── [中止]                │    │
│  │         番茄进度 ●●●●●○○○ 5/8               │    │
│  │                                             │    │
│  │  休息态: ☕ 休息中 5:00                       │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │  Today's Tasks                    View all → │    │
│  │                                             │    │
│  │  ★ Top 3 标记                                │    │
│  │  ☐ P1 Fix login bug        [ProjectName]    │    │
│  │  ☐ P2 Write test cases     [ProjectName]    │    │
│  │  ☐ P1 Deploy v2.0          [ProjectName]    │    │
│  │  ─────────────────────────                  │    │
│  │  其他任务                                    │    │
│  │  ☐ P2 Update docs          [ProjectName]    │    │
│  │  ☐ P3 Refactor utils       [ProjectName]    │    │
│  │  ─────────────────────────                  │    │
│  │  已完成 (折叠/展开)                           │    │
│  │  ☑ P1 Review PR #123       [ProjectName]    │    │
│  │  ☑ P2 Fix typo             [ProjectName]    │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  ┌──────────────────┐  ┌────────────────────────┐   │
│  │  Daily Progress   │  │  Focus Session         │   │
│  │  (compact)        │  │  (ad-hoc blocking)     │   │
│  └──────────────────┘  └────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │  Suggestions (Goal Risk + Task Suggestions)  │    │
│  │  (collapsed by default, expandable)          │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

## Component Design

### 1. FocusZone (新组件)

**路径**: `src/components/dashboard/focus-zone.tsx`

整合番茄钟核心功能到 Dashboard。复用 `usePomodoroMachine` hook，但 UI 是全新的紧凑版。

**状态映射:**
| Phase | 显示内容 |
|-------|---------|
| `idle` | 任务选择器 + 开始按钮 + 番茄进度条 |
| `focus` | 当前任务名 + 紧凑计时器 + 剩余时间 + 中止按钮 + 番茄进度条 |
| `completing` | 加载状态 |
| `break_prompt` | 触发 CompletionModal（复用现有） |
| `resting` | 休息倒计时 + 结束休息按钮 |

**计时器样式**:
- 不用大圆圈，用**内联数字** + 薄进度条
- 字体: `text-3xl font-mono` 显示 `MM:SS`
- 进度条: 水平细条，显示已用时间百分比

**关键复用:**
- `usePomodoroMachine` — 所有状态和操作
- `TaskSelector` — 任务选择（from `pomodoro/task-selector.tsx`）
- `PomodoroCompletionModal` — 完成确认
- `RestModeUI` — 休息模式（需要 compact variant）
- `DailyCapModal` — 达到上限

### 2. TodayTaskList (新组件)

**路径**: `src/components/dashboard/today-task-list.tsx`

增强版今日任务列表，支持内联操作。

**数据源**: `trpc.task.getTodayTasks` (现有 endpoint)

**排序逻辑** (前端排序):
1. Top 3 任务置顶（需查询 `trpc.dailyState.getToday` 获取 top3TaskIds）
2. 未完成任务按优先级: P1 → P2 → P3
3. 已完成任务排最后

**任务行功能:**
- 左侧 checkbox: 点击切换 TODO ↔ DONE (`trpc.task.updateStatus`)
- 任务标题 + 优先级标签 + 项目名标签
- Hover 时右侧显示删除图标
- 删除需确认（inline confirm，非 modal）
- 已完成任务: 删除线 + 淡化颜色
- Top 3 任务: 左侧小星标标记

**项目上下文**: task 对象中已包含 `project` 关联，直接读取 `task.project?.title`，无需额外查询。需确认 `getTodayTasks` 返回是否包含 project 信息，不包含则在 include 中加上。

### 3. Dashboard Page 重构

**修改文件**: `src/app/page.tsx`

**新布局结构:**
```tsx
<MainLayout title="Dashboard">
  {/* Airlock prompt (保持不变) */}

  {/* Focus Zone — 全宽 */}
  <FocusZone />

  {/* Today's Tasks — 全宽 */}
  <TodayTaskList />

  {/* 辅助信息 — 两列 */}
  <div className="grid gap-6 md:grid-cols-2">
    <DailyProgressCard compact />
    <FocusSessionControl compact />
  </div>

  {/* 建议区域 — 可折叠 */}
  <CollapsibleSection title="Suggestions">
    <GoalRiskSuggestions />
    <TaskSuggestions />
  </CollapsibleSection>
</MainLayout>
```

**移除的卡片:**
- "Current Status" (DashboardStatus) — 信息已被 FocusZone 包含
- "Active Projects" — 项目信息作为任务的标签展示

## Data Flow

```
Dashboard (page.tsx)
  ├── FocusZone
  │     ├── usePomodoroMachine() — 番茄钟状态
  │     ├── trpc.dailyState.getToday — 番茄进度 (x/cap)
  │     ├── TaskSelector — 任务选择
  │     ├── PomodoroCompletionModal — 完成流程
  │     └── RestModeUI (compact) — 休息
  │
  ├── TodayTaskList
  │     ├── trpc.task.getTodayTasks — 今日任务列表
  │     ├── trpc.dailyState.getToday — top3TaskIds
  │     ├── trpc.task.updateStatus — 完成/取消完成
  │     └── trpc.task.delete — 删除任务
  │
  ├── DailyProgressCard (现有, compact)
  ├── FocusSessionControl (现有, compact)
  ├── GoalRiskSuggestions (现有)
  └── TaskSuggestions (现有, compact)
```

## API Changes

### 修改: getTodayTasks 包含已完成任务

**问题**: 现有 `taskService.getTodayTasks` 过滤了 `status: { not: 'DONE' }`，不返回已完成任务。Dashboard 需要看到今日所有任务（包括已完成的）。

**方案**: 新增 `taskService.getTodayTasksAll` 方法（或给 `getTodayTasks` 加 `includeDone` 参数），去掉 DONE 过滤。

修改文件: `src/services/task.service.ts` + `src/server/routers/task.ts`

### 已确认: project 信息

`getTodayTasks` 已经 `include: { project: true }`，可以直接读取 `task.project?.title`。

### 已确认: Top 3 任务 ID

`dailyState.getToday` 返回值包含 `top3TaskIds: string[]`，无需额外 API。

### 4. TaskRow (新组件 — 全局通用)

**路径**: `src/components/tasks/task-row.tsx`

替代现有 `TaskTreeItem`（`task-tree.tsx` 内部组件）的任务行展示。全宽横条，一行展示所有关键信息。

**布局:**
```
┌──────────────────────────────────────────────────────────────────────────┐
│ [▶] [☐] Fix login bug          P1   ProjectName   ~30min   Mar 11  [🍅]│
│      ↑    ↑                     ↑    ↑             ↑        ↑       ↑  │
│   expand checkbox  title     priority project   estimate  planDate pomo │
│                                                                         │
│  hover 时右侧显示: [✏️ Edit] [🗑 Delete]                                  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Props:**
```typescript
interface TaskRowProps {
  task: TaskWithRelations;
  showProject?: boolean;       // 显示项目标签
  showPlanDate?: boolean;      // 显示计划日期
  isTop3?: boolean;            // Top 3 星标
  depth?: number;              // 子任务缩进层级
  onSelect?: (taskId: string) => void;  // 点击打开详情栏
  onStatusChange?: () => void; // 状态变更回调（用于刷新列表）
  onDelete?: () => void;       // 删除回调
}
```

**功能:**
- Checkbox: 切换 TODO ↔ DONE（乐观更新）
- 点击标题区域: 调用 `onSelect` 打开右侧详情栏
- 展开/折叠子任务（有子任务时显示 chevron）
- Hover 时右侧浮现 Edit / Delete 按钮
- 删除: inline confirm（文字变为 "确认？[是] [否]"，2秒后自动恢复）
- 已完成: 整行淡化 + 标题删除线
- Top 3: 左侧小金星标记

**替换策略**: 新建 `TaskRow`，在 `TaskTree` 内部用 `TaskRow` 替换原有的 `TaskTreeItem`。这样 Dashboard 和 `/tasks` 页面自动统一。

### 5. TaskDetailPanel (新组件 — 右侧滑出栏)

**路径**: `src/components/tasks/task-detail-panel.tsx`

点击任务行后从右侧滑入的详情面板。

**布局:**
```
                              ┌──────────────────────────┐
                              │  ✕ Close                 │
                              │                          │
                              │  Fix login bug           │
                              │  Status: [TODO] [IP] [✓] │
                              │  Priority: P1            │
                              │  Project: VibeFlow       │
                              │  Plan Date: Mar 11       │
                              │  ─────────────────────── │
                              │  Description:            │
                              │  (inline editable)       │
                              │  ─────────────────────── │
                              │  Time Tracking:          │
                              │  Est: 30min (1🍅)       │
                              │  Act: 25min (1🍅)       │
                              │  [━━━━━━━━░░] 83%       │
                              │  ─────────────────────── │
                              │  Subtasks:               │
                              │  ☐ Subtask 1             │
                              │  ☑ Subtask 2             │
                              │  ─────────────────────── │
                              │  [Edit] [Delete]         │
                              └──────────────────────────┘
```

**Props:**
```typescript
interface TaskDetailPanelProps {
  taskId: string | null;       // null = 关闭
  onClose: () => void;
}
```

**数据源:**
- `trpc.task.getById` — 任务详情
- `trpc.task.getTaskWithEstimation` — 时间追踪
- `trpc.task.getByProject` — 子任务（现有 pattern）

**功能:**
- 状态切换按钮组 (TODO / IN_PROGRESS / DONE)
- 删除（带确认 modal）
- Edit 按钮跳转到 `/tasks/[id]/edit`
- 子任务列表（复用 TaskRow，compact 模式）
- 时间追踪进度条（复用现有 task detail page 逻辑）

**动画:**
- 进入: `translate-x-full` → `translate-x-0`，`duration-300 ease-out`
- 退出: `translate-x-0` → `translate-x-full`，`duration-200 ease-in`
- 背景遮罩: 半透明黑色，点击关闭
- 面板宽度: `w-96`（384px），`max-w-[90vw]`

**Esc 关闭**: 通过 `useEffect` 监听 `keydown` 事件。

### 6. TaskDetailPanel 集成

在 Dashboard (`page.tsx`) 和 Tasks 页面 (`tasks/page.tsx`) 中：

```tsx
const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

// 传给 TodayTaskList / TaskTree
<TodayTaskList onTaskSelect={setSelectedTaskId} />

// 面板
<TaskDetailPanel taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
```

## Styling Notes

- 保持 Notion 风格 (`notion-*` CSS variables)
- Focus Zone 使用淡色背景卡片，活跃状态用 accent 色边框
- 计时器数字用等宽字体 (`font-mono`)
- 任务操作动画: checkbox toggle 和删除用 `transition-all duration-200`
- 折叠动画: `max-height` transition

## Risk & Mitigations

| Risk | Mitigation |
|------|-----------|
| FocusZone 与 `/pomodoro` 页面状态冲突 | 都使用 `usePomodoroMachine`，状态统一，WebSocket 同步 |
| 任务列表过长影响性能 | 限制显示 20 条，已完成区域默认折叠 |
| 删除操作误触 | inline confirm 二次确认 |
