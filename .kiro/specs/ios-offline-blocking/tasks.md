# iOS 离线屏蔽自动化 — 任务清单

## Phase 1: Native 模块扩展 (P0)

### Task 1.1: ScreenTimeModule 新增 schedule 方法
- [ ] 1.1.1 添加 `registerPomodoroSchedule(endTimeMs: Double)` 方法
- [ ] 1.1.2 添加 `registerTempUnblockSchedule(endTimeMs: Double)` 方法
- [ ] 1.1.3 添加 `cancelSchedule(scheduleName: String)` 方法
- [ ] 1.1.4 扩展 DeviceActivityName 定义 (pomodoroEnd, tempUnblockEnd)

### Task 1.2: AppGroupManager 扩展
- [ ] 1.2.1 添加 `pomodoroEndTime` 存储/读取方法
- [ ] 1.2.2 添加 `tempUnblockEndTime` 存储/读取方法
- [ ] 1.2.3 添加 `previousBlockingReason` 存储/读取方法（临时解锁前的原因）

### Task 1.3: DeviceActivityMonitorExtension 扩展
- [ ] 1.3.1 `intervalDidEnd` 处理 "pomodoroEnd" → 解除屏蔽
- [ ] 1.3.2 `intervalDidEnd` 处理 "tempUnblockEnd" → 恢复之前的屏蔽
- [ ] 1.3.3 `intervalDidStart` 处理 "tempUnblockEnd" → 保存当前 reason 并解除屏蔽

### Task 1.4: TypeScript 绑定
- [ ] 1.4.1 `modules/screen-time/index.ts` 导出新方法
- [ ] 1.4.2 `screen-time.service.ts` 添加包装方法

## Phase 2: 番茄钟离线调度 (P0)

### Task 2.1: 启动番茄钟时注册 schedule
- [ ] 2.1.1 `blocking.service.ts` 监听 activePomodoro 变化
- [ ] 2.1.2 activePomodoro 从 null → 非 null 时，调用 `registerPomodoroSchedule`
- [ ] 2.1.3 计算 endTime = startTime + duration (处理时区)

### Task 2.2: 取消番茄钟时取消 schedule
- [ ] 2.2.1 activePomodoro 从非 null → null 时，检查是否手动取消
- [ ] 2.2.2 如果是手动取消（非自然结束），调用 `cancelSchedule("pomodoroEnd")`

### Task 2.3: 前台与后台状态同步
- [ ] 2.3.1 App 回到前台时，检查 schedule 是否已触发
- [ ] 2.3.2 如果 schedule 已触发但 store 未更新，同步状态

## Phase 3: 临时解锁离线调度 (P0)

### Task 3.1: 临时解锁开始时注册 schedule
- [ ] 3.1.1 监听 `policy.temporaryUnblock.active` 变化
- [ ] 3.1.2 active 从 false → true 时，保存当前 blockingReason 到 App Group
- [ ] 3.1.3 调用 `registerTempUnblockSchedule(endTime)`

### Task 3.2: 临时解锁取消/到期处理
- [ ] 3.2.1 active 从 true → false 且 endTime 未到时，调用 `cancelSchedule`
- [ ] 3.2.2 移除现有的 `setTimeout` 实现（被 schedule 替代）

## Phase 4: 睡眠时间修复 (P1)

### Task 4.1: 初始化时注册 schedule
- [ ] 4.1.1 `blockingService.initialize()` 中检查 policy.sleepTime
- [ ] 4.1.2 如果 enabled，调用 `registerSleepSchedule`

### Task 4.2: 移除限制条件
- [ ] 4.2.1 移除 `!curSleepActive` 条件
- [ ] 4.2.2 确保每次 policy 变化都能正确更新 schedule

### Task 4.3: 测试睡眠时间跨越
- [ ] 4.3.1 测试睡眠时间开始 (intervalDidStart)
- [ ] 4.3.2 测试睡眠时间结束 (intervalDidEnd)
- [ ] 4.3.3 测试 App 未运行时的跨越

## Phase 5: AI Chat 临时解锁 (P1)

### Task 5.1: 验证现有 MCP tool
- [ ] 5.1.1 确认 `flow_request_temp_unblock` 在 iOS 上可用
- [ ] 5.1.2 测试通过 AI Chat 调用

### Task 5.2: AI Chat 意图识别
- [ ] 5.2.1 确认 AI 能识别"解锁 X 分钟"类请求
- [ ] 5.2.2 测试自然语言时长解析（"15 分钟"、"半小时"）

### Task 5.3: 用户体验优化
- [ ] 5.3.1 AI 响应显示解锁状态和剩余时间
- [ ] 5.3.2 解锁到期前 1 分钟提醒（可选）

## Phase 6: 测试与验证 (P0)

### Task 6.1: 单元测试
- [ ] 6.1.1 `evaluateBlockingReason` 完整覆盖
- [ ] 6.1.2 schedule 注册/取消逻辑测试 (mock)

### Task 6.2: 真机集成测试
- [ ] 6.2.1 番茄钟后台自动解锁测试
- [ ] 6.2.2 临时解锁后台自动恢复测试
- [ ] 6.2.3 睡眠时间离线触发测试

### Task 6.3: 边界情况测试
- [ ] 6.3.1 快速启动/取消番茄钟
- [ ] 6.3.2 App 被系统杀死后的恢复
- [ ] 6.3.3 多种 schedule 同时生效

## Phase 7: OVER_REST 处理 (P2, 可选)

### Task 7.1: 评估 APNs 方案
- [ ] 7.1.1 评估 APNs silent push 实现成本
- [ ] 7.1.2 决定是否实现或接受"打开 App 才生效"限制

### Task 7.2: 备选方案
- [ ] 7.2.1 如果不实现 APNs，在 App 首页显示 OVER_REST 提示
- [ ] 7.2.2 提示用户打开 App 以激活屏蔽

---

## 依赖关系

```
Phase 1 (Native 模块)
    ↓
Phase 2 (番茄钟) ←──┐
    ↓              │
Phase 3 (临时解锁) ←┘
    ↓
Phase 4 (睡眠时间修复)
    ↓
Phase 5 (AI Chat)
    ↓
Phase 6 (测试)
    ↓
Phase 7 (OVER_REST, 可选)
```

## 验收标准检查清单

### R1: 番茄钟结束自动解除屏蔽
- [ ] AC1.1: 启动番茄钟时注册 schedule
- [ ] AC1.2: 结束时 Extension 清除屏蔽
- [ ] AC1.3: 手动中止时取消 schedule
- [ ] AC1.4: 支持 duration 变化

### R2: 临时解锁到期自动恢复屏蔽
- [ ] AC2.1: 解锁开始时注册 schedule
- [ ] AC2.2: 到期时 Extension 恢复屏蔽
- [ ] AC2.3: 提前结束时取消 schedule
- [ ] AC2.4: AI Chat 触发兼容

### R3: 睡眠时间离线调度修复
- [ ] AC3.1: 初始化时注册 schedule
- [ ] AC3.2: 移除 !curSleepActive 条件
- [ ] AC3.3: repeats: true 每天重复

### R5: AI Chat 临时解锁
- [ ] AC5.1: MCP tool 可调用
- [ ] AC5.2: 自然语言时长
- [ ] AC5.3: 记录解锁原因
- [ ] AC5.4: 到期自动恢复
