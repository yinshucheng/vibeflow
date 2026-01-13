# MCP Capability Enhancement - Tasks

## Phase 1: 核心能力实现

### Task 1.1: 任务查询工具
- [ ] 实现 `flow_get_task` tool
- [ ] 实现 `flow_get_backlog_tasks` tool
- [ ] 实现 `flow_get_overdue_tasks` tool
- [ ] 添加单元测试

### Task 1.2: 任务更新工具
- [ ] 实现 `flow_update_task` tool
- [ ] 实现 `flow_set_plan_date` tool
- [ ] 实现 `flow_delete_task` tool (soft delete)
- [ ] 实现 `flow_move_task` tool
- [ ] 添加单元测试

### Task 1.3: 项目管理工具
- [ ] 实现 `flow_create_project` tool
- [ ] 实现 `flow_update_project` tool
- [ ] 实现 `flow_get_project` tool
- [ ] 添加单元测试

### Task 1.4: 每日状态工具
- [ ] 实现 `flow_get_top3` tool
- [ ] 实现 `flow_set_top3` tool
- [ ] 添加单元测试

### Task 1.5: Resources
- [ ] 实现 `vibe://state/current` resource
- [ ] 实现 `vibe://projects/all` resource
- [ ] 实现 `vibe://timeline/today` resource
- [ ] 添加单元测试

---

## 验收标准

### 功能验收
- [ ] 所有新增 Tools 可通过 MCP 客户端正常调用
- [ ] 所有新增 Resources 可通过 MCP 客户端正常读取
- [ ] 错误处理符合统一格式
- [ ] 权限检查正确（userId 验证）

### 质量验收
- [ ] TypeScript 编译通过 (`npm run build`)
- [ ] 单元测试通过 (`npm test`)
- [ ] Lint 检查通过 (`npm run lint`)

### 文档验收
- [ ] 更新 CLAUDE.md 中的 MCP 能力列表
- [ ] 更新 steering 文档中的 MCP 说明

---

## Phase 2+: 延后需求（待规划）

- 番茄钟控制（pause/resume/abort）
- Airlock 完成（flow_complete_airlock）
- 规划建议（vibe://planning/suggestions）
- 目标管理
- 任务搜索与过滤
- 阻塞管理增强
- 批量操作增强
- 用户设置访问
