# 状态管理系统重构 — Requirements

## 一、现状概述

VibeFlow 的 Daily State Machine 定义了 5 个状态：LOCKED → PLANNING → FOCUS ↔ REST → OVER_REST，由 XState v5 描述（`src/machines/vibeflow.machine.ts`）。但 XState **仅作为文档存在**，运行时不执行。实际状态是 PostgreSQL `DailyState.systemState` 字段中的一个字符串，由分散在 6 个文件、8+ 个调用点中的代码直接写入。

### 1.1 状态转换入口（现状）

| 调用方 | 文件 | 设置的状态 | 有无守卫 |
|--------|------|-----------|---------|
| `pomodoro.start` (tRPC) | `src/server/routers/pomodoro.ts:150` | `'focus'` | 仅检查日限额和冲突番茄 |
| `pomodoro.complete` (tRPC) | `src/server/routers/pomodoro.ts:210` | `'rest'` | 无 |
| `pomodoro.abort` (tRPC) | `src/server/routers/pomodoro.ts:281` | `'planning'` | 无 |
| `pomodoro.interrupt` (tRPC) | `src/server/routers/pomodoro.ts:322` | `'planning'` | 无 |
| `pomodoro.startTaskless` (tRPC) | `src/server/routers/pomodoro.ts:357` | `'focus'` | 仅检查日限额 |
| `POMODORO_START` (Socket) | `src/server/socket.ts:1283` | `'focus'` | 重复实现 tRPC 路径的逻辑 |
| `completeExpiredPomodoros` (Scheduler) | `src/services/pomodoro.service.ts:579` | `'rest'` | 无状态检查 |
| `chatToolsService` (AI Chat) | `src/services/chat-tools.service.ts:258` | `'focus'` | 独立判断 |
| `completeAirlock` | `src/services/daily-state.service.ts:380` | `'planning'` | 直接写 DB |
| `skipAirlock` | `src/services/daily-state.service.ts:819` | `'planning'` | 直接写 DB |
| `dailyReset` | `src/services/daily-state.service.ts:717` | `'locked'` | 定时任务 |

每个入口点各自判断是否可以转换，没有统一的校验层。

### 1.2 OVER_REST 的双重身份（现状）

OVER_REST 与其他 4 个状态本质不同——**从不写入数据库**：

- `updateSystemState()` 的所有调用方只传入 `'locked'`/`'planning'`/`'focus'`/`'rest'`
- tRPC 的输入验证 `z.enum(['locked','planning','focus','rest'])` 明确排除了 `'over_rest'`
- XState 定义的 `ENTER_OVER_REST` 事件在生产代码中从未被 dispatch

OVER_REST 实际是"查询时计算"的虚拟状态，由 `overRestService.checkOverRestStatus()` 在以下位置动态叠加：

| 函数 | 是否计算 over_rest | 被谁调用 |
|------|-------------------|---------|
| `getCurrentState()` | **不计算**，返回原始 DB 值 | `withStateValidation`（未使用）、router 内部 |
| `getTodayWithProgress()` | 计算（仅当 DB=`rest` 时） | tRPC query、前端 |
| `sendStateSnapshotToSocket()` | 计算（仅当 DB=`rest` 时） | WebSocket full sync |

**同一用户在同一时刻，三个函数可能返回不同状态。**

### 1.3 广播机制不一致（现状）

服务端有两种广播模式：

**Delta sync** (`broadcastStateChange`)：只发 `{ systemState.state }` 一个字段
**Full sync** (`broadcastFullState`)：发完整快照（state + activePomodoro + top3 + dailyState）

| 操作 | delta | full | 风险 |
|------|-------|------|------|
| `pomodoro.start` (tRPC) | ✅ | ❌ | 客户端看不到 activePomodoro 变化 |
| `pomodoro.start` (Socket) | ✅ | ✅ | OK，但与 tRPC 路径行为不同 |
| `pomodoro.complete` | ✅ | ✅ | OK |
| `pomodoro.abort` | ✅ | ✅ | OK |
| Scheduler 自动完成 | ✅ | ❌ | 客户端 activePomodoro 残留（已知 bug） |
| `completeAirlock` | ✅ | ❌ | 客户端 top3 数据不一致 |
| `dailyReset` | ✅ | ❌ | 客户端所有上下文残留 |

