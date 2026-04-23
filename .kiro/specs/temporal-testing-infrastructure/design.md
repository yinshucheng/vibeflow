# Temporal Testing Infrastructure — Technical Design

## 设计原则

1. **Temporal 的核心教训**：禁止直接读系统时间是一切的前提
2. **Erlang gen_statem 的启发**：Timer 到期 = 普通事件，测试时直接发事件
3. **FoundationDB 的思路**：同一份代码跑两种模式（production clock vs test clock）
4. **游戏引擎的经验**：时间是可控的输入参数，不是观测到的环境变量
5. **渐进式迁移**：不一次性改完 65 个 service，从高价值路径（~10 个核心 service）开始

## 架构概览

```
┌─────────────────────────────────────────────────────┐
│                  Application Code                    │
│  services / machines / routers / schedulers          │
│                       │                              │
│                       ▼                              │
│  ┌─────────────┐  ┌──────────────┐                   │
│  │  getClock() │  │  getTimer()  │                   │
│  │ (accessor)  │  │  (accessor)  │                   │
│  └──────┬──────┘  └──────┬───────┘                   │
│         │                │                           │
│    ┌────┴────┐     ┌─────┴─────┐                     │
│    │         │     │           │                      │
│ SystemClock TestClock  SystemTimer TestTimer          │
│ (prod)    (test)      (prod)    (test)               │
└─────────────────────────────────────────────────────┘
```

**注入方式：全局 accessor 函数**（不是构造函数注入）

VibeFlow 的 service 是模块级 singleton 对象（不是 class）。改为构造函数注入需重构所有 service 初始化，成本极高。全局 accessor + `setClock()` 是务实方案：
- 生产环境：`_clock` 默认为 `SystemClock`，永不更换
- 测试环境：`beforeEach` 中 `setClock(new TestClock(...))`，`afterEach` 中 `resetClock()`
- Vitest 每个 test file 跑在独立 worker，文件内串行，无并发竞争

## Phase 1: Clock 抽象层

### 1.1 ClockService 接口

```typescript
// src/lib/clock.ts

export const DAILY_RESET_HOUR = 4; // 唯一定义点，消除 12 处 copy-paste

export interface ClockService {
  /** Unix timestamp in milliseconds */
  now(): number;
  /** Current Date object */
  date(): Date;
  /** Current time in minutes since midnight (0-1439) */
  currentTimeMinutes(): number;
  /** VibeFlow "today" — 04:00 AM 为日期分界线，返回 "YYYY-MM-DD" */
  vibeflowDay(): string;
  /** VibeFlow "today" 的 Date 对象（日期部分，时间为 00:00:00） */
  vibeflowDayDate(): Date;
}
```

### 1.2 SystemClock（生产环境）

```typescript
class SystemClockImpl implements ClockService {
  now(): number { return Date.now(); }
  date(): Date { return new Date(); }

  currentTimeMinutes(): number {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }

  vibeflowDay(): string {
    const d = new Date();
    if (d.getHours() < DAILY_RESET_HOUR) {
      d.setDate(d.getDate() - 1);
    }
    return d.toISOString().slice(0, 10);
  }

  vibeflowDayDate(): Date {
    return new Date(this.vibeflowDay() + 'T00:00:00');
  }
}

export const systemClock: ClockService = new SystemClockImpl();
```

### 1.3 TestClock（测试环境）

```typescript
export class TestClock implements ClockService {
  private _now: number;

  constructor(initialTime: Date | number = Date.now()) {
    this._now = typeof initialTime === 'number' ? initialTime : initialTime.getTime();
  }

  now(): number { return this._now; }
  date(): Date { return new Date(this._now); }
  advance(ms: number): void { this._now += ms; }
  set(time: Date | number): void {
    this._now = typeof time === 'number' ? time : time.getTime();
  }
  advanceTo(hour: number, minute = 0): void {
    const d = new Date(this._now);
    d.setHours(hour, minute, 0, 0);
    if (d.getTime() <= this._now) d.setDate(d.getDate() + 1);
    this._now = d.getTime();
  }

  // ClockService 接口实现同 SystemClock，但基于 this._now
  currentTimeMinutes(): number {
    const d = new Date(this._now);
    return d.getHours() * 60 + d.getMinutes();
  }
  vibeflowDay(): string {
    const d = new Date(this._now);
    if (d.getHours() < DAILY_RESET_HOUR) d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  vibeflowDayDate(): Date {
    return new Date(this.vibeflowDay() + 'T00:00:00');
  }
}
```

### 1.4 全局 Accessor

```typescript
let _clock: ClockService = new SystemClockImpl();

export function getClock(): ClockService { return _clock; }
export function setClock(clock: ClockService): void { _clock = clock; }
export function resetClock(): void { _clock = systemClock; }
```

## Phase 2: Timer 抽象层（仅核心调度器）

**范围限定**：只为 `state-engine.service.ts` 和 `pomodoro-scheduler.service.ts` 引入 `TimerService`。其余 `setTimeout/setInterval`（socket.ts 中的 4 个 interval、notification、heartbeat 等）保持原样。

