# Implementation Plan: E2E Testing Framework

## Overview

本实现计划将 VibeFlow E2E 测试框架分解为可执行的编码任务。采用 Playwright 作为核心框架，结合 Page Object 模式和数据工厂，建立自动化测试优先的验收流程。

## Tasks

- [x] 1. Playwright 框架配置
  - [x] 1.1 安装 Playwright 依赖
    - 安装 @playwright/test 和浏览器
    - 更新 package.json scripts (e2e, e2e:ui, e2e:report)
    - _Requirements: 1.1, 1.2_
  - [x] 1.2 创建 playwright.config.ts
    - 配置多浏览器支持 (Chromium, Firefox, WebKit)
    - 配置报告生成 (HTML, JSON)
    - 配置 webServer 自动启动
    - 配置 CI 重试机制 (retries: 2)
    - _Requirements: 1.3, 1.6, 12.5_
  - [x] 1.3 创建测试目录结构
    - 创建 e2e/fixtures, e2e/pages, e2e/tests, e2e/utils 目录
    - _Requirements: 3.1_

- [x] 2. Test Fixtures 实现
  - [x] 2.1 创建 Database Fixture
    - 创建 `e2e/fixtures/database.fixture.ts`
    - 实现数据库连接和清理逻辑
    - 使用 Prisma Client 进行数据操作
    - _Requirements: 2.1, 2.3_
  - [x] 2.2 编写 Test Data Isolation 属性测试
    - **Property 2: Test Data Isolation**
    - **Validates: Requirements 2.1, 2.3, 2.4**
  - [x] 2.3 创建 Auth Fixture
    - 创建 `e2e/fixtures/auth.fixture.ts`
    - 实现开发模式认证 (X-Dev-User-Email header)
    - 配置 extraHTTPHeaders 自动注入认证头
    - _Requirements: 1.4_
  - [ ]* 2.4 编写 Auth Fixture 属性测试
    - **Property 3: Auth Fixture Reusability**
    - **Validates: Requirements 1.4**
  - [x] 2.5 创建 Data Factories
    - 创建 `e2e/fixtures/factories/user.factory.ts`
    - 创建 `e2e/fixtures/factories/project.factory.ts`
    - 创建 `e2e/fixtures/factories/task.factory.ts`
    - 创建 `e2e/fixtures/factories/goal.factory.ts`
    - 每个 factory 实现 create() 和 cleanup() 方法
    - _Requirements: 2.2_
  - [ ]* 2.6 编写 Data Factory 属性测试
    - **Property 1: Data Factory Consistency**
    - **Validates: Requirements 1.5, 2.2**
  - [x] 2.7 创建主 Fixture 导出文件
    - 创建 `e2e/fixtures/index.ts`
    - 组合所有 fixtures 并导出扩展的 test 对象
    - _Requirements: 1.4, 1.5_

- [x] 3. Checkpoint - Fixtures 完成
  - 确保所有 fixtures 可用，运行基础测试验证
  - `e2e/tests/fixtures.spec.ts` 已实现并验证所有 fixtures

- [ ] 4. Page Objects 实现
  - [ ] 4.1 创建 Base Page Object
    - 创建 `e2e/pages/base.page.ts`
    - 实现通用方法: navigate, waitForLoad, getStateIndicator
    - _Requirements: 3.1, 3.2_
  - [ ] 4.2 创建 Airlock Page Object
    - 创建 `e2e/pages/airlock.page.ts`
    - 封装三步向导的所有元素和操作
    - 添加 data-testid 属性到 `src/app/airlock/*.tsx` 组件
    - _Requirements: 3.1, 4.1, 4.2, 4.3, 4.4_
  - [ ] 4.3 创建 Pomodoro Page Object
    - 创建 `e2e/pages/pomodoro.page.ts`
    - 封装计时器、任务选择器、模态框元素
    - 添加 data-testid 属性到 `src/components/pomodoro/*.tsx` 组件
    - _Requirements: 3.1, 5.2, 5.3_
  - [ ] 4.4 创建 Projects Page Object
    - 创建 `e2e/pages/projects.page.ts`
    - 封装项目列表、表单、归档操作
    - 添加 data-testid 属性到 `src/app/projects/*.tsx` 和 `src/components/projects/*.tsx`
    - _Requirements: 3.1, 6.2, 6.5_
  - [ ] 4.5 创建 Tasks Page Object
    - 创建 `e2e/pages/tasks.page.ts`
    - 封装任务树、拖拽、状态切换
    - 添加 data-testid 属性到 `src/app/tasks/*.tsx` 和 `src/components/tasks/*.tsx`
    - _Requirements: 3.1, 7.2, 7.3_
  - [ ] 4.6 创建 Goals Page Object
    - 创建 `e2e/pages/goals.page.ts`
    - 封装目标列表、表单、进度显示
    - 添加 data-testid 属性到 `src/app/goals/*.tsx` 和 `src/components/goals/*.tsx`
    - _Requirements: 3.1, 8.2, 8.3, 8.4_
  - [ ] 4.7 添加 State Indicator data-testid
    - 更新 `src/components/ui/state-indicator.tsx` 添加 data-testid="state-indicator"
    - _Requirements: 9.1_

- [ ] 5. Checkpoint - Page Objects 完成
  - 确保所有 Page Objects 可实例化

- [x] 6. 晨间气闸 E2E 测试
  - [x] 6.1 编写 Airlock 完整流程测试
    - 创建 `e2e/tests/airlock-flow.spec.ts`
    - 测试 Step 1 Review: 显示昨日任务、Defer、Delete
    - 测试 Step 2 Plan: 显示 Backlog、拖拽到 Today
    - 测试 Step 3 Commit: Top 3 选择、Start Day
    - 测试状态转换: LOCKED → PLANNING
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [ ]* 6.2 编写 Airlock 状态转换属性测试
    - **Property 4: Airlock State Transition**
    - **Validates: Requirements 4.5**

