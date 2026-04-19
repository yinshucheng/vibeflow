# 八爪鱼协议统一化 - Technical Design

> **Rev 3** — 新增数据流统一（消除 Web 轮询）、协议层 SDK（组合式）、State Manager。主要变更：增加 §1.5 数据流碎片化诊断、§2.10 数据流统一规范、§2.11 协议层 SDK（组合式函数）、更新实施阶段加入 Phase D。

## 1. 现状分析

### 1.1 协议类型定义碎片化

**4 个独立的类型定义文件：**

| 文件 | 行数 | 角色 |
|------|------|------|
| `src/types/octopus.ts` | ~1744 | 服务端 canonical（含 Zod schemas） |
| `vibeflow-ios/src/types/octopus.ts` | ~384 | iOS 子集拷贝 |
| `vibeflow-desktop/electron/types/index.ts` | ~718 | Desktop 独立定义（含 IPC + Electron 类型） |
| `vibeflow-extension/src/types/index.ts` | ~707 | Extension 独立定义（含 legacy 类型） |

**EventType 差异：**

| EventType | Server | iOS | Desktop | Extension |
|-----------|--------|-----|---------|-----------|
| `ACTIVITY_LOG` | Y | Y | Y | Y |
| `STATE_CHANGE` | Y | Y | Y | - |
| `USER_ACTION` | Y | Y | Y | - |
| `HEARTBEAT` | Y | Y | Y | Y |
| `BROWSER_ACTIVITY` | Y | Y | - | Y |
| `BROWSER_SESSION` | Y | Y | - | Y |
| `TAB_SWITCH` | Y | Y | - | Y |
| `BROWSER_FOCUS` | Y | Y | - | Y |
| `ENTERTAINMENT_MODE` | Y | Y | - | Y |
| `WORK_START` | Y | Y | - | Y |
| `CHAT_MESSAGE` | Y | Y | - | - |
| `CHAT_ACTION` | Y | Y | - | - |
| `CHAT_HISTORY_REQUEST` | Y | Y | - | - |
| `TIMELINE_EVENT` | Y | Y | - | - |
| `BLOCK_EVENT` | Y | Y | - | - |
| `INTERRUPTION_EVENT` | Y | Y | - | - |
| `DESKTOP_APP_USAGE` | - | - | Y | - |
| `DESKTOP_IDLE` | - | - | Y | - |
| `DESKTOP_WINDOW_CHANGE` | - | - | Y | - |

**关键问题**: Desktop 的 `DESKTOP_*` 事件未纳入服务端 canonical EventType，Extension 使用 `OctopusEventType` 而非 `EventType` 命名。

**CommandType 差异：**

| CommandType | Server | iOS | Desktop | Extension |
|-------------|--------|-----|---------|-----------|
| `SYNC_STATE` | Y | Y | Y | Y |
| `EXECUTE_ACTION` | Y | Y | Y | Y |
| `UPDATE_POLICY` | Y | Y | Y | Y |
| `SHOW_UI` | Y | Y | Y | Y |
| `ACTION_RESULT` | - | **Y** | - | - |
| `CHAT_RESPONSE` | Y | Y | - | - |
| `CHAT_TOOL_CALL` | Y | Y | - | - |
| `CHAT_TOOL_RESULT` | Y | Y | - | - |
| `CHAT_SYNC` | Y | Y | - | - |

**关键问题**: `ACTION_RESULT` 是 iOS 独创的 RPC 响应类型，服务端的 canonical CommandType 遗漏了它（但 socket.ts 实际在发送）。

**Policy 类型碎片化：**

| 字段 | Server `Policy` | iOS `Policy` | Desktop `DesktopPolicy` | Extension `OctopusPolicy` |
|------|----------------|-------------|------------------------|--------------------------|
| `version` | Y | Y | Y | Y |
| `blacklist` | Y | Y | - | Y |
| `whitelist` | Y | Y | - | Y |
| `enforcementMode` | Y | Y | Y | Y |
| `workTimeSlots` | Y (`TimeSlot`) | Y (`TimeSlot`) | Y (`PolicyTimeSlot`) | Y (`OctopusTimeSlot`) |
| `skipTokens` | Y | Y | Y (`PolicySkipTokenConfig`) | Y (`SkipTokenConfig`) |
| `distractionApps` | Y | Y | Y (`PolicyDistractionApp`) | Y (`DistractionApp`) |
| `updatedAt` | Y | Y | Y | Y |
| `sleepTime` | Y | Y | Y (`PolicySleepTime`) | - |
| `overRest` | Y | Y | Y (`PolicyOverRest`) | - |
| `adhocFocusSession` | Y | Y | Y (`PolicyAdhocFocusSession`) | - |
| `temporaryUnblock` | Y | Y | - | - |
| `workTime` | Y | Y | - | - |
| `restEnforcement` | server only | - | Y (`PolicyRestEnforcement`) | - |
| `healthLimit` | server only | - | Y | - |

**关键问题**:
- 同样的数据结构，Desktop 命名 `PolicyTimeSlot`、Extension 命名 `OctopusTimeSlot`、iOS/Server 命名 `TimeSlot`
- Extension 的 `PolicyCache` 完全不同：混合了 Policy 字段 + 运行时状态（`globalState`, `sessionWhitelist`, `entertainmentModeActive` 等）
- Desktop 和 Server 有 `restEnforcement`、`healthLimit`，但 iOS 没有
- **Server/iOS/Desktop 的 Policy 也混入了运行时状态**（如 `SleepTimePolicy.isCurrentlyActive`、`OverRestPolicy.isOverRest`），这与批评 Extension 的 PolicyCache 实质上是同一问题

**BaseEvent / BaseCommand 命名差异：**

| 概念 | Server | iOS | Desktop | Extension |
|------|--------|-----|---------|-----------|
| Base Event | `BaseEvent` | `BaseEvent` | `BaseEvent` | `OctopusBaseEvent` |
| Base Command | `BaseCommand` | `BaseCommand` | `BaseCommand` | `OctopusBaseCommand` |
| Event Union | `OctopusEvent` | `OctopusEvent` | `DesktopEvent` | `OctopusEvent` |
| Command Union | `OctopusCommand` | `OctopusCommand` | `DesktopCommand` | `OctopusCommand` |

### 1.2 通信层差异

**传输层：**

| 客户端 | 传输库 | 连接方式 | 认证 |
|--------|--------|----------|------|
| iOS | socket.io-client | WebSocket only | Token in `auth` payload |
| Desktop | socket.io-client | WebSocket + polling | Token in `auth` payload |
| Extension | Raw WebSocket + 手动 Engine.IO v4 | `ws://host/socket.io/?EIO=4&transport=websocket` | Token in Socket.io CONNECT packet |
| Web | 服务端同进程 | N/A | NextAuth cookie |

**重连策略：**

| 客户端 | 策略 | 最大尝试 | 最大延迟 |
|--------|------|----------|----------|
| iOS | 指数退避 | 无限 | 30s |
| Desktop | 指数退避 (10次) + 慢重试 (60s) | 10 + 无限 | 30s + 60s |
| Extension | 指数退避 | 5 | 自动 (MV3 alarm 唤醒) |

**心跳：**

| 客户端 | 间隔 | Payload 差异 |
|--------|------|-------------|
| iOS | 30s | `capabilities`, `uptime`, `localStateHash` |
| Desktop | 30s | + `focusEnforcerState { isMonitoring, isWithinWorkHours, isPomodoroActive, idleSeconds }` |
| Extension | 30s | 同 iOS 格式 |

