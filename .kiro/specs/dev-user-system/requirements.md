# Requirements Document

## Introduction

本文档定义了 VibeFlow 开发阶段用户系统的需求。该系统需要实现用户数据隔离，支持开发模式下的快速用户切换，并为后续接入 Google 等第三方登录做好架构准备。

## Glossary

- **User_Service**: 用户管理服务，负责用户的创建、查询和认证
- **Auth_Provider**: 认证提供者，包括凭证认证和第三方 OAuth 认证
- **User_Context**: 当前请求的用户上下文，包含 userId 和认证状态
- **Data_Isolation**: 数据隔离机制，确保用户只能访问自己的数据
- **Dev_Mode**: 开发模式，允许通过 HTTP header 快速切换用户身份
- **OAuth_Provider**: 第三方 OAuth 认证提供者（如 Google、GitHub）
- **Browser_Extension**: 浏览器插件，用于追踪用户浏览活动
- **User_Selector**: 开发模式下的用户切换组件
- **MCP_Server**: Model Context Protocol 服务器，为 AI agents 提供 VibeFlow 数据访问

## Requirements

### Requirement 1: 用户数据隔离

**User Story:** As a user, I want my data to be isolated from other users, so that my projects, tasks, and settings remain private.

#### Acceptance Criteria

1. WHEN a user queries projects THEN the System SHALL return only projects belonging to that user
2. WHEN a user queries tasks THEN the System SHALL return only tasks belonging to that user
3. WHEN a user queries goals THEN the System SHALL return only goals belonging to that user
4. WHEN a user queries pomodoros THEN the System SHALL return only pomodoros belonging to that user
5. WHEN a user attempts to access another user's resource by ID THEN the System SHALL return a NOT_FOUND error
6. WHEN a user creates a resource THEN the System SHALL automatically associate it with that user's ID

### Requirement 2: 开发模式用户切换

**User Story:** As a developer, I want to quickly switch between user identities during development, so that I can test multi-user scenarios without re-authentication.

#### Acceptance Criteria

1. WHILE Dev_Mode is enabled, WHEN a request contains X-Dev-User-Email header THEN the User_Service SHALL authenticate as that user
2. WHILE Dev_Mode is enabled, WHEN a request lacks X-Dev-User-Email header THEN the User_Service SHALL use the default dev user
3. WHILE Dev_Mode is enabled, WHEN the specified email does not exist THEN the User_Service SHALL create a new user with that email
4. WHILE Dev_Mode is disabled THEN the System SHALL ignore X-Dev-User-Email header and require standard authentication

### Requirement 3: 用户注册

**User Story:** As a new user, I want to register an account with email and password, so that I can access the application.

#### Acceptance Criteria

1. WHEN a user submits valid registration data THEN the User_Service SHALL create a new user account
2. WHEN a user submits an email that already exists THEN the User_Service SHALL return a CONFLICT error
3. WHEN a user submits an invalid email format THEN the User_Service SHALL return a VALIDATION_ERROR
4. WHEN a user submits a password shorter than 8 characters THEN the User_Service SHALL return a VALIDATION_ERROR
5. WHEN a user is created THEN the User_Service SHALL hash the password before storage

### Requirement 4: 用户登录

**User Story:** As a registered user, I want to log in with my credentials, so that I can access my data.

#### Acceptance Criteria

1. WHEN a user submits valid credentials THEN the Auth_Provider SHALL return a valid session token
2. WHEN a user submits invalid credentials THEN the Auth_Provider SHALL return an AUTH_ERROR
3. WHEN a session token expires THEN the System SHALL require re-authentication
4. THE session token SHALL expire after 30 days of inactivity

### Requirement 5: OAuth 认证准备

**User Story:** As a user, I want to be able to log in with Google in the future, so that I can use my existing account.

#### Acceptance Criteria

1. THE User data model SHALL support linking multiple Auth_Providers to a single user
2. WHEN an OAuth_Provider returns user info THEN the System SHALL be able to link or create a user account
3. THE User data model SHALL store provider-specific identifiers separately from the user ID
4. WHEN a user logs in via OAuth with an email matching an existing account THEN the System SHALL link the OAuth provider to that account

### Requirement 6: 服务层用户上下文

**User Story:** As a developer, I want all service methods to receive user context, so that data isolation is enforced consistently.

