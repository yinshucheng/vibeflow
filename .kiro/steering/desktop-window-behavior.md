# 桌面版窗口前台切换行为分析

## 概述

本文档梳理 VibeFlow 桌面版在不同状态下触发窗口切到前台 (bringToFront) 的所有场景。

## 窗口切换触发源

| 模块                           | 文件位置                                           | 触发条件                               | 频率                              | 番茄钟时是否触发 |
| ------------------------------ | -------------------------------------------------- | -------------------------------------- | --------------------------------- | ---------------- |
| **Focus Enforcer**       | `electron/modules/focus-enforcer.ts:537`         | 工作时间 + 非番茄钟 + 空闲超时         | 按 `repeatIntervalMinutes` 配置 | ❌ 不触发        |
| **Over-Rest Enforcer**   | `electron/modules/over-rest-enforcer.ts:145-160` | `isOverRest && shouldTriggerActions` | 每 30 秒                          | ⚠️ 可能触发    |
| **Notification Manager** | `electron/modules/notification-manager.ts:167`   | 显示干预通知时                         | 事件触发                          | ⚠️ 可能触发    |
| **Sleep Enforcer**       | `electron/modules/sleep-enforcer.ts:419`         | 睡眠时间提醒                           | 事件触发                          | ⚠️ 可能触发    |
| **系统托盘**             | `electron/main.ts:249,254,259`                   | 用户点击托盘菜单                       | 用户操作                          | ✅ 正常行为      |

## 状态流转图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           系统状态                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────┐    开始番茄钟    ┌──────────┐    完成番茄钟    ┌────────┐│
│   │  LOCKED  │ ───────────────► │  FOCUS   │ ───────────────► │  REST  ││
│   │ (空闲)   │                  │ (专注中) │                  │ (休息) ││
│   └──────────┘                  └──────────┘                  └────────┘│
│        │                              │                            │    │
│        │                              │                            │    │
│        ▼                              ▼                            ▼    │
│   ┌──────────────────────────────────────────────────────────────────┐ │
│   │                    窗口切换行为                                    │ │
│   ├──────────────────────────────────────────────────────────────────┤ │
│   │ LOCKED:                                                          │ │
│   │   - Focus Enforcer: 空闲超时后切到前台 (每 repeatInterval)        │ │
│   │   - Sleep Enforcer: 睡眠时间提醒                                  │ │
│   │                                                                  │ │
│   │ FOCUS (番茄钟中):                                                 │ │
│   │   - Focus Enforcer: ❌ 不触发 (isPomodoroActive=true)            │ │
│   │   - Over-Rest Enforcer: ❌ 应该不触发                            │ │
│   │   - Sleep Enforcer: ❌ 番茄钟期间暂停                            │ │
│   │                                                                  │ │
│   │ REST (休息中):                                                    │ │
│   │   - Focus Enforcer: ❌ 不触发                                    │ │
│   │   - Over-Rest Enforcer: 休息超时后每 30 秒切到前台 ⚠️             │ │
│   └──────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

## 关键代码逻辑

### 1. Focus Enforcer - 番茄钟检查

```typescript
// focus-enforcer.ts:147-170
export function shouldTriggerIntervention(
  isWithinWorkHours: boolean,
  isPomodoroActive: boolean,  // ← 关键：番茄钟激活时返回 false
  idleSeconds: number,
  thresholdSeconds: number
): boolean {
  if (!isWithinWorkHours) return false;
  if (isPomodoroActive) return false;  // ← 番茄钟时不干预
  if (idleSeconds < thresholdSeconds) return false;
  return true;
}
```

### 2. Over-Rest Enforcer - 持续切换

```typescript
// over-rest-enforcer.ts:144-160
if (config.bringToFront) {
  if (!this.checkSystemIdle()) {
    this.bringWindowToFront();
  }
  // 每 30 秒切到前台
  this.bringToFrontInterval = setInterval(() => {
    if (!this.isEnforcing) {
      clearInterval(this.bringToFrontInterval);
      return;
    }
    if (!this.checkSystemIdle()) {
      this.bringWindowToFront();
    }
  }, 30 * 1000);
}
```

### 3. Policy 分发 - Over-Rest 判断

```typescript
// policy-distribution.service.ts:244-271
if (overRestStatus.isOverRest && overRestStatus.shouldTriggerActions) {
  overRest = {
    isOverRest: true,
    overRestMinutes: overRestStatus.overRestMinutes,
    enforcementApps: overRestApps,
    bringToFront: true,  // ← 启用窗口切换
  };
}
```

## 潜在问题

### 问题：番茄钟期间 Over-Rest 状态未清除

**场景**：

1. 用户完成番茄钟，进入 REST 状态
2. 休息超时，触发 Over-Rest Enforcer
3. 用户开始新的番茄钟
4. **问题**：如果 `policy.overRest.isOverRest` 没有及时更新为 false，Over-Rest Enforcer 会继续运行

**检查点**：

- `main.ts:938-943`: 番茄钟开始时设置 `focusEnforcer.setPomodoroActive(true)`
- `main.ts:1008-1021`: Over-Rest 状态检查依赖 `policy.overRest?.isOverRest`

**根本原因**：Over-Rest Enforcer 的停止依赖 policy 更新，而不是直接监听番茄钟状态。

## 测试覆盖情况

| 模块                 | 测试文件                    | 覆盖状态 |
| -------------------- | --------------------------- | -------- |
| Focus Enforcer       | ❌ 无                       | 未覆盖   |
| Over-Rest Enforcer   | ❌ 无                       | 未覆盖   |
| Sleep Enforcer       | ❌ 无                       | 未覆盖   |
| Notification Manager | ❌ 无                       | 未覆盖   |
| Tray Manager         | `tray-manager.test.ts`    | 部分覆盖 |
| IPC Integration      | `ipc-integration.test.ts` | 部分覆盖 |

## 建议修复

### 方案 1：番茄钟开始时立即停止 Over-Rest Enforcer

```typescript
// main.ts - 在 focusEnforcer.setPomodoroActive(true) 后添加
if (isFocusSessionActive) {
  focusEnforcer.setPomodoroActive(true);

  // 立即停止 over-rest enforcement
  const overRestEnforcer = getOverRestEnforcer();
  if (overRestEnforcer.isActive()) {
    overRestEnforcer.stop();
  }
}
```

### 方案 2：Over-Rest Enforcer 内部检查番茄钟状态

```typescript
// over-rest-enforcer.ts - 在 bringToFrontInterval 中添加检查
this.bringToFrontInterval = setInterval(() => {
  if (!this.isEnforcing || this.isPomodoroActive) {  // ← 添加番茄钟检查
    return;
  }
  // ...
}, 30 * 1000);
```

## 调试方法

1. 打开桌面端开发者工具 (Cmd+Option+I)
2. 查看控制台日志：
   - `[OverRestEnforcer] Starting enforcement` - Over-Rest 被激活
   - `[Main] Over rest detected` - Policy 包含 over-rest
   - `[FocusEnforcer] Executing intervention` - Focus 干预触发
3. 检查当前 policy：在控制台执行 `window.vibeflow.debug?.getPolicy?.()`
