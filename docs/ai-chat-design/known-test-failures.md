# 已知测试失败 (Pre-existing) — 已修复

> 以下测试失败在 AI Chat 开发之前就已存在，已在 `8136a09` 中修复。
> 保留此文档作为问题归档和根因记录。

---

## 1. `src/server/routers/pomodoro.test.ts` — 模块加载失败 ✅ 已修复

**错误信息**:
```
Error: [vitest] No "RecordPomodoroSchema" export is defined on the "@/services/pomodoro.service" mock.
```

**根因**: `vi.mock` 只 mock 了 `pomodoroService` + 2 个 Schema，但源码后来新增了 `RecordPomodoroSchema` 导出。Router 在 `.input(RecordPomodoroSchema)` 加载时崩溃。

**引入时间**: `10ab287` (`feat(mcp): add capability enhancement and pomodoro multitask support`)

**修复**: 在 mock 中补上 `RecordPomodoroSchema`（复制 Zod 定义）和 `record` 方法。

---

## 2. `src/services/tray-integration.test.ts` — 断言不匹配 ✅ 已修复

**失败用例**: `should handle pomodoro with no task title`

**根因**: 实现中 `currentTask = pomodoro.task?.title || pomodoro.taskId || undefined`，当 `task` 不存在时会 fallback 到 `taskId`。测试构造的 mock 有 `taskId: 'task-id'` 但无 `task` 对象，导致 `currentTask` 为 `'task-id'` 而非期望的 `undefined`。

**引入时间**: `f9d5399` (`feat(desktop): enhance tray menu with system state display`)

**修复**: 将测试 mock 的 `taskId` 改为 `null`，正确模拟"无任务"场景。

---

## 当前状态

**57 test files / 547 tests — 全部通过** ✅