**离线队列：**

| 客户端 | 存储 | 容量 |
|--------|------|------|
| iOS | 无 (依赖 socket.io 内置 buffer) | N/A |
| Desktop | electron-store | 无限制 |
| Extension | chrome.storage.local | 1000 events |

### 1.3 服务端双格式广播

`src/server/socket.ts` 当前同时发送新旧两种格式：

**策略更新时** (`broadcastPolicyUpdate`):
1. `OCTOPUS_COMMAND` (UPDATE_POLICY) — 新协议
2. `policy:update` — Desktop legacy
3. `SYNC_POLICY` — Extension legacy

**状态变更时** (`broadcastFullState`):
1. `OCTOPUS_COMMAND` (SYNC_STATE) — 新协议
2. `STATE_CHANGE` — Desktop/Extension legacy

**执行命令时** (`sendExecuteCommand`):
1. `OCTOPUS_COMMAND` (EXECUTE_ACTION) — 新协议
2. `EXECUTE` — Extension legacy

**需清理的 legacy 事件**:
- `ServerToClientEvents`: `SYNC_POLICY`, `STATE_CHANGE`, `EXECUTE`, `ENTERTAINMENT_MODE_CHANGE`, `habit:*`
- `ClientToServerEvents`: `ACTIVITY_LOG`, `URL_CHECK`, `USER_RESPONSE`, `REQUEST_POLICY`, `TIMELINE_EVENT`, `TIMELINE_EVENTS_BATCH`, `BLOCK_EVENT`, `INTERRUPTION_EVENT`

### 1.4 各端独有的通信模式

**iOS ACTION_RESULT RPC 模式** (其他端缺失):
```
iOS: USER_ACTION(optimisticId) → Server → ACTION_RESULT(optimisticId) → iOS
```
Desktop/Extension 目前不使用这种模式，但作为统一 RPC 机制应该推广到全端。

**Extension PolicyCache** (混合类型):
Extension 的 `PolicyCache` 把 Policy 字段和运行时状态（`globalState`, `sessionWhitelist`, `entertainmentModeActive` 等）混在一起，需要拆分为 `PolicyConfig`（协议层）+ `ExtensionRuntimeState`（本地状态）。

### 1.5 数据流碎片化 — Web 轮询 vs iOS 推送

> **Rev 3 新增**。"Web 侧没问题、iOS 侧有问题"的根因之一：两端用完全不同的机制获取同一份数据。

**iOS 的数据流（正确的 — 纯推送模型）**:
```
WS OCTOPUS_COMMAND → Zustand store → UI 自动更新
```
iOS 端完全依赖 WebSocket 推送，没有任何 tRPC 调用或 HTTP 轮询。所有 `setInterval` 要么是心跳/keepalive（必要的），要么是本地 UI 倒计时。

**Web 的数据流（有问题的 — 推送 + 轮询双通道冗余）**:
```
WS STATE_CHANGE → 部分 state 更新（不完整）
+ tRPC refetchInterval → React Query cache → UI 更新  ← 冗余且是实际主通道
```

**Web 端 tRPC refetchInterval 轮询清单（`src/` 目录）**:

| 文件 | 查询 | 间隔 | 能否改为 WS 推送？ |
|------|------|------|---|
| `tray-sync-provider.tsx` | `dailyState.getToday` | **5s** | 能 — 状态变更已通过 WS 广播 |
| `tray-sync-provider.tsx` | `overRest.checkStatus` | **5s / 30s** | 能 — 服务端已有 overRest 检查并广播 |
| `tray-sync-provider.tsx` | `dailyState.getRestStatus` | **5s** | 能 — 推送 rest 开始时间，本地计算 |
| `tray-sync-provider.tsx` | `pomodoro.getCurrent` | 10s | 能 — 番茄钟状态变更本来就走 WS |
| `tray-sync-provider.tsx` | `sleepTime.isInSleepTime` | 60s | 能 — 时间窗口在 PolicyState 中 |
| `tray-sync-provider.tsx` | `healthLimit.checkLimit` | 60s | 能 — 服务端已有此逻辑 |
| `focus-session-control.tsx` | `focusSession.getActiveSession` | 10s | 能 — 焦点会话是离散事件 |
| `header.tsx` | `dailyState.getToday` | 30s | 能 — 与 tray-sync 重复 |
| `dashboard-status.tsx` | `dailyState.getCurrentStatus` | 30s | 能 — 派生自已推送的状态 |
| `daily-progress-card.tsx` | `dailyState.getDailyProgress` | 60s | 能 — pomodoro 完成时推送即可 |
| `goal-risk-suggestions.tsx` | `dailyState.getDailyProgress` | 60s | 与上一行重复 |
| `demo-mode-banner.tsx` | `demoMode.getDemoModeState` | 30s | 能 — 但优先级低 |

**影响量化**:
- **当前**: 每 5 秒 3 个 HTTP 请求 + 每 10 秒 2 个 + 每 30 秒 3 个 + 每 60 秒 3 个 ≈ **~50 HTTP 请求/分钟**
- **统一后**: 仅页面加载时的一次性 tRPC 查询，持续状态由 WS 推送 ≈ **~0 HTTP 请求/分钟**（轮询部分）

**根因**: Web 端在引入 WebSocket 之前就有 tRPC 查询，加 WS 后没有彻底清理。注释甚至写着 "WebSocket handles real-time updates, polling is fallback" — 但 5 秒间隔的 "fallback" 本质上就是主通道。而 iOS 从一开始就是纯 WS 架构，不存在这个历史包袱。

**这直接导致跨端行为不一致**: Web 端靠轮询拿到数据（延迟 0–5s），iOS 端靠 WS 推送（延迟 < 100ms），同一个状态变更在两端的感知时间不同。如果 WS 推送的 payload 有问题（比如缺少某个字段），Web 端被轮询兜底了不会暴露 bug，但 iOS 端直接出问题。

---

## 2. 统一方案

### 2.1 目录结构

```
vibeflow/
├── packages/
│   └── octopus-protocol/
│       ├── package.json                  # @vibeflow/octopus-protocol
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts                  # Barrel export
│           ├── types/
│           │   ├── enums.ts              # 所有 union types
│           │   ├── events.ts             # BaseEvent + 所有事件接口
│           │   ├── commands.ts           # BaseCommand + 所有命令接口
│           │   ├── policy.ts             # PolicyConfig + PolicyState + 子类型
│           │   ├── state.ts              # FullState, StateDelta, SystemState
│           │   ├── actions.ts            # UserActionType, ActionResultPayload
│           │   ├── chat.ts               # Chat 事件/命令类型
│           │   ├── socket-events.ts      # ServerToClientEvents, ClientToServerEvents
│           │   └── common.ts             # TimeSlot, DistractionApp 等共享原语
│           ├── validation/
│           │   └── schemas.ts            # Zod schemas（独立导出路径，Extension 不引入）
│           ├── protocol/
│           │   ├── command-handler.ts     # Command 分发 + 类型窄化
│           │   ├── state-manager.ts       # State 管理（SYNC_STATE → 本地状态更新）
│           │   ├── action-rpc.ts          # USER_ACTION → ACTION_RESULT RPC
│           │   ├── event-builder.ts       # Event 构造 + sequenceNumber
│           │   └── heartbeat.ts           # Heartbeat payload 构造
│           └── constants.ts              # 协议版本、超时常量
```

