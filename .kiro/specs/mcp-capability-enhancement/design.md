# MCP Capability Enhancement - Technical Design

## Overview

扩展 VibeFlow MCP Server 的能力，新增 Tools 和 Resources，使 AI Agent 能够完整地进行任务管理和梳理工作。

---

## 架构设计

### 现有架构

```
┌─────────────────────────────────────────────────────────┐
│                    AI Agent (Claude/Cursor)              │
└─────────────────────────────────────────────────────────┘
                              │
                              │ MCP Protocol
                              ▼
┌─────────────────────────────────────────────────────────┐
│                     MCP Server                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │  resources  │  │    tools    │  │      auth       │  │
│  │   (11个)    │  │   (14个)    │  │  (MCPContext)   │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│                   Service Layer                          │
│  taskService, projectService, pomodoroService, etc.     │
└─────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│                   Prisma + PostgreSQL                    │
└─────────────────────────────────────────────────────────┘
```

### 扩展后架构

新增的 Tools 和 Resources 将复用现有 Service Layer，无需修改底层架构。

---

## 新增 Tools 设计

### Phase 1: 核心任务管理

#### 1.1 flow_get_task

```typescript
interface GetTaskInput {
  task_id: string;
}

interface GetTaskOutput {
  success: boolean;
  task?: {
    id: string;
    title: string;
    description: string | null;
    priority: 'P1' | 'P2' | 'P3';
    status: 'TODO' | 'IN_PROGRESS' | 'DONE';
    planDate: string | null;
    estimatedMinutes: number | null;
    actualMinutes: number | null;
    projectId: string;
    projectTitle: string;
    parentId: string | null;
    subtasks: Array<{ id: string; title: string; status: string }>;
    pomodoroCount: number;
    blockers: Array<{ id: string; description: string; status: string }>;
    createdAt: string;
    updatedAt: string;
  };
  error?: { code: string; message: string };
}
```

#### 1.2 flow_update_task

```typescript
interface UpdateTaskInput {
  task_id: string;
  title?: string;
  description?: string;
  priority?: 'P1' | 'P2' | 'P3';
  estimated_minutes?: number;
  plan_date?: string | null;  // ISO date or null to clear
}
```

#### 1.3 flow_delete_task

```typescript
interface DeleteTaskInput {
  task_id: string;
  archive?: boolean;  // default true, soft delete
}
```

#### 1.4 flow_get_backlog_tasks

```typescript
interface GetBacklogTasksInput {
  project_id?: string;  // optional filter
  limit?: number;       // default 50
}
```

#### 1.5 flow_get_overdue_tasks

```typescript
interface GetOverdueTasksInput {
  project_id?: string;
  include_today?: boolean;  // default false
}
```

#### 1.6 flow_set_plan_date

```typescript
interface SetPlanDateInput {
  task_id: string;
  plan_date: string | null;  // ISO date or null to clear
}
```

### Phase 2: 项目管理

#### 2.1 flow_create_project

```typescript
interface CreateProjectInput {
  title: string;
  deliverable: string;
  goal_id?: string;
}
```

#### 2.2 flow_update_project

```typescript
interface UpdateProjectInput {
  project_id: string;
  title?: string;
  deliverable?: string;
  status?: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
}
```

#### 2.3 flow_archive_project

```typescript
interface ArchiveProjectInput {
  project_id: string;
}
```

#### 2.4 flow_get_project

```typescript
interface GetProjectInput {
  project_id: string;
  include_tasks?: boolean;  // default true
}
```

### Phase 3: 每日状态管理

#### 3.1 flow_set_top3

```typescript
interface SetTop3Input {
  task_ids: [string, string?, string?];  // 1-3 task IDs
}
```

#### 3.2 flow_get_top3

```typescript
// No input required, returns current Top 3
```

#### 3.3 flow_complete_airlock

```typescript
// No input required, transitions PLANNING → FOCUS
```

### Phase 4: 番茄钟控制

#### 4.1 flow_abort_pomodoro

