# Implementation Plan: iOS MVP

## Overview

本实现计划将 iOS MVP 分解为可执行的编码任务。采用增量开发方式，从项目初始化开始，逐步实现核心功能。

**核心原则：**
- 使用默认用户（test@example.com），无需登录流程
- 所有数据只读，不向服务器写入任何状态
- 缓存仅用于离线查看，不做任何本地状态修改

## Tasks

- [x] 1. 项目初始化与基础配置
  - [x] 1.1 创建 Expo 项目并配置 TypeScript
    - 在项目根目录创建 `vibeflow-ios/` 目录
    - 使用 `npx create-expo-app` 创建 Expo managed workflow 项目
    - 配置 TypeScript strict mode
    - 配置 path alias `@/` → `./src/`
    - 安装核心依赖：zustand, socket.io-client, @react-navigation/native
    - _Requirements: 1.1, 1.2, 1.6_

  - [x] 1.2 配置共享类型定义
    - 创建 `vibeflow-ios/src/types/` 目录
    - 从主项目复制或引用 `src/types/octopus.ts` 中的类型定义
    - 创建 iOS 特定类型定义文件
    - _Requirements: 1.7_

  - [x] 1.3 配置导航结构
    - 安装 React Navigation 依赖
    - 创建 Tab Navigator (状态、设置)
    - 无需 Stack Navigator（无登录流程）
    - _Requirements: 9.2_

  - [x] 1.4 配置默认用户
    - 创建 `src/config/auth.ts` 配置默认用户 email
    - 配置 HTTP 请求头 X-Dev-User-Email
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 2. WebSocket 通信模块
  - [x] 2.1 实现 WebSocket Client Service
    - 创建 `src/services/websocket.service.ts`
    - 实现 Socket.io 连接管理
    - 实现自动重连逻辑（指数退避：1s, 2s, 4s, max 30s）
    - 实现事件监听（只接收，不发送状态变更）
    - _Requirements: 2.1, 2.4_

  - [ ]* 2.2 编写重连退避属性测试
    - **Property 3: Reconnection Backoff Calculation**
    - **Validates: Requirements 2.4**

  - [x] 2.3 实现 Heartbeat Service
    - 创建 `src/services/heartbeat.service.ts`
    - 实现 30 秒心跳发送（只发送心跳，不发送其他事件）
    - 实现心跳事件构造（platform: 'ios', clientType: 'mobile'）
    - _Requirements: 2.2, 2.6_

  - [ ]* 2.4 编写心跳事件属性测试
    - **Property 1: Mobile Client Registration Consistency**
    - **Validates: Requirements 1.3, 1.4, 2.2**

  - [x] 2.5 实现 Client ID 生成与持久化
    - 创建 `src/utils/client-id.ts`
    - 实现唯一 clientId 生成
    - 实现 AsyncStorage 持久化
    - _Requirements: 1.4_

- [x] 3. 状态管理模块（只读）
  - [x] 3.1 实现 Zustand Store
    - 创建 `src/store/app.store.ts`
    - 定义只读状态接口（连接状态、每日状态、番茄钟、任务）
    - 实现状态更新 actions（仅从服务器接收更新）
    - _Requirements: 2.3, 4.1_

  - [x] 3.2 实现 SYNC_STATE 命令处理
    - 实现 full sync 处理（只读接收）
    - 实现 delta sync 处理（只读接收）
    - 连接 WebSocket 事件到 Store
    - _Requirements: 2.3_

  - [ ]* 3.3 编写连接状态属性测试
    - **Property 4: Connection Status Indicator**
    - **Validates: Requirements 2.5**

- [x] 4. Checkpoint - 通信模块验证
  - 确保 WebSocket 连接正常建立
  - 确保心跳正常发送
  - 确保状态同步正常接收（只读）
  - 确保所有测试通过，如有问题请询问用户

- [x] 5. 缓存模块（只读数据缓存）
  - [x] 5.1 实现 Policy Cache Service
    - 创建 `src/services/cache.service.ts`
    - 实现 AsyncStorage 只读状态存储
    - 实现状态加载
    - 实现 24 小时过期检测
    - 注意：缓存仅用于离线查看，不做任何写入操作
    - _Requirements: 7.1, 7.3, 7.6, 7.7_

  - [x] 5.2 编写缓存往返属性测试
    - **Property 2: State Sync Round-Trip**
    - **Validates: Requirements 2.3, 7.1**

  - [ ]* 5.3 编写缓存过期属性测试
    - **Property 16: Cache Expiry Detection**
    - **Validates: Requirements 7.6**

- [x] 6. 番茄钟显示模块（只读）
  - [x] 6.1 实现番茄钟时间计算工具
    - 创建 `src/utils/pomodoro-calculator.ts`
    - 实现剩余时间计算（基于服务器同步的 startTime）
    - 实现时间格式化 (MM:SS)
    - 实现进度百分比计算
    - _Requirements: 4.2_

  - [x] 6.2 编写番茄钟时间计算属性测试
    - **Property 7: Pomodoro Remaining Time Calculation**
    - **Validates: Requirements 4.2**

  - [x] 6.3 实现番茄钟状态组件（只读显示）
    - 创建 `src/components/PomodoroStatus.tsx`
    - 显示倒计时圆环（只读）
    - 显示当前任务标题（只读）
    - 显示今日完成数（只读）
    - 无任何操作按钮（不能开始/暂停/停止）
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.7_

