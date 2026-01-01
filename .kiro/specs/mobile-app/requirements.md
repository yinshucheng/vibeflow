# Requirements Document

## Introduction

VibeFlow Mobile 是 VibeFlow 生产力系统的移动端应用，使用 React Native 开发，支持 iOS 和 Android 平台。移动端将复用现有的后端 API 和业务逻辑，提供与 Web 版本一致的核心功能体验，同时针对移动端特性进行优化。

## Glossary

- **Mobile_App**: React Native 移动应用程序
- **API_Client**: 与后端 tRPC API 通信的客户端模块
- **Push_Service**: 推送通知服务（APNs/FCM）
- **Background_Timer**: 后台计时器服务
- **Offline_Storage**: 本地离线数据存储
- **Socket_Client**: WebSocket 实时通信客户端
- **Navigation**: React Navigation 导航系统

## Requirements

### Requirement 1: 项目初始化与基础架构

**User Story:** As a developer, I want to set up a React Native project with proper tooling, so that I can build the mobile app efficiently.

#### Acceptance Criteria

1. THE Mobile_App SHALL use React Native with TypeScript for type safety
2. THE Mobile_App SHALL use Expo managed workflow for simplified development and deployment
3. THE Mobile_App SHALL configure path aliases matching the web project (`@/` → `./src/`)
4. THE Mobile_App SHALL include ESLint and Prettier with consistent configuration
5. THE Mobile_App SHALL support both iOS and Android platforms from a single codebase

### Requirement 2: API 客户端集成

**User Story:** As a user, I want the mobile app to communicate with the same backend, so that my data is synchronized across all platforms.

#### Acceptance Criteria

1. THE API_Client SHALL use tRPC client to communicate with the existing backend
2. THE API_Client SHALL support JWT authentication with secure token storage
3. WHEN the API_Client receives an authentication error, THEN THE Mobile_App SHALL redirect to the login screen
4. THE API_Client SHALL use React Query for data caching and synchronization
5. THE API_Client SHALL support request retry with exponential backoff

### Requirement 3: 用户认证

**User Story:** As a user, I want to log in to my account on mobile, so that I can access my tasks and pomodoros.

#### Acceptance Criteria

1. THE Mobile_App SHALL provide email/password login form
2. WHEN a user successfully logs in, THEN THE Mobile_App SHALL store the JWT token securely using expo-secure-store
3. THE Mobile_App SHALL support biometric authentication (Face ID/Touch ID) for returning users
4. WHEN the JWT token expires, THEN THE Mobile_App SHALL attempt to refresh the token automatically
5. THE Mobile_App SHALL provide a logout function that clears all stored credentials

### Requirement 4: 番茄钟计时器

**User Story:** As a user, I want to use the Pomodoro timer on my phone, so that I can focus on tasks while away from my computer.

#### Acceptance Criteria

1. THE Mobile_App SHALL display a countdown timer with circular progress indicator
2. WHEN a user starts a pomodoro, THEN THE Background_Timer SHALL continue counting even when the app is in background
3. WHEN a pomodoro completes, THEN THE Push_Service SHALL send a local notification
4. THE Mobile_App SHALL play a completion sound when the timer ends (configurable)
5. THE Mobile_App SHALL support starting, aborting, and completing pomodoros
6. WHEN the app returns to foreground, THEN THE Mobile_App SHALL sync timer state with the server
7. THE Mobile_App SHALL display the current task title during focus sessions

### Requirement 5: 任务管理

**User Story:** As a user, I want to view and manage my tasks on mobile, so that I can stay organized on the go.

#### Acceptance Criteria

1. THE Mobile_App SHALL display tasks in a hierarchical tree structure
2. THE Mobile_App SHALL support creating new tasks with title, description, and priority
3. THE Mobile_App SHALL support editing existing tasks
4. THE Mobile_App SHALL support marking tasks as complete
5. THE Mobile_App SHALL display task priority with visual indicators (P1/P2/P3)
6. WHEN a user swipes on a task, THEN THE Mobile_App SHALL show quick actions (complete, edit, delete)
7. THE Mobile_App SHALL support filtering tasks by project and status