### 1.4 客户端状态同步（现状）

三个客户端用三种不同协议接收状态：

| 客户端 | 传输层 | 状态来源 | OVER_REST 来源 |
|--------|--------|---------|---------------|
| Web | Socket.io 客户端 | `STATE_CHANGE` 事件（legacy） → 触发 tRPC refetch | tRPC refetch（依赖 `getTodayWithProgress`） |
| Browser Extension | Raw WebSocket + 手动 EIO v4 | `STATE_CHANGE` + `OCTOPUS_COMMAND` | `STATE_CHANGE` 中的 state 值 |
| iOS | Socket.io 客户端 | `OCTOPUS_COMMAND` (SYNC_STATE) | Policy 广播中的 `overRest.isOverRest` |

**OVER_REST 的传播链路完全不同**：
- Extension：依赖 `STATE_CHANGE` 事件中 state 被计算为 `over_rest`（仅在 full sync 时才会计算）
- iOS：依赖 30 秒轮询的 policy 广播
- Web：依赖 `getTodayWithProgress()` 的 tRPC 查询结果

### 1.5 `withStateValidation` 中间件（现状）

`src/server/trpc.ts:115` 定义了 `withStateValidation(allowedStates)` 中间件，用于在 router 层校验当前状态是否允许某操作。**但没有任何一个 router 导入或使用它。** 意味着：

- LOCKED 状态下可以调用 `pomodoro.start`
- 任何状态下都可以调用任何 mutation
- 状态机定义的"每个状态下允许什么操作"只是文档，代码不执行

### 1.6 竞态条件（现状）

`pomodoro.start` 的执行序列：读（检查冲突）→ 读（检查限额）→ 写（创建番茄）→ 写（更新状态），四步之间没有 Prisma `$transaction`。并发请求可以同时通过检查、各自创建番茄钟。

`completeExpiredPomodoros`（Scheduler）与 `pomodoro.complete`（用户手动）可以同时操作同一个番茄钟，无协调机制。

### 1.7 退出 OVER_REST 的困境（现状）

因为 OVER_REST 是"计算态"，退出条件由 `checkOverRestStatus()` 决定：

```
isOverRest = (now - lastPomodoroEndTime) > shortRestDuration
             AND 在工作时间内
             AND 没有 IN_PROGRESS 番茄钟
```

用户在 OVER_REST 时的唯一出路是开始新番茄钟。没有"结束休息回到可工作状态"的操作——即使用户调用 `updateSystemState('planning')`，下次查询时 `getTodayWithProgress()` 又会把 `planning` 覆盖回 `over_rest`（注：当前代码对 planning 状态不覆盖，但这又导致用户可以通过跳过休息来逃离 over_rest，绕过了设计意图）。

### 1.8 Airlock/LOCKED/PLANNING 的历史包袱（现状）

当前系统有两个与 Airlock 相关的状态：

- **LOCKED**: 04:00 daily reset 后的初始状态，用户必须完成 Airlock（选择 Top 3 任务）才能进入 PLANNING
- **PLANNING**: 完成 Airlock 后的"可工作"状态，可以开始番茄钟、管理任务

实际使用中 Airlock 带来大量问题：
- 每天第一个动作是障碍而非助力，大多直接跳过（`airlockMode` 配置）
- Extension 在 LOCKED 时屏蔽所有非 Dashboard 页面，体验极差
- `completeAirlock`、`skipAirlock` 各自直接写 DB，是两个额外的分散入口点
- LOCKED 和 PLANNING 在 enforcement 行为上几乎一致（除了 Extension 的全屏蔽）
- `airlockStep`、`top3TaskIds` 等 context 增加了状态机复杂度但实际价值有限

