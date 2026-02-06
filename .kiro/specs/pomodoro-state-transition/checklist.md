# 番茄工作法状态转换检查清单

## 状态机概览

```
LOCKED → PLANNING → FOCUS → REST → PLANNING
                ↑          ↓
                ← ← OVER_REST ←
```

## 场景检查清单

### 场景 1: 启动番茄（从任务页）

| 步骤 | 预期行为 | 检查点 |
|------|----------|--------|
| 1. 点击任务的启动按钮 | 调用 `pomodoro.start` API | |
| 2. API 成功返回 | 状态更新为 `FOCUS` | |
| 3. 数据刷新 | `getCurrent` 和 `getToday` 完成 refetch | |
| 4. 页面跳转 | 跳转到 `/pomodoro` | |
| 5. 番茄页面渲染 | 显示计时器 (PomodoroTimer)，不是休息界面 | |
| 6. 状态栏更新 | Header 显示 FOCUS 状态 | |
| 7. 桌面端更新 | 托盘菜单显示 FOCUS 状态 | |

**关键代码**: `src/components/tasks/task-pomodoro-button.tsx` lines 47-56

### 场景 2: 启动番茄（从番茄页）

| 步骤 | 预期行为 | 检查点 |
|------|----------|--------|
| 1. 在番茄页选择任务并启动 | 调用 `pomodoro.start` API | |
| 2. API 成功返回 | 状态更新为 `FOCUS` | |
| 3. 页面自动切换 | 从任务选择切换到计时器显示 | |
| 4. WebSocket 广播 | 其他客户端收到 `STATE_CHANGE` | |

**关键代码**: `src/components/pomodoro/pomodoro-timer.tsx` lines 147-169

### 场景 3: 番茄自然完成

| 步骤 | 预期行为 | 检查点 |
|------|----------|--------|
| 1. 倒计时到 0 | 自动触发 `completeMutation` | |
| 2. API 调用 | `pomodoro.complete` 更新数据库 | |
| 3. 状态转换 | `FOCUS` → `REST` | |
| 4. WebSocket 广播 | 发送 `STATE_CHANGE` 和 `POMODORO_COMPLETE` | |
| 5. 页面自动切换 | PomodoroTimer → RestModeUI | |
| 6. 通知播放 | 播放完成音效 | |
| 7. 状态栏更新 | Header 显示 REST + 倒计时 | |
| 8. 桌面端更新 | 托盘显示 REST，policy 更新 | |

**关键代码**:
- `src/components/pomodoro/pomodoro-timer.tsx` lines 365-369 (自动完成)
- `src/server/routers/pomodoro.ts` lines 181-280 (服务端处理)

### 场景 4: 手动中止番茄

| 步骤 | 预期行为 | 检查点 |
|------|----------|--------|
| 1. 点击中止按钮 | 确认对话框 | |
| 2. 确认中止 | 调用 `pomodoro.abort` API | |
| 3. 状态转换 | `FOCUS` → `PLANNING` | |
| 4. 页面切换 | 显示任务选择界面 | |
| 5. WebSocket 广播 | 发送 `STATE_CHANGE` | |

**关键代码**: `src/components/pomodoro/pomodoro-timer.tsx` lines 223-243

### 场景 5: 休息自然结束（自动启动开启）

| 步骤 | 预期行为 | 检查点 |
|------|----------|--------|
| 1. 休息倒计时到 0 | 显示自动启动倒计时 (5秒) | |
| 2. 自动启动倒计时到 0 | 调用 `pomodoro.start` | |
| 3. 状态转换 | `REST` → `FOCUS` | |
| 4. 页面自动切换 | RestModeUI → PomodoroTimer | |

**关键代码**: `src/components/pomodoro/rest-mode.tsx` lines 256-291

### 场景 6: 休息自然结束（自动启动关闭）

| 步骤 | 预期行为 | 检查点 |
|------|----------|--------|
| 1. 休息倒计时到 0 | 显示 "Ready to continue?" | |
| 2. 播放提醒音效 | 每10秒播放一次 | |
| 3. 点击 "Start Focus Session" | 调用 `pomodoro.start` | |
| 4. 状态转换 | `REST` → `FOCUS` | |
| 5. 页面自动切换 | RestModeUI → PomodoroTimer | |

**关键代码**: `src/components/pomodoro/rest-mode.tsx` lines 230-253

### 场景 7: 跳过休息

| 步骤 | 预期行为 | 检查点 |
|------|----------|--------|
| 1. 点击 "Skip Rest" | 调用 `dailyState.updateSystemState('planning')` | |
| 2. 状态转换 | `REST` → `PLANNING` | |
| 3. 页面切换 | 显示任务选择界面 | |
| 4. WebSocket 广播 | 发送 `STATE_CHANGE` | |

**关键代码**: `src/components/pomodoro/rest-mode.tsx` lines 212-227

### 场景 8: 页面刷新恢复

| 步骤 | 预期行为 | 检查点 |
|------|----------|--------|
| **FOCUS 状态刷新** | | |
| 1. 刷新 `/pomodoro` | 显示计时器 | |
| 2. 计时器恢复 | 从服务器获取 `timeRemaining`，继续倒计时 | |
| **REST 状态刷新** | | |
| 1. 刷新 `/pomodoro` | 显示休息界面 | |
| 2. 休息时间恢复 | 从 `getRestStatus` 计算已过时间 | |
| 3. 如果已超时 | 显示自动启动或等待确认 | |

