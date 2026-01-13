# 验收文档

## 验收前自检清单

> **重要**: 在提交验收前，开发者必须完成以下所有自检项。每个 Phase 完成后立即执行对应检查。

---

## 自动化验证命令

每个 Phase 完成后运行：

```bash
# 1. TypeScript 编译检查
npm run build

# 2. 单元测试
npm test

# 3. Lint 检查
npm run lint

# 4. E2E 测试 (Phase 3 后)
npm run e2e
```

**规则**: 任何命令失败必须修复后才能继续下一 Phase。

---

## Phase 1: 数据基础 自检

### 1.1 数据模型验证

```bash
# 生成 Prisma client
npm run db:generate

# 推送到数据库
npm run db:push

# 验证迁移可回滚
npx prisma migrate reset --skip-seed
```

### 1.2 Service 单元测试

```bash
# 运行 TimeSliceService 测试
npm test -- --grep "TimeSliceService"
```

**必须通过的测试用例**:
- [ ] `startSlice()` 创建新时间片
- [ ] `startSlice()` 60 秒内切回同任务触发合并
- [ ] `endSlice()` 正确计算 durationSeconds
- [ ] `endSlice()` < 30s 标记为 isFragment
- [ ] `switchTask()` 结束旧片并创建新片

### 1.3 tRPC 集成测试

```bash
npm test -- --grep "time-slice.router"
npm test -- --grep "pomodoro.router"
```

---

## Phase 2: 状态机 自检

### 2.1 状态机单元测试

```bash
npm test -- --grep "vibeflow.machine"
```

**必须通过的测试用例**:
- [ ] `SWITCH_TASK` 事件更新 taskStack
- [ ] `START_TASKLESS_POMODORO` 设置 isTaskless=true
- [ ] `ASSOCIATE_TASK` 将 taskless 转为有任务
- [ ] `canStartPomodoro` 允许 taskId 为 null
- [ ] `currentTaskId` getter 从 taskStack 派生正确值

### 2.2 回归测试

```bash
# 运行全量测试确保现有功能不受影响
npm test
npm run e2e
```

**关键回归点**:
- [ ] 现有单任务番茄钟启动正常
- [ ] 番茄钟完成流程正常
- [ ] 状态转换 PLANNING → FOCUS → REST 正常

---

## Phase 3a: 核心 UI (P0) 自检

### 3.1 功能验证脚本

```bash
# 启动开发服务器
npm run dev

# 在另一个终端运行 E2E
npm run e2e -- --grep "task-switch"
npm run e2e -- --grep "taskless-pomodoro"
```

### 3.2 手动验证清单

在浏览器中验证：

| 场景 | 操作 | 预期结果 | ✓ |
|------|------|----------|---|
| Switch Task 按钮 | 启动番茄钟 | FOCUS 状态显示 "Switch Task" 按钮 | |
| 任务切换 | 点击 Switch Task → 选择任务 | 任务切换成功，Task Stack 更新 | |
| Top 3 显示 | 打开任务切换器 | Today's Top 3 任务优先显示 | |
| 无任务启动 | 点击 "Start Focus Time" | 番茄钟启动，显示 "Focus Mode" | |
| Task Stack | 切换 2-3 个任务 | Task Stack 显示所有任务及时间 | |

### 3.3 性能验证

```bash
# 在浏览器 DevTools 中验证
# Network tab: 任务切换请求 < 200ms
# Performance tab: UI 响应无卡顿
```

---

## Phase 3b: 核心 UI (P1) 自检

### 3.1 E2E 测试

```bash
npm run e2e -- --grep "complete-task"
npm run e2e -- --grep "quick-add-inbox"
```

### 3.2 手动验证清单

| 场景 | 操作 | 预期结果 | ✓ |
|------|------|----------|---|
| Complete Task | 点击 "Complete Task" | 任务标记完成，显示庆祝动画 | |
| 完成后继续 | Complete Task → 选择新任务 | 番茄钟继续，新任务激活 | |
| Quick Add | 输入标题 → Add to Inbox | 任务创建在 Inbox 项目 | |
| Continue Last | 点击 "Continue Last" | 使用上次任务启动番茄钟 | |
| 完成摘要 | 完成多任务番茄钟 | 显示时间分布条形图 | |

---

## Phase 4: Desktop Rest Enforcer 自检

