# Requirements Document

## Introduction

VibeFlow 是一个 AI 原生的一体化产出引擎 (AI-Native Output Engine)，旨在解决知识工作者"过度输入、产出低效、注意力涣散"的问题。本文档定义 Phase 1: The Foundation 的核心需求，包括晨间气闸、结构化任务管理、番茄钟计时和基础浏览器感知功能。

核心哲学：
- **Project-First (项目优先)**：所有任务必须依附于具体的交付物
- **The Airlock Protocol (气闸协议)**：有意识地开始，有节制地结束
- **System > Willpower (系统优于意志)**：依赖系统的控制闭环，而非人的自觉

## Glossary

- **VibeFlow_System**: 整个 VibeFlow 应用系统
- **User**: 使用 VibeFlow 的知识工作者
- **Project**: 具有明确交付物 (Deliverable) 的工作项目
- **Task**: 属于某个 Project 的具体任务，支持无限层级子任务
- **Pomodoro**: 番茄钟计时单元，必须绑定到具体 Task
- **Morning_Airlock**: 晨间气闸，每日强制校准目标的 Wizard 流程
- **System_State**: 系统全局状态，包括 LOCKED、PLANNING、FOCUS、REST
- **Browser_Sentinel**: Chrome 扩展，负责感知和拦截浏览器行为
- **Blacklist**: 用户定义的需要拦截的网站列表
- **Top_3_Tasks**: 每日必须选定的三个最重要任务
- **MCP_Server**: Model Context Protocol 服务端，允许外部 AI Agent 读写 VibeFlow 状态
- **External_Agent**: 外部 AI 工具，如 Cursor、Claude Code 等
- **Ammo_Box**: 与当前任务相关的参考文档和代码片段集合
- **Long_Term_Goal**: 长期目标，时间跨度 1-5 年，代表人生方向
- **Short_Term_Goal**: 短期目标，时间跨度 1 周至 6 个月，代表阶段性里程碑
- **Daily_Cap**: 每日工作上限，防止透支的封顶机制
- **Whitelist**: 用户定义的 FOCUS 模式下允许访问的网站列表

## Requirements

### Requirement 1: Project 管理

**User Story:** As a User, I want to create and manage Projects with clear deliverables, so that all my work has a concrete output goal.

#### Acceptance Criteria

1. WHEN a User creates a Project, THE VibeFlow_System SHALL require a title and a deliverable description
2. WHEN a Project is created, THE VibeFlow_System SHALL assign a unique identifier and set status to ACTIVE
3. WHEN a User views Projects, THE VibeFlow_System SHALL display all Projects grouped by status (ACTIVE, COMPLETED, ARCHIVED)
4. WHEN a User updates a Project, THE VibeFlow_System SHALL persist the changes immediately
5. WHEN a User archives a Project, THE VibeFlow_System SHALL move all associated Tasks to archived state

### Requirement 2: Task 管理与强制归属

**User Story:** As a User, I want to create Tasks that must belong to a Project, so that I never have orphaned work items.

#### Acceptance Criteria

1. WHEN a User creates a Task, THE VibeFlow_System SHALL require selecting a parent Project
2. WHEN a User attempts to create a Task without a Project, THE VibeFlow_System SHALL reject the creation and display an error message
3. WHEN a User creates a Task, THE VibeFlow_System SHALL allow setting title, priority (P1/P2/P3), and optional parent Task for sub-task hierarchy
4. WHEN a Task has sub-tasks, THE VibeFlow_System SHALL display them in a collapsible tree structure
5. WHEN a User updates a Task status, THE VibeFlow_System SHALL persist the change and update the UI immediately
6. WHEN a User drags a Task, THE VibeFlow_System SHALL allow reordering within the same Project
7. WHEN a parent Task is marked as DONE, THE VibeFlow_System SHALL prompt to mark all incomplete sub-tasks as DONE

### Requirement 3: 晨间气闸 (Morning Airlock)

**User Story:** As a User, I want a daily planning ritual that forces me to review and commit to my priorities, so that I start each day with clear focus.

#### Acceptance Criteria