- [x] 7. 番茄钟 E2E 测试
  - [x] 7.1 编写 Pomodoro 基础流程测试
    - 创建 `e2e/tests/pomodoro-flow.spec.ts`
    - 测试任务选择、计时器启动、完成确认
    - 测试 PLANNING → FOCUS → REST → PLANNING 完整周期
    - 测试 Daily Cap 机制
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  - [ ]* 7.2 编写 Pomodoro Task Requirement 属性测试
    - **Property 5: Pomodoro Task Requirement**
    - **Validates: Requirements 5.1**
  - [ ]* 7.3 编写 Pomodoro Abort Recording 属性测试
    - **Property 6: Pomodoro Abort Recording**
    - **Validates: Requirements 5.4**
  - [ ]* 7.4 编写 REST State Blocking 属性测试
    - **Property 7: REST State Blocking**
    - **Validates: Requirements 5.5**

- [ ] 8. 项目管理 E2E 测试
  - [ ] 8.1 编写 Project CRUD 测试
    - 创建 `e2e/tests/projects.spec.ts`
    - 测试创建、编辑、列表显示
    - _Requirements: 6.2, 6.5_
  - [ ]* 8.2 编写 Project Validation 属性测试
    - **Property 8: Project Validation**
    - **Validates: Requirements 6.1**
  - [ ]* 8.3 编写 Project Edit Round-Trip 属性测试
    - **Property 9: Project Edit Round-Trip**
    - **Validates: Requirements 6.3**
  - [ ]* 8.4 编写 Archive Cascade 属性测试
    - **Property 10: Archive Cascade**
    - **Validates: Requirements 6.4**

- [ ] 9. 任务管理 E2E 测试
  - [ ] 9.1 编写 Task CRUD 测试
    - 创建 `e2e/tests/tasks.spec.ts`
    - 测试创建、层级显示、状态切换
    - _Requirements: 7.2, 7.3, 7.5_
  - [ ]* 9.2 编写 Task Project Binding 属性测试
    - **Property 11: Task Project Binding**
    - **Validates: Requirements 7.1**
  - [ ]* 9.3 编写 Task Reorder Round-Trip 属性测试
    - **Property 12: Task Reorder Round-Trip**
    - **Validates: Requirements 7.4**

- [ ] 10. 目标管理 E2E 测试
  - [ ] 10.1 编写 Goal CRUD 测试
    - 创建 `e2e/tests/goals.spec.ts`
    - 测试长期/短期目标创建、关联项目
    - _Requirements: 8.2, 8.3, 8.4_
  - [ ]* 10.2 编写 Goal Timeframe Validation 属性测试
    - **Property 13: Goal Timeframe Validation**
    - **Validates: Requirements 8.1**
  - [ ]* 10.3 编写 Goal Progress Calculation 属性测试
    - **Property 14: Goal Progress Calculation**
    - **Validates: Requirements 8.5**

- [ ] 11. 系统状态 E2E 测试
  - [ ] 11.1 编写 System State 测试
    - 创建 `e2e/tests/state.spec.ts`
    - 测试状态指示器显示、FOCUS 模式 UI
    - _Requirements: 9.1, 9.4_
  - [ ]* 11.2 编写 State Navigation Rules 属性测试
    - **Property 15: State Navigation Rules**
    - **Validates: Requirements 9.2, 9.3**

- [ ] 12. 封顶机制 E2E 测试
  - [ ] 12.1 编写 Daily Cap 测试
    - 创建 `e2e/tests/daily-cap.spec.ts`
    - 测试配置、进度显示、超限确认
    - _Requirements: 10.1, 10.3, 10.4_
  - [ ]* 12.2 编写 Daily Cap Enforcement 属性测试
    - **Property 16: Daily Cap Enforcement**
    - **Validates: Requirements 10.2**

- [ ] 13. Checkpoint - E2E 测试完成
  - 运行完整测试套件，确保所有测试通过

- [ ] 14. 测试报告与人工验收
  - [ ] 14.1 创建 Acceptance Checklist 生成器
    - 创建 `e2e/utils/acceptance-checklist.ts`
    - 实现按功能生成验收清单
    - _Requirements: 11.3, 11.4_
  - [ ] 14.2 创建测试报告增强脚本
    - 创建 `e2e/utils/report-enhancer.ts`
    - 在报告中添加人工验收清单
    - _Requirements: 11.1, 11.2_

- [ ] 15. CI/CD 集成
  - [ ] 15.1 创建 GitHub Actions 工作流
    - 创建 `.github/workflows/e2e.yml`
    - 配置 PostgreSQL 服务容器
    - 配置并行执行和 artifact 上传
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [ ] 16. Final Checkpoint - 框架完成
  - 确保所有测试通过，CI 配置正确
  - 生成人工验收清单供用户确认

## Notes

- 标记 `*` 的任务为可选属性测试任务
- 每个 E2E 测试文件应包含示例测试和属性测试
- 属性测试使用 Playwright 的 test.describe 组织
- 人工验收在所有自动化测试通过后进行
- 当前代码库没有 data-testid 属性，需要在 Page Object 实现时添加
- 使用 X-Dev-User-Email header 进行开发模式认证 (参考 src/middleware/dev-auth.middleware.ts)
- 已完成的测试文件:
  - `e2e/tests/fixtures.spec.ts` - Fixture 验证测试
  - `e2e/tests/airlock-flow.spec.ts` - 晨间气闸流程测试
  - `e2e/tests/pomodoro-flow.spec.ts` - 番茄钟流程测试
  - `e2e/tests/mcp-integration.spec.ts` - MCP 集成测试
