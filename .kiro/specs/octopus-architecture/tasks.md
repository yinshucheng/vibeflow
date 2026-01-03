# Implementation Plan: Octopus Architecture

## Overview

本实现计划将八爪鱼架构分解为可执行的编码任务。由于这是一个架构级别的规范，主要涉及协议定义、服务接口和数据模型的标准化，而非全新功能的实现。许多组件已经存在，需要进行重构和标准化。

## Tasks

- [x] 1. 定义统一的事件和指令协议类型
  - [x] 1.1 创建 Event Stream 类型定义
    - 在 `src/types/octopus.ts` 中定义 BaseEvent, ActivityLogEvent, HeartbeatEvent 等接口
    - 定义 EventType 和 ClientType 枚举
    - _Requirements: 2.1, 2.3, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
  - [x] 1.2 创建 Command Stream 类型定义
    - 定义 BaseCommand, SyncStateCommand, ExecuteActionCommand, UpdatePolicyCommand, ShowUICommand 接口
    - 定义 CommandType 和 ActionType 枚举
    - _Requirements: 2.2, 2.4, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_
  - [x] 1.3 创建 Policy 类型定义
    - 定义 Policy, TimeSlot, DistractionApp 接口
    - _Requirements: 10.5, 10.6_
  - [x] 1.4 编写 Event Schema 属性测试
    - **Property 1: Event Schema Validation**
    - **Validates: Requirements 2.3, 7.2, 7.3, 7.4, 7.5, 7.6**
  - [x] 1.5 编写 Command Schema 属性测试
    - **Property 2: Command Schema Validation**
    - **Validates: Requirements 2.4, 8.2, 8.3, 8.4, 8.5, 8.6**

- [ ] 2. 实现客户端注册服务
  - [x] 2.1 创建 Prisma 模型
    - 添加 ClientRegistry 模型到 schema.prisma
    - 运行 prisma generate
    - _Requirements: 9.1, 9.2_
  - [x] 2.2 实现 ClientRegistryService
    - 创建 `src/services/client-registry.service.ts`
    - 实现 register, updateMetadata, markDisconnected, getClientsByUser, revokeClient 方法
    - _Requirements: 9.1, 9.2, 9.4, 9.5, 9.6_
  - [x] 2.3 编写客户端注册属性测试
    - **Property 7: Client Registration Uniqueness**
    - **Property 8: Multiple Client Support**
    - **Validates: Requirements 9.1, 9.6**

- [x] 3. Checkpoint - 确保所有测试通过 
  - 确保所有测试通过，如有问题请询问用户

- [x] 4. 实现策略分发服务 
  - [x] 4.1 创建 PolicyVersion Prisma 模型
    - 添加 PolicyVersion 模型到 schema.prisma
    - _Requirements: 10.6_
  - [x] 4.2 实现 PolicyDistributionService
    - 创建 `src/services/policy-distribution.service.ts`
    - 实现 compilePolicy, distributePolicy, getCurrentPolicy, isPolicyOutdated, resolveConflict 方法
    - _Requirements: 10.1, 10.2, 10.3, 10.7_
  - [ ]* 4.3 编写策略分发属性测试
    - **Property 3: Policy Schema Completeness**
    - **Property 10: Policy Distribution Broadcast**
    - **Property 11: Policy Version Sync**
    - **Validates: Requirements 10.5, 10.6, 10.2, 10.3, 10.7**

- [-] 5. 实现指令队列服务 
  - [x] 5.1 创建 CommandQueue Prisma 模型
    - 添加 CommandQueue 模型到 schema.prisma
    - _Requirements: 2.6, 2.7_
  - [x] 5.2 实现 CommandQueueService
    - 创建 `src/services/command-queue.service.ts`
    - 实现 enqueue, getPendingCommands, markDelivered, markAcknowledged, cleanupExpired 方法
    - _Requirements: 2.6, 2.7_
  - [ ]* 5.3 编写指令队列属性测试
    - **Property 19: Command Acknowledgment**
    - **Property 20: Offline Queue Ordering**
    - **Validates: Requirements 2.6, 2.7**

- [x] 6. Checkpoint - 确保所有测试通过 
  - 确保所有测试通过，如有问题请询问用户

