# Desktop Tray 自驱动

## 背景

当前桌面端 tray（macOS 状态栏）的状态完全由 renderer（远程网页）通过 IPC 驱动：

```
远程页面 tray-sync-provider.tsx
  → IPC tray:updateMenu({ pomodoroActive, isInSleepTime, systemState, ... })
    → main process tray-manager.ts 被动显示
```

这带来了严重问题：
1. **renderer 是远程代码**——`loadURL('http://server:4000')`，本地桌面端构建不包含 renderer 代码，修 bug 必须部署远程服务器
2. **两个写入者竞争**——renderer 和 main process 都能写 tray 状态，优先级混乱
3. **renderer 的旧代码会覆盖正确状态**——远程服务器未部署时，旧逻辑会把番茄钟状态清掉
4. **状态栏一个简单功能，链路却跨了两个进程+远程服务器**——复杂度不成比例

## 目标

**让 tray-manager 自驱动**：main process 直接从 `connection-manager.getStateSnapshot()` 和 `sleepEnforcer` 读取状态，不依赖 renderer 的 IPC。

```
connection-manager (WebSocket)
  → stateManager.handleSync() → StateSnapshot 更新
    → main process tray-driver 监听变化 → tray-manager 显示

sleepEnforcer
  → isInSleepTime() → tray-manager 显示
```

renderer 的 `tray-sync-provider.tsx` 和 tray 相关 IPC（`tray:updateMenu`、`tray:updateState`、`pomodoro:stateChange`、`system:stateChange`）全部废弃。

## 需求

### R1: Main process 状态监听

- R1.1: 当 `stateManager` 的 `activePomodoro` 变化时（非 null → null 或 null → 非 null），自动更新 tray 的 `pomodoroActive`、`pomodoroTimeRemaining`、`currentTask`
- R1.2: 当 `stateManager` 的 `systemState` 变化时，自动更新 tray 的 `systemState`
- R1.3: 当 `stateManager` 的 `dailyState` 变化时，更新 tray 的 `dailyProgress`（如 "3/8"）
- R1.4: `isInSleepTime` 由 `sleepEnforcer.isInSleepTime()` 驱动，不来自 renderer 或 policy

### R2: 番茄钟倒计时自驱动

- R2.1: 当 `activePomodoro` 从 null 变为非 null 时，main process 自动启动 `startPomodoroCountdown(startTime, durationMs, taskTitle)`，不依赖 renderer 的 `pomodoro:startCountdown` IPC
- R2.2: 当 `activePomodoro` 从非 null 变为 null 时，自动 `stopPomodoroCountdown()`
- R2.3: 番茄钟完成时，自动进入 rest timer（现有逻辑保留）

### R3: 休息计时自驱动

- R3.1: 当 `systemState` 从 `focus` 变为 `idle` 时，自动启动 rest timer（现有 `startRestTimer()` 逻辑）
- R3.2: 当 `systemState` 变为 `over_rest` 时，自动切换为 over-rest 显示
- R3.3: 当 `systemState` 重新变为 `focus` 时，停止 rest timer

### R4: 废弃 renderer → tray IPC

- R4.1: 删除 `tray-sync-provider.tsx` 中所有 `trayIntegrationService` 调用和 `window.vibeflow.pomodoro.startCountdown` / `stopCountdown` 调用
- R4.2: 删除 `tray-integration.service.ts`（整个服务不再需要）
- R4.3: 删除 main.ts 中的 `tray:updateMenu`、`tray:updateState`、`system:stateChange`、`pomodoro:stateChange`、`tray:updatePomodoroState` IPC handler
- R4.4: 删除 preload.ts 中对应的 IPC channel 暴露
- R4.5: `tray-sync-provider.tsx` 保留 React Query 缓存失效逻辑（`onDataChange`）和通知逻辑，只删除 tray 同步部分

### R5: connection-manager 增加 activePomodoro 变化通知

- R5.1: `connection-manager` 的 `onStateChange` 回调中，当 `changedKeys` 包含 `activePomodoro` 时，通知 main.ts（新增 `onActivePomodoroChange` handler 或复用现有 `onStateChange` 传递更多信息）
- R5.2: 确保 `getStateSnapshot()` 在所有时刻返回最新的 `activePomodoro`（当前可能存在 octopus-protocol CJS 兼容问题需排查）

### R6: 优先级规则（显示层）

- R6.1: `pomodoroActive` > `isInSleepTime` > `systemState`（tray-manager.ts 的 `updateTrayTitle` 已实现，保持不变）
- R6.2: 活跃番茄钟期间，`isInSleepTime` 强制为 false（在 main process 层面保证，不依赖 renderer）

## 验收标准

1. 拔掉网线（renderer 不可用）后，如果 WebSocket 还在，tray 仍能正确显示状态变化
2. 远程服务器不部署新代码，桌面端 tray 也能正确工作
3. `tray-integration.service.ts` 被删除，`tray-sync-provider.tsx` 不再有 tray 相关代码
4. 现有桌面端测试全部通过，新增测试覆盖 R1-R3 场景

## 影响范围

| 文件 | 变更 |
|------|------|
| `vibeflow-desktop/electron/main.ts` | 新增 stateSnapshot → tray 驱动逻辑，删除 tray IPC handler |
| `vibeflow-desktop/electron/modules/tray-manager.ts` | 无变化（纯显示层，保持不变） |
| `vibeflow-desktop/electron/modules/connection-manager.ts` | 新增 `onActivePomodoroChange` 通知 |
| `vibeflow-desktop/electron/preload.ts` | 删除 tray 相关 IPC channel |
| `src/components/providers/tray-sync-provider.tsx` | 删除 tray 同步代码，保留缓存失效+通知 |
| `src/services/tray-integration.service.ts` | 删除整个文件 |
| `src/services/tray-integration.test.ts` | 删除或重写 |
| `vibeflow-desktop/tests/sleep-time-pomodoro-guard.test.ts` | 更新测试 |
| `vibeflow-desktop/tests/ipc-integration.test.ts` | 删除 tray IPC 相关测试 |
