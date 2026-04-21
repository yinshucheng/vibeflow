# 八爪鱼协议统一化 - Tasks

> **Rev 3** — 基于 Review 7/8/9 修订。Delta sync 代码已清理（commit e039021）、Phase B 拆为 B1+B2、废弃 React Query 双源同步、补充自动化测试策略、补充副作用迁移 task。

## 修改范围总览

| Phase | 文件数 | 预估净改动行数 | 风险 |
|-------|--------|--------------|------|
| Phase A | ~40 文件 | +2000 / -2000（提取+删除旧类型） | 低（功能不变） |
| Phase B1 | ~11 文件 | +80 / -30 | 低（类型重构） |
| Phase B2 | ~10 文件 | -450 / +50 | 中（原子切换） |
| Phase C | ~25 文件 | +800 / -600 | 中（SDK + Web 改造） |
| Phase D | ~5 文件 | +600 | 低（纯测试） |

---

## 自动化测试策略

> 目标：将"需要人工真机验收"的范围压缩到最小。协议层行为全部可自动化测试。

### 新增测试文件

```
packages/octopus-protocol/tests/
├── command-handler.test.ts       # command 分发
├── state-manager.test.ts         # full sync 覆盖 + initialize 恢复
├── action-rpc.test.ts            # RPC 超时 + clearAll
├── event-builder.test.ts         # getUptime 注入 + sequence
├── conformance.test.ts           # 类型 roundtrip + Zod coverage
└── performance.bench.ts          # 高频 state 更新开销

tests/integration/
├── socket-protocol.test.ts       # 真实 socket.io server + client 端到端
├── policy-config-state.test.ts   # Policy 拆分后 roundtrip
└── offline-flush-sequence.test.ts # 断连→重连→flush 时序

e2e/tests/
└── no-polling.spec.ts            # Playwright: 60s 无周期性 HTTP 请求
```

### `socket-protocol.test.ts` — 替代 80% 的"分端验收"

```typescript
// 用真实 socket.io server + socket.io-client 模拟各端
it('server only emits OCTOPUS_COMMAND, no legacy events', async () => {
  const received: string[] = [];
  client.onAny((event) => received.push(event));
  await triggerPomodoroStart(userId);
  expect(received.filter(e => e === 'OCTOPUS_COMMAND').length).toBeGreaterThan(0);
  expect(received).not.toContain('STATE_CHANGE');
  expect(received).not.toContain('SYNC_POLICY');
  expect(received).not.toContain('EXECUTE');
  expect(received).not.toContain('policy:update');
});

it('OCTOPUS_COMMAND contains correct payload', async () => {
  const commands: any[] = [];
  client.on('OCTOPUS_COMMAND', (cmd) => commands.push(cmd));
  await triggerPomodoroComplete(userId);
  const syncCmd = commands.find(c => c.commandType === 'SYNC_STATE');
  expect(syncCmd.payload.systemState.state).toBe('idle');
  expect(syncCmd.payload.activePomodoro).toBeNull();
});

it('policy update uses Config/State split', async () => {
  const commands: any[] = [];
  client.on('OCTOPUS_COMMAND', (cmd) => commands.push(cmd));
  await updateUserSettings(userId, { enforcementMode: 'gentle' });
  const policyCmd = commands.find(c => c.commandType === 'UPDATE_POLICY');
  expect(policyCmd.payload.config.enforcementMode).toBe('gentle');
  expect(policyCmd.payload.state).toBeDefined();
});
```

### 验收卡点分类

| 类别 | 验收方式 | 频率 |
|------|---------|------|
| 协议层行为（command 分发、state 合并、legacy 清除） | `socket-protocol.test.ts` 自动化 | 每次 CI |
| Web 无轮询 | `no-polling.spec.ts` Playwright E2E | 每次 CI |
| 离线 flush 时序 | `offline-flush-sequence.test.ts` 单测 | 每次 CI |
| SDK 行为等价 | SDK 单测 + iOS golden data | 每次 CI |
| Legacy 清除 | CI grep 脚本 | 每次 CI |
| 各端 tsc 编译 | CI `tsc --noEmit` | 每次 CI |
| iOS Metro resolve 共享包 | 真机一次性验证 | **仅 Phase A 末尾** |
| iOS Screen Time | 与协议层无关，不需要重新验证 | N/A |
| Desktop NSWorkspace 封锁 | 与协议层无关，不需要重新验证 | N/A |
| Extension chrome.declarativeNetRequest | 与协议层无关，不需要重新验证 | N/A |

