# Requirements Document

## Introduction

This feature enables users to categorize tasks as either work-related or life chores, allowing the system to provide context-aware reminders and suggestions. During work hours, the system focuses on work tasks, while during non-work hours, the AI proactively reminds users about pending life chores to help maintain work-life balance.

## Glossary

- **Task_Manager**: The system component responsible for task creation, modification, and categorization
- **AI_Assistant**: The MCP-integrated AI agent that provides intelligent suggestions and reminders
- **Work_Hours**: Time periods defined by the user's work time settings (workTimeSlots)
- **Life_Chore**: A task categorized as personal or household-related (non-work)
- **Work_Task**: A task categorized as professional or career-related
- **Reminder_Service**: The system component that triggers proactive notifications about pending tasks
- **Task_Category**: An enumeration of task types: WORK or LIFE

## Requirements

### Requirement 1: Task Categorization

**User Story:** As a user, I want to categorize my tasks as either work or life chores, so that the system can provide context-appropriate suggestions and reminders.

#### Acceptance Criteria

1. WHEN a user creates a new task, THE Task_Manager SHALL allow the user to specify a category (WORK or LIFE)
2. WHEN a user does not specify a category during task creation, THE Task_Manager SHALL default to WORK category
3. WHEN a user views a task, THE Task_Manager SHALL display the task's category
4. WHEN a user edits a task, THE Task_Manager SHALL allow changing the task category
5. WHEN a task has subtasks, THE Task_Manager SHALL allow each subtask to have its own independent category

### Requirement 2: Category Filtering and Display

**User Story:** As a user, I want to filter and view tasks by category, so that I can focus on the appropriate tasks for my current context.

#### Acceptance Criteria

1. WHEN a user views the task list, THE Task_Manager SHALL provide a filter option to show only WORK tasks
2. WHEN a user views the task list, THE Task_Manager SHALL provide a filter option to show only LIFE tasks
3. WHEN a user views the task list, THE Task_Manager SHALL provide a filter option to show all tasks regardless of category
4. WHEN displaying tasks, THE Task_Manager SHALL visually distinguish between WORK and LIFE tasks using icons or labels
5. WHEN a user is in the Airlock planning phase, THE Task_Manager SHALL show both WORK and LIFE tasks for Top 3 selection

### Requirement 3: Work Hours Context Awareness

**User Story:** As a user, I want the system to understand my work hours, so that it can provide appropriate task suggestions based on the time of day.

#### Acceptance Criteria

1. WHEN the current time is within any configured work time slot, THE System SHALL consider it work hours
2. WHEN the current time is outside all configured work time slots, THE System SHALL consider it non-work hours
3. WHEN work time slots are not configured, THE System SHALL default to treating all hours as work hours
4. WHEN the user is in a pomodoro session, THE System SHALL maintain the work/non-work context from when the pomodoro started
5. WHEN the system state is LOCKED, THE System SHALL determine work/non-work context based on current time

### Requirement 4: AI Proactive Life Chore Reminders

**User Story:** As a user, I want the AI to proactively remind me about pending life chores during non-work hours, so that I don't forget important personal tasks.

#### Acceptance Criteria

1. WHEN it is non-work hours AND there are pending LIFE tasks, THE AI_Assistant SHALL generate proactive reminder suggestions
2. WHEN generating life chore reminders, THE AI_Assistant SHALL prioritize tasks by priority (P1 > P2 > P3) and plan date
3. WHEN a life chore reminder is generated, THE Reminder_Service SHALL deliver it through the MCP event system
4. WHEN the user is in a pomodoro session, THE Reminder_Service SHALL NOT interrupt with life chore reminders
5. WHEN the user dismisses a life chore reminder, THE Reminder_Service SHALL NOT repeat the same reminder for at least 2 hours

### Requirement 5: AI Work Task Focus During Work Hours

**User Story:** As a user, I want the AI to focus on work tasks during work hours, so that I can maintain professional productivity.

#### Acceptance Criteria

