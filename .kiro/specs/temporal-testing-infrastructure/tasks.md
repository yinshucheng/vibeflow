# Temporal Testing Infrastructure — Tasks

## Phase 1: Clock 抽象层 [P0]

### Task 1.1: 创建 ClockService 接口和实现
- [ ] 创建 `src/lib/clock.ts`
- [ ] 定义 `ClockService` 接口（`now()`, `date()`, `currentTimeMinutes()`, `vibeflowDay()`, `vibeflowDayDate()`）
- [ ] 定义 `DAILY_RESET_HOUR = 4` 为唯一常量
- [ ] 实现 `SystemClock`（生产环境，基于 `Date`）
- [ ] 实现 `TestClock`（测试环境，支持 `set()`, `advance()`, `advanceTo()`）
- [ ] 实现全局 accessor：`getClock()`, `setClock()`, `resetClock()`
- [ ] 为 `ClockService` 和 `TestClock` 编写单元测试
- [ ] `npm test` + `npm run build` 通过

## Phase 2: Timer 抽象层（仅核心调度器）[P0]

### Task 2.1: 创建 TimerService 接口和实现
- [ ] 创建 `src/lib/timer.ts`
- [ ] 定义 `TimerHandle` 接口（id, type, fireAt, callback, label）
- [ ] 定义 `TimerService` 接口
- [ ] 实现 `SystemTimerService`（封装原生 setTimeout/setInterval）
- [ ] 实现 `TestTimerService`（支持 `getPending()`, `fireNext()`, `fireUntil()`, `advanceAndFire()`）
- [ ] 实现全局 accessor：`getTimer()`, `setTimer()`, `resetTimer()`
- [ ] 为 `TestTimerService` 编写单元测试（fire 顺序、cancel、interval 重复入队）
- [ ] `npm test` + `npm run build` 通过

### Task 2.2: 创建标准测试 Fixture
- [ ] 创建 `tests/helpers/temporal.ts`
- [ ] 实现 `setupTemporalTest(initialTime)` → `{ clock, timer }`
- [ ] 实现 `teardownTemporalTest()`
- [ ] 编写示例测试验证 fixture 工作正常

## Phase 3: 统一时间工具库 [P1]

### Task 3.1: 合并时间函数到 clock.ts
- [ ] `parseTimeToMinutes()` 移入 `src/lib/clock.ts`
- [ ] `isWithinWorkHours()` 移入，改用 `getClock()`
- [ ] `isInSleepWindow()` 移入，改用 `getClock()`
- [ ] `getVibeflowDay()` 移入，改用 `getClock()`
- [ ] 边界条件单元测试（04:00 分界、跨午夜、时间段切换）
- [ ] `npm test` + `npm run build` 通过

### Task 3.2: 消除 getCurrentTimeMinutes() 重复（src/ 内 4 处）
- [ ] 迁移 `idle.service.ts` — 删除本地 `getCurrentTimeMinutes()`, `parseTimeToMinutes()`, `isWithinWorkHours()`，改从 `@/lib/clock` 导入
- [ ] 迁移 `sleep-time.service.ts` — 删除 `getCurrentTimeMinutes()`, `isTimeInSleepWindow()`
- [ ] 迁移 `over-rest.service.ts` — 删除 `getCurrentTimeMinutes()`
- [ ] 迁移 `settings-lock.service.ts` — 删除 `isWithinWorkHours` re-export（如有）
- [ ] 确保所有引用这些函数的调用方更新导入路径
- [ ] `npm test` + `npm run build` 通过

### Task 3.3: 消除 DAILY_RESET_HOUR copy-paste（src/ 内 10 处）
- [ ] 迁移 `daily-reset-scheduler.service.ts` — 删除 `DAILY_RESET_HOUR`、`getTodayDateString()`
- [ ] 迁移 `daily-state.service.ts`
- [ ] 迁移 `entertainment.service.ts`
- [ ] 迁移 `progress-calculation.service.ts`
- [ ] 迁移 `smart-suggestion.service.ts`
- [ ] 迁移 `early-warning.service.ts`
- [ ] 迁移 `efficiency-analysis.service.ts`
- [ ] 迁移 `progress-analyzer.service.ts`
- [ ] 迁移 `chat-archive.service.ts`
- [ ] 迁移 `work-start.service.ts`
- [ ] `npm test` + `npm run build` 通过

## Phase 4: XState Machine 时间解耦 [P1]