**关键代码**:
- `src/components/pomodoro/pomodoro-timer.tsx` lines 287-322 (focus 恢复)
- `src/components/pomodoro/rest-mode.tsx` lines 115-141 (rest 恢复)

### 场景 9: 状态栏实时更新

| 状态 | 状态栏显示 | 检查点 |
|------|------------|--------|
| LOCKED | 🔒 Locked | |
| PLANNING | 📋 Planning | |
| FOCUS | 🎯 Focus | |
| REST | ☕ Rest (4:30) | 显示倒计时 |
| OVER_REST | ⚠️ Over Rest (2:30) | 显示超时时间 |

**关键代码**: `src/components/layout/header.tsx` lines 48-77

### 场景 10: Over-Rest 处理

| 步骤 | 预期行为 | 检查点 |
|------|----------|--------|
| 1. 休息时间超过设定 | 状态变为 `OVER_REST` | |
| 2. UI 显示警告 | 状态栏显示超时时间 | |
| 3. 启动新番茄 | `OVER_REST` → `FOCUS` | |

**关键代码**: `src/services/daily-state.service.ts` lines 168-175

---

## 实时同步检查点

### WebSocket 事件流

```
服务端                              客户端
   │                                  │
   │  STATE_CHANGE                    │
   │ ────────────────────────────────→│ useSocket 更新 systemState
   │                                  │ 触发组件重新渲染
   │                                  │
   │  SYNC_POLICY                     │
   │ ────────────────────────────────→│ 更新完整 policy 对象
   │                                  │ 桌面端更新 enforcement
   │                                  │
   │  EXECUTE (POMODORO_COMPLETE)     │
   │ ────────────────────────────────→│ 触发特定命令处理
   │                                  │
```

### 数据刷新策略

| 操作 | 刷新方法 | 原因 |
|------|----------|------|
| 启动番茄 | `refetch()` + `await` | 需要等待数据更新后再跳转 |
| 完成番茄 | `refetch()` + `await` | 防止页面显示旧数据 |
| 跳过休息 | `refetch()` + `await` | 确保状态同步后再切换 UI |
| WebSocket 触发 | `invalidate()` | 后台更新，不阻塞 UI |

---

## 已知问题和修复

### ✅ 已修复
1. 休息时间刷新后重置 - 添加 `getRestStatus` API
2. 状态栏不显示休息倒计时 - Header 添加实时计时
3. 启动番茄时闪烁休息界面 - 添加 `pomodoroLoading` 检查
4. 跳过休息无效 - `invalidate` 改为 `refetch`
5. Planning 被错误覆盖为 over_rest - 限制 over-rest 检查

### ⏳ 待验证
1. 番茄完成后页面自动切换到休息
2. 休息结束后页面自动切换回计时器
3. 桌面端状态同步

---

## 2025-01-30 重构修复

### 修复的关键 Bug

#### Bug 1: CompletionModal 同时调用两个回调
**位置**: `completion-modal.tsx` `handleManualStartBreak`

```typescript
// 修复前 - 导致竞态条件
onStartBreak?.();  // API 调用 1: 设置状态为 'rest'
onConfirm();       // API 调用 2: 设置状态为 'planning' (错误!)

// 修复后 - 只调用一个
onStartBreak?.();  // 只调用这个
```

#### Bug 2: RestModeUI 重复 API 调用
**位置**: `rest-mode.tsx`

```typescript
// 修复前 - 重复调用
updateStateMutation.mutateAsync('planning')
  .onSuccess -> onRestComplete()  // 这又会调用 usePomodoroMachine.endRest
                                   // 导致再次调用 API

// 修复后 - 只通知父组件
onRestComplete();  // 让 usePomodoroMachine 处理 API 调用
```

### 新架构流程

```
┌─────────────────────────────────────────────────────────────────┐
│                     usePomodoroMachine                          │
│  (单一数据源 + 幂等操作 + 集中式 API 调用)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
    │PomodoroTimer│    │ Completion  │    │ RestModeUI  │
    │             │    │   Modal     │    │             │
    │ 只通知:     │    │ 只通知:     │    │ 只通知:     │
    │ onComplete  │    │ onConfirm   │    │onRestComplete│
    │             │    │ onStartBreak│    │             │
    │ 不调用API   │    │ 不调用API   │    │ 不调用API   │
    └─────────────┘    └─────────────┘    └─────────────┘
```

### 状态转换表

| 用户操作 | 组件 | 回调 | usePomodoroMachine action | API 调用 | 新 phase |
|---------|------|------|--------------------------|----------|----------|
| 计时器到 0 | PomodoroTimer | onComplete | triggerComplete() | pomodoro.complete | completing→break_prompt |
| 点击 "Start Break" | CompletionModal | onStartBreak | confirmBreak() | dailyState.updateSystemState('rest') | resting |
| 点击 "Skip Break" | CompletionModal | onConfirm | skipBreak() | dailyState.updateSystemState('planning') | idle |
| 点击 "Skip Rest" | RestModeUI | onRestComplete | endRest() | dailyState.updateSystemState('planning') | idle |
| 点击 "Start Focus Session" | RestModeUI | onRestComplete | endRest() | dailyState.updateSystemState('planning') | idle |

---

## 测试命令

```bash
# 类型检查
npx tsc --noEmit

# 单元测试
npm test

# Lint 检查
npm run lint

# E2E 测试（如有）
npm run e2e
```
