# 八爪鱼协议统一化 - Tasks

## 修改范围总览

| Phase | 文件数 | 预估净改动行数 | 风险 |
|-------|--------|--------------|------|
| Phase A | ~40 文件 | +1200 / -2400（提取+删除旧类型） | 低（功能不变） |
| Phase B | ~14 文件 | -450 / +130 | 中（原子切换） |
| Phase C | ~25 文件 | +800 / -600 | 高（Web 架构变更） |
| Phase D | ~3 文件 | +400 | 低（纯测试） |

---

## Phase A: 共享类型包 + 各端导入

### 影响范围

- **新建**: `packages/octopus-protocol/` (~1200 行类型 + Zod schemas)
- **删除**: 4 个独立类型文件中的协议类型部分 (~2400 行)
- **修改 import**: ~38 文件（Server 6 + iOS 6 + Desktop 13 + Extension 13）
- **新建配置**: `metro.config.js`(iOS)、根 `package.json` 添加 workspaces、Extension tsconfig paths
- **关键难点**: Desktop 用 `moduleResolution: "node"` + CJS，需要特殊处理

### Tasks

- [ ] 1. 创建 `packages/octopus-protocol/` 目录结构、package.json（含 exports 字段）、tsconfig.json
- [ ] 2. 从 `src/types/octopus.ts` (1760行) 提取协议类型到共享包 `src/types/`（约 1041 行接口）
- [ ] 3. 从 `src/types/octopus.ts` 提取 Zod schemas 到 `src/validation/schemas.ts`（约 718 行）
- [ ] 4. 合并 Desktop 独有类型（`DESKTOP_APP_USAGE/IDLE/WINDOW_CHANGE`）到 canonical EventType
- [ ] 5. 合并 iOS 独有类型（`ACTION_RESULT`、`UserActionType`）到 canonical CommandType/actions
- [ ] 6. 统一 Policy 接口（暂保持扁平结构，将 4 端命名差异统一）
- [ ] 7. 定义 `ServerToClientEvents` / `ClientToServerEvents` / `OctopusError` / `PROTOCOL_VERSION`
- [ ] 8. 配置根 `package.json` 添加 `"workspaces": ["packages/*"]`
- [ ] 9. iOS: 创建 `metro.config.js`（watchFolders + nodeModulesPaths + TypeScript 转译配置）
- [ ] 10. Desktop: 处理 `moduleResolution: "node"` 兼容（选项：添加 paths alias 或改为 bundler）
- [ ] 11. Extension: 在 `tsconfig.json` 添加 `paths` 指向共享包源码
- [ ] 12. **验证点**: 三端编译测试 — iOS `npx expo start`、Desktop `tsc`、Extension `tsc`
- [ ] 13. Server: `src/types/octopus.ts` 改为 `export * from '@vibeflow/octopus-protocol'`
- [ ] 14. Server: 更新 6 个文件的 import 路径
- [ ] 15. iOS: 删除 `vibeflow-ios/src/types/octopus.ts` (383行)，更新 6 个文件 import
- [ ] 16. Desktop: 从 `electron/types/index.ts` 删除 ~451 行协议类型（保留 ~266 行本地类型），更新 13 个文件 import
- [ ] 17. Extension: 从 `src/types/index.ts` 删除 ~524 行协议类型（保留 ~161 行本地类型），更新 13 个文件 import
- [ ] 18. Extension: `PolicyCache` 拆为 `Policy`（从共享包）+ `ExtensionLocalState`（本地）
- [ ] 19. 全量编译 + `npm test` + `npm run lint`

---

## Phase B: 原子切换 + Policy Config/State 拆分

### 影响范围

- **服务端 socket.ts**: 删除 13 个 legacy emit 站点 + 8 个 legacy handler（~365 行）
- **Desktop connection-manager.ts**: 删除 4 个 legacy listener（~19 行），扩展 OCTOPUS_COMMAND handler
- **Extension websocket.ts**: 删除 3 个 legacy switch case（~8 行），迁移 7 个 legacy event 发送
- **iOS habit.store.ts**: 删除 legacy habit/EXECUTE listener（~17 行）
- **Policy 拆分**: 11 个文件需要更新字段访问方式

### 前置任务

