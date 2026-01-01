# Requirements Document

## Introduction

本文档定义了 VibeFlow 的"八爪鱼架构 (Octopus Architecture)"——一个以云端大脑为核心、多触手客户端协同工作的分布式系统架构。每个客户端（触手）具备双重职责：
1. **Sensor（感知器）**：收集运行环境的事件和用户行为数据
2. **Action Executor（动作执行器）**：基于服务端返回的状态执行必要的干预动作

核心设计理念：
- **中央集权，边缘执行**：所有决策由云端大脑做出，客户端只负责感知和执行
- **统一状态源**：所有客户端共享同一状态源，通过 WebSocket 实时同步
- **平台特化**：每个客户端针对其运行平台的特性进行优化

## Glossary

- **Vibe_Brain**: 云端大脑，VibeFlow 的核心服务端，负责状态管理、决策和数据持久化
- **Tentacle**: 触手，指各个客户端应用（Web、Desktop、Browser Extension、Mobile）
- **Sensor**: 感知器，客户端收集环境事件和用户行为的能力
- **Action_Executor**: 动作执行器，客户端执行服务端指令的能力
- **Event_Stream**: 事件流，从客户端上报到服务端的行为数据流
- **Command_Stream**: 指令流，从服务端下发到客户端的动作指令流
- **Policy_Cache**: 策略缓存，客户端本地缓存的执行策略，用于离线场景
- **Heartbeat**: 心跳，客户端定期向服务端报告存活状态的机制
- **Web_Client**: Web 客户端，基于 Next.js 的主要展示和操作界面
- **Desktop_Client**: 桌面客户端，基于 Electron 的 macOS 应用
- **Browser_Sentinel**: 浏览器插件，Chrome Extension Manifest V3
- **Mobile_Client**: 移动客户端，基于 React Native 的 iOS/Android 应用

## Requirements

### Requirement 1: 云端大脑核心职责

**User Story:** As a system architect, I want a centralized brain that manages all state and decisions, so that all clients behave consistently.

#### Acceptance Criteria

1. THE Vibe_Brain SHALL maintain the single source of truth for all user state (daily state, pomodoro, tasks, settings)
2. THE Vibe_Brain SHALL process all Event_Stream data from Tentacles and persist to database
3. THE Vibe_Brain SHALL evaluate rules and policies to generate Command_Stream for Tentacles
4. THE Vibe_Brain SHALL broadcast state changes to all connected Tentacles via WebSocket
5. THE Vibe_Brain SHALL provide RESTful/tRPC API for CRUD operations
6. THE Vibe_Brain SHALL authenticate and authorize all client connections
7. WHEN a Tentacle connects, THE Vibe_Brain SHALL send current state snapshot for synchronization

### Requirement 2: 统一通信协议

**User Story:** As a developer, I want a unified communication protocol between brain and tentacles, so that all clients can be developed consistently.

#### Acceptance Criteria

1. THE System SHALL define a standard Event_Stream message format for all Tentacles
2. THE System SHALL define a standard Command_Stream message format for all Tentacles
3. WHEN a Tentacle sends an event, THE message SHALL include: event_type, timestamp, source_client, payload
4. WHEN the Vibe_Brain sends a command, THE message SHALL include: command_type, target_client, payload, priority
5. THE System SHALL support both WebSocket (real-time) and HTTP (fallback) communication channels
6. THE System SHALL implement message acknowledgment for critical commands
7. THE System SHALL support message queuing for offline Tentacles

### Requirement 3: Web 客户端定位

**User Story:** As a user, I want the web client to be my primary interface for viewing and managing my productivity data.

#### Acceptance Criteria

1. THE Web_Client SHALL provide full CRUD operations for Projects, Tasks, Goals, and Settings
2. THE Web_Client SHALL display real-time state updates from Vibe_Brain
3. THE Web_Client SHALL provide the complete Airlock wizard experience
4. THE Web_Client SHALL display comprehensive statistics and analytics dashboards
5. THE Web_Client SHALL support all timer operations (start, pause, complete, abort pomodoro)
6. THE Web_Client SHALL NOT collect sensor data (browser activity tracking is handled by Browser_Sentinel)
7. THE Web_Client SHALL execute display-related commands (show notifications, update UI state)

### Requirement 4: 桌面客户端定位

**User Story:** As a user, I want the desktop client to enforce focus by controlling my Mac applications, so that I stay productive.

#### Acceptance Criteria

##### Sensor 能力
1. THE Desktop_Client SHALL detect currently running applications on macOS
2. THE Desktop_Client SHALL detect user idle time (keyboard/mouse inactivity)
3. THE Desktop_Client SHALL detect active window/application changes
4. THE Desktop_Client SHALL report application usage duration to Vibe_Brain
5. THE Desktop_Client SHALL detect system events (sleep, wake, screen lock)

