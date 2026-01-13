# Technical Design Document

## Overview

本文档描述番茄工作法多任务增强功能的技术设计，对应 `requirements.md` 中定义的 9 个需求。

### 设计原则

1. **最小侵入**: 尽量复用现有架构，避免大规模重构
2. **渐进增强**: 现有单任务番茄钟行为保持不变
3. **数据优先**: 先建立 Task_Time_Slice 数据模型，再构建上层功能
4. **离线友好**: 时间片数据本地优先，后台同步

---

## 1. 数据模型

### 1.1 新增: TaskTimeSlice

```prisma
model TaskTimeSlice {
  id              String   @id @default(cuid())
  pomodoroId      String
  taskId          String?  // null = taskless time
  startTime       DateTime
  endTime         DateTime?
  durationSeconds Int?     // computed on end
  isFragment      Boolean  @default(false)  // < 30s 的碎片时间
  createdAt       DateTime @default(now())

  pomodoro        PomodoroSession @relation(fields: [pomodoroId], references: [id])
  task            Task?           @relation(fields: [taskId], references: [id])

  @@index([pomodoroId])
  @@index([taskId])
}
```

### 1.2 修改: PomodoroSession

```prisma
model PomodoroSession {
  // ... existing fields ...

  // 新增字段
  isTaskless            Boolean  @default(false)  // 无任务番茄钟标记
  taskSwitchCount       Int      @default(0)      // 任务切换次数
  label                 String?                   // Taskless 番茄钟的标签
  continuousWorkSeconds Int      @default(0)      // 连续工作时间（支持心流延长）

  // 新增关系
  timeSlices      TaskTimeSlice[]
}
```

### 1.3 新增: ProductivityAppConfig (Desktop Policy)

扩展 `DesktopPolicy` 类型:

```typescript
interface DesktopPolicy {
  // ... existing fields ...

  // 新增: 休息时限制的生产力应用
  restEnforcement?: {
    enabled: boolean;
    productivityApps: PolicySleepEnforcementApp[];
  };
}
```

---

## 2. 状态机修改

### 2.1 Context 扩展

**设计决策**: 废弃 `currentTaskId` 双字段方案，统一使用 `taskStack` 结构。

```typescript
// src/machines/vibeflow.machine.ts

interface TaskStackEntry {
  taskId: string | null;  // null = taskless segment
  startedAt: Date;
}

interface VibeFlowContext {
  // ... existing fields ...
  // 移除 currentTaskId，改用 taskStack

  // 新增字段
  taskStack: TaskStackEntry[];       // 任务栈，记录所有切换
  currentTimeSliceId: string | null; // 当前时间片 ID

  // isTaskless: 标记番茄钟启动时的意图
  // - true: 用户选择 "Start Focus Time" 启动
  // - false: 用户选择 "Start with Task" 启动
  // 注意：即使 isTaskless=true，用户仍可通过 ASSOCIATE_TASK 关联任务
  isTaskless: boolean;
}

// 语义说明:
// - taskStack[0] = 番茄钟启动时的初始任务
// - taskStack[taskStack.length - 1] = 当前活跃任务
// - 获取当前任务: taskStack.at(-1)?.taskId
```

### 2.2 新增 Events

```typescript
type VibeFlowEvent =
  | // ... existing events ...
  | { type: 'SWITCH_TASK'; taskId: string | null }
  | { type: 'COMPLETE_CURRENT_TASK' }
  | { type: 'START_TASKLESS_POMODORO'; pomodoroId: string }
  | { type: 'ASSOCIATE_TASK'; taskId: string };
```

### 2.3 Guards 修改

```typescript
guards: {
  // 修改: 允许 taskId 为 null (支持无任务番茄钟)
  canStartPomodoro: ({ context }) => {
    return context.todayPomodoroCount < context.dailyCap;
  },
}
```

### 2.4 新增 Actions

