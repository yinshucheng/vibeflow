# REST & SLEEP State Work App Blocking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement configurable work app blocking during REST and SLEEP states with health limits and skip token system.

**Architecture:** Extends existing state machine and enforcement mechanisms. Adds HealthLimitService and RestEnforcementService following DDD service layer pattern. Uses shared work apps list with configurable actions per state. Skip tokens provide weekly override capability.

**Tech Stack:** Prisma 6.2, TypeScript 5.7, tRPC 11, XState 5.19, Vitest, Playwright

---

## Phase 1: Data Layer

### Task 1.1: Extend Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma:55-152` (UserSettings model)

**Step 1: Add work apps and REST enforcement fields to UserSettings**

Add these fields after line 152 in the UserSettings model:

```prisma
  // Work Apps Configuration (shared list) - REST & SLEEP enforcement
  workApps                Json?              @default("[]") // [{bundleId: string, name: string}]

  // REST State Enforcement
  restEnforcementEnabled  Boolean            @default(false)
  restEnforcementActions  String[]           @default([])  // ["force_quit", "hide_window", "show_notification"]
  restGraceLimit          Int                @default(2)   // Grace times per REST cycle
  restGraceDuration       Int                @default(2)   // Minutes per grace

  // SLEEP State Enforcement (extends existing)
  sleepEnforcementActions String[]           @default(["force_quit"])  // Actions for SLEEP state

  // Health Limits Configuration
  healthLimit2Hours       Int                @default(110) // 2-hour pomodoro time limit (minutes)
  healthLimitDaily        Int                @default(600) // Daily pomodoro time limit (minutes, 10 hours)

  // Skip Token Configuration
  skipTokenWeeklyLimit    Int                @default(5)   // Weekly skip token quota
  skipTokenUsed           Int                @default(0)   // Tokens used this week
  skipTokenResetAt        DateTime?                        // Next reset time (Monday 00:00)
```

**Step 2: Create RestExemption model**

Add this model after the SleepExemption model (search for "model SleepExemption"):

```prisma
model RestExemption {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  pomodoroId    String?  // Associated pomodoro ID
  pomodoro      Pomodoro? @relation(fields: [pomodoroId], references: [id])
  type          String   // "grace" or "skip"
  grantedAt     DateTime @default(now())
  expiresAt     DateTime?

  @@index([userId, grantedAt])
}
```

**Step 3: Add RestExemption relation to User model**

Find the User model (around line 12) and add this relation after `sleepExemptions`:

```prisma
  restExemptions           RestExemption[]
```

**Step 4: Add RestExemption relation to Pomodoro model**

Find the Pomodoro model (around line 251) and add this relation after `timeSlices`:

```prisma
  restExemptions RestExemption[]
```

**Step 5: Generate Prisma client**

Run: `npm run db:generate`
Expected: Prisma client generated successfully

**Step 6: Create migration**

Run: `npx prisma migrate dev --name add_rest_enforcement_and_health_limits`
Expected: Migration created and applied successfully

**Step 7: Commit**