##### Action 能力
1. THE Desktop_Client SHALL force quit specified Distraction_Apps on command
2. THE Desktop_Client SHALL hide specified application windows on command
3. THE Desktop_Client SHALL bring VibeFlow window to foreground on command
4. THE Desktop_Client SHALL display system notifications on command
5. THE Desktop_Client SHALL control system tray status and menu

##### 展示能力
1. THE Desktop_Client SHALL embed the Web_Client for full UI functionality
2. THE Desktop_Client SHALL display connection status indicator
3. THE Desktop_Client SHALL display current focus state in system tray

### Requirement 5: 浏览器插件定位

**User Story:** As a user, I want the browser extension to track my browsing and block distracting websites, so that I stay focused online.

#### Acceptance Criteria

##### Sensor 能力 - 基础追踪
1. THE Browser_Sentinel SHALL track active tab URL and page title
2. THE Browser_Sentinel SHALL track time spent on each website with second-level precision
3. THE Browser_Sentinel SHALL detect tab switches and new tab creation
4. THE Browser_Sentinel SHALL categorize websites (productive, neutral, distracting)
5. THE Browser_Sentinel SHALL report browsing activity to Vibe_Brain periodically (default: every 60 seconds)

##### Sensor 能力 - 详细行为追踪
6. THE Browser_Sentinel SHALL track page scroll depth percentage for each visited page
7. THE Browser_Sentinel SHALL track user interaction events (clicks, form inputs, video plays)
8. THE Browser_Sentinel SHALL detect idle time within browser (no mouse/keyboard activity)
9. THE Browser_Sentinel SHALL track tab focus/blur events to measure actual active time
10. THE Browser_Sentinel SHALL track navigation patterns (referrer, navigation type: link/typed/reload)
11. THE Browser_Sentinel SHALL detect and track media playback (video/audio) duration
12. THE Browser_Sentinel SHALL track search queries on major search engines (Google, Bing, DuckDuckGo)

##### Sensor 能力 - 会话与聚合
13. THE Browser_Sentinel SHALL maintain browsing sessions with start/end timestamps
14. THE Browser_Sentinel SHALL aggregate activity by domain for daily summaries
15. THE Browser_Sentinel SHALL calculate per-domain productivity scores based on time and category
16. THE Browser_Sentinel SHALL track browser window focus state (browser active vs other apps)
17. THE Browser_Sentinel SHALL detect rapid tab switching patterns (potential distraction indicator)

##### Sensor 能力 - 数据格式
18. WHEN reporting activity, THE Browser_Sentinel SHALL include: url, title, domain, duration, category, scrollDepth, interactionCount, idleTime, isMediaPlaying
19. WHEN reporting session summary, THE Browser_Sentinel SHALL include: sessionId, startTime, endTime, totalDuration, activeDuration, domainBreakdown
20. THE Browser_Sentinel SHALL batch activity events to reduce network overhead (max 50 events per batch)

##### Action 能力
21. THE Browser_Sentinel SHALL close tabs matching blacklist patterns on command
22. THE Browser_Sentinel SHALL redirect to screensaver page on command
23. THE Browser_Sentinel SHALL inject overlay/warning UI on command
24. THE Browser_Sentinel SHALL open VibeFlow dashboard tab on command
25. THE Browser_Sentinel SHALL temporarily whitelist URLs for current session on command

##### 离线能力
26. THE Browser_Sentinel SHALL cache Policy locally for offline operation
27. WHEN offline, THE Browser_Sentinel SHALL use cached Policy for blocking decisions
28. WHEN connection is restored, THE Browser_Sentinel SHALL sync queued events to Vibe_Brain
29. THE Browser_Sentinel SHALL store up to 1000 pending activity events locally when offline

### Requirement 6: 移动客户端定位

**User Story:** As a user, I want the mobile app to track my phone usage and provide timer functionality on the go.

#### Acceptance Criteria

##### Sensor 能力（未来规划）
1. THE Mobile_Client SHALL track app usage on the device (requires platform permissions)
2. THE Mobile_Client SHALL detect screen on/off events
3. THE Mobile_Client SHALL report app usage data to Vibe_Brain
4. THE Mobile_Client SHALL detect location changes (optional, for context awareness)

##### Action 能力
1. THE Mobile_Client SHALL display push notifications on command
2. THE Mobile_Client SHALL play sounds/vibration on command
3. THE Mobile_Client SHALL update app badge count on command

##### 展示能力
1. THE Mobile_Client SHALL provide timer interface for pomodoro sessions
2. THE Mobile_Client SHALL display task list and allow basic management
3. THE Mobile_Client SHALL support Airlock wizard completion
4. THE Mobile_Client SHALL display daily statistics summary

