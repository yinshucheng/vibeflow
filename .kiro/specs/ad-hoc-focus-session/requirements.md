# Requirements Document

## Introduction

本功能包含两个相关但独立的子功能：

1. **临时专注时段（Ad-hoc Focus Session）**：允许用户在正常工作时间之外临时启动一个专注时段。在这个时段内，系统将像正常工作时间一样屏蔽娱乐网站和分心应用，帮助用户克服拖延症，提高临时工作的效率。

2. **睡眠时间提醒（Sleep Time Reminder）**：允许用户设置睡眠时间，在这个时间段内，桌面应用会关闭指定的软件（如微信、Arc浏览器等），并显示提示用户应该去睡觉的通知。

## Glossary

- **Ad_hoc_Focus_Session**: 用户手动启动的临时专注时段，独立于预设的工作时间
- **Focus_Session_Manager**: 管理临时专注时段的服务组件
- **Policy_Distribution_Service**: 负责编译和分发策略到客户端的服务
- **Browser_Sentinel**: 浏览器扩展，负责执行URL屏蔽策略
- **Desktop_App**: 桌面应用，负责执行分心应用关闭和睡眠提醒策略
- **Work_Time_Slot**: 预设的工作时间段
- **Sleep_Time_Window**: 用户设置的睡眠时间窗口
- **Sleep_Enforcement_App**: 在睡眠时间需要被关闭的应用程序

## Requirements

### Requirement 1: 启动临时专注时段

**User Story:** As a user, I want to start an ad-hoc focus session, so that I can block distracting websites and apps outside of my regular work hours.

#### Acceptance Criteria

1. WHEN a user clicks the "Start Focus Session" button, THE Focus_Session_Manager SHALL create a new ad-hoc focus session with the specified duration
2. WHEN an ad-hoc focus session is started, THE Focus_Session_Manager SHALL record the session start time and planned end time
3. WHEN an ad-hoc focus session is active, THE Policy_Distribution_Service SHALL include the session in the active enforcement policy
4. THE Focus_Session_Manager SHALL allow session durations between 15 minutes and 4 hours
5. WHEN a user attempts to start a session during an existing active session, THE Focus_Session_Manager SHALL reject the request and return an error

### Requirement 2: 策略执行

**User Story:** As a user, I want my ad-hoc focus session to enforce the exact same blocking rules as regular work hours, so that I can stay focused.

#### Acceptance Criteria

1. WHILE an ad-hoc focus session is active, THE Browser_Sentinel SHALL block URLs on the user's blacklist using the same rules as regular work hours
2. WHILE an ad-hoc focus session is active, THE Desktop_App SHALL enforce distraction app policies using the same rules as regular work hours
3. WHILE an ad-hoc focus session is active, THE System SHALL apply the same enforcement mode (strict or gentle) as configured in user settings
4. WHILE an ad-hoc focus session is active, THE System SHALL apply the same skip token rules as regular work hours
5. WHEN an ad-hoc focus session starts, THE Policy_Distribution_Service SHALL broadcast the updated policy to all connected clients within 5 seconds
6. WHEN an ad-hoc focus session ends, THE Policy_Distribution_Service SHALL broadcast the updated policy to remove enforcement
7. WHILE an ad-hoc focus session is active, THE idle alert system SHALL function the same as during regular work hours

### Requirement 3: 结束临时专注时段

**User Story:** As a user, I want my ad-hoc focus session to end automatically or manually, so that I can return to normal browsing when I'm done.

#### Acceptance Criteria

1. WHEN the planned duration expires, THE Focus_Session_Manager SHALL automatically end the ad-hoc focus session
2. WHEN a user clicks "End Session" button, THE Focus_Session_Manager SHALL end the session immediately
3. WHEN an ad-hoc focus session ends, THE Focus_Session_Manager SHALL record the actual end time
4. IF a user attempts to end a session that doesn't exist, THEN THE Focus_Session_Manager SHALL return a NOT_FOUND error

### Requirement 4: 延长临时专注时段

**User Story:** As a user, I want to extend my ad-hoc focus session, so that I can continue working without interruption.

#### Acceptance Criteria