```typescript
interface AbortPomodoroInput {
  pomodoro_id?: string;  // optional, defaults to current
  reason?: string;
}
```

---

## 新增 Resources 设计

### Phase 1

#### vibe://state/current

```typescript
interface StateCurrentResource {
  state: 'LOCKED' | 'PLANNING' | 'FOCUS' | 'REST';
  stateStartedAt: string;
  canTransitionTo: string[];
  todayStats: {
    completedPomodoros: number;
    expectedPomodoros: number;
    completedTasks: number;
  };
}
```

### Phase 2

#### vibe://projects/all

```typescript
interface ProjectsAllResource {
  projects: Array<{
    id: string;
    title: string;
    status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
    taskCount: number;
    completedTaskCount: number;
    createdAt: string;
  }>;
}
```

#### vibe://planning/suggestions

```typescript
interface PlanningSuggestionsResource {
  suggestedTop3: Array<{
    taskId: string;
    taskTitle: string;
    projectTitle: string;
    priority: string;
    reason: string;  // 推荐理由
  }>;
  totalBacklogCount: number;
  overdueCount: number;
}
```

### Phase 3

#### vibe://pomodoro/today

```typescript
interface PomodoroTodayResource {
  completed: number;
  expected: number;
  remaining: number;
  totalFocusMinutes: number;
  currentStreak: number;
}
```

#### vibe://timeline/today

```typescript
interface TimelineTodayResource {
  events: Array<{
    type: 'pomodoro' | 'task_completed' | 'break' | 'activity';
    startTime: string;
    endTime: string | null;
    title: string;
    taskId?: string;
  }>;
  gaps: Array<{
    startTime: string;
    endTime: string;
    durationMinutes: number;
  }>;
}
```

#### vibe://tasks/recent

```typescript
interface TasksRecentResource {
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    projectTitle: string;
    updatedAt: string;
    changeType: 'created' | 'updated' | 'completed';
  }>;
}
```

---

## 实现策略

### 代码组织

所有新增 Tools 添加到 `src/mcp/tools.ts`:
- 在 `TOOLS` 常量中添加新工具名
- 添加对应的 Input 接口
- 在 `registerTools()` 中注册工具 schema
- 在 `handleToolCall()` 中添加 case 分支
- 实现具体的 handler 函数

所有新增 Resources 添加到 `src/mcp/resources.ts`:
- 在 `RESOURCE_URIS` 中添加新 URI
- 添加对应的 Resource 接口
- 在 `registerResources()` 中注册资源
- 在 `handleResourceRead()` 中添加 case 分支
- 实现具体的 getter 函数

### 复用现有 Service

| 新增能力 | 复用 Service |
|---------|-------------|
| 任务查询/更新 | taskService |
| 项目管理 | projectService |
| 每日状态 | dailyStateService |
| 番茄钟控制 | pomodoroService |
| 统计数据 | statsService |
| 时间线 | timelineService |

### 错误处理

统一错误响应格式:

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: 'VALIDATION_ERROR' | 'NOT_FOUND' | 'PERMISSION_DENIED' | 'INTERNAL_ERROR';
    message: string;
  };
}
```

---

## 测试策略

### 单元测试

每个新增 Tool/Resource 需要测试:
1. 正常输入返回正确结果
2. 无效输入返回 VALIDATION_ERROR
3. 资源不存在返回 NOT_FOUND
4. 权限检查（userId 匹配）

### 集成测试

通过 MCP 客户端测试完整流程:
1. 创建项目 → 创建任务 → 设置 Top 3 → 开始番茄钟
2. 查询积压任务 → 批量设置计划日期
3. 获取每日总结 → 验证统计数据

---

## 风险与缓解

| 风险 | 缓解措施 |
|-----|---------|
| 新增 Tools 过多导致 AI 选择困难 | 按功能分组，提供清晰的 description |
| 批量操作性能问题 | 使用事务，限制单次操作数量 |
| 权限泄露 | 所有操作验证 userId |