**决定：本次重构删除 LOCKED 和 PLANNING 状态，合并为 IDLE。** Airlock/每日规划作为独立的可选功能，不阻塞任何操作。

## 二、时间维度与预期行为模型

### 2.1 时间窗口定义

一天被三个可配置的时间窗口划分：

```
00:00                04:00        09:00              12:00  13:00              18:00        23:00     24:00
  │    昨日延续       │            │   工作时段 1       │      │   工作时段 2       │            │  睡眠   │
  │  (属于昨天的日)    │  非工作时间  │  (workTimeSlots)  │ 午休  │  (workTimeSlots)  │  非工作时间  │(sleep)  │
  │                   │            │                   │      │                   │            │         │
  ├───────────────────┼────────────┼───────────────────┼──────┼───────────────────┼────────────┼─────────┤
  │  dailyReset 4AM   │            │                   │      │                   │            │         │
```

| 窗口 | 配置来源 | 特点 |
|------|---------|------|
| **Work Time** | `UserSettings.workTimeSlots` JSON 数组，每个 slot 有 startTime/endTime (HH:mm) + enabled | 支持多段（如上午+下午），不支持跨午夜 |
| **Sleep Time** | `UserSettings.sleepTimeStart/End` | 支持跨午夜（如 23:00→07:00） |
| **Non-work/Non-sleep** | 上述两者之外的时间 | 无强制行为 |
| **Ad-hoc Focus Session** | `FocusSession` 模型，15-240 分钟 | 在非工作时间创建"临时工作窗口"，覆盖 sleep 可选 |
| **Daily Boundary** | 固定 04:00 | 04:00 前算"昨天"，04:00 后算"今天" |

### 2.2 新状态模型：3 个状态

删除 LOCKED 和 PLANNING，合并为 IDLE。新的状态机只有 **3 个核心状态**：

| 状态 | 含义 | 用户可以做 |
|------|------|----------|
| **IDLE** | 未在番茄钟中（日常基态） | 开始番茄钟、管理任务、AI Chat、每日规划、任何操作 |
| **FOCUS** | 番茄钟进行中 | 完成/中止番茄钟、切换任务 |
| **OVER_REST** | 工作时间内休息超时 | 开始新番茄钟、确认回到 IDLE |

说明：**REST 不再是独立状态**，而是 IDLE 的一个子阶段。番茄钟完成后直接回到 IDLE，系统在后台追踪"距上次番茄钟结束的时间"来判断是否触发 OVER_REST。这消除了 REST→PLANNING 的"跳过休息"这种语义模糊的操作。

### 2.3 预期状态生命周期（一个理想工作日）

```
04:00                     09:00                                              18:00           23:00
  │                         │                                                  │               │
  │  IDLE                   │  IDLE→FOCUS→IDLE(rest)→FOCUS→IDLE(rest)→...      │  IDLE          │
  │  (用户尚未开始工作)       │  (工作时间：番茄钟循环)                            │  (自由时间)     │
  │                         │                                                  │               │
  │  系统行为：无干预        │◄──── 预期：保持番茄钟循环节奏 ────────────────────►│  系统行为：     │
  │  等待用户主动开始        │  偏差纠偏：空闲过久→OVER_REST                      │  无干预         │
  │                         │                                                  │               │
  │                         │  ┌─ IDLE(rest阶段) ─┐                            │               │
  │                         │  │ 0~5min: 正常休息  │                            │               │
  │                         │  │ 5~10min: 标记     │                            │               │
  │                         │  │ 10min+: OVER_REST │                            │               │
  │                         │  └──────────────────┘                            │               │
```

### 2.4 每个时间窗口内的预期 vs 实际

#### 工作时间内（Work Time）

