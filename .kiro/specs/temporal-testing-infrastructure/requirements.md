# Temporal Testing Infrastructure — Requirements

## 问题陈述

VibeFlow 的核心业务逻辑大量依赖时间：番茄钟倒计时、OVER_REST 定时触发、工作时间窗口判断、每日 04:00 重置、休息超时检测、Focus Session 计时等。当前状况：

1. **113 处 `Date.now()`（41 个非测试文件）、199 处 `new Date()`（73 个文件）直接调用**，分布在 ~65 个 service 文件中，零时钟抽象
2. **5 种不同的时间 mock 模式**混用（`vi.spyOn(Date, 'now')`、`vi.useFakeTimers()`、`vi.setSystemTime()`、`vi.advanceTimersByTime()`、property test 中的 `setSystemTime`）
3. **`getCurrentTimeMinutes()` 函数重复定义 7 次**（src/ 4 次 + desktop/ 3 次），`DAILY_RESET_HOUR = 4` 及 "adjust for 4AM" 逻辑在 12 个文件中 copy-paste（src/ 10 + extension/ 2）
4. **单测通过但人工验收失败**：时间依赖逻辑在 mock 下正确，但真实环境的 timer 竞争、异步时序、跨组件协同出问题
5. **E2E 完全不 mock 时间**，无法覆盖 OVER_REST、daily reset 等需要"等待"才能触发的场景
6. **服务测试覆盖率 ~35%**（23/65），核心 service 如 `pomodoro.service.ts`、`over-rest.service.ts`、`focus-session.service.ts` 等无测试

## 目标

建立可靠的时间依赖测试基础设施，使得：

1. 核心时间敏感 service 可以通过**注入式时钟**控制，不再依赖全局 mock
2. 状态机的定时转换可以通过**事件 payload 传入时间**同步测试
3. 建立**统一的时间工具库**，消除 copy-paste 的时间计算逻辑
4. 建立**标准测试 fixture**，统一时间 mock 模式

## 依赖注入策略

VibeFlow 的 ~65 个 service 是模块级单例对象（非 class），改为构造函数注入成本极高。
采用**全局 accessor 函数**方式：`getClock()` / `getTimer()` 返回当前实例，测试通过 `setClock(testClock)` / `setTimer(testTimer)` 替换。

理由：
- 与 singleton 模式兼容，无需重构 service 初始化
- Temporal.io 和 FoundationDB 验证过的务实方案
- Vitest 每个 test file 跑在独立 worker，`setClock()` 无并发竞争
- 生产环境 `_clock` 默认为 `SystemClock`，永不更换

## 验收标准

### AC1: Clock 抽象层
- [ ] `src/lib/clock.ts` 提供 `ClockService` 接口（`now()`, `date()`, `currentTimeMinutes()`, `vibeflowDay()`, `vibeflowDayDate()`）
- [ ] 实现 `SystemClock`（生产）和 `TestClock`（测试，支持 `set()`, `advance()`, `advanceTo()`）
- [ ] 全局 accessor：`getClock()`, `setClock()`, `resetClock()`
- [ ] **核心时间敏感 service 迁移**（~10 个，非全量）：
  - `state-engine.service.ts`
  - `pomodoro-scheduler.service.ts`
  - `daily-reset-scheduler.service.ts`
  - `over-rest.service.ts`
  - `rest-enforcement.service.ts`
  - `idle.service.ts`（`isWithinWorkHours` 等）
  - `sleep-time.service.ts`
  - `focus-session.service.ts`
  - `progress-calculation.service.ts`
  - `daily-state.service.ts`
- [ ] 其余 service 按需渐进迁移，不要求一次性完成
- [ ] `TestClock` 单元测试

### AC2: Timer 抽象层（仅限核心调度器）
- [ ] `src/lib/timer.ts` 提供 `TimerService` 接口 + `TestTimerService`
- [ ] **仅迁移 2 个核心调度器**（不全局替换所有 setTimeout）：
  - `state-engine.service.ts` 的 `scheduleOverRestTimer`（OVER_REST 定时触发）
  - `pomodoro-scheduler.service.ts`（番茄钟过期检测）
- [ ] `TestTimerService` 支持 `getPending()`, `fireNext()`, `advanceAndFire(clock, ms)`
- [ ] 其余 `setTimeout/setInterval`（socket.ts 中的 4 个 interval 等）保持原样，不在本次范围

### AC3: 统一时间工具库
- [ ] `src/lib/clock.ts` 统一提供：`parseTimeToMinutes()`, `isWithinWorkHours()`, `isInSleepWindow()`, `getVibeflowDay()`, `DAILY_RESET_HOUR`
- [ ] 消除 `getCurrentTimeMinutes()` 的 4 处 src/ 内重复定义（desktop/extension 不在本次范围，留作跨客户端统一时处理）
- [ ] 消除 `DAILY_RESET_HOUR` + "adjust for 4AM" 在 src/ 内 10 处 copy-paste
- [ ] 所有工具函数接受可选 `now` 参数，默认使用 `getClock()`
- [ ] 边界条件单元测试（04:00 分界、跨午夜睡眠窗口、工作时间段切换）

### AC4: XState Machine 时间解耦
- [ ] 所有事件类型增加可选 `now?: number` 字段
- [ ] 6 处 `Date.now()` 调用改为读取 `event.now ?? getClock().now()`
- [ ] guards 变成纯函数：`(context, event) → boolean`，无副作用时间读取
- [ ] `stateEngine.send()` 统一附带 `now: getClock().now()`
- [ ] Machine 测试移除 `vi.spyOn(Date, 'now')`，改为通过 event payload 传入确定性时间

### AC5: 标准测试 Fixture
- [ ] `tests/helpers/temporal.ts` 提供 `setupTemporalTest()` / `teardownTemporalTest()`
- [ ] 新增测试模板/示例（OVER_REST 完整链路），作为后续测试的标准参考
- [ ] 迁移现有核心时间测试到新模式（`vibeflow.machine.test.ts`, `state-engine.service.test.ts`, `rest-enforcement.service.test.ts`）
- [ ] 新增测试不再使用 `vi.useFakeTimers()` / `vi.spyOn(Date, 'now')`（已迁移的 service 范围内）

### AC6: 状态转换集成测试
- [ ] IDLE → FOCUS → complete → (rest period) → OVER_REST 完整链路
- [ ] Daily reset (04:00) 在各状态下的行为
- [ ] 工作时间窗口边界：进入/离开工作时间时的状态变化
- [ ] Focus Session 对 OVER_REST 触发条件的影响
- [ ] 使用 `TestClock` + `TestTimerService`（仅限已迁移的 service）

## 非目标

- 不做 Temporal.io 式的 workflow orchestration 重构
- 不做 FoundationDB 式的确定性仿真（DST）
- 不做事件录制/回放系统（留作后续迭代）
- 不做 Dev Time Travel API / 运行时 timer 重评估（复杂度等同于小型 DST，与上述非目标矛盾。如有需要，作为独立 spec 评估）
- 不做 Web Dev Tools Time Travel Panel（UI 功能不属于测试基础设施）
- 不改变现有状态机的业务逻辑
- 不增加新的业务功能
- 不全局替换所有 `setTimeout`/`setInterval`（仅迁移核心调度器）
- 不迁移 desktop/extension 中的时间重复代码（留作跨客户端统一 spec）
