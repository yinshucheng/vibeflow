# Implementation Plan: Pomodoro Enhancement

## Overview

本实现计划将番茄工作法增强功能分解为可执行的开发任务。采用增量开发方式，确保每个阶段都能独立验证。

## Tasks

- [x] 1. 数据库模型扩展
  - [x] 1.1 更新 Prisma Schema 添加新字段和模型
    - 扩展 UserSettings 添加工作时间、通知、预期时间设置
    - 新增 TimelineEvent 模型
    - 新增 DailyReview 模型
    - _Requirements: 5.1, 5.2, 6.1, 8.1, 8.2, 10.1, 10.2_
  - [x] 1.2 运行数据库迁移
    - 生成并应用 Prisma 迁移
    - _Requirements: 8.1, 8.2_

- [x] 2. 番茄状态持久化
  - [x] 2.1 实现 localStorage 状态缓存工具函数
    - 创建 `src/lib/pomodoro-cache.ts`
    - 实现 cachePomodoroState, restorePomodoroState, clearPomodoroCache
    - _Requirements: 1.1, 1.5_
  - [ ]* 2.2 编写状态缓存往返属性测试
    - **Property 1: Pomodoro State Round-Trip**
    - **Validates: Requirements 1.1, 1.5**
  - [x] 2.3 更新 PomodoroTimer 组件支持状态恢复
    - 页面加载时从服务器恢复状态
    - 计算准确的剩余时间
    - 处理过期会话
    - _Requirements: 1.2, 1.3, 1.4_
  - [x] 2.4 编写状态恢复准确性属性测试
    - **Property 2: State Restoration Accuracy**
    - **Validates: Requirements 1.2, 1.3**

- [x] 3. Checkpoint - 验证番茄状态持久化
  - 确保所有测试通过，如有问题请询问用户

- [x] 4. 任务页面启动番茄
  - [x] 4.1 创建 TaskPomodoroButton 组件
    - 创建 `src/components/tasks/task-pomodoro-button.tsx`
    - 实现启动按钮、运行状态显示、禁用状态
    - _Requirements: 2.1, 2.4, 2.5_
  - [x] 4.2 编写任务按钮状态一致性属性测试
    - **Property 3: Task Pomodoro Button State Consistency**
    - **Validates: Requirements 2.2, 2.4**
  - [x] 4.3 更新 TaskTree 组件集成番茄按钮
    - 在任务列表项中添加番茄按钮
    - 处理启动后导航到番茄页面
    - _Requirements: 2.2, 2.3_
  - [x] 4.4 更新 Tasks 页面支持番茄状态显示
    - 显示当前运行的番茄会话
    - _Requirements: 2.4, 2.5_

- [x] 5. Checkpoint - 验证任务页面番茄功能
  - 确保所有测试通过，如有问题请询问用户

- [x] 6. 番茄完成提醒系统
  - [x] 6.1 创建 NotificationService
    - 创建 `src/services/notification.service.ts`
    - 实现浏览器通知权限请求
    - 实现音频播放功能
    - 实现标签页标题闪烁
    - _Requirements: 4.1, 4.2, 4.5_
  - [x] 6.2 添加通知音频资源
    - 添加 bell, chime, gentle 音频文件到 public/sounds
    - _Requirements: 4.4_
  - [x] 6.3 更新 PomodoroTimer 集成通知服务
    - 番茄完成时触发通知
    - 发送 WebSocket 事件到 Browser Sentinel
    - _Requirements: 4.1, 4.2, 4.6_
  - [x] 6.4 扩展 Settings 页面添加通知设置
    - 创建通知设置表单组件
    - 支持启用/禁用、选择音效
    - _Requirements: 4.3, 4.4_

- [x] 7. 工作时间设置
  - [x] 7.1 创建 WorkTimeSettings 组件
    - 创建 `src/components/settings/work-time-settings.tsx`
    - 实现多时间段添加/编辑/删除
    - 实现时间段重叠验证
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ]* 7.2 编写时间段不重叠验证属性测试
    - **Property 7: Work Time Slot Non-Overlap Validation**
    - **Validates: Requirements 5.3**
  - [x] 7.3 创建 tRPC 路由处理工作时间设置
    - 扩展 settings router 添加 updateWorkTime mutation
    - _Requirements: 5.1, 5.2_
  - [x] 7.4 集成到 Settings 页面
    - 添加工作时间设置区域
    - _Requirements: 5.1, 5.2, 5.4_

- [x] 8. 空闲检测与提醒
  - [x] 8.1 创建 IdleService
    - 创建 `src/services/idle.service.ts`
    - 实现工作时间检测逻辑
    - 实现空闲时间追踪
    - _Requirements: 5.5, 5.9, 5.10_
  - [ ]* 8.2 编写空闲检测状态机属性测试
    - **Property 8: Idle Detection State Machine**
    - **Validates: Requirements 5.5, 5.8, 5.10**
  - [x] 8.3 实现空闲提醒触发
    - 发送 WebSocket 命令到 Browser Sentinel
    - 支持配置的提醒动作
    - _Requirements: 5.6, 5.7_
  - [x] 8.4 创建空闲提醒 UI 组件
    - 创建 `src/components/pomodoro/idle-alert.tsx`
    - _Requirements: 5.6_

