# Requirements Document

## Introduction

本文档定义了 VibeFlow 番茄工作法在 AI 时代的多任务增强需求。随着 AI Coding 工具（如 Claude Code、Cursor、GitHub Copilot）的普及，开发者的工作模式发生了根本性变化：

**传统番茄工作法的假设**：
- 一个番茄钟 = 一个任务
- 专注 = 单一任务的持续投入
- 任务切换 = 分心/中断

**AI 时代的现实**：
- AI 异步执行任务时，人可以并行处理其他工作
- "等待 AI 完成" 不等于 "空闲"，而是可以切换到另一个任务
- 多任务并行是高效利用时间的方式，而非分心
- 有时需要"无任务专注"来处理规划、优先级排序等元工作

本需求旨在让番茄工作法适应这种新的工作模式，同时保留其核心价值：时间盒、专注、休息节奏。

## Glossary

- **Pomodoro_Session**: 一次番茄工作会话，可关联零个或多个任务
- **Active_Task**: 当前正在处理的任务，可在番茄钟内切换
- **Task_Time_Slice**: 任务时间片，记录某任务在番茄钟内的实际工作时间
- **Taskless_Pomodoro**: 无任务番茄钟，用于规划、思考等元工作
- **Task_Stack**: 任务栈，记录番茄钟内处理过的所有任务
- **Quick_Complete**: 快速完成，在番茄钟内直接标记任务完成
- **Time_Attribution**: 时间归属，将番茄钟时间分配给各个任务
- **Inbox_Task**: 收件箱任务，快速创建的临时任务，默认归属于 Inbox 项目
- **Productivity_Apps**: 生产力应用，工作时使用的应用（IDE、编辑器等），休息时可选限制

## Requirements

### Requirement 1: 番茄钟内任务切换 [P0]

**User Story:** As a developer using AI coding tools, I want to switch between tasks during a pomodoro session, so that I can work on another task while waiting for AI to complete the current one.

#### Acceptance Criteria

1. WHEN a pomodoro is active, THE System SHALL display a "Switch Task" button in the pomodoro interface
2. WHEN a user clicks "Switch Task", THE System SHALL show a task selector with:
   - Today's Top 3 tasks (优先显示)
   - Recent tasks (最近处理过的任务)
   - Quick search input (快速搜索)
3. WHEN a user selects a different task, THE System SHALL:
   - Record the time spent on the previous task as a Task_Time_Slice
   - Update the Active_Task to the newly selected task
   - Add the previous task to the Task_Stack (if not already present)
   - Continue the pomodoro timer without interruption
4. THE System SHALL display the Task_Stack showing all tasks worked on during this pomodoro
5. WHEN the pomodoro completes, THE System SHALL show a summary of time spent on each task
6. THE System SHALL NOT count task switching as an interruption or distraction

### Requirement 2: 番茄钟内快速完成任务 [P1]

**User Story:** As a user, I want to mark a task as complete during an active pomodoro, so that I can immediately move on to the next task without ending the pomodoro.

#### Acceptance Criteria

1. WHEN a pomodoro is active with an associated task, THE System SHALL display a "Complete Task" button
2. WHEN a user clicks "Complete Task", THE System SHALL:
   - Mark the current task as completed
   - Record the final Task_Time_Slice for this task
   - Show a celebration animation/feedback
   - Prompt user to select the next task or continue taskless
3. IF the user selects a new task, THE System SHALL continue the pomodoro with the new Active_Task
4. IF the user chooses to continue taskless, THE System SHALL continue the pomodoro in Taskless mode
5. THE completed task SHALL remain in the Task_Stack with its total time recorded
6. WHEN viewing task history, THE System SHALL show which pomodoro session completed the task

### Requirement 3: 无任务番茄钟（Taskless Pomodoro） [P0]

**User Story:** As a user, I want to start a pomodoro without selecting a specific task, so that I can use focused time for planning, prioritization, or exploratory work.

#### Acceptance Criteria

1. THE System SHALL provide a "Start Focus Time" option that starts a pomodoro without requiring task selection
2. WHEN starting a Taskless Pomodoro, THE System SHALL:
   - Display a generic focus indicator (e.g., "Planning Time", "Focus Mode")
   - Allow the user to optionally add a note/label for this session
   - Start the timer immediately