| 预期行为 | 实际可能偏差 | 系统应如何纠偏 |
|---------|------------|-------------|
| IDLE→FOCUS（开始番茄钟） | 用户长时间停留在 IDLE | 空闲检测 → 提醒/干预 |
| FOCUS 持续到番茄钟结束 | 用户中途中止 | 回到 IDLE，记录中止原因 |
| FOCUS→IDLE（短休息） | 用户休息时间过长 | 5min 后 isOverRest，+5min 后进入 OVER_REST |
| IDLE(rest)→FOCUS（开始下一个） | 用户不开始下一个 | OVER_REST 持续加压直到用户行动 |
| 达到日限额后停止 | 用户想继续 | Guard 拦截，允许 override |

#### 非工作时间（Work Time 外，Sleep Time 外）

| 预期行为 | 系统应如何 |
|---------|----------|
| 用户自由活动 | 不干预，不触发 OVER_REST |
| 娱乐模式可用 | 允许开启，有配额限制 |
| 用户想临时工作 | Ad-hoc Focus Session，恢复工作时间行为 |

#### 睡眠时间（Sleep Time）

| 预期行为 | 系统应如何 |
|---------|----------|
| 用户停止使用设备 | 阻断分心 App（Desktop + iOS） |
| 用户有紧急需求 | 允许贪睡，限次数 |
| 用户要加班 | Ad-hoc Focus Session + overrideSleepTime |

### 2.5 纠偏时间线：从 IDLE(rest) 到 OVER_REST

```
番茄钟结束 ──── shortRestDuration (5min) ──── gracePeriod (5min) ──── 无限等待
     │                    │                          │                    │
     │  state=IDLE        │  后台标记                 │  OVER_REST         │
     │  (rest 子阶段)      │  isOverRest=true         │  显式写入 DB       │
     │  正常休息            │  (预警阶段，可选提醒)     │  (全面强制干预)     │
     │                    │                          │                    │
     │  所有客户端：       │  所有客户端：              │  所有客户端：       │
     │  无限制             │  可选：温和提醒            │  统一强制行为       │
```

**与现状的关键区别：**
- OVER_REST 不再是"计算态"，而是由服务端转换引擎显式写入 DB 的真实状态
- 所有客户端通过同一个 full sync 广播即时感知，不再有 30 秒延迟
- 客户端统一使用 OVER_REST 状态做阻断判定，不再各自解读 policy 字段

**ENTER_OVER_REST 的触发机制：**
- **主触发**：番茄钟完成时（FOCUS→IDLE），引擎设置一个 delayed timer（shortRestDuration + gracePeriod 后触发）。如果到时用户仍在 IDLE 且在工作时间内，引擎发送 `ENTER_OVER_REST` 事件
- **兜底**：Scheduler 定期轮询（如每 30 秒），检查 IDLE 状态下 rest 是否超时，补发 `ENTER_OVER_REST`（处理 timer 丢失、服务器重启等情况）
- **惰性检测不再使用**：不在查询时动态计算 over_rest，消除三个函数返回不同结果的问题

### 2.6 状态机图（新设计）

```
                    ┌─────────────────────────────────────────────────┐
                    │              DAILY RESET (04:00)                 │
                    │       任何状态 ──────────────────→ IDLE          │
                    └─────────────────────────────────────────────────┘

                         START_POMODORO
  ┌──────────┐  ─────────────────────────→  ┌──────────┐
  │          │                              │          │
  │   IDLE   │  ←───── ABORT ──────────── │  FOCUS   │
  │          │  ←───── COMPLETE ────────── │          │
  │          │                              └──────────┘
  │          │                                   │
  │          │  START_POMODORO                    │ (番茄钟完成后)
  │          │  ◄───────────────┐                │ (回到 IDLE，后台追踪 rest 时长)
  └──────────┘                  │                │
       │                        │                │
       │ ENTER_OVER_REST        │                │
       │ (引擎在检测到超时      │                │
       │  时显式触发)            │                │
       ▼                        │                │
  ┌───────────┐                 │                │
  │ OVER_REST │ ────────────────┘                │
  │           │  START_POMODORO → FOCUS           │
  │           │                                   │
  │           │  RETURN_TO_IDLE ──→ IDLE          │
  └───────────┘  (带冷却期约束)                    │

  时间维度（叠加层，独立于状态机）:
  ┌────────────────────────────────────────────────┐
  │ Work Time:    OVER_REST 检测生效                 │
  │ Non-work:     OVER_REST 检测关闭                 │
  │ Sleep Time:   独立 sleep 阻断（非状态机状态）      │
  │ Focus Sess:   在非工作时间创建临时工作窗口         │
  └────────────────────────────────────────────────┘
```