```typescript
actions: {
  switchTask: assign({
    taskStack: ({ context, event }) => {
      if (event.type !== 'SWITCH_TASK') return context.taskStack;
      return [...context.taskStack, { taskId: event.taskId, startedAt: new Date() }];
    },
  }),

  startTasklessPomodoro: assign({
    isTaskless: () => true,
    taskStack: () => [],
    pomodoroStartTime: () => new Date(),
  }),

  associateTask: assign({
    isTaskless: () => false,
    taskStack: ({ event }) => {
      if (event.type !== 'ASSOCIATE_TASK') return [];
      return [{ taskId: event.taskId, startedAt: new Date() }];
    },
  }),
}
```

### 2.5 状态转换图

```
FOCUS 状态内部:
  ┌─────────────────────────────────────────┐
  │                 FOCUS                    │
  │                                          │
  │  [SWITCH_TASK] → switchTask action       │
  │  [COMPLETE_CURRENT_TASK] → completeTask  │
  │  [ASSOCIATE_TASK] → associateTask        │
  │                                          │
  └─────────────────────────────────────────┘

PLANNING → FOCUS:
  - START_POMODORO (with taskId)     → 标准启动
  - START_TASKLESS_POMODORO          → 无任务启动
```

---

## 3. Quick Add to Inbox 功能

### 3.1 功能定义

**Quick Add to Inbox** 允许用户在番茄钟流程中快速创建任务，无需离开当前界面。

### 3.2 业务规则

1. **Inbox 项目**: 系统自动为每个用户创建名为 "Inbox" 的默认项目（如不存在则自动创建）
2. **最小字段**: 只需输入任务标题，其他字段使用默认值
3. **自动关联**: 创建后自动成为 Active_Task（如果在番茄钟内创建）
4. **默认值**:
   - `projectId`: 用户的 Inbox 项目 ID
   - `priority`: `medium`
   - `status`: `todo`
   - `estimatedPomodoros`: `1`

### 3.3 触发场景

| 场景 | 行为 |
|------|------|
| 启动界面点击 "Quick Add" | 创建任务 → 立即启动番茄钟 |
| 任务切换器点击 "Add to Inbox" | 创建任务 → 切换到该任务 |
| Taskless 番茄钟中关联任务 | 创建任务 → 关联到当前番茄钟 |

### 3.4 Service 实现

```typescript
// src/services/task.service.ts

async quickCreateInboxTask(userId: string, title: string): Promise<Task> {
  // 1. 获取或创建 Inbox 项目
  let inboxProject = await this.projectService.findByName(userId, 'Inbox');
  if (!inboxProject) {
    inboxProject = await this.projectService.create(userId, {
      name: 'Inbox',
      isDefault: true,
    });
  }

  // 2. 创建任务
  return this.create(userId, {
    title,
    projectId: inboxProject.id,
    priority: 'medium',
    estimatedPomodoros: 1,
  });
}
```

---

## 4. Service Layer

### 4.1 新增: TimeSliceService

