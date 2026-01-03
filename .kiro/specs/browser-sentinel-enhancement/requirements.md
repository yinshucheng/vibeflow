# Requirements Document

## Introduction

本文档定义了 Browser Sentinel（浏览器插件）的增强需求，旨在与桌面客户端的功能对齐，并增加娱乐时间管理和活动追踪功能。主要改进包括：

1. **Over Rest 状态处理**：在 over_rest 状态下限制浏览器只能访问 Dashboard
2. **工作时间娱乐网站屏蔽**：在工作时间内屏蔽娱乐网站（如 Twitter、微博、YouTube 等）
3. **状态管理梳理**：明确各状态下的浏览器行为，包含子状态机
4. **默认连接**：使用默认账户自动连接后端服务
5. **娱乐时间配额**：每日娱乐时间配额管理，仅在非工作时间可开启娱乐模式
6. **活动追踪与时间线**：类似 ActivityWatch 的网站使用追踪，与桌面端统一协议上报到服务端

## Glossary

- **Browser_Sentinel**: 浏览器插件，Chrome Extension Manifest V3，负责监控和控制浏览器行为
- **Dashboard**: VibeFlow 的主界面页面（默认 http://localhost:3000）
- **Over_Rest**: 超时休息状态，用户在工作时间内休息时间超过配置的宽限期
- **Work_Time**: 工作时间，用户配置的工作时间段
- **Entertainment_Site**: 娱乐网站，如社交媒体、视频网站等，在工作时间内应被屏蔽
- **Entertainment_Mode**: 娱乐模式，用户主动开启的娱乐时间，仅在非工作时间可用
- **Entertainment_Quota**: 娱乐配额，每日允许的娱乐时间总量（默认 2 小时）
- **Entertainment_Cooldown**: 娱乐冷却时间，两次娱乐模式之间的最小间隔（默认 30 分钟）
- **Focus_State**: 专注状态，包括 FOCUS（番茄时间）和 REST（正常休息）
- **Default_User**: 默认用户账户，用于开发阶段的自动连接
- **Activity_Timeline**: 活动时间线，展示用户一天的网站和应用使用情况
- **Activity_Event**: 活动事件，记录用户在某个网站或应用上的使用时间段
- **Time_Bucket**: 时间桶，用于聚合活动数据的时间粒度（如 5 分钟、15 分钟）
- **Entertainment_Blacklist**: 娱乐黑名单，整个域名被屏蔽的娱乐网站
- **Entertainment_Whitelist**: 娱乐白名单，娱乐网站中允许访问的特定页面（如收藏页）

## State Machine

### 主状态机

VibeFlow 系统使用以下主状态：