**结论：仅 Phase A 末尾需要一次真机验证（Metro/Desktop/Extension 能 resolve 共享包）。后续 Phase 全部可 CI 覆盖。**

---

## Phase A: 共享类型包 + 各端导入

### 影响范围

- **新建**: `packages/octopus-protocol/` (~2000 行类型 + Zod schemas + 基础设施)
- **删除**: 4 个独立类型文件中的协议类型部分 (~1400 行)
- **修改 import**: ~38 文件（Server 6 + iOS 6 + Desktop 13 + Extension 13）
- **新建配置**: `metro.config.js`(iOS)、根 `package.json` 添加 workspaces、Extension tsconfig paths
- **关键难点**: Desktop 用 `moduleResolution: "node"` + CJS，用 tsconfig paths 解决（禁止引入 bundler）

### Tasks

- [x] 1. 创建 `packages/octopus-protocol/` 目录结构、package.json（含 exports 字段）、tsconfig.json
- [x] 2. 从 `src/types/octopus.ts` (1760行) 提取协议类型到共享包 `src/types/`（约 1041 行接口）
- [x] 3. 从 `src/types/octopus.ts` 提取 Zod schemas 到 `src/validation/schemas.ts`（约 718 行）
- [x] 4. 合并 Desktop 独有类型（`DESKTOP_APP_USAGE/IDLE/WINDOW_CHANGE`）到 canonical EventType
- [x] 5. 合并 iOS 独有类型（`ACTION_RESULT`、`UserActionType`）到 canonical CommandType/actions
- [x] 6. 统一 Policy 接口（暂保持扁平结构，将 4 端命名差异统一）
- [x] 7. 定义 `ServerToClientEvents` / `ClientToServerEvents` / `OctopusError` / `PROTOCOL_VERSION`
- [x] 8. 配置根 `package.json` 添加 `"workspaces": ["packages/*"]`
- [x] 9. iOS: 创建 `metro.config.js`（watchFolders + nodeModulesPaths + TypeScript 转译配置）
- [x] 10. Desktop: 在 `tsconfig.json` 添加 `paths` alias 指向共享包源码（禁止引入 bundler 改造）
- [x] 11. Extension: 在 `tsconfig.json` 添加 `paths` 指向共享包源码
- [x] 12. Server: `src/types/octopus.ts` 改为 `export * from '@vibeflow/octopus-protocol'`
- [x] 13. Server: 更新 6 个文件的 import 路径
- [x] 14. iOS: 删除 `vibeflow-ios/src/types/octopus.ts` (383行)，更新 6 个文件 import
- [x] 15. Desktop: 从 `electron/types/index.ts` 删除 ~451 行协议类型（保留 ~266 行本地类型），更新 13 个文件 import
- [x] 16. Extension: 从 `src/types/index.ts` 删除 ~524 行协议类型（保留 ~161 行本地类型），更新 13 个文件 import
- [x] 17. Extension: `PolicyCache` 拆为 `Policy`（从共享包）+ `ExtensionLocalState`（本地）
- [x] 18. **验证点**: 三端编译测试 — `npm test` + `npm run lint` + iOS `npx expo start` + Desktop `tsc` + Extension `tsc`
- [x] 19. **一次性真机验证**: iOS 真机确认 Metro 能 resolve 共享包 + Desktop 启动确认连接 + Extension 加载确认 popup

---

## Phase B1: Policy Config/State 拆分

> 从 Phase B 独立出来，降低原子切换 PR 的风险。

### 影响范围

- **共享包**: Policy 类型拆分
- **服务端**: `policy-distribution.service.ts` 重构（~110 行状态计算逻辑拆出）
- **4 端客户端**: Policy 字段访问改为 `policy.config.xxx` / `policy.state.xxx`（11 个文件）

### 前置任务

- [x] 20. **Policy 迁移审计**: 列出所有 `policy.xxx.isCurrentlyActive` / `policy.overRest?.isOverRest` 等运行时字段访问点

### Tasks

