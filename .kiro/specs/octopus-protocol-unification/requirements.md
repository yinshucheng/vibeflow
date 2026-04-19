# 八爪鱼协议统一化 - Requirements

> **Rev 4** — 基于 Review 5/6 修订。Policy 拆分移至 Phase B、delta sync 明确 top-level merge、State Manager 增加持久化/flush 时序、Web SSR→WS 过渡逻辑。

## 问题陈述

VibeFlow 的八爪鱼架构（Vibe Brain 中枢 + Tentacles 触手）在设计之初定义了统一协议，但随着各端独立开发，协议实现严重碎片化：

1. **4 份独立类型定义** — 各端各自维护 octopus 类型，命名不一致、字段缺失、结构不同
2. **新旧协议共存** — 服务端同时广播 legacy 事件和 OCTOPUS_COMMAND，各端混合使用
3. **通信层实现差异** — Socket.io client / 手动 Engine.IO / legacy event listeners 并存
4. **无共享代码** — 相同的类型定义各端重复声明，相同的协议逻辑（command 分发、state 合并、RPC）各端重复实现
5. **Policy 结构碎片化** — `Policy` / `DesktopPolicy` / `PolicyCache` / `OctopusPolicy` 四个不同的类型，且混入运行时状态
6. **数据流碎片化** — Web 端依赖 tRPC refetchInterval 轮询（~50 HTTP req/min），iOS 端依赖 WS 推送。同一份数据两端用完全不同的机制获取，导致跨端行为不一致和隐藏 bug（WS 推送 payload 有问题时 Web 被轮询兜底不暴露，iOS 直接出 bug）

## 约束条件

- **应用未上线**，无需考虑向后兼容
- **直接清理所有 legacy 代码**，不产生技术债
- Chrome Extension (MV3) 的 Service Worker 无法使用 socket.io-client，必须保持 raw WebSocket
- **不做 OctopusClient 抽象类** — 各端的 websocket 传输层代码差异大（生命周期、重连策略、平台 API），保留各端自管
- **做组合式协议层 SDK** — command 分发、state 合并、RPC 管理等协议逻辑共享，保证全端行为一致

## 目标

### G1: 单一协议定义（Single Source of Truth）
所有端从同一个 npm workspace 包导入协议类型，消除定义漂移。

### G2: 统一通信语义
服务端只使用 `OCTOPUS_COMMAND` / `OCTOPUS_EVENT` 两个 Socket.io 事件通道，删除所有 legacy 事件。

### G3: 统一 Policy 结构
Policy 拆分为 `PolicyConfig`（纯用户配置）+ `PolicyState`（运行时计算值），消除运行时状态混入配置的问题。

### G4: 协议可演进
定义版本号、错误码、未知类型处理策略，为未来协议变更做准备。

### G5: 协议可测试
提供 conformance test，确保类型、schema、序列化 roundtrip 正确。

### G6: 数据流统一
全端采用 WS 推送作为唯一实时数据通道。tRPC 仅用于初始加载和用户主动操作。禁止 refetchInterval 轮询。消除"Web 没问题 iOS 有问题"的根因。

## 验收标准

### AC1: 类型统一
- [ ] `packages/octopus-protocol/` 为唯一协议类型定义
- [ ] 各端（Server、iOS、Desktop、Extension）从该包导入类型
- [ ] 删除所有独立的 octopus 类型文件（`vibeflow-ios/src/types/octopus.ts`、Desktop/Extension 中的对应定义）
- [ ] Desktop 的 `DESKTOP_*` 事件、iOS 的 `ACTION_RESULT` 纳入 canonical 定义