```typescript
// src/services/time-slice.service.ts

const MERGE_THRESHOLD_MS = 60_000; // 60 秒内切回同一任务则合并

class TimeSliceService {
  // 开始新时间片（带合并逻辑）
  async startSlice(pomodoroId: string, taskId: string | null): Promise<TaskTimeSlice> {
    const lastSlice = await this.getLastSlice(pomodoroId);

    // 合并逻辑：60 秒内切回同一任务
    if (lastSlice &&
        lastSlice.taskId === taskId &&
        lastSlice.endTime &&
        Date.now() - lastSlice.endTime.getTime() < MERGE_THRESHOLD_MS) {
      // 延长上一个时间片而非创建新片
      return this.prisma.taskTimeSlice.update({
        where: { id: lastSlice.id },
        data: { endTime: null, durationSeconds: null },
      });
    }

    // 创建新时间片
    return this.prisma.taskTimeSlice.create({
      data: {
        pomodoroId,
        taskId,
        startTime: new Date(),
      },
    });
  }

  // 结束当前时间片
  async endSlice(sliceId: string): Promise<TaskTimeSlice> {
    const slice = await this.prisma.taskTimeSlice.findUnique({ where: { id: sliceId } });
    const endTime = new Date();
    const durationSeconds = Math.floor((endTime.getTime() - slice.startTime.getTime()) / 1000);

    return this.prisma.taskTimeSlice.update({
      where: { id: sliceId },
      data: {
        endTime,
        durationSeconds,
        isFragment: durationSeconds < 30,  // 标记碎片时间
      },
    });
  }

  // 切换任务 (结束旧片 + 开始新片)
  async switchTask(pomodoroId: string, currentSliceId: string, newTaskId: string | null): Promise<TaskTimeSlice> {
    await this.endSlice(currentSliceId);
    return this.startSlice(pomodoroId, newTaskId);
  }

  // 回溯编辑时间片（触发统计重算）
  async updateSlice(sliceId: string, data: { taskId?: string }): Promise<TaskTimeSlice> {
    const slice = await this.prisma.taskTimeSlice.update({
      where: { id: sliceId },
      data,
      include: { pomodoro: true },
    });

    // 异步触发统计重算
    await this.statisticsQueue.add('recalculate', {
      type: 'slice_updated',
      sliceId,
      pomodoroId: slice.pomodoroId,
      affectedTaskIds: [data.taskId, slice.taskId].filter(Boolean),
    });

    return slice;
  }
}
```

### 4.2 修改: PomodoroService

```typescript
// src/services/pomodoro.service.ts

class PomodoroService {
  // 新增: 启动无任务番茄钟
  async startTaskless(userId: string, label?: string): Promise<PomodoroSession>

  // 新增: 番茄钟内切换任务
  async switchTask(pomodoroId: string, taskId: string | null): Promise<void>

  // 新增: 番茄钟内完成任务
  async completeTaskInPomodoro(pomodoroId: string, taskId: string): Promise<void>

  // 修改: 完成番茄钟时返回时间片摘要
  async complete(pomodoroId: string): Promise<{
    pomodoro: PomodoroSession;
    timeSlices: TaskTimeSlice[];
    summary: TimeSliceSummary;
  }>
}

interface TimeSliceSummary {
  totalSeconds: number;
  taskBreakdown: Array<{
    taskId: string | null;
    taskName: string | null;
    seconds: number;
    percentage: number;
  }>;
  switchCount: number;
}
```

### 4.3 修改: StatisticsService

```typescript
// src/services/statistics.service.ts

// 新增统计方法
async getMultiTaskStats(userId: string, dateRange: DateRange): Promise<{
  multiTaskPomodoroCount: number;
  singleTaskPomodoroCount: number;
  tasklessPomodoroCount: number;
  tasklessMinutes: number;
  avgTasksPerPomodoro: number;
  frequentlyCoWorkedTasks: Array<{ taskIds: string[]; count: number }>;
}>
```

---

## 5. 统计重算策略

### 5.1 触发场景

| 场景 | 触发方式 | 影响范围 |
|------|----------|----------|
| 时间片回溯编辑 | 异步队列 | 任务统计、项目统计 |
| 番茄钟任务关联变更 | 异步队列 | 任务统计、项目统计、日/周报 |
| 任务删除 | 软删除，统计保留 | 无需重算 |

### 5.2 实现方案

