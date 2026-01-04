# Implementation Plan: AI-Native Enhancement

## Overview

本实现计划将 AI-Native 增强功能分解为可执行的开发任务。采用增量开发方式，每个阶段都能独立验证，确保核心功能优先实现。

## Tasks

- [x] 1. 数据库 Schema 扩展
  - [x] 1.1 添加 Blocker 模型到 Prisma schema
    - 创建 `Blocker` 表，包含 category、status、dependencyInfo 等字段
    - 添加与 User、Task 的关联关系
    - _Requirements: 5.1, 5.2, 5.4, 5.5_
  - [x] 1.2 添加 MCP 审计和事件模型
    - 创建 `MCPAuditLog` 表用于工具调用审计
    - 创建 `MCPEvent` 表用于事件历史
    - 创建 `MCPSubscription` 表用于事件订阅
    - _Requirements: 4.5, 10.1, 10.5_
  - [x] 1.3 添加反馈和模板模型
    - 创建 `TaskDecompositionFeedback` 表
    - 创建 `SuggestionFeedback` 表
    - 创建 `ProjectTemplate` 表
    - _Requirements: 2.5, 3.5, 4.2, 9.5_
  - [x] 1.4 运行数据库迁移
    - 执行 `npm run db:migrate` 生成迁移文件
    - 验证所有表正确创建
    - _Requirements: 1.1-10.5_

- [x] 2. Checkpoint - 数据库层完成
  - 确保所有迁移成功，数据库 schema 正确

- [x] 3. 扩展 MCP 资源层
  - [x] 3.1 实现 WorkspaceContext 资源
    - 在 `src/mcp/resources.ts` 添加 `vibe://context/workspace` 资源
    - 返回当前文件、最近变更、活跃分支信息
    - _Requirements: 1.1_
  - [x] 3.2 实现 PomodoroHistory 资源
    - 添加 `vibe://history/pomodoros` 资源
    - 返回最近 7 天的番茄钟历史和统计摘要
    - _Requirements: 1.2_
  - [x] 3.3 实现 ProductivityAnalytics 资源
    - 添加 `vibe://analytics/productivity` 资源
    - 集成 efficiencyAnalysisService 返回生产力指标
    - _Requirements: 1.3_
  - [x] 3.4 实现 ActiveBlockers 资源
    - 添加 `vibe://blockers/active` 资源
    - 返回当前活跃的阻塞列表
    - _Requirements: 1.4_
  - [ ]* 3.5 编写 MCP 资源属性测试
    - **Property 1: MCP Resource Data Completeness**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**

- [ ] 4. 实现阻塞解决服务
  - [ ] 4.1 创建 blocker-resolver.service.ts
    - 实现 `detectPotentialBlocker` 方法检测 2+ 番茄钟无进度
    - 实现 `reportBlocker` 和 `categorizeBlocker` 方法
    - 实现 `getSuggestedResolutions` 基于类别返回建议
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ] 4.2 实现依赖跟踪和历史
    - 实现 `trackDependency` 方法
    - 实现 `resolveBlocker` 方法
    - 实现 `getBlockerHistory` 方法
    - _Requirements: 5.4, 5.5_
  - [ ]* 4.3 编写阻塞分类属性测试
    - **Property 7: Blocker Categorization Completeness**
    - **Validates: Requirements 5.2**

- [ ] 5. Checkpoint - 资源层和阻塞服务完成
  - 确保所有资源端点可访问，阻塞服务正常工作