理由：
- 当前只有 2 个测试文件用 `vi.advanceTimersByTime()`，timer-heavy 的测试场景不多
- `vi.useFakeTimers()` 本身能控制 setTimeout/setInterval，全局替换无额外收益
- 核心痛点是 OVER_REST timer 和 pomodoro expiry 的调度测试

### 2.1 接口

```typescript
// src/lib/timer.ts

export interface TimerHandle {
  id: string;
  type: 'timeout' | 'interval';
  fireAt: number;
  callback: () => void;
  label?: string;  // 调试用，如 "overRest:user123"
}

export interface TimerService {
  setTimeout(callback: () => void, ms: number, label?: string): TimerHandle;
  setInterval(callback: () => void, ms: number, label?: string): TimerHandle;
  clear(handle: TimerHandle): void;
  clearAll(): void;
}
```

### 2.2 SystemTimerService

封装原生 setTimeout/setInterval，生产环境使用。实现略（直接代理到 globalThis）。

### 2.3 TestTimerService

```typescript
export class TestTimerService implements TimerService {
  private pending: TimerHandle[] = [];

  // TimerService 接口：注册 timer 到 pending 队列，不实际触发

  // ========== 测试专用方法 ==========
  getPending(): TimerHandle[] { /* 按 fireAt 排序返回 */ }
  async fireNext(): Promise<TimerHandle | undefined> { /* 触发最近的一个 */ }
  async fireUntil(time: number): Promise<TimerHandle[]> { /* 触发所有 <= time 的 */ }
  async advanceAndFire(clock: TestClock, ms: number): Promise<TimerHandle[]> {
    clock.advance(ms);
    return this.fireUntil(clock.now());
  }
}
```

### 2.4 全局 Accessor

```typescript
let _timer: TimerService = new SystemTimerServiceImpl();
export function getTimer(): TimerService { return _timer; }
export function setTimer(timer: TimerService): void { _timer = timer; }
export function resetTimer(): void { _timer = new SystemTimerServiceImpl(); }
```

## Phase 3: 统一时间工具库

将分散在 10+ 文件中的重复时间函数合并到 `src/lib/clock.ts`：

```typescript
// src/lib/clock.ts 追加

export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function isWithinWorkHours(
  slots: WorkTimeSlot[],
  currentTimeMinutes?: number,
): boolean {
  const current = currentTimeMinutes ?? getClock().currentTimeMinutes();
  return slots.some(slot => {
    if (!slot.enabled) return false;
    const start = parseTimeToMinutes(slot.startTime);
    const end = parseTimeToMinutes(slot.endTime);
    return current >= start && current < end;
  });
}

export function isInSleepWindow(
  sleepStart: string, sleepEnd: string,
  currentTimeMinutes?: number,
): boolean {
  const current = currentTimeMinutes ?? getClock().currentTimeMinutes();
  const start = parseTimeToMinutes(sleepStart);
  const end = parseTimeToMinutes(sleepEnd);
  return start <= end
    ? (current >= start && current < end)
    : (current >= start || current < end); // 跨午夜
}

export function getVibeflowDay(now?: Date | number): string {
  const d = now ? new Date(typeof now === 'number' ? now : now.getTime()) : getClock().date();
  if (d.getHours() < DAILY_RESET_HOUR) d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
```

**迁移清单**（仅 src/ 内，desktop/extension 留作跨客户端统一 spec）：

| 文件 | 删除内容 |
|------|----------|
| `idle.service.ts` | `getCurrentTimeMinutes()`, `parseTimeToMinutes()`, `isWithinWorkHours()` |
| `sleep-time.service.ts` | `getCurrentTimeMinutes()`, `isTimeInSleepWindow()` |
| `over-rest.service.ts` | `getCurrentTimeMinutes()` |
| `habit-reminder.service.ts` | 相关时间格式化（如有重复） |
| `daily-reset-scheduler.service.ts` | `DAILY_RESET_HOUR`, `getTodayDateString()` |
| `daily-state.service.ts` | `DAILY_RESET_HOUR`, `getTodayDateString()` |
| `entertainment.service.ts` | `DAILY_RESET_HOUR`, `getTodayDate()` |
| `progress-calculation.service.ts` | `DAILY_RESET_HOUR`, `getToday()` |
| `smart-suggestion.service.ts` | `DAILY_RESET_HOUR`, `getTodayDateString()` |
| `early-warning.service.ts` | `DAILY_RESET_HOUR`, `getTodayString()` |
| `efficiency-analysis.service.ts` | `DAILY_RESET_HOUR`, `getTodayDateString()` |
| `progress-analyzer.service.ts` | `DAILY_RESET_HOUR` |
| `chat-archive.service.ts` | `DAILY_RESET_HOUR`, `getVibeflowDay()` |
| `work-start.service.ts` | `DAILY_RESET_HOUR`, `getTodayString()` |
| `settings-lock.service.ts` | `isWithinWorkHours` re-export |

## Phase 4: XState Machine 时间解耦

### 当前问题