1. WHILE an ad-hoc focus session is active, THE Focus_Session_Manager SHALL allow the user to extend the session duration
2. WHEN a user extends a session, THE Focus_Session_Manager SHALL add the extension time to the current end time
3. THE Focus_Session_Manager SHALL allow extensions between 15 minutes and 2 hours
4. WHEN a session is extended, THE Focus_Session_Manager SHALL update the session record with the new end time

### Requirement 5: 会话状态显示

**User Story:** As a user, I want to see the status of my ad-hoc focus session, so that I know how much time remains.

#### Acceptance Criteria

1. WHEN an ad-hoc focus session is active, THE UI SHALL display the remaining time
2. WHEN an ad-hoc focus session is active, THE UI SHALL display a visual indicator showing the session is active
3. WHEN no ad-hoc focus session is active, THE UI SHALL display the "Start Focus Session" button
4. THE UI SHALL update the remaining time display every second

### Requirement 6: 与工作时间的交互

**User Story:** As a user, I want my ad-hoc focus session to work seamlessly with my regular work hours, so that there's no conflict.

#### Acceptance Criteria

1. WHEN an ad-hoc focus session is active during regular work hours, THE Policy_Distribution_Service SHALL maintain enforcement (no change in behavior)
2. WHEN regular work hours start while an ad-hoc focus session is active, THE Focus_Session_Manager SHALL continue the session until its planned end time
3. WHEN regular work hours end while an ad-hoc focus session is active, THE Focus_Session_Manager SHALL continue the session until its planned end time

### Requirement 7: 快速启动选项

**User Story:** As a user, I want quick preset options for common focus durations, so that I can start a session quickly.

#### Acceptance Criteria

1. THE UI SHALL provide preset duration buttons for 30 minutes, 1 hour, and 2 hours
2. WHEN a user selects a preset duration, THE Focus_Session_Manager SHALL start a session with that duration immediately
3. THE UI SHALL also provide a custom duration input for non-preset durations

### Requirement 8: 会话历史记录

**User Story:** As a user, I want to see my ad-hoc focus session history, so that I can track my extra focus time.

#### Acceptance Criteria

1. THE Focus_Session_Manager SHALL persist all ad-hoc focus sessions to the database
2. WHEN a user views the stats page, THE Stats_Service SHALL include ad-hoc focus session data
3. THE Stats_Service SHALL calculate total ad-hoc focus time for daily and weekly summaries

---

## 睡眠时间提醒功能

### Requirement 9: 睡眠时间设置

**User Story:** As a user, I want to configure my sleep time window, so that the system can remind me to go to sleep.

#### Acceptance Criteria

1. THE Settings_Page SHALL provide inputs for sleep start time and sleep end time
2. THE User_Settings SHALL store the sleep time window configuration
3. THE User_Settings SHALL allow enabling or disabling the sleep time reminder feature
4. WHEN sleep time settings are saved, THE Policy_Distribution_Service SHALL broadcast the updated policy to the Desktop_App

### Requirement 10: 睡眠时间应用管理

**User Story:** As a user, I want to specify which apps should be closed during sleep time, so that I'm not tempted to stay up late.

#### Acceptance Criteria

1. THE Settings_Page SHALL provide a list of apps to close during sleep time
2. THE Settings_Page SHALL provide preset suggestions for common apps (WeChat, Arc Browser, Slack, Discord)
3. THE User_Settings SHALL store the list of sleep enforcement apps separately from distraction apps
4. WHEN a user adds an app to the sleep enforcement list, THE User_Settings SHALL record the app's bundle ID and display name

### Requirement 11: 睡眠时间执行

**User Story:** As a user, I want the system to close specified apps and remind me to sleep during my sleep time window, so that I maintain healthy sleep habits.

#### Acceptance Criteria

1. WHEN the sleep time window starts, THE Desktop_App SHALL close all apps in the sleep enforcement list
2. WHEN the sleep time window starts, THE Desktop_App SHALL display a notification reminding the user to go to sleep
3. WHILE the sleep time window is active, THE Desktop_App SHALL periodically check and close any reopened sleep enforcement apps
4. THE Desktop_App SHALL check for sleep enforcement apps every 5 minutes during the sleep time window
5. WHEN a sleep enforcement app is closed, THE Desktop_App SHALL display a gentle reminder notification

### Requirement 12: 睡眠时间豁免

**User Story:** As a user, I want to temporarily disable sleep time enforcement, so that I can handle urgent matters.