**转换表（完整）：**

| 源状态 | 事件 | 目标状态 | Guard | 说明 |
|--------|------|---------|-------|------|
| IDLE | START_POMODORO | FOCUS | count < dailyCap | 开始番茄钟 |
| IDLE | START_TASKLESS_POMODORO | FOCUS | count < dailyCap | 开始无任务番茄钟 |
| FOCUS | COMPLETE_POMODORO | IDLE | — | 番茄钟完成，进入 rest 子阶段 |
| FOCUS | ABORT_POMODORO | IDLE | — | 中止番茄钟 |
| FOCUS | SWITCH_TASK | FOCUS | — | 切换任务（自转换） |
| FOCUS | COMPLETE_CURRENT_TASK | FOCUS | — | 标记当前任务完成 |
| IDLE | ENTER_OVER_REST | OVER_REST | 工作时间内 + rest 超时 | 引擎检测触发 |
| OVER_REST | START_POMODORO | FOCUS | count < dailyCap | 从超时中恢复 |
| OVER_REST | RETURN_TO_IDLE | IDLE | 冷却 10min + 每日限 3 次 | 主动退出超时 |
| OVER_REST | WORK_TIME_ENDED | IDLE | — | 工作时间结束，无条件解除 |
| *任何* | DAILY_RESET | IDLE | — | 每日 04:00 |

### 2.7 各状态下各客户端行为矩阵（目标设计）

#### 桌面端 (Electron)

| 状态 | FocusEnforcer (空闲检测) | 杀分心 App | OverRestEnforcer | RestEnforcer | SleepEnforcer |
|------|------------------------|-----------|-----------------|-------------|--------------|
| **IDLE** | 工作时间内+空闲超阈值→干预 | 不活跃 | 不活跃 | 不活跃* | 独立（基于时间窗口） |
| **FOCUS** | 被抑制（有番茄钟） | **活跃** | 被停止 | 不活跃 | 可被 FocusSession 暂停 |
| **OVER_REST** | 不活跃（被 OverRest 接管） | 不活跃 | **活跃**：杀分心 App + 置顶 | 不活跃 | 独立 |

*RestEnforcer 说明：现有的 REST 强制休息功能（Desktop 关闭工作 App）在 3 状态模型下**有意放弃**。原因：(1) 仅 Desktop 有此功能，其他三个客户端从未实现，实际覆盖率低；(2) IDLE 是基态，不应对用户有强制约束——如果用户选择不休息继续工作，系统通过 OVER_REST 来纠偏，而不是在 IDLE 阶段阻断。后续如需恢复，可通过 IDLE context 中的 `lastPomodoroEndTime` 字段让 Desktop 在 rest 子阶段可选启用。

#### 浏览器扩展 (Chrome Extension)

| 状态 | 状态级限制 | declarativeNetRequest | 娱乐站点阻断 | 黑名单增强阻断 |
|------|----------|----------------------|-------------|-------------|
| **IDLE** | 无 | 不活跃 | 活跃（非娱乐模式时） | 工作时间内无番茄→阻断黑名单 |
| **FOCUS** | 无 | **活跃**：网络层拦截黑名单域名 | 活跃 | 有番茄钟时跳过增强阻断 |
| **OVER_REST** | **全部非 Dashboard 页重定向到超休屏保页** | 不活跃 | 被状态限制覆盖 | 被状态限制覆盖 |

#### iOS

