# VibeFlow 番茄时间与时间线系统全景文档

本文档描述 VibeFlow 系统中番茄时间（Pomodoro）和时间线（Timeline）功能的完整架构，供后续系统改造和优化参考。

---

## 1. 系统架构概览

### 1.1 职责分布

```
┌─────────────────────────────────────────────────────────────────┐
│                         服务器端                                  │
│  - 番茄钟计时器逻辑（倒计时、duration配置）                          │
│  - Daily Cap/统计                                                │
│  - 状态机转换（LOCKED → PLANNING → FOCUS → REST → OVER_REST）     │
│  - Timeline 数据存储和聚合                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ WebSocket (policy:update)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Desktop 主进程                              │
│  - 接收策略更新                                                   │
│  - 执行分心应用管理                                               │
│  - 发送传感器数据（应用使用、窗口切换、空闲状态）                     │
│  - 显示托盘状态                                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ IPC
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      渲染进程 (Web App)                          │
│  - UI 显示                                                       │
│  - 用户交互                                                       │
│  - 预格式化时间显示（MM:SS）                                       │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 数据流向

```
服务器 ──policy:update──> Desktop Main Process
                              │
                    ┌─────────┴─────────┐
                    ↓                   ↓
            FocusEnforcer         TrayManager
            (执行强制)            (UI显示)
                    ↓
            AppMonitor
            (关闭分心应用)

Desktop ──events──> 服务器
  - HEARTBEAT (含 activePomodoroId)
  - DESKTOP_APP_USAGE
  - DESKTOP_WINDOW_CHANGE
  - DESKTOP_IDLE
```

---

## 2. 番茄时间（Pomodoro）功能

### 2.1 核心数据结构

#### 策略中的番茄钟会话

**文件**: `electron/types/index.ts`

```typescript
interface PolicyAdhocFocusSession {
  active: boolean;           // 是否激活
  endTime: number;           // 结束时间戳
  overridesSleepTime?: boolean;  // 是否覆盖睡眠时间
}
```

#### Focus Enforcer 状态

**文件**: `electron/modules/focus-enforcer.ts`

```typescript
interface FocusEnforcerState {
  isMonitoring: boolean;
  isWithinWorkHours: boolean;
  isPomodoroActive: boolean;      // 番茄钟是否激活
  idleSeconds: number;
  lastActivityTime: number;
  lastInterventionTime: number | null;
  interventionCount: number;
}
```

#### 托盘菜单状态

**文件**: `electron/modules/tray-manager.ts`

```typescript
interface TrayMenuState {
  pomodoroActive: boolean;
  pomodoroTimeRemaining?: string;    // MM:SS 格式
  currentTask?: string;
  systemState: 'LOCKED' | 'PLANNING' | 'FOCUS' | 'REST' | 'OVER_REST';
  restTimeRemaining?: string;
  overRestDuration?: string;
  dailyProgress?: string;            // "3/6" 格式
  skipTokensRemaining: number;
  enforcementMode: 'strict' | 'gentle';
}
```

### 2.2 关键模块

| 模块 | 文件 | 职责 |
|------|------|------|
| Focus Enforcer | `electron/modules/focus-enforcer.ts` | 管理番茄钟激活状态，控制干预触发 |
| Heartbeat Manager | `electron/modules/heartbeat-manager.ts` | 追踪 activePomodoroId，发送心跳 |
| Tray Manager | `electron/modules/tray-manager.ts` | 显示番茄钟倒计时和状态 |
| Notification Manager | `electron/modules/notification-manager.ts` | 番茄钟完成/休息结束通知 |
| Over-Rest Enforcer | `electron/modules/over-rest-enforcer.ts` | 超时休息强制执行 |
| App Monitor | `electron/modules/app-monitor.ts` | 关闭分心应用 |

### 2.3 IPC 接口

**文件**: `electron/preload.ts`

```typescript
// 番茄钟状态控制
focusEnforcer.setPomodoroActive(isActive: boolean)

// 心跳管理
heartbeat.setActivePomodoroId(pomodoroId: string | null)

// 通知
notification.showPomodoroComplete(taskName?: string)
notification.showBreakComplete()

