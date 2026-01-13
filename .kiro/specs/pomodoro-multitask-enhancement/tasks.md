# Implementation Tasks

## Phase 1: 数据基础 (P0) [复杂度: 高] ✅ COMPLETED

### Task 1.0: 数据迁移准备

- [x] 创建 Prisma migration 文件
- [x] 验证迁移可回滚
- [x] 为现有 PomodoroSession 生成默认 TaskTimeSlice（可选）

### Task 1.1: TaskTimeSlice 数据模型

- [x] 在 `prisma/schema.prisma` 添加 `TaskTimeSlice` model
- [x] 添加 `pomodoroId`, `taskId`, `startTime`, `endTime`, `durationSeconds`, `isFragment` 字段
- [x] 添加索引 `@@index([pomodoroId])`, `@@index([taskId])`
- [x] 运行 `npm run db:generate` 和 `npm run db:push`

### Task 1.2: PomodoroSession 模型修改

- [x] 添加 `isTaskless`, `taskSwitchCount`, `label`, `continuousWorkSeconds` 字段
- [x] 添加 `timeSlices` 关系
- [x] 运行数据库迁移

### Task 1.3: TimeSliceService 实现

- [x] 创建 `src/services/time-slice.service.ts`
- [x] 实现 `startSlice()` 方法（含 60s 合并逻辑）
- [x] 实现 `endSlice()` 方法（含碎片标记）
- [x] 实现 `switchTask()` 方法
- [x] 实现 `updateSlice()` 方法（Phase 1 用同步重算，Phase 5 升级为异步队列）

### Task 1.4a: tRPC time-slice router

- [x] 创建 `src/server/routers/time-slice.router.ts`
- [x] 实现 `switch`, `getByPomodoro`, `update` endpoints
- [x] 注册到 appRouter

### Task 1.4b: tRPC pomodoro router 修改

- [x] 在 `pomodoro.router.ts` 添加 `startTaskless` endpoint
- [x] 在 `pomodoro.router.ts` 添加 `completeTask` endpoint
- [x] 在 `pomodoro.router.ts` 添加 `getSummary` endpoint

### Task 1.5: PomodoroService 修改

- [x] 实现 `startTaskless()` 方法
- [x] 实现 `switchTask()` 方法
- [x] 实现 `completeTaskInPomodoro()` 方法
- [x] 修改 `complete()` 返回时间片摘要

### Task 1.6: Phase 1 测试

- [x] TimeSliceService 单元测试（合并逻辑、碎片标记）
- [x] tRPC endpoints 集成测试

---

## Phase 2: 状态机 (P0) [复杂度: 高] ✅ COMPLETED

### Task 2.1: Context 扩展

- [x] 在 `src/machines/vibeflow.machine.ts` 添加 `TaskStackEntry` 类型
- [x] 添加 `taskStack`, `currentTimeSliceId`, `isTaskless` 到 context
- [x] 保留 `currentTaskId` 作为 computed getter（从 `taskStack.at(-1)?.taskId` 派生）
- [x] 标记 `currentTaskId` 为 @deprecated

### Task 2.2: Events 和 Actions

- [x] 添加 `SWITCH_TASK`, `COMPLETE_CURRENT_TASK`, `START_TASKLESS_POMODORO`, `ASSOCIATE_TASK` events
- [x] 实现 `switchTask`, `startTasklessPomodoro`, `associateTask` actions
- [x] 修改 `canStartPomodoro` guard 允许 taskId 为 null

### Task 2.3: 状态转换

- [x] 在 FOCUS 状态添加内部事件处理
- [x] 添加 PLANNING → FOCUS 的 taskless 路径

### Task 2.4: Phase 2 测试

- [x] 状态机单元测试（新 events/actions）
- [x] 运行全量测试确保现有功能不受影响

---

## Phase 3a: 核心 UI - P0 功能 [复杂度: 中] 🚧 IN PROGRESS

### Task 3a.1: Switch Task 按钮

- [x] 在番茄钟界面添加 "Switch Task" 按钮
- [x] 仅在 FOCUS 状态显示

### Task 3a.2: 任务切换器组件 - 基础