- [x] 7. 任务列表显示模块（只读）
  - [x] 7.1 实现任务过滤工具
    - 创建 `src/utils/task-filter.ts`
    - 实现今日任务过滤
    - 实现 Top 3 任务标记
    - _Requirements: 5.1, 5.2_

  - [ ]* 7.2 编写任务过滤属性测试
    - **Property 9: Today Task Filtering**
    - **Validates: Requirements 5.2**

  - [x] 7.3 实现任务列表组件（只读显示）
    - 创建 `src/components/TaskList.tsx`
    - 显示 Top 3 任务（只读）
    - 显示今日任务列表（只读）
    - 区分完成/进行中/待办状态（只读显示）
    - 无任何操作按钮（不能创建/编辑/完成）
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 8. Checkpoint - 显示模块验证
  - 确保番茄钟状态正确显示（只读）
  - 确保任务列表正确过滤和显示（只读）
  - 确保所有测试通过，如有问题请询问用户

- [x] 9. Screen Time 屏蔽模块
  - [x] 9.1 创建 Screen Time Native Module
    - 创建 `vibeflow-ios/ios/ScreenTimeBridge/` 目录
    - 实现 Swift 原生模块
    - 实现 Family Controls API 调用
    - 实现 React Native 桥接
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 9.2 实现屏蔽状态管理
    - 创建 `src/services/blocking.service.ts`
    - 实现屏蔽启用/禁用逻辑（基于服务器同步的番茄钟状态）
    - 实现屏蔽状态持久化（用于 app 重启恢复）
    - 实现与番茄钟状态联动（只读监听，自动响应）
    - _Requirements: 6.2, 6.3, 6.8_

  - [ ] 9.3 编写屏蔽状态一致性属性测试
    - **Property 11: App Blocking State Consistency**
    - **Validates: Requirements 6.2, 6.3**

  - [x] 9.4 实现策略同步更新屏蔽列表
    - 监听 UPDATE_POLICY 命令（只读接收）
    - 更新本地屏蔽应用列表
    - _Requirements: 6.6_

  - [x] 9.5 配置默认屏蔽应用
    - 配置默认屏蔽列表（微信、微博、抖音、小红书、B站）
    - 从服务器策略同步屏蔽列表（只读）
    - _Requirements: 6.4_

- [x] 10. 通知模块
  - [x] 10.1 实现 Notification Service
    - 创建 `src/services/notification.service.ts`
    - 集成 expo-notifications
    - 实现权限请求
    - 实现本地通知发送
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 10.2 实现通知触发逻辑
    - 监听番茄钟完成事件（从服务器同步）
    - 监听休息结束事件（从服务器同步）
    - 发送对应通知（只读提醒，无操作按钮）
    - _Requirements: 8.2, 8.3, 8.4_

- [x] 11. 主界面实现
  - [x] 11.1 实现状态主屏幕
    - 创建 `src/screens/StatusScreen.tsx`
    - 集成 PomodoroStatus 组件（只读）
    - 集成 TaskList 组件（只读）
    - 显示每日状态指示器（只读）
    - 显示连接状态指示器
    - _Requirements: 4.1, 9.1, 9.4_

  - [x] 11.2 实现设置屏幕（只读）
    - 创建 `src/screens/SettingsScreen.tsx`
    - 显示用户信息（默认用户 email）
    - 显示屏蔽应用列表（只读）
    - 显示 Screen Time 授权状态
    - 显示 app 版本和连接状态
    - 无任何可修改的设置项
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 11.3 实现离线模式指示器
    - 显示 "离线模式" 标签
    - 显示缓存数据过期警告
    - _Requirements: 7.2_

- [x] 12. Checkpoint - 功能集成验证
  - 确保所有功能正常工作
  - 确保离线模式正常显示缓存数据（只读）
  - 确保 Screen Time 屏蔽正常工作
  - 确保所有测试通过，如有问题请询问用户

- [x] 13. 样式与主题
  - [x] 13.1 实现主题系统
    - 创建 `src/theme/` 目录
    - 实现 light/dark 主题
    - 与 Web 版本保持一致的颜色和字体
    - _Requirements: 9.3, 9.5_

  - [x] 13.2 优化 UI 组件样式
    - 统一组件样式
    - 优化 iPhone 屏幕适配
    - _Requirements: 9.6_

- [x] 14. 最终验证
  - [x] 14.1 端到端功能测试
    - 测试状态同步（只读）
    - 测试 App 屏蔽功能
    - 测试离线模式（只读缓存）
    - 测试通知功能

  - [x] 14.2 创建 README 文档
    - 编写项目设置说明
    - 编写开发指南
    - 说明只读模式限制
    - _Requirements: 1.2_

## Notes

- 任务标记 `*` 的为可选测试任务，可跳过以加快 MVP 开发
- **所有数据操作都是只读的**，iOS 端不向服务器写入任何状态
- 缓存仅用于离线查看，不做任何本地状态修改
- 使用默认用户 test@example.com，无需登录流程
- Screen Time Native Module 需要 Xcode 和 iOS 开发环境
