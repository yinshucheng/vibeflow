# Desktop REST Enforcement — Tasks

## Phase 1: Types & Server Policy (REQ-1)

### Task 1: Add RestEnforcementPolicy type to octopus.ts
- [x] Add `RestEnforcementPolicy` interface to `src/types/octopus.ts` (after `OverRestPolicy`) — 746daef
- [x] Add optional `restEnforcement?: RestEnforcementPolicy` field to `Policy` interface — 746daef
- [x] Add `healthLimit?: { type: '2hours' | 'daily'; message: string }` field to `Policy` interface — 746daef
- [x] Update `PolicySchema` Zod validation to include new fields — 746daef

### Task 2: Add getActiveGrace() and getGraceInfo() to RestEnforcementService
- [x] Add `getActiveGrace(userId)` — queries unexpired grace exemptions from `RestExemption` — 63c0d4e
- [x] Add `getGraceInfo(userId, pomodoroId?)` — returns `{ activeGrace, remaining, durationMinutes }` — 63c0d4e
- [x] Add grace expiry rebroadcast: after creating exemption, schedule `broadcastStateChange` after `graceDuration` minutes — 63c0d4e
- [x] Unit test: `getActiveGrace` returns null when no active grace, returns exemption when active — 63c0d4e
- [x] Unit test: `getGraceInfo` correctly counts remaining grace requests — 63c0d4e

### Task 3: Add REST enforcement to compilePolicy()
- [x] Import `restEnforcementService` and `dailyStateService` in policy-distribution.service.ts — 70e5d57
- [x] After over-rest section, add REST enforcement compilation block — 70e5d57
- [x] Check: state is REST, `restEnforcementEnabled` is true, no active grace → include `restEnforcement` — 70e5d57
- [x] Compile `workApps` from settings, `actions` from `restEnforcementActions`, grace info from service — 70e5d57
- [x] Add health limit check: call `healthLimitService.checkHealthLimit()` → include `healthLimit` in policy — 70e5d57
- [x] Unit test: policy includes `restEnforcement` when state=REST and enabled — 70e5d57
- [x] Unit test: policy omits `restEnforcement` when grace is active — 70e5d57
- [x] Unit test: policy omits `restEnforcement` when state is not REST — 70e5d57

### Task 4: Create rest-enforcement tRPC router
- [ ] Create `src/server/routers/rest-enforcement.ts` with `requestGrace` and `getGraceInfo` procedures
- [ ] `requestGrace`: protectedProcedure, input `{ pomodoroId: string }`, delegates to `restEnforcementService.requestGrace()`
- [ ] `getGraceInfo`: protectedProcedure, delegates to `restEnforcementService.getGraceInfo()`
- [ ] Register router in `src/server/routers/_app.ts`
- [ ] Export from `src/services/index.ts` if not already

---

## Phase 2: Desktop RestEnforcer Module (REQ-2)

### Task 5: Add createRestTimeMonitor() factory to AppMonitor
- [ ] Add `createRestTimeMonitor(apps, options?)` in `vibeflow-desktop/electron/modules/app-monitor.ts`
- [ ] Use 15s check interval, 10s warning delay, context "休息时间", emoji "😴"
- [ ] Support `hide` action (minimize/hide window) in addition to existing `close`/`force_quit`
- [ ] Add idle check callback support via `shouldSkipEnforcement` option (reuse existing pattern)

### Task 6: Create RestEnforcer module
- [ ] Create `vibeflow-desktop/electron/modules/rest-enforcer.ts`
- [ ] Follow `OverRestEnforcer` pattern: singleton class + `getRestEnforcer()` + `handleRestEnforcementPolicyUpdate()`
- [ ] `start(config)`: create AppMonitor via `createRestTimeMonitor()`, subscribe to enforcement events, show notification
- [ ] `stop()`: stop AppMonitor, clear state
- [ ] `updateConfig(config)`: update AppMonitor config if already running
- [ ] `getState()`: return `{ isEnforcing, closedAppsCount, lastEnforcementTime, isSystemIdle }`
- [ ] Show macOS notification on start: "😴 Time to rest! Work apps will be closed."
- [ ] Skip enforcement when system is idle (reuse `powerMonitor.getSystemIdleTime()` pattern)

### Task 7: Add PolicyRestEnforcement type to desktop types
- [ ] Add `PolicyRestEnforcement` interface to `vibeflow-desktop/electron/types/index.ts`
- [ ] Add optional `restEnforcement?: PolicyRestEnforcement` field to `DesktopPolicy`
- [ ] Add optional `healthLimit?: { type: string; message: string }` field to `DesktopPolicy`

