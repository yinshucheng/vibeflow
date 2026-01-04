# Requirements Document

## Introduction

本文档定义了 VibeFlow 桌面端生产环境稳定性和防绕过机制的需求。主要目标是：
1. 确保桌面应用能够持续稳定运行，不依赖开发环境
2. 防止用户通过关闭客户端来绕过强制模式
3. 提供有限次数的演示模式，用于产品展示场景

## Glossary

- **Desktop_App**: 基于 Electron 的 macOS 桌面应用
- **Process_Guardian**: 进程守护器，负责监控和重启桌面应用
- **Bypass_Prevention**: 防绕过机制，检测和响应用户试图绕过强制模式的行为
- **Demo_Mode**: 演示模式，临时禁用所有强制功能的特殊模式
- **Demo_Token**: 演示令牌，用于激活演示模式的有限次数凭证
- **Heartbeat**: 心跳信号，客户端定期发送给服务器的存活信号
- **Grace_Period**: 宽限期，客户端断开后允许的短暂离线时间

## Requirements

### Requirement 1: 独立启动与持续运行

**User Story:** As a user, I want the desktop app to run independently and persistently, so that focus enforcement works without needing to start Kiro/VSCode.

#### Acceptance Criteria

1. THE Desktop_App SHALL start automatically on system login (configurable)
2. THE Desktop_App SHALL run as a background process with system tray presence
3. WHEN the Desktop_App crashes, THE Process_Guardian SHALL automatically restart it within 5 seconds
4. THE Desktop_App SHALL maintain connection to the server and auto-reconnect on disconnection
5. THE Desktop_App SHALL support running in "headless" mode (tray only, no main window)
6. WHILE in production mode, THE Desktop_App SHALL resist normal quit attempts during work hours
7. THE Desktop_App SHALL provide a "Force Quit" option that requires password confirmation during work hours

### Requirement 2: 开发便捷性保持

**User Story:** As a developer, I want to easily start, stop, and debug the desktop app during development, so that I can iterate quickly without production restrictions.

#### Acceptance Criteria

1. WHILE in development mode, THE Desktop_App SHALL allow normal quit without restrictions
2. WHILE in development mode, THE Desktop_App SHALL support hot-reload of configuration changes
3. THE Desktop_App SHALL detect development mode via NODE_ENV environment variable
4. WHILE in development mode, THE Desktop_App SHALL display a visible "DEV MODE" indicator
5. THE Desktop_App SHALL support command-line flags for development overrides (--dev, --no-guardian)
6. WHILE in development mode, THE Process_Guardian SHALL be disabled by default
7. WHEN started via `npm run dev`, THE Desktop_App SHALL automatically enter development mode
8. THE Desktop_App SHALL support VS Code/Kiro debugger attachment in development mode
9. WHILE in development mode, THE Desktop_App SHALL log verbose debug information to console
10. THE Project SHALL provide VS Code launch configurations for debugging both backend and desktop app
11. THE VS Code launch configuration SHALL support "compound" launch to start backend and desktop together
12. THE VS Code launch configuration SHALL support attaching debugger to running processes

### Requirement 3: 客户端心跳与存活监控

**User Story:** As a system, I want to monitor client health through heartbeats, so that I can detect when users attempt to bypass enforcement by closing the client.

#### Acceptance Criteria

1. THE Desktop_App SHALL send heartbeat signals to the server every 30 seconds
2. THE Server SHALL track the last heartbeat timestamp for each connected client
3. WHEN heartbeat is not received for 2 minutes, THE Server SHALL mark the client as "offline"
4. THE Server SHALL record client offline events with timestamp and duration
5. WHEN a client reconnects after being offline, THE Server SHALL log the offline duration
6. THE Statistics_Dashboard SHALL display client uptime and offline history

### Requirement 4: 防绕过检测与响应

**User Story:** As a user, I want the system to detect and respond to bypass attempts, so that I maintain my focus discipline even in moments of weakness.

#### Acceptance Criteria

1. WHEN the Desktop_App is force-quit during work hours, THE Server SHALL record a "bypass_attempt" event
2. WHEN multiple bypass attempts occur within a day, THE Server SHALL escalate the warning level
3. THE Server SHALL calculate a "bypass_score" based on frequency and duration of offline periods during work hours
4. WHEN bypass_score exceeds threshold, THE System SHALL display a warning on next login
5. THE Statistics_Dashboard SHALL display bypass attempt history and patterns
6. WHILE in production mode AND within work hours, THE Desktop_App SHALL show a confirmation dialog before quitting
7. IF user confirms quit during work hours, THEN THE System SHALL consume a Skip_Token (if available)

