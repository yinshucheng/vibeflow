# MCP Capability Enhancement - Tasks

## 已完成（无需实现）

- [x] `flow_update_project` tool
- [x] `flow_get_project` tool
- [x] `flow_get_top3` tool
- [x] `flow_set_top3` tool
- [x] `vibe://state/current` resource
- [x] `vibe://projects/all` resource
- [x] `vibe://timeline/today` resource

---

## Phase 1: 待实现（8 个 Tools）

### Task 1.1: 任务查询工具
- [ ] 实现 `flow_get_task` tool
- [ ] 实现 `flow_get_backlog_tasks` tool
- [ ] 实现 `flow_get_overdue_tasks` tool

### Task 1.2: 任务更新工具
- [ ] 实现 `flow_update_task` tool
- [ ] 实现 `flow_set_plan_date` tool
- [ ] 实现 `flow_delete_task` tool
- [ ] 实现 `flow_move_task` tool

### Task 1.3: 项目管理工具
- [ ] 实现 `flow_create_project` tool

---

## 验收标准

### 功能验收
- [ ] 所有新增 Tools 可通过 MCP 客户端正常调用
- [ ] 错误处理符合统一格式
- [ ] 权限检查正确（userId 验证）

### 质量验收
- [ ] TypeScript 编译通过 (`npm run build`)
- [ ] 单元测试通过 (`npm test`)
- [ ] Lint 检查通过 (`npm run lint`)
