# 状态管理系统重构 — Design

## 一、架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                       调用方（Callers）                       │
│  tRPC Routers / Socket Handlers / Scheduler / Chat Tools    │
│                                                             │
│  ❌ 不再直接调用 updateSystemState()                         │
│  ✅ 调用 stateEngine.send(userId, event)                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   StateEngine (新增)                         │
│  src/services/state-engine.service.ts                       │
│                                                             │
│  1. 从 DB 读当前状态 + context                              │
│  2. XState 校验转换合法性（guards）                          │
│  3. $transaction: 写入新状态 + 执行 DB 副作用                │
│  4. 事务提交后: broadcastFullState + 记录日志                │
│  5. 返回 TransitionResult                                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
    ┌──────────┐ ┌──────────┐ ┌──────────┐
    │ Prisma   │ │ Socket   │ │ Log      │
    │ (DB)     │ │ (广播)    │ │ (日志)   │
    └──────────┘ └──────────┘ └──────────┘
```

**核心原则：DB 先行，广播后行。**
事务内只做 DB 操作（状态写入、计数器更新、日志插入）。事务 commit 成功后才执行广播等外部 I/O。事务回滚则不广播，保证一致性。

## 二、XState 机器重定义

### 2.1 新的 SystemState 类型

```typescript
// src/machines/vibeflow.machine.ts

export type SystemState = 'idle' | 'focus' | 'over_rest';

// 旧值兼容映射（读取 DB 时使用）
export function normalizeState(raw: string): SystemState {
  switch (raw.toLowerCase()) {
    case 'idle':
    case 'locked':
    case 'planning':
    case 'rest':
      return 'idle';
    case 'focus':
      return 'focus';
    case 'over_rest':
      return 'over_rest';
    default:
      return 'idle';
  }
}
```

### 2.2 新的 Context

```typescript
export interface VibeFlowContext {
  userId: string;
  todayPomodoroCount: number;
  dailyCap: number;

  // 番茄钟相关
  currentPomodoroId: string | null;
  currentTaskId: string | null;
  pomodoroStartTime: number | null;
  taskStack: TaskStackEntry[];
  isTaskless: boolean;

  // rest 追踪（IDLE 子阶段）
  lastPomodoroEndTime: number | null;   // 番茄钟完成时记录，用于计算 rest 时长

  // OVER_REST 退出约束
  overRestEnteredAt: number | null;     // 进入 OVER_REST 的时间
  overRestExitCount: number;            // 今日主动退出次数
}
```

**删除的字段：** `top3TaskIds`、`airlockStep`、`restStartTime`、`restDuration`、`overRestStartTime`、`currentTimeSliceId`

**变化说明：**
- `restStartTime` → `lastPomodoroEndTime`：REST 不再是独立状态，只需记录上次番茄钟结束时间
- `overRestStartTime` → `overRestEnteredAt`：语义更清晰
- 新增 `overRestExitCount`：支持 G10（每日限 3 次主动退出）
- `top3TaskIds` 从状态机 context 移到 DailyState 模型直接管理（不再是状态转换的一部分）

### 2.3 新的事件定义

```typescript
export type VibeFlowEvent =
  | { type: 'START_POMODORO'; pomodoroId: string; taskId: string | null; isTaskless?: boolean }
  | { type: 'COMPLETE_POMODORO' }
  | { type: 'ABORT_POMODORO' }
  | { type: 'SWITCH_TASK'; taskId: string; timeSliceId: string }
  | { type: 'COMPLETE_CURRENT_TASK' }
  | { type: 'ENTER_OVER_REST' }        // 引擎/Scheduler 触发（IDLE → OVER_REST）
  | { type: 'RETURN_TO_IDLE' }         // 用户主动退出 OVER_REST（有冷却期+次数限制）
  | { type: 'WORK_TIME_ENDED' }        // Scheduler 检测到工作时间结束（OVER_REST → IDLE，跳过限制）
  | { type: 'DAILY_RESET' };
