# Requirements Document: iOS Mobile Enhancement

## Introduction

VibeFlow iOS 客户端目前仅具备**只读状态同步**能力，用户只能查看任务、番茄钟状态和设置，无法进行任何操作。这严重限制了移动端的实用性。

本需求文档定义了 iOS 客户端的核心交互能力，使其从"状态查看器"升级为"轻量级操作终端"。

### 设计原则

1. **移动优先** - 针对移动场景优化，不是 Web 端的完整复制
2. **核心聚焦** - 只实现高频、刚需的操作，避免功能膨胀
3. **快速响应** - 操作即时反馈，乐观更新 + 后台同步

### 当前状态

| 能力 | 现状 | 目标 |
|------|------|------|
| 查看任务列表 | ✅ | ✅ |
| 查看番茄钟状态 | ✅ | ✅ |
| 查看 Top 3 | ✅ | ✅ |
| 查看项目列表 | ❌ | ✅ |
| 完成任务 | ❌ | ✅ |
| 启动番茄钟 | ❌ | ✅ |
| 设置 Top 3 | ❌ | ✅ |
| 创建任务 | ❌ | ✅ |
| 编辑任务 | ❌ | ✅ |
| 管理专注策略 | ❌ | ✅ |

## Glossary

| 术语 | 定义 |
|------|------|
| **Top 3** | 每日最重要的 3 个任务，用于聚焦当天工作重点 |
| **Pomodoro** | 番茄钟，25 分钟专注时间单位 |
| **Daily State** | 每日状态机：LOCKED → PLANNING → FOCUS → REST |
| **Optimistic Update** | 乐观更新，操作立即反映在 UI，后台异步同步 |
| **Focus Policy** | 专注策略，定义番茄钟期间的应用白名单/黑名单规则 |
| **Distraction Apps** | 分心应用，在专注期间需要被限制的应用列表 |

## Requirements

### Requirement 1: 任务完成操作

**User Story:** As a mobile user, I want to mark tasks as completed from my phone, so that I can update my progress without switching to desktop.

#### Acceptance Criteria

1. WHEN user taps the checkbox on a task item, THE task status SHALL change to DONE immediately (optimistic update)
2. WHEN task is marked complete, THE system SHALL send `task.complete` command via WebSocket
3. IF the task is the current pomodoro task, THEN the system SHALL prompt user to select next task or end pomodoro
4. IF network is unavailable, THEN the action SHALL be queued and synced when connection restores
5. WHEN sync fails after 3 retries, THE system SHALL show error toast and revert the optimistic update

#### UI Specification

- 任务项右侧显示圆形 checkbox
- 点击后 checkbox 变为 ✓ 并显示完成动画
- 已完成任务文字显示删除线样式
- 支持 swipe-to-complete 手势（向右滑动）

---

### Requirement 2: 番茄钟控制

**User Story:** As a mobile user, I want to start and manage pomodoro sessions from my phone, so that I can maintain focus even when away from my desk.

#### Acceptance Criteria

1. WHEN user taps "Start Pomodoro" button, THE system SHALL:
   - Send `pomodoro.start` command with selected task ID
   - Display countdown timer
   - Update Daily State to FOCUS

2. WHEN pomodoro is active, THE user SHALL be able to:
   - View remaining time
   - Switch to a different task (via `pomodoro.switchTask`)
   - Complete current task and continue pomodoro

3. WHEN pomodoro timer reaches zero, THE system SHALL:
   - Show completion notification (push notification if app is backgrounded)
   - Prompt user to start rest or continue working

4. IF user starts pomodoro without selecting a task, THEN system SHALL start a "taskless pomodoro"

5. WHEN network is unavailable, THE pomodoro start action SHALL be queued (but timer runs locally)

#### UI Specification

- 主屏幕顶部显示番茄钟状态卡片
- 未开始状态：显示 "Start Pomodoro" 按钮
- 进行中状态：显示倒计时圆环 + 当前任务名称
- 点击任务名称可切换任务
- 支持从任务列表直接启动番茄钟（任务项上的 ▶️ 按钮）

---

### Requirement 3: Top 3 任务管理

**User Story:** As a mobile user, I want to set my Top 3 priorities for the day from my phone, so that I can plan my day during commute or breaks.

#### Acceptance Criteria

1. WHEN user is in PLANNING state, THE system SHALL allow setting Top 3 tasks
2. WHEN user taps "Set Top 3" button, THE system SHALL:
   - Show task selection modal with all TODO tasks
   - Allow selecting 1-3 tasks
   - Send `dailyState.setTop3` command on confirmation

