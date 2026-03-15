# Desktop REST Enforcement — Design

## Architecture Overview

The REST enforcement follows the same **policy-driven enforcement** pattern used by Sleep Time and OVER_REST:

```
Server (state change) → compilePolicy() → Socket broadcast → Desktop policy handler → Enforcer module → AppMonitor
```

### Data Flow

```
1. Pomodoro completes → state machine: FOCUS → REST
2. broadcastFullState() → triggers policy recompilation
3. compilePolicy() checks:
   - state == REST?
   - restEnforcementEnabled?
   - active grace exemption?
   → If yes to first two and no grace: include restEnforcement in policy
4. Policy broadcast → desktop receives via onPolicyUpdate()
5. main.ts dispatches policy.restEnforcement → RestEnforcer module
6. RestEnforcer creates AppMonitor → closes/hides work apps
7. State leaves REST → policy omits restEnforcement → RestEnforcer stops
```

---

## Type Definitions

### Server-side (`src/types/octopus.ts`)

```typescript
export interface RestEnforcementPolicy {
  /** Whether REST enforcement is currently active */
  isActive: boolean;
  /** Work apps to close/hide during REST */
  workApps: SleepEnforcementAppPolicy[];
  /** Enforcement actions: 'close' | 'hide' */
  actions: string[];
  /** Grace info for client display */
  grace: {
    available: boolean;
    remaining: number;
    durationMinutes: number;
  };
}

// Add to Policy interface:
export interface Policy {
  // ... existing fields
  restEnforcement?: RestEnforcementPolicy;
}
```

### Desktop-side (`vibeflow-desktop/electron/types/index.ts`)

```typescript
export interface PolicyRestEnforcement {
  isActive: boolean;
  workApps: PolicySleepEnforcementApp[];
  actions: string[];
  grace: {
    available: boolean;
    remaining: number;
    durationMinutes: number;
  };
}

// Add to DesktopPolicy:
export interface DesktopPolicy {
  // ... existing fields
  restEnforcement?: PolicyRestEnforcement;
}
```

---

## Server Changes

### `src/services/rest-enforcement.service.ts`

Add `getActiveGrace()` method:

```typescript
async getActiveGrace(userId: string): Promise<RestExemption | null> {
  return prisma.restExemption.findFirst({
    where: {
      userId,
      type: 'grace',
      expiresAt: { gt: new Date() },
    },
    orderBy: { grantedAt: 'desc' },
  });
}
```

Add `getGraceInfo()` for policy compilation:

```typescript
async getGraceInfo(userId: string, pomodoroId?: string): Promise<{
  activeGrace: boolean;
  remaining: number;
  durationMinutes: number;
}> {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const graceLimit = settings?.restGraceLimit ?? 2;
  const graceDuration = settings?.restGraceDuration ?? 2;

  const activeGrace = await this.getActiveGrace(userId);

  // Count grace requests for current cycle
  const graceCount = pomodoroId
    ? await prisma.restExemption.count({
        where: { userId, pomodoroId, type: 'grace' },
      })
    : 0;

  return {
    activeGrace: !!activeGrace,
    remaining: Math.max(0, graceLimit - graceCount),
    durationMinutes: graceDuration,
  };
}
```

### `src/services/policy-distribution.service.ts`

Add REST enforcement section to `compilePolicy()`, after the over-rest section:

```typescript
// Compile REST enforcement configuration
let restEnforcement: RestEnforcementPolicy | undefined;
if (settings.restEnforcementEnabled) {
  const stateResult = await dailyStateService.getCurrentState(userId);
  if (stateResult.success && stateResult.data?.state === 'rest') {
    const latestPomodoro = await prisma.pomodoro.findFirst({
      where: { userId, status: 'completed' },
      orderBy: { completedAt: 'desc' },
    });

    const graceInfo = await restEnforcementService.getGraceInfo(
      userId,
      latestPomodoro?.id
    );

    if (!graceInfo.activeGrace) {
      const workApps = (settings.workApps as unknown as WorkApp[]) || [];
      restEnforcement = {
        isActive: true,
        workApps: workApps.map(app => ({
          bundleId: app.bundleId,
          name: app.name,
        })),
        actions: settings.restEnforcementActions.length > 0
          ? settings.restEnforcementActions
          : ['close'],
        grace: {
          available: graceInfo.remaining > 0,
          remaining: graceInfo.remaining,
          durationMinutes: graceInfo.durationMinutes,
        },
      };
    }
  }
}
```

### Grace Expiry → Policy Rebroadcast

When a grace exemption is requested, schedule a rebroadcast after `graceDuration` minutes:

```typescript
// In rest-enforcement.service.ts requestGrace():
// After creating the exemption:
setTimeout(async () => {
  await socketBroadcastService.broadcastStateChange(userId);
}, graceDuration * 60 * 1000);
```

### tRPC Router (`src/server/routers/rest-enforcement.ts`)

New router (or extend existing) with:
- `restEnforcement.requestGrace` — protected procedure, delegates to service
- `restEnforcement.getGraceInfo` — protected procedure, returns current grace status

---

## Desktop Changes

### `vibeflow-desktop/electron/modules/rest-enforcer.ts` (NEW)

Follows `OverRestEnforcer` pattern exactly:

```typescript
class RestEnforcer {
  private mainWindow: BrowserWindow | null = null;
  private appMonitor: AppMonitor | null = null;
  private isEnforcing: boolean = false;

  start(config: RestEnforcerConfig): void { /* ... */ }
  stop(): void { /* ... */ }
  updateConfig(config: RestEnforcerConfig): void { /* ... */ }
  getState(): RestEnforcerState { /* ... */ }
  isActive(): boolean { /* ... */ }
  setMainWindow(window: BrowserWindow): void { /* ... */ }
}
```

