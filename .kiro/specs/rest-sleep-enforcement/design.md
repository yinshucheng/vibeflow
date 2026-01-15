# REST & SLEEP State Work App Blocking - Technical Design

## Architecture Overview

This feature extends the existing VibeFlow state machine and enforcement mechanisms to provide configurable work app blocking during REST and SLEEP states, with health limits and skip token system to balance enforcement with user autonomy.

## Data Model Design

### 1. UserSettings Extensions

```prisma
model UserSettings {
  // ... existing fields ...

  // Work Apps Configuration (shared list)
  workApps                Json?              // [{bundleId: string, name: string}]

  // REST State Configuration
  restEnforcementEnabled  Boolean            @default(false)
  restEnforcementActions  String[]           @default([])  // ["force_quit", "hide_window", "show_notification"]
  restGraceLimit          Int                @default(2)   // Grace times per REST cycle
  restGraceDuration       Int                @default(2)   // Minutes per grace

  // SLEEP State Configuration (extends existing)
  sleepEnforcementActions String[]           @default(["force_quit"])  // Actions for SLEEP state

  // Health Limits Configuration
  healthLimit2Hours       Int                @default(110) // 2-hour pomodoro time limit (minutes)
  healthLimitDaily        Int                @default(600) // Daily pomodoro time limit (minutes, 10 hours)

  // Skip Token Configuration
  skipTokenWeeklyLimit    Int                @default(5)   // Weekly skip token quota
  skipTokenUsed           Int                @default(0)   // Tokens used this week
  skipTokenResetAt        DateTime?                        // Next reset time (Monday 00:00)
}
```

### 2. RestExemption Model (New)

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

## Service Layer Design

### 1. RestEnforcementService (New)

**File**: `/src/services/rest-enforcement.service.ts`

**Responsibilities**:
- Check if REST enforcement is enabled
- Handle grace and skip rest requests
- Track grace usage per REST cycle
- Execute configured blocking actions

**Key Methods**:
```typescript
class RestEnforcementService {
  // Check if work apps should be blocked
  async shouldEnforceRest(userId: string, pomodoroId: string): Promise<boolean>

  // Request grace (returns success + remaining count)
  async requestGrace(userId: string, pomodoroId: string): Promise<{
    granted: boolean
    remaining: number
  }>

  // Request skip rest (checks health limits + skip token)
  async requestSkipRest(userId: string): Promise<{
    allowed: boolean
    reason?: string
    tokenRemaining?: number
  }>

  // Execute work app blocking actions
  async enforceWorkAppBlock(userId: string, actions: string[]): Promise<void>
}
```

### 2. HealthLimitService (New)

**File**: `/src/services/health-limit.service.ts`

**Responsibilities**:
- Check 2-hour and daily pomodoro time limits
- Manage skip token consumption and reset
- Track over-limit pomodoro usage

**Key Methods**:
```typescript
class HealthLimitService {
  // Check if health limit is exceeded
  async checkHealthLimit(userId: string): Promise<{
    exceeded: boolean
    type: '2hours' | 'daily' | null
  }>

  // Check if skip token is available
  async canUseSkipToken(userId: string): Promise<{
    available: boolean
    remaining: number
  }>

  // Consume skip token
  async consumeSkipToken(userId: string): Promise<{
    success: boolean
    remaining: number
  }>

  // Reset weekly tokens (Monday 00:00)
  async resetWeeklyTokens(userId: string): Promise<void>
}
```

**Health Limit Calculation**:

```typescript
// 2-hour limit check
async function check2HourLimit(userId: string): Promise<boolean> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const pomodoros = await prisma.pomodoro.findMany({
    where: {
      userId,
      completedAt: { gte: twoHoursAgo },
      status: 'COMPLETED'
    }
  });

  const totalMinutes = pomodoros.reduce((sum, p) => sum + p.duration, 0);
  const limit = await getUserSettings(userId).healthLimit2Hours;

  return totalMinutes >= limit; // 110 minutes
}

// Daily limit check
async function checkDailyLimit(userId: string): Promise<boolean> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const pomodoros = await prisma.pomodoro.findMany({
    where: {
      userId,
      completedAt: { gte: startOfDay },
      status: 'COMPLETED'
    }
  });

  const totalMinutes = pomodoros.reduce((sum, p) => sum + p.duration, 0);
  const limit = await getUserSettings(userId).healthLimitDaily;

  return totalMinutes >= limit; // 600 minutes
}
```

