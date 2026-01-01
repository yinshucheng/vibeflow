# Requirements Document

## Introduction

本文档定义 VibeFlow 端到端 (E2E) 测试框架的需求。目标是建立一个自动化测试优先的验收流程，最大程度减少人工介入，同时确保所有 UI 功能的正确性和用户体验质量。

核心原则：
- **自动化优先**：所有可自动化的测试场景必须先通过 Playwright 测试
- **人工验收为辅**：只有在自动化测试通过后，才进行人工验收
- **持续集成**：E2E 测试集成到 CI/CD 流程中
- **可视化报告**：生成详细的测试报告和截图，便于问题定位

## Glossary

- **E2E_Test**: 端到端测试，模拟真实用户操作验证完整功能流程
- **Playwright**: 微软开源的浏览器自动化测试框架
- **Test_Suite**: 测试套件，一组相关测试用例的集合
- **Test_Fixture**: 测试夹具，测试前后的环境准备和清理
- **Page_Object**: 页面对象模式，封装页面元素和操作
- **Visual_Regression**: 视觉回归测试，检测 UI 变化
- **Test_Report**: 测试报告，包含测试结果、截图和日志
- **Manual_Acceptance**: 人工验收，在自动化测试通过后进行的人工确认
- **Test_Data_Seeding**: 测试数据播种，为测试准备必要的数据库状态

## Requirements

### Requirement 1: Playwright 测试框架配置

**User Story:** As a Developer, I want a properly configured Playwright testing environment, so that I can write and run E2E tests efficiently.

#### Acceptance Criteria

1. WHEN the project is set up, THE E2E_Test framework SHALL include Playwright as a dev dependency
2. WHEN running E2E tests, THE E2E_Test framework SHALL support Chromium, Firefox, and WebKit browsers
3. WHEN configuring tests, THE E2E_Test framework SHALL provide a `playwright.config.ts` with sensible defaults
4. WHEN tests need authentication, THE E2E_Test framework SHALL provide a reusable auth setup fixture
5. WHEN tests need database state, THE E2E_Test framework SHALL provide Test_Data_Seeding utilities
6. WHEN tests complete, THE E2E_Test framework SHALL generate HTML reports with screenshots and traces

### Requirement 2: 测试数据管理

**User Story:** As a Developer, I want isolated test data for each test run, so that tests are reliable and repeatable.

#### Acceptance Criteria

1. WHEN a test suite starts, THE E2E_Test framework SHALL create a fresh test database or reset to known state
2. WHEN seeding test data, THE E2E_Test framework SHALL provide factory functions for User, Project, Task, Goal entities
3. WHEN a test completes, THE E2E_Test framework SHALL clean up created test data
4. WHEN running tests in parallel, THE E2E_Test framework SHALL ensure data isolation between test workers
5. IF test data seeding fails, THEN THE E2E_Test framework SHALL fail fast with clear error message

### Requirement 3: Page Object 模式实现

**User Story:** As a Developer, I want reusable page objects, so that tests are maintainable and readable.

#### Acceptance Criteria

1. THE E2E_Test framework SHALL provide Page_Object classes for each major page:
   - LoginPage
   - DashboardPage
   - ProjectsPage
   - TasksPage
   - GoalsPage
   - AirlockPage
   - PomodoroPage
   - SettingsPage
2. WHEN interacting with UI elements, THE Page_Object SHALL encapsulate selectors and actions
3. WHEN page structure changes, THE Page_Object SHALL be the single point of update
4. WHEN writing tests, THE Developer SHALL use Page_Object methods instead of raw selectors

### Requirement 4: 晨间气闸 E2E 测试

**User Story:** As a Developer, I want comprehensive E2E tests for the Morning Airlock wizard, so that the critical daily planning flow is verified.

#### Acceptance Criteria

1. THE E2E_Test suite SHALL verify the complete 3-step Airlock wizard flow
2. WHEN testing Step 1 (Review), THE E2E_Test SHALL verify:
   - Display of yesterday's incomplete tasks
   - Defer action moves task to future date
   - Delete action removes task
3. WHEN testing Step 2 (Plan), THE E2E_Test SHALL verify:
   - Display of project backlog
   - Drag-and-drop task to Today list
   - Task count updates correctly
4. WHEN testing Step 3 (Commit), THE E2E_Test SHALL verify:
   - Top 3 task selection UI
   - Validation that exactly 3 tasks are selected
   - "Start Day" button enables only when valid
5. WHEN Airlock completes, THE E2E_Test SHALL verify System_State changes to PLANNING

### Requirement 5: 番茄钟 E2E 测试

**User Story:** As a Developer, I want comprehensive E2E tests for the Pomodoro timer, so that the core focus mechanism is verified.

#### Acceptance Criteria

1. THE E2E_Test suite SHALL verify Pomodoro start requires task selection
2. WHEN testing timer start, THE E2E_Test SHALL verify:
   - Task selector displays available tasks
   - Timer countdown begins after task selection
   - System_State changes to FOCUS
3. WHEN testing timer completion, THE E2E_Test SHALL verify:
   - Completion modal appears at timer end
   - Manual confirmation is required
   - Session is recorded with COMPLETED status
4. WHEN testing timer abort, THE E2E_Test SHALL verify:
   - Stop button aborts the session
   - Session is recorded with ABORTED status
5. WHEN testing rest mode, THE E2E_Test SHALL verify:
   - Rest timer displays after completion
   - New Pomodoro blocked during rest