- [x] 21. 共享包: Policy 接口更新为 `{ config: PolicyConfig; state: PolicyState }`
- [x] 22. 服务端: `policy-distribution.service.ts` 重构 `compilePolicy()` — 拆分为 `compileConfig()` + `compileState()`
- [x] 23. 服务端: 所有 `broadcastPolicyUpdate` 调用适配新结构
- [x] 24. iOS: Policy 访问改为 `policy.config.xxx` / `policy.state.xxx`（5 个文件：app.store, blocking.service, StatusScreen, SettingsScreen, blocking-reason.ts）
- [x] 25. Desktop: `main.ts` + `policy-cache.ts` + `connection-manager.ts` Policy 访问改为新结构
- [x] 26. Extension: `policy-cache.ts` + `policy-manager.ts` Policy 访问改为新结构 _(N/A — Extension 不消费 Protocol Policy，不受影响)_
- [x] 27. 编写 `tests/integration/policy-config-state.test.ts` — Policy 编译 roundtrip 测试 _(由 Task 77 conformance.test.ts 覆盖)_
- [x] 28. 全量编译 + `npm test` + `npm run lint`

---

## Phase B2: 原子切换到纯 OCTOPUS_COMMAND

### 影响范围

- **服务端 socket.ts**: 删除 13 个 legacy emit 站点 + 8 个 legacy handler（~365 行）
- **Desktop connection-manager.ts**: 删除 4 个 legacy listener（~19 行），扩展 OCTOPUS_COMMAND handler
- **Extension websocket.ts**: 删除 3 个 legacy switch case（~8 行），迁移 7 个 legacy event 发送
- **iOS habit.store.ts**: 删除 legacy habit/EXECUTE listener（~17 行）

### 前置任务

- [x] 29. **Impact analysis**: 列出 socket.ts 中每个 legacy handler 的下游依赖路径

### Tasks — 服务端

- [x] 30. socket.ts: 删除 `broadcastPolicyUpdate()` 中 `policy:update` + `SYNC_POLICY` 发送
- [x] 31. socket.ts: 删除 `sendStateSnapshotToSocket()` 中 `STATE_CHANGE` legacy 发送
- [x] 32. socket.ts: 删除 `sendExecuteCommand()` 中 `EXECUTE` legacy 发送
- [x] 33. socket.ts: `broadcastHabitUpdate()` 改为 `SYNC_STATE` full sync + `SHOW_UI`
- [x] 34. socket.ts: `broadcastEntertainmentModeChange()` 改为 `OCTOPUS_COMMAND`
- [x] 35. socket.ts: 删除 8 个 legacy event handlers
- [x] 36. socket.ts: 清理 `ServerToClientEvents` / `ClientToServerEvents` 接口（从共享包导入）

### Tasks — 客户端迁移

- [x] 37. iOS: 删除 `habit.store.ts` 中 `habit:*` + `EXECUTE` legacy listener
- [x] 38. Desktop: `connection-manager.ts` 删除 legacy listeners，扩展 `OCTOPUS_COMMAND` handler 支持 `UPDATE_POLICY`/`EXECUTE_ACTION`/`SHOW_UI`
- [x] 39. Extension: `websocket.ts` 删除 legacy switch cases
- [x] 40. Extension: `service-worker.ts` 迁移 7 个 legacy `sendEvent()` 为 `sendOctopusEvent()`
- [x] 41. Extension: 删除 `ServerMessage` / `ClientMessage` legacy 类型
- [x] 42. 各端离线队列：初始化时 warn log + clear 不认识的旧格式事件（未上线无用户数据风险）

### Tasks — 自动化验证

- [x] 43. 编写 `tests/integration/socket-protocol.test.ts` — 真实 socket.io server+client 端到端：验证只收到 OCTOPUS_COMMAND、payload 格式正确、无 legacy 事件
- [x] 44. CI grep 脚本：验证服务端/各端无 legacy 事件引用
- [x] 45. 全量编译 + `npm test` + `npm run lint` <!-- B2 done -->

---

## Phase C: 协议层 SDK + 数据流统一

### 影响范围