Key differences from `OverRestEnforcer`:
- Uses `createRestTimeMonitor()` factory (new) instead of `createFocusTimeMonitor()`
- Supports `hide` action (minimize window) in addition to `close` (force quit)
- No `bringToFront` behavior (REST is gentler than OVER_REST)
- Shows "time to rest" notification instead of "over rest" warning

### `vibeflow-desktop/electron/modules/app-monitor.ts`

Add new factory:

```typescript
export function createRestTimeMonitor(
  apps: Array<{ bundleId: string; name: string; action?: 'close' | 'hide' }>,
  options?: Partial<AppMonitorOptions>
): AppMonitor {
  return new AppMonitor({
    apps: apps.map(app => ({
      bundleId: app.bundleId,
      name: app.name,
      action: app.action ?? 'close',
      isPreset: false,
    })),
    checkIntervalMs: 15_000,  // Check every 15 seconds (gentler than focus/over-rest)
    warningDelayMs: 10_000,   // 10 second warning before action
    context: '休息时间',
    emoji: '😴',
    ...options,
  });
}
```

### `vibeflow-desktop/electron/main.ts`

Add REST enforcement handling in `onPolicyUpdate()`:

```typescript
import { getRestEnforcer, handleRestEnforcementPolicyUpdate } from './modules/rest-enforcer';

// In onPolicyUpdate callback, after over-rest handling:
// Handle REST enforcement
handleRestEnforcementPolicyUpdate(policy.restEnforcement);
```

---

## Settings UI

### `src/components/settings/rest-enforcement-settings.tsx` (NEW)

A settings section with:
1. **Enable toggle**: `restEnforcementEnabled` boolean
2. **Action selector**: Radio/select for `close` vs `hide`
3. **Grace settings**: Number inputs for `restGraceLimit` (1-5) and `restGraceDuration` (1-10 min)
4. **Work apps link**: "Configure work apps →" link to existing `WorkAppsSettings`

Reads/writes via `trpc.settings.get` / `trpc.settings.update`.

### Page Integration

Add to `src/app/settings/page.tsx` under the appropriate section, near the existing over-rest settings.

---

## OVER_REST Investigation Strategy

### Diagnostic Logging Points

1. **State machine**: Log REST → OVER_REST transition with timestamps
2. **`overRestService.checkOverRestStatus()`**: Log inputs (last pomodoro end time, grace period) and output (isOverRest, shouldTriggerActions, overRestMinutes)
3. **`compilePolicy()`**: Already has logging (line ~270-280) — verify it fires
4. **Socket broadcast**: Log when policy with `overRest` is sent
5. **Desktop `main.ts`**: Log `policy.overRest` field on every policy update

### Suspected Issues
- Grace period calculation may not account for timezone correctly
- `shouldTriggerActions` may have a race condition with policy compilation
- Desktop may miss policy updates if socket reconnects during REST → OVER_REST transition

---

## Health Limit Notifications

### Server

Add `healthLimit` field to `Policy`:

```typescript
export interface Policy {
  // ... existing
  healthLimit?: {
    type: '2hours' | 'daily';
    message: string;
  };
}
```

In `compilePolicy()`:
```typescript
const healthLimitResult = await healthLimitService.checkHealthLimit(userId);
if (healthLimitResult.exceeded) {
  policy.healthLimit = {
    type: healthLimitResult.type!,
    message: healthLimitResult.type === '2hours'
      ? 'You have been working for 2+ hours. Consider a longer break.'
      : 'You have worked over 10 hours today. Please rest.',
  };
}
```

### Desktop

In `main.ts` policy handler, track last notified limit type to avoid repeating:

```typescript
let lastHealthLimitNotified: string | null = null;

// In onPolicyUpdate:
if (policy.healthLimit && policy.healthLimit.type !== lastHealthLimitNotified) {
  getNotificationManager().show({
    title: '⏰ Health Reminder',
    body: policy.healthLimit.message,
    type: 'info',
    urgency: 'normal',
  });
  lastHealthLimitNotified = policy.healthLimit.type;
}
if (!policy.healthLimit) {
  lastHealthLimitNotified = null;
}
```

---

## Key Files Modified

| File | Change Type |
|------|-------------|
| `src/types/octopus.ts` | Add `RestEnforcementPolicy`, `healthLimit` to `Policy` |
| `src/services/rest-enforcement.service.ts` | Add `getActiveGrace()`, `getGraceInfo()`, grace expiry broadcast |
| `src/services/policy-distribution.service.ts` | Add REST enforcement + health limit to `compilePolicy()` |
| `src/server/routers/rest-enforcement.ts` | New router for grace requests |
| `src/server/routers/_app.ts` | Register new router |
| `vibeflow-desktop/electron/types/index.ts` | Add `PolicyRestEnforcement`, `healthLimit` to `DesktopPolicy` |
| `vibeflow-desktop/electron/modules/rest-enforcer.ts` | **NEW** — RestEnforcer module |
| `vibeflow-desktop/electron/modules/app-monitor.ts` | Add `createRestTimeMonitor()` |
| `vibeflow-desktop/electron/main.ts` | Dispatch REST enforcement + health limit notifications |
| `src/components/settings/rest-enforcement-settings.tsx` | **NEW** — Settings UI |
| `src/app/settings/page.tsx` | Integrate REST enforcement settings |

## Non-Goals

- No iOS/Extension enforcement of REST (desktop only for now)
- No work app auto-detection (manual configuration only)
- No complex scheduling of REST enforcement (just on/off per policy)
- Health notifications are informational only — no blocking or forced breaks
