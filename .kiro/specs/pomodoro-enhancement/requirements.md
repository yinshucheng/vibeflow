# Requirements Document

## Introduction

本文档定义了 VibeFlow 番茄工作法功能的增强需求。主要目标是：
1. 实现番茄状态持久化，解决页面刷新后状态丢失问题
2. 支持从任务页面直接启动番茄工作法
3. 提供多维度的番茄时间统计和时间线视图
4. 实现番茄完成提醒功能
5. 支持每日预期工作时间设定和休息超时提醒
6. 整合浏览器插件事件，展示完整的活动时间线

## Glossary

- **Pomodoro_Timer**: 番茄计时器组件，负责倒计时显示和控制
- **Pomodoro_Session**: 一次番茄工作会话，包含开始时间、持续时间、关联任务等信息
- **Activity_Timeline**: 活动时间线，展示番茄工作、休息、分心等事件的时间轴视图
- **Daily_Schedule**: 每日工作计划，包含预期工作时间段和休息规则
- **Browser_Sentinel**: 浏览器监控插件，负责追踪用户浏览活动和执行专注策略
- **Idle_Alert**: 空闲提醒，当用户在预期工作时间内休息过长时触发的提醒机制
- **Statistics_Dashboard**: 统计仪表板，展示番茄时间的多维度统计数据

## Requirements

### Requirement 1: 番茄状态持久化

**User Story:** As a user, I want my pomodoro session to persist across page refreshes, so that I don't lose my progress when I accidentally refresh the page.

#### Acceptance Criteria

1. WHEN a user starts a pomodoro session, THE Pomodoro_Timer SHALL store the session state in both server database and local storage
2. WHEN a user refreshes the pomodoro page, THE Pomodoro_Timer SHALL restore the running session from the server with accurate remaining time
3. WHEN a user opens the pomodoro page in a new tab, THE Pomodoro_Timer SHALL display the current running session if one exists
4. IF the stored session has expired during page refresh, THEN THE Pomodoro_Timer SHALL automatically trigger the completion flow
5. WHEN a pomodoro session is completed or aborted, THE Pomodoro_Timer SHALL clear the local storage state

### Requirement 2: 从任务页面启动番茄

**User Story:** As a user, I want to start a pomodoro directly from the tasks page, so that I can quickly begin working on a specific task without navigating to the pomodoro page.

#### Acceptance Criteria

1. WHEN viewing the tasks page, THE Task_List SHALL display a "Start Pomodoro" button for each task
2. WHEN a user clicks the "Start Pomodoro" button on a task, THE System SHALL start a pomodoro session for that task
3. WHEN a pomodoro is started from the tasks page, THE System SHALL navigate the user to the pomodoro page with the timer running
4. IF a pomodoro is already in progress, THEN THE Task_List SHALL disable the "Start Pomodoro" buttons and show the current session indicator
5. WHEN a task has an active pomodoro, THE Task_List SHALL display a visual indicator showing the running timer

### Requirement 3: 多维度番茄统计

**User Story:** As a user, I want to view pomodoro statistics by different dimensions (project, task, day) with flexible time range filtering, so that I can understand how I spend my focus time.

#### Acceptance Criteria

1. THE Statistics_Dashboard SHALL display total pomodoro time grouped by project
2. THE Statistics_Dashboard SHALL display total pomodoro time grouped by task
3. THE Statistics_Dashboard SHALL display total pomodoro time grouped by day
4. THE Statistics_Dashboard SHALL provide preset time range filters: today, this week, this month
5. THE Statistics_Dashboard SHALL provide a custom date range picker for flexible filtering
6. WHEN a user selects a time range filter, THE Statistics_Dashboard SHALL update all statistics to reflect that range
7. THE Statistics_Dashboard SHALL display a daily timeline showing all pomodoro sessions with their start and end times
8. WHEN displaying project statistics, THE Statistics_Dashboard SHALL show the percentage of total time for each project
9. WHEN displaying task statistics, THE Statistics_Dashboard SHALL show completed vs interrupted pomodoro counts
10. THE Statistics_Dashboard SHALL support combining dimension filters (e.g., project + time range)
11. THE Statistics_Dashboard SHALL persist the user's last selected filter preferences

### Requirement 4: 番茄完成提醒

**User Story:** As a user, I want to receive a notification when my pomodoro session completes, so that I know when to take a break.

#### Acceptance Criteria

1. WHEN a pomodoro session completes, THE System SHALL display a browser notification with the task name
2. WHEN a pomodoro session completes, THE System SHALL play an audio alert sound
3. THE User_Settings SHALL allow users to enable or disable audio notifications
4. THE User_Settings SHALL allow users to select from different notification sounds
5. IF the browser tab is not focused, THEN THE System SHALL flash the tab title to attract attention
6. WHEN a pomodoro completes, THE System SHALL send a WebSocket event to Browser_Sentinel for cross-tab notification

### Requirement 5: 每日工作时间设定与空闲提醒

**User Story:** As a user, I want to set my expected daily work hours with multiple time slots and receive reminders when I'm idle too long, so that I can maintain productivity during work hours.

#### Acceptance Criteria

