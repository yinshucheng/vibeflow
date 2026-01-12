# VibeFlow 规则系统全景文档

本文档描述 VibeFlow 系统中所有时间段、状态、规则和行为的完整定义，供后续逻辑调整和多端开发参考。

---

## 1. 时间段定义

### 1.1 工作时间 (Work Time)

**定义**: 用户配置的专注工作时段

**配置来源**: `UserSettings.workTimeSlots`

```typescript
interface WorkTimeSlot {
  dayOfWeek: number;    // 0-6 (周日-周六)
  startHour: number;    // 0-23
  startMinute: number;  // 0-59
  endHour: number;      // 0-23
  endMinute: number;    // 0-59
}
```

**判断逻辑**: `isWithinWorkHours()` - 检查当前时间是否在任一启用的时段内

**触发的行为**:
- Focus Enforcer 激活
- Over-Rest Enforcer 激活
- Entertainment Mode 不可用
- 空闲检测启动

### 1.2 自由时间 (Free Time)

**定义**: 工作时间和睡眠时间之外的时段

**判断逻辑**: `!isWithinWorkHours() && !isInSleepWindow()`

**触发的行为**:
- Focus Enforcer 停止
- Over-Rest Enforcer 停止
- Entertainment Mode 可用（受配额限制）
- 可切换 Enforcement Mode

### 1.3 睡眠时间 (Sleep Time)

**定义**: 用户配置的休息时段，通常跨越午夜

**配置来源**: `policy.sleepTime`

```typescript
interface SleepTimeConfig {
  enabled: boolean;
  startTime: string;  // "HH:mm" 如 "23:30"
  endTime: string;    // "HH:mm" 如 "07:00"
  enforcementApps: PolicySleepEnforcementApp[];
  isCurrentlyActive: boolean;
  isSnoozed: boolean;
  snoozeEndTime?: number;
}
```

**判断逻辑**: `isTimeInSleepWindow()` - 支持跨午夜时段

**触发的行为**:
- Sleep Enforcer 激活
- 配置的应用被强制关闭
- 每 5 分钟重新检查
- 可请求 Snooze（需服务器批准）

### 1.4 临时工作时间 (Ad-hoc Focus)

**定义**: 用户在非工作时间主动启动的专注时段

**触发方式**: 手动启动 Pomodoro

**行为**: 等同于工作时间，但仅在 Pomodoro 活跃期间

---

## 2. 系统状态机

### 2.1 状态定义

| 状态 | 描述 | 进入条件 |
|------|------|----------|
| `locked` | 锁定状态，需完成 Airlock | 每日重置、初始状态 |
| `planning` | 规划状态，可启动 Pomodoro | 完成 Airlock（选择 3 个任务） |
| `focus` | 专注状态，Pomodoro 进行中 | 启动 Pomodoro |
| `rest` | 休息状态，短暂休息 | 完成 Pomodoro |
| `over_rest` | 过度休息状态 | 休息超时 |

### 2.2 状态转换

```
locked ──[COMPLETE_AIRLOCK]──> planning
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
                    v              v              v
              [START_POMODORO] [ENTER_OVER_REST] [DAILY_RESET]
                    │              │              │
                    v              │              v
                 focus             │           locked
                    │              │
         ┌─────────┴─────────┐    │
         │                   │    │
         v                   v    │
  [COMPLETE_POMODORO]  [ABORT_POMODORO]
         │                   │
         v                   v
       rest              planning
         │
    ┌────┴────┐
    │         │
    v         v
[COMPLETE_REST] [ENTER_OVER_REST]
    │              │
    v              v
 planning      over_rest ──[START_POMODORO]──> focus
```

### 2.3 Guards（守卫条件）

| Guard | 条件 | 用途 |
|-------|------|------|
| `hasValidTop3` | 已选择 3 个任务 | 解锁 Airlock |
| `canStartPomodoro` | `todayPomodoroCount < dailyCap` | 允许启动 Pomodoro |
| `isDailyCapped` | `todayPomodoroCount >= dailyCap` | 达到每日上限 |

---

## 3. Enforcer 模块

### 3.1 Focus Enforcer

**文件**: `electron/modules/focus-enforcer.ts`

**触发条件** (全部满足):
1. 当前在工作时间内
2. 无活跃 Pomodoro
3. 空闲时间 >= `maxIdleMinutes` (默认 15 分钟)
4. 距上次干预 >= `repeatIntervalMinutes`

**执行动作**:
- 将 VibeFlow 窗口置顶
- 根据 Enforcement Mode 关闭/隐藏分心应用
- 发送 `focus:interventionTriggered` IPC 事件

**Skip Token 机制**:
| 模式 | 每日次数 | 最大延迟 |
|------|----------|----------|
| Strict | 1 | 5 分钟 |
| Gentle | 3 | 15 分钟 |

### 3.2 Over-Rest Enforcer

