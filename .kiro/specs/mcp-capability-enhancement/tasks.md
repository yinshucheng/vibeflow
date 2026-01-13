# MCP Capability Enhancement - Tasks

## Phase 1: 核心任务管理 (P1)

### Task 1.1: 任务查询工具
- [ ] 实现 `flow_get_task` tool
- [ ] 实现 `flow_get_backlog_tasks` tool
- [ ] 实现 `flow_get_overdue_tasks` tool
- [ ] 添加单元测试

### Task 1.2: 任务更新工具
- [ ] 实现 `flow_update_task` tool
- [ ] 实现 `flow_set_plan_date` tool
- [ ] 实现 `flow_delete_task` tool (soft delete)
- [ ] 添加单元测试

### Task 1.3: 每日状态资源
- [ ] 实现 `vibe://state/current` resource
- [ ] 实现 `flow_get_top3` tool
- [ ] 实现 `flow_set_top3` tool
- [ ] 添加单元测试

### Task 1.4: 番茄钟控制
- [ ] 实现 `flow_abort_pomodoro` tool
- [ ] 实现 `vibe://pomodoro/today` resource
- [ ] 添加单元测试

---

## Phase 2: 项目与规划 (P1-P2)

### Task 2.1: 项目管理工具
- [ ] 实现 `flow_create_project` tool
- [ ] 实现 `flow_update_project` tool
- [ ] 实现 `flow_archive_project` tool
- [ ] 实现 `flow_get_project` tool
- [ ] 添加单元测试

### Task 2.2: 项目资源
- [ ] 实现 `vibe://projects/all` resource
- [ ] 添加单元测试

### Task 2.3: 规划建议
- [ ] 实现 `vibe://planning/suggestions` resource
- [ ] 实现 `flow_complete_airlock` tool
- [ ] 添加单元测试

### Task 2.4: 任务搜索
- [ ] 实现 `flow_search_tasks` tool
- [ ] 实现 `flow_filter_tasks` tool
- [ ] 实现 `vibe://tasks/recent` resource
- [ ] 添加单元测试

---

## Phase 3: 分析与洞察 (P2)

### Task 3.1: 统计资源
- [ ] 实现 `flow_get_stats` tool (按日期范围)
- [ ] 实现 `vibe://stats/project/{id}` resource template
- [ ] 添加单元测试

### Task 3.2: 时间线资源
- [ ] 实现 `vibe://timeline/today` resource
- [ ] 实现 `vibe://review/daily` resource
- [ ] 添加单元测试

### Task 3.3: 目标管理
- [ ] 实现 `flow_create_goal` tool
- [ ] 实现 `flow_update_goal` tool
- [ ] 实现 `flow_link_project_to_goal` tool
- [ ] 实现 `vibe://goals/progress` resource
- [ ] 添加单元测试

### Task 3.4: 阻塞管理增强
- [ ] 实现 `flow_resolve_blocker` tool
- [ ] 实现 `flow_get_blocker_history` tool
- [ ] 实现 `vibe://blockers/summary` resource
- [ ] 添加单元测试

---

## Phase 4: 高级功能 (P2-P3)

### Task 4.1: 任务移动与重排序
- [ ] 实现 `flow_move_task` tool
- [ ] 实现 `flow_reorder_tasks` tool
- [ ] 添加单元测试

### Task 4.2: 番茄钟暂停/恢复
- [ ] 实现 `flow_pause_pomodoro` tool
- [ ] 实现 `flow_resume_pomodoro` tool
- [ ] 添加单元测试

### Task 4.3: 批量操作增强
- [ ] 实现 `flow_batch_move_tasks` tool
- [ ] 实现 `flow_batch_set_plan_date` tool
- [ ] 实现 `flow_batch_archive_tasks` tool
- [ ] 添加单元测试

### Task 4.4: 用户设置资源
- [ ] 实现 `vibe://settings/pomodoro` resource
- [ ] 实现 `vibe://settings/work-hours` resource
- [ ] 实现 `vibe://settings/preferences` resource
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