### 3. SleepTimeService Extensions

**File**: `/src/services/sleep-time.service.ts` (extend existing)

**New Method**:
```typescript
// Execute SLEEP state work app blocking
async enforceSleepWorkAppBlock(userId: string): Promise<void>
```

## State Machine Integration

### 1. Context Extensions

**File**: `/src/machines/vibeflow.machine.ts`

```typescript
context: {
  // ... existing fields ...
  restGraceCount: 0,           // Grace times used in current REST cycle
  restGraceExpiresAt: null,    // Current grace expiration time
  skipTokenRemaining: 0,       // Remaining skip tokens this week
}
```

### 2. REST State Extensions

```typescript
states: {
  REST: {
    entry: ['startRestTimer', 'checkRestEnforcement'],
    on: {
      REQUEST_GRACE: {
        actions: ['grantRestGrace'],
        guard: 'canGrantRestGrace'
      },
      SKIP_REST: {
        target: 'PLANNING',
        actions: ['consumeSkipToken', 'resetRestContext'],
        guard: 'canSkipRest'
      },
      REST_COMPLETE: {
        target: 'PLANNING',
        actions: ['resetRestContext']
      }
    }
  }
}
```

### 3. Guards

```typescript
guards: {
  // Check if grace can be granted
  canGrantRestGrace: (context) => {
    return context.restGraceCount < userSettings.restGraceLimit;
  },

  // Check if rest can be skipped
  canSkipRest: async (context) => {
    const healthLimit = await healthLimitService.checkHealthLimit(userId);
    if (!healthLimit.exceeded) return true;

    const tokenAvailable = await healthLimitService.canUseSkipToken(userId);
    return tokenAvailable.available;
  }
}
```

## API Layer (tRPC)

### 1. restEnforcement.router.ts (New)

```typescript
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

### 2. healthLimit.router.ts (New)

```typescript
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

## UI Components

### 1. WorkAppsSettings (New)

**File**: `/src/components/settings/work-apps-settings.tsx`

**Features**:
- Display work apps list
- Add/remove work apps (preset + custom bundle ID)
- Detect running apps for quick add
- Preset work apps: VS Code, Terminal, Slack, Zoom, Chrome, Arc

### 2. RestEnforcementSettings (New)

**File**: `/src/components/settings/rest-enforcement-settings.tsx`

**Features**:
- Enable/disable REST enforcement toggle
- Configure blocking actions (force_quit/hide_window/show_notification)
- Configure grace limit and duration
- Settings lock indicator (locked during work hours)

### 3. HealthLimitSettings (New)

**File**: `/src/components/settings/health-limit-settings.tsx`

**Features**:
- Configure 2-hour and daily limits
- Configure weekly skip token limit
- Display current skip token usage and reset time

### 4. REST State UI Extensions

**Features**:
- Grace button with remaining count
- Skip Rest button with token count
- Countdown to work app blocking
- Confirmation dialog for skip token usage

## Implementation Flows

### REST State Flow

**Enter REST State**:
1. Pomodoro completes → Enter REST state
2. Check `restEnforcementEnabled`
3. If enabled:
   - Initialize `restGraceCount = 0`
   - Start countdown: `restGraceDuration` minutes until blocking
   - Display UI: [Grace] [Skip Rest] buttons

**User Clicks Grace**:
1. Check `restGraceCount < restGraceLimit`
2. If allowed:
   - `restGraceCount++`
   - Create `RestExemption` record (type: "grace")
   - Extend countdown by `restGraceDuration` minutes
   - Update UI: show remaining grace count
3. If not allowed:
   - Show message: "Grace limit reached"

**User Clicks Skip Rest**:
1. Check health limits (2-hour + daily)
2. If not exceeded:
   - Enter PLANNING state
   - Create `RestExemption` record (type: "skip")
3. If exceeded:
   - Check `skipTokenRemaining > 0`
   - If has token:
     - Show confirmation: "Use 1 skip token? (X remaining)"
     - On confirm:
       - `skipTokenUsed++`
       - Create `RestExemption` record
       - Enter PLANNING state
   - If no token:
     - Show message: "Health limit reached, no skip tokens remaining"