### Requirement 7: 事件流标准化

**User Story:** As a developer, I want standardized event types across all clients, so that the brain can process them uniformly.

#### Acceptance Criteria

1. THE System SHALL define common event types: ACTIVITY_LOG, STATE_CHANGE, USER_ACTION, HEARTBEAT
2. THE ACTIVITY_LOG event SHALL include: source, url/app_name, duration, category, metadata
3. THE STATE_CHANGE event SHALL include: previous_state, new_state, trigger, timestamp
4. THE USER_ACTION event SHALL include: action_type, target_entity, parameters, result
5. THE HEARTBEAT event SHALL include: client_type, client_version, connection_quality, local_state_hash
6. ALL events SHALL include: user_id, client_id, timestamp, sequence_number

### Requirement 8: 指令流标准化

**User Story:** As a developer, I want standardized command types for all clients, so that the brain can control them uniformly.

#### Acceptance Criteria

1. THE System SHALL define common command types: SYNC_STATE, EXECUTE_ACTION, UPDATE_POLICY, SHOW_UI
2. THE SYNC_STATE command SHALL include: full_state or delta_state, version
3. THE EXECUTE_ACTION command SHALL include: action_type, parameters, timeout, fallback_action
4. THE UPDATE_POLICY command SHALL include: policy_type, policy_data, effective_time
5. THE SHOW_UI command SHALL include: ui_type, content, duration, dismissible
6. ALL commands SHALL include: command_id, priority, requires_ack, expiry_time

### Requirement 9: 客户端注册与发现

**User Story:** As a user, I want to see all my connected devices and their status, so that I know my system is working.

#### Acceptance Criteria

1. WHEN a Tentacle connects, THE Vibe_Brain SHALL register the client with unique client_id
2. THE Vibe_Brain SHALL track client metadata: type, version, platform, capabilities, last_seen
3. THE Web_Client SHALL display a list of connected Tentacles with their status
4. WHEN a Tentacle disconnects, THE Vibe_Brain SHALL mark it as offline after timeout
5. THE User SHALL be able to revoke/remove registered clients
6. THE System SHALL support multiple instances of the same client type (e.g., multiple browsers)

### Requirement 10: 策略分发与缓存

**User Story:** As a user, I want my focus policies to work even when offline, so that I stay productive without internet.

#### Acceptance Criteria

1. THE Vibe_Brain SHALL compile user settings into executable Policy objects
2. THE Vibe_Brain SHALL distribute Policy to all connected Tentacles
3. WHEN Policy changes, THE Vibe_Brain SHALL push updates to all Tentacles immediately
4. EACH Tentacle SHALL cache the latest Policy locally
5. THE Policy SHALL include: blacklist, whitelist, enforcement_mode, work_time, skip_token_count
6. THE Policy SHALL include version number for conflict detection
7. WHEN a Tentacle reconnects, THE Vibe_Brain SHALL check Policy version and sync if needed

### Requirement 11: 行为数据聚合

**User Story:** As a user, I want to see aggregated insights from all my devices, so that I understand my productivity patterns.

#### Acceptance Criteria

1. THE Vibe_Brain SHALL aggregate ACTIVITY_LOG events from all Tentacles
2. THE Vibe_Brain SHALL deduplicate overlapping activity (e.g., same website in browser and desktop)
3. THE Vibe_Brain SHALL categorize activities into: productive, neutral, distracting
4. THE Vibe_Brain SHALL calculate daily/weekly/monthly productivity scores
5. THE Web_Client SHALL display aggregated statistics with source breakdown
6. THE System SHALL support exporting activity data for user analysis

### Requirement 12: 故障恢复与一致性

**User Story:** As a user, I want the system to recover gracefully from failures, so that I don't lose my work or state.

#### Acceptance Criteria

1. WHEN a Tentacle loses connection, THE Tentacle SHALL queue events locally
2. WHEN connection is restored, THE Tentacle SHALL replay queued events in order
3. THE Vibe_Brain SHALL handle duplicate events idempotently
4. WHEN state conflict is detected, THE Vibe_Brain SHALL use server state as authoritative
5. THE System SHALL implement optimistic UI updates with rollback on conflict
6. THE System SHALL log all state conflicts for debugging

### Requirement 13: 安全与隐私

**User Story:** As a user, I want my activity data to be secure and private, so that I can trust the system.

#### Acceptance Criteria

1. ALL communication between Tentacles and Vibe_Brain SHALL use TLS encryption
2. THE System SHALL authenticate each Tentacle connection with user credentials
3. THE System SHALL NOT share activity data between users
4. THE User SHALL be able to delete all collected activity data
5. THE System SHALL implement rate limiting to prevent abuse
6. THE Policy_Cache SHALL be encrypted on client devices

