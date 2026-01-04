# Implementation Plan: Desktop Production Resilience

## Overview

本实现计划将桌面端生产环境稳定性和防绕过机制分解为可执行的开发任务。采用增量开发方式，从数据模型开始，逐步构建心跳监控、防绕过检测、演示模式等核心功能。

## Tasks

- [x] 1. 数据模型扩展
  - [x] 1.1 扩展 Prisma Schema
    - 添加 ClientConnection 模型
    - 添加 ClientOfflineEvent 模型
    - 添加 BypassAttempt 模型
    - 添加 DemoToken 模型
    - 添加 DemoModeEvent 模型
    - 扩展 UserSettings 添加演示模式和宽限期配置
    - 运行 prisma migrate
    - _Requirements: 3.2, 3.4, 4.1, 6.2, 6.10_

- [x] 2. 心跳服务实现
  - [x] 2.1 创建 Heartbeat Service (后端)
    - 实现 `trackHeartbeat()` 方法
    - 实现 `getClientStatus()` 方法
    - 实现 `markClientOffline()` 方法
    - 实现离线检测定时任务
    - _Requirements: 3.2, 3.3, 3.4, 3.5_
  - [x] 2.2 编写心跳间隔属性测试
    - **Property 2: Heartbeat Interval Consistency**
    - **Validates: Requirements 3.1**
  - [x] 2.3 编写离线检测属性测试
    - **Property 3: Offline Detection Timing**
    - **Validates: Requirements 3.3**

- [x] 3. 心跳管理器实现 (桌面端)
  - [x] 3.1 创建 Heartbeat Manager 模块
    - 实现 30 秒心跳发送
    - 实现连接状态追踪
    - 实现断线重连逻辑
    - _Requirements: 3.1, 1.4_
  - [x] 3.2 集成心跳管理器到主进程
    - 在 main.ts 中初始化心跳管理器
    - 连接到 Connection Manager
    - _Requirements: 3.1_

- [x] 4. Checkpoint - 心跳功能验证
  - 确保心跳正常发送和接收
  - 确保离线检测正常工作
  - 确保所有测试通过，如有问题请询问用户

- [x] 5. 宽限期服务实现
  - [x] 5.1 创建 Grace Period Service
    - 实现 `startGracePeriod()` 方法
    - 实现 `cancelGracePeriod()` 方法
    - 实现 `isInGracePeriod()` 方法
    - 实现番茄钟期间缩短宽限期逻辑
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  - [x] 5.2 编写宽限期属性测试
    - **Property 4: Grace Period Bypass Prevention**
    - **Validates: Requirements 5.3, 5.4**
  - [x] 5.3 编写宽限期时长属性测试
    - **Property 5: Grace Period Duration by Context**
    - **Validates: Requirements 5.1, 5.5**

- [x] 6. 绕过检测服务实现
  - [x] 6.1 创建 Bypass Detection Service
    - 实现 `recordBypassEvent()` 方法
    - 实现 `calculateBypassScore()` 方法
    - 实现 `getBypassHistory()` 方法
    - 实现警告级别升级逻辑
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [x] 6.2 编写绕过分数计算属性测试
    - **Property 10: Bypass Score Calculation**
    - **Validates: Requirements 4.3**
  - [x] 6.3 创建绕过检测 tRPC Router
    - 添加 `getBypassScore` 查询
    - 添加 `getBypassHistory` 查询
    - 添加 `shouldShowWarning` 查询
    - _Requirements: 4.4, 4.5_

- [x] 7. Checkpoint - 绕过检测验证
  - 确保绕过事件正确记录
  - 确保分数计算正确
  - 确保所有测试通过，如有问题请询问用户

- [x] 8. 演示模式服务实现
  - [x] 8.1 创建 Demo Mode Service
    - 实现 `getRemainingTokens()` 方法
    - 实现 `activateDemoMode()` 方法
    - 实现 `deactivateDemoMode()` 方法
    - 实现 `getDemoModeState()` 方法
    - 实现月度令牌重置逻辑
    - 实现自动过期逻辑
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.7, 6.9, 6.10_
  - [x] 8.2 编写演示令牌限制属性测试
    - **Property 6: Demo Token Monthly Limit**
    - **Validates: Requirements 6.3**
  - [x] 8.3 编写演示模式时长属性测试
    - **Property 7: Demo Mode Duration Limit**
    - **Validates: Requirements 6.4, 6.6**
  - [x] 8.4 编写演示模式强制暂停属性测试
    - **Property 8: Demo Mode Enforcement Suspension**
    - **Validates: Requirements 6.9**
  - [x] 8.5 编写演示模式激活限制属性测试
    - **Property 9: Demo Mode Activation Restriction**
    - **Validates: Requirements 7.5**

- [x] 9. 演示模式 tRPC Router 和 UI
  - [x] 9.1 创建演示模式 tRPC Router
    - 添加 `getDemoModeState` 查询
    - 添加 `getRemainingTokens` 查询
    - 添加 `activateDemoMode` mutation
    - 添加 `deactivateDemoMode` mutation
    - 添加 `getDemoModeHistory` 查询
    - _Requirements: 6.8, 6.11_
  - [x] 9.2 创建演示模式激活对话框组件
    - 显示剩余令牌数
    - 显示最大时长
    - 实现确认短语输入
    - 实现激活按钮
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  - [x] 9.3 创建 Dashboard 演示模式横幅组件
    - 显示 "DEMO MODE" 标识
    - 显示剩余时间倒计时
    - 实现手动退出按钮
    - _Requirements: 6.5, 6.6_
  - [x] 9.4 集成演示模式到设置页面
    - 添加演示模式配置区域
    - 显示令牌使用历史
    - 添加激活入口
    - _Requirements: 6.13, 6.14, 7.6_