1. THE User_Settings SHALL allow users to configure multiple work time slots per day (e.g., 9:00-12:00, 14:00-16:00, 16:30-18:00)
2. THE User_Settings SHALL allow users to add, edit, and remove work time slots
3. THE User_Settings SHALL validate that work time slots do not overlap
4. THE User_Settings SHALL allow users to set maximum idle duration before triggering an alert
5. WHILE within any configured work time slot AND no pomodoro is active AND idle time exceeds the threshold, THE Idle_Alert SHALL trigger a reminder
6. WHEN an idle alert is triggered, THE System SHALL send a command to Browser_Sentinel to display a focus reminder overlay
7. THE User_Settings SHALL allow users to configure idle alert actions (show overlay, close distracting apps, open pomodoro page)
8. WHEN the user starts a pomodoro or is in a scheduled break, THE Idle_Alert SHALL reset the idle timer
9. THE System SHALL track idle time based on both browser activity and pomodoro state
10. THE System SHALL correctly identify gaps between work time slots as non-work time (no idle alerts during these gaps)

### Requirement 6: 活动时间线与日历视图

**User Story:** As a user, I want to see a calendar view with my activity timeline, so that I can review my work patterns and identify distractions.

#### Acceptance Criteria

1. THE Activity_Timeline SHALL display a calendar component for date selection
2. WHEN a user selects a date, THE Activity_Timeline SHALL show all events for that day in a vertical timeline
3. THE Activity_Timeline SHALL display pomodoro sessions with task name, duration, and status (completed/interrupted/aborted)
4. THE Activity_Timeline SHALL display distraction events reported by Browser_Sentinel
5. THE Activity_Timeline SHALL display scheduled tasks for the selected day
6. THE Activity_Timeline SHALL provide filters to show/hide different event types (pomodoros, distractions, scheduled tasks)
7. WHEN displaying the timeline, THE Activity_Timeline SHALL use color coding to distinguish event types
8. THE Activity_Timeline SHALL show time gaps between events to visualize untracked time

### Requirement 7: 浏览器插件事件整合

**User Story:** As a user, I want the browser extension events to be integrated with the activity timeline, so that I can see a complete picture of my work day.

#### Acceptance Criteria

1. WHEN Browser_Sentinel detects a distraction event, THE System SHALL store it in the activity log with timestamp and duration
2. WHEN Browser_Sentinel detects a focus break, THE System SHALL record the interruption event
3. THE Activity_Timeline SHALL display Browser_Sentinel events alongside pomodoro sessions
4. WHEN a pomodoro is running, THE Browser_Sentinel SHALL report any blocked site access attempts as interruption events
5. THE System SHALL aggregate Browser_Sentinel events by category (productive, neutral, distracting) for the statistics view

### Requirement 9: 网站使用统计

**User Story:** As a user, I want to see detailed statistics about which websites I've used and for how long, so that I can understand my browsing habits and identify time-wasting patterns.

#### Acceptance Criteria

1. THE Statistics_Dashboard SHALL display a pie chart showing time distribution by category (productive, neutral, distracting)
2. THE Statistics_Dashboard SHALL display a ranked list of websites by active usage time
3. THE Statistics_Dashboard SHALL display a horizontal timeline showing website usage throughout the day
4. WHEN calculating usage time, THE System SHALL only count time when the user is actively interacting with the page (not just page open time)
5. WHEN the user has no interaction for more than 60 seconds, THE System SHALL stop counting active time for that page
6. WHEN the user briefly switches tabs (less than 3 seconds), THE System SHALL continue counting time for the original tab
7. THE System SHALL distinguish between "page open time" and "active browsing time" in the statistics
8. WHEN displaying website statistics, THE System SHALL show both visit count and total active time
9. THE Statistics_Dashboard SHALL allow filtering website statistics by the same time ranges as pomodoro statistics (today, week, month, custom)
10. THE System SHALL detect media playback (video/audio) as active usage even without user interaction

### Requirement 10: 预期时间设定与复盘

**User Story:** As a user, I want to set expected daily work time and review my actual performance against the plan, so that I can track my productivity and improve over time.

#### Acceptance Criteria

1. THE User_Settings SHALL allow users to set a daily expected total work time (in hours/minutes)
2. THE User_Settings SHALL allow users to set expected pomodoro count per day
3. THE Statistics_Dashboard SHALL display actual vs expected work time comparison
4. THE Statistics_Dashboard SHALL display actual vs expected pomodoro count comparison
5. WHEN actual time exceeds expected time, THE System SHALL highlight the achievement with positive feedback
6. WHEN actual time is below expected time, THE System SHALL show the gap and remaining time needed
7. THE System SHALL store daily expected values along with actual values for historical comparison
8. THE Statistics_Dashboard SHALL display a weekly/monthly trend chart comparing expected vs actual performance
9. WHEN the user modifies pomodoro duration settings, THE System SHALL recalculate expected time based on expected pomodoro count
10. THE System SHALL allow users to set different expected values for different days of the week (weekday vs weekend)

### Requirement 8: 数据持久化与同步

**User Story:** As a user, I want my pomodoro and activity data to be reliably stored and synced, so that I don't lose my productivity history.

#### Acceptance Criteria

1. THE System SHALL store all pomodoro sessions in the PostgreSQL database
2. THE System SHALL store activity timeline events in the PostgreSQL database
3. WHEN the user is offline, THE System SHALL queue events locally and sync when connection is restored
4. THE System SHALL provide an API endpoint for Browser_Sentinel to submit activity events
5. WHEN syncing activity events, THE System SHALL deduplicate events based on timestamp and type