// 事件监听
on.startPomodoro(callback)
```

### 2.4 主进程集成

**文件**: `electron/main.ts`

```typescript
// 处理 focus session（番茄钟）
const isFocusSessionActive = policy.adhocFocusSession?.active ?? false;

if (isFocusSessionActive && hasDistractionApps) {
  focusEnforcer.setPomodoroActive(true);

  // 停止超时休息强制执行
  if (overRestEnforcer.isActive()) {
    overRestEnforcer.stop();
  }

  // 启动分心应用监控
  focusTimeMonitor = createFocusTimeMonitor(distractionApps);
  focusTimeMonitor.start();
}

// IPC: 番茄钟状态变化
ipcMain.on('pomodoro:stateChange', (_, payload) => {
  updateTrayMenu({
    pomodoroActive: payload.active,
    pomodoroTimeRemaining: payload.timeRemaining,  // 预格式化 MM:SS
    currentTask: payload.taskName,
  });
});
```

### 2.5 托盘显示逻辑

**文件**: `electron/modules/tray-manager.ts:674-744`

| 状态 | 显示内容 |
|------|----------|
| 番茄钟激活 | `🎯 ${timeDisplay}${taskDisplay}` |
| 休息中 | 休息提示语 |
| 超时休息 | Elon Musk 名言激励 |
| 其他 | 默认图标 |

---

## 3. 时间线（Timeline）功能

### 3.1 传感器报告

**文件**: `electron/modules/sensor-reporter.ts`

#### 配置

```typescript
interface SensorReporterConfig {
  appCheckIntervalMs: number;      // 5000ms - 检查活跃应用
  usageReportIntervalMs: number;   // 60000ms - 报告使用情况
  idleThresholdSeconds: number;    // 300s - 空闲阈值
  idleCheckIntervalMs: number;     // 10000ms - 检查空闲状态
  userId: string;
}
```

#### 追踪的事件类型

| 事件类型 | 描述 | Payload |
|----------|------|---------|
| `DESKTOP_APP_USAGE` | 应用使用时长 | bundleId, name, duration, category |
| `DESKTOP_WINDOW_CHANGE` | 窗口切换 | fromApp, toApp, timeOnPreviousApp |
| `DESKTOP_IDLE` | 空闲状态 | idleSeconds, isIdle, lastActivityTime |

#### 应用分类

```typescript
type ActivityCategory = 'productive' | 'neutral' | 'distracting';

// 生产力应用
const PRODUCTIVE_APPS = new Set([
  'com.apple.dt.Xcode',
  'com.microsoft.VSCode',
  'com.jetbrains.intellij',
  'com.notion.id',
  'md.obsidian',
  // ...
]);

// 分心应用
const DISTRACTING_APPS = new Set([
  'com.apple.Safari',
  'com.google.Chrome',
  'com.tinyspeck.slackmacgap',
  'com.hnc.Discord',
  'com.spotify.client',
  // ...
]);
```

### 3.2 数据结构

#### 应用使用 Payload

```typescript
interface DesktopActivityPayload {
  source: 'desktop_app';
  identifier: string;      // bundleId
  title: string;           // 应用名称
  duration: number;        // 秒
  category: ActivityCategory;
  metadata?: {
    appBundleId?: string;
    windowTitle?: string;
    isActive?: boolean;
  };
}
```

#### 窗口切换 Payload

```typescript
interface DesktopWindowChangePayload {
  fromAppBundleId: string;
  fromAppName: string;
  toAppBundleId: string;
  toAppName: string;
  timeOnPreviousApp: number;  // 秒
}
```

#### 空闲状态 Payload

```typescript
interface DesktopIdlePayload {
  idleSeconds: number;
  isIdle: boolean;
  lastActivityTime: number;
}
```

### 3.3 离线事件队列

**文件**: `electron/modules/offline-event-queue.ts`

```typescript
type QueuedEventType =
  | 'skip_token_usage'
  | 'bypass_event'
  | 'offline_period'
  | 'heartbeat_missed';

