# 对抗式代码审查 Prompt

请以资深工程师的视角，对本次修改进行严格的对抗式审查。假设代码中存在 bug，你的任务是找出它们。

## 修改背景

本次修改解决了 OVER_REST（超时休息强制干预）的时间窗口判断问题，并创建了 `TimeWindowService` 作为统一抽象层。

### 核心规则

```
overRestAllowed = inFocusSession || (inWorkTime && !inSleepTime)
```

- **focus_session（加班）**：用户主动开启，优先级最高，即使在睡眠时间也允许 OVER_REST
- **sleep_time（睡眠）**：配置的睡眠窗口，不允许 OVER_REST（除非有 focus_session）
- **work_time（工作）**：配置的工作时间，允许 OVER_REST
- **free_time（自由）**：以上都不是，不允许 OVER_REST

### 修改的文件

1. **新增**: `src/services/time-window.service.ts` — 统一时间窗口判断
2. **新增**: `src/services/time-window.service.test.ts` — 24 个单元测试
3. **新增**: `tests/integration/over-rest-time-window.test.ts` — 18 个集成测试
4. **修改**: `src/services/state-engine.service.ts` — 迁移使用 TimeWindowService
5. **修改**: `src/server/socket.ts` — 迁移使用 TimeWindowService + 工作时间开始通知
6. **修改**: `src/services/progress-calculation.service.ts` — 迁移使用 TimeWindowService
7. **修改**: `src/services/over-rest.service.ts` — 迁移使用 TimeWindowService
8. **修改**: `src/services/state-engine.service.test.ts` — 添加 timeWindowService mock

## 审查要点

### 1. 逻辑正确性

- [ ] `overRestAllowed` 公式是否在所有场景下正确？
- [ ] 时间段优先级 `focus_session > sleep_time > work_time > free_time` 是否正确实现？
- [ ] timer 回调中的重新检查逻辑是否有竞态条件？
- [ ] 工作时间开始通知的触发条件是否正确？

### 2. 边界条件

- [ ] 工作时间边界（09:00 开始、18:00 结束）的判断是否正确？
- [ ] 睡眠时间跨午夜（如 23:00-07:00）的处理是否正确？
- [ ] focus_session 到期后的状态转换是否正确？
- [ ] 服务重启后 timer 丢失的兜底逻辑是否完整？

### 3. 迁移完整性

- [ ] 所有使用 `isWithinWorkHours`/`isInSleepTime`/`isInFocusSession` 的地方是否都已迁移或有意保留？
- [ ] 迁移后的代码是否与原逻辑等价？
- [ ] 测试的 mock 是否正确覆盖了新的依赖？

### 4. 错误处理

- [ ] `timeWindowService.isOverRestAllowed()` 返回 `{ success: false }` 时的处理是否正确？
- [ ] 数据库查询失败时是否有合理的 fallback？
- [ ] 并发调用时是否有问题？

### 5. 性能考虑

- [ ] `getCurrentContext()` 做了 3 个并行查询，是否有 N+1 问题？
- [ ] 30 秒轮询中对每个用户调用 `timeWindowService`，性能是否可接受？

### 6. 测试覆盖

- [ ] 是否有遗漏的测试场景？
- [ ] mock 是否可能导致假阳性（测试通过但实际代码有 bug）？
- [ ] 集成测试是否真正测试了服务间交互？

## 审查命令

```bash
# 查看所有修改
git diff HEAD~1

# 查看特定文件
git diff HEAD~1 -- src/services/time-window.service.ts
git diff HEAD~1 -- src/services/state-engine.service.ts
git diff HEAD~1 -- src/server/socket.ts

# 运行相关测试
npm test -- --grep "time-window\|over-rest\|TimeWindow"

# 检查 TypeScript
npx tsc --noEmit
```

## 发现问题请报告

请按以下格式报告发现的问题：

```
### [严重程度: Critical/High/Medium/Low]

**文件**: path/to/file.ts:line
**问题**: 简述问题
**复现**: 如何触发这个 bug
**建议修复**: 修复方案
```