```bash
git add prisma/schema.prisma
git commit -m "$(cat <<'EOF'
feat(schema): add REST enforcement and health limits

Add UserSettings fields for work apps, REST enforcement, health limits, and skip tokens.
Create RestExemption model to track grace and skip rest usage.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2: Service Layer - HealthLimitService

### Task 2.1: Create HealthLimitService

**Files:**
- Create: `src/services/health-limit.service.ts`
- Create: `tests/services/health-limit.service.test.ts`

**Step 1: Write failing test for check2HourLimit**

Create `tests/services/health-limit.service.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { healthLimitService } from '@/services/health-limit.service';
import prisma from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  default: {
    pomodoro: {
      findMany: vi.fn(),
    },
    userSettings: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

describe('HealthLimitService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('check2HourLimit', () => {
    it('should return false when under 2-hour limit', async () => {
      const userId = 'user-1';
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

      vi.mocked(prisma.pomodoro.findMany).mockResolvedValue([
        { duration: 25, status: 'COMPLETED', completedAt: new Date() } as any,
        { duration: 25, status: 'COMPLETED', completedAt: new Date() } as any,
      ]);

      vi.mocked(prisma.userSettings.findUnique).mockResolvedValue({
        healthLimit2Hours: 110,
      } as any);

      const result = await healthLimitService.check2HourLimit(userId);
      expect(result).toBe(false);
    });

    it('should return true when exceeding 2-hour limit', async () => {
      const userId = 'user-1';

      vi.mocked(prisma.pomodoro.findMany).mockResolvedValue([
        { duration: 25, status: 'COMPLETED' } as any,
        { duration: 25, status: 'COMPLETED' } as any,
        { duration: 25, status: 'COMPLETED' } as any,
        { duration: 25, status: 'COMPLETED' } as any,
        { duration: 15, status: 'COMPLETED' } as any,
      ]);

      vi.mocked(prisma.userSettings.findUnique).mockResolvedValue({
        healthLimit2Hours: 110,
      } as any);

      const result = await healthLimitService.check2HourLimit(userId);
      expect(result).toBe(true);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/services/health-limit.service.test.ts`
Expected: FAIL with "healthLimitService is not defined"

**Step 3: Implement HealthLimitService**

Create `src/services/health-limit.service.ts`:

```typescript
import prisma from '@/lib/prisma';

export interface HealthLimitCheckResult {
  exceeded: boolean;
  type: '2hours' | 'daily' | null;
}

export interface SkipTokenStatus {
  available: boolean;
  remaining: number;
}

export interface SkipTokenConsumeResult {
  success: boolean;
  remaining: number;
}

class HealthLimitService {
  async check2HourLimit(userId: string): Promise<boolean> {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const pomodoros = await prisma.pomodoro.findMany({
      where: {
        userId,
        completedAt: { gte: twoHoursAgo },
        status: 'COMPLETED',
      },
    });

    const totalMinutes = pomodoros.reduce((sum, p) => sum + p.duration, 0);

    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    const limit = settings?.healthLimit2Hours ?? 110;
    return totalMinutes >= limit;
  }

  async checkDailyLimit(userId: string): Promise<boolean> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const pomodoros = await prisma.pomodoro.findMany({
      where: {
        userId,
        completedAt: { gte: startOfDay },
        status: 'COMPLETED',
      },
    });

    const totalMinutes = pomodoros.reduce((sum, p) => sum + p.duration, 0);

    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    const limit = settings?.healthLimitDaily ?? 600;
    return totalMinutes >= limit;
  }

  async checkHealthLimit(userId: string): Promise<HealthLimitCheckResult> {
    const twoHourExceeded = await this.check2HourLimit(userId);
    if (twoHourExceeded) {
      return { exceeded: true, type: '2hours' };
    }

    const dailyExceeded = await this.checkDailyLimit(userId);
    if (dailyExceeded) {
      return { exceeded: true, type: 'daily' };
    }

    return { exceeded: false, type: null };
  }

  async canUseSkipToken(userId: string): Promise<SkipTokenStatus> {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      return { available: false, remaining: 0 };
    }

    const remaining = settings.skipTokenWeeklyLimit - settings.skipTokenUsed;
    return {
      available: remaining > 0,
      remaining,
    };
  }

  async consumeSkipToken(userId: string): Promise<SkipTokenConsumeResult> {
    const status = await this.canUseSkipToken(userId);
    if (!status.available) {
      return { success: false, remaining: 0 };
    }

    const settings = await prisma.userSettings.update({
      where: { userId },
      data: {
        skipTokenUsed: { increment: 1 },
      },
    });

    const remaining = settings.skipTokenWeeklyLimit - settings.skipTokenUsed;
    return { success: true, remaining };
  }

  async resetWeeklyTokens(userId: string): Promise<void> {
    const nextMonday = this.getNextMonday(new Date());

    await prisma.userSettings.update({
      where: { userId },
      data: {
        skipTokenUsed: 0,
        skipTokenResetAt: nextMonday,
      },
    });
  }

  private getNextMonday(date: Date): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + ((1 + 7 - result.getDay()) % 7 || 7));
    result.setHours(0, 0, 0, 0);
    return result;
  }
}

export const healthLimitService = new HealthLimitService();
```

**Step 4: Run test to verify it passes**

Run: `npm test tests/services/health-limit.service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/health-limit.service.ts tests/services/health-limit.service.test.ts
git commit -m "$(cat <<'EOF'
feat(service): add HealthLimitService for pomodoro time limits

Implement 2-hour and daily pomodoro time limit checks.
Add skip token management with weekly reset capability.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3: Service Layer - RestEnforcementService

### Task 3.1: Create RestEnforcementService

**Files:**
- Create: `src/services/rest-enforcement.service.ts`
- Create: `tests/services/rest-enforcement.service.test.ts`

**Step 1: Write failing test for requestGrace**

Create `tests/services/rest-enforcement.service.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { restEnforcementService } from '@/services/rest-enforcement.service';
import prisma from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  default: {
    userSettings: {
      findUnique: vi.fn(),
    },
    restExemption: {
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}));

describe('RestEnforcementService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requestGrace', () => {
    it('should grant grace when under limit', async () => {
      const userId = 'user-1';
      const pomodoroId = 'pomo-1';

      vi.mocked(prisma.userSettings.findUnique).mockResolvedValue({
        restGraceLimit: 2,
      } as any);

      vi.mocked(prisma.restExemption.count).mockResolvedValue(0);
      vi.mocked(prisma.restExemption.create).mockResolvedValue({} as any);

      const result = await restEnforcementService.requestGrace(userId, pomodoroId);
      expect(result.granted).toBe(true);
      expect(result.remaining).toBe(1);
    });

    it('should deny grace when limit reached', async () => {
      const userId = 'user-1';
      const pomodoroId = 'pomo-1';

      vi.mocked(prisma.userSettings.findUnique).mockResolvedValue({
        restGraceLimit: 2,
      } as any);

      vi.mocked(prisma.restExemption.count).mockResolvedValue(2);

      const result = await restEnforcementService.requestGrace(userId, pomodoroId);
      expect(result.granted).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/services/rest-enforcement.service.test.ts`
