# Requirements Document

## Introduction

本文档定义了 VibeFlow 桌面端专注强制执行功能的需求。主要目标是：
1. 将现有 Web 应用打包为 macOS 桌面应用（使用 Electron）
2. 在工作时间内主动干预用户的分心行为
3. 增强浏览器插件的拦截能力
4. 提供严格模式和温和模式的专注策略
5. 支持番茄工作法的手动/自动开始配置

## Glossary

- **Desktop_App**: 基于 Electron 的 macOS 桌面应用，包装现有 Web 应用并提供系统级干预能力
- **Focus_Enforcer**: 专注强制执行器，负责检测空闲状态并执行干预动作
- **Distraction_App**: 分心应用，用户配置的需要在工作时间内被限制的 macOS 应用程序
- **Enforcement_Mode**: 执行模式，分为严格模式（Strict）和温和模式（Gentle）
- **Skip_Token**: 跳过令牌，用户每天可用于跳过或延迟提醒的有限次数
- **Work_Time**: 工作时间，用户配置的预期工作时间段
- **Settings_Lock**: 设置锁定，生产模式下仅允许在非工作时间修改敏感设置的机制
- **Browser_Sentinel**: 浏览器监控插件，负责追踪用户浏览活动和执行专注策略

## Requirements

### Requirement 1: Electron 桌面应用打包

**User Story:** As a user, I want to use VibeFlow as a native macOS desktop application, so that I can have system-level focus enforcement capabilities.

#### Acceptance Criteria

1. THE Desktop_App SHALL package the existing Next.js web application using Electron
2. THE Desktop_App SHALL connect to a remote VibeFlow API server (not embedded)
3. THE Desktop_App SHALL display the web application in a native window
4. THE Desktop_App SHALL support macOS system tray with quick actions (start pomodoro, view status)
5. THE Desktop_App SHALL request and utilize macOS Accessibility permissions for app control
6. THE Desktop_App SHALL auto-start on system login (configurable)
7. WHEN the Desktop_App loses connection to the server, THE Desktop_App SHALL display a connection status indicator and retry automatically

### Requirement 2: 空闲检测与主动干预

**User Story:** As a user, I want the desktop app to actively intervene when I'm idle too long during work hours, so that I can maintain my focus and productivity.

#### Acceptance Criteria

1. WHILE within configured Work_Time AND no pomodoro is active AND idle time exceeds threshold, THE Focus_Enforcer SHALL trigger intervention
2. WHEN intervention is triggered, THE Desktop_App SHALL bring its window to the foreground
3. WHEN intervention is triggered, THE Desktop_App SHALL display a system notification prompting the user to start a pomodoro
4. WHEN intervention is triggered in Strict mode, THE Focus_Enforcer SHALL close configured Distraction_Apps
5. WHEN intervention is triggered in Gentle mode, THE Focus_Enforcer SHALL hide (not close) configured Distraction_Apps
6. THE Focus_Enforcer SHALL repeat intervention every N minutes (configurable) until user starts a pomodoro or work time ends
7. WHEN the user starts a pomodoro, THE Focus_Enforcer SHALL stop intervention and reset idle timer

### Requirement 3: 分心应用管理

**User Story:** As a user, I want to configure which applications should be restricted during work hours, so that I can customize my focus environment.

#### Acceptance Criteria

1. THE User_Settings SHALL provide a preset list of common Distraction_Apps (e.g., WeChat, Slack, Discord, Steam, Spotify)
2. THE User_Settings SHALL allow users to add custom applications to the Distraction_App list
3. THE User_Settings SHALL allow users to remove applications from the Distraction_App list
4. THE User_Settings SHALL allow users to configure the action for each app: "force_quit" or "hide_window"
5. WHILE in development mode, THE User_Settings SHALL allow modification of Distraction_App settings at any time
6. WHILE in production mode AND within Work_Time, THE User_Settings SHALL prevent modification of Distraction_App settings
7. THE Desktop_App SHALL display a list of currently running Distraction_Apps in the dashboard

### Requirement 4: 执行模式（严格/温和）

**User Story:** As a user, I want to choose between strict and gentle enforcement modes, so that I can balance productivity with flexibility based on my needs.

#### Acceptance Criteria

1. THE User_Settings SHALL allow users to select between Strict mode and Gentle mode
2. WHILE in Strict mode, THE Focus_Enforcer SHALL force quit Distraction_Apps without warning
3. WHILE in Strict mode, THE Browser_Sentinel SHALL immediately close entertainment tabs without option to continue
4. WHILE in Strict mode, THE System SHALL limit Skip_Tokens to 1 per day with maximum 5-minute delay
5. WHILE in Gentle mode, THE Focus_Enforcer SHALL hide Distraction_Apps and show a warning first
6. WHILE in Gentle mode, THE Browser_Sentinel SHALL show a warning overlay with option to continue (consuming Skip_Token)
7. WHILE in Gentle mode, THE System SHALL allow 3-5 Skip_Tokens per day with maximum 15-minute delay
8. WHILE in production mode AND within Work_Time, THE User_Settings SHALL prevent switching between enforcement modes
9. THE User_Settings SHALL allow users to schedule Strict mode for specific time periods (e.g., deadline weeks)