#### Acceptance Criteria

1. WHEN the Desktop_App displays a sleep reminder, THE notification SHALL include a "Snooze 30 minutes" option
2. WHEN a user selects snooze, THE Desktop_App SHALL pause sleep enforcement for 30 minutes
3. THE Desktop_App SHALL limit snooze usage to 2 times per night
4. WHEN snooze limit is reached, THE Desktop_App SHALL display a message indicating no more snoozes are available

### Requirement 13: 睡眠时间与专注时段的交互

**User Story:** As a user, I want to be able to start an ad-hoc focus session during sleep time when necessary, so that I can handle urgent work while the system tracks this behavior.

#### Acceptance Criteria

1. WHEN a user attempts to start an ad-hoc focus session during sleep time, THE Focus_Session_Manager SHALL display a confirmation dialog warning that this will override sleep enforcement
2. WHEN a user confirms starting a focus session during sleep time, THE Focus_Session_Manager SHALL create the session and pause sleep enforcement for the session duration
3. WHEN a focus session overrides sleep time, THE Focus_Session_Manager SHALL record this as a "sleep override" event with timestamp and duration
4. WHEN a sleep-overriding focus session ends, THE Desktop_App SHALL resume sleep enforcement immediately
5. WHILE a sleep-overriding focus session is active, THE Desktop_App SHALL NOT close sleep enforcement apps or display sleep reminders

### Requirement 14: 豁免行为记录

**User Story:** As a user, I want all exemption behaviors to be recorded, so that I can review my sleep and focus patterns.

#### Acceptance Criteria

1. WHEN a user snoozes sleep enforcement, THE System SHALL record the snooze event with timestamp
2. WHEN a user starts a focus session that overrides sleep time, THE System SHALL record the override event with session details
3. THE Stats_Page SHALL display a summary of sleep exemption events (snoozes and focus session overrides)
4. THE Stats_Page SHALL show the total time spent in sleep-overriding focus sessions per week
5. WHEN viewing exemption history, THE UI SHALL display the date, time, type (snooze or focus override), and duration of each event


---

## Dashboard 状态显示与预测功能

### Requirement 15: 当前状态显示

**User Story:** As a user, I want to see my current expected state on the dashboard, so that I know what I should be doing right now.

#### Acceptance Criteria

1. WHEN the user is within work time (regular or ad-hoc), THE Dashboard SHALL display the expected state as one of: "In Pomodoro", "Normal Rest", "Over Rest"
2. WHEN the user is in rest state and rest duration exceeds the configured rest duration, THE Dashboard SHALL display "Over Rest" status with elapsed overtime
3. WHEN the user is in "Over Rest" state, THE Dashboard SHALL display a visual warning indicator
4. THE Dashboard SHALL display the current time context: "Work Time", "Ad-hoc Focus", "Sleep Time", or "Free Time"
5. WHEN the user is outside of work time and not in ad-hoc focus, THE Dashboard SHALL display "Free Time" status

### Requirement 16: 超时休息提醒

**User Story:** As a user, I want to be reminded when I'm resting too long during work hours, so that I can get back to work.

#### Acceptance Criteria

1. WHEN the user enters "Over Rest" state, THE System SHALL trigger configurable reminder actions
2. THE Settings_Page SHALL allow users to configure "Over Rest" reminder actions (close browser, close WeChat, close music apps, show notification)
3. THE Settings_Page SHALL allow users to configure the list of apps to close during "Over Rest"
4. WHEN "Over Rest" reminder is triggered, THE Desktop_App SHALL execute the configured actions
5. THE System SHALL allow configuring a grace period (1-10 minutes) before triggering "Over Rest" actions

### Requirement 17: 每日目标进度追踪

**User Story:** As a user, I want to see my daily pomodoro goal progress, so that I know if I'm on track.

#### Acceptance Criteria

1. THE Dashboard SHALL display the expected daily pomodoro count and completed count
2. THE Dashboard SHALL display a progress bar showing completion percentage
3. THE Dashboard SHALL display the remaining pomodoros needed to meet the daily goal
4. WHEN the user has completed the daily goal, THE Dashboard SHALL display a success indicator

### Requirement 18: 剩余时间预测

**User Story:** As a user, I want to know if I can still meet my daily goal with the remaining work time, so that I can adjust my pace.