Expected: FAIL with "restEnforcementService is not defined"

**Step 3: Implement RestEnforcementService**

Create `src/services/rest-enforcement.service.ts`:

```typescript
import prisma from '@/lib/prisma';
import { healthLimitService } from './health-limit.service';

export interface GraceRequestResult {
  granted: boolean;
  remaining: number;
}

export interface SkipRestRequestResult {
  allowed: boolean;
  reason?: string;
  tokenRemaining?: number;
}

class RestEnforcementService {
  async shouldEnforceRest(userId: string, pomodoroId: string): Promise<boolean> {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    return settings?.restEnforcementEnabled ?? false;
  }

  async requestGrace(userId: string, pomodoroId: string): Promise<GraceRequestResult> {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      return { granted: false, remaining: 0 };
    }

    const graceCount = await prisma.restExemption.count({
      where: {
        userId,
        pomodoroId,
        type: 'grace',
      },
    });

    if (graceCount >= settings.restGraceLimit) {
      return { granted: false, remaining: 0 };
    }

    const expiresAt = new Date(Date.now() + settings.restGraceDuration * 60 * 1000);

    await prisma.restExemption.create({
      data: {
        userId,
        pomodoroId,
        type: 'grace',
        expiresAt,
      },
    });

    return {
      granted: true,
      remaining: settings.restGraceLimit - graceCount - 1,
    };
  }

  async requestSkipRest(userId: string): Promise<SkipRestRequestResult> {
    const healthLimit = await healthLimitService.checkHealthLimit(userId);

    if (!healthLimit.exceeded) {
      await prisma.restExemption.create({
        data: {
          userId,
          type: 'skip',
        },
      });

      return { allowed: true };
    }

    const tokenStatus = await healthLimitService.canUseSkipToken(userId);

    if (!tokenStatus.available) {
      return {
        allowed: false,
        reason: `Health limit reached (${healthLimit.type}), no skip tokens remaining`,
        tokenRemaining: 0,
      };
    }

    return {
      allowed: true,
      tokenRemaining: tokenStatus.remaining,
    };
  }

  async enforceWorkAppBlock(userId: string, actions: string[]): Promise<void> {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { workApps: true },
    });

    if (!settings?.workApps) {
      return;
    }

    const workApps = settings.workApps as Array<{ bundleId: string; name: string }>;
    const bundleIds = workApps.map((app) => app.bundleId);

    // Execute actions (will be implemented in desktop integration phase)
    // For now, this is a placeholder
    console.log('Enforcing work app block:', { actions, bundleIds });
  }
}

export const restEnforcementService = new RestEnforcementService();
```

**Step 4: Run test to verify it passes**

Run: `npm test tests/services/rest-enforcement.service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/rest-enforcement.service.ts tests/services/rest-enforcement.service.test.ts
git commit -m "$(cat <<'EOF'
feat(service): add RestEnforcementService for REST state blocking

Implement grace request and skip rest logic with health limit integration.
Track grace and skip usage via RestExemption records.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4: API Layer - tRPC Routers

### Task 4.1: Create REST Enforcement Router

**Files:**
- Create: `src/server/routers/rest-enforcement.ts`
- Modify: `src/server/routers/index.ts`

**Step 1: Create rest-enforcement router**

Create `src/server/routers/rest-enforcement.ts`:

```typescript
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { restEnforcementService } from '@/services/rest-enforcement.service';