1. WHEN it is work hours, THE AI_Assistant SHALL prioritize WORK tasks in suggestions
2. WHEN it is work hours AND the user requests task suggestions, THE AI_Assistant SHALL filter out LIFE tasks unless explicitly requested
3. WHEN generating the Top 3 task suggestions during Airlock, THE AI_Assistant SHALL consider both work hours context and task categories
4. WHEN it is work hours AND there are no pending WORK tasks, THE AI_Assistant SHALL inform the user rather than suggesting LIFE tasks
5. WHEN the user explicitly asks about life chores during work hours, THE AI_Assistant SHALL provide the information without restriction

### Requirement 6: MCP Integration for Category-Aware Operations

**User Story:** As an AI agent, I want to access task category information through MCP tools, so that I can provide context-aware assistance.

#### Acceptance Criteria

1. WHEN an AI agent calls the task creation tool, THE MCP_Server SHALL accept a category parameter (WORK or LIFE)
2. WHEN an AI agent calls the task update tool, THE MCP_Server SHALL allow updating the task category
3. WHEN an AI agent queries tasks, THE MCP_Server SHALL include category information in the response
4. WHEN an AI agent queries tasks with a category filter, THE MCP_Server SHALL return only tasks matching the specified category
5. WHEN an AI agent requests context information, THE MCP_Server SHALL include current work/non-work hours status

### Requirement 7: Statistics and Analytics

**User Story:** As a user, I want to see statistics about my work and life task completion, so that I can understand my work-life balance.

#### Acceptance Criteria

1. WHEN a user views the statistics page, THE System SHALL display separate completion rates for WORK and LIFE tasks
2. WHEN a user views the statistics page, THE System SHALL display time spent on WORK vs LIFE tasks
3. WHEN a user views the statistics page, THE System SHALL display the distribution of pomodoros between WORK and LIFE tasks
4. WHEN generating daily reviews, THE System SHALL include category-specific metrics
5. WHEN displaying the productivity heatmap, THE System SHALL allow filtering by task category

### Requirement 8: Reminder Frequency and Timing

**User Story:** As a user, I want to control how often I receive life chore reminders, so that I'm not overwhelmed with notifications.

#### Acceptance Criteria

1. WHEN the user has pending LIFE tasks, THE Reminder_Service SHALL check for reminder opportunities every 30 minutes during non-work hours
2. WHEN a life chore reminder is generated, THE Reminder_Service SHALL respect the user's notification settings
3. WHEN the user is in REST state, THE Reminder_Service SHALL allow life chore reminders
4. WHEN the user is in PLANNING state during non-work hours, THE Reminder_Service SHALL allow life chore reminders
5. WHEN the system state is LOCKED, THE Reminder_Service SHALL NOT generate life chore reminders

### Requirement 9: Default Category Inference

**User Story:** As a user, I want the system to intelligently suggest task categories based on context, so that I don't have to manually categorize every task.

#### Acceptance Criteria

1. WHEN a task is created during work hours, THE Task_Manager SHALL suggest WORK as the default category
2. WHEN a task is created during non-work hours, THE Task_Manager SHALL suggest LIFE as the default category
3. WHEN a task title contains work-related keywords, THE Task_Manager SHALL suggest WORK category
4. WHEN a task title contains life-related keywords, THE Task_Manager SHALL suggest LIFE category
5. WHEN the AI creates a task on behalf of the user, THE AI_Assistant SHALL infer the appropriate category from context

### Requirement 10: Migration and Backward Compatibility

**User Story:** As an existing user, I want my existing tasks to be handled gracefully when the category feature is introduced, so that my workflow is not disrupted.

#### Acceptance Criteria

1. WHEN the category feature is deployed, THE System SHALL assign WORK category to all existing tasks
2. WHEN a user views existing tasks after migration, THE Task_Manager SHALL display the assigned category
3. WHEN the database schema is updated, THE System SHALL maintain all existing task data and relationships
4. WHEN a user updates an existing task, THE Task_Manager SHALL allow changing the category from the default WORK assignment
5. WHEN querying tasks without specifying a category filter, THE System SHALL return all tasks regardless of category for backward compatibility