- [x] 9. Checkpoint - 验证工作时间和空闲检测
  - 确保所有测试通过，如有问题请询问用户

- [x] 10. 统计服务层
  - [x] 10.1 创建 StatsService
    - 创建 `src/services/stats.service.ts`
    - 实现按项目/任务/日期分组统计
    - 实现时间范围过滤
    - _Requirements: 3.1, 3.2, 3.3, 3.6_
  - [ ]* 10.2 编写统计聚合一致性属性测试
    - **Property 4: Statistics Aggregation Consistency**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.8**
  - [ ]* 10.3 编写时间范围过滤属性测试
    - **Property 5: Statistics Time Range Filtering**
    - **Validates: Requirements 3.6, 3.10**
  - [x] 10.4 创建 tRPC 路由处理统计查询
    - 扩展 pomodoro router 添加 getStats query
    - _Requirements: 3.4, 3.5, 3.6_

- [x] 11. 统计仪表板 UI
  - [x] 11.1 创建 StatsDashboard 组件
    - 创建 `src/components/stats/stats-dashboard.tsx`
    - 实现时间范围选择器
    - 实现维度过滤器
    - _Requirements: 3.4, 3.5, 3.10_
  - [x] 11.2 创建项目统计视图
    - 创建 `src/components/stats/project-stats.tsx`
    - 显示项目时间分布和百分比
    - _Requirements: 3.1, 3.8_
  - [ ]* 11.3 编写百分比求和属性测试
    - **Property 14: Project Statistics Percentage Sum**
    - **Validates: Requirements 3.8**
  - [x] 11.4 创建任务统计视图
    - 创建 `src/components/stats/task-stats.tsx`
    - 显示任务完成/中断统计
    - _Requirements: 3.2, 3.9_
  - [x] 11.5 创建日期统计视图
    - 创建 `src/components/stats/daily-stats.tsx`
    - 显示每日番茄时间线
    - _Requirements: 3.3, 3.7_
  - [x] 11.6 创建统计页面
    - 创建 `src/app/stats/page.tsx`
    - 整合所有统计组件
    - _Requirements: 3.1-3.11_

- [x] 12. Checkpoint - 验证统计功能
  - 确保所有测试通过，如有问题请询问用户

- [x] 13. 活动时间线
  - [x] 13.1 创建 TimelineService
    - 创建 `src/services/timeline.service.ts`
    - 实现事件存储和查询
    - 实现日期过滤
    - _Requirements: 6.2, 8.1, 8.2_
  - [ ]* 13.2 编写时间线事件日期过滤属性测试
    - **Property 9: Timeline Event Date Filtering**
    - **Validates: Requirements 6.2, 6.3, 6.4, 6.5**
  - [x] 13.3 创建 CalendarView 组件
    - 创建 `src/components/timeline/calendar-view.tsx`
    - 实现日期选择器
    - _Requirements: 6.1_
  - [x] 13.4 创建 TimelineView 组件
    - 创建 `src/components/timeline/timeline-view.tsx`
    - 实现垂直时间线显示
    - 实现事件类型颜色编码
    - _Requirements: 6.3, 6.7_
  - [ ]* 13.5 编写时间线间隙计算属性测试
    - **Property 10: Timeline Gap Calculation**
    - **Validates: Requirements 6.8**
  - [x] 13.6 创建时间线过滤器组件
    - 创建 `src/components/timeline/timeline-filter.tsx`
    - 支持显示/隐藏不同事件类型
    - _Requirements: 6.6_
  - [x] 13.7 创建时间线页面
    - 创建 `src/app/timeline/page.tsx`
    - 整合日历和时间线组件
    - _Requirements: 6.1-6.8_

- [x] 14. Browser Sentinel 事件整合
  - [x] 14.1 扩展 WebSocket 服务器处理事件
    - 添加 timeline event 消息处理
    - _Requirements: 7.1, 7.2_
  - [x] 14.2 编写浏览器事件存储完整性属性测试
    - **Property 11: Browser Event Storage Integrity**
    - **Validates: Requirements 7.1, 7.2, 7.4, 7.5**
  - [x] 14.3 创建 tRPC 路由处理事件提交
    - 创建 timeline router
    - 实现 createEvent mutation
    - _Requirements: 8.4_
  - [x] 14.4 更新 Browser Sentinel 发送事件
    - 扩展 activity-tracker.ts 发送详细事件
    - 添加拦截事件、打断事件上报
    - _Requirements: 7.1, 7.2, 7.4_
  - [ ]* 14.5 编写事件去重属性测试
    - **Property 13: Event Deduplication Correctness**
    - **Validates: Requirements 8.5**

