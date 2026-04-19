# 八爪鱼协议统一化 - Technical Design

> **Rev 4** — 基于 Review 5/6 修订。修正 SDK 环境兼容性 bug、delta sync 设计对齐 iOS 实现、增加重连 flush 时序、State Manager 增加 initialize/持久化接口、Policy 拆分移至 Phase B、Phase B 增加 impact analysis 前置任务、Web 端 SSR→WS 接管过渡逻辑、性能规范。

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

#### 2.9.4 Web 端 SSR hydration → WS 接管过渡

> **Rev 4 新增**：Review 5 指出 Next.js Server Components 与 WS 推送模型的协调问题。

**现状分析**：VibeFlow Web 的实时状态组件（番茄钟、状态指示器、dashboard）全部是 Client Components（`'use client'`）。Server Components 只用于页面布局框架和静态内容（任务列表初始 HTML 等）。因此 Server Components 的数据流与 WS 推送不冲突。

**SSR → WS 接管的过渡逻辑**：

```
1. Server Component 渲染页面框架（静态 HTML）
2. Client Component hydration 后立即订阅 Zustand realtime store
3. 如果 store 已有数据（WS 已连接）→ 直接渲染
4. 如果 store 为空（首次加载，WS 尚未连接）→ 触发一次性 tRPC query 获取初始数据
5. WS 连接建立后收到 full sync → store 更新 → UI 自动更新
6. 后续状态变更全部通过 WS 推送
```

**React Query 的退出策略**：
- 不是一步删除所有 React Query，而是**渐进式替换**
- Phase C 中将 `refetchInterval` 的查询全部删除（~50 req/min 的轮询）
- 保留无 `refetchInterval` 的一次性查询（如任务列表、历史记录），设 `staleTime: 60_000`
- 当 WS 推送的数据覆盖了某个查询的数据源时，用 `queryClient.setQueryData()` 同步更新 React Query cache
- 这样组件无论从 store 还是 React Query 读取，都能看到最新数据

**WS 断连时的降级策略**：
- 页面保持展示 store 中的最后数据（不清空）
- 显示 connection indicator 提示用户
- **不回退到 refetchInterval 轮询**（避免架构退化）
- 重连后 full sync 自动恢复

#### 2.9.5 Event Batch 策略

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

export interface StateManagerConfig {
  /** 状态变更后通知调用方（UI 更新等） */
  onStateChange: (state: StateSnapshot, changedKeys: string[]) => void;
  /** 从持久化层恢复状态（Service Worker 重启、App 冷启动） */
  loadFromStorage?: () => Promise<StateSnapshot | null>;
  /** 持久化状态（Service Worker 休眠前、App 进后台前） */
  saveToStorage?: (state: StateSnapshot) => Promise<void>;
}

/**
 * Delta sync 的 payload 格式。
 *
 * 采用 **top-level key merge** 策略：每个顶层字段要么完整替换，要么不出现。
 * 不支持嵌套路径（如 "systemState.state"）—— 这与 iOS 现有 applyDeltaChanges
 * 的 path-based 模式不同。迁移时需要：
 * 1. 服务端发送 delta 时，始终发完整的顶层子对象（如整个 systemState）
 * 2. iOS 的 applyDeltaChanges 适配为先调用 State Manager 再处理 iOS 特有逻辑
 *
 * 之所以选择 top-level merge 而非 path-based：
 * - 简单、可预测、不需要路径解析器
 * - 避免深层嵌套合并的 subtle bug
 * - 服务端发送完整子对象的带宽成本可忽略（每次 delta 几百字节）
 */
export interface DeltaSyncPayload {
  version: number;
  /** 完整替换 systemState（非 partial） */
  systemState?: SystemState;
  /** null 表示清空 activePomodoro，undefined 表示不变 */
  activePomodoro?: ActivePomodoroData | null;
  /** 完整替换 dailyState */
  dailyState?: DailyStateData;
  /** 完整替换 habits 数组 */
  habits?: HabitData[];
}

/**
 * 创建 state manager。处理 SYNC_STATE (full + delta) 和 UPDATE_POLICY。
 * 所有端共享同一份 state 合并逻辑，不会出现"iOS 处理 delta 时漏了某个字段"。
 */
