# Requirements Document

## Introduction

本文档定义 VibeFlow 数据隔离审计的需求。虽然 Services 在设计上按 `userId` 过滤数据，但尚未进行系统性的安全审计。上线前必须验证所有数据访问路径都正确限定了用户范围，防止跨用户数据泄露。

## Glossary

- **Data_Isolation**: 确保用户只能访问自己数据的安全机制
- **Query_Audit**: 对所有 Prisma 查询进行 userId 过滤检查
- **Socket_Isolation**: Socket.io 房间级别的用户数据隔离
- **Cross_User_Test**: 验证用户 A 无法访问用户 B 数据的安全测试

## Requirements

### Requirement 1: Prisma 查询审计

**User Story:** As a security auditor, I want all database queries to be verified for user scoping, so that no data leaks are possible.

#### Acceptance Criteria

1. WHEN any Service queries user-owned data THEN the query WHERE clause SHALL include `userId` filter
2. WHEN reviewing all 62 services THEN each service's Prisma calls SHALL be documented as audited or N/A
3. WHEN a service is found missing userId filter THEN it SHALL be fixed and a regression test added

### Requirement 2: Socket.io 隔离验证

**User Story:** As a user, I want WebSocket broadcasts to only reach my sessions, so that other users cannot see my state changes.

#### Acceptance Criteria

1. WHEN a state change is broadcast THEN it SHALL only be sent to sockets in the user's room
2. WHEN a user connects via Socket.io THEN the server SHALL verify auth before joining the user room
3. WHEN a socket attempts to join another user's room THEN the System SHALL reject the request

### Requirement 3: tRPC Context 审计

**User Story:** As a developer, I want the userId chain from auth to service to be verified, so that no middleware gap allows unscoped access.

#### Acceptance Criteria

1. WHEN a protectedProcedure is called THEN the userId in context SHALL match the authenticated session
2. WHEN a service receives a userId parameter THEN it SHALL be the same userId from the tRPC context (no user-supplied override)

### Requirement 4: 跨用户安全测试

**User Story:** As a QA engineer, I want automated tests proving data isolation, so that regressions are caught immediately.

#### Acceptance Criteria

1. WHEN running E2E tests THEN there SHALL be at least 5 cross-user isolation tests covering: tasks, projects, goals, pomodoros, settings
2. WHEN user A creates a task THEN user B's task list query SHALL NOT include that task
3. WHEN user A starts a pomodoro THEN user B's state SHALL NOT reflect user A's pomodoro