#### Acceptance Criteria

1. THE Dashboard SHALL calculate the remaining work time for today (including scheduled work time slots)
2. THE Dashboard SHALL calculate the maximum possible pomodoros in the remaining work time based on current pomodoro duration setting and rest intervals
3. THE Dashboard SHALL compare remaining goal with maximum possible pomodoros
4. WHEN the remaining goal exceeds maximum possible pomodoros, THE Dashboard SHALL display a "Goal at Risk" warning
5. THE Dashboard SHALL display the minimum pomodoro pace required to meet the daily goal (e.g., "Need 1 pomodoro every 45 minutes")
6. THE Dashboard SHALL recalculate predictions when pomodoro duration setting changes

### Requirement 19: 压力指标显示

**User Story:** As a user, I want to see a pressure indicator showing how likely I am to meet my daily goal, so that I can manage my time better.

#### Acceptance Criteria

1. THE Dashboard SHALL display a "Pressure Level" indicator with values: "On Track", "Moderate", "High", "Critical"
2. THE Pressure_Level SHALL be calculated based on: remaining pomodoros needed, remaining work time, and current pace
3. WHEN Pressure_Level is "On Track", THE indicator SHALL be green and show "Plenty of time"
4. WHEN Pressure_Level is "Moderate", THE indicator SHALL be yellow and show "Stay focused"
5. WHEN Pressure_Level is "High", THE indicator SHALL be orange and show "Pick up the pace"
6. WHEN Pressure_Level is "Critical", THE indicator SHALL be red and show "Goal at risk"
7. THE Dashboard SHALL update the Pressure_Level in real-time as time passes and pomodoros are completed

### Requirement 19.1: 目标风险建议

**User Story:** As a user, I want to receive actionable suggestions when my daily goal is at risk, so that I can take corrective action.

#### Acceptance Criteria

1. WHEN Pressure_Level is "High" or "Critical", THE Dashboard SHALL display a "Suggestions" panel
2. THE Suggestions panel SHALL calculate and display the additional work time needed to meet the goal
3. THE Suggestions panel SHALL offer a "Start Ad-hoc Focus Session" button with the recommended duration pre-filled
4. THE Suggestions panel SHALL offer an "Adjust Today's Goal" option with a suggested reduced target
5. WHEN the user clicks "Adjust Today's Goal", THE System SHALL allow reducing the daily goal for today only without changing the default setting
6. THE Suggestions panel SHALL display the trade-off: "Add X minutes of work time OR reduce goal by Y pomodoros"
7. WHEN it's impossible to meet the goal even with maximum effort, THE Dashboard SHALL suggest focusing on high-priority tasks instead

### Requirement 20: 任务预期时间

**User Story:** As a user, I want to estimate the time needed for each task, so that I can plan my day better.

#### Acceptance Criteria

1. THE Task_Form SHALL include an optional "Estimated Time" field in minutes
2. THE Task_Form SHALL provide quick presets: 25min (1 pomodoro), 50min (2 pomodoros), 75min (3 pomodoros), custom
3. THE Task_Detail_Page SHALL display the estimated time and calculated pomodoro count based on current pomodoro duration setting
4. THE Task_Detail_Page SHALL display the actual time spent vs estimated time
5. THE Task_List SHALL display the estimated time for each task
6. WHEN pomodoro duration setting changes, THE System SHALL recalculate the estimated pomodoro count for all tasks

### Requirement 21: 项目预期时间

**User Story:** As a user, I want to see the total estimated time for a project, so that I can understand the project scope.

#### Acceptance Criteria

1. THE Project_Detail_Page SHALL display the sum of estimated time from all tasks
2. THE Project_Detail_Page SHALL display the calculated pomodoro count based on current pomodoro duration setting
3. THE Project_Detail_Page SHALL display the completed time vs estimated total
4. THE Project_List SHALL display the estimated time and pomodoro count for each project
5. THE Project_Form SHALL allow setting an overall estimated time (optional, can be auto-calculated from tasks)

### Requirement 22: 每日计划建议

**User Story:** As a user, I want the system to suggest which tasks to work on based on estimates and remaining time, so that I can prioritize effectively.

#### Acceptance Criteria