**Countdown Ends**:
1. Execute configured blocking actions:
   - `force_quit`: Call Desktop App IPC to force quit work apps
   - `hide_window`: Call Desktop App IPC to hide work app windows
   - `show_notification`: Display system notification
2. Continue REST state until user clicks "REST Complete"

### SLEEP State Flow

**Enter SLEEP Window**:
1. Check if current time in `sleepTimeStart ~ sleepTimeEnd`
2. If in sleep window:
   - Check `sleepTimeEnabled`
   - If enabled:
     - Execute `sleepEnforcementActions` (block work apps)
     - Display Sleep Mode UI
     - Provide Snooze button (if count remaining)

### Skip Token Reset Flow

**Weekly Reset (Monday 00:00)**:
```typescript
async function resetWeeklySkipTokens() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday

  if (dayOfWeek === 1 && now.getHours() === 0) {
    await prisma.userSettings.updateMany({
      data: {
        skipTokenUsed: 0,
        skipTokenResetAt: getNextMonday(now)
      }
    });
  }
}
```

## Desktop App Integration

### IPC Methods (New)

```typescript
// Force quit work apps
ipcMain.handle('force-quit-work-apps', async (event, bundleIds: string[]) => {
  // Implementation using macOS APIs
});

// Hide work app windows
ipcMain.handle('hide-work-app-windows', async (event, bundleIds: string[]) => {
  // Implementation using macOS APIs
});
```

## Testing Strategy

### Unit Tests (Vitest)

- `rest-enforcement.service.test.ts`: Grace limits, skip rest logic, action execution
- `health-limit.service.test.ts`: 2-hour/daily limit calculation, skip token management, weekly reset
- `sleep-time.service.test.ts`: SLEEP state work app blocking integration

### E2E Tests (Playwright)

- `rest-enforcement.spec.ts`: Grace button, skip rest button, health limit + skip token flow
- `sleep-enforcement.spec.ts`: SLEEP window entry, work app blocking, snooze integration

## Database Migration

```bash
npm run db:generate
npx prisma migrate dev --name add_rest_enforcement_and_health_limits
```

**Migration includes**:
1. Add UserSettings new fields
2. Create RestExemption table
3. Set default values

## Documentation Updates

- `CLAUDE.md`: Add new feature description
- `.kiro/steering/product.md`: Update product features
- `.kiro/steering/structure.md`: Add new service layer descriptions
- `.kiro/specs/rest-sleep-enforcement/`: This spec directory

## Architecture Decisions

### Why Shared Work Apps List?

- Work apps definition is consistent across contexts
- Reduces configuration complexity
- Easier to maintain and understand

### Why Different Actions for REST vs SLEEP?

- Different contexts require different enforcement levels
- REST: May only need hide_window (temporary)
- SLEEP: May need force_quit (stronger enforcement)

### Why Weekly Skip Token Reset?

- Provides fresh start each week
- Prevents long-term token accumulation
- Aligns with typical work week cycle

### Why Grace + Skip Rest Separation?

- Grace: Delay enforcement within current REST cycle
- Skip Rest: Exit REST early to start next pomodoro
- Different use cases require different mechanisms

### Why Health Limits?

- Prevent overwork and burnout
- 2-hour limit: Prevent continuous work without proper breaks
- Daily limit: Prevent excessive daily work hours
- Skip tokens: Balance enforcement with flexibility

## Trade-offs

### Complexity vs Flexibility

**Decision**: Provide full configurability (actions, limits, grace, tokens)
**Trade-off**: More complex UI and logic, but better user experience
**Rationale**: Users have different work styles and needs

### Enforcement vs Autonomy

**Decision**: Use skip tokens to allow override
**Trade-off**: Users can bypass limits, but won't close the app
**Rationale**: Product adoption is more important than perfect enforcement

### Shared vs Separate Work Apps

**Decision**: Shared work apps list
**Trade-off**: Less granular control, but simpler configuration
**Rationale**: Work apps definition is typically consistent

## Future Enhancements

- Cross-device skip token sync
- Custom health limit formulas
- App usage analytics
- Automatic work app detection based on usage patterns
- Smart grace suggestions based on work patterns