- [x] 创建 `TaskSwitcher` 组件骨架 (内嵌在 pomodoro-timer.tsx)
- [x] 显示 Today's Top 3 任务
- [x] 调用 `timeSlice.switch` mutation

### Task 3a.3: 任务切换器组件 - 增强

- [ ] 显示最近任务
- [ ] 实现快速搜索
- [x] 添加 "Continue Taskless" 选项

### Task 3a.4: 无任务启动流程

- [x] 在启动界面添加 "Start Focus Time" 选项
- [x] 实现 `startTasklessPomodoro` mutation 调用
- [ ] 显示 label 输入（可选）

### Task 3a.5: Task Stack 显示

- [x] 在番茄钟界面显示 Task Stack
- [x] 显示每个任务的累计时间
- [x] 高亮当前活跃任务

### Task 3a.6: Phase 3a 测试

- [ ] 任务切换 E2E 测试
- [ ] 无任务启动 E2E 测试

---

## Phase 3b: 核心 UI - P1 功能 [复杂度: 中] 🚧 IN PROGRESS

### Task 3b.1: Complete Task 按钮

- [x] 添加 "Complete Task" 按钮
- [x] 实现任务完成 + 继续番茄钟流程
- [ ] 显示庆祝动画

### Task 3b.2: 番茄钟完成摘要

- [x] 创建 `PomodoroSummary` 组件
- [x] 显示时间分布条形图
- [x] 显示任务切换次数

### Task 3b.3: Quick Add to Inbox

- [x] 实现 `quickCreateInboxTask` service 方法
- [x] 在任务切换器添加 "Add to Inbox" 按钮
- [ ] 在启动界面添加 Quick Add 入口

### Task 3b.4: Continue Last 功能

- [x] 在启动界面添加 "Continue Last" 选项
- [x] 记录并显示上次任务

### Task 3b.5: Phase 3b 测试

- [ ] Quick Add to Inbox E2E 测试
- [ ] Complete Task E2E 测试

---

## Phase 4: Desktop Rest Enforcer (P1) [复杂度: 高]

> 可与 Phase 3b 并行开发

### Task 4.1: RestEnforcer 模块

- [ ] 创建 `electron/modules/rest-enforcer.ts`
- [ ] 实现 `start()`, `stop()` 方法
- [ ] 实现生产力应用检测逻辑

### Task 4.2: Policy 配置

- [ ] 扩展 `DesktopPolicy` 类型添加 `restEnforcement`
- [ ] 在设置界面添加生产力应用配置

### Task 4.3: 提醒 Overlay

- [ ] 实现友好提醒 overlay（不关闭应用）
- [ ] 显示剩余休息时间
- [ ] 提供 "Let me rest" 和 "Extend Pomodoro" 选项

### Task 4.4: 主进程集成

- [ ] 在 `electron/main.ts` 集成 RestEnforcer
- [ ] 根据 systemState 启动/停止

### Task 4.5: Phase 4 测试

- [ ] RestEnforcer 单元测试（mock 应用检测）
- [ ] IPC 通道集成测试
- [ ] macOS 手动测试

---

## Phase 5: 时间线增强 (P2) [复杂度: 中]

### Task 5.1: 多任务可视化

- [ ] 修改时间线组件支持分段显示
- [ ] 按任务/项目颜色编码
- [ ] 添加 hover 详情

### Task 5.2: 时间线编辑

- [ ] 添加编辑面板
- [ ] 支持修改任务关联
- [ ] 触发统计重算

### Task 5.3: 统计增强

- [ ] 实现 `getMultiTaskStats` 方法
- [ ] 添加多任务/单任务/无任务统计
- [ ] 显示常见任务组合

### Task 5.4: StatisticsQueueService 升级

- [ ] 创建 `src/services/statistics-queue.service.ts`
- [ ] 将 Phase 1 的同步重算升级为异步队列（BullMQ 或数据库队列）
- [ ] 实现增量重算逻辑

### Task 5.5: Phase 5 测试

- [ ] 时间线编辑集成测试
- [ ] 统计重算准确性测试

---

