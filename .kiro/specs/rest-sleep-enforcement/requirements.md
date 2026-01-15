# REST & SLEEP State Work App Blocking - Requirements

## Overview

Enhance REST and SLEEP states with configurable work app blocking to help users maintain healthy work-rest boundaries and prevent overwork.

## Core Requirements

### 1. Work Apps Management

- **Independent Work Apps List**: Users can configure which apps are considered "work apps"
- **Shared List**: Same work apps list applies to both REST and SLEEP states
- **Preset Apps**: Quick-add common work apps (VS Code, Slack, Terminal, Zoom, etc.)
- **Custom Apps**: Support manual bundle ID entry for custom apps
- **Running App Detection**: Detect and display currently running apps for easy addition

### 2. REST State Enforcement

**User Options When Entering REST:**
- **Grace**: Delay work app blocking with configurable limits
- **Skip Rest**: Start next pomodoro immediately (subject to health limits)

**Grace Mechanism:**
- Configurable grace limit per REST cycle (e.g., 2 times)
- Configurable grace duration per use (e.g., 2 minutes)
- Similar to Sleep Snooze pattern

**Configurable Actions:**
- Force quit apps
- Hide window only
- Show notification
- Actions can differ from SLEEP state

**Enable/Disable:**
- Toggle to enable/disable REST enforcement
- Settings locked during work hours

### 3. SLEEP State Enforcement

**Existing Snooze Mechanism:**
- Continue using current Sleep Snooze (limit + duration)

**Work App Blocking:**
- Execute work app blocking during sleep window
- Configurable actions (can differ from REST state)

### 4. Health Limits

**Short-term Limit:**
- 2 hours rolling window: max 110 minutes of pomodoro time
- Configurable threshold

**Daily Limit:**
- Per day: max 600 minutes (10 hours) of pomodoro time
- Configurable threshold

**Enforcement:**
- When user tries to skip rest and exceeds health limit
- Requires skip token to proceed

### 5. Skip Token System

**Weekly Quota:**
- Configurable weekly limit (default: 5 tokens)
- Resets every Monday 00:00

**Consumption:**
- 1 token per "over-limit" pomodoro started
- Applies to both 2-hour and daily limits

**Purpose:**
- Provide flexibility to prevent users from closing the app
- Balance between enforcement and user autonomy

## User Stories

### US-1: Configure Work Apps
As a user, I want to configure which apps are work-related, so the system knows what to block during rest/sleep.

**Acceptance Criteria:**
- Can add preset work apps with one click
- Can add custom apps by bundle ID
- Can see currently running apps and add them
- Can remove apps from the list
- Changes saved to database

### US-2: REST State Grace
As a user, I want to delay work app blocking during REST, so I can finish urgent tasks.

**Acceptance Criteria:**
- Can click "Grace" button during REST
- System shows remaining grace count
- Each grace delays blocking by configured duration
- Cannot exceed grace limit per REST cycle
- Grace usage tracked in database

### US-3: Skip Rest with Health Limits
As a user, I want to skip rest and start next pomodoro, but be protected from overwork.

**Acceptance Criteria:**
- Can click "Skip Rest" button during REST
- If under health limits: directly enter PLANNING state
- If over health limits: prompted to use skip token
- Shows remaining skip tokens
- Cannot skip if no tokens remaining

### US-4: SLEEP State Work App Blocking
As a user, I want work apps blocked during sleep time, so I can rest properly.

**Acceptance Criteria:**
- Work apps blocked when entering sleep window
- Can use existing snooze mechanism
- Configurable blocking actions
- Snooze limit enforced

### US-5: Weekly Skip Token Reset
As a user, I want skip tokens to reset weekly, so I have a fresh start each week.

**Acceptance Criteria:**
- Tokens reset every Monday 00:00
- Reset happens automatically
- User sees next reset time in settings

## Non-Functional Requirements

### Performance
- App blocking actions execute within 2 seconds
- Health limit checks complete within 500ms

### Reliability
- Skip token reset must be reliable (cron job or scheduled task)
- Grace/skip tracking must be persistent across app restarts

### Security
- Settings locked during work hours (existing mechanism)
- Cannot bypass health limits without skip tokens

### Usability
- Clear UI feedback for grace/skip actions
- Show remaining counts/tokens prominently
- Preset apps for common work tools

## Out of Scope

- Cross-device skip token sync (future enhancement)
- Custom health limit formulas (fixed 2-hour/daily for now)
- App usage analytics (future enhancement)
- Automatic work app detection based on usage patterns
