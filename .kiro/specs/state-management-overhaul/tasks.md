# 状态管理系统重构 — Tasks

## Phase 1: 基础设施（不改变外部行为）

### 1.1 Schema 变更 ✅ `2528321`
- [x] DailyState 新增字段：`lastPomodoroEndTime DateTime?`、`overRestEnteredAt DateTime?`、`overRestExitCount Int @default(0)`
- [x] 新增 `StateTransitionLog` 模型（id, userId, fromState, toState, event, context, timestamp + 索引）
- [x] `npm run db:generate && npm run db:push`
- [x] 验证：`npx tsc --noEmit` 通过，现有功能不受影响 <!-- 1.1 done -->

### 1.2 工具函数 ✅ `46686b1`
- [x] 创建 `src/lib/state-utils.ts`
  - `normalizeState(raw: string): SystemState` — 旧值映射（locked/planning/rest→idle）
  - `serializeState(state: SystemState): string` — 写 DB 时大写（IDLE/FOCUS/OVER_REST）
  - `SystemState` 类型导出：`'idle' | 'focus' | 'over_rest'`
- [x] 写单元测试：覆盖所有旧值映射（locked→idle, LOCKED→idle, planning→idle, REST→idle, focus→focus, over_rest→over_rest, 未知值→idle）

### 1.3 重写 XState 状态机 ✅ `46686b1`
- [x] 重写 `src/machines/vibeflow.machine.ts`：3 状态（idle/focus/over_rest）、9 事件、2 guards、9 actions
- [x] 更新 `VibeFlowContext`：删除 top3TaskIds/airlockStep/restStartTime/restDuration/overRestStartTime/currentTimeSliceId，新增 lastPomodoroEndTime/overRestEnteredAt/overRestExitCount
- [x] 更新 `VibeFlowEvent`：删除 COMPLETE_AIRLOCK/SET_AIRLOCK_STEP/START_TASKLESS_POMODORO/SYNC_STATE/SET_DAILY_CAP/ASSOCIATE_TASK，新增 WORK_TIME_ENDED
- [x] 更新辅助函数：`getAllowedEvents`、`isEventAllowed`、`getStateDisplayInfo`、`validateTransition`、`parseSystemState`
- [x] 写单元测试：覆盖所有转换路径（10 条）、guard 拒绝场景（dailyCap 超限、冷却期未到、退出次数用尽）、action 正确性（context 字段变化）
- [x] 验证：`npm test` + `npm run build` + `npm run lint` 通过 <!-- 1.2+1.3 done -->

### 1.4 StateEngine 骨架 ✅ `590eb7c`
- [x] 创建 `src/services/state-engine.service.ts`
  - `TransitionResult` 类型定义
  - `send()` 方法（完整实现：withLock → 读 DB → buildContext → XState transition → $transaction → 广播 + MCP + timer）
  - `withLock()` 并发互斥实现
  - `buildContext()` 方法实现（从 DailyState + Pomodoro + TimeSlice + UserSettings 恢复 context）
  - `clearOverRestTimer()` / `scheduleOverRestTimer()` 骨架
- [x] 在 `src/services/index.ts` 导出 `stateEngineService` 单例
- [x] 写 buildContext 的单元测试：mock DB 数据，验证 context 各字段正确恢复（20 tests: buildContext 7, withLock 1, send 7, getState 3, timer 2）
- [x] 验证：`npm test`（986 passed）+ `npm run build` + `npm run lint` 通过，现有系统行为不变（StateEngine 未被调用） <!-- 1.4 done -->

## Phase 2: 引擎上线 + 调用方迁移

### 2.1 StateEngine 完整实现
- [x] 实现 `send()` 完整逻辑：
  - withLock → 读 DB → buildContext → XState transition → $transaction（写状态+context+日志）→ 广播 + MCP 事件 + timer 调度
- [x] 实现 `scheduleOverRestTimer()`：番茄钟完成后设 delayed timer（shortRestDuration+gracePeriod），到时检查状态+工作时间后发 ENTER_OVER_REST
- [x] 实现 `getState(userId)`: 从 DB 读 + normalizeState 的统一入口
- [x] 写集成测试：
  - IDLE→FOCUS→IDLE 完整流程（mock DB）
  - IDLE→FOCUS→IDLE→(timer)→OVER_REST 流程
  - 并发 send 串行化测试
  - guard 拒绝后不写 DB、不广播
  - 事务内写入 StateTransitionLog