- [ ] 20. **Impact analysis**: 列出 socket.ts 中每个 legacy handler 的下游依赖路径
- [ ] 21. **Policy 迁移审计**: 列出所有 `policy.xxx.isCurrentlyActive` 等运行时字段访问点（11 个文件）

### Tasks — 服务端

- [ ] 22. Policy: `policy-distribution.service.ts` 重构 `compilePolicy()` — 拆分为 `compileConfig()` + `compileState()`（影响 ~110 行运行时状态计算逻辑）
- [ ] 23. Policy: 共享包中 Policy 接口更新为 `{ config: PolicyConfig; state: PolicyState }`
- [ ] 24. socket.ts: 删除 `broadcastPolicyUpdate()` 中 `policy:update` + `SYNC_POLICY` 发送（L2560, L2564）
- [ ] 25. socket.ts: 删除 `sendStateSnapshotToSocket()` 中 `STATE_CHANGE` legacy 发送（L2125）
- [ ] 26. socket.ts: 删除 `sendExecuteCommand()` 中 `EXECUTE` legacy 发送（L2582）
- [ ] 27. socket.ts: `broadcastHabitUpdate()` 改为 `SYNC_STATE` delta sync + `SHOW_UI`（L2612-2628）
- [ ] 28. socket.ts: `broadcastEntertainmentModeChange()` 改为 `OCTOPUS_COMMAND`（L2739）
- [ ] 29. socket.ts: 删除 8 个 legacy event handlers — `ACTIVITY_LOG`(L896), `URL_CHECK`(L901), `USER_RESPONSE`(L906), `REQUEST_POLICY`(L911), `TIMELINE_EVENT`(L916), `TIMELINE_EVENTS_BATCH`(L921), `BLOCK_EVENT`(L926), `INTERRUPTION_EVENT`(L931)
- [ ] 30. socket.ts: 清理 `ServerToClientEvents` / `ClientToServerEvents` 接口（从共享包导入）

### Tasks — 客户端迁移

- [ ] 31. iOS: 删除 `habit.store.ts` 中 `habit:*` + `EXECUTE` legacy listener
- [ ] 32. iOS: Policy 访问改为 `policy.config.xxx` / `policy.state.xxx`（5 个文件：app.store, blocking.service, StatusScreen, SettingsScreen, blocking-reason.ts）
- [ ] 33. Desktop: `connection-manager.ts` 删除 `policy:update`/`STATE_CHANGE`/`EXECUTE` listener，扩展 `OCTOPUS_COMMAND` handler 支持 `UPDATE_POLICY`/`EXECUTE_ACTION`/`SHOW_UI`
- [ ] 34. Desktop: `main.ts` Policy 访问改为 `policy.config/state`（L1168-1203, L1286-1292）
- [ ] 35. Extension: `websocket.ts` 删除 `SYNC_POLICY`/`STATE_CHANGE`/`EXECUTE` switch cases（L330-339）
- [ ] 36. Extension: `service-worker.ts` 迁移 7 个 legacy `sendEvent()` 调用为 `sendOctopusEvent()`
- [ ] 37. Extension: 删除 `ServerMessage` / `ClientMessage` legacy 类型
- [ ] 38. 各端离线队列：初始化时 clear 不认识的旧格式事件
- [ ] 39. 全量编译 + `npm test` + `npm run lint`
- [ ] 40. **分端验收**: iOS 真机、Desktop 打包运行、Extension 加载测试

---

## Phase C: 协议层 SDK + 数据流统一

### 影响范围

- **新建 SDK**: `packages/octopus-protocol/src/protocol/`（5 个文件，~500 行）
- **iOS**: 替换 `websocket.service.ts` handler + `app.store.ts` sync 逻辑 + `action.service.ts`
- **Desktop**: 替换 `connection-manager.ts` command routing
- **Extension**: 替换 `websocket.ts` command routing + 配置 storage 持久化
- **Web**: 新建 realtime store + 删除 14 个 refetchInterval（8 个文件）+ 重写 `socket-client.ts`
- **服务端**: delta sync 格式从 path-based 改为 top-level merge

### 前置任务

- [ ] 41. **WS 推送覆盖审计**: 确认服务端所有状态变更都有对应的 `broadcastFullState`/`broadcastPolicyUpdate` 调用
- [ ] 42. **Delta sync 格式调研**: 确认服务端 `broadcastDeltaState` 当前发的格式，评估改为 top-level merge 的工作量

