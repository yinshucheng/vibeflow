# Requirements Document

## Introduction

VibeFlow iOS MVP 是 VibeFlow 生产力系统的 iOS 移动端最小可行版本。该版本遵循八爪鱼架构 (Octopus Architecture)，作为一个 Tentacle 客户端连接到 Vibe Brain。MVP 版本专注于两个核心能力：
1. **只读状态感知**：查看番茄钟状态、当前工作、今日已安排任务
2. **专注模式 App 屏蔽**：在番茄钟进行中时，通过 iOS Screen Time API 屏蔽干扰 App（如微信、微博）

本版本不支持任何状态修改操作，所有数据变更必须通过 Web 或桌面端完成。

## Glossary

- **iOS_App**: React Native + Expo 构建的 iOS 应用程序
- **Vibe_Brain**: VibeFlow 云端核心服务，负责状态管理和决策
- **Tentacle**: 八爪鱼架构中的边缘客户端，iOS_App 是其中之一
- **WebSocket_Client**: 与 Vibe Brain 建立实时连接的 WebSocket 客户端
- **Screen_Time_API**: iOS 原生 Screen Time / Family Controls API，用于 App 屏蔽
- **Policy_Cache**: 本地缓存的策略数据，支持离线场景
- **Heartbeat_Service**: 定期向服务器发送心跳的服务
- **State_Sync_Service**: 接收并处理服务器状态同步的服务

## Requirements

### Requirement 1: 项目初始化与八爪鱼架构集成

**User Story:** As a developer, I want to set up an iOS app that integrates with the Octopus Architecture, so that it can function as a proper Tentacle client.

#### Acceptance Criteria

1. THE iOS_App SHALL be built using React Native with Expo managed workflow
2. THE iOS_App SHALL be located in `vibeflow-ios/` directory at the project root
3. THE iOS_App SHALL register as a Tentacle client with clientType 'mobile' upon launch
4. THE iOS_App SHALL generate and persist a unique clientId using secure storage
5. THE iOS_App SHALL declare capabilities as ['sensor:heartbeat', 'action:app_block'] during registration
6. THE iOS_App SHALL use TypeScript with strict mode enabled
7. THE iOS_App SHALL share type definitions from `src/types/octopus.ts` with the main project

### Requirement 2: WebSocket 连接与状态同步

**User Story:** As a user, I want my iOS app to stay synchronized with the server, so that I always see the current state of my work.

#### Acceptance Criteria

1. THE WebSocket_Client SHALL establish connection to Vibe Brain using Socket.io client
2. WHEN the WebSocket_Client connects, THEN THE iOS_App SHALL send a HEARTBEAT event with platform 'ios'
3. WHEN the WebSocket_Client receives a SYNC_STATE command, THEN THE State_Sync_Service SHALL update local state
4. THE WebSocket_Client SHALL implement automatic reconnection with exponential backoff (1s, 2s, 4s, max 30s)
5. WHEN the WebSocket_Client disconnects, THEN THE iOS_App SHALL display a connection status indicator
6. THE Heartbeat_Service SHALL send HEARTBEAT events every 30 seconds while connected
7. WHEN the app enters background, THEN THE WebSocket_Client SHALL maintain connection for up to 3 minutes

### Requirement 3: 开发模式认证

**User Story:** As a developer, I want to use a default user for development, so that I can quickly test the app without login flow.

#### Acceptance Criteria

1. THE iOS_App SHALL use a hardcoded default user (test@example.com) for MVP development
2. THE iOS_App SHALL NOT implement login UI in MVP version
3. THE iOS_App SHALL pass user identifier via HTTP header (X-Dev-User-Email) matching Web/Desktop behavior
4. THE iOS_App SHALL display the default user email on the settings screen

### Requirement 4: 番茄钟状态显示（只读）

**User Story:** As a user, I want to see my current Pomodoro status on iOS, so that I know how much focus time remains.

#### Acceptance Criteria

1. THE iOS_App SHALL display the current daily state (LOCKED/PLANNING/FOCUS/REST)
2. WHEN an active pomodoro exists, THEN THE iOS_App SHALL display a countdown timer with remaining time
3. WHEN an active pomodoro exists, THEN THE iOS_App SHALL display the associated task title
4. THE iOS_App SHALL display the current pomodoro count for today (e.g., "3/8 番茄")
5. THE iOS_App SHALL display total focus minutes completed today
6. WHEN the daily state changes on server, THEN THE iOS_App SHALL update the display within 1 second
7. THE iOS_App SHALL NOT provide any controls to start, pause, or stop pomodoros
8. WHEN no active pomodoro exists, THEN THE iOS_App SHALL display "无进行中的番茄钟"

