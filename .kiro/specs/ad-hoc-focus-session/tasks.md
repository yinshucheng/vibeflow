# Implementation Plan: Ad-hoc Focus Session & Sleep Time Management

## Overview

本实现计划将功能分为四个主要阶段：
1. 数据库模型和基础服务
2. 临时专注时段功能
3. 睡眠时间管理功能
4. Dashboard 状态显示与预测功能

## Tasks

- [x] 1. Database Schema and Core Types
  - [x] 1.1 Add FocusSession model to Prisma schema
    - Add FocusSession table with id, userId, startTime, plannedEndTime, actualEndTime, duration, status, overridesSleepTime
    - Add indexes for userId, status, and plannedEndTime
    - _Requirements: 1.1, 1.2, 8.1_
  - [x] 1.2 Add SleepExemption model to Prisma schema
    - Add SleepExemption table with id, userId, type, timestamp, duration, focusSessionId
    - Add indexes for userId and timestamp
    - _Requirements: 14.1, 14.2_
  - [x] 1.3 Extend UserSettings model
    - Add sleep time fields: sleepTimeEnabled, sleepTimeStart, sleepTimeEnd, sleepEnforcementApps, sleepSnoozeLimit, sleepSnoozeDuration
    - Add over rest fields: overRestGracePeriod, overRestActions, overRestApps
    - Add early warning fields: earlyWarningEnabled, earlyWarningInterval, earlyWarningThreshold, earlyWarningMethod, earlyWarningQuietStart, earlyWarningQuietEnd
    - _Requirements: 9.1, 9.2, 9.3, 16.2, 16.3, 26.1.1, 26.1.2, 26.1.3, 26.1.4, 26.1.5_
  - [x] 1.4 Extend Task model with estimatedMinutes
    - Add optional estimatedMinutes field to Task
    - _Requirements: 20.1, 20.2_
  - [x] 1.5 Extend DailyState model with adjustedGoal
    - Add optional adjustedGoal field to DailyState
    - _Requirements: 23.1, 23.2, 23.3_
  - [x] 1.6 Run database migration
    - Generate and apply Prisma migration
    - _Requirements: All data model requirements_

- [x] 2. Focus Session Service
  - [x] 2.1 Create focus-session.service.ts with core functions
    - Implement startSession with duration validation (15-240 minutes)
    - Implement endSession to mark session as completed
    - Implement getActiveSession to retrieve current session
    - Implement isInFocusSession check
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 3.2, 3.3_
  - [x] 2.2 Write property test for session lifecycle
    - **Property 1: Focus Session Lifecycle Consistency**
    - **Validates: Requirements 1.1, 1.2, 1.4, 3.2, 3.3**
  - [x] 2.3 Implement session extension
    - Implement extendSession with validation (15-120 minutes)
    - Update plannedEndTime correctly
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [ ]* 2.4 Write property test for single active session
    - **Property 2: Single Active Session Constraint**
    - **Validates: Requirements 1.5**
  - [x] 2.5 Implement session history retrieval
    - Implement getSessionHistory for stats
    - _Requirements: 8.1, 8.2, 8.3_
  - [x] 2.6 Implement expired session checker
    - Implement checkExpiredSessions for auto-ending
    - _Requirements: 3.1_

- [x] 3. Policy Integration for Focus Sessions
  - [x] 3.1 Extend Policy type in octopus.ts
    - Add adhocFocusSession field to Policy interface
    - Add Zod schema for validation
    - _Requirements: 2.3_
  - [x] 3.2 Update policy-distribution.service.ts
    - Modify compilePolicy to include active focus session
    - Ensure enforcement is active during focus session
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [ ]* 3.3 Write property test for policy enforcement
    - **Property 3: Policy Enforcement Consistency**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 6.1, 6.2, 6.3**

- [x] 4. Focus Session tRPC Router
  - [x] 4.1 Create focus-session router
    - Add startSession mutation
    - Add endSession mutation
    - Add extendSession mutation
    - Add getActiveSession query
    - Add getSessionHistory query
    - _Requirements: 1.1, 3.2, 4.1, 5.1, 8.2_