### 4.1 单元测试

```bash
# 在 vibeflow-desktop 目录
npm test -- --grep "RestEnforcer"
```

### 4.2 macOS 手动测试

| 场景 | 操作 | 预期结果 | ✓ |
|------|------|----------|---|
| 启动检测 | 进入 REST 状态 + 打开 VS Code | 显示提醒 overlay | |
| 不关闭应用 | 提醒显示时 | VS Code 仍在运行 | |
| 剩余时间 | 查看 overlay | 显示正确的剩余休息时间 | |
| Let me rest | 点击按钮 | overlay 关闭 | |
| 配置生效 | 设置中禁用功能 | REST 状态不再提醒 | |

---

## Phase 5: 时间线增强 自检

### 5.1 可视化验证

| 场景 | 操作 | 预期结果 | ✓ |
|------|------|----------|---|
| 多任务显示 | 查看多任务番茄钟 | 分段条形图，颜色区分 | |
| Hover 详情 | 鼠标悬停 | 显示任务名和时间 | |
| 编辑面板 | 点击番茄钟 | 显示编辑面板 | |
| 修改任务 | 编辑 → 保存 | 任务关联更新 | |

### 5.2 统计重算验证

```bash
# 编辑时间片后检查统计
npm test -- --grep "statistics-recalculate"
```

---

## Phase 6: MCP 工具 自检

### 6.1 工具可用性

```bash
# 启动 MCP 服务器
npm run dev:mcp

# 在 Claude Code 中测试
# 输入: "切换到任务 XXX"
# 预期: vibe.switch_task 被调用
```

### 6.2 工具测试清单

| 工具 | 测试命令 | 预期结果 | ✓ |
|------|----------|----------|---|
| vibe.switch_task | "切换任务" | 任务切换成功 | |
| vibe.start_taskless_pomodoro | "开始专注" | 无任务番茄钟启动 | |
| vibe.quick_create_inbox_task | "创建任务 XXX" | Inbox 任务创建 | |
| vibe.complete_current_task | "完成当前任务" | 任务标记完成 | |

---

## 最终验收标准

### 自动化检查 (必须全部通过)

```bash
# 完整验证脚本
npm run build && npm test && npm run lint && npm run e2e
```

### 功能验收矩阵

| 需求 | 优先级 | 自动化测试 | 手动验证 | 状态 |
|------|--------|------------|----------|------|
| Req 1: 任务切换 | P0 | ✓ E2E | ✓ | |
| Req 3: 无任务番茄钟 | P0 | ✓ E2E | ✓ | |
| Req 4: 时间归属统计 | P0 | ✓ Unit | ✓ | |
| Req 2: 快速完成 | P1 | ✓ E2E | ✓ | |
| Req 6: 启动流程优化 | P1 | ✓ E2E | ✓ | |
| Req 9.1: 休息工具限制 | P1 | ✓ Unit | ✓ macOS | |
| Req 7: 时间线增强 | P2 | ✓ Integration | ✓ | |
| Req 8: 回溯编辑 | P2 | ✓ Integration | ✓ | |

### 非功能验收

| 指标 | 标准 | 验证方法 |
|------|------|----------|
| 任务切换延迟 | < 200ms | DevTools Network |
| 任务建议加载 | < 500ms | DevTools Network |
| 回归测试 | 100% 通过 | `npm test && npm run e2e` |
| 数据迁移 | 可回滚 | `npx prisma migrate reset` |

---

## 问题上报模板

如果自检发现问题，使用以下模板记录：

```markdown
### 问题描述
[简要描述问题]

### 复现步骤
1. ...
2. ...

### 预期行为
[应该发生什么]

### 实际行为
[实际发生了什么]

### 相关日志/截图
[粘贴错误日志或截图]

### 影响的 Phase/Task
Phase X, Task X.X
```

---

## 验收签字

| 阶段 | 开发者自检 | 日期 |
|------|------------|------|
| Phase 1 完成 | [ ] | |
| Phase 2 完成 | [ ] | |
| Phase 3a 完成 | [ ] | |
| Phase 3b 完成 | [ ] | |
| Phase 4 完成 | [ ] | |
| Phase 5 完成 | [ ] | |
| Phase 6 完成 | [ ] | |
| 最终验收 | [ ] | |