- [-] 7. 增强活动聚合服务 
  - [x] 7.1 创建 ActivityAggregate Prisma 模型
    - 添加 ActivityAggregate 模型到 schema.prisma
    - _Requirements: 11.1, 11.4_
  - [x] 7.2 实现 ActivityAggregationService
    - 创建 `src/services/activity-aggregation.service.ts`
    - 实现 ingestActivity, ingestBatch, deduplicateActivities, getAggregatedStats, calculateProductivityScore 方法
    - _Requirements: 11.1, 11.2, 11.3, 11.4_
  - [ ]* 7.3 编写活动聚合属性测试
    - **Property 12: Activity Aggregation**
    - **Property 13: Activity Deduplication**
    - **Property 14: Activity Categorization**
    - **Validates: Requirements 11.1, 11.2, 11.3**

- [x] 8. 重构 WebSocket 服务器以支持新协议 
  - [x] 8.1 更新 Socket.io 事件处理
    - 修改 `src/server/socket.ts` 以使用新的 Event/Command 类型
    - 添加事件验证逻辑（使用 octopus.ts 中的 Zod schemas）
    - _Requirements: 1.2, 1.4, 2.3, 2.4_
  - [x] 8.2 集成客户端注册
    - 在连接时注册客户端
    - 在断开时更新状态
    - _Requirements: 1.7, 9.1, 9.4_
  - [x] 8.3 集成策略分发
    - 在连接时发送当前策略
    - 在策略变更时广播
    - _Requirements: 10.2, 10.3, 10.7_
  - [x] 8.4 集成指令队列
    - 在重连时发送排队的指令
    - 处理指令确认
    - _Requirements: 2.6, 2.7_
  - [ ]* 8.5 编写状态一致性属性测试
    - **Property 4: State Consistency**
    - **Validates: Requirements 1.1, 1.4**

- [x] 9. Checkpoint - 确保所有测试通过 
  - 确保所有测试通过，如有问题请询问用户

- [-] 10. 实现安全与隔离机制 
  - [x] 10.1 增强认证验证
    - 确保所有 WebSocket 连接都经过认证
    - 添加 API token 验证逻辑
    - _Requirements: 1.6, 13.2_
  - [x] 10.2 实现速率限制
    - 创建 `src/middleware/rate-limit.middleware.ts`
    - 为事件提交添加速率限制
    - _Requirements: 13.5_
  - [x] 10.3 确保用户数据隔离
    - 审查所有查询确保包含 userId 过滤
    - 添加数据访问审计日志
    - _Requirements: 13.3_
  - [ ]* 10.4 编写安全属性测试
    - **Property 6: Authentication Enforcement**
    - **Property 17: User Data Isolation**
    - **Property 18: Rate Limiting**
    - **Validates: Requirements 1.6, 13.2, 13.3, 13.5**

- [-] 11. 更新浏览器插件以使用新协议 
  - [x] 11.1 更新 Browser Sentinel 类型定义
    - 在 `vibeflow-extension/src/types/index.ts` 中添加新的 Octopus Event/Command 类型
    - 添加 BrowserActivityEvent, BrowserSessionEvent, TabSwitchEvent, BrowserFocusEvent 类型
    - _Requirements: 2.3, 2.4, 5.18, 5.19_
  - [x] 11.2 更新 WebSocket 客户端
    - 修改 `vibeflow-extension/src/lib/websocket.ts` 以发送标准化事件
    - 处理新的指令格式
    - _Requirements: 5.21, 5.23_
  - [x] 11.3 实现事件队列
    - 添加离线事件队列
    - 在重连时重放事件
    - 限制最大存储 1000 个事件
    - _Requirements: 5.26, 5.27, 5.28, 5.29_
  - [ ]* 11.4 编写事件重放属性测试
    - **Property 15: Event Replay Idempotency**
    - **Validates: Requirements 5.28**

