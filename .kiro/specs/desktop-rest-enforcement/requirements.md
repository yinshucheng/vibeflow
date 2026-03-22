# Desktop REST Enforcement — Requirements

## Context

After completing a Pomodoro (FOCUS → REST), the desktop client has **zero enforcement** — the user can continue working uninterrupted, defeating the purpose of forced rest. The infrastructure already exists (Prisma schema fields, `RestEnforcementService`, `WorkAppsSettings` UI, `AppMonitor` module) but is not wired together.

This spec covers three capabilities:
1. REST state work app blocking (core)
2. OVER_REST enforcement bug investigation/fix
3. Health limit awareness notifications (informational, no blocking)

---

## REQ-1: REST State Policy Distribution

**Description**: When a user enters REST state, the server must include `restEnforcement` configuration in the policy sent to desktop clients.

### Acceptance Criteria
- [ ] AC-1.1: `Policy` type includes optional `restEnforcement` field with work apps, enforcement actions, and grace status
- [ ] AC-1.2: `compilePolicy()` populates `restEnforcement` when: state is REST, `restEnforcementEnabled` is true, and no active grace exemption exists
- [ ] AC-1.3: `restEnforcement` is omitted from policy when: not in REST state, enforcement is disabled, or an active grace exemption exists
- [ ] AC-1.4: Policy is re-compiled and broadcast when grace exemption is granted or expires

---

## REQ-2: Desktop RestEnforcer Module

**Description**: A new desktop module that receives REST enforcement policy and closes/hides work apps using the existing `AppMonitor` infrastructure.

### Acceptance Criteria
- [ ] AC-2.1: `RestEnforcer` module follows the same singleton + factory pattern as `OverRestEnforcer`
- [ ] AC-2.2: Uses `AppMonitor` with `createRestTimeMonitor()` factory to close/hide work apps
- [ ] AC-2.3: Supports enforcement actions: `close` (graceful quit) and `hide` (minimize/hide)
- [ ] AC-2.4: Shows macOS notification when REST enforcement starts ("Time to rest! Work apps will be closed.")
- [ ] AC-2.5: Skips enforcement when system is idle (same idle detection as `OverRestEnforcer`)
- [ ] AC-2.6: Stops enforcement when state leaves REST (policy no longer includes `restEnforcement`)

---

## REQ-3: Grace Mechanism

**Description**: Users can request temporary grace periods to briefly delay REST enforcement (e.g., save work, push code).

### Acceptance Criteria
- [ ] AC-3.1: Grace requests are sent via tRPC, creating `RestExemption` records with type `'grace'`
- [ ] AC-3.2: Each grace period lasts `restGraceDuration` minutes (default: 2, configurable)
- [ ] AC-3.3: Maximum `restGraceLimit` grace requests per REST cycle (default: 2, configurable)
- [ ] AC-3.4: Active grace causes `restEnforcement` to be omitted from next policy compilation
- [ ] AC-3.5: When grace expires, policy is re-compiled and enforcement resumes automatically
- [ ] AC-3.6: Desktop shows notification with remaining grace count when grace is granted

---

## REQ-4: REST Enforcement Settings UI

**Description**: Settings page allows users to configure REST enforcement behavior.

### Acceptance Criteria
- [ ] AC-4.1: Toggle for `restEnforcementEnabled` (default: off)
- [ ] AC-4.2: Enforcement action selector: `close` (force quit) or `hide` (minimize) work apps
- [ ] AC-4.3: Grace configuration: max grace count and grace duration (minutes)
- [ ] AC-4.4: Links to existing `WorkAppsSettings` for managing the work app list
- [ ] AC-4.5: Settings are persisted via existing `settings.update` tRPC mutation

---

## REQ-5: OVER_REST Bug Investigation & Fix

**Description**: The existing OVER_REST enforcement sometimes fails to trigger. Investigate and fix.

### Acceptance Criteria
- [ ] AC-5.1: Add diagnostic logging to trace the full pipeline: state machine transition → `overRestService.checkOverRestStatus()` → `compilePolicy()` → Socket broadcast → desktop receipt → `OverRestEnforcer.start()`
- [ ] AC-5.2: Verify REST → OVER_REST transition timing matches configured grace period
- [ ] AC-5.3: Verify desktop receives and acts on over-rest policy updates
- [ ] AC-5.4: Document root cause and fix in commit message

---

## REQ-6: Health Limit Notifications

**Description**: When users approach or exceed health limits (2-hour continuous work or daily total), show awareness notifications. No blocking — informational only.

### Acceptance Criteria
- [ ] AC-6.1: `compilePolicy()` includes `healthLimit` field when a health limit is exceeded
- [ ] AC-6.2: Desktop shows notification when health limit is first exceeded ("You've been working for 2+ hours. Consider taking a longer break.")
- [ ] AC-6.3: Notification is shown once per limit breach (not repeated on every policy update)
- [ ] AC-6.4: Daily limit notification: "You've worked over 10 hours today. Please rest."