- **新建 SDK**: `packages/octopus-protocol/src/protocol/`（5 个文件，~500 行）
- **iOS**: 替换 command handler + state sync + action RPC
- **Desktop**: 替换 command routing
- **Extension**: 替换 command routing + 配置 storage 持久化
- **Web**: 新建 realtime store + 删除 14 个 refetchInterval（8 个文件）+ 重写 socket-client
- **Delta sync**: **标记为 optional/future** — 当前保持 full sync，单用户场景足够

### 前置任务

- [x] 46. **WS 推送覆盖审计**: 确认服务端所有状态变更都有对应的 `broadcastFullState`/`broadcastPolicyUpdate` 调用。遗漏的补上，否则 Web 删除轮询后该状态永远不更新。

### Tasks — SDK 实现

- [x] 47. 实现 `command-handler.ts`（createCommandHandler）
- [x] 48. 实现 `state-manager.ts`（createStateManager — full-sync-only，含 handleSync/initialize/getState。~30 行核心逻辑）
- [x] 49. 实现 `action-rpc.ts`（createActionRPC）
- [x] 50. 实现 `event-builder.ts`（createEventBuilder，含 `getUptime` 注入，不使用 `process.uptime()`）
- [x] 51. 实现 `heartbeat.ts`
- [x] 52. SDK 单元测试（command 分发、state full sync 覆盖 + initialize 恢复、RPC 超时 + clearAll、EventBuilder 无 getUptime 不 crash） <!-- C-SDK done -->

### Tasks — 各端迁移

- [x] 53. iOS: `websocket.service.ts` OCTOPUS_COMMAND handler → `createCommandHandler`
- [x] 54. iOS: `app.store.ts` full sync 逻辑 → `createStateManager`（验证与原实现行为等价；`applyDeltaChanges` 已在 commit e039021 中删除）
- [x] 55. iOS: `action.service.ts` → `createActionRPC`
- [x] 56. Desktop: `connection-manager.ts` command routing → `createCommandHandler` + `createStateManager`
- [x] 57. Extension: `websocket.ts` command routing → `createCommandHandler` + `createStateManager`（配置 `chrome.storage.local` 持久化）
- [x] 58. 各端离线队列 flush 时序：重连 → 等待 full sync（超时 10s）→ flush 离线队列 → 超时则直接 flush（best effort） <!-- C-migration done -->

### Tasks — Web 端数据流统一

- [x] 59. Web: 重写 `src/lib/socket-client.ts`（264行）— 从 legacy events 切换到 `OCTOPUS_COMMAND`
- [x] 60. Web: 新建 `src/stores/realtime.store.ts`（Zustand）用 `createStateManager` 驱动
- [x] 61. Web: 重写 `src/hooks/use-socket.ts`（139行）— 用 `createCommandHandler` + 更新 realtime store
- [x] 62. **副作用迁移**: 将 `tray-sync-provider.tsx` 中的副作用（overRest toast、healthLimit 提示等）迁移到 realtime store 的 subscribe 回调或 command handler 中
- [x] 63. Web: 删除 `tray-sync-provider.tsx` 的 6 个 `refetchInterval` 查询
- [x] 64. Web: 删除 `header.tsx`、`dashboard-status.tsx`、`daily-progress-card.tsx`、`goal-risk-suggestions.tsx` 的 `refetchInterval`
- [x] 65. Web: 删除 `focus-session-control.tsx`、`demo-mode-banner.tsx` 的 `refetchInterval`
- [x] 66. Web: 审计所有仍从 React Query 读取实时数据的组件，改为从 `realtime.store.ts` 读取。**React Query 仅保留用于非实时数据**（任务列表详情、历史记录等），不做 `queryClient.setQueryData()` 双源同步。
- [x] 67. 全量编译 + `npm test` + `npm run lint` <!-- C-web done -->

### Tasks — 自动化验证

- [x] 68. 编写 `e2e/tests/no-polling.spec.ts` — Playwright 拦截所有请求，等 60s，断言无周期性 tRPC 调用
- [x] 69. 编写 `tests/integration/offline-flush-sequence.test.ts` — 断连→事件入队→重连→full sync→flush 时序
- [x] 70. 性能验证：模拟每秒 5 次 full sync，确认 Web 端无 over-render（Zustand selector 精确订阅） <!-- C-verify done -->

### Delta Sync（DEFERRED — 已清理死代码）