Machine 中 6 处直接调用 `Date.now()`，测试必须 `vi.spyOn(Date, 'now')` 全局 mock。

### 方案：事件 payload 传入时间

```typescript
// 改造后 — guards 变纯函数
canReturnToIdle: ({ context, event }) => {
  const now = event.now ?? getClock().now();
  return (now - context.overRestEnteredAt) >= OVER_REST_COOLDOWN_MS;
}

// 调用方
stateEngine.send({ type: 'RETURN_TO_IDLE', now: getClock().now() });

// 测试 — 完全同步，无 mock
machine.transition(state, { type: 'RETURN_TO_IDLE', now: 1000000 + 11 * 60 * 1000 });
```

**为什么不用 XState v5 的 clock option？**
XState v5 的 clock 选项用于控制 `after:` delayed transitions 的计时器。但 VibeFlow 的 machine 没有使用 `after:` transitions — 所有 timer 调度都在外部 `state-engine.service.ts` 中完成。因此 XState 原生 clock 不适用于我们的场景。event payload 方式更直接。

**迁移范围**（6 处）：

| 位置 | 迁移方式 |
|------|----------|
| `canReturnToIdle` guard | `event.now ?? getClock().now()` |
| `startPomodoro` action — `startTime` | `event.now ?? getClock().now()` |
| `completePomodoro` action — `lastPomodoroEndTime` | `event.now ?? getClock().now()` |
| `enterOverRest` action — `overRestEnteredAt` | `event.now ?? getClock().now()` |
| `switchTask` action — `startTime` | `event.now ?? getClock().now()` |
| `completeCurrentTask` action — `startTime` | `event.now ?? getClock().now()` |

所有事件类型增加可选 `now?: number` 字段。

## Phase 5: 测试 Fixture + 集成测试

### 5.1 标准测试 Fixture

```typescript
// tests/helpers/temporal.ts

export function setupTemporalTest(
  initialTime: Date | number = new Date('2025-01-01T10:00:00'),
): { clock: TestClock; timer: TestTimerService } {
  const clock = new TestClock(initialTime);
  const timer = new TestTimerService();
  setClock(clock);
  setTimer(timer);
  return { clock, timer };
}

export function teardownTemporalTest(): void {
  resetClock();
  resetTimer();
}
```

### 5.2 集成测试示例：OVER_REST 链路

```typescript
describe('OVER_REST timer chain', () => {
  let clock: TestClock;
  let timer: TestTimerService;

  beforeEach(() => {
    ({ clock, timer } = setupTemporalTest(new Date('2025-03-10T10:00:00'))); // 工作时间
  });
  afterEach(() => teardownTemporalTest());

  it('triggers OVER_REST after rest period expires', async () => {
    await stateEngine.send(userId, { type: 'START_POMODORO', ... });
    await stateEngine.send(userId, { type: 'COMPLETE_POMODORO' });
    expect(timer.getPending()).toHaveLength(1);

    const fired = await timer.advanceAndFire(clock, 10 * 60 * 1000);
    expect(fired).toHaveLength(1);
    expect(stateEngine.getState(userId)).toBe('over_rest');
  });

  it('cancels timer when new pomodoro starts during rest', async () => {
    await stateEngine.send(userId, { type: 'START_POMODORO', ... });
    await stateEngine.send(userId, { type: 'COMPLETE_POMODORO' });
    expect(timer.getPending()).toHaveLength(1);

    clock.advance(3 * 60 * 1000);
    await stateEngine.send(userId, { type: 'START_POMODORO', ... });
    expect(timer.getPending()).toHaveLength(0);
  });
});
```

## 迁移策略

### 渐进式，不 big bang

1. **Phase 1+3 先行**：建 clock 抽象 + 统一工具库，这是纯加法，零风险
2. **Phase 2 仅限 2 个调度器**：state-engine + pomodoro-scheduler
3. **Phase 4 紧跟**：machine 的 6 处 Date.now() 改为 event payload
4. **Phase 5 验证**：用新 fixture 重写核心测试 + 新增集成测试

**兼容过渡期**：`getClock().now()` 和 `Date.now()` 在未迁移的 service 中共存。已迁移的 service 用 `TestClock`，未迁移的仍用 `vi.useFakeTimers()`。两种模式不冲突。

**完成后**：添加 ESLint 规则禁止已迁移 service 中直接使用 `Date.now()` / `new Date()`。

## 风险与约束

| 风险 | 缓解措施 |
|------|----------|
| 全局 `setClock()` 在并行测试中竞争 | Vitest 每个 test file 独立 worker，文件内串行 |
| 忘记 `afterEach` 中 `resetClock()` | 配对函数 `setupTemporalTest` / `teardownTemporalTest` |
| 迁移过程中新旧模式混用 | 可接受，`getClock().now()` 无 `setClock()` 时等同 `Date.now()` |
| `TestTimerService.fireNext()` 需要 async | timer callback 可能涉及 DB 操作，返回 Promise |
| XState event payload 增加 `now` 字段 | 可选字段，不影响现有事件消费者 |