1. WHEN the system time reaches 04:00 AM, THE VibeFlow_System SHALL reset the daily state and lock the main UI
2. WHILE the System_State is LOCKED, THE VibeFlow_System SHALL display only the Morning_Airlock wizard
3. WHEN the Morning_Airlock starts, THE VibeFlow_System SHALL display Step 1: Review with all incomplete Tasks from yesterday
4. WHEN reviewing yesterday's Tasks, THE VibeFlow_System SHALL allow User to Defer (reschedule) or Delete each Task
5. WHEN Step 1 is complete, THE VibeFlow_System SHALL proceed to Step 2: Plan
6. WHEN in Step 2: Plan, THE VibeFlow_System SHALL display the Project Backlog and allow dragging Tasks to Today's list
7. WHEN Step 2 is complete, THE VibeFlow_System SHALL proceed to Step 3: Commit
8. WHEN in Step 3: Commit, THE VibeFlow_System SHALL require selecting exactly 3 Tasks as Top_3_Tasks
9. WHEN User clicks "Start Day" with Top_3_Tasks selected, THE VibeFlow_System SHALL unlock the main UI and set System_State to PLANNING
10. IF User attempts to bypass the Morning_Airlock, THEN THE VibeFlow_System SHALL block access and display the wizard

### Requirement 4: 番茄钟计时

**User Story:** As a User, I want to use Pomodoro technique tied to specific Tasks, so that I can maintain focused work sessions.

#### Acceptance Criteria

1. WHEN a User starts a Pomodoro, THE VibeFlow_System SHALL require selecting a specific Task
2. WHEN a User attempts to start a Pomodoro without selecting a Task, THE VibeFlow_System SHALL reject and prompt for Task selection
3. WHEN a Pomodoro starts, THE VibeFlow_System SHALL set System_State to FOCUS and begin countdown timer
4. WHILE System_State is FOCUS, THE VibeFlow_System SHALL display the timer prominently with current Task title
5. WHEN the Pomodoro timer reaches zero, THE VibeFlow_System SHALL display a full-screen modal requiring manual confirmation
6. WHEN User confirms Pomodoro completion, THE VibeFlow_System SHALL record the session with COMPLETED status and set System_State to REST
7. WHILE System_State is REST, THE VibeFlow_System SHALL display rest timer and block starting new Pomodoro until rest ends
8. WHEN User manually stops a Pomodoro before completion, THE VibeFlow_System SHALL record the session with ABORTED status
9. IF a Pomodoro is interrupted by external event, THEN THE VibeFlow_System SHALL record the session with INTERRUPTED status

### Requirement 5: 系统状态机

**User Story:** As a User, I want the system to maintain clear states that control what actions are available, so that I follow the intended workflow.

#### Acceptance Criteria

1. THE VibeFlow_System SHALL maintain one of four System_States: LOCKED, PLANNING, FOCUS, REST
2. WHEN System_State changes, THE VibeFlow_System SHALL update the UI to reflect available actions
3. WHILE System_State is LOCKED, THE VibeFlow_System SHALL only allow Morning_Airlock interactions
4. WHILE System_State is PLANNING, THE VibeFlow_System SHALL allow Task management and Pomodoro start
5. WHILE System_State is FOCUS, THE VibeFlow_System SHALL minimize UI distractions and show only current Task and timer
6. WHILE System_State is REST, THE VibeFlow_System SHALL display rest countdown and motivational content
7. WHEN the UI loads, THE VibeFlow_System SHALL display the current System_State visually (color coding, icons)

### Requirement 6: Browser Sentinel 基础感知

**User Story:** As a User, I want the system to track my browser activity and block distracting sites, so that I stay focused during work sessions.

#### Acceptance Criteria

1. WHEN Browser_Sentinel is installed, THE VibeFlow_System SHALL begin collecting active tab URL and duration data
2. WHEN a User visits a URL, THE Browser_Sentinel SHALL log the URL, timestamp, and tab active duration
3. WHEN a User configures the Blacklist, THE VibeFlow_System SHALL store the patterns locally in the extension
4. WHILE System_State is FOCUS, WHEN a User navigates to a Blacklist URL, THE Browser_Sentinel SHALL redirect to a screensaver page
5. WHEN Browser_Sentinel has no network connection, THE Browser_Sentinel SHALL use locally cached Blacklist for blocking
6. WHEN activity data is collected, THE Browser_Sentinel SHALL sync to the server when connection is available
7. WHEN the extension starts, THE Browser_Sentinel SHALL establish WebSocket connection with the server for real-time policy updates

### Requirement 7: 数据持久化

