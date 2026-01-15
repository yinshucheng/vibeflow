# Implementation Plan: iOS Mobile Enhancement

## Overview

将 iOS 客户端从只读状态查看器升级为轻量级操作终端，分 3 个 Phase 实现。

## Phase 1: 基础交互能力

### 1.1 WebSocket Service 扩展
- [ ] 1.1.1 添加 `sendUserAction` 方法
- [ ] 1.1.2 添加 `USER_ACTION` 事件类型定义
- [ ] 1.1.3 添加 `ACTION_RESULT` 命令处理
- [ ] 1.1.4 添加 `onActionResult` 订阅方法
- _Requirements: 1, 2_

### 1.2 Action Service 实现
- [ ] 1.2.1 创建 `src/services/action.service.ts`
- [ ] 1.2.2 实现 `completeTask` 方法
- [ ] 1.2.3 实现 `startPomodoro` 方法
- [ ] 1.2.4 实现错误处理和重试逻辑
- _Requirements: 1, 2_

### 1.3 Store 乐观更新支持
- [ ] 1.3.1 添加 `OptimisticUpdate` 类型和状态
- [ ] 1.3.2 实现 `applyOptimisticUpdate` 方法
- [ ] 1.3.3 实现 `confirmOptimisticUpdate` 方法
- [ ] 1.3.4 实现 `rollbackOptimisticUpdate` 方法
- _Requirements: 1, 2, 5_

### 1.4 任务完成操作 UI
- [ ] 1.4.1 修改 `TaskItem` 组件添加 checkbox
- [ ] 1.4.2 实现点击完成交互
- [ ] 1.4.3 添加完成动画效果
- [ ] 1.4.4 实现 swipe-to-complete 手势
- _Requirements: 1_

### 1.5 番茄钟控制 UI
- [ ] 1.5.1 修改 `PomodoroCard` 添加启动按钮
- [ ] 1.5.2 实现任务选择启动番茄钟
- [ ] 1.5.3 实现无任务番茄钟启动
- [ ] 1.5.4 添加任务切换功能
- _Requirements: 2_

### Checkpoint 1
- [ ] 验证任务完成操作端到端流程
- [ ] 验证番茄钟启动端到端流程
- [ ] 验证乐观更新和回滚机制

---

## Phase 2: 任务管理

### 2.1 快速任务创建
- [ ] 2.1.1 创建 `QuickTaskInput` 组件
- [ ] 2.1.2 实现 Action Service `createTask` 方法
- [ ] 2.1.3 实现简单优先级解析（! = P1）
- [ ] 2.1.4 添加浮动 "+" 按钮到主屏幕
- _Requirements: 4_

### 2.2 任务状态切换
- [ ] 2.2.1 实现长按显示 action sheet
- [ ] 2.2.2 实现 Action Service `updateTaskStatus` 方法
- [ ] 2.2.3 添加左滑快捷操作（删除、编辑）
- [ ] 2.2.4 实现状态变化动画
- _Requirements: 5_

### 2.3 Top 3 任务管理
- [ ] 2.3.1 创建 `Top3Selector` 模态组件
- [ ] 2.3.2 实现 Action Service `setTop3` 方法
- [ ] 2.3.3 实现星标点击切换 Top 3
- [ ] 2.3.4 实现拖拽排序（可选）
- _Requirements: 3_

### 2.4 基础任务编辑
- [ ] 2.4.1 创建 `TaskDetailScreen` 页面
- [ ] 2.4.2 实现 Action Service `updateTask` 方法
- [ ] 2.4.3 实现标题、优先级、日期编辑
- [ ] 2.4.4 实现项目切换
- _Requirements: 10_

### Checkpoint 2
- [ ] 验证任务创建流程
- [ ] 验证状态切换流程
- [ ] 验证 Top 3 管理流程
- [ ] 验证任务编辑流程

---

## Phase 3: 项目和设置

### 3.1 项目显示与筛选
- [ ] 3.1.1 扩展 Store 添加 `projects` 状态
- [ ] 3.1.2 扩展 SYNC_STATE 处理项目数据
- [ ] 3.1.3 创建 `ProjectsScreen` 或项目选择器
- [ ] 3.1.4 实现按项目筛选任务列表
- _Requirements: 6_

### 3.2 专注策略管理
- [ ] 3.2.1 扩展 Store 添加 `focusPolicy` 状态
- [ ] 3.2.2 创建 `FocusPolicyScreen` 页面
- [ ] 3.2.3 实现白名单/黑名单显示
- [ ] 3.2.4 实现 Action Service `updateFocusPolicy` 方法
- [ ] 3.2.5 创建 `AppPicker` 组件
- _Requirements: 7_

### 3.3 睡眠时间设置
- [ ] 3.3.1 扩展 Store 添加 `sleepTime` 状态
- [ ] 3.3.2 创建 `SleepTimeSettings` 组件
- [ ] 3.3.3 实现时间选择器
- [ ] 3.3.4 实现 Action Service `updateSleepTime` 方法
- _Requirements: 8_

### 3.4 推送通知
- [ ] 3.4.1 配置 expo-notifications
- [ ] 3.4.2 实现本地通知（番茄钟完成）
- [ ] 3.4.3 添加通知设置页面
- [ ] 3.4.4 实现通知点击跳转
- _Requirements: 9_

### Checkpoint 3
- [ ] 验证项目筛选功能
- [ ] 验证专注策略同步
- [ ] 验证睡眠时间设置
- [ ] 验证推送通知

---

## Server-Side Tasks

### S.1 WebSocket 事件处理
- [ ] S.1.1 添加 `USER_ACTION` 事件监听
- [ ] S.1.2 实现 action 分发到对应 service
- [ ] S.1.3 实现 `ACTION_RESULT` 响应
- [ ] S.1.4 确保状态广播到所有客户端

### S.2 扩展 SYNC_STATE
- [ ] S.2.1 添加 `projects` 到 FullState
- [ ] S.2.2 添加 `sleepTime` 到 FullState
- [ ] S.2.3 添加 `focusPolicy` 详细数据

---

## 验收标准

| 需求 | 验收条件 |
|------|---------|
| 1. 任务完成 | 点击 checkbox 立即更新 UI，服务端同步成功 |
| 2. 番茄钟控制 | 可启动番茄钟，倒计时正确，可切换任务 |
| 3. Top 3 管理 | 可设置/修改 Top 3，星标正确显示 |
| 4. 快速创建 | 可快速创建任务，支持优先级前缀 |
| 5. 状态切换 | 长按可切换状态，左滑可删除/编辑 |
| 6. 项目筛选 | 可查看项目列表，可按项目筛选任务 |
| 7. 专注策略 | 可查看/编辑白名单和黑名单 |
| 8. 睡眠时间 | 可设置睡眠时间，同步到服务端 |
| 9. 推送通知 | 番茄钟完成时收到通知 |
| 10. 任务编辑 | 可编辑任务标题、优先级、日期、项目 |
