# Design Document: iOS Mobile Enhancement

## Overview

本文档定义了 iOS 客户端从"只读状态查看器"升级为"轻量级操作终端"的技术设计。

### 核心变化

| 方面 | 现状 | 目标 |
|------|------|------|
| 通信模式 | 单向（Server → Client） | 双向（Server ↔ Client） |
| 状态管理 | 只读 | 乐观更新 + 服务端确认 |
| 用户操作 | 无 | 任务、番茄钟、设置管理 |

## Architecture

### 通信架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         iOS Client                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   Screens   │───▶│   Store     │◀───│  Services   │         │
│  │             │    │  (Zustand)  │    │             │         │
│  └─────────────┘    └──────┬──────┘    └──────┬──────┘         │
│                            │                   │                 │
│                     ┌──────▼───────────────────▼──────┐         │
│                     │      Action Service             │         │
│                     │  (Optimistic Update + Queue)    │         │
│                     └──────────────┬──────────────────┘         │
│                                    │                             │
│                     ┌──────────────▼──────────────────┐         │
│                     │      WebSocket Service          │         │
│                     │  (Send Events + Receive Cmds)   │         │
│                     └──────────────┬──────────────────┘         │
└────────────────────────────────────┼────────────────────────────┘
                                     │
                          Socket.io (OCTOPUS Protocol)
                                     │
┌────────────────────────────────────▼────────────────────────────┐
│                         Vibe Brain (Server)                      │
└─────────────────────────────────────────────────────────────────┘
```

### 事件流

```
User Action → Optimistic Update → Send Event → Server Process → Broadcast State
     │                                              │
     └──────────── UI 立即响应 ◀─────────────────────┘
                                          (确认/回滚)
```

## Components and Interfaces

### 1. Action Service（新增）

```typescript
// src/services/action.service.ts

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

interface ActionService {
  // 任务操作
  completeTask(taskId: string): Promise<ActionResult>;
  updateTaskStatus(taskId: string, status: TaskStatus): Promise<ActionResult>;
  createTask(task: CreateTaskInput): Promise<ActionResult<{ taskId: string }>>;
  updateTask(taskId: string, updates: UpdateTaskInput): Promise<ActionResult>;

  // 番茄钟操作
  startPomodoro(taskId?: string): Promise<ActionResult<{ pomodoroId: string }>>;
  switchTask(pomodoroId: string, newTaskId: string): Promise<ActionResult>;

  // Top 3 操作
  setTop3(taskIds: string[]): Promise<ActionResult>;

  // 设置操作
  updateFocusPolicy(policy: FocusPolicyUpdate): Promise<ActionResult>;
  updateSleepTime(sleepTime: SleepTimeUpdate): Promise<ActionResult>;
}
```

### 2. WebSocket Service（扩展）

```typescript
// 新增事件类型
type UserActionType =
  | 'TASK_COMPLETE'
  | 'TASK_STATUS_CHANGE'
  | 'TASK_CREATE'
  | 'TASK_UPDATE'
  | 'POMODORO_START'
  | 'POMODORO_SWITCH_TASK'
  | 'TOP3_SET'
  | 'POLICY_UPDATE'
  | 'SLEEP_TIME_UPDATE';

interface UserActionEvent extends BaseEvent {
  eventType: 'USER_ACTION';
  payload: {
    actionType: UserActionType;
    data: Record<string, unknown>;
    optimisticId: string;
  };
}
```

### 3. App Store（扩展）

```typescript
interface AppActionsExtension {
  // 乐观更新
  applyOptimisticUpdate(update: OptimisticUpdate): void;
  confirmOptimisticUpdate(optimisticId: string): void;
  rollbackOptimisticUpdate(optimisticId: string): void;

  // 项目数据
  projects: ProjectData[];
  selectedProjectId: string | null;

  // 设置数据
  sleepTime: SleepTimeData | null;
  focusPolicy: FocusPolicyData | null;
}
```

### 4. 新增类型定义

```typescript
// 项目数据
interface ProjectData {
  id: string;
  title: string;
  taskCount: number;
  completedCount: number;
}

