# Work Rhythm Enhancement — Design

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| XState guard work hours check | No (caller checks) | Keep guards pure, no async dependencies |
| Focus Session new field vs reuse | New `overridesWorkHours` | Semantic clarity, independent controls |
| OVER_WORK implementation | Reminder (not new state) | Lightweight first, upgradeable later |
| Notification config granularity | Global toggle + interval | Avoid over-configuration |
| Tray state naming | READY/RESTING/FOCUS/OVER_REST | Context-aware, no legacy labels |

## Architecture Changes

### Phase 1: OVER_REST Consistency
- `state-engine.service.ts`: Import `isWithinWorkHours` and `focusSessionService`; check both before scheduling OVER_REST timer
- `socket.ts`: 30s fallback adds focus session check to entry and exit conditions
- Pattern reused from `over-rest.service.ts:240`

### Phase 2: UI State Display
- `tray-integration.service.ts`: `TrayMenuState.systemState` type changed to `'READY' | 'RESTING' | 'FOCUS' | 'OVER_REST'`
- `mapSystemStateToTrayState` now accepts optional `lastPomodoroEndTime` parameter
- Desktop `tray-manager.ts`: All switch cases updated from 5-state to 4-state model
- Web `use-pomodoro-machine.ts`: Auto-enters `resting` phase when idle with recent `lastPomodoroEndTime`

### Phase 3: Overtime Mode
- Prisma: `FocusSession.overridesWorkHours Boolean @default(false)`
- `StartSessionSchema` extended with `overrideWorkHours` optional boolean
- Policy `AdhocFocusSession` type and Zod schema include `overridesWorkHours`
- Web `focus-session-control.tsx` detects non-work hours via settings query, shows orange "Start Overtime Session"

### Phase 4: Health Reminders
- `octopus.ts`: `HealthLimit` type adds `repeating?: boolean`, `intervalMinutes?: number`
- Prisma: `UserSettings.healthNotificationsEnabled`, `overWorkReminderInterval`
- Policy distribution reads user preferences, sets repeating fields
- Desktop: `setInterval` for repeat notifications, cleared when health limit clears
- Web: `tray-sync-provider.tsx` polls `healthLimit.checkLimit` via tRPC, shows browser notifications
- iOS: `notification-trigger.service.ts` monitors store policy for health limits

### Phase 5: Cross-Client Notifications
- iOS `AppProvider.tsx`: calls `notificationTriggerService.initialize()` on auth, cleanup on unmount
- iOS `SettingsScreen.tsx`: notification permission status row + system settings link
- Desktop already uses policy message field (updated in Phase 4)