```

**删除的事件：** `COMPLETE_AIRLOCK`、`SET_AIRLOCK_STEP`、`START_TASKLESS_POMODORO`（合并到 `START_POMODORO` 的 `isTaskless` 字段）、`SYNC_STATE`、`SET_DAILY_CAP`、`ASSOCIATE_TASK`

### 2.4 新的状态机定义

```typescript
export const vibeflowMachine = setup({
  types: {
    context: {} as VibeFlowContext,
    events: {} as VibeFlowEvent,
  },
  guards: {
    canStartPomodoro: ({ context }) =>
      context.todayPomodoroCount < context.dailyCap,

    canReturnToIdle: ({ context }) => {
      if (context.overRestExitCount >= 3) return false;
      if (!context.overRestEnteredAt) return false;
      const elapsed = Date.now() - context.overRestEnteredAt;
      return elapsed >= 10 * 60 * 1000; // 10 分钟冷却期
    },
  },
  actions: {
    startPomodoro: assign(({ context, event }) => {
      if (event.type !== 'START_POMODORO') return {};
      return {
        currentPomodoroId: event.pomodoroId,
        currentTaskId: event.taskId,
        pomodoroStartTime: Date.now(),
        isTaskless: event.isTaskless ?? false,
        taskStack: event.taskId
          ? [{ taskId: event.taskId, startTime: Date.now() }]
          : [],
        lastPomodoroEndTime: null,
        overRestEnteredAt: null,
      };
    }),

    completePomodoro: assign({
      currentPomodoroId: null,
      currentTaskId: null,
      pomodoroStartTime: null,
      taskStack: [],
      isTaskless: false,
      todayPomodoroCount: ({ context }) => context.todayPomodoroCount + 1,
      lastPomodoroEndTime: () => Date.now(),
    }),

    abortPomodoro: assign({
      currentPomodoroId: null,
      currentTaskId: null,
      pomodoroStartTime: null,
      taskStack: [],
      isTaskless: false,
      // 有意设计：不设 lastPomodoroEndTime。
      // abort 表示用户主动中断工作节奏，不应被惩罚性地推入 OVER_REST。
      // OVER_REST 的纠偏对象是"完成了番茄钟但不继续工作"，不是"abort 后休息"。
      // 这意味着 start→abort 后，用户可以在 IDLE 停留而不触发 OVER_REST——这是正确的。
    }),

    enterOverRest: assign({
      overRestEnteredAt: () => Date.now(),
    }),

    returnToIdle: assign(({ context }) => ({
      overRestEnteredAt: null,
      overRestExitCount: context.overRestExitCount + 1,
    })),

    resetDaily: assign({
      todayPomodoroCount: 0,
      currentPomodoroId: null,
      currentTaskId: null,
      pomodoroStartTime: null,
      taskStack: [],
      isTaskless: false,
      lastPomodoroEndTime: null,
      overRestEnteredAt: null,
      overRestExitCount: 0,
    }),

    switchTask: assign(({ context, event }) => {
      if (event.type !== 'SWITCH_TASK') return {};
      return {
        currentTaskId: event.taskId,
        taskStack: [
          ...context.taskStack,
          { taskId: event.taskId, startTime: Date.now() },
        ],
      };
    }),

    completeCurrentTask: assign(({ context }) => ({
      taskStack: [
        ...context.taskStack,
        { taskId: null, startTime: Date.now() },
      ],
    })),
  },
}).createMachine({
  id: 'vibeflow',
  initial: 'idle',
  context: ({ input }) => ({
    userId: input.userId,
    todayPomodoroCount: input.todayPomodoroCount ?? 0,
    dailyCap: input.dailyCap ?? 8,
    currentPomodoroId: null,
    currentTaskId: null,
    pomodoroStartTime: null,
    taskStack: [],
    isTaskless: false,
    lastPomodoroEndTime: null,
    overRestEnteredAt: null,
    overRestExitCount: 0,
  }),
  states: {
    idle: {
      on: {
        START_POMODORO: {
          target: 'focus',
          guard: 'canStartPomodoro',
          actions: 'startPomodoro',
        },
        ENTER_OVER_REST: {
          target: 'over_rest',
          actions: 'enterOverRest',
        },
        DAILY_RESET: {
          target: 'idle',
          actions: 'resetDaily',
        },
      },
    },
    focus: {
      on: {
        COMPLETE_POMODORO: {
          target: 'idle',
          actions: 'completePomodoro',
        },
        ABORT_POMODORO: {
          target: 'idle',
          actions: 'abortPomodoro',
        },
        SWITCH_TASK: {
          actions: 'switchTask',
        },
        COMPLETE_CURRENT_TASK: {
          actions: 'completeCurrentTask',
        },
        DAILY_RESET: {
          target: 'idle',
          actions: 'resetDaily',
        },
      },
    },
    over_rest: {
      on: {
        START_POMODORO: {
          target: 'focus',
          guard: 'canStartPomodoro',
          actions: 'startPomodoro',
        },
        RETURN_TO_IDLE: {
          target: 'idle',
          guard: 'canReturnToIdle',
          actions: 'returnToIdle',
        },
        WORK_TIME_ENDED: {
          target: 'idle',
          // 无 guard——工作时间结束时无条件解除 OVER_REST
          actions: 'returnToIdle',
        },
        DAILY_RESET: {
          target: 'idle',
          actions: 'resetDaily',
        },
      },
    },
  },
});
```

## 三、StateEngine 服务

### 3.1 核心接口

```typescript
// src/services/state-engine.service.ts