| 状态 | Screen Time 阻断 | 阻断原因 | 说明 |
|------|-----------------|---------|------|
| **IDLE** | ❌ 无 | — | |
| **FOCUS** | ✅ 阻断 | `'focus'` | 检测 activePomodoro |
| **OVER_REST** | ✅ 阻断 | `'over_rest'` | 检测 state === OVER_REST |
| **Sleep 窗口** | ✅ 阻断 | `'sleep'` | 独立于状态机 |

优先级链：`temporaryUnblock > focus > over_rest > sleep > null`

#### Web 前端

| 状态 | 限制 |
|------|------|
| **IDLE** | 无（每日规划为独立可选入口） |
| **FOCUS** | 无 |
| **OVER_REST** | 无（Web 不做客户端 enforcement，由 Extension 覆盖浏览器场景） |

### 2.8 与现状的关键变化

| 方面 | 现状 | 新设计 |
|------|------|--------|
| 状态数量 | 5 个（LOCKED/PLANNING/FOCUS/REST/OVER_REST） | **3 个（IDLE/FOCUS/OVER_REST）** |
| 初始状态 | LOCKED（需要完成 Airlock 才能工作） | **IDLE（立即可工作）** |
| REST | 独立状态，需要显式"跳过休息"才能回到 PLANNING | **IDLE 的子阶段**，番茄钟完成自动回到 IDLE |
| OVER_REST | 虚拟状态（查询时计算，不写 DB） | **真实状态（引擎显式写入 DB）** |
| OVER_REST 退出 | 只能开始新番茄钟 | **可以开始番茄钟，也可以 RETURN_TO_IDLE（带约束）** |
| Airlock | LOCKED→PLANNING 的必经之路 | **删除。每日规划作为 IDLE 中的独立可选功能** |
| Extension LOCKED 屏蔽 | 所有非 Dashboard 页被重定向 | **不再存在 LOCKED 状态，消除此行为** |
| 数据迁移 | DB 中存储 locked/planning/focus/rest | **过渡期兼容旧值**：locked/planning/rest 均映射为 idle；新写入只用 idle/focus/over_rest |

### 2.9 每日规划（Daily Planning）的新定位

Airlock 删除后，每日规划功能降级为一个**可选的独立入口**：

- 不阻塞任何操作——用户可以不做规划直接开始番茄钟
- 可以在一天中的任何时间进入/退出规划界面
- Top 3 任务选择保留为可选功能，不再作为状态转换的 guard
- 未来可以由 AI 在合适时机主动建议规划（如晨间对话），但不强制

### 2.10 未来考虑：工作时间内工作量不足

当前系统不追踪"工作时间内是否完成了足够的工作量"。未来可能需要：

| 场景 | 预期行为 | 当前状态 |
|------|---------|---------|
| 工作时间快结束但番茄钟完成数远低于预期 | 提醒/延长工作时间/限制切换到自由模式 | 无——工作时间结束 over_rest 自动解除 |
| 连续多天未完成日目标 | 调整目标或提供辅导 | progress-calculation.service 有 pressure 计算，但无联动 |
| 非工作时间补工作 | 允许但建议设置 Ad-hoc Focus Session | 可以直接开番茄钟，无特殊处理 |

此类需求在本次重构中作为**扩展点预留**，不在 scope 内实现。

## 三、问题清单（完整）

### P1: 无统一状态转换引擎 [架构]

**现象**: 8+ 个调用点各自调用 `updateSystemState()`，各自判断转换合法性。
**后果**: 非法转换无人拦截、相同逻辑多处重复（start pomodoro 在 tRPC 和 Socket 两个路径各实现一遍）。
**根因**: XState 定义了状态机但运行时不执行，状态只是一个 DB 字符串。

### P2: OVER_REST 是虚拟状态 [架构]

**现象**: DB 里永远是 `rest`，`over_rest` 是查询时临时计算的。
**后果**: 三个读取函数返回不同结果；30 秒轮询延迟；无法用 DB 查询历史上的 OVER_REST 时段；退出条件不可控。
**根因**: 没人调用 `ENTER_OVER_REST`，设计初衷是"计算态"但导致了不一致。

### P3: 广播不一致 [同步]