- [-] 12. 增强 Browser Sentinel 传感器能力 
  - [x] 12.1 实现增强活动追踪器
    - 重构 `vibeflow-extension/src/lib/activity-tracker.ts`
    - 添加滚动深度追踪 (scrollDepth)
    - 添加用户交互计数 (interactionCount)
    - 添加空闲时间追踪 (idleTime vs activeDuration)
    - _Requirements: 5.6, 5.7, 5.8, 5.9_
  - [x] 12.2 实现内容脚本交互追踪
    - 创建 `vibeflow-extension/src/content/interaction-tracker.ts`
    - 监听 click, scroll, input, keypress 事件
    - 监听 video/audio play/pause 事件
    - 向 service worker 报告交互数据
    - _Requirements: 5.7, 5.11_
  - [x] 12.3 实现会话管理器
    - 创建 `vibeflow-extension/src/lib/session-manager.ts`
    - 管理浏览会话的开始和结束
    - 聚合域名级别的活动数据
    - 检测快速标签切换模式
    - _Requirements: 5.13, 5.14, 5.15, 5.17_
  - [x] 12.4 实现搜索查询提取器
    - 创建 `vibeflow-extension/src/lib/search-extractor.ts`
    - 支持 Google, Bing, DuckDuckGo 搜索引擎
    - 从 URL 参数中提取搜索关键词
    - _Requirements: 5.12_
  - [x] 12.5 实现事件批处理器
    - 创建 `vibeflow-extension/src/lib/event-batcher.ts`
    - 批量发送事件以减少网络开销
    - 限制每批最多 50 个事件
    - 支持定时刷新和强制刷新
    - _Requirements: 5.5, 5.20_
  - [ ] 12.6 编写浏览器活动属性测试
    - **Property 21: Browser Activity Duration Accuracy**
    - **Property 22: Scroll Depth Bounds**
    - **Validates: Requirements 5.2, 5.6, 5.8, 5.9**
  - [ ] 12.7 编写会话一致性属性测试
    - **Property 23: Session Consistency**
    - **Property 24: Tab Switch Detection**
    - **Validates: Requirements 5.3, 5.13, 5.14, 5.15, 5.17**
  - [ ] 12.8 编写搜索提取属性测试
    - **Property 25: Search Query Extraction**
    - **Validates: Requirements 5.12**
  - [ ] 12.9 编写事件批处理属性测试
    - **Property 26: Event Batching Limit**
    - **Property 27: Offline Event Storage Limit**
    - **Validates: Requirements 5.20, 5.29**

- [x] 13. Checkpoint - 确保 Browser Sentinel 测试通过 ✓
  - 确保所有 Browser Sentinel 相关测试通过，如有问题请询问用户
  - ✓ Browser Sentinel TypeScript 编译通过
  - ✓ 所有 70 个属性测试通过（10 个测试文件）

- [x] 14. 更新桌面客户端以使用新协议 
  - [x] 14.1 更新 Desktop 类型定义
    - 在 `vibeflow-desktop/electron/types/index.ts` 中使用新的 Event/Command 类型
    - _Requirements: 2.3, 2.4_
  - [x] 14.2 更新连接管理器
    - 修改 `vibeflow-desktop/electron/modules/connection-manager.ts` 以支持新协议
    - 添加客户端注册逻辑
    - _Requirements: 4.11, 4.12, 4.13_
  - [x] 14.3 实现 Sensor 事件上报
    - 添加应用使用事件上报
    - 添加空闲检测事件上报
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 15. 添加 Web 客户端连接设备显示 
  - [x] 15.1 创建 tRPC 路由
    - 添加 `src/server/routers/clients.ts` 路由
    - 实现 getConnectedClients, revokeClient 端点
    - _Requirements: 9.3, 9.5_
  - [x] 15.2 创建连接设备组件
    - 创建 `src/components/settings/connected-devices.tsx`
    - 显示已连接设备列表和状态
    - _Requirements: 9.3_

- [x] 16. Final Checkpoint - 确保所有测试通过 ✓
  - 确保所有测试通过，如有问题请询问用户
  - ✓ 所有 70 个属性测试通过（10 个测试文件）
  - ✓ Browser Sentinel TypeScript 编译通过

## Notes

- 每个任务都引用了具体的需求以便追溯
- Checkpoint 任务确保增量验证
- 属性测试验证通用正确性属性
- 单元测试验证具体示例和边界情况
- 标记 `*` 的测试任务为可选，可在 MVP 阶段跳过
- Task 1 已完成：Event/Command 类型定义和 Zod schemas 已在 `src/types/octopus.ts` 中实现
- Task 1.4 和 1.5 已完成：属性测试已在 `tests/property/octopus-event-schema.property.ts` 和 `tests/property/octopus-command-schema.property.ts` 中实现