interface TransitionResult {
  success: true;
  from: SystemState;
  to: SystemState;
  event: string;
} | {
  success: false;
  error: 'INVALID_TRANSITION' | 'GUARD_FAILED' | 'INTERNAL_ERROR';
  message: string;
  currentState: SystemState;
}

class StateEngineService {
  /**
   * 发送状态转换事件。
   * 所有状态变更必须通过此方法。
   * 同一 userId 的并发调用通过内存互斥锁串行化。
   */
  async send(
    userId: string,
    event: VibeFlowEvent,
    options?: { skipBroadcast?: boolean }
  ): Promise<TransitionResult>;
}
```

### 3.2 并发互斥

同一用户的状态转换必须串行执行。使用基于 userId 的内存锁：

```typescript
private locks = new Map<string, Promise<void>>();

private async withLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  // 等待前一个操作完成
  const prev = this.locks.get(userId);
  let resolve: () => void;
  const current = new Promise<void>((r) => { resolve = r; });
  this.locks.set(userId, current);

  if (prev) await prev;

  try {
    return await fn();
  } finally {
    resolve!();
    if (this.locks.get(userId) === current) {
      this.locks.delete(userId);
    }
  }
}
```

单进程 Node.js 下这比数据库行锁更简单可靠。不需要 SELECT FOR UPDATE。

### 3.3 Context 持久化（buildContext）

XState 是无状态的——每次请求创建临时 snapshot。Context 字段需要从 DB 恢复。

**持久化策略：每个 context 字段的数据来源**

| Context 字段 | 持久化位置 | 恢复方式 |
|-------------|-----------|---------|
| `userId` | 调用参数 | 直接传入 |
| `todayPomodoroCount` | `DailyState.pomodoroCount` | 直接读取 |
| `dailyCap` | `UserSettings.dailyCap` | 查询用户设置 |
| `currentPomodoroId` | `Pomodoro` 表 | 查 `status: 'IN_PROGRESS'` 的记录 |
| `currentTaskId` | `Pomodoro.taskId` | 从活跃番茄钟读取 |
| `pomodoroStartTime` | `Pomodoro.startTime` | 从活跃番茄钟读取 |
| `taskStack` | `TimeSlice` 表 | 查当前番茄钟的 TimeSlice 记录（已有） |
| `isTaskless` | `Pomodoro.isTaskless` | 从活跃番茄钟读取 |
| `lastPomodoroEndTime` | **`DailyState.lastPomodoroEndTime`（新增字段）** | 直接读取 |
| `overRestEnteredAt` | **`DailyState.overRestEnteredAt`（新增字段）** | 直接读取 |
| `overRestExitCount` | `DailyState.overRestExitCount`（已设计） | 直接读取 |

```typescript
private async buildContext(userId: string, dailyState: DailyState): Promise<VibeFlowContext> {
  const [settings, activePomodoro] = await Promise.all([
    prisma.userSettings.findFirst({ where: { userId } }),
    prisma.pomodoro.findFirst({
      where: { userId, status: 'IN_PROGRESS' },
      include: { timeSlices: { orderBy: { startTime: 'asc' } } },
    }),
  ]);

  return {
    userId,
    todayPomodoroCount: dailyState.pomodoroCount,
    dailyCap: settings?.dailyCap ?? 8,
    currentPomodoroId: activePomodoro?.id ?? null,
    currentTaskId: activePomodoro?.taskId ?? null,
    pomodoroStartTime: activePomodoro?.startTime?.getTime() ?? null,
    taskStack: activePomodoro?.timeSlices?.map(ts => ({
      taskId: ts.taskId,
      startTime: ts.startTime.getTime(),
    })) ?? [],
    isTaskless: activePomodoro?.isTaskless ?? false,
    lastPomodoroEndTime: dailyState.lastPomodoroEndTime?.getTime() ?? null,
    overRestEnteredAt: dailyState.overRestEnteredAt?.getTime() ?? null,
    overRestExitCount: dailyState.overRestExitCount,
  };
}
```

**关键：`lastPomodoroEndTime` 和 `overRestEnteredAt` 必须持久化到 DailyState 表**（见 4.1 Schema 变更）。否则服务器重启后这两个值丢失，导致 OVER_REST 计时错误。

### 3.4 执行流程

```typescript
async send(
  userId: string,
  event: VibeFlowEvent,
  options?: { skipBroadcast?: boolean }
): Promise<TransitionResult> {
  return this.withLock(userId, async () => {
    // 1. 从 DB 读取当前状态 + context（在锁内，保证一致性）
    const dailyState = await dailyStateService.getOrCreateToday(userId);
    const currentState = normalizeState(dailyState.systemState);
    const context = await this.buildContext(userId, dailyState);

    // 2. 用 XState 校验转换
    const snapshot = this.createSnapshot(currentState, context);
    const nextSnapshot = vibeflowMachine.transition(snapshot, event);

    if (nextSnapshot.value === snapshot.value && !this.isSelfTransition(event)) {
      return {
        success: false,
        error: 'INVALID_TRANSITION',
        message: `Event ${event.type} not allowed in state ${currentState}`,
        currentState,
      };
    }

    const newState = nextSnapshot.value as SystemState;
    const newContext = nextSnapshot.context;

    // 3. 在 $transaction 内执行 DB 操作
    await prisma.$transaction(async (tx) => {
      // 3a. 写入新状态 + context 持久化字段
      await tx.dailyState.update({
        where: { id: dailyState.id },
        data: {
          systemState: newState.toUpperCase(),  // serializeSystemState
          pomodoroCount: newContext.todayPomodoroCount,
          lastPomodoroEndTime: newContext.lastPomodoroEndTime
            ? new Date(newContext.lastPomodoroEndTime) : null,
          overRestEnteredAt: newContext.overRestEnteredAt
            ? new Date(newContext.overRestEnteredAt) : null,
          overRestExitCount: newContext.overRestExitCount,
        },
      });

      // 3b. 写入转换日志
      await tx.stateTransitionLog.create({
        data: {
          userId,
          fromState: currentState,
          toState: newState,
          event: event.type,
          context: JSON.stringify(this.extractLogContext(event, newContext)),
          timestamp: new Date(),
        },
      });
    });

    // 4. 事务成功后执行副作用
    //    先清理该用户的 overRest timer（任何状态转换都应清理）
    this.clearOverRestTimer(userId);

    if (!options?.skipBroadcast) {
      await this.broadcastFullState(userId);
    }
    this.publishMCPEvent(userId, currentState, newState, event);
    this.scheduleOverRestTimer(userId, newState, newContext);

    return {
      success: true,
      from: currentState,
      to: newState,
      event: event.type,
    };
  });
}
```

### 3.5 OVER_REST Timer 调度

```typescript
private overRestTimers = new Map<string, ReturnType<typeof setTimeout>>();

