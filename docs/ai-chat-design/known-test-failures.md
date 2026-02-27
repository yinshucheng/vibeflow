# 已知测试失败 (Pre-existing)

> 以下测试失败在 AI Chat 开发之前就已存在，与 F0-F8 / S1-S11 无关。
> 记录在此以便后续统一修复，避免与 Chat 功能开发混淆。

---

## 1. `src/server/routers/pomodoro.test.ts` — 模块加载失败

**状态**: 整个测试文件无法运行（0 test）

**错误信息**:
```
Error: [vitest] No "RecordPomodoroSchema" export is defined on the "@/services/pomodoro.service" mock.
Did you forget to return it from "vi.mock"?
```

**根因分析**:
- 测试文件通过 `vi.mock('@/services/pomodoro.service')` mock 了整个 pomodoro service 模块
- 但 `src/server/routers/pomodoro.ts:445` 从该模块导入并使用了 `RecordPomodoroSchema`（一个 Zod schema）
- `vi.mock()` 默认将所有导出替换为 `undefined`，导致 `RecordPomodoroSchema` 在 router 初始化时为 `undefined`，tRPC 的 `.input()` 调用失败

**引入时间**: commit `10ab287` (`feat(mcp): add capability enhancement and pomodoro multitask support`)

**修复方向**:
```typescript
vi.mock('@/services/pomodoro.service', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,  // 保留 RecordPomodoroSchema 等非函数导出
    pomodoroService: { /* mock methods */ },
  };
});
```

**未修复原因**: 属于 MCP 功能迭代引入的回归，不在 AI Chat 开发范围内。修复需要调整 pomodoro router 测试的 mock 策略，涉及对 pomodoro service 导出结构的理解，建议在 pomodoro 相关任务中一并处理。

---

## 2. `src/services/tray-integration.test.ts` — 断言不匹配

**状态**: 10 个用例中 1 个失败

**失败用例**: `TrayIntegrationService > updatePomodoroState > should handle pomodoro with no task title`

**错误信息**:
```
AssertionError: expected "spy" to be called with arguments: [ { pomodoroActive: true, …(3) } ]

  Object {
-     "currentTask": undefined,   // 测试期望
+     "currentTask": "task-id",   // 实际值
      "pomodoroActive": true,
      "pomodoroTimeRemaining": "15:00",
      "systemState": "FOCUS",
  }
```

**根因分析**:
- 测试模拟了一个 `task` 字段为 `null`（无关联任务名）的 pomodoro 对象
- 但实际实现中 `updatePomodoroState` 使用了 `pomodoro.taskId`（而非 `pomodoro.task?.title`）作为 `currentTask`
- 测试构造的 mock pomodoro 对象有 `taskId: 'task-id'` 但 `task: null`，导致 `currentTask` 实际为 `'task-id'` 而非 `undefined`

**引入时间**: commit `f9d5399` (`feat(desktop): enhance tray menu with system state display`)

**修复方向**: 二选一:
1. 修改测试 mock 数据，将 `taskId` 也设为 `null`
2. 修改 `updatePomodoroState` 实现，使用 `task?.title` 而非 `taskId`

**未修复原因**: 属于 Desktop tray 功能的测试回归，不在 AI Chat 开发范围内。需要确认产品意图（tray 显示 taskId 还是 task title）后再决定修复方向。

---

## 统计

| 文件 | 失败数 | 总用例 | 影响 |
|------|--------|--------|------|
| `src/server/routers/pomodoro.test.ts` | 全部 (加载失败) | — | pomodoro router 测试完全不可用 |
| `src/services/tray-integration.test.ts` | 1 | 10 | 仅影响无任务名场景 |
| **合计** | **1 assertion + 1 suite** | — | 不影响 AI Chat 功能 |