### Requirement 5: 宽限期机制

**User Story:** As a user, I want a brief grace period when the client disconnects, so that legitimate restarts and brief network issues don't trigger bypass warnings.

#### Acceptance Criteria

1. THE System SHALL provide a configurable Grace_Period (default: 5 minutes)
2. WHEN client disconnects, THE Server SHALL start a Grace_Period timer
3. IF client reconnects within Grace_Period, THEN THE System SHALL NOT record a bypass attempt
4. IF client remains offline beyond Grace_Period during work hours, THEN THE System SHALL record a bypass attempt
5. THE Grace_Period SHALL be shorter during active pomodoro sessions (default: 2 minutes)
6. THE User_Settings SHALL allow configuration of Grace_Period duration (within limits)

### Requirement 6: 演示模式

**User Story:** As a user, I want a demo mode for product presentations, so that I can showcase the app without triggering blocking or enforcement features.

#### Acceptance Criteria

1. THE System SHALL provide Demo_Mode that temporarily disables all enforcement features
2. THE Demo_Mode SHALL be activated using a Demo_Token
3. THE User SHALL receive a limited number of Demo_Tokens per month (configurable, default: 3)
4. EACH Demo_Token SHALL allow Demo_Mode for a maximum duration (configurable, default: 90 minutes)
5. WHEN Demo_Mode is active, THE Desktop_App SHALL display a visible "DEMO MODE" indicator
6. WHEN Demo_Mode is active, THE Dashboard SHALL display a prominent "DEMO MODE" banner with remaining time
7. WHEN Demo_Mode duration expires, THE System SHALL automatically exit Demo_Mode
8. THE User SHALL be able to manually exit Demo_Mode before duration expires
9. THE Statistics_Dashboard SHALL display Demo_Mode usage history
10. WHILE in Demo_Mode, THE System SHALL NOT record any bypass attempts or offline events
11. THE Demo_Token usage SHALL be logged with timestamp and duration for accountability
12. THE Timeline_View SHALL display Demo_Mode events (start, end, duration) alongside other activities
13. THE User_Settings SHALL allow configuration of Demo_Tokens per month (within limits: 1-10)
14. THE User_Settings SHALL allow configuration of Demo_Mode max duration (within limits: 30-180 minutes)

### Requirement 7: 演示模式激活安全

**User Story:** As a user, I want demo mode activation to require deliberate action, so that I don't accidentally enter demo mode and lose focus enforcement.

#### Acceptance Criteria

1. THE Demo_Mode activation SHALL require entering a confirmation phrase (e.g., "I am presenting")
2. THE Demo_Mode activation SHALL display remaining Demo_Tokens before confirmation
3. THE Demo_Mode activation SHALL show the maximum duration before confirmation
4. WHEN Demo_Tokens are exhausted, THE System SHALL display a message explaining when tokens reset
5. THE Demo_Mode activation SHALL NOT be available during active pomodoro sessions
6. THE Demo_Mode SHALL be accessible from both web UI and desktop tray menu

### Requirement 8: 进程守护机制

**User Story:** As a system, I want a process guardian to ensure the desktop app stays running, so that users cannot easily bypass enforcement by killing the process.

#### Acceptance Criteria

1. THE Process_Guardian SHALL run as a separate lightweight process
2. THE Process_Guardian SHALL monitor the Desktop_App process status
3. WHEN Desktop_App process terminates unexpectedly, THE Process_Guardian SHALL restart it within 5 seconds
4. THE Process_Guardian SHALL log all restart events with reason
5. WHILE in production mode, THE Process_Guardian SHALL resist termination attempts
6. THE Process_Guardian SHALL start automatically on system login (before Desktop_App)
7. IF Process_Guardian is terminated, THE Desktop_App SHALL detect this and warn the user
8. THE Process_Guardian SHALL communicate with Desktop_App via IPC to verify mutual health

### Requirement 9: 离线模式行为

**User Story:** As a user, I want the desktop app to continue enforcing focus even when offline, so that network issues don't disable my productivity tools.

#### Acceptance Criteria

1. WHILE offline, THE Desktop_App SHALL continue enforcing distraction app blocking
2. WHILE offline, THE Desktop_App SHALL cache enforcement policy locally
3. WHEN reconnecting, THE Desktop_App SHALL sync offline events to the server
4. THE Desktop_App SHALL display an "Offline Mode" indicator when disconnected
5. WHILE offline for extended periods (>30 minutes), THE Desktop_App SHALL show a warning about limited functionality
6. THE Desktop_App SHALL queue skip token usage for sync when reconnecting