### AC2: 服务端清理
- [ ] `socket.ts` 只发送 `OCTOPUS_COMMAND` 和接收 `OCTOPUS_EVENT`
- [ ] 删除 `SYNC_POLICY`、`STATE_CHANGE`、`EXECUTE`、`policy:update`、`habit:*` 等 legacy 事件
- [ ] `ServerToClientEvents` 仅保留: `OCTOPUS_COMMAND`, `COMMAND_ACK_REQUEST`, `client_registered`, `pong_custom`, `error`
- [ ] `ClientToServerEvents` 仅保留: `OCTOPUS_EVENT`, `OCTOPUS_EVENTS_BATCH`, `COMMAND_ACK`, `ping_custom`, `AUTH_LOGIN`, `AUTH_VERIFY`
- [ ] Habit 数据变更通过 `SYNC_STATE` delta sync 推送
- [ ] Habit reminder 通过 `SHOW_UI` command 推送

### AC3: 各端迁移
- [ ] iOS: 从 `@vibeflow/octopus-protocol` 导入类型，只监听 `OCTOPUS_COMMAND`
- [ ] Desktop: 从 `@vibeflow/octopus-protocol` 导入类型，只监听 `OCTOPUS_COMMAND`
- [ ] Extension: 从 `@vibeflow/octopus-protocol` 导入类型，raw WebSocket 解析统一到 `OCTOPUS_COMMAND`
- [ ] Web: 从共享包导入（同 monorepo，路径 alias）

### AC4: Policy 统一
- [ ] Policy 拆为 `PolicyConfig`（纯配置）+ `PolicyState`（运行时状态）
- [ ] 删除 `DesktopPolicy`、`PolicyCache`、`OctopusPolicy`
- [ ] Extension 本地缓存改为 `{ policy: Policy; localState: ExtensionLocalState }`

### AC5: 协议健壮性
- [ ] 定义 `OctopusError` 类型和 5 种错误码
- [ ] 服务端对每种错误场景有明确行为（不 silent drop）
- [ ] 定义 `PROTOCOL_VERSION` 常量，客户端 HEARTBEAT 携带版本号
- [ ] 各端收到未知 commandType 时优雅忽略（warn log + 不 crash）
- [ ] 各端离线队列初始化时清理不认识的旧格式事件

### AC6: 数据流统一 + 消除轮询
- [ ] Web 端 `tray-sync-provider.tsx` 所有 `refetchInterval` 查询删除
- [ ] Web 端 `header.tsx`、`dashboard-status.tsx`、`focus-session-control.tsx` 等的 `refetchInterval` 删除
- [ ] Web 端新增 realtime store（Zustand），WS 推送 → store → UI 自动更新
- [ ] 全端遵守三种数据获取模式：WS 推送（实时）、tRPC query 一次性（加载）、tRPC mutation / USER_ACTION（操作）
- [ ] Web 端 DevTools Network 面板中无周期性 HTTP 请求（除页面加载）

### AC7: 协议层 SDK
- [ ] `createCommandHandler` — 全端共享的 command 分发逻辑
- [ ] `createStateManager` — 全端共享的 state 合并逻辑（full + delta sync）
- [ ] `createActionRPC` — 全端共享的 USER_ACTION → ACTION_RESULT RPC
- [ ] `createEventBuilder` — 全端共享的 event 构造 + sequenceNumber
- [ ] 各端的 OCTOPUS_COMMAND handler 使用 `createCommandHandler`
- [ ] 各端的 state sync 逻辑使用 `createStateManager`
- [ ] 协议层 SDK 单元测试（command 分发、state 合并、RPC 超时、delta sync 边缘 case）

### AC8: 测试
- [ ] 协议包单元测试（类型 roundtrip、Zod schema 覆盖）
- [ ] 各端编译通过（`tsc --noEmit`）
- [ ] 主项目测试通过（`npm test`）

## 非目标

- 不改变业务逻辑（状态机、策略编译等保持不变）
- 不改变 Socket.io 传输层（仍然是 Socket.io server）
- 不做分布式/微服务改造
- **不做 OctopusClient 抽象类 / Transport 接口** — 各端 websocket 传输层（连接、重连、心跳定时、离线存储）差异大于共性，保留各端自管
- **不做 tRPC-over-WebSocket 迁移** — 当前 Socket.io 基础设施已就位，迁移代价过大