#### Acceptance Criteria

1. WHEN a service method is called THEN it SHALL receive User_Context as a parameter
2. WHEN a service method queries data THEN it SHALL filter by the userId from User_Context
3. WHEN a service method creates data THEN it SHALL set the userId from User_Context
4. IF a service method receives an invalid User_Context THEN it SHALL return an AUTH_ERROR

### Requirement 7: API 路由认证

**User Story:** As a developer, I want API routes to automatically extract user context, so that I don't need to handle authentication in each route.

#### Acceptance Criteria

1. WHEN an API route is called THEN the middleware SHALL extract User_Context from the request
2. WHILE Dev_Mode is enabled THEN the middleware SHALL use dev authentication
3. WHILE Dev_Mode is disabled THEN the middleware SHALL use NextAuth session
4. IF authentication fails THEN the middleware SHALL return a 401 response
5. WHEN authentication succeeds THEN the middleware SHALL pass User_Context to the route handler

### Requirement 8: 前端用户身份显示

**User Story:** As a user, I want to see my current identity in the UI, so that I know which account I'm using.

#### Acceptance Criteria

1. THE UI SHALL display the current user's email in the header or navigation area
2. WHILE Dev_Mode is enabled THEN the UI SHALL display a dev mode indicator
3. WHEN the user is not authenticated THEN the UI SHALL redirect to the login page
4. THE UI SHALL provide a logout button that clears the session

### Requirement 9: 开发模式用户选择器

**User Story:** As a developer, I want a UI component to switch between test users, so that I can quickly test multi-user scenarios.

#### Acceptance Criteria

1. WHILE Dev_Mode is enabled THEN the UI SHALL display a user selector component
2. WHEN a developer selects a different user email THEN the System SHALL switch to that user's context
3. THE user selector SHALL allow entering a custom email address
4. WHEN the user context changes THEN the UI SHALL refresh to show the new user's data
5. THE user selector SHALL display a list of recently used test emails

### Requirement 10: 浏览器插件用户认证

**User Story:** As a user, I want the browser extension to know my identity, so that my browsing activity is associated with my account.

#### Acceptance Criteria

1. WHEN the browser extension connects to the server THEN it SHALL send user identification
2. WHILE Dev_Mode is enabled THEN the extension SHALL use the configured dev user email
3. THE extension popup SHALL display the current user's email
4. WHEN the extension cannot authenticate THEN it SHALL display an error state
5. THE extension SHALL store the user email in local storage for persistence

### Requirement 11: WebSocket 用户认证

**User Story:** As a user, I want my WebSocket connection to be authenticated, so that real-time updates are user-specific.

#### Acceptance Criteria

1. WHEN a WebSocket connection is established THEN the client SHALL send user identification
2. THE server SHALL validate the user identity before accepting the connection
3. WHEN broadcasting updates THEN the server SHALL only send to connections belonging to that user
4. IF the user identity is invalid THEN the server SHALL reject the connection
5. WHILE Dev_Mode is enabled THEN the WebSocket SHALL accept X-Dev-User-Email for authentication


### Requirement 12: MCP 用户认证

**User Story:** As a developer, I want the MCP server to authenticate users, so that AI agents can access user-specific data.

#### Acceptance Criteria

1. WHILE Dev_Mode is enabled, WHEN no token is provided THEN the MCP_Server SHALL use the default dev user
2. WHILE Dev_Mode is enabled, WHEN a dev_<email> token is provided THEN the MCP_Server SHALL authenticate as that user
3. WHILE Dev_Mode is disabled, WHEN no valid token is provided THEN the MCP_Server SHALL return an AUTH_ERROR
4. WHEN a valid token is provided THEN the MCP_Server SHALL extract the user context and pass it to tool handlers
5. THE MCP_Server SHALL ensure all tool operations use the authenticated user's context for data access

### Requirement 13: MCP 本地开发配置

**User Story:** As a developer, I want to easily configure MCP for local development, so that my local AI agents can connect to VibeFlow.

#### Acceptance Criteria

1. THE System SHALL provide a documented MCP configuration for local development
2. THE configuration SHALL specify how to set the dev user email
3. WHEN the MCP server starts THEN it SHALL log the current authentication mode (dev/production)
4. THE System SHALL provide example configurations for common AI agents (Cursor, Claude Code, Kiro)