**现象**: 部分操作只发 delta（只含 state 字段），部分发 full sync（含完整上下文）。
**后果**: 客户端 `activePomodoro` 残留、`top3Tasks` 不一致、跨设备状态不同步。
**根因**: `broadcastStateChange` 和 `broadcastFullState` 由各调用方自行决定用哪个，无统一规则。

### P4: 状态守卫缺失 [安全]

**现象**: `withStateValidation` 定义了但从未使用。
**后果**: 任何状态下都可以调用任何 mutation，状态机的"每个状态允许什么事件"形同虚设。
**根因**: 中间件写好后忘了接入；或者因为"反正大部分时候不会出问题"而搁置。

### P5: 竞态条件 [可靠性]

**现象**: 读-检查-写序列无事务保护。
**后果**: 并发创建多个 IN_PROGRESS 番茄钟；Scheduler 和用户同时完成同一番茄钟导致状态混乱。
**根因**: 所有 DB 操作都是独立 Prisma 调用，没有 `$transaction`。

### P6: 三客户端协议碎片化 [同步]

**现象**: Web 用 legacy `STATE_CHANGE`，Extension 用 raw WebSocket + EIO v4 手动解析，iOS 用 Octopus `SYNC_STATE`。
**后果**: 同一个服务端状态变更，三个客户端通过不同路径、不同延迟感知到不同结果。OVER_REST 的传播链路完全不同。
**根因**: 协议从 legacy 逐步演进到 Octopus，但未完成统一迁移。

### P7: 不可观测 [运维]

**现象**: 状态转换没有日志。出问题后只能靠猜测和代码阅读定位。
**后果**: 无法回答"用户 X 在时间 T 为什么从 A 状态变到 B 状态"。
**根因**: `updateSystemState()` 只写 DB + 广播，没有记录转换事件。

### P8: 客户端行为不对称 [一致性]

**现象**: 同一个状态在不同客户端触发完全不同的行为。
**后果**:
- OVER_REST 时 iOS 比 Desktop/Extension 早 5 分钟开始屏蔽
- REST 时仅 Desktop 强制休息，其他客户端可以继续工作
- Web 在所有状态下无任何强制限制
**根因**: 各客户端独立实现 enforcement 逻辑，没有基于统一的"每状态行为规范"。

### P9: OVER_REST 无主动退出机制 [体验]

**现象**: 用户在 OVER_REST 中唯一的出路是开始新番茄钟。
**后果**: 如果用户不想立刻开始番茄钟（如需要先整理任务、处理紧急事情），只能等待工作时间结束或强行开始一个不需要的番茄钟。
**根因**: 状态机设计没有 OVER_REST→可工作状态 的主动退出路径。

### P10: 时间窗口切换无联动 [架构] — 本次部分缓解

**现象**: 工作时间开始/结束、睡眠时间开始/结束时，状态机不感知也不响应。
**后果**:
- 工作时间结束 over_rest 检测静默关闭，用户可能不知道为什么突然不被屏蔽了
- 睡眠时间与状态机完全独立运行，两套阻断逻辑可能冲突
**根因**: 时间窗口是"叠加层"，与状态机之间没有事件通道。
**本次缓解**: 3 状态模型删除 LOCKED，消除了"工作时间开始用户还在 LOCKED"的问题。OVER_REST 显式化后，工作时间结束时引擎可以主动发 `RETURN_TO_IDLE` 解除屏蔽。完整的时间窗口联动（Scheduler 发 WORK_TIME_STARTED 等事件）属于后续迭代。

### P11: LOCKED/PLANNING/REST 状态冗余 [复杂度]

**现象**: 5 个状态中有 3 个（LOCKED、PLANNING、REST）在用户行为能力上几乎等价——都是"没在番茄钟中"。
**后果**: 转换路径多（LOCKED→PLANNING、REST→PLANNING、OVER_REST→FOCUS），每个都是独立入口点；Airlock 是额外摩擦。
**根因**: 初始设计追求仪式感，但实际使用中仪式感变成了障碍。