// 睡眠时间
interface SleepTimeData {
  enabled: boolean;
  startTime: string;  // "HH:mm"
  endTime: string;
}

// 专注策略
interface FocusPolicyData {
  whitelist: AppInfo[];
  blacklist: AppInfo[];
}

interface AppInfo {
  bundleId: string;
  name: string;
}
```

## Data Flow

### 任务完成流程

```
1. User taps checkbox
2. Store: optimisticCompleteTask(taskId) → 保存旧状态，更新 UI
3. ActionService: completeTask(taskId) → 发送 WebSocket 事件
4. Server: 处理并广播 SYNC_STATE
5. Client: 确认或回滚乐观更新
```

### 番茄钟启动流程

```
1. User taps "Start Pomodoro"
2. Store: optimisticStartPomodoro() → 创建本地状态
3. ActionService: startPomodoro(taskId) → 发送事件
4. Server: 创建记录，广播状态
5. Client: 确认，启动本地计时器
```

## API Specifications

### WebSocket Events (Client → Server)

```typescript
// USER_ACTION Event
{
  eventType: 'USER_ACTION',
  payload: {
    actionType: UserActionType,
    optimisticId: string,
    data: ActionData
  }
}

// Action Data Examples
TASK_COMPLETE: { taskId: string }
TASK_CREATE: { title: string, priority?: string, projectId?: string }
POMODORO_START: { taskId?: string }
TOP3_SET: { taskIds: string[] }
POLICY_UPDATE: { whitelist?: string[], blacklist?: string[] }
SLEEP_TIME_UPDATE: { enabled: boolean, startTime?: string, endTime?: string }
```

### WebSocket Events (Server → Client)

```typescript
// ACTION_RESULT Event（新增）
{
  commandType: 'ACTION_RESULT',
  payload: {
    optimisticId: string,
    success: boolean,
    error?: { code: string, message: string }
  }
}
```

## UI Components

### 新增/修改组件

| 组件 | 类型 | 说明 |
|------|------|------|
| TaskItem | 修改 | 添加 checkbox、swipe actions |
| PomodoroCard | 修改 | 添加启动按钮 |
| QuickTaskInput | 新增 | 快速任务创建 |
| TaskDetailScreen | 新增 | 任务编辑页面 |
| Top3Selector | 新增 | Top 3 选择模态框 |
| FocusPolicyScreen | 新增 | 专注策略管理 |
| SleepTimeSettings | 新增 | 睡眠时间设置 |

### 导航结构

```
TabNavigator
├── StatusScreen (Home)
│   ├── PomodoroCard
│   ├── Top3Section
│   └── TaskList
├── ProjectsScreen (新增)
└── SettingsScreen
    ├── FocusPolicySection (新增)
    └── SleepTimeSection (新增)
```

## Implementation Strategy

### Phase 1: 基础交互能力
1. 扩展 WebSocket Service 支持发送事件
2. 实现 Action Service
3. 扩展 Store 支持乐观更新
4. 实现任务完成和番茄钟启动

### Phase 2: 任务管理
1. 快速任务创建
2. 任务状态切换
3. 任务编辑
4. Top 3 管理

### Phase 3: 项目和设置
1. 项目显示和筛选
2. 专注策略管理
3. 睡眠时间设置
4. 推送通知

## Error Handling

| 错误类型 | 处理方式 |
|---------|---------|
| NETWORK_ERROR | 显示 toast，保留乐观更新，后台重试 |
| UNAUTHORIZED | 清除状态，跳转登录 |
| NOT_FOUND | 回滚乐观更新，显示 toast |
| VALIDATION_ERROR | 回滚乐观更新，显示具体错误 |
| SERVER_ERROR | 回滚乐观更新，显示通用错误 |

## Testing Strategy

- 单元测试：Action Service、Store 状态变更
- 集成测试：端到端操作流程
- 手动测试：真机交互、网络切换