### Task 8: Integrate RestEnforcer in main.ts
- [ ] Import `getRestEnforcer` and `handleRestEnforcementPolicyUpdate` from rest-enforcer module
- [ ] In `onPolicyUpdate()` callback, after over-rest handling, add REST enforcement dispatch
- [ ] Pass `mainWindow` to RestEnforcer via `setMainWindow()`
- [ ] When `policy.restEnforcement?.isActive` → start/update enforcer
- [ ] When `!policy.restEnforcement` or `!isActive` → stop enforcer if active
- [ ] Add health limit notification handling (show once per breach type, reset when cleared)

---

## Phase 3: Settings UI (REQ-4)

### Task 9: Create RestEnforcementSettings component
- [ ] Create `src/components/settings/rest-enforcement-settings.tsx`
- [ ] Toggle: `restEnforcementEnabled` (Switch component)
- [ ] Action selector: radio/select for `close` vs `hide` (maps to `restEnforcementActions`)
- [ ] Grace settings: `restGraceLimit` (1-5, NumberInput) and `restGraceDuration` (1-10 min, NumberInput)
- [ ] Show current work apps count with "Configure work apps →" link
- [ ] Read settings via `trpc.settings.get`, update via `trpc.settings.update`
- [ ] Disabled state when `restEnforcementEnabled` is off (gray out sub-settings)

### Task 10: Integrate settings in page
- [ ] Add `RestEnforcementSettings` to `src/app/settings/page.tsx`
- [ ] Place near existing over-rest settings section
- [ ] Verify settings changes trigger policy recompilation (existing settings.update → broadcastStateChange pattern)

---

## Phase 4: OVER_REST Investigation & Fix (REQ-5)

### Task 11: Add diagnostic logging to OVER_REST pipeline
- [ ] `overRestService.checkOverRestStatus()`: log all inputs (lastPomodoroEndTime, gracePeriod, now) and outputs
- [ ] `compilePolicy()`: log when over-rest section is included vs omitted, with reason
- [ ] Desktop `main.ts`: log full `policy.overRest` field on every policy update (not just when isOverRest)
- [ ] State machine: log REST → OVER_REST transition with timestamp

### Task 12: Verify OVER_REST end-to-end flow
- [ ] Start pomodoro → complete → verify REST state
- [ ] Wait for grace period to expire → verify OVER_REST transition
- [ ] Verify desktop receives policy with `overRest.isOverRest = true`
- [ ] Verify `OverRestEnforcer.start()` is called with correct apps
- [ ] Document any issues found

### Task 13: Fix identified OVER_REST bugs
- [ ] Fix root cause(s) identified in Task 12
- [ ] Verify fix with end-to-end test
- [ ] Document root cause in commit message

---

## Phase 5: Health Limit Notifications (REQ-6)

### Task 14: Add healthLimit to policy compilation
- [ ] Call `healthLimitService.checkHealthLimit(userId)` in `compilePolicy()`
- [ ] When exceeded, include `healthLimit: { type, message }` in policy
- [ ] Messages: "2hours" → "You've been working for 2+ hours continuously. Consider a longer break."
- [ ] Messages: "daily" → "You've worked over 10 hours today. Please take care of yourself."

### Task 15: Desktop health limit notifications
- [ ] In `main.ts` policy handler, track `lastHealthLimitNotified` type
- [ ] Show notification only when limit type changes (avoid repeat notifications)
- [ ] Reset tracking when `healthLimit` is absent from policy
- [ ] Use `type: 'info'`, `urgency: 'normal'` (informational, not critical)

---

## Phase 6: Testing & Validation (All REQs)

### Task 16: Property tests for REST enforcement policy
- [ ] Property test: `compilePolicy` always includes `restEnforcement` when state=REST + enabled + no grace
- [ ] Property test: `compilePolicy` never includes `restEnforcement` when state != REST
- [ ] Property test: grace count never exceeds `restGraceLimit`
- [ ] Property test: `getActiveGrace` returns null after exemption expires

### Task 17: Integration verification
- [ ] Full flow: enable REST enforcement → start pomodoro → complete → verify work apps blocked
- [ ] Grace flow: request grace during REST → verify enforcement pauses → grace expires → enforcement resumes
- [ ] Settings flow: toggle enforcement on/off → verify policy changes immediately
- [ ] Health limit: work 2+ hours → verify notification shown once
- [ ] OVER_REST: exceed rest time → verify enforcement starts
- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