- [ ] 6. 实现智能任务分解服务
  - [ ] 6.1 创建 task-decomposer.service.ts
    - 实现 `shouldOfferDecomposition` 检查描述长度 > 100
    - 实现 `generateSubtaskSuggestions` 生成 2-5 个子任务
    - 基于关键词模式识别任务类型
    - _Requirements: 2.1, 2.2_
  - [ ] 6.2 实现时间估算和接受逻辑
    - 实现基于历史数据的时间估算
    - 实现 `acceptSuggestions` 创建子任务并关联父任务
    - _Requirements: 2.3, 2.4_
  - [ ] 6.3 实现反馈记录
    - 实现 `recordFeedback` 存储用户接受/拒绝模式
    - _Requirements: 2.5_
  - [ ]* 6.4 编写任务分解属性测试
    - **Property 2: Task Decomposition Bounds**
    - **Property 3: Subtask Parent Linkage**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**

- [ ] 7. 实现智能建议引擎
  - [ ] 7.1 创建 smart-suggestion.service.ts
    - 实现 `getNextTaskSuggestion` 基于优先级、截止日期、目标关联排序
    - 实现综合评分算法
    - _Requirements: 3.1, 3.2_
  - [ ] 7.2 实现空闲检测和 Airlock 建议
    - 实现 `checkIdleAndSuggest` 工作时间内 5 分钟空闲触发
    - 实现 `getAirlockSuggestions` 返回 Top 3 建议和工作量警告
    - _Requirements: 3.3, 9.1, 9.3, 9.4_
  - [ ] 7.3 实现建议反馈记录
    - 实现 `recordSuggestionFeedback` 存储用户反馈
    - _Requirements: 3.5, 9.5_
  - [ ]* 7.4 编写建议排序属性测试
    - **Property 4: Suggestion Ordering Consistency**
    - **Validates: Requirements 3.2, 9.1**

- [ ] 8. Checkpoint - 智能服务完成
  - 确保任务分解和建议引擎正常工作

- [ ] 9. 扩展 MCP 工具层
  - [ ] 9.1 实现批量更新任务工具
    - 在 `src/mcp/tools.ts` 添加 `vibe.batch_update_tasks`
    - 支持批量更新状态、优先级、计划日期
    - _Requirements: 4.1_
  - [ ] 9.2 实现项目模板工具
    - 添加 `vibe.create_project_from_template`
    - 支持从预定义模板创建项目和任务
    - _Requirements: 4.2_
  - [ ] 9.3 实现依赖分析工具
    - 添加 `vibe.analyze_task_dependencies`
    - 返回依赖关系、建议执行顺序、关键路径
    - _Requirements: 4.3_
  - [ ] 9.4 实现每日总结工具
    - 添加 `vibe.generate_daily_summary`
    - 返回完成任务、番茄钟统计、效率评分、明日建议
    - _Requirements: 4.4_
  - [ ] 9.5 实现 MCP 审计服务
    - 创建 `src/services/mcp-audit.service.ts`
    - 在所有工具调用时记录审计日志
    - _Requirements: 4.5_
  - [ ]* 9.6 编写 MCP 工具属性测试
    - **Property 5: MCP Tool Audit Completeness**
    - **Property 6: Batch Update Atomicity**
    - **Validates: Requirements 4.1, 4.5**

- [ ] 10. 实现上下文提供器
  - [ ] 10.1 创建 context-provider.service.ts
    - 实现 `getFullContext` 聚合任务、项目、编码原则、活动日志
    - 实现 `getRecentActivity` 获取最近 2 小时活动
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [ ] 10.2 实现 Markdown 序列化
    - 实现 `serializeToMarkdown` 生成 LLM 友好格式
    - 包含系统状态、当前任务、番茄钟状态、编码原则、今日进度
    - _Requirements: 6.5_
  - [ ]* 10.3 编写上下文序列化属性测试
    - **Property 8: Context Serialization Round-Trip**
    - **Validates: Requirements 6.1, 6.4, 6.5**