```
┌─────────────────────────────────────────────────────────────────┐
│                        System States                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────┐    COMPLETE_AIRLOCK    ┌──────────┐              │
│   │  LOCKED  │ ─────────────────────► │ PLANNING │              │
│   └──────────┘                        └──────────┘              │
│        ▲                                   │                     │
│        │                          START_POMODORO                 │
│        │                                   │                     │
│        │                                   ▼                     │
│        │                              ┌──────────┐              │
│   DAILY_RESET                         │  FOCUS   │              │
│        │                              └──────────┘              │
│        │                                   │                     │
│        │                      COMPLETE_POMODORO                  │
│        │                                   │                     │
│        │                                   ▼                     │
│        │                              ┌──────────┐              │
│        └──────────────────────────────│   REST   │              │
│                                       └──────────┘              │
│                                            │                     │
│                                   COMPLETE_REST                  │
│                                            │                     │
│                                            ▼                     │
│                                       ┌──────────┐              │
│                                       │ PLANNING │              │
│                                       └──────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

### 状态说明

| 状态 | 说明 | 触发条件 | 浏览器行为 |
|------|------|----------|------------|
| LOCKED | 一天开始前的锁定状态，需要完成 Airlock 才能开始工作 | 每日 04:00 自动重置 | 仅允许 Dashboard（无论是否在工作时间内） |
| PLANNING | 计划状态，可以管理任务、开始番茄钟 | 完成 Airlock 后进入 | 屏蔽娱乐网站 |
| FOCUS | 专注状态，番茄钟进行中 | 开始番茄钟后进入 | 屏蔽黑名单+娱乐网站，未知网站软干预 |
| REST | 休息状态，番茄钟完成后的休息时间 | 完成番茄钟后进入 | 屏蔽娱乐网站 |
| OVER_REST | 超时休息状态 | 休息时间超过宽限期 | 仅允许 Dashboard |

### LOCKED 状态的特殊处理

LOCKED 状态需要强制用户完成 Airlock 才能正常使用电脑，防止用户逃避工作启动：

**核心逻辑**：只要当天还没完成 Airlock，无论当前时间是否在配置的工作时间内，都应该限制浏览行为。这是为了防止用户通过"等到工作时间结束"来逃避完成 Airlock。

**场景示例**：
- 工作时间 10:00-12:00，用户 9:30 打开电脑 → LOCKED 限制生效
- 工作时间 10:00-12:00，用户 13:00 打开电脑（上午摸鱼了）→ LOCKED 限制仍然生效
- 工作时间 10:00-12:00，用户 22:00 打开电脑（一天都没工作）→ LOCKED 限制仍然生效
- 用户完成 Airlock 后 → 进入 PLANNING，限制解除，同时记录工作启动时间

```
┌─────────────────────────────────────────────────────────────────┐
│                   LOCKED State Behavior                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │                    LOCKED State                           │  │
│   │                                                           │  │
│   │   ┌─────────────────────────────────────────────────┐    │  │
│   │   │  Airlock Not Completed Today                     │    │  │
│   │   │                                                  │    │  │
│   │   │  → Dashboard Only (regardless of work time)      │    │  │
│   │   │  → 显示 "请完成今日计划"                          │    │  │
│   │   │  → 记录工作启动延迟时间                          │    │  │
│   │   └─────────────────────────────────────────────────┘    │  │
│   │                                                           │  │
│   │   ┌─────────────────────────────────────────────────┐    │  │
│   │   │  After Airlock Completed                         │    │  │
│   │   │                                                  │    │  │
│   │   │  → 进入 PLANNING 状态                            │    │  │
│   │   │  → 记录工作启动时间到时间线                      │    │  │
│   │   └─────────────────────────────────────────────────┘    │  │
│   │                                                           │  │
│   └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 子状态：Over Rest

Over Rest 是 REST 状态的一个子状态，当休息时间超过配置的宽限期时触发：

