---
inclusion: always
---

# Cross-Client Sync: Pitfalls & Testing Strategy

> 总结自 2026-04 跨端同步 bug 修复。涉及 WebSocket、React Query、多标签页/多客户端场景。
> 设计新功能或修复 bug 时，凡涉及"端 A 操作 → 端 B 感知"，必须逐条检查本文中的 checklist。

## 1. 数据流全链路

一条状态变更从服务端到 UI 渲染，经过 **5 层**，任何一层断裂都会导致"后端正常但 UI 不动"：

```
服务端 mutation
  → Socket.io broadcastDataChange / broadcastFullState   (1. 广播)
    → socket-client.ts OCTOPUS_COMMAND handler            (2. 接收)
      → commandHandler → realtime.store (Zustand)         (3. 状态合并)
        → onDataChange / onStateSync 事件总线             (4. 通知)
          → React Query refetch → React 组件重渲染        (5. UI 更新)
```

### 已踩过的坑

| 层 | 出过什么问题 | 根因 |
|----|-------------|------|
| 2. 接收 | `octopusCommandListeners.size === 0`，消息到了但没人处理 | `useSocket` 注册 listener 时 socket 已连接，listener set 为空；修复：`socket-client.ts` 直接调用 `commandHandler` |
| 4. 通知 | `SYNC_STATE` 到达后 React Query 不知道数据变了 | `_applySnapshot` 只更新 Zustand，没有通知 React Query；修复：添加 `onStateSync` 事件总线 |
| 5. UI 更新 | `invalidate()` 后 UI 不刷新 | `invalidate()` 只标记 stale，配合 `refetchOnWindowFocus: false` 等于什么都没发生；修复：改用 `refetch()` |
| 5. UI 更新 | Today Tasks 更新了但 Tasks by Project 没更新 | `getByProject` 是带参数查询，不在 refetch 列表中；修复：添加 `invalidate(undefined, { refetchType: 'all' })` |
| 2→3 | 登录/登出后 WebSocket 身份与 HTTP session 不一致 | `useSocket` 没有监听 session 变化；修复：跟踪 `session?.user?.email`，变化时重连 |

## 2. 设计阶段 Checklist

新功能设计涉及实时同步时，design.md 中必须回答以下问题：

### 2.1 广播策略
- [ ] 用 `DATA_CHANGE`（实体变更通知，触发客户端 refetch）还是 `SYNC_STATE`（全量/增量状态推送）？
- [ ] 如果是状态机 state 迁移（如 FOCUS→REST），是否用了 `broadcastFullState` 而非仅 delta？
- [ ] 广播对象是谁？同用户所有设备？需要排除发起者吗？

### 2.2 客户端查询刷新
- [ ] 列出该实体涉及的**所有 React Query 查询**（不只是最明显的那个）
- [ ] 带参数的查询（如 `getByProject(projectId)`）是否用 `invalidate(undefined, { refetchType: 'all' })` 覆盖所有参数实例？
- [ ] 新增查询时，是否同步更新了 `tray-sync-provider.tsx` 的 `onDataChange` handler？

### 2.3 身份一致性
- [ ] WebSocket 连接的用户身份和 HTTP session 是否一致？
- [ ] 登录/登出/切换用户后，socket 是否正确重连？

## 3. 实现阶段 Checklist

### 3.1 新增 tRPC 查询时
1. 确认该查询是否需要实时同步（其他客户端修改数据后需要更新吗？）
2. 如果需要：在 `tray-sync-provider.tsx` 的 `onDataChange` 中添加对应的 `refetch()` / `invalidate()`
3. 无参数查询用 `.refetch()`，带参数查询用 `.invalidate(undefined, { refetchType: 'all' })`

### 3.2 新增 DATA_CHANGE entity 时
1. 服务端：在对应 router/service 中调用 `socketBroadcastService.broadcastDataChange(userId, 'entityName', action, ids)`
2. Web：`tray-sync-provider.tsx` 的 `onDataChange` switch 中添加 case
3. iOS：`app.store.ts` 的 `onDataChange` handler 中添加处理
4. Desktop/Extension：确认是否需要处理

### 3.3 React Query invalidate vs refetch

```typescript
// ❌ 只标记 stale，不立即 refetch（配合 refetchOnWindowFocus: false 等于无效）
utils.task.getTodayTasks.invalidate();

// ✅ 立即重新获取数据
utils.task.getTodayTasks.refetch();

// ✅ 带参数的查询：让所有参数实例都重新获取
utils.task.getByProject.invalidate(undefined, { refetchType: 'all' });
```

## 4. 测试策略

### 4.1 现有测试覆盖范围

| 测试 | 覆盖 | 不覆盖 |
|------|------|--------|
| `data-change-broadcast.test.ts` | Socket room 广播正确性 | 客户端状态合并、UI 更新 |
| `cross-client-sync.test.ts` | Auth → WS → 创建任务 → DATA_CHANGE 到达 | React Query 刷新、组件渲染 |
| `socket-protocol.test.ts` | 协议层无 legacy 事件 | 客户端处理逻辑 |

**盲区**：所有测试验证的是"消息到达 socket"，没有验证"消息 → Zustand → React Query → UI"。

### 4.2 需要补充的测试

**优先级 1：E2E 多标签页测试**（投入产出比最高）

```typescript
// e2e/tests/cross-tab-sync.spec.ts
test('task completion syncs across tabs', async ({ browser }) => {
  const tab1 = await browser.newPage();
  const tab2 = await browser.newPage();
  // Tab1: 完成任务
  // Tab2: 验证 UI 更新（Today Tasks + Tasks by Project）
});
```

**优先级 2：Client-side integration test**（JSDOM 环境）

```typescript
// tests/integration/client-state-sync.test.ts
// 验证：commandHandler(mockCommand) → Zustand state → onDataChange 触发
// 不需要真实 socket，只验证 store 层连接通畅
```

**优先级 3：查询完整性测试**

```typescript
// 扫描所有 trpc.*.useQuery() 调用，确认每个涉及同步的查询
// 都在 tray-sync-provider.tsx 的 onDataChange handler 中有对应的 refetch
```

## 5. 当前 React Query 配置

```typescript
// trpc-provider.tsx
defaultOptions: {
  queries: {
    staleTime: 5 * 1000,           // 5 秒内不重新获取
    refetchOnWindowFocus: false,    // 切标签页不自动 refetch
  },
}
```

这意味着 `invalidate()` 几乎无效 — 数据标记为 stale 后，如果没有新的 mount 或手动 refetch，UI 永远不会更新。**所有跨客户端同步必须用 `refetch()` 或 `invalidate({ refetchType: 'all' })`**。
