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
- [x] Create `src/server/routers/rest-enforcement.ts` with `requestGrace` and `getGraceInfo` procedures — 04f4f3b
- [x] `requestGrace`: protectedProcedure, input `{ pomodoroId: string }`, delegates to `restEnforcementService.requestGrace()` — 04f4f3b
- [x] `getGraceInfo`: protectedProcedure, delegates to `restEnforcementService.getGraceInfo()` — 04f4f3b
- [x] Register router in `src/server/routers/_app.ts` — 04f4f3b
- [x] Export from `src/services/index.ts` if not already — 04f4f3b

---

## Phase 2: Desktop RestEnforcer Module (REQ-2)

### Task 5: Add createRestTimeMonitor() factory to AppMonitor
- [x] Add `createRestTimeMonitor(apps, options?)` in `vibeflow-desktop/electron/modules/app-monitor.ts` — 5702797
- [x] Use 15s check interval, 10s warning delay, context "休息时间", emoji "😴" — 5702797
- [x] Support `hide` action (minimize/hide window) in addition to existing `close`/`force_quit` — 5702797
- [x] Add idle check callback support via `shouldSkipEnforcement` option (reuse existing pattern) — 5702797

### Task 6: Create RestEnforcer module
- [x] Create `vibeflow-desktop/electron/modules/rest-enforcer.ts` — 5702797
- [x] Follow `OverRestEnforcer` pattern: singleton class + `getRestEnforcer()` + `handleRestEnforcementPolicyUpdate()` — 5702797
- [x] `start(config)`: create AppMonitor via `createRestTimeMonitor()`, subscribe to enforcement events, show notification — 5702797
- [x] `stop()`: stop AppMonitor, clear state — 5702797
- [x] `updateConfig(config)`: update AppMonitor config if already running — 5702797
- [x] `getState()`: return `{ isEnforcing, closedAppsCount, lastEnforcementTime, isSystemIdle }` — 5702797
- [x] Show macOS notification on start: "😴 Time to rest! Work apps will be closed." — 5702797
- [x] Skip enforcement when system is idle (reuse `powerMonitor.getSystemIdleTime()` pattern) — 5702797

### Task 7: Add PolicyRestEnforcement type to desktop types
- [x] Add `PolicyRestEnforcement` interface to `vibeflow-desktop/electron/types/index.ts` — 5702797
- [x] Add optional `restEnforcement?: PolicyRestEnforcement` field to `DesktopPolicy` — 5702797
- [x] Add optional `healthLimit?: { type: string; message: string }` field to `DesktopPolicy` — 5702797

### Task 8: Integrate RestEnforcer in main.ts
- [x] Import `getRestEnforcer` and `handleRestEnforcementPolicyUpdate` from rest-enforcer module — 5702797
- [x] In `onPolicyUpdate()` callback, after over-rest handling, add REST enforcement dispatch — 5702797
- [x] Pass `mainWindow` to RestEnforcer via `setMainWindow()` — 5702797
- [x] When `policy.restEnforcement?.isActive` → start/update enforcer — 5702797
- [x] When `!policy.restEnforcement` or `!isActive` → stop enforcer if active — 5702797
- [x] Add health limit notification handling (show once per breach type, reset when cleared) — 5702797

---

## Phase 3: Settings UI (REQ-4)

### Task 9: Create RestEnforcementSettings component
- [x] Create `src/components/settings/rest-enforcement-settings.tsx` — 9f8d930
- [x] Toggle: `restEnforcementEnabled` (Switch component) — 9f8d930
- [x] Action selector: radio/select for `close` vs `hide` (maps to `restEnforcementActions`) — 9f8d930
- [x] Grace settings: `restGraceLimit` (1-5, NumberInput) and `restGraceDuration` (1-10 min, NumberInput) — 9f8d930
- [x] Show current work apps count with "Configure work apps →" link — 9f8d930
- [x] Read settings via `trpc.settings.get`, update via `trpc.settings.update` — 9f8d930
- [x] Disabled state when `restEnforcementEnabled` is off (gray out sub-settings) — 9f8d930

### Task 10: Integrate settings in page
- [x] Add `RestEnforcementSettings` to `src/app/settings/page.tsx` — 9f8d930
- [x] Place near existing over-rest settings section — 9f8d930
- [ ] Verify settings changes trigger policy recompilation (existing settings.update → broadcastStateChange pattern)

---

## Phase 4: OVER_REST Investigation & Fix (REQ-5)

### Task 11: Add diagnostic logging to OVER_REST pipeline
- [x] `overRestService.checkOverRestStatus()`: log all inputs (lastPomodoroEndTime, gracePeriod, now) and outputs — 67f61fa
- [x] `compilePolicy()`: log when over-rest section is included vs omitted, with reason — 67f61fa
- [x] Desktop `main.ts`: log full `policy.overRest` field on every policy update (not just when isOverRest) — 67f61fa
- [x] State machine: log REST → OVER_REST transition with timestamp — 67f61fa

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