```
┌─────────────────────────────────────────────────────────────────┐
│                     REST State (Sub-states)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────┐    GRACE_PERIOD_EXCEEDED    ┌─────────────┐  │
│   │ NORMAL_REST  │ ──────────────────────────► │  OVER_REST  │  │
│   └──────────────┘                             └─────────────┘  │
│         ▲                                            │          │
│         │                                            │          │
│         │              START_POMODORO                │          │
│         │                    │                       │          │
│         │                    ▼                       │          │
│         │              ┌──────────┐                  │          │
│         └──────────────│  FOCUS   │◄─────────────────┘          │
│                        └──────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

### 娱乐模式状态

娱乐模式是一个独立的状态层，仅在非工作时间可用：

```
┌─────────────────────────────────────────────────────────────────┐
│                   Entertainment Mode States                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────┐    START_ENTERTAINMENT    ┌───────────────┐  │
│   │   INACTIVE   │ ────────────────────────► │    ACTIVE     │  │
│   │              │                           │               │  │
│   │ (可启动条件: │                           │ (倒计时中)    │  │
│   │  - 非工作时间│                           │               │  │
│   │  - 配额>0    │                           └───────────────┘  │
│   │  - 冷却结束) │                                  │          │
│   └──────────────┘                                  │          │
│         ▲                                           │          │
│         │                                           │          │
│         │         STOP_ENTERTAINMENT /              │          │
│         │         QUOTA_EXHAUSTED /                 │          │
│         │         WORK_TIME_START                   │          │
│         │                                           │          │
│         └───────────────────────────────────────────┘          │
│                                                                  │
│   ┌──────────────┐                                              │
│   │   COOLDOWN   │  (最近30分钟内使用过，不可再次启动)          │
│   └──────────────┘                                              │
└─────────────────────────────────────────────────────────────────┘
```

## Requirements

### Requirement 1: Over Rest 和 Locked 状态浏览器行为

**User Story:** As a user in over_rest or locked state, I want the browser to only allow access to the Dashboard, so that I am reminded to complete my daily planning or start working.

#### Acceptance Criteria

1. WHEN the system state is OVER_REST, THE Browser_Sentinel SHALL redirect all non-Dashboard tabs to the Dashboard page
2. WHEN the system state is LOCKED (Airlock not completed today), THE Browser_Sentinel SHALL redirect all non-Dashboard tabs to the Dashboard page (same behavior as OVER_REST, regardless of Work_Time)
3. WHEN the system state is OVER_REST OR LOCKED AND a Dashboard tab already exists, THE Browser_Sentinel SHALL activate the existing Dashboard tab instead of opening a new one
4. WHEN the system state is OVER_REST OR LOCKED AND user attempts to open a new tab, THE Browser_Sentinel SHALL redirect it to the Dashboard
5. WHEN the system state changes from OVER_REST or LOCKED to another state, THE Browser_Sentinel SHALL restore normal browsing behavior
6. WHEN the system state is OVER_REST, THE Browser_Sentinel SHALL display a visual indicator showing "超时休息中，请开始工作"
7. WHEN the system state is LOCKED, THE Browser_Sentinel SHALL display a visual indicator showing "请完成今日计划"
8. THE Browser_Sentinel SHALL receive state updates from the Vibe_Brain via WebSocket
9. THE Desktop_Client SHALL have the same behavior for LOCKED and OVER_REST states (close distracting apps, only allow VibeFlow)
10. THE LOCKED state restriction SHALL apply regardless of whether current time is within configured Work_Time - the key condition is Airlock completion status

### Requirement 2: 工作时间娱乐网站屏蔽

**User Story:** As a user during work hours, I want entertainment sites to be blocked, so that I can stay focused on work.

#### Acceptance Criteria

1. WHEN within Work_Time AND NOT in Entertainment_Mode, THE Browser_Sentinel SHALL block access to Entertainment_Blacklist sites
2. WHEN blocking an Entertainment_Site, THE Browser_Sentinel SHALL redirect to a screensaver page with a message explaining the block
3. THE Browser_Sentinel SHALL support a configurable Entertainment_Blacklist (domain-level blocking)
4. THE Entertainment_Blacklist SHALL include default entries: twitter.com, x.com, weibo.com, youtube.com, bilibili.com, tiktok.com, douyin.com, instagram.com, facebook.com, reddit.com, twitch.tv
5. THE Browser_Sentinel SHALL support a configurable Entertainment_Whitelist (specific URL patterns allowed within blacklisted domains)
6. THE Entertainment_Whitelist SHALL allow patterns like: weibo.com/fav/*, twitter.com/i/bookmarks, bilibili.com/video/*, bilibili.com/search/*
7. WHEN a URL matches both Entertainment_Blacklist domain AND Entertainment_Whitelist pattern, THE Browser_Sentinel SHALL allow access
8. THE User SHALL be able to add custom Entertainment_Blacklist entries via the settings page
9. THE User SHALL be able to add custom Entertainment_Whitelist entries via the settings page
10. WHEN in Entertainment_Mode, THE Browser_Sentinel SHALL allow access to all Entertainment_Sites
11. THE Browser_Sentinel SHALL distinguish between Entertainment_Sites (blocked during work time) and Focus_Blacklist sites (blocked during focus mode)

### Requirement 3: 状态管理与行为定义

**User Story:** As a developer, I want clear state-based behavior definitions, so that the browser extension behaves consistently.

#### Acceptance Criteria

1. WHEN system state is LOCKED AND within Work_Time, THE Browser_Sentinel SHALL only allow Dashboard access (same as OVER_REST)
2. WHEN system state is LOCKED AND NOT within Work_Time, THE Browser_Sentinel SHALL allow normal browsing without restrictions
3. WHEN system state is PLANNING, THE Browser_Sentinel SHALL block Entertainment_Blacklist sites during Work_Time
4. WHEN system state is FOCUS (pomodoro active), THE Browser_Sentinel SHALL block Focus_Blacklist sites AND Entertainment_Blacklist sites, and show soft intervention for unknown sites
5. WHEN system state is REST (normal break within grace period), THE Browser_Sentinel SHALL block Entertainment_Blacklist sites during Work_Time
6. WHEN system state is OVER_REST (rest exceeded grace period), THE Browser_Sentinel SHALL only allow Dashboard access
7. WHEN NOT within Work_Time AND NOT in Entertainment_Mode, THE Browser_Sentinel SHALL block Entertainment_Blacklist sites (except Entertainment_Whitelist patterns)
8. WHEN in Entertainment_Mode, THE Browser_Sentinel SHALL allow all Entertainment_Sites regardless of Work_Time
9. THE Browser_Sentinel SHALL sync state with Vibe_Brain via WebSocket in real-time
10. THE Browser_Sentinel SHALL cache the last known state for offline operation
11. THE Browser_Sentinel SHALL use the same Octopus protocol as Desktop_Client for state sync

### Requirement 4: 默认连接与账户

**User Story:** As a user, I want the browser extension to automatically connect to the backend, so that I don't need to manually configure it.

#### Acceptance Criteria

1. WHEN the Browser_Sentinel is installed or browser starts, THE Browser_Sentinel SHALL automatically attempt to connect to the default server URL (http://localhost:3000)
2. THE Browser_Sentinel SHALL use a default user email (dev@vibeflow.local) for development mode
3. THE Browser_Sentinel SHALL store connection status and reconnect automatically on browser restart
4. WHEN connection fails, THE Browser_Sentinel SHALL retry with exponential backoff (max 5 attempts)
5. THE Browser_Sentinel SHALL display connection status in the popup UI
6. THE User SHALL be able to manually disconnect and reconnect via the popup UI
7. THE Browser_Sentinel SHALL NOT require manual email input in development mode
8. THE Browser_Sentinel SHALL be connected by default after installation (not disconnected)

### Requirement 5: 娱乐时间配额管理

**User Story:** As a user, I want to have a daily entertainment quota, so that I can enjoy entertainment responsibly outside work hours.

#### Acceptance Criteria

1. THE System SHALL provide a configurable daily Entertainment_Quota (default: 120 minutes, range: 30-480 minutes)
2. WHEN NOT within Work_Time AND Entertainment_Quota remaining > 0 AND Entertainment_Cooldown has passed, THE User SHALL be able to start Entertainment_Mode
3. WHEN within Work_Time, THE User SHALL NOT be able to start Entertainment_Mode
4. WHEN Entertainment_Mode is active, THE Browser_Sentinel SHALL track time spent on Entertainment_Sites
5. WHEN Entertainment_Quota is exhausted, THE Browser_Sentinel SHALL automatically end Entertainment_Mode
6. WHEN Entertainment_Quota is exhausted, THE Browser_Sentinel SHALL block Entertainment_Sites until the next day
7. THE Entertainment_Quota SHALL reset at 04:00 AM daily (same as daily state reset)
8. THE Browser_Sentinel SHALL display remaining Entertainment_Quota in the popup UI
9. THE User SHALL be able to manually end Entertainment_Mode before quota is exhausted
10. WHEN Entertainment_Mode ends, THE Browser_Sentinel SHALL close all Entertainment_Site tabs
11. THE Browser_Sentinel SHALL persist Entertainment_Quota usage to the server
12. THE Entertainment_Quota configuration SHALL only be modifiable during non-Work_Time
13. THE Entertainment_Cooldown SHALL be configurable (default: 30 minutes, range: 15-120 minutes)
14. WHEN Entertainment_Mode ends, THE System SHALL start Entertainment_Cooldown timer

### Requirement 6: 娱乐模式启动与控制

**User Story:** As a user, I want to easily start and stop entertainment mode, so that I can manage my leisure time.

#### Acceptance Criteria

1. THE Browser_Sentinel popup SHALL display a "Start Entertainment Mode" button when NOT within Work_Time AND quota remaining > 0 AND cooldown has passed
2. WHEN starting Entertainment_Mode, THE Browser_Sentinel SHALL display remaining quota time
3. THE Browser_Sentinel popup SHALL display a countdown timer showing remaining Entertainment_Mode time
4. THE Browser_Sentinel popup SHALL display a "Stop Entertainment Mode" button when Entertainment_Mode is active
5. WHEN Entertainment_Mode has 5 minutes remaining, THE Browser_Sentinel SHALL show a warning notification
6. WHEN Entertainment_Mode has 1 minute remaining, THE Browser_Sentinel SHALL show a final warning notification
7. IF within Work_Time, THE "Start Entertainment Mode" button SHALL be disabled with message "仅在非工作时间可用"
8. IF Entertainment_Quota is exhausted, THE "Start Entertainment Mode" button SHALL be disabled with message "今日配额已用完"
9. IF Entertainment_Cooldown is active, THE "Start Entertainment Mode" button SHALL be disabled with message "冷却中，还需等待 X 分钟"
10. THE popup SHALL display the last Entertainment_Mode end time and cooldown remaining

### Requirement 7: 娱乐网站设置界面

**User Story:** As a user, I want to manage my entertainment site list, so that I can customize which sites are blocked during work hours.

#### Acceptance Criteria

1. THE Settings page SHALL include an "Entertainment Sites" section with two sub-sections: Blacklist and Whitelist
2. THE Entertainment Blacklist section SHALL display the current list of blocked domains
3. THE Entertainment Whitelist section SHALL display the current list of allowed URL patterns
4. THE User SHALL be able to add new Entertainment_Blacklist entries via a text input
5. THE User SHALL be able to add new Entertainment_Whitelist entries via a text input
6. THE User SHALL be able to remove custom Entertainment entries by clicking a remove button
7. THE Entertainment Sites section SHALL display preset sites with a "preset" badge
8. THE User SHALL NOT be able to remove preset Entertainment_Blacklist entries (only disable them)
9. THE Entertainment Sites settings SHALL sync with the server
10. WHEN adding an Entertainment entry, THE System SHALL validate the URL pattern format
11. THE Entertainment Sites settings SHALL only be modifiable during non-Work_Time
12. WHEN within Work_Time, THE settings page SHALL display a message "工作时间内无法修改娱乐网站设置"

### Requirement 8: 服务端娱乐配额管理

**User Story:** As a system, I want to track entertainment quota on the server, so that quota is consistent across devices.

#### Acceptance Criteria

1. THE Vibe_Brain SHALL store daily Entertainment_Quota usage per user
2. THE Vibe_Brain SHALL provide an API to get current Entertainment_Quota status (remaining, used, cooldown)
3. THE Vibe_Brain SHALL provide an API to start Entertainment_Mode
4. THE Vibe_Brain SHALL provide an API to stop Entertainment_Mode
5. THE Vibe_Brain SHALL provide an API to update Entertainment_Quota usage
6. THE Vibe_Brain SHALL broadcast Entertainment_Mode state changes to all connected clients
7. WHEN Entertainment_Mode is active on any client, THE Vibe_Brain SHALL track usage time
8. THE Vibe_Brain SHALL automatically end Entertainment_Mode when quota is exhausted
9. THE Vibe_Brain SHALL track Entertainment_Cooldown and prevent starting during cooldown

### Requirement 9: 娱乐网站配置存储

**User Story:** As a system, I want to store entertainment site configuration, so that settings persist across sessions.

#### Acceptance Criteria

1. THE UserSettings model SHALL include an entertainmentBlacklist field (array of domain patterns)
2. THE UserSettings model SHALL include an entertainmentWhitelist field (array of URL patterns)
3. THE UserSettings model SHALL include an entertainmentQuotaMinutes field (default: 120)
4. THE UserSettings model SHALL include an entertainmentCooldownMinutes field (default: 30)
5. THE Vibe_Brain SHALL provide tRPC endpoints for managing Entertainment settings
6. THE Vibe_Brain SHALL include Entertainment settings in the policy distributed to clients
7. THE Browser_Sentinel SHALL cache Entertainment settings locally for offline operation

### Requirement 10: 活动追踪与时间线

**User Story:** As a user, I want to see a timeline of my website usage throughout the day, so that I can understand how I spend my time online.

#### Acceptance Criteria

1. THE Browser_Sentinel SHALL track all website visits with start time, end time, and duration
2. THE Browser_Sentinel SHALL aggregate website usage into Time_Buckets (configurable: 5, 15, or 30 minutes)
3. THE Browser_Sentinel SHALL report Activity_Events to the Vibe_Brain using the Octopus protocol (same as Desktop_Client)
4. THE Activity_Events SHALL include: url, domain, title, startTime, endTime, duration, category, source
5. THE Vibe_Brain SHALL store Activity_Events in the TimelineEvent model
6. THE Vibe_Brain SHALL aggregate Activity_Events by domain and time bucket for display
7. THE Timeline view SHALL display browser activity alongside desktop app activity (from Desktop client)
8. THE Timeline view SHALL show activity during Pomodoro sessions with visual distinction
9. THE Timeline view SHALL support filtering by date, category, and source (browser/desktop)
10. THE Activity tracking SHALL respect user privacy by not tracking content, only URLs and durations
11. THE Browser_Sentinel SHALL use the same event format as Desktop_Client for consistency

### Requirement 11: 活动数据聚合与展示

**User Story:** As a user, I want to see aggregated statistics of my daily activity, so that I can understand my productivity patterns.

#### Acceptance Criteria

1. THE Vibe_Brain SHALL aggregate Activity_Events from both Browser_Sentinel and Desktop_Client
2. THE aggregated data SHALL include: total time per domain/app, category breakdown, hourly distribution
3. THE Timeline page SHALL display a visual timeline similar to ActivityWatch
4. THE Timeline SHALL use color coding: green for productive, yellow for neutral, red for distracting, purple for entertainment
5. THE Timeline SHALL show Entertainment_Mode periods with a distinct visual indicator (purple background)
6. THE Timeline SHALL support zooming in/out to adjust time granularity (5min, 15min, 30min, 1hour)
7. THE Statistics page SHALL show daily/weekly/monthly activity summaries
8. THE Statistics page SHALL show top websites/apps by time spent
9. THE Statistics page SHALL show productivity score based on category distribution
10. THE data aggregation SHALL handle overlapping events from multiple sources correctly (deduplicate)

### Requirement 12: 娱乐时间在时间线上的展示

**User Story:** As a user, I want to see my entertainment time on the timeline, so that I can track my leisure activities.

#### Acceptance Criteria

1. WHEN Entertainment_Mode is active, THE Browser_Sentinel SHALL create a TimelineEvent of type "entertainment_mode"
2. THE Entertainment_Mode TimelineEvent SHALL include: startTime, endTime, duration, sites visited
3. THE Timeline view SHALL display Entertainment_Mode periods with a distinct visual style (purple background)
4. THE Timeline view SHALL show Entertainment_Sites visited during Entertainment_Mode
5. THE Statistics page SHALL show total Entertainment_Mode time per day/week
6. THE Statistics page SHALL show Entertainment_Quota usage vs remaining
7. THE Entertainment_Mode events SHALL be distinguishable from regular browsing activity

### Requirement 13: 桌面端与浏览器端数据统一

**User Story:** As a user, I want to see all my activity (browser and desktop apps) in one unified timeline, so that I can get a complete picture of my day.

#### Acceptance Criteria

1. THE Desktop_Client SHALL report app usage Activity_Events to the Vibe_Brain using Octopus protocol
2. THE Desktop_Client Activity_Events SHALL include: appBundleId, appName, windowTitle, startTime, endTime, duration, category
3. THE Vibe_Brain SHALL merge Activity_Events from Browser_Sentinel and Desktop_Client into a unified timeline
4. THE Timeline view SHALL display both browser and desktop activities with source indicators (browser icon / desktop icon)
5. THE Timeline view SHALL handle overlapping activities (e.g., browser in foreground while app runs in background)
6. THE Statistics page SHALL show combined productivity metrics from all sources
7. THE data format for Activity_Events SHALL be consistent between Browser_Sentinel and Desktop_Client
8. THE Octopus protocol event types SHALL include: BROWSER_ACTIVITY, DESKTOP_ACTIVITY, ENTERTAINMENT_MODE

### Requirement 14: 工作启动时间追踪

**User Story:** As a user, I want to see when I started working each day on the timeline, so that I can track my work avoidance patterns and improve my discipline.

#### Acceptance Criteria

1. WHEN the user completes Airlock (transitions from LOCKED to PLANNING), THE System SHALL record the work start time as a TimelineEvent
2. THE work start TimelineEvent SHALL include: timestamp, configured work start time, actual start time, delay duration
3. THE Timeline view SHALL display the work start event with a distinct visual marker (e.g., green flag for on-time, yellow/red for delayed)
4. THE Timeline view SHALL show the delay duration if the user started work later than the configured work start time
5. THE Statistics page SHALL show average work start delay per day/week/month
6. THE Statistics page SHALL show a trend chart of work start times over time
7. THE System SHALL calculate work start delay as: actual_airlock_completion_time - configured_work_start_time
8. IF the user completes Airlock before the configured work start time, THE delay SHALL be recorded as 0 (not negative)
9. THE work start event SHALL be distinguishable from other timeline events with a unique event type "WORK_START"
10. THE Browser_Sentinel and Desktop_Client SHALL both be able to trigger work start recording when Airlock is completed