- [x] 5. Focus Session UI Components
  - [x] 5.1 Create FocusSessionControl component
    - Display start button when no active session
    - Display remaining time and end button when active
    - Add preset duration buttons (30min, 1hr, 2hr)
    - Add custom duration input
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 7.1, 7.2, 7.3_
  - [x] 5.2 Integrate FocusSessionControl into Dashboard
    - Add to main dashboard page
    - Update in real-time
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 6. Checkpoint - Focus Session Complete
  - Ensure all focus session tests pass
  - Verify policy distribution includes focus session
  - Ask user if questions arise

- [x] 7. Sleep Time Service
  - [x] 7.1 Create sleep-time.service.ts with core functions
    - Implement getConfig and updateConfig
    - Implement isInSleepTime check
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [x] 7.2 Implement snooze functionality
    - Implement requestSnooze with limit check
    - Implement getRemainingSnoozes
    - _Requirements: 12.1, 12.2, 12.3, 12.4_
  - [x] 7.3 Write property test for snooze limit
    - **Property 5: Sleep Time Snooze Limit**
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.4**
  - [x] 7.4 Implement exemption recording
    - Implement recordExemption
    - Implement getExemptionHistory
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_
  - [ ] 7.5 Write property test for sleep override recording
    - **Property 6: Sleep Override Recording**
    - **Validates: Requirements 13.3, 14.1, 14.2**

- [x] 8. Sleep Time Policy Integration
  - [x] 8.1 Extend Policy type for sleep time
    - Add sleepTime field to Policy interface
    - Add Zod schema for validation
    - _Requirements: 11.1_
  - [x] 8.2 Update policy-distribution.service.ts for sleep time
    - Include sleep time config in compiled policy
    - Handle snooze state in policy
    - _Requirements: 9.4, 11.1, 11.2_

- [x] 9. Focus Session and Sleep Time Interaction
  - [x] 9.1 Update startSession to handle sleep time
    - Check if in sleep time
    - Show confirmation dialog for override
    - Record exemption when overriding
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [x] 10. Sleep Time Settings UI
  - [x] 10.1 Create SleepTimeSettings component
    - Add enable/disable toggle
    - Add start/end time inputs
    - Add enforcement apps list with presets
    - _Requirements: 9.1, 9.2, 10.1, 10.2, 10.3, 10.4_
  - [x] 10.2 Create sleep-time tRPC router
    - Add getConfig query
    - Add updateConfig mutation
    - Add requestSnooze mutation
    - _Requirements: 9.1, 12.1_

- [x] 11. Checkpoint - Sleep Time Complete
  - Ensure all sleep time tests pass
  - Verify policy includes sleep time config
  - Ask user if questions arise

- [x] 12. Progress Calculation Service
  - [x] 12.1 Create progress-calculation.service.ts
    - Implement getCurrentStatus (time context, expected state)
    - Implement getDailyProgress with predictions
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 17.1, 17.2, 17.3, 17.4_
  - [x] 12.2 Implement pressure level calculation
    - Calculate based on remaining vs possible pomodoros
    - Return appropriate level and message
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7_
  - [x] 12.3 Write property test for pressure calculation
    - **Property 7: Pressure Level Calculation Consistency**
    - **Validates: Requirements 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7**
  - [x] 12.4 Implement goal risk suggestions
    - Calculate additional time needed
    - Calculate suggested goal reduction
    - _Requirements: 19.1.1, 19.1.2, 19.1.3, 19.1.4, 19.1.5, 19.1.6, 19.1.7_
  - [x] 12.5 Implement today's goal adjustment
    - Store in DailyState.adjustedGoal
    - Reset next day
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5_
  - [ ]* 12.6 Write property test for goal adjustment isolation
    - **Property 9: Today's Goal Adjustment Isolation**
    - **Validates: Requirements 23.1, 23.2, 23.3, 23.4, 23.5**

- [x] 13. Task Estimation
  - [x] 13.1 Update task.service.ts for estimation
    - Add estimatedMinutes to create/update
    - Calculate pomodoro count from duration setting
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6_
  - [x] 13.2 Update project.service.ts for estimation aggregation
    - Calculate total estimated time from tasks
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5_
  - [ ]* 13.3 Write property test for estimation aggregation
    - **Property 8: Task Estimation Aggregation**
    - **Validates: Requirements 20.1, 20.3, 21.1, 21.2**
  - [x] 13.4 Implement task suggestions
    - Filter tasks by remaining time
    - Sort by priority and plan date
    - _Requirements: 22.1, 22.2, 22.3, 22.4_