- [x] 验证：`npm test` 通过 <!-- 2.1 done -->

### 2.2 迁移 pomodoro.start（tRPC） ✅ `6f97a5b`
- [x] `src/server/routers/pomodoro.ts` 的 `start` mutation：删除 `dailyStateService.updateSystemState('focus')` 和手动 `broadcastFullState`，改为 `stateEngine.send(userId, { type: 'START_POMODORO', pomodoroId, taskId })`
- [x] 处理 stateEngine 返回失败（guard 拒绝）的情况：返回 tRPC 错误
- [x] 验证：`npm test` + `npm run build`，手动测试开始番茄钟 <!-- 2.2 done -->

### 2.3 迁移 pomodoro.complete（tRPC）
- [x] `complete` mutation 中删除 `dailyStateService.incrementPomodoroCount()` 和 `updateSystemState('rest')` 和 `broadcastFullState`，改为 `stateEngine.send(userId, { type: 'COMPLETE_POMODORO' })`
- [x] 验证：手动测试番茄钟完成后状态变为 IDLE（不再是 REST） <!-- 2.3 done -->

### 2.4 迁移 pomodoro.abort + interrupt（tRPC）
- [x] abort mutation：删除 `updateSystemState('planning')` 和 `broadcastFullState`，改为 `stateEngine.send(userId, { type: 'ABORT_POMODORO' })`
- [x] interrupt mutation：同上（复用 ABORT_POMODORO 事件）
- [x] 验证：`npm test` + `npm run build` <!-- 2.4 done -->

### 2.5 迁移 pomodoro.startTaskless（tRPC）
- [x] 删除 `updateSystemState('focus')` 和 `broadcastFullState`，改为 `stateEngine.send(userId, { type: 'START_POMODORO', pomodoroId, taskId: null, isTaskless: true })`
- [x] 验证：`npm test` + `npm run build` <!-- 2.5 done -->

### 2.6 迁移 Scheduler completeExpiredPomodoros
- [x] `src/services/pomodoro.service.ts` 的 `completeExpiredPomodoros()`：删除 `dailyStateService.updateSystemState('rest')` 和 `dailyStateService.incrementPomodoroCount()`，改为 `stateEngine.send(userId, { type: 'COMPLETE_POMODORO' })`
- [x] 验证：手动等待番茄钟超时自动完成，确认状态变为 IDLE <!-- 2.6 done -->

### 2.7 迁移 Socket POMODORO_START handler
- [x] `src/server/socket.ts` 的 `POMODORO_START` 处理：删除重复的 start 逻辑，改为调用 stateEngine（或直接调用 pomodoro service 让其走 stateEngine 路径）
- [x] 验证：通过 Socket 启动番茄钟，确认状态正确 <!-- 2.7 done -->

### 2.8 迁移 chatToolsService
- [x] `src/services/chat-tools.service.ts`：删除独立的 `updateSystemState('focus')`，改为 `stateEngine.send(userId, { type: 'START_POMODORO', ... })`
- [x] 验证：通过 AI Chat 启动番茄钟 <!-- 2.8 done -->

### 2.9 迁移 dailyReset
- [x] `src/services/daily-state.service.ts` 的 `resetToday()` 改为 `stateEngine.send(userId, { type: 'DAILY_RESET' })`
- [x] 验证：`npm test` + `npm run build` 通过 <!-- 2.9 done -->

### 2.10 OVER_REST 触发机制
- [x] 实现 `scheduleOverRestTimer()` 完整逻辑（读 shortRestDuration+gracePeriod → delayed timer → ENTER_OVER_REST）
- [x] 修改 30 秒 `overRestCheckInterval`（`src/server/socket.ts`）：对 IDLE 用户尝试 ENTER_OVER_REST，对 OVER_REST 用户检查 WORK_TIME_ENDED
- [x] 验证：`npm test`（986 passed）+ `npx tsc --noEmit` 通过 <!-- 2.10 done -->

### 2.11 标记旧函数 deprecated
- [x] `updateSystemState()` 加 `@deprecated` + console.warn（此时应已无调用方）
- [x] `incrementPomodoroCount()` 加 `@deprecated`
- [x] `getCurrentState()` 加 `@deprecated`
- [x] 验证：`npm run build` + `npm test`，grep 确认无非 deprecated 调用 <!-- 2.11 done -->