private clearOverRestTimer(userId: string): void {
  const existing = this.overRestTimers.get(userId);
  if (existing) {
    clearTimeout(existing);
    this.overRestTimers.delete(userId);
  }
}

private scheduleOverRestTimer(
  userId: string,
  state: SystemState,
  context: VibeFlowContext
): void {
  this.clearOverRestTimer(userId);

  // 只在 FOCUS→IDLE（番茄钟完成）时设置 timer
  if (state !== 'idle' || !context.lastPomodoroEndTime) return;

  const delay = (this.getShortRestDuration(userId) + this.getGracePeriod(userId)) * 60 * 1000;

  const timer = setTimeout(async () => {
    this.overRestTimers.delete(userId);
    // 检查是否仍在 IDLE + 工作时间内
    const current = await this.getCurrentState(userId);
    if (current === 'idle' && await this.isWithinWorkHours(userId)) {
      await this.send(userId, { type: 'ENTER_OVER_REST' });
    }
  }, delay);

  this.overRestTimers.set(userId, timer);
}
```

**兜底 Scheduler：** 现有的 30 秒 `overRestCheckInterval` 改为调用 `stateEngine.send(userId, { type: 'ENTER_OVER_REST' })`。引擎内部会校验——如果用户不在 IDLE 或已超出工作时间，事件被拒绝，无副作用。

### 3.6 工作时间结束时自动解除 OVER_REST

在 Scheduler 轮询中增加：
```typescript
// 在 30 秒轮询中
if (currentState === 'over_rest' && !isWithinWorkHours(userId)) {
  await stateEngine.send(userId, { type: 'WORK_TIME_ENDED' });
  // WORK_TIME_ENDED 事件在状态机中无 guard，无条件转换到 idle
}
```

**为什么用独立事件而非 force 参数：** `WORK_TIME_ENDED` 语义清晰（"工作时间结束了"），在状态机定义中是一条无 guard 的转换路径。不需要在 `send()` 里加 `force` hack 来跳过 `canReturnToIdle` guard。事件驱动的设计，让每个转换路径在状态机中都是显式的。

**Timer trade-off 说明：** `overRestTimers` 是内存 Map，服务器重启时 timer 丢失。兜底 Scheduler（30 秒轮询）可覆盖。当前单用户场景下 30 秒轮询无性能问题。未来用户量增长时可以改为只轮询有连接的用户（现有 `getConnectedUserIds()` 机制）。

## 四、Schema 变更

### 4.1 DailyState 模型修改

```prisma
model DailyState {
  id               String    @id @default(uuid())
  userId           String
  user             User      @relation(fields: [userId], references: [id])
  date             DateTime  @db.Date
  systemState      String    // 新值: IDLE, FOCUS, OVER_REST（兼容旧值: LOCKED, PLANNING, REST）
  top3TaskIds      String[]  // 保留，但不再是状态转换的 guard
  pomodoroCount    Int       @default(0)
  capOverrideCount Int       @default(0)
  airlockCompleted Boolean   @default(false) // 保留字段避免 migration 问题，不再使用
  adjustedGoal     Int?

  // 新增：状态引擎 context 持久化字段
  lastPomodoroEndTime DateTime?  // 最近番茄钟完成时间，用于计算 rest 时长 → OVER_REST 触发
  overRestEnteredAt   DateTime?  // 进入 OVER_REST 的时间，用于冷却期计算
  overRestExitCount   Int       @default(0)  // 今日主动退出 OVER_REST 次数

  @@unique([userId, date])
}
```

### 4.2 新增 StateTransitionLog 模型

```prisma
model StateTransitionLog {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  fromState String
  toState   String
  event     String
  context   String?  // JSON, 事件相关上下文（如 pomodoroId）
  timestamp DateTime @default(now())

  @@index([userId, timestamp])
  @@index([userId, fromState, toState])
}
```

**保留策略：** 日志保留 30 天。由 `dailyResetSchedulerService` 在每日 04:00 清理 30 天前的记录（与现有的 chat message cleanup 机制一致）。

## 五、调用方迁移

### 5.1 迁移映射表

每个现有的 `updateSystemState` 调用方替换为 `stateEngine.send`：

| 现有调用方 | 现有逻辑 | 新逻辑 |
|-----------|---------|--------|
| `pomodoro.start` (tRPC) | 检查限额 → 创建番茄 → `updateSystemState('focus')` → `broadcastFullState` | 创建番茄 → `stateEngine.send(userId, { type: 'START_POMODORO', pomodoroId, taskId })` |
| `pomodoro.complete` (tRPC) | 更新番茄 → `incrementPomodoroCount` → `updateSystemState('rest')` → `broadcastFullState` | 更新番茄 → `stateEngine.send(userId, { type: 'COMPLETE_POMODORO' })` |
| `pomodoro.abort` (tRPC) | 更新番茄 → `updateSystemState('planning')` → `broadcastFullState` | 更新番茄 → `stateEngine.send(userId, { type: 'ABORT_POMODORO' })` |
| `pomodoro.interrupt` (tRPC) | 同 abort | 同 abort（ABORT_POMODORO 统一处理） |
| `pomodoro.startTaskless` (tRPC) | 同 start | `stateEngine.send(userId, { type: 'START_POMODORO', pomodoroId, taskId: null, isTaskless: true })` |
| `POMODORO_START` (Socket) | 重复 tRPC 逻辑 | **删除**。Socket handler 改为调用 tRPC 内部逻辑或直接调 stateEngine |
| `completeExpiredPomodoros` (Scheduler) | 更新番茄 → `updateSystemState('rest')` → `incrementPomodoroCount` | 更新番茄 → `stateEngine.send(userId, { type: 'COMPLETE_POMODORO' })` |
| `chatToolsService` (AI Chat) | 独立判断 → `updateSystemState('focus')` | `stateEngine.send(userId, { type: 'START_POMODORO', ... })` |
| `completeAirlock` | 验证 top3 → 写 DB → `broadcastStateChange` | **删除**。Top 3 选择成为独立操作，不触发状态转换 |
| `skipAirlock` | 写 DB → `broadcastStateChange` | **删除**。无 LOCKED 状态，无需 skip |
| `dailyReset` | 写 DB → `broadcastStateChange` | `stateEngine.send(userId, { type: 'DAILY_RESET' })` |

### 5.2 删除的函数/方法

| 函数 | 文件 | 原因 |
|------|------|------|
| `updateSystemState()` | `daily-state.service.ts` | 被 `stateEngine.send()` 替代 |
| `getCurrentState()` | `daily-state.service.ts` | 统一用 `stateEngine.getState()` |
| `completeAirlock()` | `daily-state.service.ts` | LOCKED 状态删除 |
| `skipAirlock()` | `daily-state.service.ts` | LOCKED 状态删除 |
| `broadcastStateChange()` | `socket-broadcast.service.ts` | 统一用 full sync |
| `withStateValidation()` | `trpc.ts` | Guard 在引擎内部执行，不需要中间件 |
| over_rest 计算逻辑 in `getTodayWithProgress()` | `daily-state.service.ts` | OVER_REST 是 DB 真实状态，不再查询时计算 |
| over_rest 计算逻辑 in `sendStateSnapshotToSocket()` | `socket.ts` | 同上 |
| 30 秒 `overRestCheckInterval` 中的 policy-only 广播 | `socket.ts` | 改为调用 stateEngine 触发 ENTER_OVER_REST |

### 5.3 保留但修改的函数

| 函数 | 修改内容 |
|------|---------|
| `getOrCreateToday()` | 初始状态从 LOCKED/PLANNING 改为 IDLE。删除 `airlockMode` 判断 |
| `getTodayWithProgress()` | 删除 over_rest 计算逻辑。直接返回 DB 中的 `normalizeState(systemState)` |
| `sendStateSnapshotToSocket()` | 删除 over_rest 计算逻辑。直接用 DB 状态 |
| `broadcastFullState()` | 保留，继续作为 stateEngine 事务后的广播机制 |
| `incrementPomodoroCount()` | **删除**。pomodoroCount 由 stateEngine 在事务内直接从 `newContext.todayPomodoroCount` 写入 DB |

## 六、数据迁移

### 6.1 读取时兼容

`normalizeState()` 函数（2.1 节）处理所有旧值映射。任何从 DB 读取 `systemState` 的代码都经过此函数。无需 migration 改历史数据。

### 6.2 写入时统一

新的 `stateEngine.send()` 只写入 `'IDLE'`、`'FOCUS'`、`'OVER_REST'` 三个值。旧值逐渐被覆盖。

### 6.3 过渡期

迁移过程中可能有部分调用方尚未切换到 stateEngine。为此保留 `updateSystemState()` 但标记为 `@deprecated`，内部增加一个 console.warn 提示。完全迁移后删除。

## 七、Web 前端状态值适配

### 7.1 影响范围

前端代码中硬编码了旧状态值的位置需要更新。核心变化：

```typescript
// 旧 → 新映射
'locked'   → 不再存在（所有 LOCKED 相关 UI 删除或改为 IDLE）
'planning' → 'idle'
'rest'     → 'idle'
'focus'    → 'focus'（不变）
'over_rest'→ 'over_rest'（不变）
```

### 7.2 需要修改的前端文件（按类型）

| 类型 | 说明 |
|------|------|
| 状态判断（`=== 'locked'`、`=== 'planning'`、`=== 'rest'`） | 替换为对应的新状态值 |
| Airlock 页面（`src/app/airlock/`） | 改为可选的 Daily Planning 入口 |
| Header 状态显示 | IDLE/FOCUS/OVER_REST 三种显示 |
| `usePomodoroMachine` hook 中的 phase 判断 | 适配新状态值 |
| `useSocket` hook 中的 state 处理 | 适配新状态值 |

### 7.3 前端兼容层

在过渡期，前端可以使用与服务端相同的 `normalizeState()` 函数来处理 WebSocket 收到的状态值：

```typescript
// src/lib/state-utils.ts
export function normalizeState(raw: string): 'idle' | 'focus' | 'over_rest' {
  switch (raw.toLowerCase()) {
    case 'idle': case 'locked': case 'planning': case 'rest':
      return 'idle';
    case 'focus':
      return 'focus';
    case 'over_rest':
      return 'over_rest';
    default:
      return 'idle';
  }
}
```

在 `useSocket` hook 和 `app.store.ts`（iOS）的 state 接收处加入此映射，确保过渡期新旧服务端均兼容。

## 7.4 服务端 Policy 广播适配

### 问题

当前 iOS 的 Screen Time 阻断依赖 `UPDATE_POLICY` 通道中的 `policy.overRest.isOverRest`，而不是 `systemState`。`broadcastFullState()` 只发 SYNC_STATE，不发 UPDATE_POLICY。

如果 StateEngine 在状态转换后只调 `broadcastFullState()`，iOS 的 UPDATE_POLICY 通道会断，导致 Screen Time 阻断失效。

### 方案

StateEngine 事务成功后的广播改为双管齐下：

```typescript
// state-engine.service.ts send() 方法中，事务成功后：
if (!options?.skipBroadcast) {
  await this.broadcastFullState(userId);        // SYNC_STATE 通道（Web + Extension + iOS）
  await this.broadcastPolicyUpdate(userId);      // UPDATE_POLICY 通道（iOS Screen Time）
}
```

同时修改 `policyDistributionService.compilePolicy()`：当 DB 中 `systemState === 'OVER_REST'` 时，直接构建 `overRest` policy，不再调用 `overRestService.checkOverRestStatus()` 做动态计算。这消除了"DB 是 over_rest 但 checkOverRestStatus 返回 false"的不一致。

### Policy 编译逻辑变化

```typescript
// 旧：动态计算
const overRestStatus = await overRestService.checkOverRestStatus(userId);
if (overRestStatus.isOverRest && overRestStatus.shouldTriggerActions) {
  policy.overRest = { isOverRest: true, overRestMinutes: overRestStatus.overRestMinutes, ... };
}