- [x] 14. Task and Project UI Updates
  - [x] 14.1 Update TaskForm with estimated time
    - Add estimated time input with presets
    - Display calculated pomodoro count
    - _Requirements: 20.1, 20.2, 20.3_
  - [x] 14.2 Update task list and detail pages
    - Display estimated time
    - Display actual vs estimated
    - _Requirements: 20.4, 20.5_
  - [x] 14.3 Update project detail page
    - Display aggregated estimated time
    - Display progress vs estimate
    - _Requirements: 21.1, 21.2, 21.3, 21.4_

- [x] 15. Checkpoint - Progress and Estimation Complete
  - Ensure all progress calculation tests pass
  - Verify estimation aggregation works correctly
  - Ask user if questions arise

- [x] 16. Efficiency Analysis Service
  - [x] 16.1 Create efficiency-analysis.service.ts
    - Implement getHistoricalAnalysis
    - Calculate average daily pomodoros
    - Calculate goal achievement rate
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5_
  - [x] 16.2 Implement time period analysis
    - Classify pomodoros by morning/afternoon/evening
    - Calculate stats per period
    - Generate insights
    - _Requirements: 24.1.1, 24.1.2, 24.1.3, 24.1.4, 24.1.5_
  - [ ]* 16.3 Write property test for historical analysis
    - **Property 10: Historical Analysis Accuracy**
    - **Validates: Requirements 24.1, 24.1.1, 24.1.2, 24.1.3**
  - [x] 16.4 Implement hourly heatmap
    - Aggregate productivity by hour and day of week
    - _Requirements: 24.1.6_
  - [x] 16.5 Implement smart goal suggestion
    - Calculate 75th percentile of historical performance
    - Check if current goal is realistic
    - _Requirements: 25.1, 25.2, 25.3, 25.4_

- [x] 17. Early Warning System
  - [x] 17.1 Create early-warning.service.ts
    - Implement progress check at intervals
    - Calculate expected vs actual progress
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5_
  - [x] 17.2 Add early warning settings to settings page
    - Enable/disable toggle
    - Interval, threshold, method configuration
    - Quiet hours configuration
    - _Requirements: 26.1.1, 26.1.2, 26.1.3, 26.1.4, 26.1.5, 26.1.6_

- [x] 18. Over Rest Handling
  - [x] 18.1 Implement over rest detection
    - Track rest duration
    - Detect when exceeding configured rest time
    - _Requirements: 15.2, 15.3_
  - [x] 18.2 Add over rest settings to settings page
    - Grace period configuration
    - Actions configuration
    - Apps to close configuration
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

- [x] 19. Dashboard Status Display
  - [x] 19.1 Create DashboardStatus component
    - Display current time context
    - Display expected state
    - Display over rest warning if applicable
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_
  - [x] 19.2 Create DailyProgressCard component
    - Display pomodoro progress bar
    - Display remaining pomodoros
    - Display pressure indicator
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7_
  - [x] 19.3 Create GoalRiskSuggestions component
    - Display when pressure is high/critical
    - Show additional time needed
    - Show goal adjustment option
    - Quick start focus session button
    - _Requirements: 19.1.1, 19.1.2, 19.1.3, 19.1.4, 19.1.5, 19.1.6, 19.1.7_
  - [x] 19.4 Create TaskSuggestions component
    - Display suggested tasks for today
    - Show estimated time and priority
    - _Requirements: 22.1, 22.2, 22.3, 22.4_

- [x] 20. Stats Page Updates
  - [x] 20.1 Add efficiency analysis to stats page
    - Display time period breakdown
    - Display insights
    - _Requirements: 24.1, 24.1.1, 24.1.2, 24.1.3, 24.1.4, 24.1.5_
  - [x] 20.2 Add productivity heatmap
    - Display hourly heatmap
    - _Requirements: 24.1.6_
  - [x] 20.3 Add exemption history
    - Display snooze and focus override events
    - Display weekly summary
    - _Requirements: 14.3, 14.4, 14.5_
  - [x] 20.4 Add ad-hoc focus session stats
    - Display total ad-hoc focus time
    - Display session count
    - _Requirements: 8.2, 8.3_

- [x] 21. Final Checkpoint
  - Ensure all tests pass
  - Verify all features work end-to-end
  - Ask user if questions arise

## Notes

- Tasks marked with `*` are optional property-based tests
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