**User Story:** As a User, I want all my data to be reliably stored and retrieved, so that I never lose my work progress.

#### Acceptance Criteria

1. WHEN any entity (Project, Task, Pomodoro) is created or updated, THE VibeFlow_System SHALL persist to PostgreSQL database
2. WHEN a User logs in, THE VibeFlow_System SHALL load all associated Projects, Tasks, and settings
3. WHEN activity logs are received, THE VibeFlow_System SHALL store them in ActivityLog table with source and category
4. WHEN a User updates settings (including Blacklist), THE VibeFlow_System SHALL persist to User.settings JSON field
5. IF database write fails, THEN THE VibeFlow_System SHALL retry up to 3 times and notify User on persistent failure

### Requirement 8: 用户认证

**User Story:** As a User, I want to securely log in to access my personal data, so that my productivity data remains private.

#### Acceptance Criteria

1. WHEN a User registers, THE VibeFlow_System SHALL require email and password
2. WHEN a User logs in with valid credentials, THE VibeFlow_System SHALL create a session and redirect to main dashboard
3. WHEN a User logs in with invalid credentials, THE VibeFlow_System SHALL display an error message without revealing which field is incorrect
4. WHEN a session expires, THE VibeFlow_System SHALL redirect to login page
5. WHEN Browser_Sentinel needs to authenticate, THE VibeFlow_System SHALL provide a secure token exchange mechanism

### Requirement 9: MCP Server 神经接口

**User Story:** As a Developer using external AI agents (Cursor, Claude Code), I want VibeFlow to expose an MCP Server interface, so that my coding tools can read my current context and execute actions within VibeFlow.

#### Acceptance Criteria

1. THE MCP_Server SHALL implement the Model Context Protocol standard specification
2. WHEN an External_Agent connects, THE MCP_Server SHALL authenticate using API token
3. WHEN an External_Agent requests `vibe://context/current`, THE MCP_Server SHALL return current Project, active Task, and associated Ammo Box documents as JSON
4. WHEN an External_Agent requests `vibe://user/principles`, THE MCP_Server SHALL return User's coding principles and preferences
5. WHEN an External_Agent calls `vibe.complete_task(id, summary)`, THE MCP_Server SHALL mark the Task as DONE and record the summary
6. WHEN an External_Agent calls `vibe.add_subtask(parent_id, title)`, THE MCP_Server SHALL create a new sub-task under the specified parent Task
7. WHEN an External_Agent calls `vibe.report_blocker(error_log)`, THE MCP_Server SHALL log the blocker and optionally trigger AI assistance
8. WHEN an MCP connection is active, THE VibeFlow_System SHALL display "🧠 [Agent Name] is syncing context..." indicator in the UI
9. IF an External_Agent sends an invalid request, THEN THE MCP_Server SHALL return a structured error response with error code and message
10. WHEN MCP_Server starts, THE MCP_Server SHALL register available Resources and Tools according to MCP specification

### Requirement 10: MCP 资源与工具定义

**User Story:** As a Developer, I want well-defined MCP Resources and Tools, so that I can integrate VibeFlow with my development workflow seamlessly.

#### Acceptance Criteria

1. THE MCP_Server SHALL expose Resources (read-only context) at the following URIs:
   - `vibe://context/current` - Current working context
   - `vibe://user/principles` - User preferences and coding standards
   - `vibe://user/goals` - User's long-term and short-term goals
   - `vibe://projects/active` - List of active projects
   - `vibe://tasks/today` - Today's planned tasks
2. THE MCP_Server SHALL expose Tools (executable actions) with the following signatures:
   - `vibe.complete_task(task_id: string, summary: string)` - Complete a task
   - `vibe.add_subtask(parent_id: string, title: string, priority?: string)` - Add sub-task
   - `vibe.report_blocker(task_id: string, error_log: string)` - Report blocker
   - `vibe.start_pomodoro(task_id: string, duration?: number)` - Start focus session
   - `vibe.get_task_context(task_id: string)` - Get detailed task context
3. WHEN a Resource is requested, THE MCP_Server SHALL return data in JSON format with consistent schema
4. WHEN a Tool is invoked, THE MCP_Server SHALL validate parameters and return success/failure response
5. THE MCP_Server SHALL provide a configuration file template for Cursor/Claude integration

### Requirement 11: 用户目标管理