**文件**: `electron/modules/over-rest-enforcer.ts`

**触发条件**:
1. 系统状态为 `over_rest`
2. 用户非空闲（系统空闲 < 60 秒）
3. Policy `isOverRest` 为 true

**执行动作**:
- 每 10 秒关闭分心应用
- 每 30 秒将窗口置顶
- 显示持续通知："您已经休息超过 X 分钟了"

**空闲跳过**: `powerMonitor.getSystemIdleTime() >= 60` 时跳过

### 3.3 Sleep Enforcer

**文件**: `electron/modules/sleep-enforcer.ts`

**触发条件**:
1. 睡眠时间已启用
2. 当前在睡眠时段内
3. 未处于 Snooze 状态

**执行动作**:
- 显示通知："🌙 睡眠时间到了"
- 5 秒警告后关闭配置的应用
- 每 5 分钟检查睡眠状态
- 每 10 秒检查应用是否重新打开

**Snooze 功能**:
- 默认 30 分钟
- 需服务器批准
- 暂停应用监控

### 3.4 App Monitor (统一服务)

**文件**: `electron/modules/app-monitor.ts`

**工作流程**:
1. 每 10 秒检查运行中的分心应用
2. 显示警告通知，列出将被关闭的应用
3. 等待 5 秒
4. 关闭仍在运行的应用

**工厂函数**:
- `createSleepTimeMonitor()` - 强制退出，上下文："睡眠时间"
- `createFocusTimeMonitor()` - 按应用配置，上下文："专注时间"

---

## 4. Enforcement Mode

**文件**: `electron/modules/enforcement-mode.ts`

### 4.1 Strict Mode

| 项目 | 行为 |
|------|------|
| 应用 | 立即强制退出 |
| 浏览器标签 | 立即关闭，无警告 |
| Skip Token | 1 次/天，最多延迟 5 分钟 |
| 警告 | 无 |

### 4.2 Gentle Mode

| 项目 | 行为 |
|------|------|
| 应用 | 先警告，后隐藏窗口 |
| 浏览器标签 | 显示警告覆盖层 |
| Skip Token | 3-5 次/天，最多延迟 15 分钟 |
| 警告 | 10 秒警告 |

**切换限制**: 仅在非工作时间可切换（生产模式）

---

## 5. 特殊模式

### 5.1 Demo Mode

**文件**: `src/services/demo-mode.service.ts`

**用途**: 产品演示时暂停所有强制执行

**激活条件**:
1. 无活跃 Demo 会话
2. 无活跃 Pomodoro
3. 有可用 Token
4. 输入确认短语："I am presenting"

**配置**:
- 每月 Token: 1-10 (默认 3)
- 最大时长: 30-180 分钟 (默认 90)
- Token 每月初重置

### 5.2 Entertainment Mode

**文件**: `src/services/entertainment.service.ts`

**用途**: 自由时间的娱乐配额管理

**启动条件**:
1. 无活跃会话
2. 不在工作时间内
3. 配额剩余 > 0
4. 冷却期已过

**配置**:
- 每日配额: 30-480 分钟 (默认 120)
- 冷却时间: 15-120 分钟 (默认 30)
- 每日 04:00 重置

**停止原因**:
- `manual` - 用户手动停止
- `quota_exhausted` - 配额用尽
- `work_time_start` - 工作时间开始

---

## 6. 通知系统

**文件**: `electron/modules/notification-manager.ts`

### 6.1 通知类型

| 类型 | 用途 | 紧急程度 |
|------|------|----------|
| `info` | 一般信息 | low |
| `warning` | 警告提醒 | normal |
| `error` | 错误通知 | critical |

### 6.2 通知场景

| 场景 | 标题 | 内容 |
|------|------|------|
| 睡眠时间开始 | 🌙 睡眠时间到了 | 现在是休息时间... |
| 应用即将关闭 | ⚠️ {context} | 以下应用将在 X 秒后关闭... |
| Snooze 激活 | ⏰ 睡眠提醒已暂停 | 睡眠提醒将在 X 分钟后恢复 |
| Snooze 拒绝 | ❌ 无法暂停 | 今晚的暂停次数已用完 |

---

## 7. 策略分发

### 7.1 WebSocket 连接

**服务端**: `src/server/socket.ts`
**客户端**: `electron/modules/connection-manager.ts`

**事件**:
- `policy:update` - 策略更新推送
- `policy:request` - 客户端请求策略
- `sleep:snoozeRequest` - Snooze 请求

### 7.2 离线缓存

**文件**: `~/Library/Application Support/vibeflow-desktop/vibeflow-policy-cache.json`

**结构**:
```typescript
interface PolicyCache {
  policy: Policy;
  cachedAt: number;
  lastSyncedAt: number;
  isStale: boolean;
}
```

---

## 8. 多端扩展指南

### 8.1 移动端适配要点

