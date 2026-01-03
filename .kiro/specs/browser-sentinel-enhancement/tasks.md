# Implementation Plan: Browser Sentinel Enhancement

## Overview

本实现计划将 Browser Sentinel 增强功能分为以下几个阶段：
1. 数据模型和服务端基础设施
2. 娱乐模式核心功能
3. 状态限制（LOCKED/OVER_REST）
4. 活动追踪和工作启动时间
5. UI 组件和集成

## Tasks

- [x] 1. 数据模型和服务端基础设施
  - [x] 1.1 扩展 Prisma Schema 添加娱乐相关字段
    - 在 UserSettings 中添加 entertainmentBlacklist, entertainmentWhitelist, entertainmentQuotaMinutes, entertainmentCooldownMinutes
    - 创建 DailyEntertainmentState 模型
    - 创建 WorkStartRecord 模型
    - 运行 prisma migrate
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 1.2 创建娱乐服务 (entertainment.service.ts)
    - 实现 getStatus, startEntertainment, stopEntertainment
    - 实现 updateQuotaUsage, resetDailyQuotas
    - 实现冷却时间检查逻辑
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9_

  - [x] 1.3 编写娱乐服务属性测试
    - **Property 3: Entertainment Mode Work Time Exclusivity**
    - **Property 4: Entertainment Quota Enforcement**
    - **Property 5: Entertainment Cooldown Enforcement**
    - **Validates: Requirements 5.2, 5.3, 5.5, 5.6, 5.13, 5.14**

  - [x] 1.4 创建娱乐 tRPC 路由 (entertainment.ts)
    - 实现 getStatus, start, stop, updateSettings 端点
    - 添加工作时间检查中间件
    - _Requirements: 8.2, 8.3, 8.4, 8.5_

  - [x] 1.5 创建工作启动服务 (work-start.service.ts)
    - 实现 recordWorkStart, getTodayWorkStart
    - 实现延迟计算逻辑
    - _Requirements: 14.1, 14.2, 14.7, 14.8_

- [x] 2. Checkpoint - 服务端基础设施完成
  - 确保所有测试通过，如有问题请询问用户

- [x] 3. Browser Sentinel 娱乐模式核心
  - [x] 3.1 创建娱乐管理器 (entertainment-manager.ts)
    - 实现 EntertainmentManager 类
    - 实现 canStartEntertainment, startEntertainment, stopEntertainment
    - 实现 isEntertainmentSite, isWhitelisted 匹配逻辑
    - _Requirements: 2.1, 2.3, 2.5, 2.6, 2.7, 5.2, 5.3_

  - [x] 3.2 编写娱乐网站匹配属性测试
    - **Property 6: Entertainment Blacklist Domain Blocking**
    - **Property 7: Entertainment Whitelist Override**
    - **Validates: Requirements 2.1, 2.3, 2.5, 2.6, 2.7**

  - [x] 3.3 扩展 PolicyManager 支持娱乐网站
    - 添加 entertainmentBlacklist, entertainmentWhitelist 到 PolicyCache
    - 实现 shouldBlockEntertainment 方法
    - 集成娱乐模式状态检查
    - _Requirements: 2.1, 2.10, 3.7, 3.8_

  - [x] 3.4 实现娱乐模式 WebSocket 同步
    - 添加 ENTERTAINMENT_MODE 事件类型
    - 实现服务端广播娱乐状态变化
    - 实现客户端接收和处理
    - _Requirements: 8.6, 10.3_

  - [x] 3.5 编写娱乐模式访问属性测试
    - **Property 8: Entertainment Mode Site Access**
    - **Validates: Requirements 2.10, 3.8**

- [x] 4. Checkpoint - 娱乐模式核心完成
  - 确保所有测试通过，如有问题请询问用户

- [x] 5. LOCKED 和 OVER_REST 状态限制
  - [x] 5.1 扩展 PolicyManager 状态限制逻辑
    - 实现 isRestrictedState 方法
    - 实现 LOCKED 状态 Dashboard 重定向（无论工作时间）
    - 实现 OVER_REST 状态 Dashboard 重定向
    - _Requirements: 1.1, 1.2, 1.6, 1.10_

  - [x] 5.2 编写状态限制属性测试
    - **Property 1: LOCKED State Dashboard Restriction**
    - **Property 2: OVER_REST State Dashboard Restriction**
    - **Validates: Requirements 1.1, 1.2, 1.6, 1.10**

  - [x] 5.3 实现状态感知 URL 阻止
    - 修改 service-worker.ts 中的 URL 检查逻辑
    - 添加状态特定的重定向和覆盖层
    - 实现 Dashboard 标签页复用逻辑
    - _Requirements: 1.3, 1.4, 1.5_

  - [x] 5.4 创建状态特定的屏保页面
    - 创建 locked-screensaver.html（显示"请完成今日计划"）
    - 创建 over-rest-screensaver.html（显示"超时休息中，请开始工作"）
    - _Requirements: 1.6, 1.7_

- [x] 6. Checkpoint - 状态限制完成
  - 确保所有测试通过，如有问题请询问用户