> **已完成**: commit e039021 清理了所有 delta sync 死代码（iOS `applyDeltaChanges` 95 行、`StateDelta`/`StateDeltaChange` 类型、delta-sync-blocking.test.ts 测试文件、property test generators）。`syncType` 现在只允许 `'full'`。
>
> **未来路径**: 上线后如果 full sync 的 5-7 次 DB 查询/socket 成为瓶颈，再实现 delta sync。增量添加成本 ~4-6h，远低于现在从零设计。State Manager 届时加一个 `handleDeltaSync` 方法即可，各端不需要改动。
>
> **兼容性**: full sync + 定时兜底（如每 30s 补推一次）完全兼容未来的 delta sync 方案。full sync 是 ground truth，delta 只是优化路径。

- [ ] 71. _(future)_ 服务端: 实现 `broadcastDeltaState` — 维护 per-socket last-sent-state，diff 计算变更的顶层 key
- [ ] 72. _(future)_ State Manager: 添加 `handleDeltaSync(payload)` 支持 top-level merge
- [ ] 73. _(future)_ `SyncStatePayload.syncType` 恢复为 `'full' | 'delta'`，各端无需改动（State Manager 内部处理）

---

## Phase D: Conformance 测试 + 性能验证

- [x] 74. 创建 `packages/octopus-protocol/tests/conformance.test.ts`
- [x] 75. 测试所有 EventType ↔ interface ↔ Zod schema 映射完整
- [x] 76. 测试所有 CommandType ↔ interface ↔ Zod schema 映射完整
- [x] 77. 测试 Policy (Config + State) JSON roundtrip
- [x] 78. 测试未知 commandType 优雅忽略
- [x] 79. 测试 State Manager: full sync 覆盖 + initialize 恢复 + getState 快照正确
- [x] 80. 测试 ActionRPC 超时 + clearAll
- [x] 81. 测试 EventBuilder 无 getUptime 时不 crash
- [x] 82. 性能基准：每秒 10 次 full sync 的对象创建开销 < 1ms/次
- [x] 83. 各端编译通过: `tsc --noEmit` for all projects <!-- D done -->

---

## 验收范围

### Phase A 验收

| 验收项 | 方式 | 自动化？ |
|--------|------|---------|
| 共享包结构正确 | 检查 `packages/octopus-protocol/` 目录 | CI: 文件存在性检查 |
| 所有端编译通过 | `npm test` + 各子项目 `tsc --noEmit` | ✅ CI |
| 旧类型文件已删除 | `vibeflow-ios/src/types/octopus.ts` 等不再存在 | ✅ CI: `test ! -f` |
| 无功能回归 | 各端功能与改前一致 | ✅ CI: 现有测试全绿 |
| 三端能 resolve 共享包 | iOS Metro + Desktop tsc + Extension tsc | ⚠️ **Phase A 末尾一次性真机验证** |

### Phase B1 验收

| 验收项 | 方式 | 自动化？ |
|--------|------|---------|
| Policy 已拆分 | `policy.config.blacklist` / `policy.state.isOverRest` | ✅ CI: `policy-config-state.test.ts` |
| Policy roundtrip 正确 | 编译+广播+客户端解析 | ✅ CI: 集成测试 |
| 编译通过 | `npm test` + `npm run lint` | ✅ CI |

### Phase B2 验收

| 验收项 | 方式 | 自动化？ |
|--------|------|---------|
| 服务端无 legacy emit | grep 返回空 | ✅ CI grep |
| 服务端无 legacy handler | grep 返回空 | ✅ CI grep |
| 各端只监听 OCTOPUS_COMMAND | grep 返回空 | ✅ CI grep |
| 协议行为正确 | socket-protocol.test.ts | ✅ CI |
| 编译通过 | `npm test` + `npm run lint` | ✅ CI |

### Phase C 验收

| 验收项 | 方式 | 自动化？ |
|--------|------|---------|
| SDK 单测全绿 | `vitest run packages/octopus-protocol/tests/` | ✅ CI |
| 各端使用共享 SDK | grep `createCommandHandler` / `createStateManager` | ✅ CI grep |
| Web 无 refetchInterval | grep 返回空 | ✅ CI grep |
| Web 无周期性请求 | `no-polling.spec.ts` Playwright E2E | ✅ CI |
| 离线 flush 时序正确 | `offline-flush-sequence.test.ts` | ✅ CI |
| Web 实时数据单一来源 | grep: 实时数据组件只从 realtime.store 读取 | ✅ CI grep |
| 副作用（toast/notification）正常 | 手动验证一次 or E2E | ⚠️ 低风险，可后补 |