## 四、目标

### G1: 单一状态转换入口

所有状态转换必须经过一个统一的转换引擎。该引擎：
- 校验转换合法性（基于当前状态 + 事件 + guards）
- 执行转换副作用（计数器更新、上下文清理等）
- 持久化新状态到 DB（在事务内）
- 统一广播（full sync）
- 记录转换日志

外部代码不再直接调用 `updateSystemState()`，而是向引擎发送事件。

### G2: 简化为 3 状态模型

删除 LOCKED、PLANNING、REST，合并为 IDLE。状态机只有 **IDLE → FOCUS → IDLE ↔ OVER_REST** 三个状态。减少转换路径数量，降低系统复杂度。

### G3: OVER_REST 显式化

OVER_REST 作为 DB 中的真实状态存在，通过引擎显式的 `ENTER_OVER_REST` 事件进入，通过 `START_POMODORO` 或 `RETURN_TO_IDLE` 事件退出。消除"查询时计算"的虚拟态。

### G4: 统一广播

所有状态转换后统一使用 full sync 广播。消除 delta/full 不一致问题。

### G5: 状态守卫生效

转换引擎内置 guard 校验。在不允许的状态下触发事件会返回明确的错误，而不是默默执行。

### G6: 事务保护

状态转换的读-检查-写序列在 Prisma `$transaction` 内完成，消除竞态。

### G7: 可观测性

每次状态转换记录结构化日志：`{ timestamp, userId, fromState, toState, event, trigger, context }`。支持在 DB 中查询用户的状态转换历史。

### G8: 客户端可渐进迁移

服务端改造后，三个客户端可以渐进适配。短期内保持 legacy + Octopus 双协议兼容，长期统一到 Octopus。

### G9: 统一客户端行为规范

定义每个状态在每个客户端的标准行为（enforcement matrix），作为各客户端实现的 contract。消除当前的行为不对称。

### G10: OVER_REST 可主动退出

增加 `RETURN_TO_IDLE` 事件，允许用户从 OVER_REST 回到 IDLE。约束条件：
- 进入 OVER_REST 后至少等待 **10 分钟**（冷却期）才能主动退出
- 每日最多 **3 次**主动退出
- 超过限制后只能通过开始番茄钟退出

## 五、约束

1. **不重写客户端**：服务端重构后客户端行为应自动改善（full sync 消除残留数据），客户端改造作为独立后续工作
2. **渐进式迁移**：可以分阶段替换各个调用点，每个阶段系统可正常运行
3. **兼容现有测试**：现有 Vitest 和 E2E 测试在重构后仍通过（或同步更新）
4. **每日规划功能保留**：Airlock 删除但 Top 3 选择、每日规划等功能降级为可选入口，不丢失功能

## 六、Scope 边界说明

### In Scope

- 服务端状态转换引擎（核心）
- 服务端广播统一（full sync）
- OVER_REST 显式化（DB 写入 + 触发机制）
- 状态值迁移（locked/planning/rest → idle）
- **Web 前端状态值适配**：前端代码中硬编码了 locked/planning/rest 的判断逻辑（如路由守卫、UI 条件渲染），状态从 5 变 3 后这些必须同步修改才能正常工作。范围限于状态值映射/替换，不包括组件架构重构
- Airlock 相关代码移除/降级

### Out of Scope

1. 新增状态（如 READY、轻保护模式）——属于后续产品迭代
2. AI 行为教练——属于独立 spec
3. 客户端协议统一（Extension 从 raw WS 迁移到 Socket.io）——属于独立工作
4. iOS/Extension/Desktop 的 blocking 逻辑重写——本次在服务端定义规范，客户端逐步适配
5. 前端 `usePomodoroMachine` hook 架构重构——属于独立工作（本次只做状态值适配）
6. 工作量不足检测——作为扩展点预留
7. 完整的时间窗口联动（WORK_TIME_STARTED/ENDED 事件）——P10 在本次部分缓解，完整方案后续迭代