3. DURING a Taskless Pomodoro, THE System SHALL allow the user to:
   - Associate a task at any time (converting to a normal pomodoro)
   - **Quick-create a new Inbox task** with just a title (auto-assigned to Inbox project)
   - Add multiple tasks as they are worked on
   - Keep it taskless for the entire duration
4. WHEN a Taskless Pomodoro completes without any task association, THE System SHALL:
   - Record it as a valid pomodoro in statistics
   - **Default attribute the time to a special "Unassigned" category**
   - Allow user to retroactively assign tasks if desired
5. THE Taskless Pomodoro SHALL count towards daily pomodoro goals and statistics
6. THE System SHALL track Taskless Pomodoro time separately for productivity analysis

### Requirement 4: 任务时间归属与统计 [P0]

**User Story:** As a user, I want to see how my pomodoro time is distributed across tasks, so that I can understand where my focus time actually goes.

#### Acceptance Criteria

1. THE System SHALL record Task_Time_Slices with:
   - Task ID
   - Pomodoro Session ID
   - Start timestamp
   - End timestamp
   - Duration in seconds
2. WHEN a pomodoro involves multiple tasks, THE Statistics SHALL show:
   - Total pomodoro time
   - Breakdown by task with percentages
   - Number of task switches
3. THE Task detail view SHALL display:
   - Total time spent across all pomodoros
   - Number of pomodoros that included this task
   - Average time per pomodoro session
4. THE Daily/Weekly statistics SHALL include:
   - Multi-task pomodoro count vs single-task pomodoro count
   - Taskless pomodoro count and total time
   - Most frequently co-worked tasks (tasks often in same pomodoro)
5. THE System SHALL NOT penalize multi-task pomodoros in productivity metrics

### Requirement 5: 任务建议排序 [P3]

**User Story:** As a user, I want the system to suggest relevant tasks when I want to switch, so that I can quickly find what to work on next.

#### Acceptance Criteria

1. WHEN showing the task switcher, THE System SHALL prioritize tasks in this order:
   - Tasks from today's Top 3 (highest priority)
   - Tasks recently worked on in this session
   - Tasks from the same project as current task
   - Tasks with upcoming deadlines
2. THE task switcher SHALL support quick search by task title
3. THE task switcher SHALL allow **quick-creating a new Inbox task** with just a title

### Requirement 6: 番茄钟启动流程优化 [P1]

**User Story:** As a user, I want a streamlined way to start a pomodoro that accommodates different scenarios, so that I can quickly enter focus mode regardless of my current situation.

#### Acceptance Criteria

1. THE pomodoro start interface SHALL offer three clear options:
   - "Start with Task" - Select from Top 3 or search
   - "Start Focus Time" - Begin taskless pomodoro
   - "Continue Last" - Resume with the last worked-on task
2. THE pomodoro start interface SHALL allow **quick-creating a new Inbox task** and immediately starting with it
3. WHEN in PLANNING state (Airlock completed), THE System SHALL:
   - Show Top 3 tasks prominently
   - Allow starting with any of them in one click
   - Still allow taskless start
4. THE keyboard shortcuts SHALL support:
   - Quick start with Top 1 task
   - Quick start taskless
   - Open task selector
5. FROM the tray menu, THE System SHALL allow:
   - Start pomodoro with last task
   - Start taskless pomodoro
   - Open full interface for task selection

### Requirement 7: 时间线视图增强 [P2]

**User Story:** As a user, I want to see my multi-task pomodoros visualized in the timeline, so that I can review how I spent my focus time.

#### Acceptance Criteria

1. THE Timeline SHALL display multi-task pomodoros with:
   - Segmented bar showing time distribution per task
   - Color coding by task/project
   - Hover details showing exact times
2. WHEN clicking a multi-task pomodoro in timeline, THE System SHALL show:
   - Full task list with time breakdown
   - Task switch timestamps
   - Any tasks completed during this pomodoro
3. THE Timeline SHALL distinguish:
   - Single-task pomodoros (solid color)
   - Multi-task pomodoros (segmented)
   - Taskless pomodoros (neutral/gray pattern)
4. THE filtering options SHALL include:
   - Show only multi-task pomodoros
   - Show only taskless pomodoros
   - Filter by specific task involvement

### Requirement 8: 时间线回溯编辑 [P2]