### Tasks — SDK 实现

- [ ] 43. 实现 `command-handler.ts`（createCommandHandler）
- [ ] 44. 实现 `state-manager.ts`（createStateManager，含 initialize/saveToStorage/flush 时序控制）
- [ ] 45. 实现 `action-rpc.ts`（createActionRPC）
- [ ] 46. 实现 `event-builder.ts`（createEventBuilder，含 getUptime 注入）
- [ ] 47. 实现 `heartbeat.ts`
- [ ] 48. SDK 单元测试（command 分发、state 合并、RPC 超时、delta sync 边缘 case、flush 时序）

### Tasks — 服务端 delta 格式调整

- [ ] 49. 服务端: delta sync 改为发送完整顶层子对象（如 `systemState: { state, version }` 而非 `changes: [{ path: 'systemState.state' }]`）
- [ ] 50. 验证服务端 delta 格式与 State Manager 的 `handleDeltaSync` 对齐

### Tasks — 各端迁移

- [ ] 51. iOS: `websocket.service.ts` OCTOPUS_COMMAND handler → `createCommandHandler`
- [ ] 52. iOS: `app.store.ts` full/delta sync → `createStateManager`（验证与原 `applyDeltaChanges` 行为等价）
- [ ] 53. iOS: `action.service.ts` → `createActionRPC`
- [ ] 54. Desktop: `connection-manager.ts` command routing → `createCommandHandler` + `createStateManager`
- [ ] 55. Extension: `websocket.ts` command routing → `createCommandHandler` + `createStateManager`（配置 chrome.storage.local 持久化）
- [ ] 56. 各端离线队列 flush：改为等 `isFullSyncReceived()` 后再 flush

### Tasks — Web 端数据流统一

- [ ] 57. Web: 重写 `src/lib/socket-client.ts`（264行）— 从 legacy events 切换到 `OCTOPUS_COMMAND`
- [ ] 58. Web: 新建 `src/stores/realtime.store.ts`（Zustand）用 `createStateManager` 驱动
- [ ] 59. Web: 重写 `src/hooks/use-socket.ts`（139行）— 用 `createCommandHandler` + 更新 realtime store
- [ ] 60. Web: 删除 `tray-sync-provider.tsx` 的 6 个 `refetchInterval` 查询
- [ ] 61. Web: 删除 `header.tsx`、`dashboard-status.tsx`、`daily-progress-card.tsx`、`goal-risk-suggestions.tsx` 的 `refetchInterval`
- [ ] 62. Web: 删除 `focus-session-control.tsx`、`demo-mode-banner.tsx` 的 `refetchInterval`
- [ ] 63. Web: WS 推送更新 store 后用 `queryClient.setQueryData()` 同步 React Query cache
- [ ] 64. Web: 保留一次性 tRPC 查询（去 refetchInterval，设 staleTime: 60_000）
- [ ] 65. 全量编译 + `npm test` + `npm run lint`
- [ ] 66. **验证**: DevTools Network 无周期性 HTTP 请求
- [ ] 67. **性能验证**: 模拟高频 delta sync（每秒 5 次），确认无 over-render

---

## Phase D: Conformance 测试 + 性能验证

- [ ] 68. 创建 `packages/octopus-protocol/tests/conformance.test.ts`
- [ ] 69. 测试所有 EventType ↔ interface ↔ Zod schema 映射完整
- [ ] 70. 测试所有 CommandType ↔ interface ↔ Zod schema 映射完整
- [ ] 71. 测试 Policy (Config + State) JSON roundtrip
- [ ] 72. 测试未知 commandType 优雅忽略
- [ ] 73. 测试 State Manager 边缘 case（FOCUS→IDLE 清 activePomodoro、shallow compare、flush 时序、initialize 恢复）
- [ ] 74. 测试 ActionRPC 超时 + clearAll
- [ ] 75. 测试 EventBuilder 无 getUptime 时不 crash
- [ ] 76. 性能基准测试：每秒 10 次 delta sync 的对象创建开销
- [ ] 77. 各端编译通过: `tsc --noEmit` for all projects

---

## 验收范围

### Phase A 验收