3. WHEN Top 3 is set, THE selected tasks SHALL:
   - Display with star (⭐) indicator
   - Appear at the top of task list
   - Be highlighted in the UI

4. WHEN user wants to modify Top 3, THE system SHALL allow:
   - Removing a task from Top 3 (tap star to toggle)
   - Replacing a task (select new task)
   - Reordering Top 3 (drag and drop)

5. IF all Top 3 tasks are completed, THEN system SHALL prompt to select new priorities

#### UI Specification

- Top 3 区域在任务列表顶部，带明显视觉分隔
- 星标任务显示金色星星图标
- 点击星星可快速添加/移除 Top 3
- 长按可拖拽排序

---

### Requirement 4: 快速任务创建

**User Story:** As a mobile user, I want to quickly capture tasks on my phone, so that I don't forget ideas when I'm on the go.

#### Acceptance Criteria

1. WHEN user taps "+" button, THE system SHALL show quick task input
2. WHEN user enters task title and confirms, THE system SHALL:
   - Create task in default project (Inbox)
   - Send `task.create` command
   - Show success feedback

3. THE quick input SHALL support:
   - Title only (minimum)
   - Priority prefix: `!` for P1, `!!` for P2 (default P2)
   - Date prefix: `today`, `tomorrow`, `next week`

4. IF user enters natural language like "urgent: fix login bug tomorrow", THE system SHALL parse and set appropriate fields

5. WHEN offline, THE task creation SHALL be queued and synced later

#### UI Specification

- 右下角浮动 "+" 按钮
- 点击展开快速输入框
- 输入框支持单行快速输入
- 可选展开显示更多选项（项目、优先级、日期）
- 键盘上方显示快捷标签（Today, P1, P2）

---

### Requirement 5: 任务状态切换

**User Story:** As a mobile user, I want to change task status (TODO/IN_PROGRESS/DONE), so that I can track my work progress accurately.

#### Acceptance Criteria

1. WHEN user long-presses a task, THE system SHALL show status action sheet
2. THE action sheet SHALL include:
   - Mark as TODO
   - Mark as In Progress
   - Mark as Done
   - Start Pomodoro with this task

3. WHEN status changes to IN_PROGRESS, THE task SHALL:
   - Move to "In Progress" section
   - Show visual indicator (progress icon)

4. WHEN user swipes left on a task, THE system SHALL show quick actions:
   - Delete (red)
   - Edit (blue)

5. IF task has subtasks, THEN completing parent task SHALL prompt about subtasks

#### UI Specification

- 长按显示 iOS 原生 action sheet
- 左滑显示操作按钮（iOS 标准交互）
- 状态变化有平滑动画过渡

---

### Requirement 6: 项目显示与筛选

**User Story:** As a mobile user, I want to view my projects and filter tasks by project, so that I can focus on specific areas of work.

#### Acceptance Criteria

1. WHEN user opens the app, THE system SHALL display project list in navigation
2. WHEN user taps a project, THE system SHALL:
   - Filter task list to show only tasks from that project
   - Display project name in header
   - Show project progress (completed/total tasks)

3. THE project list SHALL display:
   - Project name
   - Task count (pending/total)
   - Visual indicator for active project

4. WHEN user taps "All Tasks", THE system SHALL show tasks from all projects

5. THE system SHALL remember last selected project filter across sessions

#### UI Specification

- 底部 Tab 或侧边栏显示项目列表
- 当前选中项目高亮显示
- 项目名称旁显示任务数量徽章
- 支持下拉切换项目（快捷方式）

---

### Requirement 7: 专注策略管理

**User Story:** As a mobile user, I want to manage my focus policy (whitelist/blacklist apps) from my phone, so that I can adjust my distraction blocking settings on the go.

#### Acceptance Criteria

1. WHEN user opens Settings, THE system SHALL display current focus policy
2. THE focus policy view SHALL show:
   - Distraction apps list (blacklist - apps to block during focus)
   - Allowed apps list (whitelist - apps always accessible)
   - Policy sync status

3. WHEN user taps "Add to Whitelist", THE system SHALL:
   - Show installed apps picker
   - Allow selecting apps to add to whitelist
   - Send `policy.updateWhitelist` command

4. WHEN user taps "Add to Blacklist", THE system SHALL:
   - Show installed apps picker (or common distraction apps)
   - Allow selecting apps to add to blacklist
   - Send `policy.updateBlacklist` command

