# Requirements Document

## Introduction

本文档定义 VibeFlow 上线前 E2E 测试覆盖的补充需求。当前 E2E 仅覆盖 Airlock、Pomodoro、Chat、MCP 流程，核心 CRUD 操作（Task、Project、Goal、Settings）缺少 E2E 验证。本 Spec 关注补齐这些测试盲区。

注意：与已有的 `e2e-testing` Spec 互补，本 Spec 聚焦具体的业务流程测试用例，而 `e2e-testing` 偏向基础设施（Page Objects、CI/CD 集成等）。

## Glossary

- **Page_Object**: 封装页面交互细节的测试抽象层
- **CRUD_Flow**: 创建→读取→更新→删除的完整操作流程
- **Happy_Path**: 正常操作流程的端到端测试
- **Cross_Client**: 跨客户端（Web + Desktop）的状态同步测试

## Requirements

### Requirement 1: Task CRUD E2E

**User Story:** As a QA engineer, I want automated E2E tests for task operations, so that task management regressions are caught.

#### Acceptance Criteria

1. WHEN running E2E tests THEN there SHALL be tests for: create task, edit task, delete task, create subtask, set priority, set planDate
2. WHEN a task is created via UI THEN the test SHALL verify it appears in the task list
3. WHEN a task is deleted THEN the test SHALL verify it no longer appears

### Requirement 2: Project CRUD E2E

**User Story:** As a QA engineer, I want automated E2E tests for project operations.

#### Acceptance Criteria

1. WHEN running E2E tests THEN there SHALL be tests for: create project, edit project, archive project, view project detail
2. WHEN a project is created THEN the test SHALL verify tasks can be added to it

### Requirement 3: Goal CRUD E2E

**User Story:** As a QA engineer, I want automated E2E tests for goal operations.

#### Acceptance Criteria

1. WHEN running E2E tests THEN there SHALL be tests for: create goal, edit goal, link project to goal, view goal progress

### Requirement 4: Settings E2E

**User Story:** As a QA engineer, I want automated E2E tests for settings changes.

#### Acceptance Criteria

1. WHEN running E2E tests THEN there SHALL be tests for: change daily cap, modify blacklist, adjust pomodoro duration
2. WHEN a setting is changed THEN the test SHALL verify the change persists after page reload

### Requirement 5: Daily State 流转 E2E

**User Story:** As a QA engineer, I want automated E2E tests for the full daily state cycle.

#### Acceptance Criteria

1. WHEN running E2E tests THEN there SHALL be a test covering: LOCKED → Airlock → PLANNING → Start Pomodoro → FOCUS → Complete → REST → next Pomodoro
2. WHEN daily cap is reached THEN the test SHALL verify the daily cap modal appears
3. WHEN daily reset time (04:00) is simulated THEN the state SHALL reset to LOCKED