```typescript
// src/services/statistics-queue.service.ts

interface RecalculateJob {
  type: 'slice_updated' | 'pomodoro_updated' | 'task_deleted';
  affectedTaskIds: string[];
  affectedProjectIds: string[];
  dateRange: { start: Date; end: Date };
}

class StatisticsQueueService {
  // 添加重算任务到队列
  async add(jobType: string, data: RecalculateJob): Promise<void> {
    // 使用 BullMQ 或简单的数据库队列
    await this.queue.add(jobType, data, {
      delay: 1000,           // 1 秒延迟，合并短时间内的多次编辑
      removeOnComplete: true,
    });
  }

  // 处理重算任务
  async process(job: RecalculateJob): Promise<void> {
    // 增量更新：只重算受影响的任务和项目
    for (const taskId of job.affectedTaskIds) {
      await this.recalculateTaskStats(taskId, job.dateRange);
    }
    for (const projectId of job.affectedProjectIds) {
      await this.recalculateProjectStats(projectId, job.dateRange);
    }
  }

  // 重算任务统计
  private async recalculateTaskStats(taskId: string, dateRange: DateRange): Promise<void> {
    const slices = await this.prisma.taskTimeSlice.findMany({
      where: {
        taskId,
        startTime: { gte: dateRange.start, lte: dateRange.end },
      },
    });
    // 聚合计算并更新缓存
  }
}
```

### 5.3 周报更新策略

- 编辑 7 天内的数据：自动触发周报重算
- 编辑 7 天前的数据：标记为 "历史数据已修改"，不自动重算
- 用户可手动触发历史周报重算

---

## 6. tRPC Router

### 4.1 新增: timeSlice router

```typescript
// src/server/routers/time-slice.router.ts

export const timeSliceRouter = router({
  // 切换任务
  switch: protectedProcedure
    .input(z.object({ pomodoroId: z.string(), taskId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => { ... }),

  // 获取番茄钟时间片
  getByPomodoro: protectedProcedure
    .input(z.object({ pomodoroId: z.string() }))
    .query(async ({ ctx, input }) => { ... }),

  // 回溯编辑
  update: protectedProcedure
    .input(z.object({ sliceId: z.string(), taskId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => { ... }),
});
```

### 4.2 修改: pomodoro router

```typescript
// 新增 endpoints
startTaskless: protectedProcedure.mutation(...)
completeTask: protectedProcedure.input(...).mutation(...)
getSummary: protectedProcedure.input(...).query(...)
```

---

## 7. Desktop Client (Rest Enforcer)

### 5.1 新增: RestEnforcer 模块

```typescript
// electron/modules/rest-enforcer.ts

interface RestEnforcerConfig {
  enabled: boolean;
  productivityApps: PolicySleepEnforcementApp[];
  reminderIntervalMs: number;  // 提醒间隔，默认 30s
}

class RestEnforcer {
  private config: RestEnforcerConfig;
  private isActive: boolean = false;
  private reminderInterval: NodeJS.Timeout | null = null;

  start(): void {
    // 开始监控生产力应用
  }

  stop(): void {
    // 停止监控
  }

  private async checkProductivityApps(): Promise<void> {
    // 检测前台应用是否为生产力应用
    // 如果是，显示提醒 overlay
  }

  private showReminderOverlay(appName: string, restTimeRemaining: string): void {
    // 显示友好提醒，不关闭应用
  }
}
```

### 5.2 与现有 Enforcer 的集成

```typescript
// electron/main.ts

// 在 policy:update 处理中
if (policy.systemState === 'REST' || policy.systemState === 'OVER_REST') {
  if (policy.restEnforcement?.enabled) {
    restEnforcer.start();
  }
} else {
  restEnforcer.stop();
}
```

### 5.3 IPC 通道

```typescript
// electron/types/index.ts

export const IPC_CHANNELS = {
  // ... existing channels ...

  // Rest Enforcer
  REST_ENFORCER_START: 'restEnforcer:start',
  REST_ENFORCER_STOP: 'restEnforcer:stop',
  REST_ENFORCER_GET_STATE: 'restEnforcer:getState',
  REST_ENFORCER_REMINDER_SHOWN: 'restEnforcer:reminderShown',
};
```

---

## 8. UI 组件

### 6.1 番茄钟界面增强

