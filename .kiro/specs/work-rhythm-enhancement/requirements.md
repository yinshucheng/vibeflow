# Work Rhythm Enhancement — Requirements

## Overview

Ensure VibeFlow helps users maintain expected work rhythms: pomodoro-rest cycles during work hours, sleep protection at night, and health safeguards against overwork.

## Requirements

### R1: OVER_REST + Work Time Consistency
- R1.1: `scheduleOverRestTimer` must only trigger OVER_REST when within work hours OR user has an active Focus Session
- R1.2: 30s fallback interval must use the same condition (work hours OR focus session)
- R1.3: Exit condition for OVER_REST must also check focus session (not just work hours)

### R2: UI State Display Fix
- R2.1: Desktop tray must show "READY" instead of "PLANNING" for idle state
- R2.2: Desktop tray must show "RESTING" when idle with a recent pomodoro completion (within 30 min)
- R2.3: Web UI must auto-enter resting phase after pomodoro completion
- R2.4: All property tests and unit tests must reflect new state names

### R3: Focus Session as Overtime Mode
- R3.1: FocusSession schema must have `overridesWorkHours` boolean field
- R3.2: StartSession API must accept `overrideWorkHours` parameter
- R3.3: Policy distribution must include `overridesWorkHours` in adhocFocusSession
- R3.4: Web UI must detect non-work hours and show "Start Overtime Session" label

### R4: OVER_WORK Health Reminder Enhancement
- R4.1: Health limit policy must include `repeating` and `intervalMinutes` fields
- R4.2: UserSettings must have `healthNotificationsEnabled` and `overWorkReminderInterval` fields
- R4.3: Desktop must repeat health notifications at configured intervals
- R4.4: Web must show browser notifications when health limit is reached
- R4.5: iOS must trigger local notifications for health limits

### R5: Cross-Client Notification Infrastructure
- R5.1: iOS `notificationTriggerService.initialize()` must be called on app startup
- R5.2: iOS settings screen must show notification permission status
- R5.3: Desktop must use policy message (not hardcoded text) for notifications