| 验收项 | 方式 |
|--------|------|
| 共享包结构正确 | 检查 `packages/octopus-protocol/` 目录 |
| 所有端编译通过 | `npm test` + 各子项目 `tsc --noEmit` |
| iOS 真机能运行 | `expo run:ios --device`，确认 heartbeat 正常 |
| Desktop 能启动 | `npm run dev` in desktop，确认连接正常 |
| Extension 能加载 | Chrome 开发者模式加载，确认 popup 正常 |
| 无功能回归 | 各端功能与改前一致（只是 import 路径变了） |
| 旧类型文件已删除 | `vibeflow-ios/src/types/octopus.ts` 等不再存在 |

### Phase B 验收

| 验收项 | 方式 |
|--------|------|
| socket.ts 无 legacy emit | `grep -n 'policy:update\|SYNC_POLICY\|STATE_CHANGE.*emit\|EXECUTE.*emit\|habit:' src/server/socket.ts` 返回空 |
| socket.ts 无 legacy handler | `grep -n 'ACTIVITY_LOG\|URL_CHECK\|USER_RESPONSE\|REQUEST_POLICY\|TIMELINE_EVENT\|BLOCK_EVENT\|INTERRUPTION_EVENT' src/server/socket.ts` 只出现在类型定义中 |
| Desktop 只监听 OCTOPUS_COMMAND | `grep -n 'policy:update\|STATE_CHANGE\|EXECUTE' vibeflow-desktop/` 返回空 |
| Extension 只监听 OCTOPUS_COMMAND | `grep -n 'SYNC_POLICY\|STATE_CHANGE.*case\|EXECUTE.*case' vibeflow-extension/src/lib/websocket.ts` 返回空 |
| Policy 已拆分 | `policy.config.blacklist` / `policy.state.isOverRest` 格式 |
| iOS 真机功能正常 | 番茄钟启停、任务操作、策略更新、习惯追踪 |
| Desktop 功能正常 | 应用封锁、策略推送、状态同步 |
| Extension 功能正常 | URL blocking、entertainment mode、状态显示 |

### Phase C 验收

| 验收项 | 方式 |
|--------|------|
| SDK 单元测试全绿 | `npx vitest run packages/octopus-protocol/tests/` |
| 各端使用共享 command handler | `grep 'createCommandHandler' vibeflow-*/` 每端有调用 |
| 各端使用共享 state manager | `grep 'createStateManager' vibeflow-*/` + `src/stores/` |
| Web 无 refetchInterval | `grep -rn 'refetchInterval' src/components/` 返回空 |
| Web DevTools Network 无轮询 | 手动验证：打开 Dashboard 60s，无周期性 XHR |
| 离线队列 flush 时序正确 | 断网 → 操作 → 恢复 → 验证数据不丢失不闪烁 |
| iOS 行为与改前等价 | 番茄钟启停、delta sync、action RPC 响应正常 |
| Desktop 行为与改前等价 | 状态同步、策略推送、命令执行正常 |

### Phase D 验收

| 验收项 | 方式 |
|--------|------|
| Conformance 测试全绿 | `npx vitest run packages/octopus-protocol/tests/conformance.test.ts` |
| 性能基准通过 | 每秒 10 次 delta sync 下无内存泄漏、对象创建 < 1ms/次 |
| 所有端 tsc 通过 | 各子项目 `tsc --noEmit` 零错误 |

---

## Pipeline 适用性评估

| Phase | 适合 Pipeline？ | 理由 |
|-------|----------------|------|
| Phase A | ✅ 部分适合 | Task 1-8（创建共享包）可以串行自动化；Task 9-12（各端配置）需要真机验证；Task 13-19（import 迁移）可以自动化 |
| Phase B | ❌ 不适合 | 必须作为一个原子 PR，且需要前置 impact analysis（手动判断），分端验收需要真机 |
| Phase C | ⚠️ 有限适合 | SDK 实现 (Task 43-48) 可以自动化；各端迁移需要逐端验证行为等价性；Web 端改造可以自动化 |
| Phase D | ✅ 适合 | 纯测试编写，可以自动化 |

**建议**：Phase A 和 Phase D 可以用 pipeline，Phase B 和 Phase C 的核心部分需要人工判断和真机验收。