```
┌─────────────────────────────────────┐
│  🎯 15:30                           │
│  ─────────────────────────────────  │
│  Current: Fix login bug             │
│                                     │
│  [Switch Task] [Complete Task]      │
│                                     │
│  Task Stack:                        │
│  • Fix login bug (12:30)            │
│  • Review PR #123 (3:00)            │
└─────────────────────────────────────┘
```

### 6.2 启动界面

```
┌─────────────────────────────────────┐
│  Start Pomodoro                     │
│  ─────────────────────────────────  │
│                                     │
│  [▶ Start with Task]                │
│    Top 3: Task A, Task B, Task C    │
│                                     │
│  [◯ Start Focus Time]               │
│    No task required                 │
│                                     │
│  [↻ Continue Last]                  │
│    Last: Fix login bug              │
│                                     │
│  [+ Quick Add to Inbox]             │
└─────────────────────────────────────┘
```

### 6.3 任务切换器

```
┌─────────────────────────────────────┐
│  Switch Task                        │
│  ─────────────────────────────────  │
│  [Search tasks...]                  │
│                                     │
│  Today's Top 3:                     │
│  • Task A ⭐                        │
│  • Task B ⭐                        │
│  • Task C ⭐                        │
│                                     │
│  Recent:                            │
│  • Fix login bug                    │
│  • Review PR #123                   │
│                                     │
│  [+ Add to Inbox]                   │
│  [◯ Continue Taskless]              │
└─────────────────────────────────────┘
```

### 6.4 番茄钟完成摘要

```
┌─────────────────────────────────────┐
│  🎉 Pomodoro Complete!              │
│  ─────────────────────────────────  │
│                                     │
│  Time Breakdown:                    │
│  ████████████░░░░ Fix login (75%)   │
│  ████░░░░░░░░░░░░ Review PR (25%)   │
│                                     │
│  Total: 25 minutes                  │
│  Tasks: 2 | Switches: 1             │
│                                     │
│  [Start Next] [Take Break]          │
└─────────────────────────────────────┘
```

---

## 9. 时间线增强

### 7.1 多任务番茄钟可视化

```
Timeline View:
─────────────────────────────────────────────
09:00  ████████████████████████  Single Task
       [Fix login bug - 25min]

09:30  ████████░░░░████████████  Multi-Task
       [Fix login | Review PR]

10:00  ░░░░░░░░░░░░░░░░░░░░░░░░  Taskless
       [Planning Time - 25min]
─────────────────────────────────────────────
```

### 7.2 时间线编辑

点击番茄钟条目后显示编辑面板:

```
┌─────────────────────────────────────┐
│  Edit Pomodoro (09:30 - 10:00)      │
│  ─────────────────────────────────  │
│                                     │
│  Tasks:                             │
│  [x] Fix login bug (18:45)          │
│  [x] Review PR #123 (6:15)          │
│  [ ] Add task...                    │
│                                     │
│  [Save] [Cancel]                    │
└─────────────────────────────────────┘
```

---

## 10. 实现顺序

### Phase 1: 数据基础 (P0)

1. 添加 `TaskTimeSlice` 数据模型
2. 修改 `PomodoroSession` 模型
3. 实现 `TimeSliceService`
4. 添加 tRPC endpoints

### Phase 2: 状态机 (P0)

1. 扩展 `VibeFlowContext`
2. 添加新 events 和 actions
3. 修改 `canStartPomodoro` guard
4. 更新状态转换逻辑

### Phase 3a: 核心 UI - P0 功能

1. 番茄钟界面增加 Switch Task 按钮
2. 实现任务切换器组件
3. 实现无任务启动流程 (Start Focus Time)
4. Task Stack 显示

### Phase 3b: 核心 UI - P1 功能

1. Complete Task 按钮和流程
2. 番茄钟完成摘要
3. Quick Add to Inbox 组件
4. 启动界面优化 (Continue Last)

### Phase 4: Desktop Rest Enforcer (P1)

1. 实现 `RestEnforcer` 模块
2. 添加 Policy 配置支持
3. 实现提醒 overlay
4. 集成到主进程