### 2.12 Phase 2 完整验证
- [x] `npm run build` 通过
- [x] `npm test` 通过（991 passed, 12 skipped）
- [x] `npm run lint` 通过 <!-- 2.12 done -->
- [ ] [HUMAN] 手动 happy path 测试：开始→完成→休息→OVER_REST→开始下一个

## Phase 3: 清理旧代码 + 前端适配

### 3.1 删除旧服务端代码
- [x] 删除 `updateSystemState()` 方法
- [x] 删除 `getCurrentState()` 方法
- [x] 删除 `incrementPomodoroCount()` 方法
- [x] 删除 `broadcastStateChange()` 函数（`src/services/socket-broadcast.service.ts`）及其注册函数
- [x] 删除 `withStateValidation()` 中间件（`src/server/trpc.ts`）
- [x] 删除 `getTodayWithProgress()` 中的 over_rest 动态计算逻辑（直接返回 DB 中 normalizeState 后的值）
- [x] 删除 `sendStateSnapshotToSocket()` 中的 over_rest 动态计算逻辑
- [x] 验证：`npm run build` + `npm test` <!-- 3.1 done -->

### 3.2 getOrCreateToday 适配
- [x] `getOrCreateToday()` 初始状态从 LOCKED/PLANNING 改为 IDLE
- [x] 删除 `airlockMode` 判断逻辑
- [x] 验证：新一天首次访问状态为 IDLE <!-- 3.2 done -->

### 3.3 前端兼容层
- [x] 创建 `src/lib/state-utils.ts` 的前端版本（或共享）
- [x] `src/hooks/use-socket.ts`：接收 STATE_CHANGE 后经过 `normalizeState()` 处理
- [x] `src/hooks/use-pomodoro-machine.ts`：状态判断适配 idle/focus/over_rest <!-- 3.3 done -->

### 3.4 前端状态值替换
- [x] 搜索前端代码中所有 `'locked'`/`'planning'`/`'rest'` 字符串，逐个替换为 `'idle'`
- [x] `src/components/layout/header.tsx`：状态显示适配 3 状态（IDLE/FOCUS/OVER_REST）
- [x] `src/app/page.tsx`：删除 LOCKED 状态重定向到 /airlock 的逻辑
- [x] `src/components/pomodoro/rest-mode.tsx`：REST 不再是独立状态，该组件改为在 IDLE 且 lastPomodoroEndTime 近期时显示（由 usePomodoroMachine 的 phase 控制）
- [x] 验证：`npm run build` + `npm run lint` <!-- 3.4 done -->

### 3.5 服务端 Policy 广播适配
- [ ] `policyDistributionService.compilePolicy()` 适配新状态：当 `systemState === 'over_rest'`（DB 真实值）时直接构建 `overRest` policy，不再依赖 `overRestService.checkOverRestStatus()` 的动态计算
- [ ] StateEngine 的 `broadcastFullState` 后追加 `broadcastPolicyUpdate(userId)` 调用，确保 iOS 的 UPDATE_POLICY 通道不断
- [ ] 验证：服务端状态转到 OVER_REST 后，iOS 能通过 UPDATE_POLICY 收到 `policy.overRest.isOverRest = true`