### Requirement 6: 每日状态与 Airlock

**User Story:** As a user, I want to complete my morning airlock on mobile, so that I can start my day from anywhere.

#### Acceptance Criteria

1. THE Mobile_App SHALL display the current daily state (LOCKED/PLANNING/FOCUS/REST)
2. WHEN the daily state is LOCKED, THEN THE Mobile_App SHALL guide the user through the Airlock wizard
3. THE Mobile_App SHALL allow selecting Top 3 tasks during Airlock
4. WHEN the Airlock is completed, THEN THE Mobile_App SHALL transition to PLANNING state
5. THE Mobile_App SHALL display daily pomodoro count and progress toward daily cap

### Requirement 7: 实时同步

**User Story:** As a user, I want my mobile app to stay in sync with other devices, so that I see consistent data everywhere.

#### Acceptance Criteria

1. THE Socket_Client SHALL establish WebSocket connection to the server
2. WHEN the server broadcasts a state change, THEN THE Mobile_App SHALL update the UI immediately
3. WHEN the Socket_Client disconnects, THEN THE Mobile_App SHALL attempt automatic reconnection
4. THE Mobile_App SHALL display connection status indicator
5. WHEN offline, THEN THE Offline_Storage SHALL queue actions for later sync

### Requirement 8: 推送通知

**User Story:** As a user, I want to receive notifications on my phone, so that I know when my pomodoro ends.

#### Acceptance Criteria

1. THE Push_Service SHALL request notification permissions on first launch
2. THE Push_Service SHALL send local notifications for pomodoro completion
3. THE Push_Service SHALL send local notifications for rest period completion
4. WHEN a user taps a notification, THEN THE Mobile_App SHALL open to the relevant screen
5. THE Mobile_App SHALL allow users to configure notification preferences

### Requirement 9: 离线支持

**User Story:** As a user, I want to use basic features offline, so that I can work without internet connection.

#### Acceptance Criteria

1. THE Offline_Storage SHALL cache task list and current pomodoro state locally
2. WHEN offline, THEN THE Mobile_App SHALL allow viewing cached tasks
3. WHEN offline, THEN THE Mobile_App SHALL allow starting a local-only pomodoro timer
4. WHEN connection is restored, THEN THE Mobile_App SHALL sync offline actions with the server
5. THE Mobile_App SHALL display clear offline status indicator

### Requirement 10: 导航与 UI

**User Story:** As a user, I want intuitive navigation on mobile, so that I can easily access all features.

#### Acceptance Criteria

1. THE Navigation SHALL use bottom tab navigation for main sections (Home, Tasks, Timer, Settings)
2. THE Navigation SHALL use stack navigation for detail screens
3. THE Mobile_App SHALL support pull-to-refresh on list screens
4. THE Mobile_App SHALL use native platform components where appropriate
5. THE Mobile_App SHALL support both light and dark mode themes
6. THE Mobile_App SHALL adapt layout for different screen sizes

### Requirement 11: 设置与配置

**User Story:** As a user, I want to configure app settings, so that I can customize my experience.

#### Acceptance Criteria

1. THE Mobile_App SHALL allow configuring pomodoro duration
2. THE Mobile_App SHALL allow configuring rest duration
3. THE Mobile_App SHALL allow configuring daily cap
4. THE Mobile_App SHALL allow enabling/disabling notifications
5. THE Mobile_App SHALL allow enabling/disabling biometric login
6. THE Mobile_App SHALL sync settings with the server

### Requirement 12: 项目结构

**User Story:** As a developer, I want a well-organized project structure, so that the codebase is maintainable.

#### Acceptance Criteria

1. THE Mobile_App SHALL be located in `vibeflow-mobile/` directory at the project root
2. THE Mobile_App SHALL follow a feature-based folder structure
3. THE Mobile_App SHALL share type definitions with the web project where possible
4. THE Mobile_App SHALL use a shared API client configuration
5. THE Mobile_App SHALL include comprehensive README with setup instructions