**User Story:** As a user, I want to edit past pomodoro sessions in the timeline to correct or add task assignments, so that my time records accurately reflect what I actually worked on.

#### Acceptance Criteria

1. WHEN viewing a pomodoro session in the Timeline, THE System SHALL provide an "Edit" action
2. WHEN editing a past pomodoro, THE User SHALL be able to:
   - Change the associated task(s)
   - Add tasks that were actually worked on but not recorded
   - Remove incorrectly assigned tasks
   - Convert a taskless pomodoro to task-associated
   - Add notes/labels to the session
3. WHEN a task is retroactively assigned, THE System SHALL:
   - Update the task's total time statistics
   - Recalculate project-level statistics
4. THE editing capability SHALL be available for pomodoros within the last 7 days

### Requirement 9: 有效休息保障

**User Story:** As a user, I want the system to help me actually rest during break time, so that I don't continue working out of inertia and can return refreshed for the next pomodoro.

#### Acceptance Criteria

##### 9.1 休息期间生产力工具限制 [P1]

1. THE User_Settings SHALL allow:
   - **Enabling/disabling this feature entirely** (default: disabled)
   - Configuring a list of "productivity apps" (e.g., Cursor, Kiro, VS Code, Xcode)
2. WHEN this feature is enabled AND entering REST or OVER_REST state, THE System SHALL:
   - Detect if any configured productivity apps are in foreground
   - Display a friendly reminder overlay/notification (NOT close the app)
   - Bring the reminder to front if user tries to switch to productivity apps
3. THE reminder SHALL NOT forcefully close or hide the productivity apps (preserving unsaved work)
4. WHEN the user attempts to focus a productivity app during rest, THE System SHALL:
   - Show a gentle blocking overlay on that app
   - Display the remaining rest time
   - Provide options: "I understand, let me rest" or "Extend Pomodoro"

##### 9.2 心流延长机制 [P2]

1. WHEN a pomodoro is about to end, THE System SHALL offer an "Extend" option
2. DURING rest period, IF user chooses "Extend Pomodoro", THE System SHALL:
   - Check current continuous work time against the configured maximum
   - IF within limit: extend by configurable increment (default: 15 minutes)
   - IF exceeding limit: show warning and require confirmation
3. THE User_Settings SHALL allow configuring:
   - Maximum continuous work time (default: 90 minutes, range: 45-180 minutes)
   - Extension increment (default: 15 minutes, range: 5-30 minutes)
   - Maximum extensions per session (default: 2)
4. WHEN maximum continuous work time is reached, THE System SHALL:
   - Force transition to REST state
   - Display message: "You've been focused for X minutes - time for a longer break!"
   - Recommend a longer rest duration (e.g., 15-20 minutes instead of 5)
5. THE System SHALL track and display continuous work time in the UI

##### 9.3 休息提醒内容 [P3]

1. THE rest reminder messages SHALL be friendly and varied (10-20 条轮换)
2. THE reminder SHALL include actionable rest suggestions:
   - "Stand up and stretch for 30 seconds"
   - "Look at something 20 feet away for 20 seconds"
   - "Take 3 deep breaths"
   - "Refill your water bottle"

## Non-Functional Requirements

### Performance

1. Task switching SHALL complete in < 200ms
2. Task suggestions SHALL load in < 500ms
3. Time slice recording SHALL not interrupt the timer

### Data Integrity

1. All Task_Time_Slices SHALL be persisted immediately
2. If app crashes during pomodoro, time slices up to last switch SHALL be preserved
3. Offline task switches SHALL sync when connection restored

### Backwards Compatibility

1. Existing single-task pomodoros SHALL continue to work unchanged
2. Historical data SHALL remain valid and viewable
3. Users who prefer single-task mode SHALL not be forced to use multi-task features

## Design Considerations

### 时间归属公平性问题

当一个番茄钟内切换了多个任务时，时间如何分配？

**方案对比**：

| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| A. 精确时间片 | 记录每次切换的时间戳，精确计算每个任务的时间 | 数据准确 | 实现复杂，UI 展示繁琐 |
| B. 平均分配 | 番茄钟时间 ÷ 任务数 | 简单 | 不反映真实投入 |
| C. 主任务归属 | 只记录"主任务"，其他任务不计时间 | 最简单 | 丢失多任务信息 |
| D. 手动分配 | 番茄钟结束时让用户手动分配比例 | 用户控制 | 增加认知负担 |