### 3.6 iOS 端适配 (vibeflow-ios)
- [ ] **状态类型更新**：`vibeflow-ios/src/types/index.ts:15` 将 `DailyStateData.state` 类型从 `'LOCKED' | 'PLANNING' | 'FOCUS' | 'REST' | 'OVER_REST'` 改为 `'IDLE' | 'FOCUS' | 'OVER_REST'`
- [ ] **Store 兼容层**：`vibeflow-ios/src/store/app.store.ts` 的 `mapFullStateToAppState()`（~line 146）和 `applyDeltaChanges()`（~line 245）中引入 `normalizeState` 逻辑，将旧值 `LOCKED/PLANNING/REST` 映射为 `IDLE`
- [ ] **StatusScreen UI 适配**：`vibeflow-ios/src/screens/StatusScreen.tsx` 的 `DailyStateIndicator`（~line 48）删除 LOCKED/PLANNING/REST 的配置，新增 IDLE（'空闲'）；`getTimePeriodLabel()`（~line 199）适配新状态值
- [ ] **通知触发器适配**：`vibeflow-ios/src/services/notification-trigger.service.ts` 的 `checkPomodoroCompletion()`（~line 171）从 `FOCUS→REST` 改为 `FOCUS→IDLE`；`checkRestPeriodEnd()`（~line 208）从 `REST→PLANNING/FOCUS` 改为检测 IDLE 状态下开始新番茄钟
- [ ] **Screen Time 阻断逻辑**：`vibeflow-ios/src/utils/blocking-reason.ts` 的 `evaluateBlockingReason()` 目前依赖 `policy.overRest.isOverRest`（不依赖 systemState），**确认** 3.5 的 policy 广播适配完成后此逻辑无需修改；同时新增 fallback：当 `systemState === 'OVER_REST'` 且 policy 尚未更新时也返回 `'over_rest'`
- [ ] **ChatBubble 适配**：`vibeflow-ios/src/components/chat/ChatBubble.tsx:26` 的 `on_planning_enter` 触发标签改为适配新状态（如改为 '每日空闲' 或删除）
- [ ] **测试更新**：更新 `__tests__/delta-sync-blocking.test.ts` 中的状态引用（LOCKED/PLANNING/REST→IDLE）；更新 `__tests__/property/cache-round-trip.property.ts:30-31` 的状态生成器
- [ ] 验证：`cd vibeflow-ios && npx jest` 通过

### 3.7 Phase 3 完整验证
- [ ] `npm run build` 通过
- [ ] `npm test` 通过
- [ ] `npm run lint` 通过
- [ ] `cd vibeflow-ios && npx jest` 通过
- [ ] 手动测试 Web 前端全流程
- [ ] [HUMAN] 手动测试 iOS 连接重构后的服务端：状态同步 + Screen Time 阻断

## Phase 4: Airlock 移除

### 4.1 删除 Airlock 服务端代码
- [ ] 删除 `completeAirlock()` 方法（`src/services/daily-state.service.ts`）
- [ ] 删除 `skipAirlock()` 方法
- [ ] 删除 `isAirlockCompleted()` 方法
- [ ] 删除 tRPC `dailyState.completeAirlock` 和 `dailyState.skipAirlock` mutations（`src/server/routers/daily-state.ts`）
- [ ] 删除 `airlockMode` 相关设置逻辑（`src/services/user.service.ts`）
- [ ] 验证：`npm run build` + `npm test`

### 4.2 删除 Airlock 前端代码
- [ ] 删除 `src/app/airlock/` 目录
- [ ] 删除或简化 Airlock 相关组件（如有）
- [ ] Settings 页面：删除 `airlockMode` 配置项
- [ ] 验证：`npm run build`

### 4.3 删除 Extension LOCKED 逻辑
- [ ] `vibeflow-extension/src/background/service-worker.ts`：`enforceStateRestrictions()` 删除 LOCKED 分支
- [ ] `vibeflow-extension/src/lib/policy-cache.ts`：`isRestrictedState()` 删除 LOCKED 判断（只保留 OVER_REST）
- [ ] 删除 `locked-screensaver.html` 及相关资源
- [ ] 验证：Extension 在 IDLE 状态下不屏蔽任何页面

### 4.4 Top 3 降级为可选功能
- [ ] Top 3 任务选择 UI 改为 Dashboard 上的可选卡片（不阻塞操作）
- [ ] 保留 `DailyState.top3TaskIds` 字段和相关查询，但不再作为 guard
- [ ] 验证：不选 Top 3 也能正常开始番茄钟

### 4.5 清理测试
- [ ] 删除/更新状态机单元测试中的 LOCKED/PLANNING/REST 相关 case
- [ ] 删除/更新 E2E 测试中的 airlock 流程
- [ ] 更新 MCP 工具测试中的状态相关 case
- [ ] 验证：`npm test` + `npm run e2e` 全部通过

### 4.6 Phase 4 完整验证
- [ ] `npm run build` 通过
- [ ] `npm test` 通过
- [ ] `npm run lint` 通过
- [ ] `npm run e2e` 通过
- [ ] 手动测试完整日常流程：直接开始番茄钟→完成→休息→OVER_REST→退出→再开始