- [x] 10. Checkpoint - 演示模式验证
  - 确保演示模式激活和退出正常
  - 确保令牌限制正确执行
  - 确保所有测试通过，如有问题请询问用户

- [x] 11. 退出防护模块实现 (桌面端)
  - [x] 11.1 创建 Quit Prevention 模块
    - 实现 `canQuit()` 方法
    - 实现模式检测逻辑
    - 实现工作时间检测逻辑
    - _Requirements: 1.6, 2.1_
  - [x] 11.2 编写模式退出行为属性测试
    - **Property 1: Mode-Based Quit Behavior**
    - **Validates: Requirements 1.6, 2.1**
  - [x] 11.3 实现退出确认对话框
    - 创建确认对话框 UI
    - 实现 Skip Token 消费逻辑
    - _Requirements: 4.6, 4.7_
  - [x] 11.4 编写 Skip Token 消费属性测试
    - **Property 13: Skip Token Consumption on Quit**
    - **Validates: Requirements 4.7**
  - [x] 11.5 集成退出防护到主进程
    - 拦截 app.quit() 和窗口关闭事件
    - 显示确认对话框
    - _Requirements: 1.6, 4.6_

- [x] 12. 模式检测模块实现
  - [x] 12.1 创建 Mode Detector 模块
    - 实现环境变量检测
    - 实现命令行参数检测
    - 实现打包状态检测
    - _Requirements: 2.3, 2.5, 10.1-10.8_
  - [x] 12.2 实现开发模式指示器
    - 在托盘菜单显示当前模式
    - 在窗口标题显示 DEV MODE
    - _Requirements: 2.4_
  - [x] 12.3 集成演示模式指示器到桌面端
    - 在托盘显示 DEMO MODE
    - 在窗口显示演示模式状态
    - _Requirements: 6.5_

- [x] 13. Checkpoint - 退出防护验证
  - 确保开发模式可自由退出
  - 确保生产模式工作时间内阻止退出
  - 确保所有测试通过，如有问题请询问用户

- [x] 14. 进程守护器实现
  - [x] 14.1 创建 Process Guardian 独立进程
    - 创建 guardian/ 目录结构
    - 实现进程监控逻辑
    - 实现自动重启逻辑
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [x] 14.2 编写进程守护重启属性测试
    - **Property 11: Process Guardian Restart Timing**
    - **Validates: Requirements 1.3, 8.3**
  - [x] 14.3 实现 Guardian IPC 通信
    - 实现双向健康检查
    - 实现状态同步
    - _Requirements: 8.7, 8.8_
  - [x] 14.4 配置 Guardian 开机自启动
    - 创建 macOS launchd plist 文件
    - 实现安装/卸载脚本
    - _Requirements: 8.6_

- [x] 15. 离线模式实现
  - [x] 15.1 实现策略本地缓存
    - 缓存 enforcement policy 到本地存储
    - 实现缓存读取和更新逻辑
    - _Requirements: 9.2_
  - [x] 15.2 编写离线策略缓存属性测试
    - **Property 12: Offline Mode Policy Caching**
    - **Validates: Requirements 9.1, 9.2**
  - [x] 15.3 实现离线事件队列
    - 队列 skip token 使用
    - 队列绕过事件
    - 实现重连后同步
    - _Requirements: 9.3, 9.6_
  - [x] 15.4 实现离线模式 UI 指示器
    - 显示 "Offline Mode" 状态
    - 显示长时间离线警告
    - _Requirements: 9.4, 9.5_

- [x] 16. Checkpoint - 离线模式验证
  - 确保离线时继续强制执行
  - 确保重连后事件正确同步
  - 确保所有测试通过，如有问题请询问用户

- [x] 17. VSCode 启动配置
  - [x] 17.1 更新 .vscode/launch.json
    - 添加 Backend: Next.js 配置
    - 添加 Desktop: Electron 配置
    - 添加 Desktop: Electron (Staging) 配置
    - 添加 Attach to Desktop 配置
    - 添加 Full Stack compound 配置
    - _Requirements: 2.10, 2.11, 2.12_

- [x] 18. 服务管理脚本
  - [x] 18.1 创建 vibeflow 服务管理脚本
    - 实现 start 命令
    - 实现 stop 命令
    - 实现 restart 命令
    - 实现 status 命令
    - 实现 logs 命令
    - _Requirements: 13.1-13.8_
  - [x] 18.2 配置 PM2 后端服务
    - 创建 ecosystem.config.js
    - 配置自动重启
    - _Requirements: 11.4, 11.5_

- [x] 19. 统计和时间线展示
  - [x] 19.1 扩展统计页面
    - 添加客户端在线时长统计
    - 添加绕过尝试历史
    - 添加演示模式使用历史
    - _Requirements: 3.6, 4.5, 6.8_
  - [x] 19.2 扩展时间线视图
    - 添加演示模式事件显示
    - 添加离线事件显示
    - _Requirements: 6.11_

- [x] 20. 运维文档
  - [x] 20.1 创建 docs/operations.md
    - 编写快速开始指南
    - 编写 VSCode 启动配置说明
    - 编写服务管理命令参考
    - 编写故障排除指南
    - 编写架构概览
    - _Requirements: 14.1-14.8_

- [x] 21. Final Checkpoint - 完整功能验证
  - 确保所有功能正常工作
  - 确保所有属性测试通过
  - 确保文档完整
  - 如有问题请询问用户

## Notes

- 每个属性测试引用设计文档中的对应属性
- Checkpoint 任务用于阶段性验证，确保增量开发的稳定性
- 进程守护器需要 macOS 系统权限配置
- 服务管理脚本需要 PM2 全局安装