### Requirement 10: 开发与生产模式切换

**User Story:** As a developer, I want clear separation between development and production modes, so that I can test production behavior without affecting my daily development workflow.

#### Acceptance Criteria

1. THE Desktop_App SHALL support three run modes: "development", "staging", "production"
2. WHEN running via `npm run dev`, THE Desktop_App SHALL use "development" mode
3. WHEN running via `npm run build && npm run start`, THE Desktop_App SHALL use "staging" mode for testing
4. WHEN running from installed .dmg/.app, THE Desktop_App SHALL use "production" mode
5. THE Desktop_App SHALL display the current mode in the tray tooltip
6. WHILE in staging mode, THE Desktop_App SHALL behave like production but allow force-quit via keyboard shortcut (Cmd+Shift+Q)
7. THE Desktop_App SHALL support environment variable override: VIBEFLOW_MODE=development|staging|production
8. WHEN mode is explicitly set via environment variable, THE Desktop_App SHALL use that mode regardless of how it was started
9. ALL run modes SHALL connect to the same backend server and use the same database (no data isolation)
10. THE Desktop_App SHALL NOT embed or start its own backend server

### Requirement 11: 后端服务器持续运行

**User Story:** As a user, I want the backend server to run persistently and reliably, so that both desktop and web clients can always connect.

#### Acceptance Criteria

1. THE Backend_Server SHALL run as a persistent background service
2. THE Backend_Server SHALL use a fixed port (default: 3000) to avoid port conflicts
3. WHEN the Backend_Server port is already in use, THE System SHALL detect and report the conflict
4. THE Backend_Server SHALL support running via process manager (PM2 or systemd)
5. THE Backend_Server SHALL auto-restart on crash when running in production mode
6. THE Backend_Server SHALL provide a health check endpoint (/api/health)
7. THE Desktop_App SHALL check Backend_Server health on startup and display connection status
8. WHEN Backend_Server is not running, THE Desktop_App SHALL display a clear error message with instructions
9. THE System SHALL provide a single command to start both Backend_Server and Desktop_App for development
10. THE Backend_Server SHALL support graceful shutdown to avoid data corruption


### Requirement 12: 本地持续运行模式

**User Story:** As a user, I want the system to run persistently on my local machine even when I'm not actively developing, so that focus enforcement works throughout my workday.

#### Acceptance Criteria

1. THE System SHALL support "local persistent" mode where backend and desktop run continuously
2. THE Backend_Server SHALL run as a background service using PM2 or launchd (macOS)
3. THE Desktop_App SHALL connect to the locally running Backend_Server
4. WHEN user closes Kiro/VSCode, THE Backend_Server and Desktop_App SHALL continue running
5. THE System SHALL provide commands to start/stop/restart the persistent services
6. THE System SHALL provide a status command to check if services are running
7. THE persistent services SHALL auto-start on system login (configurable)
8. THE persistent services SHALL use the same database as development mode (no data isolation)
9. THE System SHALL provide clear documentation on switching between development and persistent modes
10. WHEN running in persistent mode, THE Desktop_App SHALL still allow debugging via attach

### Requirement 13: 服务管理命令

**User Story:** As a user, I want simple commands to manage the persistent services, so that I can easily start, stop, and check the status of VibeFlow.

#### Acceptance Criteria

1. THE System SHALL provide `vibeflow start` command to start all services
2. THE System SHALL provide `vibeflow stop` command to stop all services
3. THE System SHALL provide `vibeflow restart` command to restart all services
4. THE System SHALL provide `vibeflow status` command to check service status
5. THE System SHALL provide `vibeflow logs` command to view service logs
6. THE commands SHALL work from any directory after installation
7. THE commands SHALL provide clear feedback on success or failure
8. THE `vibeflow start` command SHALL check for port conflicts before starting


### Requirement 14: 运维文档

**User Story:** As a developer/operator, I want comprehensive documentation for operating VibeFlow, so that I can easily manage the system in different scenarios.

#### Acceptance Criteria

1. THE Documentation SHALL include a "Quick Start" guide for first-time setup
2. THE Documentation SHALL include VSCode/Kiro launch configuration instructions
3. THE Documentation SHALL include service management commands reference
4. THE Documentation SHALL include troubleshooting guide for common issues
5. THE Documentation SHALL include architecture overview diagram
6. THE Documentation SHALL include backup and restore procedures
7. THE Documentation SHALL include upgrade/migration procedures
8. THE Documentation SHALL be located at `docs/operations.md`