### Requirement 6: 项目管理 E2E 测试

**User Story:** As a Developer, I want E2E tests for project CRUD operations, so that project management is verified.

#### Acceptance Criteria

1. THE E2E_Test suite SHALL verify project creation with required fields
2. WHEN testing project creation, THE E2E_Test SHALL verify:
   - Title and deliverable are required
   - Goal association selector works
   - New project appears in list
3. WHEN testing project editing, THE E2E_Test SHALL verify:
   - Edit form pre-fills existing data
   - Changes persist after save
4. WHEN testing project archiving, THE E2E_Test SHALL verify:
   - Archive action moves project to archived section
   - Associated tasks are also archived
5. WHEN testing project list, THE E2E_Test SHALL verify:
   - Projects grouped by status (Active, Completed, Archived)
   - Filtering and sorting work correctly

### Requirement 7: 任务管理 E2E 测试

**User Story:** As a Developer, I want E2E tests for task management, so that the hierarchical task system is verified.

#### Acceptance Criteria

1. THE E2E_Test suite SHALL verify task creation requires project selection
2. WHEN testing task creation, THE E2E_Test SHALL verify:
   - Project selector is required
   - Priority selection (P1/P2/P3) works
   - Sub-task creation under parent task works
3. WHEN testing task tree, THE E2E_Test SHALL verify:
   - Hierarchical display with collapsible nodes
   - Expand/collapse toggles work
4. WHEN testing task reordering, THE E2E_Test SHALL verify:
   - Drag-and-drop reorders tasks
   - Order persists after page reload
5. WHEN testing task status, THE E2E_Test SHALL verify:
   - Status toggle updates immediately
   - Completing parent prompts for sub-tasks

### Requirement 8: 目标管理 E2E 测试

**User Story:** As a Developer, I want E2E tests for goal management, so that the goal-project alignment is verified.

#### Acceptance Criteria

1. THE E2E_Test suite SHALL verify goal creation with timeframe validation
2. WHEN testing long-term goal, THE E2E_Test SHALL verify:
   - Timeframe must be 1-5 years
   - Title and description required
3. WHEN testing short-term goal, THE E2E_Test SHALL verify:
   - Timeframe must be 1 week - 6 months
   - Title and description required
4. WHEN testing goal-project linking, THE E2E_Test SHALL verify:
   - Projects can be linked to goals
   - Goal progress reflects linked project status
5. WHEN testing goal dashboard, THE E2E_Test SHALL verify:
   - Progress percentage displays correctly
   - Linked projects are listed

### Requirement 9: 系统状态 E2E 测试

**User Story:** As a Developer, I want E2E tests for system state transitions, so that the state machine behavior is verified in the UI.

#### Acceptance Criteria

1. THE E2E_Test suite SHALL verify state indicator displays correctly
2. WHEN testing LOCKED state, THE E2E_Test SHALL verify:
   - Only Airlock wizard is accessible
   - Navigation to other pages is blocked
3. WHEN testing PLANNING state, THE E2E_Test SHALL verify:
   - Full navigation is available
   - Pomodoro can be started
4. WHEN testing FOCUS state, THE E2E_Test SHALL verify:
   - UI shows minimal distractions
   - Timer is prominently displayed
5. WHEN testing REST state, THE E2E_Test SHALL verify:
   - Rest timer is displayed
   - New Pomodoro start is blocked

### Requirement 10: 封顶机制 E2E 测试

**User Story:** As a Developer, I want E2E tests for the daily cap feature, so that burnout prevention is verified.

#### Acceptance Criteria

1. THE E2E_Test suite SHALL verify daily cap configuration
2. WHEN testing cap reached, THE E2E_Test SHALL verify:
   - "Day Complete" celebration modal appears
   - New Pomodoro start is blocked
3. WHEN testing cap override, THE E2E_Test SHALL verify:
   - Override confirmation dialog appears
   - User can proceed after explicit confirmation
4. WHEN testing cap progress, THE E2E_Test SHALL verify:
   - Progress indicator shows current/max
   - Visual warning as approaching cap

### Requirement 11: 测试报告与人工验收流程

**User Story:** As a Developer, I want clear test reports and a defined manual acceptance process, so that quality is ensured with minimal human effort.

#### Acceptance Criteria

1. WHEN E2E tests complete, THE E2E_Test framework SHALL generate an HTML report
2. THE Test_Report SHALL include:
   - Pass/fail status for each test
   - Screenshots at key steps
   - Video recording of failed tests
   - Trace files for debugging
3. WHEN all E2E tests pass, THE system SHALL generate a Manual_Acceptance checklist
4. THE Manual_Acceptance checklist SHALL include:
   - Visual appearance verification items
   - Edge cases not covered by automation
   - Performance perception items
5. WHEN Manual_Acceptance is complete, THE Developer SHALL mark the feature as verified

### Requirement 12: CI/CD 集成

**User Story:** As a Developer, I want E2E tests integrated into CI/CD, so that regressions are caught automatically.

#### Acceptance Criteria

1. WHEN code is pushed, THE CI pipeline SHALL run E2E tests automatically
2. WHEN E2E tests fail, THE CI pipeline SHALL block merge and notify developers
3. THE CI configuration SHALL support parallel test execution for speed
4. THE CI configuration SHALL upload test artifacts (reports, screenshots) for review
5. WHEN tests are flaky, THE E2E_Test framework SHALL support retry mechanism