1. WHEN the user views the Dashboard, THE System SHALL suggest tasks that fit within the remaining work time
2. THE suggestion algorithm SHALL prioritize tasks by: priority (P1 > P2 > P3), plan date (today first), and estimated duration
3. THE Dashboard SHALL display a "Suggested Tasks" section with 1-3 recommended tasks
4. WHEN a task's estimated pomodoros exceed remaining work time, THE Dashboard SHALL indicate it may need to be split or deferred


### Requirement 23: 今日目标临时调整

**User Story:** As a user, I want to adjust my daily goal for today without changing my default settings, so that I can be flexible on unusual days.

#### Acceptance Criteria

1. THE Dashboard SHALL provide a "Adjust Today's Goal" button
2. WHEN adjusting today's goal, THE System SHALL only modify the goal for the current day
3. THE adjusted goal SHALL be stored in DailyState and not affect UserSettings
4. THE Dashboard SHALL display an indicator when today's goal differs from the default
5. THE next day SHALL automatically reset to the default goal from UserSettings

### Requirement 24: 历史效率分析

**User Story:** As a user, I want to see my historical efficiency patterns, so that I can set more realistic goals.

#### Acceptance Criteria

1. THE Stats_Page SHALL display average pomodoros completed per day over the past 7 and 30 days
2. THE Stats_Page SHALL display the percentage of days where the daily goal was met
3. THE Stats_Page SHALL display the average time between pomodoros (rest efficiency)
4. WHEN setting daily goals, THE Settings_Page SHALL display the historical average as a reference
5. THE Stats_Page SHALL identify patterns such as "You typically complete more pomodoros on Tuesdays"

### Requirement 24.1: 分时段效率分析

**User Story:** As a user, I want to see my efficiency patterns by time of day, so that I can optimize my schedule.

#### Acceptance Criteria

1. THE Stats_Page SHALL display efficiency breakdown by time periods: Morning (before 12:00), Afternoon (12:00-18:00), Evening (after 18:00)
2. THE Stats_Page SHALL show average pomodoros completed in each time period
3. THE Stats_Page SHALL show completion rate (completed vs started) for each time period
4. THE Stats_Page SHALL highlight the most productive time period with a visual indicator
5. THE Stats_Page SHALL display insights such as "Your morning efficiency is 40% higher than afternoon"
6. THE Stats_Page SHALL show a heatmap of productivity by hour of day over the past 30 days

### Requirement 25: 智能目标建议

**User Story:** As a user, I want the system to suggest realistic daily goals based on my history, so that I can set achievable targets.

#### Acceptance Criteria

1. THE Settings_Page SHALL display a "Suggested Goal" based on historical performance
2. THE suggested goal SHALL be calculated as the 75th percentile of completed pomodoros over the past 30 days
3. WHEN the user's current goal is significantly higher than their historical average, THE System SHALL display a warning
4. THE System SHALL suggest adjusting the goal if the user consistently fails to meet it (less than 50% success rate over 2 weeks)

### Requirement 26: 早期预警通知

**User Story:** As a user, I want to receive early warnings when I'm falling behind, so that I can course-correct before it's too late.

#### Acceptance Criteria

1. THE System SHALL calculate expected progress at configurable intervals during the work day
2. WHEN actual progress falls below the configured threshold of expected progress, THE System SHALL display an "Falling Behind" notification
3. THE notification SHALL include the current gap (e.g., "2 pomodoros behind schedule")
4. THE notification SHALL offer quick actions: "Start Pomodoro Now" or "View Suggestions"
5. THE System SHALL respect the configured notification frequency to avoid notification fatigue

### Requirement 26.1: 早期预警配置

**User Story:** As a user, I want to configure the early warning system, so that it matches my preferences.

#### Acceptance Criteria

1. THE Settings_Page SHALL allow enabling or disabling early warning notifications
2. THE Settings_Page SHALL allow configuring the check interval: 30 minutes, 1 hour, or 2 hours
3. THE Settings_Page SHALL allow configuring the warning threshold: 50%, 60%, 70%, or 80% of expected progress
4. THE Settings_Page SHALL allow configuring the notification method: browser notification, desktop notification, or both
5. THE Settings_Page SHALL allow setting quiet hours during which no warnings are sent (e.g., during lunch break)
6. THE default configuration SHALL be: enabled, 1 hour interval, 70% threshold, browser notificat
