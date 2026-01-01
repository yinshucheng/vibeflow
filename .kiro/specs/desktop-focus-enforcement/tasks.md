# Implementation Plan: Desktop Focus Enforcement

## Overview

本实现计划将 VibeFlow 桌面端专注强制执行功能分解为可执行的开发任务。采用增量开发方式，从基础设施开始，逐步构建核心功能模块。

## Tasks

- [x] 1. 项目基础设施搭建
  - [x] 1.1 创建 Electron 项目结构
    - 在项目根目录创建 `vibeflow-desktop/` 目录
    - 初始化 package.json 和 TypeScript 配置
    - 配置 electron-builder 打包设置
    - _Requirements: 1.1_
  - [x] 1.2 配置 Electron 主进程入口
    - 创建 `electron/main.ts` 主进程文件
    - 配置 BrowserWindow 加载远程 Web 应用
    - 实现基本的窗口管理（显示/隐藏/置顶）
    - _Requirements: 1.2, 1.3_
  - [x] 1.3 实现 Preload 脚本和 IPC 通信
    - 创建 `electron/preload.ts` 预加载脚本
    - 定义主进程与渲染进程的 IPC 通道
    - 暴露安全的 API 给渲染进程
    - _Requirements: 1.2_

- [x] 2. 数据模型扩展
  - [x] 2.1 扩展 Prisma Schema
    - 添加 enforcementMode、distractionApps 等字段到 UserSettings
    - 创建 SkipTokenUsage 模型
    - 创建 SettingsModificationLog 模型
    - 运行 prisma migrate
    - _Requirements: 3.1, 5.4, 8.7_
  - [x] 2.2 扩展 User Service
    - 添加 enforcement 相关设置的 CRUD 方法
    - 添加 skip token 管理方法
    - 添加 settings modification logging
    - _Requirements: 3.2, 3.3, 3.4, 5.2, 5.3, 8.7_
  - [ ]* 2.3 编写 Skip Token 管理属性测试
    - **Property 5: Skip Token Management**
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.6**

- [x] 3. Settings Lock 服务实现
  - [x] 3.1 创建 Settings Lock Service
    - 实现 `canModifySetting()` 函数
    - 实现 `isWithinWorkHours()` 检查
    - 实现开发模式/生产模式区分
    - _Requirements: 3.5, 3.6, 8.1, 8.4, 8.5, 8.6_
  - [ ]* 3.2 编写 Settings Lock 属性测试
    - **Property 3: Settings Lock Based on Mode and Work Time**
    - **Validates: Requirements 3.5, 3.6, 4.8, 5.8, 8.4, 8.5, 8.6**
  - [x] 3.3 集成 Settings Lock 到设置页面
    - 在设置组件中调用 canModifySetting 检查
    - 显示锁定状态和解锁时间提示
    - _Requirements: 8.2, 8.3_

- [x] 4. Checkpoint - 基础设施验证
  - 确保 Electron 应用能够启动并加载 Web 应用
  - 确保数据库迁移成功
  - 确保所有测试通过，如有问题请询问用户

- [x] 5. Focus Enforcer 模块实现
  - [x] 5.1 创建 Focus Enforcer 核心逻辑
    - 实现 `shouldTriggerIntervention()` 函数
    - 实现空闲时间追踪
    - 实现干预触发逻辑
    - _Requirements: 2.1, 2.6, 2.7_
  - [ ]* 5.2 编写空闲检测属性测试
    - **Property 1: Idle Detection State Machine**
    - **Validates: Requirements 2.1, 2.7, 7.7**
  - [x] 5.3 实现执行模式逻辑
    - 实现严格模式行为
    - 实现温和模式行为
    - _Requirements: 2.4, 2.5, 4.2, 4.5_
  - [ ]* 5.4 编写执行模式属性测试
    - **Property 2: Enforcement Mode Determines App Control Action**
    - **Validates: Requirements 2.4, 2.5, 4.2, 4.5**

- [x] 6. App Controller 模块实现 (macOS)
  - [x] 6.1 创建 App Controller 模块
    - 实现 AppleScript 执行封装
    - 实现 `getRunningApps()` 函数
    - 实现 `quitApp()` 和 `hideApp()` 函数
    - _Requirements: 2.4, 2.5_
  - [x] 6.2 实现权限检查
    - 实现 Accessibility 权限检查
    - 实现权限引导流程
    - _Requirements: 1.5, 9.1, 9.2, 9.3_
  - [ ]* 6.3 编写权限检查属性测试
    - **Property 9: Permission-Based Feature Availability**
    - **Validates: Requirements 9.3**
  - [x] 6.4 创建预设分心应用配置
    - 定义常见分心应用列表
    - 实现应用列表管理 UI
    - _Requirements: 3.1, 3.7_
  - [ ]* 6.5 编写分心应用列表管理属性测试
    - **Property 4: Distraction App List Management**
    - **Validates: Requirements 3.2, 3.3, 3.4**