5. WHEN user removes an app from list, THE system SHALL:
   - Remove app from the respective list
   - Sync changes to server immediately

6. THE policy changes SHALL sync to all connected clients in real-time

#### UI Specification

- 设置页面显示"专注策略"区域
- 白名单和黑名单分开显示，可折叠
- 每个应用显示图标和名称
- 左滑删除应用
- 底部"添加应用"按钮

---

### Requirement 8: 睡眠时间设置

**User Story:** As a mobile user, I want to set my sleep time from my phone, so that the system knows when to stop sending notifications and enforce rest.

#### Acceptance Criteria

1. WHEN user opens Settings, THE system SHALL display current sleep time settings
2. THE sleep time settings SHALL show:
   - Sleep start time (e.g., 23:00)
   - Wake up time (e.g., 07:00)
   - Enable/disable toggle

3. WHEN user modifies sleep time, THE system SHALL:
   - Show time picker for start/end time
   - Validate that sleep duration is reasonable (4-12 hours)
   - Send `settings.updateSleepTime` command

4. WHEN sleep time is active, THE system SHALL:
   - Suppress all notifications
   - Show "Sleep Mode" indicator if app is opened
   - Prevent starting new pomodoros

5. THE sleep time settings SHALL sync across all clients

#### UI Specification

- 设置页面显示"睡眠时间"区域
- 开始和结束时间使用 iOS 原生时间选择器
- 显示当前睡眠时长（如"8小时"）
- 开关控制是否启用睡眠时间限制

---

### Requirement 9: 推送通知

**User Story:** As a mobile user, I want to receive notifications for important events, so that I stay informed even when the app is closed.

#### Acceptance Criteria

1. THE system SHALL send push notifications for:
   - Pomodoro completion
   - Pomodoro start (from other clients)
   - Daily planning reminder (configurable time)
   - Task due date reminders

2. WHEN user taps notification, THE app SHALL:
   - Open to relevant screen
   - For pomodoro completion: show completion screen
   - For task reminder: show task detail

3. THE user SHALL be able to configure:
   - Enable/disable each notification type
   - Quiet hours (no notifications during sleep)
   - Notification sound

4. IF user has Focus Mode enabled on iOS, THE app SHALL respect system settings

#### UI Specification

- 设置页面添加通知配置区域
- 每种通知类型有独立开关
- 支持测试通知功能

---

### Requirement 10: 基础任务编辑

**User Story:** As a mobile user, I want to edit task details on my phone, so that I can make quick adjustments without switching devices.

#### Acceptance Criteria

1. WHEN user taps a task, THE system SHALL show task detail view
2. THE task detail view SHALL allow editing:
   - Title
   - Priority (P1/P2/P3)
   - Plan date
   - Project (move to different project)

3. WHEN user saves changes, THE system SHALL:
   - Send `task.update` command
   - Show success feedback
   - Return to task list

4. THE edit form SHALL validate:
   - Title is not empty
   - Date is valid format

5. WHEN editing offline, THE changes SHALL be queued

#### UI Specification

- 点击任务进入详情页
- 详情页顶部显示任务标题（可编辑）
- 下方显示属性列表（优先级、日期、项目）
- 点击属性显示选择器
- 右上角保存按钮

---

## Non-Functional Requirements

### Performance

- 操作响应时间 < 100ms（乐观更新）
- 应用启动时间 < 2s
- 离线队列最大容量：100 个操作

### Security

- 所有 API 调用使用 HTTPS
- 认证 token 存储在 Secure Store
- 敏感操作需要生物识别确认（可选）

### Compatibility

- iOS 15.0+
- iPhone 和 iPad 支持
- 支持 Dark Mode

---

## Out of Scope (Phase 1)

以下功能不在本次迭代范围内：

- ❌ 项目创建/编辑
- ❌ 子任务管理
- ❌ 时间估算设置
- ❌ 效率分析图表
- ❌ 日报生成
- ❌ 自然语言高级解析
- ❌ 多用户协作
- ❌ Widget 支持
- ❌ Apple Watch 支持
- ❌ 离线操作队列（延后到 Phase 2）

---

## Success Metrics

| 指标 | 目标 |
|------|------|
| 任务完成操作成功率 | > 99% |
| 番茄钟启动成功率 | > 99% |
| 策略同步成功率 | > 99% |
| 应用崩溃率 | < 0.1% |
| 用户日活跃操作数 | > 5 次/天 |