| 功能 | 桌面端 | 移动端建议 |
|------|--------|------------|
| 应用关闭 | 强制退出/隐藏 | 通知提醒 + 使用时长统计 |
| 空闲检测 | powerMonitor | 屏幕状态 + 加速度计 |
| 窗口置顶 | BrowserWindow.focus() | 推送通知 + 全屏提醒 |
| 浏览器控制 | 扩展程序 | 系统级 VPN/DNS 过滤 |

### 8.2 共享逻辑

以下逻辑可跨端复用:
- 时间段判断 (`isWithinWorkHours`, `isTimeInSleepWindow`)
- 状态机定义 (`vibeflow.machine.ts`)
- 配额计算 (Entertainment, Demo Mode)
- 策略结构和验证

### 8.3 平台特定实现

| 模块 | 需要平台特定实现 |
|------|------------------|
| App Monitor | 是 - 进程管理 API 不同 |
| Notification | 是 - 通知 API 不同 |
| Idle Detection | 是 - 系统 API 不同 |
| Window Control | 是 - 窗口管理不同 |

---

## 9. 调试日志

### 9.1 关键日志点

| 模块 | 日志前缀 | 关键事件 |
|------|----------|----------|
| ConnectionManager | `[ConnectionManager]` | 连接状态变化 |
| SleepEnforcer | `[SleepEnforcer]` | 睡眠时间检测、应用监控 |
| AppMonitor | `[AppMonitor:{context}]` | 应用检测、关闭操作 |
| FocusEnforcer | `[FocusEnforcer]` | 干预触发、Skip Token |

### 9.2 排查流程

1. 检查 WebSocket 连接状态
2. 验证策略缓存内容
3. 确认时间段判断结果
4. 查看 Enforcer 启动日志
5. 检查应用监控循环

---

## 10. 已知问题与改进建议

### 10.1 状态机设计问题

**问题**: `over_rest` 状态定位模糊
- 可以从 `planning` 和 `rest` 两个状态进入
- 与 `rest` 的边界不清晰
- 缺少明确的 `idle` 状态

**建议**: 将 `over_rest` 作为 `rest` 的超时分支，而非独立状态入口

### 10.2 Enforcer 职责重叠

**问题**: Focus Enforcer 和 Over-Rest Enforcer 都会关闭分心应用，触发条件和行为略有不同

**建议**: 统一为单一的 `DistractionEnforcer`，根据当前状态决定行为

### 10.3 空闲检测不够智能

**问题**: `powerMonitor.getSystemIdleTime()` 在以下场景会误判：
- 用户在看视频/阅读文档
- 用户在开会（屏幕共享但无本地操作）

**建议**:
- 增加活跃窗口检测
- 增加白名单应用（Zoom、Teams 活跃时不算空闲）
- 考虑摄像头/麦克风状态

### 10.4 时间段优先级不明确

**问题**: 睡眠时间、工作时间、自由时间可能重叠时的处理逻辑分散

**建议**: 明确优先级链并统一判断：
```
睡眠时间 > 临时工作时间 > 工作时间 > 自由时间
```

### 10.5 Skip Token 体验问题

**问题**:
- Strict 模式 1 次/天过于严格
- Token 消耗逻辑分散
- 用户不知道剩余次数

**建议**:
- 在 Tray Menu 显示剩余 Token 数
- 考虑按周累计而非按天重置

### 10.6 多端逻辑分散

**问题**:
- 状态机在 `src/machines`（web 端）
- Enforcer 在 `electron/modules`（桌面端）
- 移动端需要重新实现

**建议**: 将核心规则逻辑抽取到 `@vibeflow/core` 包

### 10.7 Demo Mode 用户体验

**问题**: 需要输入确认短语，每月只有 3 次

**建议**:
- 改为快捷键 + 二次确认
- 增加"会议模式"自动检测

### 10.8 WebSocket 连接架构 ⚠️ 高优先级

**问题**: 主进程和渲染进程有独立的 WebSocket 连接，可能导致状态不一致

**现象**: 渲染进程显示 "Offline" 但主进程连接正常，Sleep Enforcer 正常工作但 UI 无响应

**建议**:
- 只在主进程维护一个连接
- 渲染进程通过 IPC 获取状态
- 减少连接数，简化状态同步

**状态**: 部分修复

**已完成**:
- `preload.ts` 已添加 IPC 事件监听器，支持从主进程接收:
  - `policyUpdated` - 策略更新
  - `stateSync` - 状态同步
  - `commandReceived` - 服务器命令
- `connection-manager.ts` 已通过 `sendToRenderer()` 转发这些事件

**待完成**:
- Web 应用需要检测 Electron 环境并使用 IPC 而非直接 Socket 连接
- 需要在 vibeflow-web 仓库中修改 socket 客户端逻辑

---

## 11. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0 | 2026-01-12 | 初始文档，覆盖所有现有规则 |
| 1.1 | 2026-01-12 | 添加已知问题与改进建议章节 |