### Phase 5: 时间线增强 (P2)

1. 多任务番茄钟可视化
2. 时间线编辑功能
3. 统计增强

---

## 11. 边界情况处理

### 9.1 快速切换 (< 30s)

- 仍然记录时间片
- 统计时标记为 "碎片时间"
- UI 可选择是否显示

### 9.2 切换后立即切回

- 合并相邻的同任务时间片
- 在 `TimeSliceService.switchTask()` 中处理

### 9.3 番茄钟中断

- 已记录的时间片保留
- 番茄钟标记为 `interrupted`
- 最后一个时间片自动结束

### 9.4 离线时间片

- 本地存储时间片数据
- 上线后批量同步
- 冲突时以本地数据为准

### 9.5 番茄钟暂停后恢复

- 暂停时：结束当前时间片，记录 `pausedAt` 时间戳
- 恢复时：创建新时间片（同一任务），不触发合并逻辑
- 暂停期间的时间不计入任何任务

### 9.6 跨天番茄钟

- 番茄钟归属于 `startTime` 所在日期
- 时间片按实际时间记录，可能跨天
- 统计时按番茄钟归属日期聚合

### 9.7 任务被删除

- 任务软删除，`deletedAt` 字段标记
- 已关联的时间片保留，`taskId` 不变
- 统计时显示 "[已删除任务]" 占位符
- 不影响历史番茄钟数据完整性

### 9.8 并发编辑冲突

- 时间线编辑使用乐观锁（`updatedAt` 字段）
- 冲突时提示用户刷新后重试
- 实时番茄钟数据以服务端为准

---

## 12. 测试策略

### 10.1 单元测试

- `TimeSliceService` 所有方法
- 状态机新增 events/actions
- 时间计算逻辑

### 10.2 集成测试

- 任务切换完整流程
- 无任务番茄钟流程
- 时间片统计准确性

### 10.3 E2E 测试

- 番茄钟内切换任务
- 番茄钟内完成任务
- 时间线编辑

---

## 13. 性能考虑

### 11.1 时间片查询优化

- 按 `pomodoroId` 和 `taskId` 建立索引
- 统计查询使用聚合而非全量加载

### 11.2 实时更新

- 任务切换使用 WebSocket 推送
- 时间片数据本地缓存

### 11.3 UI 响应

- 任务切换 < 200ms (Req NFR)
- 任务建议加载 < 500ms (Req NFR)

---

## 14. MCP 工具支持

### 12.1 新增 Tools

```typescript
// src/mcp/tools/pomodoro-tools.ts

// 切换任务
'vibe.switch_task': {
  description: 'Switch to a different task during active pomodoro',
  inputSchema: {
    taskId: z.string().nullable(),
  },
}

// 启动无任务番茄钟
'vibe.start_taskless_pomodoro': {
  description: 'Start a pomodoro without selecting a task',
  inputSchema: {
    label: z.string().optional(),
  },
}

// 快速创建 Inbox 任务
'vibe.quick_create_inbox_task': {
  description: 'Create a task in Inbox and optionally start pomodoro with it',
  inputSchema: {
    title: z.string(),
    startPomodoro: z.boolean().default(false),
  },
}

// 完成当前任务
'vibe.complete_current_task': {
  description: 'Mark current task as complete during active pomodoro',
  inputSchema: {},
}
```

### 12.2 修改 Resources

```typescript
// src/mcp/resources/pomodoro-resources.ts

// 扩展 vibe://pomodoro/current
{
  uri: 'vibe://pomodoro/current',
  // 新增字段
  taskStack: TaskStackEntry[],
  currentTimeSlice: TaskTimeSlice | null,
  isTaskless: boolean,
}

// 新增 vibe://pomodoro/summary
{
  uri: 'vibe://pomodoro/summary',
  description: 'Time breakdown for current or last pomodoro',
  // 返回 TimeSliceSummary
}