### Phase D 验收

| 验收项 | 方式 | 自动化？ |
|--------|------|---------|
| Conformance 全绿 | `vitest run conformance.test.ts` | ✅ CI |
| 性能基准通过 | < 1ms/次 | ✅ CI |
| 所有端 tsc 通过 | `tsc --noEmit` | ✅ CI |

---

## Pipeline 适用性评估

| Phase | 适合 Pipeline？ | 理由 |
|-------|----------------|------|
| Phase A Task 1-11 | ✅ 可自动化 | 创建共享包 + 配置各端 bundler |
| Phase A Task 12-18 | ✅ 可自动化 | 机械性 import 迁移（从 `../types/octopus` → `@vibeflow/octopus-protocol`） |
| Phase A Task 19 | ❌ 人工 | 一次性真机验证 |
| Phase B1 | ✅ 可自动化 | Policy 类型拆分 + 字段访问更新 |
| Phase B2 Task 29 | ❌ 人工 | Impact analysis 需要判断 |
| Phase B2 Task 30-45 | ✅ 可自动化 | 删 legacy + 写集成测试 |
| Phase C Task 46 | ❌ 人工 | WS 推送覆盖审计需要理解业务 |
| Phase C Task 47-70 | ✅ 可自动化 | SDK 实现 + 各端迁移 + 测试编写 |
| Phase D | ✅ 可自动化 | 纯测试编写 |

**总结：83 个 task 中，仅 3 个需要人工判断（Task 19 真机验证、Task 29 impact analysis、Task 46 WS 审计）。其余全部可 pipeline 执行。**

---

## Review 审计追踪

| # | 来源 | 意见 | 裁决 |
|---|------|------|------|
| R7-1 | Review 7 | 离线队列 clear 导致数据丢失 | **拒绝** — 未上线无用户数据，加 warn log 即可 |
| R7-2 | Review 7 | 重连 flush 时序导致 UI 闪烁 | **部分采纳** — 不做"先 flush 再 full sync"的反转，采用 Review 8 的超时策略（10s 超时后 best effort flush） |
| R7-3 | Review 7 | queryClient.setQueryData 双源反模式 | **采纳** — 废弃双源同步，实时数据只从 Zustand 读 |
| R7-4 | Review 7 | Delta sync top-level merge 性能倒退 | **拒绝** — Review 8 确认服务端根本没有 delta sync，iOS applyDeltaChanges 是死代码 |
| R7-5 | Review 7 | Task 12 位置错误 | **采纳** — 验证移到 Task 18 之后 |
| R7-6 | Review 7 | Desktop 禁止引入 bundler | **采纳** — 明确 tsconfig paths |
| R7-7 | Review 7 | Feature Flag 灰度 | **拒绝** — 单人项目未上线，过度设计 |
| R8-1 | Review 8 | Phase B 拆为 B1+B2 | **采纳** — B1 Policy 拆分，B2 legacy 删除 |
| R8-2 | Review 8 | Task 42 delta sync 实际不存在 | **采纳** — 重写描述，delta sync 标记 optional |
| R8-3 | Review 8 | Task 49-50 工作量低估 | **采纳** — 标记为 optional/future |
| R8-4 | Review 8 | Task 63 双源问题 | **采纳** — 同 R7-3 |
| R8-5 | Review 8 | Task 56 超时策略 | **采纳** — 补充 10s 超时 best effort |
| R8-6 | Review 8 | tray-sync 副作用迁移 | **采纳** — 新增 Task 62 |
| R8-7 | Review 8 | Delta sync 标记 optional | **采纳** — full sync 对单用户够用 |
| R9-1 | Review 9 | Delta sync 死代码直接删除 | **执行** — commit e039021 清理全部 delta sync 代码（-532 行） |
| R9-2 | Review 9 | syncType 收窄为 'full' only | **执行** — 类型/Zod schema/property tests 全部更新 |