- [x] 7. Checkpoint - 桌面端核心功能验证
  - 确保 Focus Enforcer 能正确检测空闲状态
  - 确保 App Controller 能控制 macOS 应用
  - 确保所有测试通过，如有问题请询问用户

- [x] 8. 系统托盘和通知
  - [x] 8.1 实现系统托盘
    - 创建托盘图标和菜单
    - 实现快捷操作（开始番茄、查看状态）
    - _Requirements: 1.4_
  - [x] 8.2 实现系统通知
    - 实现干预触发时的通知
    - 实现窗口置顶功能
    - _Requirements: 2.2, 2.3_
  - [x] 8.3 实现开机自启动
    - 配置 auto-launch
    - 添加设置选项
    - _Requirements: 1.6_

- [x] 9. Skip Token 机制实现
  - [x] 9.1 实现 Skip Token 服务
    - 实现 token 消费逻辑
    - 实现每日重置逻辑
    - 实现模式相关的限制
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 4.4, 4.7_
  - [x] 9.2 实现干预响应 UI
    - 创建干预弹窗组件
    - 实现"开始番茄"、"跳过"、"延迟"按钮
    - 显示剩余 token 数量
    - _Requirements: 5.1_
  - [x] 9.3 实现 Skip Token 统计展示
    - 在统计页面显示每日使用历史
    - _Requirements: 5.7_

- [x] 10. Browser Sentinel 增强
  - [x] 10.1 增强 URL 拦截逻辑
    - 实现工作时间内的拦截检查
    - 实现模式相关的拦截行为
    - _Requirements: 6.1, 4.3_
  - [ ]* 10.2 编写浏览器拦截属性测试
    - **Property 6: Browser Blocking Behavior by Mode**
    - **Validates: Requirements 4.3, 4.6, 6.1, 6.2, 6.7**
  - [x] 10.3 实现 Dashboard 跳转
    - 实现关闭标签页并打开 Dashboard
    - 实现标签页替换配置
    - 显示被拦截网站信息
    - _Requirements: 6.2, 6.3, 6.6_
  - [x] 10.4 实现温和模式警告覆盖层
    - 创建倒计时警告组件
    - 实现"继续"和"返回"选项
    - _Requirements: 4.6, 6.7_
  - [x] 10.5 实现未登录用户处理
    - 实现插件内提醒覆盖层
    - 实现重复访问后强制登录
    - _Requirements: 6.4, 6.5_
  - [ ]* 10.6 编写未登录用户处理属性测试
    - **Property 7: Unauthenticated User Handling**
    - **Validates: Requirements 6.4, 6.5**

- [x] 11. Checkpoint - 浏览器插件增强验证
  - 确保插件能正确拦截黑名单网站
  - 确保跳转和警告功能正常
  - 确保所有测试通过，如有问题请询问用户

- [x] 12. 番茄自动开始配置
  - [x] 12.1 扩展用户设置
    - 添加 autoStartBreak、autoStartNextPomodoro 设置
    - 添加 autoStartCountdown 设置
    - _Requirements: 7.1, 7.2_
  - [x] 12.2 修改番茄计时器组件
    - 实现自动开始倒计时逻辑
    - 实现手动确认按钮
    - 实现等待确认时的提示音
    - _Requirements: 7.3, 7.4, 7.5, 7.6_
  - [ ]* 12.3 编写自动开始属性测试
    - **Property 10: Pomodoro Auto-Start Transition**
    - **Validates: Requirements 7.5**

- [x] 13. 设置修改日志
  - [x] 13.1 实现日志记录服务
    - 创建 settings modification log service
    - 在所有设置修改处添加日志记录
    - _Requirements: 8.7_
  - [ ]* 13.2 编写日志记录属性测试
    - **Property 8: Settings Modification Logging**
    - **Validates: Requirements 8.7**

- [x] 14. 连接状态和安全
  - [x] 14.1 实现连接状态管理
    - 实现断线重连逻辑
    - 显示连接状态指示器
    - _Requirements: 1.7_
  - [x] 14.2 实现安全连接
    - 配置 WSS 连接
    - 实现证书验证
    - _Requirements: 9.4, 9.5, 9.6_

- [x] 15. Final Checkpoint - 完整功能验证
  - 确保所有功能正常工作
  - 确保所有属性测试通过
  - 确保 Electron 应用能正确打包
  - 如有问题请询问用户

## Notes

- 任务标记 `*` 的为可选测试任务，可以跳过以加快 MVP 开发
- 每个属性测试引用设计文档中的对应属性
- Checkpoint 任务用于阶段性验证，确保增量开发的稳定性
- macOS 应用控制需要用户授予 Accessibility 权限