interface EventQueueState {
  queueSize: number;
  pendingCount: number;
  failedCount: number;
  isSyncing: boolean;
  lastSyncAt: number | null;
}
```

---

## 4. 超时休息（Over-Rest）功能

### 4.1 配置

**文件**: `electron/modules/over-rest-enforcer.ts`

```typescript
interface OverRestEnforcerConfig {
  enforcementApps: PolicySleepEnforcementApp[];
  overRestMinutes: number;
  bringToFront: boolean;
}
```

### 4.2 状态

```typescript
interface OverRestEnforcerState {
  isEnforcing: boolean;
  overRestMinutes: number;
  lastEnforcementTime: number | null;
  closedAppsCount: number;
  isSystemIdle: boolean;
}
```

### 4.3 行为

- 关闭分心应用
- 将窗口置于前台
- 显示持续通知提醒用户开始番茄钟
- 仅在用户活跃时执行（非空闲）

---

## 5. 已知问题与改进建议

### 5.1 计时器逻辑分散

**问题**: 番茄钟计时器逻辑在服务器端，Desktop 仅接收预格式化的时间字符串（"MM:SS"）

**现象**:
- 离线时无法启动番茄钟
- 网络延迟导致倒计时不准确
- 无法本地暂停/恢复

**建议**:
- 在 Desktop 端实现本地计时器
- 服务器下发 duration 和 startTime，本地计算剩余时间
- 支持离线番茄钟，上线后同步

### 5.2 Daily Cap 不透明

**问题**: `dailyProgress` 以 "3/6" 字符串形式传递，Desktop 无法获取详细统计

**建议**:
- 传递结构化数据：`{ completed: 3, cap: 6, totalMinutes: 75 }`
- 支持本地查看今日番茄钟历史

### 5.3 Timeline 数据本地不存储

**问题**: 所有活动数据发送到服务器后本地不保留，无法离线查看历史

**建议**:
- 本地 SQLite 存储最近 7 天数据
- 支持离线查看时间线
- 上线后增量同步

### 5.4 应用分类硬编码

**问题**: `PRODUCTIVE_APPS` 和 `DISTRACTING_APPS` 硬编码在代码中

**建议**:
- 从服务器策略下发应用分类
- 支持用户自定义分类
- 基于使用模式智能分类

### 5.5 传感器报告间隔固定

**问题**: 报告间隔（5s/60s）固定，无法根据场景调整

**建议**:
- 番茄钟期间更频繁报告（实时追踪）
- 空闲时降低频率（省电）
- 支持服务器动态调整

### 5.6 休息状态缺乏引导

**问题**: 休息期间仅显示倒计时，缺乏休息建议

**建议**:
- 显示休息活动建议（站立、喝水、眼保健操）
- 支持休息活动打卡
- 休息质量追踪

### 5.7 超时休息激励单一

**问题**: 超时休息仅显示 Elon Musk 名言，激励效果有限

**建议**:
- 多样化激励内容（名言、统计、目标提醒）
- 渐进式提醒（温和 → 强烈）
- 支持用户自定义激励语

### 5.8 心跳与传感器数据分离

**问题**: 心跳和传感器数据通过不同机制发送，可能不同步

**建议**:
- 统一事件发送通道
- 心跳携带最新传感器摘要
- 减少网络请求

---

## 6. 文件清单

| 功能 | 文件路径 | 关键内容 |
|------|----------|----------|
| 番茄钟状态 | `electron/modules/focus-enforcer.ts` | `isPomodoroActive`, `setPomodoroActive()` |
| 心跳追踪 | `electron/modules/heartbeat-manager.ts` | `activePomodoroId` |
| 托盘显示 | `electron/modules/tray-manager.ts` | `TrayMenuState`, 倒计时显示 |
| 通知 | `electron/modules/notification-manager.ts` | `showPomodoroComplete()` |
| 超时休息 | `electron/modules/over-rest-enforcer.ts` | `OverRestEnforcer` |
| 应用监控 | `electron/modules/app-monitor.ts` | `createFocusTimeMonitor()` |
| 活动追踪 | `electron/modules/sensor-reporter.ts` | `SensorReporter` |
| IPC 接口 | `electron/preload.ts` | 暴露给渲染器的 API |
| 类型定义 | `electron/types/index.ts` | TypeScript 接口 |
| 主进程 | `electron/main.ts` | 集成和 IPC 处理 |
| 离线队列 | `electron/modules/offline-event-queue.ts` | 离线事件缓存 |

---

## 7. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0 | 2026-01-12 | 初始文档，覆盖番茄时间和时间线功能 |
