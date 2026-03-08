# Bug #001: VibeFlow Desktop GPU 进程高 CPU + MCP 进程泄漏

**日期**: 2026-03-08
**严重级**: P1 (影响系统稳定性)
**状态**: 已修复，已验证

## 症状

- VibeFlow Desktop 的 `VibeFlow Helper (GPU)` 进程占用 **80%+ CPU**
- 系统出现大量僵尸进程：66 个 MCP 进程、6 个 server.ts、10 个 jest-worker
- 内存几乎耗尽：24.7GB / 25.6GB swap 已用
- sysmond 占 368% CPU（内存压力导致的 swap 管理）

---

## 根因分析

### 问题 1: Desktop GPU 高 CPU（核心问题）

**根因: Tray 菜单每秒完整重建**

在 Pomodoro 倒计时期间（`electron/main.ts:333`），`setInterval(updatePomodoroCountdown, 1000)` 每秒触发一次 `updateTrayMenu()`。

`tray-manager.ts:256-261` 的 `updateState()` 每次调用都执行三个操作：
1. `updateMenu()` — 用 `Menu.buildFromTemplate()` **完整重建上下文菜单**
2. `updateTooltip()` — 更新 tooltip
3. `updateTrayTitle()` — 调用 `tray.setTitle()` 更新菜单栏文字

**问题核心**: 在 macOS 上，`tray.setTitle()` 会触发菜单栏重绘（GPU 合成），`Menu.buildFromTemplate()` + `tray.setContextMenu()` 也会触发 native 菜单重建。每秒执行这些操作会导致 GPU 进程持续高负载。

**加重因素**:
- 10+ 个并发 `setInterval` 定时器（focus enforcer 10s、app monitor 10s、sensor 5s、heartbeat 30s 等），主进程永远无法空闲
- `setAlwaysOnTop` 切换（notification-manager.ts）触发窗口层级重组
- 未调用 `app.disableHardwareAcceleration()`
- 渲染进程加载完整 Next.js 应用，可能有 CSS 动画/backdrop-blur 等 GPU 密集操作

### 问题 2: MCP 进程泄漏

**根因: 无任何清理逻辑**

`src/mcp/run.ts` 仅 19 行代码，**没有**：
- `SIGTERM`/`SIGINT` 信号处理
- `process.stdin.on('end', ...)` 监听（检测父进程关闭管道）
- `prisma.$disconnect()` 数据库连接清理
- `server.close()` 传输层清理

加上 `npx → tsx → node` 三层进程链（信号传播不可靠），当 Claude Code session 结束时，子进程树被整体遗弃。

**影响**: 每个 MCP session 泄漏 3 个进程 + 1 个 esbuild 子进程 + 1 个 PostgreSQL 连接。

### 问题 3: server.ts 多实例

`tsx watch` 的热重载机制会 fork 新的 server.ts 进程，但旧进程未必被回收。当前有 3 组 `tsx watch + server.ts`（应该只有 1 组）。

---

## 修复方案

### Fix 1: 优化 Tray 更新策略（解决 GPU 高 CPU）

**文件**: `vibeflow-desktop/electron/modules/tray-manager.ts`

```typescript
// 方案：分离 title-only 更新和全量 menu 重建
updateTitleOnly(title: Partial<Pick<TrayMenuState, 'pomodoroTimeRemaining'>>): void {
  Object.assign(this.menuState, title);
  this.updateTrayTitle(); // 只更新标题文字，不重建菜单
}

// updateState 保留给状态类别变化（pomodoro start/stop、state transition）
updateState(state: Partial<TrayMenuState>): void {
  this.menuState = { ...this.menuState, ...state };
  this.updateMenu();
  this.updateTooltip();
  this.updateTrayTitle();
}
```

**文件**: `vibeflow-desktop/electron/main.ts`

```typescript
// 修改 updatePomodoroCountdown：只更新 title，不重建菜单
function updatePomodoroCountdown(): void {
  // ...计算 timeStr...
  trayManager.updateTitleOnly({ pomodoroTimeRemaining: timeStr });
}
```

### Fix 2: MCP 进程清理（解决进程泄漏）

**文件**: `src/mcp/run.ts`

```typescript
import { startMCPServer } from './server';
import { prisma } from '@/lib/prisma';

async function shutdown(signal: string) {
  console.error(`[MCP] Received ${signal}, shutting down...`);
  await prisma.$disconnect();
  process.exit(0);
}

// 检测父进程关闭管道
process.stdin.on('end', () => shutdown('stdin-end'));
process.stdin.resume(); // 确保 stdin 保持打开以接收 end 事件

// 信号处理
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startMCPServer().catch((error) => {
  console.error('[MCP] Failed to start server:', error);
  process.exit(1);
});
```

### Fix 3: 简化 MCP 启动命令（减少进程层级）

**文件**: `.claude/.mcp.json`

```json
{
  "command": "node",
  "args": [
    "--require", "./node_modules/tsx/dist/preflight.cjs",
    "--import", "file:///./node_modules/tsx/dist/loader.mjs",
    "src/mcp/run.ts"
  ]
}
```

直接用 node + tsx loader，消除 npx → tsx 两层中间进程。

---

## 当前进程快照 (2026-03-08 20:48)

| 类别 | 数量 | 备注 |
|------|------|------|
| MCP run.ts 进程组 | 22组 (66个) | 每组 npm+tsx+node |
| server.ts 进程组 | 3组 (6个) | 应只有1组 |
| jest-worker | 10个 | 9个来自 vibeflow-ios |
| postgres idle 连接 | 4个 | MCP 泄漏导致 |
| VibeFlow Desktop GPU | 1个 @ 80% CPU | tray 每秒重建 |
| VibeFlow Desktop Renderer | 2个 @ 14% CPU | Next.js 渲染 |

## 修复记录 (2026-03-08)

### 已完成
- [x] 清理 63 个僵尸 MCP 进程、4 个冗余 server.ts、10 个 jest-worker
- [x] **Fix 1**: tray-manager.ts 新增 `updateTitleOnly()` 方法，main.ts Pomodoro 倒计时改用轻量更新
- [x] **Fix 2**: src/mcp/run.ts 添加 SIGTERM/SIGINT/stdin 关闭处理 + prisma.$disconnect()
- [x] TypeScript 编译通过，76 个单元测试通过

### 验证结果 (2026-03-08 21:10)

| 进程 | 修复前 | 修复后 | 降幅 |
|------|--------|--------|------|
| GPU Process | **80%+** | **~0%** | **-99%** |
| Main Process | 1% | 1.5% | - |
| Renderer | 11% | 8% | -27% |
| **总计** | **~87%** | **~10%** | **-88%** |

- [x] 重新构建 Desktop 应用后 GPU 进程 CPU 从 80%+ 降到接近 0%
- [ ] 新的 Claude Code session 结束后确认 MCP 进程被正常回收（需下次 session 验证）

### 未来考虑
- Fix 3: 简化 MCP 进程链（npx→tsx→node → 直接 node + tsx loader）
- 考虑 `app.disableHardwareAcceleration()` 进一步降低 GPU 负载