### Task 4.1: Event payload 传入时间
- [ ] 为所有事件类型添加可选 `now?: number` 字段（类型定义）
- [ ] `canReturnToIdle` guard 改用 `event.now ?? getClock().now()`
- [ ] `startPomodoro` action 改用 `event.now ?? getClock().now()`
- [ ] `completePomodoro` action 改用 `event.now`
- [ ] `enterOverRest` action 改用 `event.now`
- [ ] `switchTask` / `completeCurrentTask` action 改用 `event.now`
- [ ] `stateEngine.send()` 统一附带 `now: getClock().now()`
- [ ] `npm test` + `npm run build` 通过

### Task 4.2: 更新 Machine 测试
- [ ] 移除 `vi.spyOn(Date, 'now')` mock
- [ ] 改为通过 event payload 传入确定性时间
- [ ] 验证所有现有测试通过
- [ ] 新增 `canReturnToIdle` 边界测试（cooldown 刚好到/差 1ms）

## Phase 5: 核心 Service 迁移 [P1]

### Task 5.1: 迁移 state-engine.service.ts
- [ ] `scheduleOverRestTimer` 改用 `getTimer().setTimeout()` + `getClock().now()`
- [ ] `clearOverRestTimer` 改用 `getTimer().clear()`
- [ ] `overRestTimers` Map value 类型改为 `TimerHandle`
- [ ] 替换所有 `Date.now()` / `new Date()` 为 `getClock()` 调用
- [ ] 更新测试：使用 `setupTemporalTest` / `teardownTemporalTest`
- [ ] 移除测试中的 `vi.useFakeTimers()`、`vi.spyOn(Date, 'now')`
- [ ] `npm test` 通过

### Task 5.2: 迁移 pomodoro-scheduler.service.ts
- [ ] `CHECK_INTERVAL` 的 `setInterval` 改用 `getTimer().setInterval()`
- [ ] `completeExpiredPomodoros` 中的 `new Date()` 改用 `getClock().date()`
- [ ] 新增测试：expired pomodoro 检测逻辑

### Task 5.3: 迁移 daily-reset-scheduler.service.ts
- [ ] `isResetTime()` 改用 `getClock()`
- [ ] 轮询 interval 保持原样（不走 TimerService）
- [ ] 新增测试：04:00 触发、非 04:00 不触发

### Task 5.4: 迁移其余核心 service（Date.now → getClock）
- [ ] `rest-enforcement.service.ts` — grace period timer 改用 `getTimer().setTimeout()` + `getClock()`
- [ ] `idle.service.ts` — 替换 `Date.now()` / `new Date()`
- [ ] `focus-session.service.ts` — 替换 `Date.now()` / `new Date()`
- [ ] `progress-calculation.service.ts` — 替换 `Date.now()` / `new Date()`
- [ ] `daily-state.service.ts` — 替换 `new Date()`

## Phase 6: 集成测试套件 [P2]

### Task 6.1: OVER_REST 完整链路测试
- [ ] IDLE → FOCUS → complete → rest period → OVER_REST 触发
- [ ] IDLE → FOCUS → complete → rest 期间开始新 pomodoro → timer 取消
- [ ] OVER_REST → RETURN_TO_IDLE cooldown 边界
- [ ] 非工作时间不触发 OVER_REST
- [ ] Focus Session 中工作时间外仍触发 OVER_REST

### Task 6.2: Daily Reset 链路测试
- [ ] 04:00 时各状态下的 reset 行为（idle/focus/over_rest）
- [ ] 03:59 → 04:00 跨越时的 vibeflowDay 切换
- [ ] Reset 后 pomodoro count 归零

### Task 6.3: 工作时间窗口 + Pomodoro 过期测试
- [ ] 进入/离开工作时间时 OVER_REST timer 的激活/取消
- [ ] 25 分钟 pomodoro 到期自动 complete
- [ ] 自定义时长 pomodoro 到期

## Phase 7: 迁移现有测试 + 质量保障 [P3]

### Task 7.1: 迁移现有时间相关测试到新 fixture
- [ ] `vibeflow.machine.test.ts` — 移除 `vi.spyOn(Date, 'now')`（Phase 4 已覆盖）
- [ ] `state-engine.service.test.ts` — 移除裸 `setTimeout` 等待（Phase 5 已覆盖）
- [ ] `rest-enforcement.service.test.ts` — 统一使用 `setupTemporalTest`
- [ ] habit 系列测试（3 个文件）— 统一使用 `setupTemporalTest`
- [ ] `task-today-all.test.ts` — 统一使用 `setupTemporalTest`

### Task 7.2: ESLint 规则（可选，全部迁移后启用）
- [ ] 添加 ESLint 规则：已迁移的 service 中禁止 `Date.now()` / `new Date()`
- [ ] CI 中启用