## Phase 6: MCP 工具 (P2) [复杂度: 低] ✅ COMPLETED

> 可在 Phase 3a 完成后开始

### Task 6.1: 新增 Tools

- [x] 实现 `vibe.switch_task`
- [x] 实现 `vibe.start_taskless_pomodoro`
- [x] 实现 `vibe.quick_create_inbox_task`
- [x] 实现 `vibe.complete_current_task`

### Task 6.2: 扩展 Resources

- [x] 扩展 `vibe://pomodoro/current` 添加 taskStack
- [x] 新增 `vibe://pomodoro/summary` resource

### Task 6.3: Phase 6 测试

- [ ] MCP 工具在 Claude Code 中可用验证

---

## Phase 7: 心流延长 (P2) - Req 9.2 [复杂度: 中]

> 依赖 Phase 2 (状态机)

### Task 7.1: 延长机制

- [ ] 在番茄钟即将结束时显示 "Extend" 选项
- [ ] 实现 `extendPomodoro` action
- [ ] 检查连续工作时间限制

### Task 7.2: 配置项

- [ ] 添加 `maxContinuousWorkMinutes` 设置（默认 90，范围 45-180）
- [ ] 添加 `extensionIncrementMinutes` 设置（默认 15，范围 5-30）
- [ ] 添加 `maxExtensionsPerSession` 设置（默认 2）

### Task 7.3: 强制休息

- [ ] 达到最大连续工作时间时强制进入 REST
- [ ] 显示提示并推荐更长休息时间

---

## Phase 8: 休息提醒内容 (P3) - Future [复杂度: 低]

> 依赖 Phase 4 (Rest Enforcer)
>
> 价值评估：锦上添花功能，优先级最低，可根据用户反馈决定是否实现

### Task 8.1: 提醒消息轮换

- [ ] 创建 10-20 条友好休息提醒消息
- [ ] 实现随机轮换逻辑

### Task 8.2: 休息建议

- [ ] 添加可操作的休息建议（站立、喝水、眼保健操等）

---

## 依赖关系

```
Phase 1 (数据基础)
    ↓
Phase 2 (状态机) ←── 依赖 Phase 1
    ↓
Phase 3a (核心 UI - P0) ←── 依赖 Phase 2
    ↓
Phase 3b (核心 UI - P1) ←── 依赖 Phase 3a
    ↓                          ↑
Phase 4 (Rest Enforcer) ←── 可与 3b 并行
    ↓
Phase 5 (时间线) ←── 依赖 Phase 1
    ↓
Phase 6 (MCP) ←── 依赖 Phase 3a，可提前开始

Phase 7 (心流延长) ←── 依赖 Phase 2 (状态机)

Phase 8 (休息提醒) ←── 依赖 Phase 4 (Rest Enforcer)
```

---

## 风险点

| 风险                         | 影响 | 缓解措施                                         |
| ---------------------------- | ---- | ------------------------------------------------ |
| 状态机改动影响现有功能       | 高   | Phase 2 完成后立即运行全量测试                   |
| currentTaskId 移除破坏兼容性 | 高   | 渐进式迁移：保留为 computed getter + @deprecated |
| 时间片数据量大导致性能问题   | 中   | 添加分页查询，统计用聚合                         |
| Desktop Enforcer 跨平台兼容  | 中   | 先只支持 macOS，Windows 后续迭代                 |
| 离线同步冲突                 | 低   | 已有设计（本地优先）                             |

---

## 验收检查

### 回归测试

- [ ] 现有 E2E 测试全部通过
- [ ] 现有单元测试全部通过

### P0 功能

- [ ] 所有 P0 功能通过 E2E 测试
- [ ] 现有单任务番茄钟行为不变
- [ ] 性能满足 NFR（切换 < 200ms，建议加载 < 500ms）
- [ ] 离线时间片数据正确同步

### P1 功能

- [ ] P1 功能通过 E2E 测试
- [ ] Desktop Rest Enforcer 在 macOS 上正常工作

### 数据与集成

- [ ] 数据库迁移脚本可回滚
- [ ] MCP 工具在 Claude Code 中可用