### Requirement 5: 今日任务列表显示（只读）

**User Story:** As a user, I want to see my scheduled tasks for today on iOS, so that I know what I need to work on.

#### Acceptance Criteria

1. THE iOS_App SHALL display the Top 3 tasks selected during Airlock
2. THE iOS_App SHALL display all tasks with planDate equal to today
3. WHEN displaying tasks, THEN THE iOS_App SHALL show task title, priority (P1/P2/P3), and status
4. THE iOS_App SHALL visually distinguish completed tasks from pending tasks
5. THE iOS_App SHALL display the task currently being worked on (if any) with a highlight
6. THE iOS_App SHALL NOT provide any controls to create, edit, or complete tasks
7. WHEN tasks are updated on server, THEN THE iOS_App SHALL refresh the list within 2 seconds

### Requirement 6: 专注模式 App 屏蔽

**User Story:** As a user, I want distracting apps to be blocked on my iPhone during Pomodoro sessions, so that I can maintain focus.

#### Acceptance Criteria

1. THE iOS_App SHALL request Screen Time authorization on first launch
2. WHEN a pomodoro is active AND Screen Time is authorized, THEN THE Screen_Time_API SHALL block configured distraction apps
3. WHEN a pomodoro ends or is aborted, THEN THE Screen_Time_API SHALL unblock all apps immediately
4. THE iOS_App SHALL support configuring a list of apps to block (default: 微信, 微博, 抖音, 小红书, B站)
5. WHEN a user attempts to open a blocked app, THEN iOS SHALL display the standard Screen Time restriction screen
6. THE iOS_App SHALL sync the distraction app list from server policy
7. IF Screen Time authorization is denied, THEN THE iOS_App SHALL display a warning but continue functioning without blocking
8. THE iOS_App SHALL persist the block state locally to handle app restarts during active pomodoro

### Requirement 7: 离线状态缓存（只读数据）

**User Story:** As a user, I want to see my last known state when offline, so that I have some context even without internet.

#### Acceptance Criteria

1. THE Policy_Cache SHALL store the last received read-only state locally using AsyncStorage
2. WHEN the app launches offline, THEN THE iOS_App SHALL display cached state with an "离线模式" indicator
3. THE Policy_Cache SHALL store: daily state, active pomodoro info (read-only), today's tasks (read-only), distraction app list
4. WHEN offline AND a cached pomodoro was active, THEN THE iOS_App SHALL display estimated remaining time based on cached start time
5. WHEN connection is restored, THEN THE iOS_App SHALL request full state sync from server
6. THE Policy_Cache SHALL expire cached data after 24 hours
7. THE iOS_App SHALL NOT write any data to server from cache - cache is purely for offline viewing

### Requirement 8: 推送通知（只读提醒）

**User Story:** As a user, I want to receive notifications about my Pomodoro status, so that I stay informed even when the app is in background.

#### Acceptance Criteria

1. THE iOS_App SHALL request push notification permission on first launch
2. WHEN a pomodoro completes on server, THEN THE iOS_App SHALL display a local notification "番茄钟完成！"
3. WHEN rest period ends on server, THEN THE iOS_App SHALL display a local notification "休息结束，准备开始下一个番茄钟"
4. THE iOS_App SHALL NOT send any notifications that require user action
5. WHEN a user taps a notification, THEN THE iOS_App SHALL open to the main status screen

### Requirement 9: 简洁 UI 设计

**User Story:** As a user, I want a clean and simple interface, so that I can quickly check my status without distraction.

#### Acceptance Criteria

1. THE iOS_App SHALL have a single main screen showing all status information
2. THE iOS_App SHALL use a bottom tab navigation with two tabs: "状态" and "设置"
3. THE iOS_App SHALL support both light and dark mode based on system settings
4. THE iOS_App SHALL display a prominent connection status indicator when disconnected
5. THE iOS_App SHALL use consistent styling with the Web version (colors, typography)
6. THE iOS_App SHALL be optimized for iPhone screen sizes (no iPad optimization required for MVP)

### Requirement 10: 设置页面（只读配置）

**User Story:** As a user, I want to view basic settings, so that I can see my configuration.

#### Acceptance Criteria

1. THE iOS_App SHALL display current user email (default: test@example.com)
2. THE iOS_App SHALL display the list of blocked apps (read-only from server policy)
3. THE iOS_App SHALL display Screen Time authorization status with a button to open iOS Settings
4. THE iOS_App SHALL display app version and connection status
5. THE iOS_App SHALL NOT allow modifying any settings in MVP - all settings are read-only from server

