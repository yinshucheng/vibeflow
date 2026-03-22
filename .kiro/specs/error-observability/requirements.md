# Requirements Document

## Introduction

本文档定义 VibeFlow 上线前的错误处理与可观测性需求。当前系统缺少全局错误边界、结构化日志和错误监控集成，生产环境下无法有效发现和诊断问题。

## Glossary

- **Error_Boundary**: React 全局错误边界组件，捕获渲染时的未处理异常
- **Structured_Log**: 带有时间戳、级别、上下文的 JSON 格式日志
- **Error_Tracker**: 外部错误追踪服务（如 Sentry）
- **Health_Check**: 应用健康检查端点，供监控系统探测

## Requirements

### Requirement 1: React 全局错误边界

**User Story:** As a user, I want to see a friendly error page instead of a white screen when something goes wrong.

#### Acceptance Criteria

1. WHEN an unhandled React error occurs THEN the System SHALL display an error fallback UI with a "Reload" button
2. WHEN the error boundary catches an error THEN it SHALL log error details to the console and (if configured) to the error tracker
3. WHEN a user clicks "Reload" THEN the page SHALL fully reload and recover

### Requirement 2: API 错误统一格式

**User Story:** As a frontend developer, I want all API errors to have a consistent format, so that I can handle them uniformly.

#### Acceptance Criteria

1. WHEN a tRPC procedure throws THEN the error response SHALL include `code`, `message`, and optional `details`
2. WHEN a ServiceResult returns `success: false` THEN the tRPC layer SHALL map it to the appropriate HTTP status
3. WHEN an unexpected server error occurs THEN the response SHALL NOT expose internal stack traces to the client

### Requirement 3: 关键路径日志

**User Story:** As an operator, I want structured logs for important operations, so that I can diagnose production issues.

#### Acceptance Criteria

1. WHEN a user logs in or out THEN the System SHALL log the event with userId and timestamp
2. WHEN a state machine transition occurs THEN the System SHALL log the from/to states with userId
3. WHEN an LLM API call fails THEN the System SHALL log the error with model, latency, and error type
4. WHEN a Pomodoro starts or completes THEN the System SHALL log the event

### Requirement 4: 健康检查端点

**User Story:** As a monitoring system, I want a health check endpoint, so that I can detect when the application is down.

#### Acceptance Criteria

1. WHEN `/api/health` is called THEN the System SHALL return status 200 with `{ status: "ok", uptime, version }`
2. WHEN the database is unreachable THEN the health check SHALL return status 503
3. WHEN the Socket.io server is down THEN the health check SHALL include a degraded status