**注意：`protocol/` 目录是组合式 SDK**（非抽象类）。各端保留自己的 websocket 传输代码（battle-tested），但协议逻辑（command 分发、state 合并、RPC 管理）使用共享实现。理由见 [§2.7](#27-关于-sdk-的决策组合式协议层非抽象类) 和 [§2.10](#210-组合式协议层-sdk)。

### 2.2 Workspace 配置

根 `package.json` 添加 workspaces:
```json
{
  "workspaces": ["packages/*"]
}
```

各端通过 workspace 依赖引入:
```json
{
  "dependencies": {
    "@vibeflow/octopus-protocol": "workspace:*"
  }
}
```

**Extension 特殊处理**: 由于 Extension 不使用 bundler（直接 tsc），通过 `tsconfig.json` 的 `paths` 或 `references` 指向共享包源码。

**iOS Metro 特殊处理**: `metro.config.js` 需要配置：
- `watchFolders`: 指向 `../packages/octopus-protocol`
- `resolver.nodeModulesPaths`: 确保共享包的依赖（如 Zod）能正确 resolve
- 如果共享包 package.json 使用 `exports` 字段，需要 `resolver.unstable_enablePackageExports: true`
- Metro 需要能转译 node_modules 外的 TypeScript 源码（通过 `transformer` 配置）

**关键验证点**: Phase A 末尾必须验证 iOS Metro + Extension tsc + Desktop Electron 三端都能正确 resolve 和编译共享包。这是后续所有 Phase 的前置条件。

### 2.3 统一类型设计

#### 2.3.1 Enums

```typescript
// packages/octopus-protocol/src/types/enums.ts

/** 协议版本，用于客户端兼容性检查 */
export const PROTOCOL_VERSION = 2;

export type ClientType = 'web' | 'desktop' | 'browser_ext' | 'mobile' | 'api';

// --- Events (Tentacle → Vibe Brain) ---

export type EventType =
  // 通用事件
  | 'HEARTBEAT'
  | 'USER_ACTION'
  | 'STATE_CHANGE'
  | 'ACTIVITY_LOG'
  // 浏览器事件
  | 'BROWSER_ACTIVITY'
  | 'BROWSER_SESSION'
  | 'TAB_SWITCH'
  | 'BROWSER_FOCUS'
  | 'ENTERTAINMENT_MODE'
  | 'WORK_START'
  // 桌面事件
  | 'DESKTOP_APP_USAGE'
  | 'DESKTOP_IDLE'
  | 'DESKTOP_WINDOW_CHANGE'
  // 通用追踪事件
  | 'TIMELINE_EVENT'
  | 'BLOCK_EVENT'
  | 'INTERRUPTION_EVENT'
  // 聊天事件
  | 'CHAT_MESSAGE'
  | 'CHAT_ACTION'
  | 'CHAT_HISTORY_REQUEST';

// --- Commands (Vibe Brain → Tentacle) ---

export type CommandType =
  | 'SYNC_STATE'
  | 'EXECUTE_ACTION'
  | 'UPDATE_POLICY'
  | 'SHOW_UI'
  | 'ACTION_RESULT'
  // 聊天命令
  | 'CHAT_RESPONSE'
  | 'CHAT_TOOL_CALL'
  | 'CHAT_TOOL_RESULT'
  | 'CHAT_SYNC';

// --- Actions ---

export type ActionType =
  // Desktop
  | 'CLOSE_APP' | 'HIDE_APP' | 'BRING_TO_FRONT' | 'SHOW_NOTIFICATION'
  // Browser
  | 'CLOSE_TAB' | 'REDIRECT_TAB' | 'INJECT_OVERLAY' | 'ADD_SESSION_WHITELIST'
  // Mobile
  | 'SEND_PUSH' | 'PLAY_SOUND' | 'VIBRATE';

export type CommandPriority = 'low' | 'normal' | 'high' | 'critical';
export type ConnectionQuality = 'good' | 'degraded' | 'poor';
export type EnforcementMode = 'strict' | 'gentle';
export type ActivityCategory = 'productive' | 'neutral' | 'distracting';
export type ActivitySource = 'browser' | 'desktop_app' | 'mobile_app';
export type NavigationType = 'link' | 'typed' | 'reload' | 'back_forward' | 'other';
export type SearchEngine = 'google' | 'bing' | 'duckduckgo' | 'other';
export type BrowserFocusState = 'focused' | 'blurred' | 'unknown';
```

#### 2.3.2 Policy 拆分为 Config + State

> **Review 修正**: 原方案的 `Policy` 接口混入了 `isCurrentlyActive`、`isOverRest` 等运行时计算值，与批评 Extension PolicyCache 的立场自相矛盾。修正为 Config（纯用户配置，低频变化） + State（运行时计算值，随状态变化）两层。

```typescript
// packages/octopus-protocol/src/types/policy.ts

// ===== 共享原语 =====

export interface TimeSlot {
  dayOfWeek: number;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

export interface SkipTokenConfig {
  remaining: number;
  maxPerDay: number;
  delayMinutes: number;
}

export interface DistractionApp {
  bundleId: string;
  name: string;
  action: 'force_quit' | 'hide_window';
}

export interface EnforcementApp {
  bundleId: string;
  name: string;
}

// ===== PolicyConfig — 纯用户配置，变化频率低 =====

export interface SleepTimeConfig {
  enabled: boolean;
  startTime: string;  // HH:mm
  endTime: string;    // HH:mm
  enforcementApps: EnforcementApp[];
}

export interface AdhocFocusSessionConfig {
  active: boolean;
  endTime: number;
  overridesSleepTime?: boolean;
}

export interface WorkTimeConfig {
  enabled: boolean;
  slots: { startTime: string; endTime: string }[];
}

export interface RestEnforcementConfig {
  workApps: EnforcementApp[];
  actions: string[];
  graceDurationMinutes: number;
}

export interface HealthLimitConfig {
  type: '2hours' | 'daily';
  message: string;
  repeating?: boolean;
  intervalMinutes?: number;
}

/** 用户配置层 — 变化频率低（仅用户修改设置时变化） */
export interface PolicyConfig {
  version: number;
  updatedAt: number;
  blacklist: string[];
  whitelist: string[];
  enforcementMode: EnforcementMode;
  workTimeSlots: TimeSlot[];
  skipTokens: SkipTokenConfig;
  distractionApps: DistractionApp[];
  sleepTime?: SleepTimeConfig;
  adhocFocusSession?: AdhocFocusSessionConfig;
  temporaryUnblock?: { active: boolean; endTime: number };
  workTime?: WorkTimeConfig;
  restEnforcement?: RestEnforcementConfig;
  healthLimit?: HealthLimitConfig;
}

// ===== PolicyState — 运行时计算值，随状态变化 =====

/** 运行时状态层 — 服务端每次状态变更时重新计算 */
export interface PolicyState {
  /** 当前是否在睡眠时间窗口内 */
  isSleepTimeActive: boolean;
  /** 是否正在贪睡 */
  isSleepSnoozed: boolean;
  /** 贪睡结束时间 */
  sleepSnoozeEndTime?: number;
  /** 是否处于 OVER_REST 状态 */
  isOverRest: boolean;
  /** 超休息分钟数 */
  overRestMinutes: number;
  /** OVER_REST 需要执行的 enforcement apps */
  overRestEnforcementApps: EnforcementApp[];
  /** OVER_REST 是否需要将应用前置 */
  overRestBringToFront: boolean;
  /** 当前是否在工作时间 */
  isWithinWorkHours: boolean;
  /** 是否在休息期间 */
  isInRestPeriod: boolean;
  /** REST enforcement 是否激活 */
  isRestEnforcementActive: boolean;
  /** REST enforcement grace */
  restGrace?: { available: boolean; remaining: number };
}

/** 服务端发送给客户端的完整 Policy = Config + State */
export interface Policy {
  config: PolicyConfig;
  state: PolicyState;
}
```

**好处**:
- 客户端明确知道哪些值是稳定配置、哪些是动态计算的
- 未来可以只在 state 变化时增量推送 `PolicyState`，config 不变时不重复传输
- 消除了原方案中"批评 Extension 混入运行时状态，自己也这么做"的自相矛盾

#### 2.3.3 统一 BaseEvent / BaseCommand

```typescript
// packages/octopus-protocol/src/types/events.ts

export interface BaseEvent {
  eventId: string;
  eventType: EventType;
  userId: string;
  clientId: string;
  clientType: ClientType;
  timestamp: number;
  /** 各端独立递增的序列号，用于检测丢失事件（gap 只做日志告警，不做补发） */
  sequenceNumber: number;
}

// 各事件接口继承 BaseEvent，payloads 在各文件中定义
// HeartbeatEvent, UserActionEvent, BrowserActivityEvent, DesktopAppUsageEvent, etc.
```

```typescript
// packages/octopus-protocol/src/types/commands.ts

export interface BaseCommand {
  commandId: string;
  commandType: CommandType;
  targetClient: ClientType | 'all';
  priority: CommandPriority;
  requiresAck: boolean;
  expiryTime?: number;
  createdAt: number;
}

// SyncStateCommand, UpdatePolicyCommand, ExecuteActionCommand,
// ActionResultCommand, ShowUICommand, Chat commands, etc.
```

#### 2.3.4 Habit 事件迁移

> **Review 补充**: 当前 `habit:created`、`habit:updated` 等是独立 Socket.io 事件（破坏 Octopus 协议），需纳入统一协议。

**方案**: 不新增 CommandType。Habit 数据变更通过现有的 `SYNC_STATE` (delta sync) 推送：

```typescript
// delta sync 示例
{
  commandType: 'SYNC_STATE',
  payload: {
    syncType: 'delta',
    version: 42,
    delta: {
      changes: [
        { path: 'habits', operation: 'set', value: [...updatedHabitList] }
      ]
    }
  }
}
```

Habit reminder 通知复用 `SHOW_UI` command：

```typescript
{
  commandType: 'SHOW_UI',
  payload: {
    uiType: 'notification',
    content: { title: '习惯提醒', body: '该喝水了', habitId: 'xxx' },
    dismissible: true
  }
}
```

### 2.4 统一 Socket.io 事件接口

清理后，服务端只保留以下事件通道：

```typescript
// packages/octopus-protocol/src/types/socket-events.ts

// 服务端发给客户端
export interface ServerToClientEvents {
  OCTOPUS_COMMAND: (command: OctopusCommand) => void;
  COMMAND_ACK_REQUEST: (payload: { commandId: string }) => void;
  client_registered: (payload: { clientId: string }) => void;
  pong_custom: () => void;
  error: (payload: OctopusError) => void;
}

// 客户端发给服务端
export interface ClientToServerEvents {
  OCTOPUS_EVENT: (event: OctopusEvent) => void;
  OCTOPUS_EVENTS_BATCH: (events: OctopusEvent[]) => void;
  COMMAND_ACK: (payload: { commandId: string }) => void;
  ping_custom: () => void;
  // 认证相关（guest socket）
  AUTH_LOGIN: (payload: { email: string; password: string }, callback: (result: unknown) => void) => void;
  AUTH_VERIFY: (payload: { token: string }, callback: (result: unknown) => void) => void;
}
```

**删除的 legacy 事件**:
- Server → Client: `SYNC_POLICY`, `STATE_CHANGE`, `EXECUTE`, `policy:update`, `ENTERTAINMENT_MODE_CHANGE`, `ENTERTAINMENT_QUOTA_SYNC`, `MCP_EVENT`, `habit:created`, `habit:updated`, `habit:deleted`, `habit:entry_updated`
- Client → Server: `ACTIVITY_LOG`, `URL_CHECK`, `USER_RESPONSE`, `REQUEST_POLICY`, `TIMELINE_EVENT`, `TIMELINE_EVENTS_BATCH`, `BLOCK_EVENT`, `INTERRUPTION_EVENT`

### 2.5 错误处理协议

> **Review 补充**: 原方案缺少错误处理定义。

```typescript
// packages/octopus-protocol/src/types/common.ts

export type OctopusErrorCode =
  | 'VALIDATION_ERROR'     // Event payload 不合法
  | 'AUTH_ERROR'           // 认证失败
  | 'RATE_LIMIT'           // 频率限制
  | 'INTERNAL_ERROR'       // 服务端内部错误
  | 'PROTOCOL_MISMATCH';   // 客户端协议版本过旧

export interface OctopusError {
  code: OctopusErrorCode;
  message: string;
  /** 如果是 VALIDATION_ERROR，包含原始 eventId */
  eventId?: string;
  details?: unknown;
}
```

**服务端行为定义**:
- `OCTOPUS_EVENT` Zod 校验失败 → 发送 `error` 事件（code: `VALIDATION_ERROR`），丢弃该 event，不做 silent drop
- Auth 失败 → 发送 `error`（code: `AUTH_ERROR`），断开连接
- Rate limit → 发送 `error`（code: `RATE_LIMIT`），丢弃该 event
- `COMMAND_ACK_REQUEST` 超时（30s 无 ACK）→ 服务端日志告警 + 标记 command 为 `delivered_unacked`，不重发

### 2.6 协议版本演进策略

> **Review 补充**: 原方案完全缺少版本演进策略。

```typescript
// packages/octopus-protocol/src/constants.ts

/** 协议版本 — 每次有 breaking change 时递增 */
export const PROTOCOL_VERSION = 2;

/** 服务端支持的最低客户端协议版本 */
export const MIN_SUPPORTED_VERSION = 2;
```

**演进规则**:
1. **新增 EventType/CommandType** — 非 breaking change，不需递增版本号。老客户端收到未知 commandType 时应 **静默忽略**（不 crash）
2. **修改已有 Payload 结构** — breaking change，递增 `PROTOCOL_VERSION`
3. **客户端连接时**在 HEARTBEAT 中携带 `protocolVersion`，服务端检查是否 >= `MIN_SUPPORTED_VERSION`，过旧则发送 `error`（code: `PROTOCOL_MISMATCH`）并断开
4. **本项目未上线**，当前不会有多版本共存问题，但协议版本机制现在就建立，为未来做准备

**客户端对未知 commandType 的处理**:
```typescript
// 各端的 OCTOPUS_COMMAND handler 中
default:
  console.warn(`[Octopus] Unknown commandType: ${cmd.commandType}, ignoring`);
  break;
```

### 2.7 关于 SDK 的决策（组合式协议层，非抽象类）

> **Rev 3 修正**: 之前决策是"完全砍掉 SDK"。但 §1.5 的分析表明，各端各自实现 command 分发逻辑是跨端行为不一致的根因之一。修正为：**不做 OctopusClient 抽象类（传输层各端自管），但做组合式协议层 SDK（保证 command 处理逻辑全端一致）**。

**不做 `OctopusClient` 抽象类的理由**（维持不变）:

1. **4 个客户端只有 3 个用 socket**（Web 同进程），传输层 SDK 只服务 3 个消费者
2. **3 个端的连接生命周期差异大于共性**: iOS(App 前后台切换) vs Desktop(进程常驻) vs Extension(Service Worker 被 kill/唤醒)
3. **abstract class 在 TypeScript 中不适合 tree-shaking**，且继承链在 React Native/Service Worker 中增加调试复杂度

**做组合式协议层 SDK 的理由**:

1. **消除"iOS 漏处理了某个 command"这类 bug** — command 分发逻辑写一次，全端共享
2. **消除 Web 端轮询** — 提供统一的 state manager，所有端用相同的方式从 WS 推送更新本地状态
3. **纯函数/对象，不依赖 this** — tree-shakeable，React Native/Service Worker 友好
4. **各端的平台代码只剩"网络收发"和"存储读写"** — 复杂的协议逻辑（command 解析、event 构造、RPC 管理）由共享代码处理

### 2.8 Zod Validation 使用策略

> **Review 补充**: 原方案没说清楚 Zod 在哪里使用。

| 位置 | 是否 validate | 理由 |
|------|--------------|------|
| 服务端收到 `OCTOPUS_EVENT` | **是** | 边界入口，必须校验外部数据 |
| 客户端收到 `OCTOPUS_COMMAND` | **否** | 数据来自受信服务端，TypeScript 类型断言即可 |
| 开发/测试环境 | 可选打开客户端 validate | 用于调试 |

**Extension 不引入 Zod**: 共享包的 `package.json` 使用 `exports` 字段物理隔离：
```json
{
  "exports": {
    ".": "./src/index.ts",
    "./validation": "./src/validation/schemas.ts"
  }
}
```
Extension 只 `import from '@vibeflow/octopus-protocol'`，不 `import from '@vibeflow/octopus-protocol/validation'`。

### 2.9 数据流统一规范

> **Rev 3 新增**。统一全端数据获取模式，消除"有了 WS 还在轮询"的问题。

#### 2.9.1 三种数据获取模式（全端遵守）

| 模式 | 何时使用 | 例子 | 各端实现 |
|------|---------|------|---------|
| **WS 推送** (OCTOPUS_COMMAND) | 所有实时状态变更 | state sync、policy update、action result、habit 变更、focus session 变更 | 服务端主动 push，客户端被动接收 |
| **tRPC query（一次性）** | 页面/App 初次加载、前台恢复、WS 重连后 | 获取 task 列表、历史记录、设置项、daily progress | 仅加载时调用一次，**禁止 refetchInterval** |
| **tRPC mutation / USER_ACTION** | 用户主动操作 | 创建任务、修改设置、开始番茄钟 | Web → tRPC mutation；iOS/Desktop → USER_ACTION over WS |

#### 2.9.2 禁止规则

```
❌ 禁止: tRPC useQuery with refetchInterval（轮询）
❌ 禁止: setInterval + fetch 作为状态同步手段
❌ 禁止: 同一份数据同时通过 WS 推送和 HTTP 轮询获取
✅ 正确: WS 推送到本地 store → UI 订阅 store
✅ 正确: 页面加载 / WS 重连后一次性 fetch 初始化
✅ 正确: 本地 UI 倒计时 timer（纯客户端计算，不调服务端）
```

#### 2.9.3 Web 端改造要点

当前 Web 端的数据流是 "React Query cache 为主、WS 为辅"。统一后应改为 "WS 为主、React Query 仅做初始加载"：

**改造前**:
```
[组件] → useQuery(refetchInterval: 5s) → [tRPC] → [Server]
[Socket.io] → STATE_CHANGE → [部分更新 React Query cache]
```

**改造后**:
```
[Socket.io] → OCTOPUS_COMMAND → [State Manager] → [Store] → [组件自动更新]
[组件 mount / WS 重连] → useQuery(一次性) → [Store 初始化]
```

具体改造:
1. 引入中心化 state store（类似 iOS 的 Zustand 或直接用 Zustand）
2. WS `OCTOPUS_COMMAND` handler 调用 State Manager 更新 store
3. 现有 `tray-sync-provider.tsx` 的 12 个 `refetchInterval` 查询 → 全部移除，改为订阅 store
4. 保留 `useQuery` 但去掉 `refetchInterval`，仅作为 `initialData` 或 `staleTime: Infinity` 使用
5. WS 重连时触发一次全量 sync（`SYNC_STATE` full），保证数据最终一致

#### 2.9.4 Event Batch 策略

> **补充**: `OCTOPUS_EVENTS_BATCH` 的使用规范。

| 场景 | 用 batch 还是单发？ | 规则 |
|------|---|---|
| 实时产生的事件 | 单发 `OCTOPUS_EVENT` | 立即发送 |
| 离线队列 flush | Batch `OCTOPUS_EVENTS_BATCH` | 重连后一次性发送 |
| Extension 传感器数据（activity_log 批量） | Batch | 每 30s 汇总一批 |
| Desktop sensor-reporter 周期汇报 | Batch | 每 60s 汇总一批 |

**Batch 上限**: 单次最多 50 events。超过 50 分多次 batch 发送（避免单帧过大导致 WebSocket 阻塞）。

### 2.10 组合式协议层 SDK

> **Rev 3 新增**。替代之前"完全砍掉 SDK"的决策。提供共享的协议逻辑，各端负责传输和存储。

#### 2.10.1 目录结构

```
packages/octopus-protocol/src/
├── ...（原有 types/ + validation/）
└── protocol/
    ├── command-handler.ts    # Command 分发 + 类型窄化
    ├── event-builder.ts      # Event 构造
    ├── state-manager.ts      # State 管理（接收 SYNC_STATE → 更新本地状态）
    ├── action-rpc.ts         # USER_ACTION → ACTION_RESULT RPC 管理
    └── heartbeat.ts          # Heartbeat payload 构造
```

#### 2.10.2 Command Handler — 统一分发，各端不再各写 switch

```typescript
// packages/octopus-protocol/src/protocol/command-handler.ts

export interface CommandHandlers {
  onStateSync: (payload: SyncStatePayload) => void;
  onPolicyUpdate: (policy: Policy) => void;
  onExecuteAction: (payload: ExecuteActionPayload) => void;
  onShowUI: (payload: ShowUIPayload) => void;
  onActionResult: (payload: ActionResultPayload) => void;
  onChatResponse?: (payload: ChatResponsePayload) => void;
  onChatToolCall?: (payload: ChatToolCallPayload) => void;
  onChatSync?: (payload: ChatSyncPayload) => void;
}

/**
 * 创建 command handler。各端的 OCTOPUS_COMMAND listener 调用此函数。
 * switch/case 只写这一次，全端共享。
 */
export function createCommandHandler(handlers: CommandHandlers) {
  return function handleCommand(command: OctopusCommand): void {
    switch (command.commandType) {
      case 'SYNC_STATE':
        handlers.onStateSync(command.payload);
        break;
      case 'UPDATE_POLICY':
        handlers.onPolicyUpdate(command.payload);
        break;
      case 'EXECUTE_ACTION':
        handlers.onExecuteAction(command.payload);
        break;
      case 'SHOW_UI':
        handlers.onShowUI(command.payload);
        break;
      case 'ACTION_RESULT':
        handlers.onActionResult(command.payload);
        break;
      case 'CHAT_RESPONSE':
        handlers.onChatResponse?.(command.payload);
        break;
      case 'CHAT_TOOL_CALL':
        handlers.onChatToolCall?.(command.payload);
        break;
      case 'CHAT_SYNC':
        handlers.onChatSync?.(command.payload);
        break;
      default:
        // 协议版本演进：未知 commandType 优雅忽略
        console.warn(`[Octopus] Unknown commandType: ${(command as any).commandType}, ignoring`);
    }
  };
}
```

**各端使用示例**:
```typescript
// iOS (websocket.service.ts)
const handleCommand = createCommandHandler({
  onStateSync: (payload) => appStore.getState().handleStateSync(payload),
  onPolicyUpdate: (policy) => appStore.getState().handlePolicyUpdate(policy),
  onExecuteAction: (payload) => blockingService.handleExecute(payload),
  onShowUI: (payload) => notificationService.handleShowUI(payload),
  onActionResult: (payload) => actionService.handleResult(payload),
});

socket.on('OCTOPUS_COMMAND', handleCommand);
```

#### 2.10.3 State Manager — 统一状态合并逻辑

```typescript
// packages/octopus-protocol/src/protocol/state-manager.ts

export interface StateSnapshot {
  systemState: SystemState;
  activePomodoro: ActivePomodoroData | null;
  dailyState: DailyStateData | null;
  policy: Policy | null;
  habits?: HabitData[];
}

export interface StateManagerCallbacks {
  /** 状态变更后通知调用方（UI 更新、持久化等） */
  onStateChange: (state: StateSnapshot, changedKeys: string[]) => void;
}

/**
 * 创建 state manager。处理 SYNC_STATE (full + delta) 和 UPDATE_POLICY。
 * 所有端共享同一份 state 合并逻辑，不会出现"iOS 处理 delta 时漏了某个字段"。
 */
export function createStateManager(callbacks: StateManagerCallbacks) {
  let state: StateSnapshot = {
    systemState: { state: 'idle', version: 0 },
    activePomodoro: null,
    dailyState: null,
    policy: null,
  };

  return {
    /** 处理 full sync — 完全覆盖本地状态 */
    handleFullSync(payload: FullSyncPayload): void {
      state = {
        systemState: payload.systemState,
        activePomodoro: payload.activePomodoro ?? null,
        dailyState: payload.dailyState ?? null,
        policy: payload.policy ?? state.policy,
        habits: payload.habits ?? state.habits,
      };
      callbacks.onStateChange(state, ['systemState', 'activePomodoro', 'dailyState', 'policy', 'habits']);
    },

    /** 处理 delta sync — 增量合并 */
    handleDeltaSync(payload: DeltaSyncPayload): void {
      const changedKeys: string[] = [];
      if (payload.systemState) {
        state.systemState = { ...state.systemState, ...payload.systemState };
        changedKeys.push('systemState');
      }
      if (payload.activePomodoro !== undefined) {
        state.activePomodoro = payload.activePomodoro;
        changedKeys.push('activePomodoro');
      }
      if (payload.dailyState) {
        state.dailyState = { ...state.dailyState, ...payload.dailyState } as DailyStateData;
        changedKeys.push('dailyState');
      }
      if (payload.habits) {
        state.habits = payload.habits;
        changedKeys.push('habits');
      }
      // state 从 FOCUS → 非 FOCUS 时，自动清空 activePomodoro（防止残留）
      if (payload.systemState?.state && payload.systemState.state !== 'focus' && state.activePomodoro) {
        state.activePomodoro = null;
        changedKeys.push('activePomodoro');
      }
      callbacks.onStateChange(state, changedKeys);
    },

    /** 处理 policy 更新 */
    handlePolicyUpdate(policy: Policy): void {
      state.policy = policy;
      callbacks.onStateChange(state, ['policy']);
    },

    /** 获取当前快照 */
    getState(): StateSnapshot {
      return state;
    },
  };
}
```

**好处**:
- delta sync 的 "state 从 FOCUS→非 FOCUS 时清空 activePomodoro" 逻辑写一次，不会再出现 iOS 漏处理的 bug
- Web 端也用同一个 state manager，和 iOS 行为完全一致
- 纯函数，无副作用，易于单元测试

#### 2.10.4 Action RPC — 统一 USER_ACTION → ACTION_RESULT

```typescript
// packages/octopus-protocol/src/protocol/action-rpc.ts

export interface ActionRPCConfig {
  /** 超时时间 ms，默认 10000 */
  timeout?: number;
  /** 发送 event 的函数（由各端传输层提供） */
  sendEvent: (event: OctopusEvent) => void;
}

export function createActionRPC(config: ActionRPCConfig) {
  const pending = new Map<string, {
    resolve: (result: ActionResultPayload) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  return {
    /** 发送 action 并等待结果 */
    send(actionType: UserActionType, data: Record<string, unknown>): Promise<ActionResultPayload> {
      const optimisticId = generateId();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(optimisticId);
          reject(new Error(`Action ${actionType} timed out`));
        }, config.timeout ?? 10000);

        pending.set(optimisticId, { resolve, reject, timer });

        config.sendEvent({
          eventType: 'USER_ACTION',
          payload: { actionType, data, optimisticId },
          // ... BaseEvent fields filled by event-builder
        } as any);
      });
    },

    /** 收到 ACTION_RESULT 时调用（由 command handler 路由过来） */
    handleResult(payload: ActionResultPayload): void {
      const entry = pending.get(payload.optimisticId);
      if (entry) {
        clearTimeout(entry.timer);
        pending.delete(payload.optimisticId);
        entry.resolve(payload);
      }
    },

    /** 断线时清理所有 pending actions */
    clearAll(): void {
      for (const [id, entry] of pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error('Connection lost'));
      }
      pending.clear();
    },
  };
}
```

#### 2.10.5 Event Builder — 统一 event 构造

```typescript
// packages/octopus-protocol/src/protocol/event-builder.ts

export interface EventBuilderConfig {
  clientType: ClientType;
  clientId: string;
  userId: string;
}

export function createEventBuilder(config: EventBuilderConfig) {
  let sequenceNumber = 0;

  return {
    /** 构造一个标准 BaseEvent，各端不再各自拼装 */
    build<T extends EventType>(eventType: T, payload: EventPayloadMap[T]): OctopusEvent {
      return {
        eventId: generateId(),
        eventType,
        userId: config.userId,
        clientId: config.clientId,
        clientType: config.clientType,
        timestamp: Date.now(),
        sequenceNumber: sequenceNumber++,
        payload,
      } as OctopusEvent;
    },

    /** 构造心跳事件 */
    buildHeartbeat(platformMeta?: Record<string, unknown>): HeartbeatEvent {
      return this.build('HEARTBEAT', {
        protocolVersion: PROTOCOL_VERSION,
        uptime: process.uptime?.() ?? 0,
        ...platformMeta,
      }) as HeartbeatEvent;
    },

    /** 重连后重置序列号 */
    resetSequence(): void {
      sequenceNumber = 0;
    },
  };
}
```

#### 2.10.6 各端整合示意

| 端 | 传输层（各端自管） | 协议层（共享 SDK） | 状态层 |
|---|---|---|---|
| **iOS** | `websocket.service.ts`（socket.io-client, keepalive, reconnect） | `createCommandHandler` + `createStateManager` + `createActionRPC` + `createEventBuilder` | Zustand store |
| **Web** | 无（同进程） | `createCommandHandler` + `createStateManager` | Zustand store（新增）或 React context |
| **Desktop** | `connection-manager.ts`（socket.io-client, 证书, 慢重试） | `createCommandHandler` + `createStateManager` + `createEventBuilder` | electron-store |
| **Extension** | `websocket.ts`（raw WebSocket, Engine.IO 帧解析） | `createCommandHandler` + `createStateManager` + `createEventBuilder` | chrome.storage.local |

**各端的传输层代码保持不变**（battle-tested），只是把 OCTOPUS_COMMAND 收到后的处理逻辑从各自的 inline code 替换为调用共享 SDK 的函数。

### 2.11 sequenceNumber 用途

> **Review 补充**: 原方案未说明 sequenceNumber 的具体行为。

- **各端独立递增**（不是全局递增），从 0 开始（由 `createEventBuilder` 管理）
- **服务端不强制校验连续性**，仅用于：
  - 日志中辅助排序同一客户端的事件
  - 检测到 gap 时打印 warn 日志（方便排查丢消息）
  - **不做补发**（WebSocket 是有序传输，正常不会有 gap；如果有，说明客户端重连了，`resetSequence()` 重置）

---

## 3. 实施阶段

> **Rev 3 修正**: 原方案 7 phase 改为 4 阶段。Phase A 类型统一 → Phase B 原子切换删 legacy → Phase C 协议层 SDK + 消除轮询 → Phase D 测试。

### Phase A: 共享类型包 + 各端导入（不删 legacy）

**目标**: 建立 `packages/octopus-protocol/`，各端从中导入类型。服务端继续双格式广播，不删任何 legacy 事件。

**完成后状态**: 所有端都能编译、运行，只是 import 路径变了。功能不变。

**任务**:
1. 创建 `packages/octopus-protocol/` 目录、package.json、tsconfig.json
2. 从 `src/types/octopus.ts` 提取类型到 `packages/octopus-protocol/src/types/`
3. 合并各端独有的类型（Desktop `DESKTOP_*` 事件、iOS `ACTION_RESULT`）
4. Policy 拆分为 `PolicyConfig` + `PolicyState`
5. 定义 `ServerToClientEvents` / `ClientToServerEvents`、`OctopusError`、`PROTOCOL_VERSION`
6. 搬移 Zod validation schemas（独立导出路径）
7. 配置根 package.json workspaces
8. `src/types/octopus.ts` 改为 `export * from '@vibeflow/octopus-protocol'`
9. **验证点**: iOS Metro + Extension tsc + Desktop Electron 都能正确 resolve 和编译共享包
10. 各端更新 import 路径（Server、iOS、Desktop、Extension），删除各自的 octopus 类型定义
11. Extension: `PolicyCache` 拆为 `Policy`（协议层）+ `ExtensionLocalState`（本地状态）
12. Desktop: `DesktopPolicy` → `Policy`，`PolicyDistractionApp` → `DistractionApp` 等命名统一
13. 确保全部编译通过 + `npm test` + `npm run lint`

### Phase B: 原子切换到纯 OCTOPUS_COMMAND（一个 PR）

**目标**: 在同一个 PR 中，同时完成服务端删 legacy + 各端切换到只监听 `OCTOPUS_COMMAND`。消除中间不一致状态。

**完成后状态**: 协议统一完成。只有 `OCTOPUS_COMMAND` / `OCTOPUS_EVENT` 两个通道。

**任务**:
1. 服务端: 删除 `broadcastPolicyUpdate` 中的 `policy:update` 和 `SYNC_POLICY` 发送
2. 服务端: 删除 `broadcastFullState` 中的 `STATE_CHANGE` legacy 发送
3. 服务端: 删除 `sendExecuteCommand` 中的 `EXECUTE` legacy 发送
4. 服务端: `habit:*` 独立事件改为 `SYNC_STATE` delta sync 或 `SHOW_UI`
5. 服务端: `ENTERTAINMENT_MODE_CHANGE` 改为 `OCTOPUS_COMMAND`
6. 服务端: 清理 `ServerToClientEvents` / `ClientToServerEvents`（从共享包导入）
7. 服务端: 删除 legacy event handlers（`REQUEST_POLICY`, `URL_CHECK`, `USER_RESPONSE` 等）
8. iOS: 确认已只监听 `OCTOPUS_COMMAND`（iOS 当前基本已经是，小幅清理即可）
9. Desktop: `connection-manager.ts` 移除 `policy:update`、`STATE_CHANGE`、`EXECUTE` 监听，统一到 `OCTOPUS_COMMAND` handler
10. Extension: `websocket.ts` 移除 `SYNC_POLICY`、`STATE_CHANGE`、`EXECUTE` 解析，统一到 `OCTOPUS_COMMAND`
11. Extension: 删除 `ServerMessage` / `ClientMessage` legacy 类型
12. **离线队列清理**: 各端 SDK 初始化时，检测到不认识的旧格式事件直接 `clear()` 队列（防止老格式事件发给新服务端报错）
13. 确保全部编译通过 + `npm test` + `npm run lint`

### Phase C: 协议层 SDK + 数据流统一

**目标**: 实现共享的协议层 SDK（§2.10），消除 Web 端轮询，各端数据流统一为 WS 推送模型。

**完成后状态**: 全端通过共享 command handler + state manager 处理 WS 数据，Web 端不再有 refetchInterval 轮询。

**任务**:
1. 实现 `packages/octopus-protocol/src/protocol/command-handler.ts`
2. 实现 `packages/octopus-protocol/src/protocol/state-manager.ts`
3. 实现 `packages/octopus-protocol/src/protocol/action-rpc.ts`
4. 实现 `packages/octopus-protocol/src/protocol/event-builder.ts`
5. 实现 `packages/octopus-protocol/src/protocol/heartbeat.ts`
6. 编写协议层 SDK 单元测试（command 分发、state 合并、RPC 超时、delta sync 边缘 case）
7. iOS: `websocket.service.ts` 的 OCTOPUS_COMMAND handler → 改为调用 `createCommandHandler`
8. iOS: `app.store.ts` 的 full/delta sync 逻辑 → 改为调用 `createStateManager`
9. iOS: `action.service.ts` → 改为调用 `createActionRPC`
10. Desktop: `connection-manager.ts` 的 command 处理 → 改为调用 `createCommandHandler` + `createStateManager`
11. Extension: `websocket.ts` 的 command routing → 改为调用 `createCommandHandler` + `createStateManager`
12. Web: 新建 `src/stores/realtime.store.ts`（Zustand），用 `createStateManager` 驱动
13. Web: `src/server/socket.ts`（客户端 hook）中 `OCTOPUS_COMMAND` → 调用 command handler → 更新 realtime store
14. Web: 删除 `tray-sync-provider.tsx` 中所有 `refetchInterval` 查询，改为订阅 realtime store
15. Web: 删除 `header.tsx`、`dashboard-status.tsx`、`focus-session-control.tsx` 等的 `refetchInterval`
16. Web: 保留必要的一次性 tRPC 查询（页面加载时），去掉 refetchInterval 参数
17. 确保全部编译通过 + `npm test` + `npm run lint`
18. 验证：Web 端在 DevTools Network 面板中不再有周期性 HTTP 请求（除页面加载）

### Phase D: Conformance 测试

**目标**: 确保类型系统和 Zod schemas 的完整性和正确性。

**任务**:
1. 创建 `packages/octopus-protocol/tests/conformance.test.ts`
2. 测试所有 EventType 有对应 interface 和 Zod schema
3. 测试所有 CommandType 有对应 interface 和 Zod schema
4. 测试 Policy (Config + State) JSON roundtrip
5. 测试未知 commandType 被优雅忽略
6. 测试 `createStateManager` 的 delta sync 边缘 case（FOCUS→IDLE 清空 activePomodoro 等）
7. 测试 `createActionRPC` 的超时和断线清理
8. 各端编译通过: `tsc --noEmit` for all projects

---

## 4. 关键决策总结

| 决策 | 结论 | 理由 |
|------|------|------|
| 包管理方式 | npm workspace 本地包 | 原子提交，无版本号管理开销 |
| 类型分发 | 源码导入（非编译产物） | 简单，各端 tsc 自行编译 |
| Extension transport | 保持 raw WebSocket | MV3 Service Worker 限制 |
| Legacy 事件 | 直接删除（Phase B 原子切换） | 未上线，无兼容需求 |
| `ACTION_RESULT` | 提升为 canonical CommandType | iOS 已验证的 RPC 模式，应全端推广 |
| Policy 拆分 | `PolicyConfig`（配置）+ `PolicyState`（运行时） | 消除运行时状态混入配置的设计瑕疵 |
| Zod schemas | 可选导入，仅服务端入口处 validate | 避免 Extension bundle 膨胀；客户端信任服务端数据 |
| SDK | **组合式协议层 SDK**（非抽象类） | 传输层各端自管（差异大），协议逻辑共享（保证一致性） |
| 数据流 | **WS 推送为唯一实时通道，禁止 refetchInterval** | 消除 Web 轮询，全端行为一致，减少 ~50 HTTP req/min |
| State Manager | 共享 `createStateManager` | full/delta sync 逻辑写一次，消除跨端 bug 根因 |
| Command Handler | 共享 `createCommandHandler` | switch/case 写一次，新增 command 不会漏处理 |
| Web 端状态 | 新增 Zustand realtime store | 对齐 iOS 架构，WS 推送 → store → UI 自动更新 |
| Habit 事件 | 纳入 `SYNC_STATE` delta sync + `SHOW_UI` | 不新增 CommandType，复用现有协议 |
| sequenceNumber | 各端独立递增，仅日志辅助 | 不做补发，WebSocket 本身有序 |
| 错误处理 | 定义 `OctopusError` 类型 + 服务端行为 | 每种错误场景有明确处理策略 |
| 协议版本 | `PROTOCOL_VERSION` 常量 + HEARTBEAT 携带 | 为未来演进做准备 |
| Event batch | 单发为主，batch 用于离线 flush 和传感器汇总 | 单次 batch ≤ 50 events |

## 5. 风险

| 风险 | 缓解 |
|------|------|
| Metro bundler 不识别 workspace 包 | `watchFolders` + `nodeModulesPaths` + `unstable_enablePackageExports` 配置；Phase A 末尾必须验证 |
| Extension tsc 不解析 workspace | 用 `tsconfig.json` paths/references 指向源码 |
| Zod 增大 Extension bundle | `exports` 字段物理隔离，Extension 不引入 validation 路径 |
| Phase B 原子切换涉及文件多 | 在同一 PR 中完成，提交前全量测试；如失败可整个 PR revert |
| 与当前进行中的功能开发并行冲突 | 建议先完成当前 socket.ts 的 Task 增强工作，再启动 Phase B |
| 各端离线队列中有老格式事件 | SDK 初始化时 clear 不认识的旧事件 |
| Web 删除 refetchInterval 后 WS 推送不全面 | Phase C 前先审计：服务端所有状态变更是否都通过 `broadcastFullState`/`broadcastPolicyUpdate` 推送。遗漏的补上 |
| Web realtime store 与 React Query cache 并存导致双源 | Phase C 中明确规则：实时数据只走 store，React Query 只做一次性加载。过渡期可保留 React Query 但 staleTime 设为 Infinity |
| State Manager 逻辑与各端现有 store 逻辑冲突 | 先对齐 iOS `app.store.ts` 的现有 full/delta sync 实现，确保 State Manager 行为等价后再替换 |
| 协议层 SDK 引入共享 mutable state | `createStateManager` 是闭包内状态，各端各自实例化，不存在跨端状态污染 |

## 6. Review 审计追踪

> 本文档经过 4 轮对抗式 review，以下记录采纳/拒绝的关键意见。

### 采纳的意见

| # | 来源 | 意见 | 修改 |
|---|------|------|------|
| R3-2 | Review 3 | SDK 抽象类过度设计 | Rev 2: 砍掉抽象类；Rev 3: 改为组合式协议层 SDK |
| R3-5 | Review 3 | Phase 2 先删服务端创造不可用窗口 | 改为 Phase A/B/C/D 四阶段，Phase B 原子切换 |
| R3-4.2 | Review 3 | Policy 混入 isCurrentlyActive 等运行时状态自相矛盾 | Policy 拆为 PolicyConfig + PolicyState |
| R3-6.1 | Review 3 | 协议版本演进策略完全缺失 | 新增 §2.6 协议版本演进策略 |
| R3-6.2 | Review 3 | 错误处理完全未定义 | 新增 §2.5 错误处理协议 |
| R3-6.3 | Review 3 | Zod validation 位置不清晰 | 新增 §2.8 Validation 使用策略 |
| R3-6.4 | Review 3 | Habit 事件迁移路径不清晰 | 新增 §2.3.4 Habit 事件迁移 |
| R3-6.5 | Review 3 | sequenceNumber 用途未定义 | 新增 §2.11 |
| R2-4 | Review 2 | Extension 打包体积边界 | 在 §2.8 中用 exports 物理隔离 |
| R2-4 | Review 2 | 离线队列脏数据 | Phase B 任务 12 中处理 |
| R1-9 | Review 1 | habit:* 事件破坏 Octopus 协议 | §2.3.4 纳入 SYNC_STATE delta sync |
| R1-10 | Review 1 | HABIT_REMINDER 复用 SHOW_NOTIFICATION | §2.3.4 改为复用 SHOW_UI |
| R3-1.1 | Review 3 | Metro/Extension workspace 兼容坑被低估 | §2.2 扩充 Metro 配置细节 + Phase A 末尾验证点 |
| R2-4 | Review 2 | 并发开发合并冲突 | §5 风险表中新增 |
| R4-1 | Review 4 | 跨端行为一致性需要共享逻辑，不能只共享类型 | Rev 3: 新增组合式 SDK（§2.10），command handler + state manager + action RPC 全端共享 |
| R4-2 | Review 4 | Web 端大量 refetchInterval 是 bug 根因 | Rev 3: 新增 §1.5 诊断 + §2.9 数据流统一规范 + Phase C 消除轮询 |
| R4-3 | Review 4 | "有了 WS 还在轮询"不合理 | Rev 3: 明确禁止 refetchInterval 作为状态同步机制 |
| R4-4 | Review 4 | 长期运维需考虑性能 | Rev 3: Event batch 策略（§2.9.4）、消除 ~50 req/min 轮询 |

### 拒绝/保留的意见

| # | 来源 | 意见 | 理由 |
|---|------|------|------|
| R3-3.3 | Review 3 | 保留多事件名而非双通道 | 双通道简化了 Extension 的解析器（只需解析一种包格式），且统一了日志/监控。switch/case 由 `createCommandHandler` 封装，DX 不受影响 |
| R3-1.2 | Review 3 | Extension 可能后续加 bundler | 当前不需要，不预设未来。如果加了 bundler 反而更利于消费 workspace 包 |
| R3-7.2 | Review 3 | tRPC-over-WebSocket 替代 | 已有 Socket.io 4.8 基础设施，迁移代价过大。Extension 的 raw WebSocket 也无法使用 tRPC |
| R3-4.1 | Review 3 | 按 clientType 过滤 Policy optional 字段 | 增加服务端复杂度，多发几个字段的带宽成本可忽略 |