- [x] 15. Checkpoint - 验证时间线和事件整合
  - 确保所有测试通过，如有问题请询问用户

- [x] 16. 网站使用统计
  - [x] 16.1 扩展 Browser Sentinel 活动追踪
    - 更新 activity-tracker.ts 实现活跃时间检测
    - 添加空闲检测、焦点检测
    - _Requirements: 9.4, 9.5, 9.6, 9.10_
  - [ ]* 16.2 编写活跃时间 vs 打开时间属性测试
    - **Property 15: Active Time vs Open Time Invariant**
    - **Validates: Requirements 9.4, 9.7**
  - [ ]* 16.3 编写空闲检测阈值属性测试
    - **Property 17: Idle Detection Threshold**
    - **Validates: Requirements 9.5**
  - [ ]* 16.4 编写短暂切换宽限期属性测试
    - **Property 18: Brief Tab Switch Grace Period**
    - **Validates: Requirements 9.6**
  - [ ] 16.5 创建 WebsiteStatsService
    - 创建 `src/services/website-stats.service.ts`
    - 实现网站使用时间聚合
    - 实现分类统计
    - _Requirements: 9.1, 9.2, 9.8_
  - [ ]* 16.6 编写分类时间求和一致性属性测试
    - **Property 16: Category Time Sum Consistency**
    - **Validates: Requirements 9.1**
  - [ ] 16.7 创建网站使用统计 UI 组件
    - 创建 `src/components/stats/website-pie-chart.tsx`
    - 创建 `src/components/stats/website-ranking.tsx`
    - 创建 `src/components/stats/website-timeline.tsx`
    - _Requirements: 9.1, 9.2, 9.3_
  - [ ] 16.8 集成到统计页面
    - 添加网站统计标签页
    - _Requirements: 9.9_

- [x] 17. 预期时间设定与复盘
  - [x] 17.1 创建预期时间设置组件
    - 创建 `src/components/settings/expectation-settings.tsx`
    - 支持每日预期工作时间和番茄数量设置
    - 支持按星期设置不同预期
    - _Requirements: 10.1, 10.2, 10.10_
  - [x] 17.2 创建 ReviewService
    - 创建 `src/services/review.service.ts`
    - 实现每日复盘数据计算
    - 实现达成率计算
    - _Requirements: 10.3, 10.4, 10.5, 10.6_
  - [ ]* 17.3 编写达成率计算属性测试
    - **Property 19: Achievement Rate Calculation**
    - **Validates: Requirements 10.3, 10.4**
  - [ ]* 17.4 编写预期时间重算属性测试
    - **Property 20: Expected Time Recalculation**
    - **Validates: Requirements 10.9**
  - [x] 17.5 创建复盘 UI 组件
    - 创建 `src/components/stats/daily-review-card.tsx`
    - 创建 `src/components/stats/trend-chart.tsx`
    - _Requirements: 10.3, 10.4, 10.8_
  - [ ]* 17.6 编写复盘数据持久化属性测试
    - **Property 21: Daily Review Data Persistence**
    - **Validates: Requirements 10.7**
  - [x] 17.7 创建复盘页面
    - 创建 `src/app/review/page.tsx` 或集成到统计页面
    - _Requirements: 10.3-10.8_

- [x] 18. 离线支持
  - [x] 18.1 实现离线事件队列
    - 创建 `src/lib/offline-queue.ts`
    - 实现事件入队和持久化
    - _Requirements: 8.3_
  - [ ]* 18.2 编写离线队列同步完整性属性测试
    - **Property 12: Offline Queue Sync Completeness**
    - **Validates: Requirements 8.3**
  - [x] 18.3 实现网络恢复后同步
    - 监听 online 事件
    - 处理队列中的事件
    - _Requirements: 8.3_

- [x] 19. 过滤偏好持久化
  - [x] 19.1 实现过滤偏好存储
    - 使用 localStorage 存储用户过滤选择
    - _Requirements: 3.11_
  - [ ]* 19.2 编写过滤偏好往返属性测试
    - **Property 6: Filter Preference Round-Trip**
    - **Validates: Requirements 3.11**

- [x] 20. 导航更新
  - [x] 20.1 更新主导航添加新页面入口
    - 添加统计页面链接
    - 添加时间线页面链接（通过 Stats 页面访问）
    - _Requirements: 3.1, 6.1_
  - [x] 20.2 添加时间线页面到导航
    - 在主导航中添加 Timeline 链接
    - _Requirements: 6.1_

- [-] 21. Final Checkpoint - 完整功能验证
  - 确保所有测试通过
  - 验证端到端功能流程
  - 如有问题请询问用户

## Notes

- 任务标记 `*` 为可选的属性测试任务，可根据时间优先级调整
- 每个 Checkpoint 是验证阶段性成果的节点
- 属性测试使用 fast-check 库实现
- 所有新组件遵循现有项目的代码风格和目录结构