// 新：基于 DB 真实状态
const dailyState = await dailyStateService.getOrCreateToday(userId);
const state = normalizeState(dailyState.systemState);
if (state === 'over_rest') {
  const overRestMinutes = dailyState.overRestEnteredAt
    ? Math.floor((Date.now() - dailyState.overRestEnteredAt.getTime()) / 60000)
    : 0;
  policy.overRest = { isOverRest: true, overRestMinutes, ... };
}
```

## 7.5 iOS 端适配

### 影响分析

iOS 端有两条独立的状态消费链路：

**链路 1：状态显示（需要改）**
- `DailyStateData.state` 类型（`types/index.ts:15`）：硬编码 5 个值
- `StatusScreen.DailyStateIndicator`：5 状态 UI 配置
- `notification-trigger.service.ts`：依赖 `FOCUS→REST` 和 `REST→PLANNING` 转换检测
- `app.store.ts`：full sync 和 delta sync 中的状态处理

**链路 2：Screen Time 阻断（基本不需要改）**
- `evaluateBlockingReason()` 使用 `activePomodoro` 和 `policy.overRest.isOverRest`，**不依赖 systemState**
- `blocking.service.ts` 订阅 policy 变化，不订阅 systemState 变化
- Native 层（Swift）使用 `BlockingReason` 字符串，与 systemState 无关

### 修改策略

1. **类型更新**：`DailyStateData.state` 改为 `'IDLE' | 'FOCUS' | 'OVER_REST'`
2. **Store 兼容层**：在 `mapFullStateToAppState()` 和 `applyDeltaChanges()` 中加入 `normalizeState()`
3. **UI 适配**：StatusScreen 删除 LOCKED/PLANNING/REST 配置，新增 IDLE
4. **通知触发器**：`FOCUS→REST` 改为 `FOCUS→IDLE`；`REST→PLANNING` 改为 `IDLE→FOCUS`
5. **阻断逻辑**：增加 fallback——当 `systemState === 'OVER_REST'` 且 policy 尚未更新时也触发阻断

### Octopus 协议兼容

iOS 依赖的 Octopus 协议不变：
- `SYNC_STATE` 命令格式不变，只是 `systemState.state` 值从 `locked/planning/focus/rest` 变为 `idle/focus/over_rest`
- `UPDATE_POLICY` 命令格式不变，`policy.overRest` 字段继续存在
- `octopus.ts:104` 的 `SystemState.state` 已经是 `string` 类型，无需修改

## 八、Airlock 移除

### 8.1 删除项

| 项目 | 文件 |
|------|------|
| Airlock 页面 | `src/app/airlock/` |
| `completeAirlock` / `skipAirlock` 方法 | `src/services/daily-state.service.ts` |
| tRPC `dailyState.completeAirlock` / `skipAirlock` | `src/server/routers/daily-state.ts` |
| `airlockMode` 设置 | `src/services/user.service.ts`、Settings UI |
| `airlockStep` / `hasValidTop3` guard | `src/machines/vibeflow.machine.ts` |
| Extension LOCKED 屏蔽逻辑 | `vibeflow-extension/src/background/service-worker.ts` 中 `enforceStateRestrictions` 的 LOCKED 分支 |
| Extension LOCKED 屏保页 | `vibeflow-extension/src/pages/locked-screensaver.*` |

### 8.2 保留项

| 项目 | 说明 |
|------|------|
| `top3TaskIds` 字段 | DailyState 模型保留，作为可选的每日规划数据 |
| Top 3 选择 UI | 改为 Dashboard 上的可选卡片，不阻塞任何操作 |
| Daily Planning 页面 | 从 `/airlock` 路由改为 `/planning`（或 Dashboard 内嵌），纯 UI 功能 |

## 九、实施阶段

### Phase 1: 基础设施（不改变外部行为）

1. 新增 `StateTransitionLog` 模型，运行 `db:generate` + `db:push`
2. 新增 `DailyState.overRestExitCount` 字段
3. 创建 `src/services/state-engine.service.ts` 骨架
4. 创建 `src/lib/state-utils.ts`（`normalizeState` 等工具函数）
5. 重写 `src/machines/vibeflow.machine.ts` 为 3 状态模型
6. 写 StateEngine 的单元测试（校验所有转换、guards、actions）

**验证点：** `npm test` 通过，现有系统行为不变（StateEngine 存在但未被调用）

### Phase 2: 引擎上线 + 调用方迁移

7. 实现 `StateEngine.send()` 完整逻辑（DB 读写 + $transaction + 广播 + 日志）
8. 迁移 `pomodoro.start` → `stateEngine.send(START_POMODORO)`
9. 迁移 `pomodoro.complete` → `stateEngine.send(COMPLETE_POMODORO)`
10. 迁移 `pomodoro.abort` / `interrupt` → `stateEngine.send(ABORT_POMODORO)`
11. 迁移 `pomodoro.startTaskless` → `stateEngine.send(START_POMODORO, isTaskless)`
12. 迁移 Scheduler `completeExpiredPomodoros` → `stateEngine.send(COMPLETE_POMODORO)`
13. 迁移 Socket `POMODORO_START` handler → 调用 stateEngine
14. 迁移 `chatToolsService` → `stateEngine.send(START_POMODORO)`
15. 迁移 `dailyReset` → `stateEngine.send(DAILY_RESET)`
16. 实现 OVER_REST delayed timer + Scheduler 兜底
17. 标记 `updateSystemState()` 为 deprecated

**验证点：** 每迁移一个调用方后 `npm test` + `npm run build` 通过

### Phase 3: 清理旧代码 + 前端适配 + iOS 适配

18. 删除 `updateSystemState()`、`getCurrentState()`、`broadcastStateChange()`
19. 删除 `getTodayWithProgress()` 中的 over_rest 计算逻辑
20. 删除 `sendStateSnapshotToSocket()` 中的 over_rest 计算逻辑
21. 删除 `withStateValidation()` 中间件
22. `getOrCreateToday()` 初始状态改为 IDLE
23. 前端 `useSocket` / state 处理加入 `normalizeState()`
24. 前端状态判断从 locked/planning/rest 改为 idle
25. Header 状态显示适配 3 状态
26. 服务端 Policy 广播适配（StateEngine 事务后双管广播 + compilePolicy 适配）
27. iOS 端适配（类型、Store、UI、通知触发器、测试）

**验证点：** `npm run build` + `npm test` + `npm run lint` + `cd vibeflow-ios && npx jest` 全部通过

### Phase 4: Airlock 移除

26. 删除 Airlock 页面和路由
27. 删除 `completeAirlock` / `skipAirlock` 和对应 tRPC
28. 删除 `airlockMode` 设置
29. 删除 Extension LOCKED 屏蔽逻辑和屏保页
30. Top 3 选择改为 Dashboard 可选卡片
31. 清理测试中的 LOCKED/PLANNING/airlock 相关 case

**验证点：** 全量测试通过，E2E 通过

## 十、关键设计决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| XState 用法 | 纯函数校验器（`machine.transition(snapshot, event)`），不跑 actor | 无状态，每次请求独立，不需要维护内存中的 actor 实例 |
| OVER_REST 触发 | Delayed timer（主）+ Scheduler 轮询（兜底） | Timer 精确但可能丢失；Scheduler 不精确但可靠。两者互补 |
| 广播模式 | 统一 full sync | 性能开销可接受（每次状态转换一次 full sync），一致性收益远大于性能损失 |
| REST 状态 | 不保留为独立状态 | IDLE 的 `lastPomodoroEndTime` context 字段足以追踪 rest 时长，无需独立状态 |
| RestEnforcer | 有意放弃 | 覆盖率低（仅 Desktop），OVER_REST 已覆盖纠偏需求 |
| 日志存储 | DB 表（StateTransitionLog） | 结构化查询支持、与现有 Prisma 栈一致、30 天自动清理 |
| 事务边界 | DB 操作在 $transaction 内，广播在事务后 | 保证广播与 DB 状态一致。事务回滚不会导致错误广播 |
| `updateSystemState` 过渡策略 | 标记 deprecated + console.warn，不立即删除 | 渐进迁移，避免 big bang 风险 |
| 旧状态值兼容 | 读取时映射（`normalizeState`），不做 DB migration | 零停机迁移，旧数据自然过期 |
| 工作时间结束解除 OVER_REST | 独立事件 `WORK_TIME_ENDED`（而非 force 参数） | 语义清晰，状态机中显式定义无 guard 转换路径，不需要在 send() 里加 hack |
| 并发控制 | 基于 userId 的内存互斥锁（Promise 链） | 单进程 Node.js 下比 DB 行锁更简单；保证同一用户的 send() 串行执行 |
| Context 持久化 | `lastPomodoroEndTime`/`overRestEnteredAt` 存 DailyState 表；番茄钟相关从 Pomodoro/TimeSlice 表查 | 服务器重启后 context 可完整恢复；不增加额外的 context dump 表 |
| abort 后 lastPomodoroEndTime | 不恢复（保持 null） | abort 表示用户主动中断，不应惩罚性推入 OVER_REST。有意允许 start→abort→无限 IDLE |
| Timer 统一清理 | 任何状态转换成功后都清理该用户的 overRestTimer | 防止幽灵 timer 在状态已变更后仍触发 |
