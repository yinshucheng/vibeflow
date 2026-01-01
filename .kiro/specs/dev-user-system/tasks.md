# Implementation Plan: Dev User System

## Overview

实现 VibeFlow 开发阶段用户系统，包括用户数据隔离、开发模式用户切换、前端用户身份显示、浏览器插件用户认证，并为后续 OAuth 集成做好准备。

## Tasks

- [ ] 1. 数据库模型更新
  - [ ] 1.1 更新 Prisma schema 添加 Account 表
    - 添加 Account 模型支持多认证提供者
    - User 模型添加 name、image 字段，password 改为可选
    - 添加 User 和 Account 的关联关系
    - _Requirements: 5.1, 5.3_
  - [ ] 1.2 运行数据库迁移
    - 生成并应用 Prisma 迁移
    - _Requirements: 5.1_

- [ ] 2. 用户服务层增强
  - [ ] 2.1 增强 user.service.ts 注册功能
    - 实现 register 方法，包含邮箱格式验证和密码长度验证
    - 实现密码哈希存储
    - 处理重复邮箱冲突
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [ ]* 2.2 编写注册验证属性测试
    - **Property 5: Registration Validation**
    - **Validates: Requirements 3.3, 3.4**
  - [ ]* 2.3 编写密码哈希属性测试
    - **Property 6: Password Hashing**
    - **Validates: Requirements 3.5**
  - [ ] 2.4 增强 getCurrentUser 方法
    - 支持从 NextAuth session 获取用户
    - 保持 dev mode header 支持
    - _Requirements: 6.1, 7.2, 7.3_
  - [ ]* 2.5 编写 Dev Mode 认证属性测试
    - **Property 4: Dev Mode Authentication**
    - **Validates: Requirements 2.1, 2.3, 7.2**

- [ ] 3. 数据隔离实现
  - [ ] 3.1 审查并增强 project.service.ts 数据隔离
    - 确保所有查询方法过滤 userId
    - 确保创建方法设置 userId
    - 确保访问他人资源返回 NOT_FOUND
    - _Requirements: 1.1, 1.5, 1.6_
  - [ ] 3.2 审查并增强 task.service.ts 数据隔离
    - 同上
    - _Requirements: 1.2, 1.5, 1.6_
  - [ ] 3.3 审查并增强 goal.service.ts 数据隔离
    - 同上
    - _Requirements: 1.3, 1.5, 1.6_
  - [ ] 3.4 审查并增强 pomodoro.service.ts 数据隔离
    - 同上
    - _Requirements: 1.4, 1.5, 1.6_
  - [ ]* 3.5 编写数据隔离属性测试
    - **Property 1: Data Isolation**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 6.2**
  - [ ]* 3.6 编写跨用户访问防护属性测试
    - **Property 2: Cross-User Access Prevention**
    - **Validates: Requirements 1.5, 6.4**
  - [ ]* 3.7 编写资源创建归属属性测试
    - **Property 3: Resource Creation Ownership**
    - **Validates: Requirements 1.6, 6.3**

- [ ] 4. Checkpoint - 确保所有测试通过
  - 运行所有属性测试和单元测试
  - 如有问题请询问用户

- [ ] 5. 前端用户上下文
  - [ ] 5.1 创建 UserContext Provider
    - 实现 UserContextProvider 组件
    - 提供 user、isDevMode、isLoading、switchUser、logout
    - 使用 tRPC 获取当前用户信息
    - _Requirements: 8.1, 8.3_
  - [ ] 5.2 创建 tRPC user router
    - 添加 getCurrentUser 查询
    - 添加 switchDevUser mutation (dev mode only)
    - _Requirements: 9.2_
  - [ ] 5.3 更新 Header 组件显示用户信息
    - 显示当前用户邮箱
    - 显示 dev mode 标识
    - 添加登出按钮
    - _Requirements: 8.1, 8.2, 8.4_
  - [ ] 5.4 创建 DevUserSelector 组件
    - 下拉选择器切换用户
    - 支持输入自定义邮箱
    - 显示最近使用的邮箱列表
    - _Requirements: 9.1, 9.3, 9.5_
  - [ ]* 5.5 编写用户上下文切换属性测试
    - **Property 8: User Context Switching**
    - **Validates: Requirements 9.2, 9.4**

- [ ] 6. 浏览器插件用户认证
  - [ ] 6.1 更新插件 popup 显示当前用户
    - 在 popup 中显示已连接用户的邮箱
    - 连接失败时显示错误状态
    - _Requirements: 10.3, 10.4_
  - [ ] 6.2 更新插件存储用户信息
    - 将用户邮箱存储到 chrome.storage.local
    - 连接时自动使用存储的邮箱
    - _Requirements: 10.5_
  - [ ] 6.3 更新 WebSocket 认证显示
    - 确保连接时发送用户身份
    - _Requirements: 10.1, 10.2_

- [ ] 7. WebSocket 用户隔离增强
  - [ ] 7.1 审查 socket.ts 用户隔离逻辑
    - 确保广播只发送给对应用户的连接
    - 确保无效身份被拒绝
    - _Requirements: 11.2, 11.3, 11.4_
  - [ ]* 7.2 编写 WebSocket 用户隔离属性测试
    - **Property 9: WebSocket User Isolation**
    - **Validates: Requirements 11.2, 11.3, 11.4**

- [ ] 8. 凭证认证完善
  - [ ] 8.1 审查 NextAuth 配置
    - 确保凭证认证正确工作
    - 确保 session 30 天过期
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [ ]* 8.2 编写凭证认证属性测试
    - **Property 7: Credential Authentication**
    - **Validates: Requirements 4.1, 4.2**

- [ ] 9. Final Checkpoint - 确保所有测试通过
  - 运行完整测试套件
  - 验证前端用户切换功能
  - 验证插件用户显示
  - 验证 MCP 认证功能
  - 如有问题请询问用户

- [ ] 10. MCP 认证增强和文档
  - [ ] 10.1 审查 MCP auth.ts 认证逻辑
    - 确保 dev mode 正确使用默认用户
    - 确保 dev_<email> token 格式正确处理
    - 添加认证模式日志
    - _Requirements: 12.1, 12.2, 12.3, 12.4_
  - [ ] 10.2 更新 MCP 文档
    - 更新 docs/mcp-integration.md 添加认证说明
    - 添加本地开发配置示例
    - 添加 Cursor、Claude Code、Kiro 配置示例
    - _Requirements: 13.1, 13.2, 13.4_
  - [ ]* 10.3 编写 MCP 认证属性测试
    - **Property 10: MCP Dev Mode Authentication**
    - **Validates: Requirements 12.1, 12.2, 12.4, 12.5**

## Notes

- 标记 `*` 的任务为可选测试任务，可跳过以加快 MVP 开发
- 每个任务引用具体需求以便追溯
- 属性测试验证通用正确性属性
- 单元测试验证具体示例和边界情况