### Requirement 5: 跳过与延迟机制

**User Story:** As a user, I want limited ability to skip or delay focus reminders, so that I can handle urgent matters while still maintaining overall discipline.

#### Acceptance Criteria

1. WHEN an intervention is triggered, THE System SHALL display options to "Start Pomodoro", "Skip", or "Delay"
2. WHEN user clicks "Skip", THE System SHALL consume one Skip_Token and dismiss the intervention for the current cycle
3. WHEN user clicks "Delay", THE System SHALL consume one Skip_Token and postpone intervention by configured minutes
4. THE System SHALL track remaining Skip_Tokens for the current day
5. WHEN Skip_Tokens are exhausted, THE System SHALL disable "Skip" and "Delay" options
6. THE System SHALL reset Skip_Tokens at midnight (user's local time)
7. THE Statistics_Dashboard SHALL display daily Skip_Token usage history
8. WHILE in production mode AND within Work_Time, THE User_Settings SHALL prevent modification of Skip_Token limits

### Requirement 6: 浏览器插件增强拦截

**User Story:** As a user, I want the browser extension to actively block entertainment websites during work hours and redirect me to start a pomodoro.

#### Acceptance Criteria

1. WHILE within Work_Time AND no pomodoro is active, WHEN user navigates to a blacklisted URL, THE Browser_Sentinel SHALL close the current tab
2. WHEN closing a blacklisted tab, THE Browser_Sentinel SHALL open the VibeFlow Dashboard page in a new tab (or replace current tab based on config)
3. THE Browser_Sentinel SHALL display a message on the Dashboard indicating the blocked site and prompting to start a pomodoro
4. IF user is not logged in, THEN THE Browser_Sentinel SHALL display an in-extension reminder overlay
5. IF user is not logged in AND attempts to access blocked sites repeatedly, THEN THE Browser_Sentinel SHALL require login to continue using the browser
6. THE User_Settings SHALL allow configuration of tab replacement behavior (replace current tab vs open new tab)
7. WHILE in Gentle mode, THE Browser_Sentinel SHALL show a warning overlay with countdown before closing the tab

### Requirement 7: 番茄工作法手动/自动开始配置

**User Story:** As a user, I want to configure whether pomodoro sessions and breaks start automatically or require manual confirmation, so that I can control my workflow rhythm.

#### Acceptance Criteria

1. THE User_Settings SHALL allow users to configure auto-start behavior for break periods (enabled/disabled)
2. THE User_Settings SHALL allow users to configure auto-start behavior for next pomodoro after break (enabled/disabled)
3. WHEN auto-start is disabled for breaks, THE Pomodoro_Timer SHALL display a "Start Break" button after pomodoro completion
4. WHEN auto-start is disabled for next pomodoro, THE Pomodoro_Timer SHALL display a "Start Pomodoro" button after break completion
5. WHEN auto-start is enabled, THE Pomodoro_Timer SHALL automatically transition to the next phase after a brief countdown (5 seconds)
6. THE Pomodoro_Timer SHALL play a distinct sound when waiting for manual confirmation
7. IF user does not manually start within configured idle threshold, THEN THE Focus_Enforcer SHALL trigger intervention

### Requirement 8: 设置锁定机制

**User Story:** As a user, I want sensitive settings to be locked during work hours in production mode, so that I cannot easily bypass focus restrictions in moments of weakness.

#### Acceptance Criteria

1. THE System SHALL distinguish between development mode and production mode via environment configuration
2. WHILE in production mode AND within Work_Time, THE User_Settings SHALL display locked settings as read-only with a lock icon
3. WHILE in production mode AND within Work_Time, THE User_Settings SHALL show a message explaining when settings can be modified
4. THE following settings SHALL be subject to Settings_Lock: Distraction_App list, Enforcement_Mode, Skip_Token limits, Work_Time slots
5. WHILE in production mode AND outside Work_Time, THE User_Settings SHALL allow modification of all settings
6. WHILE in development mode, THE User_Settings SHALL allow modification of all settings at any time
7. THE System SHALL log all settings modification attempts (successful and blocked) for user review

### Requirement 9: 系统权限与安全

**User Story:** As a user, I want the desktop app to request only necessary permissions and handle them securely, so that I can trust the application with system access.

#### Acceptance Criteria

1. WHEN first launched, THE Desktop_App SHALL guide users through permission setup (Accessibility, Notifications)
2. THE Desktop_App SHALL clearly explain why each permission is needed before requesting
3. IF Accessibility permission is not granted, THEN THE Desktop_App SHALL disable app control features and notify user
4. THE Desktop_App SHALL not store any credentials locally; authentication SHALL be handled via the remote server
5. THE Desktop_App SHALL use secure WebSocket connection (WSS) for real-time communication with the server
6. THE Desktop_App SHALL validate server certificate to prevent man-in-the-middle attacks