- [x] 7. 活动追踪和工作启动时间
  - [x] 7.1 扩展 Octopus 事件类型
    - 添加 ENTERTAINMENT_MODE 事件类型到 types/index.ts
    - 添加 WORK_START 事件类型
    - 更新 WebSocket 客户端发送方法
    - _Requirements: 10.3, 10.11, 13.7, 13.8, 14.9_

  - [x] 7.2 编写 Octopus 协议一致性属性测试
    - **Property 14: Octopus Protocol Consistency**
    - **Validates: Requirements 10.3, 10.11, 13.7, 13.8**

  - [x] 7.3 实现工作启动时间追踪
    - 在状态变化处理中检测 LOCKED → PLANNING 转换
    - 调用 WorkStartTracker 记录工作启动
    - 发送 WORK_START 事件到服务器
    - _Requirements: 14.1, 14.2, 14.10_

  - [x] 7.4 编写工作启动延迟计算属性测试
    - **Property 10: Work Start Delay Calculation**
    - **Property 12: State Transition Work Start Recording**
    - **Validates: Requirements 14.1, 14.7, 14.8, 14.10**

  - [x] 7.5 实现娱乐时间线事件
    - 在娱乐模式启动/停止时创建 TimelineEvent
    - 记录访问的娱乐网站列表
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [x] 8. Checkpoint - 活动追踪完成
  - 确保所有测试通过，如有问题请询问用户

- [x] 9. Popup UI 娱乐模式控制
  - [x] 9.1 扩展 Popup UI 显示娱乐状态
    - 显示剩余配额时间
    - 显示冷却状态和剩余时间
    - 显示当前娱乐模式状态
    - _Requirements: 5.8, 6.2, 6.3, 6.10_

  - [x] 9.2 实现娱乐模式启动/停止按钮
    - 添加"开始娱乐模式"按钮
    - 添加"停止娱乐模式"按钮
    - 实现按钮禁用状态和提示信息
    - _Requirements: 6.1, 6.4, 6.7, 6.8, 6.9_

  - [x] 9.3 实现娱乐模式倒计时显示
    - 显示剩余娱乐时间倒计时
    - 实现 5 分钟和 1 分钟警告通知
    - _Requirements: 6.3, 6.5, 6.6_

- [x] 10. Web 设置页面娱乐网站管理
  - [x] 10.1 创建娱乐网站设置组件 (entertainment-sites-settings.tsx)
    - 显示黑名单和白名单两个子区域
    - 显示预设网站带"预设"标签
    - 实现添加/删除自定义条目
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [x] 10.2 实现设置同步和工作时间限制
    - 与服务器同步设置
    - 工作时间内禁用修改并显示提示
    - _Requirements: 7.9, 7.10, 7.11, 7.12_

  - [x] 10.3 编写设置修改限制属性测试
    - **Property 13: Entertainment Settings Modification Restriction**
    - **Validates: Requirements 5.12, 7.11, 7.12**

- [x] 11. Checkpoint - UI 组件完成
  - 确保所有测试通过，如有问题请询问用户

- [x] 12. 时间线和统计展示
  - [x] 12.1 扩展时间线页面显示娱乐时间
    - 添加紫色背景显示娱乐模式时段
    - 显示娱乐期间访问的网站
    - _Requirements: 11.4, 11.5, 12.3, 12.4_

  - [x] 12.2 扩展统计页面显示娱乐统计
    - 显示每日/每周娱乐时间总计
    - 显示配额使用情况
    - _Requirements: 12.5, 12.6_

  - [x] 12.3 实现工作启动时间展示
    - 在时间线上显示工作启动标记
    - 显示延迟时长（准时为绿色，延迟为黄/红色）
    - _Requirements: 14.3, 14.4_

  - [x] 12.4 扩展统计页面显示工作启动趋势
    - 显示平均工作启动延迟
    - 显示工作启动时间趋势图
    - _Requirements: 14.5, 14.6_

- [x] 13. 娱乐模式自动结束和标签关闭
  - [x] 13.1 实现配额耗尽自动结束
    - 监控配额使用
    - 配额耗尽时自动停止娱乐模式
    - _Requirements: 5.5, 5.6_

  - [x] 13.2 实现娱乐标签页关闭
    - 娱乐模式结束时关闭所有娱乐网站标签
    - _Requirements: 5.10_

  - [x] 13.3 编写娱乐标签关闭属性测试
    - **Property 15: Entertainment Tab Closure on Mode End**
    - **Validates: Requirements 5.10**

  - [x] 13.4 实现工作时间开始自动结束
    - 监控工作时间开始
    - 工作时间开始时自动停止娱乐模式
    - _Requirements: 5.3_

- [x] 14. 每日重置和配额同步
  - [x] 14.1 实现每日配额重置
    - 04:00 AM 重置娱乐配额
    - 清除冷却状态
    - _Requirements: 5.7_

  - [x] 14.2 编写每日配额重置属性测试
    - **Property 9: Daily Quota Reset**
    - **Validates: Requirements 5.7**

  - [x] 14.3 实现配额跨设备同步
    - 从服务器同步配额使用状态
    - 本地使用后同步到服务器
    - _Requirements: 5.11, 8.7_

- [x] 15. 默认连接和自动重连
  - [x] 15.1 实现默认自动连接
    - 安装后自动连接到 localhost:3000
    - 使用默认用户 dev@vibeflow.local
    - _Requirements: 4.1, 4.2, 4.7, 4.8_

  - [x] 15.2 实现连接状态持久化和自动重连
    - 存储连接状态
    - 浏览器重启后自动重连
    - 实现指数退避重试
    - _Requirements: 4.3, 4.4_

  - [x] 15.3 更新 Popup 显示连接状态
    - 显示连接状态指示器
    - 添加手动断开/重连按钮
    - _Requirements: 4.5, 4.6_

- [x] 16. Final Checkpoint - 全部功能完成
  - 确保所有测试通过
  - 验证所有需求已实现
  - 如有问题请询问用户

## Notes

- 标记为 `*` 的任务为可选的属性测试任务
- 每个 Checkpoint 用于验证阶段性成果
- 属性测试使用 fast-check 框架，每个测试至少运行 100 次
- 所有 Octopus 协议事件需与桌面端保持一致格式
