# MCP Capability Enhancement - Technical Design

## Overview

扩展 VibeFlow MCP Server 的能力，新增 Tools，使 AI Agent 能够完整地进行任务管理和梳理工作。

---

## 已实现能力（无需重复实现）

### 已有 Tools
- `flow_update_project` - 更新项目
- `flow_get_project` - 获取项目详情
- `flow_get_top3` - 获取 Top 3 任务
- `flow_set_top3` - 设置 Top 3 任务

### 已有 Resources
- `vibe://state/current` - 当前系统状态
- `vibe://projects/all` - 所有项目列表
- `vibe://timeline/today` - 今日时间线

---

## 待实现 Tools（8个）

### 1. 任务查询 Tools

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

#### 1.2 flow_get_backlog_tasks

```typescript
interface GetBacklogTasksInput {
  project_id?: string;  // optional filter
  limit?: number;       // default 50
}
```

#### 1.3 flow_get_overdue_tasks

```typescript
interface GetOverdueTasksInput {
  project_id?: string;
  include_today?: boolean;  // default false
}
```

### 2. 任务更新 Tools

#### 2.1 flow_update_task

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

#### 2.2 flow_set_plan_date

```typescript
interface SetPlanDateInput {
  task_id: string;
  plan_date: string | null;  // ISO date or null to clear
}
```

#### 2.3 flow_delete_task

```typescript
interface DeleteTaskInput {
  task_id: string;
}
```

#### 2.4 flow_move_task

```typescript
interface MoveTaskInput {
  task_id: string;
  target_project_id: string;
}

interface MoveTaskOutput {
  success: boolean;
  task?: {
    id: string;
    title: string;
    projectId: string;
    projectTitle: string;
  };
  error?: { code: string; message: string };
}
```

### 3. 项目管理 Tools

#### 3.1 flow_create_project

```typescript
interface CreateProjectInput {
  title: string;
  deliverable: string;
  goal_id?: string;
}

interface CreateProjectOutput {
  success: boolean;
  project?: {
    id: string;
    title: string;
    deliverable: string;
    status: string;
  };
  error?: { code: string; message: string };
}
```

---

## 实现策略

### 代码组织

所有新增 Tools 添加到 `src/mcp/tools.ts`:
1. 在 `TOOLS` 常量中添加新工具名
2. 添加对应的 Input 接口
3. 在 `registerTools()` 中注册工具 schema
4. 在 `handleToolCall()` 中添加 case 分支
5. 实现具体的 handler 函数

### 复用现有 Service

| 新增能力 | 复用 Service |
|---------|-------------|
| 任务查询/更新/移动 | taskService |
| 项目创建 | projectService |

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

每个新增 Tool 需要测试:
1. 正常输入返回正确结果
2. 无效输入返回 VALIDATION_ERROR
3. 资源不存在返回 NOT_FOUND
4. 权限检查（userId 匹配）