export function createStateManager(config: StateManagerConfig) {
  let state: StateSnapshot = {
    systemState: { state: 'idle', version: 0 },
    activePomodoro: null,
    dailyState: null,
    policy: null,
  };

  /** full sync 就绪标记 — 重连后必须先收到 full sync 才允许 flush 离线队列 */
  let fullSyncReceived = false;

  return {
    /** 从持久化层恢复状态（Service Worker 重启、App 冷启动） */
    async initialize(): Promise<void> {
      if (config.loadFromStorage) {
        const stored = await config.loadFromStorage();
        if (stored) {
          state = stored;
        }
      }
    },

    /** 处理 full sync — 完全覆盖本地状态，shallow compare 避免无谓引用变更 */
    handleFullSync(payload: FullSyncPayload): void {
      const changedKeys: string[] = [];
      const newState: StateSnapshot = {
        systemState: payload.systemState,
        activePomodoro: payload.activePomodoro ?? null,
        dailyState: payload.dailyState ?? null,
        policy: payload.policy ?? state.policy,
        habits: payload.habits ?? state.habits,
      };
      // Shallow compare：只标记实际变化的 key
      if (newState.systemState !== state.systemState) changedKeys.push('systemState');
      if (newState.activePomodoro !== state.activePomodoro) changedKeys.push('activePomodoro');
      if (newState.dailyState !== state.dailyState) changedKeys.push('dailyState');
      if (newState.policy !== state.policy) changedKeys.push('policy');
      if (newState.habits !== state.habits) changedKeys.push('habits');

      state = newState;
      fullSyncReceived = true;
      config.onStateChange(state, changedKeys);
      config.saveToStorage?.(state);
    },

    /**
     * 处理 delta sync — top-level key merge。
     * 每个字段要么完整替换，要么不出现（undefined = 不变）。
     */
    handleDeltaSync(payload: DeltaSyncPayload): void {
      const changedKeys: string[] = [];

      if (payload.systemState !== undefined) {
        state.systemState = payload.systemState;
        changedKeys.push('systemState');
      }
      if (payload.activePomodoro !== undefined) {
        state.activePomodoro = payload.activePomodoro;
        changedKeys.push('activePomodoro');
      }
      if (payload.dailyState !== undefined) {
        state.dailyState = payload.dailyState;
        changedKeys.push('dailyState');
      }
      if (payload.habits !== undefined) {
        state.habits = payload.habits;
        changedKeys.push('habits');
      }

      // state 从 FOCUS → 非 FOCUS 时，自动清空 activePomodoro（防止残留）
      if (payload.systemState && payload.systemState.state !== 'focus' && state.activePomodoro) {
        state.activePomodoro = null;
        if (!changedKeys.includes('activePomodoro')) changedKeys.push('activePomodoro');
      }

      config.onStateChange(state, changedKeys);
      config.saveToStorage?.(state);
    },

    /** 处理 policy 更新 */
    handlePolicyUpdate(policy: Policy): void {
      state.policy = policy;
      config.onStateChange(state, ['policy']);
      config.saveToStorage?.(state);
    },

    /** 获取当前快照 */
    getState(): StateSnapshot {
      return state;
    },

    /** 重连后是否已收到 full sync（用于控制离线队列 flush 时序） */
    isFullSyncReceived(): boolean {
      return fullSyncReceived;
    },

    /** 重连开始时重置 full sync 标记 */
    onReconnecting(): void {
      fullSyncReceived = false;
    },
  };
}
```

**Delta sync 设计决策（top-level merge vs path-based）**:

> **Rev 4 修正**：Review 5 指出方案中的浅合并（spread）与 iOS 现有的 `applyDeltaChanges`（path-based，支持 `change.path.split('.')` 逐层定位）不匹配。
>
> 决策：采用 **top-level merge** — 每个顶层字段完整替换。理由：
> - 简单可预测，避免深层嵌套合并的 subtle bug
> - 服务端发送完整子对象的带宽可忽略（每次 delta 几百字节）
> - iOS 的 path-based delta 在迁移时需要服务端配合调整：发送 `systemState: { state: 'idle', version: 42 }` 而非 `changes: [{ path: 'systemState.state', value: 'idle' }]`
>
> 迁移策略：Phase C 中先让服务端同时发两种格式（top-level + legacy path-based），验证等价后再删 legacy。

**重连后离线队列 flush 时序**:

> **Rev 4 新增**：Review 5 指出离线 flush 与 full sync 的竞态问题。
>
> 正确顺序：
> ```
> 1. 客户端检测到断连 → 事件存入离线队列
> 2. 客户端重连成功
> 3. 服务端发送 SYNC_STATE (full sync)
> 4. State Manager 处理 full sync → fullSyncReceived = true
> 5. 各端检查 stateManager.isFullSyncReceived() → 触发离线队列 flush
> 6. flush 发送离线队列事件 → 服务端处理（幂等，eventId 去重）
> ```
>
> 各端传输层在 `onConnect` 回调中 **不立即 flush**，而是等待 `onStateSync` 被调用后再 flush。

**好处**:
- delta sync 的 "state 从 FOCUS→非 FOCUS 时清空 activePomodoro" 逻辑写一次，不会再出现 iOS 漏处理的 bug
- Web 端也用同一个 state manager，和 iOS 行为完全一致
- full sync 时 shallow compare 避免无谓的引用变更，减少下游组件重渲染
- Service Worker 重启后可从 `chrome.storage.local` 恢复状态
- 离线队列 flush 时序有明确保证，不会出现竞态

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
  /** 各端提供自己的 uptime 获取方式（避免跨环境 process.uptime 不可用） */
  getUptime?: () => number;
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
        uptime: config.getUptime?.() ?? 0,
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

### Phase A: 共享类型包 + 各端导入（不删 legacy，不拆 Policy）

**目标**: 建立 `packages/octopus-protocol/`，各端从中导入类型。服务端继续双格式广播，不删任何 legacy 事件。**Policy 暂时保持原有扁平结构**（Config/State 拆分推迟到 Phase B，减少本阶段风险）。

**完成后状态**: 所有端都能编译、运行，只是 import 路径变了。功能不变。

**任务**:
1. 创建 `packages/octopus-protocol/` 目录、package.json、tsconfig.json
2. 从 `src/types/octopus.ts` 提取类型到 `packages/octopus-protocol/src/types/`
3. 合并各端独有的类型（Desktop `DESKTOP_*` 事件、iOS `ACTION_RESULT`）
4. 定义统一 `Policy` 接口（暂保持扁平，含 optional 运行时字段；Config/State 拆分在 Phase B）
5. 定义 `ServerToClientEvents` / `ClientToServerEvents`、`OctopusError`、`PROTOCOL_VERSION`
6. 搬移 Zod validation schemas（独立导出路径）
7. 配置根 package.json workspaces
8. `src/types/octopus.ts` 改为 `export * from '@vibeflow/octopus-protocol'`
9. **验证点**: iOS Metro + Extension tsc + Desktop Electron 都能正确 resolve 和编译共享包（真机测试 heartbeat 能正确运行）
10. 各端更新 import 路径（Server、iOS、Desktop、Extension），删除各自的 octopus 类型定义
11. Extension: `PolicyCache` 拆为 `Policy`（协议层）+ `ExtensionLocalState`（本地状态）
12. Desktop: `DesktopPolicy` → `Policy`，`PolicyDistractionApp` → `DistractionApp` 等命名统一
13. 确保全部编译通过 + `npm test` + `npm run lint`

### Phase B: 原子切换到纯 OCTOPUS_COMMAND + Policy 拆分

**目标**: 在同一个 PR 中，同时完成服务端删 legacy + 各端切换到只监听 `OCTOPUS_COMMAND` + Policy Config/State 拆分。消除中间不一致状态。

**完成后状态**: 协议统一完成。只有 `OCTOPUS_COMMAND` / `OCTOPUS_EVENT` 两个通道。Policy 拆为 Config + State。

**前置任务（Phase B 启动前必须完成）**:
- **Impact analysis**: 对 `socket.ts` 中所有 legacy event handlers 做耦合分析，列出删除每个 handler 影响的下游代码路径
- **Policy 迁移审计**: 列出所有使用 `policy.xxx.isCurrentlyActive` / `policy.overRest?.isOverRest` 模式的代码位置（预估 10+ 个 service 文件 + 4 端客户端代码），评估改动量

**任务**:
1. 服务端: Policy 编译器输出改为 `{ config: PolicyConfig, state: PolicyState }` 结构
2. 服务端: 删除 `broadcastPolicyUpdate` 中的 `policy:update` 和 `SYNC_POLICY` 发送
3. 服务端: 删除 `broadcastFullState` 中的 `STATE_CHANGE` legacy 发送
4. 服务端: 删除 `sendExecuteCommand` 中的 `EXECUTE` legacy 发送
5. 服务端: `habit:*` 独立事件改为 `SYNC_STATE` delta sync 或 `SHOW_UI`
6. 服务端: `ENTERTAINMENT_MODE_CHANGE` 改为 `OCTOPUS_COMMAND`
7. 服务端: 清理 `ServerToClientEvents` / `ClientToServerEvents`（从共享包导入）
8. 服务端: 删除 legacy event handlers（`REQUEST_POLICY`, `URL_CHECK`, `USER_RESPONSE` 等）
9. iOS: 确认已只监听 `OCTOPUS_COMMAND`（iOS 当前基本已经是，小幅清理即可）
10. iOS: Policy 访问改为 `policy.config.xxx` / `policy.state.xxx`
11. Desktop: `connection-manager.ts` 移除 `policy:update`、`STATE_CHANGE`、`EXECUTE` 监听，统一到 `OCTOPUS_COMMAND` handler
12. Desktop: Policy 访问改为 `policy.config.xxx` / `policy.state.xxx`
13. Extension: `websocket.ts` 移除 `SYNC_POLICY`、`STATE_CHANGE`、`EXECUTE` 解析，统一到 `OCTOPUS_COMMAND`
14. Extension: 删除 `ServerMessage` / `ClientMessage` legacy 类型
15. Extension: Policy 访问改为 `policy.config.xxx` / `policy.state.xxx`
16. **离线队列清理**: 各端初始化时，检测到不认识的旧格式事件直接 `clear()` 队列
17. 确保全部编译通过 + `npm test` + `npm run lint`
18. **分端验收**: 每端独立功能测试（iOS 真机、Desktop 打包运行、Extension 加载测试）

### Phase C: 协议层 SDK + 数据流统一

**目标**: 实现共享的协议层 SDK（§2.10），消除 Web 端轮询，各端数据流统一为 WS 推送模型。

**完成后状态**: 全端通过共享 command handler + state manager 处理 WS 数据，Web 端不再有 refetchInterval 轮询。

**前置任务（Phase C 启动前）**:
- **WS 推送覆盖审计**: 审计服务端所有状态变更是否都通过 `broadcastFullState`/`broadcastPolicyUpdate` 推送。Web 端删除轮询后如果某个状态变更漏了 WS 推送，会导致 UI 永远不更新。

**任务**:
1. **服务端 delta sync 格式适配**: 确保所有 `broadcastDeltaState` 调用发送**完整的顶层子对象**（如 `systemState: { state, version, ... }` 而非 path-based change）
2. 实现 `packages/octopus-protocol/src/protocol/command-handler.ts`
3. 实现 `packages/octopus-protocol/src/protocol/state-manager.ts`（含 initialize、持久化接口、flush 时序控制）
4. 实现 `packages/octopus-protocol/src/protocol/action-rpc.ts`
5. 实现 `packages/octopus-protocol/src/protocol/event-builder.ts`（含 `getUptime` 注入）
6. 实现 `packages/octopus-protocol/src/protocol/heartbeat.ts`
7. 编写协议层 SDK 单元测试（command 分发、state 合并、RPC 超时、delta sync 边缘 case、full sync shallow compare、flush 时序）
8. iOS: `websocket.service.ts` 的 OCTOPUS_COMMAND handler → 改为调用 `createCommandHandler`
9. iOS: `app.store.ts` 的 full/delta sync 逻辑 → 改为调用 `createStateManager`（验证行为与原 `applyDeltaChanges` 等价）
10. iOS: `action.service.ts` → 改为调用 `createActionRPC`
11. Desktop: `connection-manager.ts` 的 command 处理 → 改为调用 `createCommandHandler` + `createStateManager`
12. Extension: `websocket.ts` 的 command routing → 改为调用 `createCommandHandler` + `createStateManager`（配置 `loadFromStorage`/`saveToStorage` 使用 `chrome.storage.local`）
13. **各端离线队列 flush 对接**: 传输层在收到 `onStateSync` 回调后（而非 connect 后）才 flush 离线队列
14. Web: 新建 `src/stores/realtime.store.ts`（Zustand），用 `createStateManager` 驱动
15. Web: Socket.io client hook 中 `OCTOPUS_COMMAND` → 调用 command handler → 更新 realtime store
16. Web: 删除 `tray-sync-provider.tsx` 中所有 `refetchInterval` 查询，改为订阅 realtime store
17. Web: 删除 `header.tsx`、`dashboard-status.tsx`、`focus-session-control.tsx` 等的 `refetchInterval`
18. Web: WS 推送更新 store 后，用 `queryClient.setQueryData()` 同步 React Query cache（渐进式退出）
19. Web: 保留必要的一次性 tRPC 查询（页面加载时），设 `staleTime: 60_000`
20. 确保全部编译通过 + `npm test` + `npm run lint`
21. 验证：Web 端在 DevTools Network 面板中不再有周期性 HTTP 请求（除页面加载）
22. **性能验证**: 模拟高频 delta sync（每秒 5 次），确认 Web 端不会出现组件 over-render

### Phase D: Conformance 测试 + 性能验证

**目标**: 确保类型系统、Zod schemas、协议层 SDK 的完整性和正确性。

**任务**:
1. 创建 `packages/octopus-protocol/tests/conformance.test.ts`
2. 测试所有 EventType 有对应 interface 和 Zod schema
3. 测试所有 CommandType 有对应 interface 和 Zod schema
4. 测试 Policy (Config + State) JSON roundtrip
5. 测试未知 commandType 被优雅忽略
6. 测试 `createStateManager`:
   - full sync 覆盖所有字段
   - delta sync top-level merge（只传 systemState 不影响 activePomodoro）
   - FOCUS→IDLE 清空 activePomodoro
   - full sync shallow compare 不触发无谓 changedKeys
   - `isFullSyncReceived()` 正确控制 flush 时序
   - `initialize()` 从 storage 恢复状态
7. 测试 `createActionRPC` 的超时和断线清理 (`clearAll`)
8. 测试 `createEventBuilder` 在无 `getUptime` 时返回 0（不 crash）
9. 性能测试：模拟每秒 10 次 delta sync，验证 `onStateChange` 调用次数和对象创建开销
10. 各端编译通过: `tsc --noEmit` for all projects

---

## 4. 关键决策总结

| 决策 | 结论 | 理由 |
|------|------|------|
| 包管理方式 | npm workspace 本地包 | 原子提交，无版本号管理开销 |
| 类型分发 | 源码导入（非编译产物） | 简单，各端 tsc 自行编译 |
| Extension transport | 保持 raw WebSocket | MV3 Service Worker 限制 |
| Legacy 事件 | 直接删除（Phase B 原子切换） | 未上线，无兼容需求 |
| `ACTION_RESULT` | 提升为 canonical CommandType | iOS 已验证的 RPC 模式，应全端推广 |
| Policy 拆分 | `PolicyConfig`（配置）+ `PolicyState`（运行时），Phase B 执行 | 消除运行时状态混入配置的设计瑕疵；从 Phase A 推迟到 Phase B 以降低 Phase A 风险 |
| Delta sync 格式 | Top-level key merge（完整子对象替换） | 简单可预测，避免 path-based 深层合并 bug；迁移时服务端配合调整 |
| 离线队列 flush 时序 | 先收 full sync → 再 flush | 防止旧事件覆盖新状态的竞态 |
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
| Phase B 原子切换涉及文件多 | 前置 impact analysis + 分端验收；如失败可整个 PR revert |
| 与当前进行中的功能开发并行冲突 | 建议先完成当前 socket.ts 的 Task 增强工作，再启动 Phase B |
| 各端离线队列中有老格式事件 | SDK 初始化时 clear 不认识的旧事件 |
| Web 删除 refetchInterval 后 WS 推送不全面 | Phase C 前先审计：服务端所有状态变更是否都通过 `broadcastFullState`/`broadcastPolicyUpdate` 推送。遗漏的补上 |
| Web realtime store 与 React Query cache 并存导致双源 | Phase C 中明确规则：实时数据只走 store，React Query 只做一次性加载。过渡期可保留 React Query 但 staleTime 设为 Infinity |
| State Manager 逻辑与各端现有 store 逻辑冲突 | 先对齐 iOS `app.store.ts` 的现有 full/delta sync 实现，确保 State Manager 行为等价后再替换 |
| 协议层 SDK 引入共享 mutable state | `createStateManager` 是闭包内状态，各端各自实例化，不存在跨端状态污染 |
| Service Worker 闭包状态丢失 | `createStateManager` 支持 `initialize()` 从 `chrome.storage.local` 恢复 + `saveToStorage` 自动持久化 |
| SDK 中 `process.uptime()` 跨环境不可用 | 改为 `getUptime?: () => number` 注入，各端提供自己的实现 |
| Delta sync 格式从 path-based 切换到 top-level merge | Phase C 中先让服务端发完整子对象，验证等价后再删 path-based 逻辑 |
| Phase B 大 PR 难以 code review | 前置 impact analysis 降低意外；分端验收保证质量 |

## 6. Review 审计追踪

> 本文档经过 6 轮对抗式 review，以下记录采纳/拒绝的关键意见。

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
| R5-1a | Review 5 | `process.uptime()` 在 RN/Service Worker 不可用 | Rev 4: 改为 `getUptime?: () => number` 注入 |
| R5-1c | Review 5 | Service Worker 闭包状态丢失 | Rev 4: State Manager 增加 `initialize()` + `loadFromStorage`/`saveToStorage` |
| R5-3 | Review 5 | delta sync 浅合并与 iOS path-based 不匹配 | Rev 4: 明确 top-level merge 策略 + DeltaSyncPayload 类型定义 + 迁移过渡方案 |
| R5-6 | Review 5 | 离线 flush 与 full sync 竞态 | Rev 4: `isFullSyncReceived()` 控制 flush 时序 |
| R6-1 | Review 6 | Policy 拆分从 Phase A 移到 Phase B 降低风险 | Rev 4: Phase A 保持扁平 Policy，Phase B 统一拆分 |
| R6-2 | Review 6 | DeltaSyncPayload 明确类型 | Rev 4: 定义完整类型 + 文档说明 top-level merge 策略 |
| R6-3 | Review 6 | State Manager 增加 initialize | Rev 4: 已加 |
| R6-4 | Review 6 | 重连后先 full sync 再 flush 离线队列 | Rev 4: 已加，含时序图 |
| R6-5 | Review 6 | Full sync shallow compare 避免无谓引用变更 | Rev 4: handleFullSync 逐 key 比较后再设 changedKeys |
| R6-6 | Review 6 | Phase B 前做 socket.ts legacy handler impact analysis | Rev 4: Phase B 增加前置任务 |
| R6-7 | Review 6 | Web 端 SSR hydration → WS 接管过渡逻辑 | Rev 4: 新增 §2.9.4 |

### 拒绝/保留的意见

| # | 来源 | 意见 | 理由 |
|---|------|------|------|
| R3-3.3 | Review 3 | 保留多事件名而非双通道 | 双通道简化了 Extension 的解析器（只需解析一种包格式），且统一了日志/监控。switch/case 由 `createCommandHandler` 封装，DX 不受影响 |
| R3-1.2 | Review 3 | Extension 可能后续加 bundler | 当前不需要，不预设未来。如果加了 bundler 反而更利于消费 workspace 包 |
| R3-7.2 | Review 3 | tRPC-over-WebSocket 替代 | 已有 Socket.io 4.8 基础设施，迁移代价过大。Extension 的 raw WebSocket 也无法使用 tRPC |
| R3-4.1 | Review 3 | 按 clientType 过滤 Policy optional 字段 | 增加服务端复杂度，多发几个字段的带宽成本可忽略 |
| R5-4 | Review 5 | Phase B 拆两步 + 1-2 周过渡期 | 应用未上线，没有"旧客户端"问题。过渡期增加了维护成本但无实际收益。用前置 impact analysis + 分端验收降低风险即可 |
| R5-2 | Review 5 | Server Components 数据流是阻塞问题 | 实际上 VibeFlow 的实时状态组件全是 Client Components，Server Components 只用于页面框架。Rev 4 在 §2.9.4 明确说明了这一点 |
| R5-1b | Review 5 | ReturnType<typeof setTimeout> 跨环境问题 | CLAUDE.md 已有此规范（使用 `ReturnType<typeof setTimeout>`），方案代码中也正是这样用的。各环境下 `clearTimeout` 都能接受该类型 |