**User Story:** As a User, I want to define my long-term and short-term goals, so that the AI can make decisions with a holistic perspective aligned with my life direction.

#### Acceptance Criteria

1. WHEN a User accesses Goal settings, THE VibeFlow_System SHALL display separate sections for Long_Term_Goals and Short_Term_Goals
2. WHEN a User creates a Long_Term_Goal, THE VibeFlow_System SHALL require title, description, and target timeframe (1-5 years)
3. WHEN a User creates a Short_Term_Goal, THE VibeFlow_System SHALL require title, description, and target timeframe (1 week - 6 months)
4. WHEN a User creates a Project, THE VibeFlow_System SHALL allow linking to one or more Goals
5. WHEN displaying a Project, THE VibeFlow_System SHALL show which Goals it contributes to
6. WHEN an External_Agent requests `vibe://user/goals`, THE MCP_Server SHALL return all active Goals with their linked Projects
7. WHEN AI makes decisions (task prioritization, focus suggestions), THE VibeFlow_System SHALL consider Goal alignment as a factor
8. WHEN a Goal reaches its target date, THE VibeFlow_System SHALL prompt User to review progress and update/archive the Goal
9. THE VibeFlow_System SHALL display a Goal Progress dashboard showing completion percentage based on linked Project status
10. WHEN a User archives a Goal, THE VibeFlow_System SHALL retain historical data for reflection and analytics

### Requirement 12: 封顶机制 (Daily Cap)

**User Story:** As a User, I want the system to enforce a daily work limit, so that I don't burn out and maintain sustainable productivity (村上春树模式).

#### Acceptance Criteria

1. WHEN a User configures settings, THE VibeFlow_System SHALL allow setting a Daily_Cap (maximum Pomodoro count or hours)
2. WHEN the daily Pomodoro count reaches Daily_Cap, THE VibeFlow_System SHALL display a "Day Complete" celebration and block new Pomodoro starts
3. WHILE Daily_Cap is reached, THE VibeFlow_System SHALL set System_State to REST and encourage User to stop working
4. WHEN Daily_Cap is reached, THE VibeFlow_System SHALL allow User to override with explicit confirmation ("I understand I'm exceeding my limit")
5. THE VibeFlow_System SHALL track override frequency and display warnings if User frequently exceeds Daily_Cap
6. WHEN displaying daily statistics, THE VibeFlow_System SHALL show progress toward Daily_Cap as a visual indicator

### Requirement 13: 白名单与智能拦截

**User Story:** As a User, I want to define allowed websites during focus mode, so that I can access work-related resources without interruption.

#### Acceptance Criteria

1. WHEN a User configures Browser_Sentinel, THE VibeFlow_System SHALL allow defining both Blacklist and Whitelist URL patterns
2. WHILE System_State is FOCUS, WHEN a User navigates to a Whitelist URL, THE Browser_Sentinel SHALL allow access without interruption
3. WHILE System_State is FOCUS, WHEN a User navigates to a URL not in Whitelist or Blacklist, THE Browser_Sentinel SHALL display a soft intervention overlay asking "Is this related to your current task?"
4. WHEN User confirms URL is task-related, THE Browser_Sentinel SHALL temporarily whitelist the URL for the current Pomodoro session
5. WHEN User confirms URL is not task-related OR timeout (10 seconds), THE Browser_Sentinel SHALL redirect to screensaver
6. THE VibeFlow_System SHALL allow associating specific Whitelist patterns with specific Projects or Tasks

### Requirement 14: 可配置计时参数

**User Story:** As a User, I want to customize Pomodoro and rest durations, so that I can adapt the system to my personal work rhythm.

#### Acceptance Criteria

1. WHEN a User accesses timer settings, THE VibeFlow_System SHALL allow configuring default Pomodoro duration (default: 25 minutes)
2. WHEN a User accesses timer settings, THE VibeFlow_System SHALL allow configuring short rest duration (default: 5 minutes)
3. WHEN a User accesses timer settings, THE VibeFlow_System SHALL allow configuring long rest duration after N Pomodoros (default: 15 minutes after 4 Pomodoros)
4. WHEN starting a Pomodoro, THE VibeFlow_System SHALL allow overriding the default duration for that session
5. THE VibeFlow_System SHALL enforce minimum durations (Pomodoro >= 10 min, Rest >= 2 min) to prevent gaming the system