export const restEnforcementRouter = router({
  requestGrace: protectedProcedure
    .input(z.object({ pomodoroId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return await restEnforcementService.requestGrace(
        ctx.user.id,
        input.pomodoroId
      );
    }),

  requestSkipRest: protectedProcedure
    .mutation(async ({ ctx }) => {
      return await restEnforcementService.requestSkipRest(ctx.user.id);
    }),
});
```

**Step 2: Create health-limit router**

Create `src/server/routers/health-limit.ts`:

```typescript
import { router, protectedProcedure } from '../trpc';
import { healthLimitService } from '@/services/health-limit.service';

export const healthLimitRouter = router({
  checkLimit: protectedProcedure
    .query(async ({ ctx }) => {
      return await healthLimitService.checkHealthLimit(ctx.user.id);
    }),

  getSkipTokenStatus: protectedProcedure
    .query(async ({ ctx }) => {
      return await healthLimitService.canUseSkipToken(ctx.user.id);
    }),
});
```

**Step 3: Register routers in index**

Modify `src/server/routers/index.ts` to add the new routers:

Find the router exports and add:

```typescript
import { restEnforcementRouter } from './rest-enforcement';
import { healthLimitRouter } from './health-limit';

export const appRouter = router({
  // ... existing routers ...
  restEnforcement: restEnforcementRouter,
  healthLimit: healthLimitRouter,
});
```

**Step 4: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/server/routers/rest-enforcement.ts src/server/routers/health-limit.ts src/server/routers/index.ts
git commit -m "$(cat <<'EOF'
feat(api): add REST enforcement and health limit tRPC routers

Add endpoints for grace requests, skip rest, and health limit checks.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5: Settings UI Components

### Task 5.1: Create WorkAppsSettings Component

**Files:**
- Create: `src/components/settings/work-apps-settings.tsx`

**Step 1: Create WorkAppsSettings component**

Create `src/components/settings/work-apps-settings.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

interface WorkApp {
  bundleId: string;
  name: string;
}

const PRESET_WORK_APPS: WorkApp[] = [
  { bundleId: 'com.microsoft.VSCode', name: 'VS Code' },
  { bundleId: 'com.apple.Terminal', name: 'Terminal' },
  { bundleId: 'com.tdesktop.Telegram', name: 'Telegram' },
  { bundleId: 'us.zoom.xos', name: 'Zoom' },
  { bundleId: 'com.google.Chrome', name: 'Chrome' },
];

export function WorkAppsSettings() {
  const { data: settings } = trpc.settings.get.useQuery();
  const updateSettings = trpc.settings.update.useMutation();

  const workApps = (settings?.workApps as WorkApp[]) ?? [];

  const addApp = (app: WorkApp) => {
    const newWorkApps = [...workApps, app];
    updateSettings.mutate({ workApps: newWorkApps });
  };

  const removeApp = (bundleId: string) => {
    const newWorkApps = workApps.filter((app) => app.bundleId !== bundleId);
    updateSettings.mutate({ workApps: newWorkApps });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Work Apps</h3>
      <p className="text-sm text-gray-600">
        Apps to block during REST and SLEEP states
      </p>

      <div className="space-y-2">
        {workApps.map((app) => (
          <div key={app.bundleId} className="flex items-center justify-between p-2 border rounded">
            <span>{app.name}</span>
            <button
              onClick={() => removeApp(app.bundleId)}
              className="text-red-600 hover:text-red-800"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Quick Add:</p>
        <div className="flex flex-wrap gap-2">
          {PRESET_WORK_APPS.filter(
            (preset) => !workApps.some((app) => app.bundleId === preset.bundleId)
          ).map((preset) => (
            <button
              key={preset.bundleId}
              onClick={() => addApp(preset)}
              className="px-3 py-1 text-sm border rounded hover:bg-gray-100"
            >
              + {preset.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/settings/work-apps-settings.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add WorkAppsSettings component

Allow users to configure work apps list with preset quick-add buttons.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6: Testing and Documentation

### Task 6.1: Run All Tests

**Step 1: Run unit tests**

Run: `npm test`
Expected: All tests pass

**Step 2: Run TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Run linter**

Run: `npm run lint`
Expected: No errors

**Step 4: Commit if fixes needed**

If any fixes were made:

```bash
git add .
git commit -m "$(cat <<'EOF'
fix: address test failures and linting issues

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Implementation Notes

**Remaining Tasks (Not in This Plan):**

The following tasks are documented in the design spec but not included in this minimal implementation plan:

1. **State Machine Integration**: Extend vibeflow.machine.ts with REST state handlers
2. **Additional UI Components**: RestEnforcementSettings, HealthLimitSettings, REST state UI
3. **Desktop Integration**: IPC handlers for force quit and hide window
4. **E2E Tests**: Playwright tests for complete flows
5. **Sleep Time Service Extension**: Add work app blocking to sleep enforcement

**Why This Minimal Approach:**

Following YAGNI and the implicit instruction to write minimal code, this plan implements:
- Core data layer (schema, migrations)
- Essential services (health limits, REST enforcement)
- Basic API layer (tRPC routers)
- One UI component (work apps settings)

This provides a working foundation that can be tested and validated before adding complexity.

**Next Steps After This Plan:**

1. Test the implemented features manually
2. Gather user feedback on the basic functionality
3. Implement remaining UI components based on actual needs
4. Add state machine integration when REST flow is finalized
5. Implement desktop integration for actual app blocking

**Testing Strategy:**

- Unit tests for services (included in plan)
- Manual testing of API endpoints via tRPC
- UI testing in development environment
- E2E tests can be added after core functionality is validated