**推荐方案：A + 简化展示**

- 后端：精确记录每个 Task_Time_Slice（方案 A）
- 前端展示：
  - 任务详情页：显示精确时间
  - 时间线：显示分段条形图
  - 统计汇总：显示总时间和百分比
- 不需要用户手动分配

**边界情况处理**：

1. **快速切换**（< 30 秒）：仍然记录，但统计时可标记为"碎片时间"
2. **切换后立即切回**：合并相邻的同任务时间片
3. **番茄钟中断**：已记录的时间片保留，未完成的番茄钟标记为 interrupted

### 状态机影响

现有状态机：`LOCKED → PLANNING → FOCUS → REST → OVER_REST`

**本需求对状态机的影响**：

| 操作 | 是否触发状态变化 | 说明 |
|------|------------------|------|
| 任务切换 | 否 | 保持 FOCUS 状态，仅更新 activeTaskId |
| 快速完成任务 | 否 | 保持 FOCUS 状态，任务标记完成 |
| 无任务启动番茄钟 | 是 | PLANNING → FOCUS，但 taskId 为 null |
| 心流延长 | 否 | 保持 FOCUS 状态，延长 endTime |

**需要修改的状态机逻辑**：

1. `canStartPomodoro` guard：允许 taskId 为 null（无任务番茄钟）
2. FOCUS 状态增加 context：`activeTaskId`, `taskStack`, `continuousWorkMinutes`
3. 新增 action：`switchTask`, `extendPomodoro`

### 与现有 Enforcer 的关系

**现有逻辑**：
- Focus Enforcer：工作时间内，无番茄钟时，关闭**分心应用**（微信、浏览器）
- Over-Rest Enforcer：超时休息时，关闭**分心应用**
- Sleep Enforcer：睡眠时间，关闭**配置的应用**

**新增逻辑（Req 9.1）**：
- Rest Enforcer：休息期间，限制**生产力应用**（Cursor、VS Code）

**关键区别**：

| Enforcer | 触发时机 | 目标应用 | 行为 |
|----------|----------|----------|------|
| Focus | 工作时间 + 无番茄钟 | 分心应用 | 关闭/隐藏 |
| Over-Rest | 超时休息 | 分心应用 | 关闭 |
| Sleep | 睡眠时间 | 配置的应用 | 关闭 |
| **Rest (新)** | REST 状态 | 生产力应用 | **仅提醒，不关闭** |

**配置分离**：
- `distractionApps`：分心应用列表（现有）
- `productivityApps`：生产力应用列表（新增）
- 两个列表互斥，不应有重叠

## Migration Considerations

1. Existing pomodoro sessions need no migration (they are single-task by default)
2. New Task_Time_Slice table/model needed for granular tracking
3. Statistics queries need updating to handle multi-task scenarios
4. UI components need enhancement but core timer logic unchanged

## Open Questions

1. ~~Should there be a limit on task switches per pomodoro?~~ → 无限制，但追踪统计
2. ~~How to handle task deletion when it has time slices?~~ → 软删除，保留时间数据
3. ~~Should taskless time be attributable to projects?~~ → 默认归属 "Unassigned"，可后续编辑
4. 快速切换（< 30 秒）是否应该合并到前一个时间片？→ 待用户反馈决定

## Priority Summary

| 优先级 | 需求 | 说明 |
|--------|------|------|
| **P0** | Req 1: 任务切换 | 核心价值，解决 AI 时代工作流痛点 |
| **P0** | Req 3: 无任务番茄钟 | 直接解决"必须选任务"的痛点 |
| **P0** | Req 4: 时间归属统计 | 数据基础，支撑 #1 和 #3 |
| **P1** | Req 2: 快速完成 | 自然工作流延伸 |
| **P1** | Req 6: 启动流程优化 | UX 改进 |
| **P1** | Req 9.1: 休息工具限制 | 解决真实问题，可配置 |
| **P2** | Req 7: 时间线增强 | 可视化，可先做基础版 |
| **P2** | Req 8: 回溯编辑 | 纠错能力 |
| **P2** | Req 9.2: 心流延长 | 好功能但增加复杂度 |
| **P3** | Req 5: 任务建议排序 | 简单规则即可 |
| **P3** | Req 9.3: 休息提醒内容 | 锦上添花 |