- [ ] 11. 实现进度分析器增强
  - [ ] 11.1 扩展 progress-analyzer.service.ts
    - 实现 `calculateProductivityScores` 计算日/周/月评分
    - 实现 `identifyPeakHours` 识别高效时段
    - _Requirements: 7.1, 7.2_
  - [ ] 11.2 实现预测和趋势检测
    - 实现 `predictGoalCompletion` 预测目标完成可能性
    - 实现 `detectProductivityTrend` 检测趋势变化
    - 实现 `generateImprovementSuggestions` 生成改进建议
    - _Requirements: 7.3, 7.4, 7.5_
  - [ ]* 11.3 编写生产力评分属性测试
    - **Property 9: Productivity Score Bounds**
    - **Validates: Requirements 7.1, 7.4**

- [ ] 12. Checkpoint - 上下文和分析服务完成
  - 确保上下文提供和进度分析正常工作

- [ ] 13. 实现自然语言解析器
  - [ ] 13.1 创建 nl-parser.service.ts
    - 实现 `parseTaskDescription` 提取标题、优先级、项目、日期
    - 实现优先级关键词映射 (urgent→P1, low→P3 等)
    - _Requirements: 8.1, 8.2_
  - [ ] 13.2 实现日期表达式解析
    - 支持 tomorrow, next week, end of month 等表达式
    - 实现 `getProjectCandidates` 用于项目消歧
    - _Requirements: 8.3, 8.4_
  - [ ] 13.3 实现确认和创建流程
    - 实现 `confirmAndCreate` 确认后创建任务
    - _Requirements: 8.5_
  - [ ] 13.4 添加自然语言任务创建 MCP 工具
    - 在 tools.ts 添加 `vibe.create_task_from_nl`
    - _Requirements: 8.1_
  - [ ]* 13.5 编写自然语言解析属性测试
    - **Property 10: Natural Language Priority Inference**
    - **Property 11: Date Expression Parsing**
    - **Validates: Requirements 8.1, 8.2, 8.4**

- [ ] 14. 实现事件订阅系统
  - [ ] 14.1 创建 mcp-event.service.ts
    - 实现 `subscribe` 和 `unsubscribe` 方法
    - 实现 `publish` 方法通过 Socket.io 分发事件
    - _Requirements: 10.1, 10.2, 10.3_
  - [ ] 14.2 实现事件历史
    - 实现 `getEventHistory` 返回最近 24 小时事件
    - 实现事件自动清理机制
    - _Requirements: 10.5_
  - [ ] 14.3 集成事件发布到核心服务
    - 在 taskService 状态变更时发布事件
    - 在 pomodoroService 生命周期事件时发布
    - 在 dailyStateService 状态转换时发布
    - _Requirements: 10.1, 10.2, 10.3_
  - [ ]* 14.4 编写事件订阅属性测试
    - **Property 12: Event Subscription Delivery**
    - **Property 13: Event History Retention**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.5**

- [ ] 15. Checkpoint - 事件系统完成
  - 确保事件订阅和分发正常工作

- [ ] 16. 服务导出和集成
  - [ ] 16.1 更新服务导出
    - 在 `src/services/index.ts` 导出所有新服务
    - 确保服务单例模式正确
    - _Requirements: 1.1-10.5_
  - [ ] 16.2 更新 MCP 服务器注册
    - 在 `src/mcp/server.ts` 注册所有新资源和工具
    - 确保认证和错误处理正确
    - _Requirements: 1.1-10.5_

- [ ] 17. E2E 测试
  - [ ]* 17.1 编写 MCP 资源 E2E 测试
    - 测试所有新增资源端点
    - 验证数据结构和响应格式
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [ ]* 17.2 编写 MCP 工具 E2E 测试
    - 测试批量更新、模板创建、依赖分析、每日总结
    - 验证审计日志记录
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [ ]* 17.3 编写事件订阅 E2E 测试
    - 测试订阅、事件接收、历史查询
    - _Requirements: 10.1, 10.2, 10.3, 10.5_

- [ ] 18. Final Checkpoint - 全部功能完成
  - 确保所有测试通过，功能完整可用

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- 实现顺序设计为：数据层 → 资源层 → 服务层 → 工具层 → 事件层 → 集成测试
